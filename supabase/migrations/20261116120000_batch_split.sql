-- Batch split: part of a tank becomes another batch (docs/plans/batch-split.md).
-- record_cellar_transfer (latest definition: 20260925152847_transfer_loss_adjustments.sql)
-- gains p_to_batch, a planned and unbrewed batch. When it is given, the
-- destination vessel must be empty, the occupancy the transfer opens belongs to
-- that batch instead of the source's, and the batch's brewed_on becomes the
-- transfer's date in the brewery's time zone. The transfers row is the link
-- between the two batches: private.batch_volume_balance and the lot trace
-- already follow it. Without p_to_batch nothing changes, and the request
-- identity is the same as before, so earlier requests still replay.

drop function public.record_cellar_transfer(uuid, uuid, uuid, numeric, numeric, uuid);

create function public.record_cellar_transfer(
  p_brewery uuid, p_from_occupancy uuid, p_to_vessel uuid, p_volume_bbl numeric, p_loss_bbl numeric, p_request_id uuid,
  p_to_batch uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_vessel public.vessels;
  v_from public.vessel_occupancies; v_to public.vessel_occupancies; v_row public.transfers;
  v_batch public.batches; v_tz text;
  v_available numeric; v_now timestamptz := now();
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  -- strip_nulls: a request without p_to_batch keeps the identity it had before this parameter existed.
  v_replay := private.claim_command_request(p_brewery, 'record_cellar_transfer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'from_occupancy', p_from_occupancy, 'to_vessel', p_to_vessel,
      'volume_bbl', p_volume_bbl, 'loss_bbl', p_loss_bbl)
      || jsonb_strip_nulls(jsonb_build_object('to_batch', p_to_batch)));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_vessel from public.vessels where id = p_to_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_from from public.vessel_occupancies
    where id = p_from_occupancy and brewery_id = p_brewery for update;
  if v_from.id is null then raise exception 'occupancy not found'; end if;
  if v_from.ended_at is not null then raise exception 'occupancy is closed'; end if;
  if v_from.vessel_id = p_to_vessel then raise exception 'a vessel cannot be transferred into itself'; end if;

  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if p_volume_bbl + coalesce(p_loss_bbl, 0) > v_available + c_epsilon then
    raise exception 'only % bbl in that vessel; asked for %', v_available, p_volume_bbl + coalesce(p_loss_bbl, 0);
  end if;

  select * into v_to from public.vessel_occupancies
    where vessel_id = p_to_vessel and brewery_id = p_brewery and ended_at is null for update;

  if p_to_batch is not null then
    if v_to.id is not null then raise exception 'a planned batch can only start in an empty vessel'; end if;
    select * into v_batch from public.batches where id = p_to_batch and brewery_id = p_brewery for update;
    if v_batch.id is null then raise exception 'batch not found'; end if;
    if v_batch.id = v_from.batch_id or v_batch.brewed_on is not null
      or v_batch.closed_at is not null or v_batch.cancelled_at is not null then
      raise exception 'only an unstarted planned batch can start from a transfer';
    end if;
  end if;

  -- #488: what the target already holds (nothing when empty) plus this volume
  -- must fit it. Checked before an empty target's occupancy is opened.
  perform private.assert_vessel_fits(v_vessel, p_volume_bbl + coalesce(
    (select bbl from public.occupancy_volumes where occupancy_id = v_to.id), 0));
  if v_to.id is null then
    insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
    values (p_brewery, p_to_vessel, coalesce(p_to_batch, v_from.batch_id), v_now, 0) returning * into v_to;
  end if;
  if p_to_batch is not null then
    -- The planned batch starts here: it has no brew record, its volume is this transfer in.
    select timezone into v_tz from public.breweries where id = p_brewery;
    update public.batches set brewed_on = (v_now at time zone v_tz)::date where id = p_to_batch;
  end if;

  insert into public.transfers (brewery_id, from_occupancy_id, to_occupancy_id, bbl, at, created_by)
  values (p_brewery, v_from.id, v_to.id, p_volume_bbl, v_now, v_actor) returning * into v_row;
  -- The loss is a generic cellar loss on the source, the one ledger the report
  -- and batch completion read, and reattributable from the loss review (#485).
  -- round(3): the precision transfers.loss_bbl stored.
  if round(coalesce(p_loss_bbl, 0), 3) > 0 then
    insert into public.volume_adjustments (brewery_id, occupancy_id, bbl, reason, removal_class, at, note, created_by)
    values (p_brewery, v_from.id, -round(p_loss_bbl, 3), 'loss', 'loss', v_now, 'cellar transfer loss', v_actor);
  end if;

  -- Re-read the view: it now includes the row just written.
  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if v_available <= c_epsilon then
    -- #466: ending the occupancy under a started, unclosed packaging run
    -- strands it -- close_packaging_run refuses an emptied tank and a started
    -- run cannot be cancelled. Refuse the emptying transfer instead (the raise
    -- rolls back the transfer row written above); a partial transfer is fine.
    if exists (
      select 1 from public.packaging_runs r
      where r.brewery_id = p_brewery and r.occupancy_id = v_from.id
        and r.started_at is not null and r.closed_at is null
    ) then
      raise exception 'a started packaging run still draws from this tank; close the run before transferring the heel out';
    end if;
    -- greatest(): a brew day may be dated ahead of today, so the occupancy can
    -- start in the future. tstzrange would reject an ended_at below its start;
    -- an empty range there simply frees the vessel.
    update public.vessel_occupancies set ended_at = greatest(v_from.started_at, v_now)
    where id = v_from.id returning * into v_from;
  end if;

  return private.complete_command_request(p_request_id, jsonb_build_object(
    'transfer', to_jsonb(v_row), 'from_occupancy', to_jsonb(v_from), 'to_occupancy', to_jsonb(v_to)));
end $$;

revoke all on function public.record_cellar_transfer(uuid, uuid, uuid, numeric, numeric, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_cellar_transfer(uuid, uuid, uuid, numeric, numeric, uuid, uuid) to authenticated;

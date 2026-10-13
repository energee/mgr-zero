-- Require a volume-bearing acknowledgement before completing a batch with beer in open tanks.
create or replace function private.batch_completion_calculation(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batch public.batches; v_balance jsonb; v_baseline numeric; v_residual numeric;
  v_in_tank jsonb; v_in_tank_bbl numeric; v_threshold numeric;
begin
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.brewed_on is null then raise exception 'batch has not been brewed'; end if;
  if v_batch.closed_at is not null then raise exception 'batch is already completed'; end if;

  if not exists (select 1 from public.vessel_occupancies o where o.brewery_id = p_brewery and o.batch_id = p_batch)
    then raise exception 'batch has no authoritative occupancy'; end if;
  if exists (
    select 1 from public.packaging_runs r join public.vessel_occupancies o on o.id = r.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and r.closed_at is null and r.cancelled_at is null
  ) then raise exception 'a packaging run is still open for this batch'; end if;

  v_balance := private.batch_volume_balance(p_brewery, p_batch);
  v_baseline := (v_balance->>'baselineBbl')::numeric;
  v_residual := (v_balance->>'residualBbl')::numeric;
  if v_baseline < 0 then raise exception 'batch completion baseline must not be negative'; end if;
  if v_residual < 0 then raise exception 'batch has a negative completion residual; packaged and attributed volume exceed its baseline'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'occupancyId', ov.occupancy_id, 'vesselId', ov.vessel_id,
    'vesselName', v.name, 'bbl', ov.bbl) order by v.name, ov.occupancy_id), '[]'::jsonb),
    coalesce(sum(ov.bbl), 0)
  into v_in_tank, v_in_tank_bbl
  from public.occupancy_volumes ov join public.vessels v on v.id = ov.vessel_id
  where ov.brewery_id = p_brewery and ov.batch_id = p_batch
    and ov.ended_at is null and ov.bbl > 0;
  v_threshold := greatest(0.05::numeric, v_baseline * 0.005::numeric);
  -- The one place the acknowledgement rule lives; the form reads the flag.
  return v_balance || jsonb_build_object(
    'batchId', p_batch, 'closedAt', null, 'inTank', v_in_tank, 'inTankBbl', v_in_tank_bbl,
    'inTankRequiresConfirmation', v_in_tank_bbl >= v_threshold,
    'thresholdBbl', v_threshold, 'adjustmentId', null);
end $$;

drop function public.complete_batch(uuid, uuid, uuid);

-- p_confirm_in_tank_bbl is the exact in-tank total the caller reviewed and acknowledged.
-- Completion refuses unless it equals the total recalculated under the lock, so an
-- acknowledgement of one volume can never write off a different one.
create function public.complete_batch(p_brewery uuid, p_batch uuid, p_request_id uuid, p_confirm_in_tank_bbl numeric default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_result jsonb; v_batch public.batches;
  v_close timestamptz; v_anchor uuid; v_adjustment uuid; v_residual numeric; v_threshold numeric;
  v_payload jsonb; v_tanks text; v_in_tank_bbl numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  -- Retain the pre-upgrade hash for ordinary and recovered unconfirmed requests.
  v_payload := jsonb_build_object('brewery', p_brewery, 'batch', p_batch);
  if p_confirm_in_tank_bbl is not null then
    v_payload := v_payload || jsonb_build_object('confirm_in_tank_bbl', p_confirm_in_tank_bbl);
  end if;
  v_replay := private.claim_command_request(p_brewery, 'complete_batch', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);
  lock table public.inventory_movements in share row exclusive mode;
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  perform o.id from public.vessel_occupancies o
    where o.brewery_id = p_brewery and o.batch_id = p_batch order by o.id for update;
  v_result := private.batch_completion_calculation(p_brewery, p_batch);
  v_residual := (v_result->>'residualBbl')::numeric;
  v_threshold := (v_result->>'thresholdBbl')::numeric;
  v_in_tank_bbl := (v_result->>'inTankBbl')::numeric;
  if (v_result->>'inTankRequiresConfirmation')::boolean
    and p_confirm_in_tank_bbl is distinct from v_in_tank_bbl then
    select string_agg(trim_scale((tank->>'bbl')::numeric)::text || ' bbl in ' || (tank->>'vesselName'), ', ' order by tank->>'vesselName')
    into v_tanks from jsonb_array_elements(v_result->'inTank') tank;
    if p_confirm_in_tank_bbl is null then
      raise exception 'Completing writes off % bbl still in tanks (%). Confirm this loss explicitly.',
        trim_scale(v_in_tank_bbl), v_tanks;
    end if;
    raise exception 'Tanks now hold % bbl (%), not the % bbl acknowledged. Review the batch and confirm again.',
      trim_scale(v_in_tank_bbl), v_tanks, trim_scale(p_confirm_in_tank_bbl);
  end if;

  select o.id into v_anchor from public.vessel_occupancies o
    where o.brewery_id = p_brewery and o.batch_id = p_batch
    order by (o.ended_at is null) desc, o.started_at desc, o.id desc limit 1;
  select greatest(now(), max(o.started_at)) into v_close from public.vessel_occupancies o
    where o.brewery_id = p_brewery and o.batch_id = p_batch;

  if v_residual >= v_threshold then
    insert into public.volume_adjustments
      (brewery_id, occupancy_id, bbl, reason, removal_class, affects_occupancy, at, created_by)
    values (p_brewery, v_anchor, -v_residual, 'loss', 'loss', false, v_close, v_actor)
    returning id into v_adjustment;
  end if;
  update public.vessel_occupancies set ended_at = v_close
    where brewery_id = p_brewery and batch_id = p_batch and ended_at is null;
  update public.batches set closed_at = v_close, completion_adjustment_id = v_adjustment
    where id = p_batch;

  v_result := v_result || jsonb_build_object('closedAt', v_close, 'adjustmentId', v_adjustment);
  return private.complete_command_request(p_request_id, v_result);
end $$;

revoke all on function public.complete_batch(uuid, uuid, uuid, numeric) from public, anon, authenticated, service_role;
grant execute on function public.complete_batch(uuid, uuid, uuid, numeric) to authenticated;

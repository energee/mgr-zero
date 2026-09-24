-- #488: a vessel never holds more than vessels.capacity_bbl. Brew day accepted
-- 25 bbl into a 20 bbl fermenter and Cellar showed "25 / 20 bbl". One private
-- check owns the rule; record_brew_day and record_cellar_transfer (record_brew_day from 20260923230000_same_day_brew_occupancy.sql,
-- record_cellar_transfer from 00001_baseline.sql: their latest definitions) both call it after locking the
-- vessel row, so a concurrent capacity edit cannot slip between check and write.

-- p_total_bbl is what the vessel would hold after the write. capacity_bbl is
-- not null (check > 0), so there is no "unset" case to skip.
create function private.assert_vessel_fits(p_vessel public.vessels, p_total_bbl numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_total_bbl > p_vessel.capacity_bbl then
    raise exception '% holds % bbl; % bbl will not fit', p_vessel.name,
      pg_catalog.trim_scale(p_vessel.capacity_bbl), pg_catalog.trim_scale(p_total_bbl);
  end if;
end $$;
revoke all on function private.assert_vessel_fits(public.vessels, numeric) from public, anon, authenticated, service_role;


-- One call stamps the brew day and opens the occupancy, so a brewed batch is
-- never sitting in nowhere. started_at is midnight of brewed_on: the cellar
-- thinks in days, and the gist exclusion on (vessel_id, tstzrange) then reads
-- as "this vessel was this batch's from that day on". The vessel row is locked
-- first so two concurrent brews queue rather than race the constraint, and the
-- overlap check — the same range predicate the constraint uses — can report
-- `occupied` instead of a constraint name.
create or replace function public.record_brew_day(
  p_brewery uuid, p_batch uuid, p_vessel uuid, p_initial_bbl numeric, p_brewed_on date, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_batch public.batches; v_vessel public.vessels; v_occ public.vessel_occupancies;
  v_start timestamptz; v_tz text;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_brew_day', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'vessel', p_vessel,
      'initial_bbl', p_initial_bbl, 'brewed_on', p_brewed_on));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_vessel from public.vessels where id = p_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.brewed_on is not null then raise exception 'batch % was already brewed on %', v_batch.batch_no, v_batch.brewed_on; end if;

  -- Local midnight of brewed_on, pushed past any occupancy of this vessel that
  -- closed during that same local day (emptied this morning, brewed into this
  -- afternoon).
  select timezone into v_tz from public.breweries where id = p_brewery;
  select greatest(p_brewed_on::timestamp at time zone v_tz, max(o.ended_at)) into v_start
  from public.vessel_occupancies o
  where o.vessel_id = p_vessel
    and o.ended_at >= p_brewed_on::timestamp at time zone v_tz
    and o.ended_at < (p_brewed_on + 1)::timestamp at time zone v_tz;

  -- Exactly the predicate the gist exclusion enforces, so a backdated brew day
  -- that lands inside a *closed* occupancy still gets this readable error
  -- rather than the raw constraint name. `ended_at is null` alone would miss it.
  if exists (
    select 1 from public.vessel_occupancies o
    where o.vessel_id = p_vessel
      and tstzrange(o.started_at, o.ended_at) && tstzrange(v_start, null)
  ) then raise exception 'vessel % is occupied on %; empty it first', v_vessel.name, p_brewed_on; end if;

  update public.batches set brewed_on = p_brewed_on where id = p_batch returning * into v_batch;
  -- #488: the vessel is empty (checked above), so the knockout is its whole content.
  perform private.assert_vessel_fits(v_vessel, p_initial_bbl);
  insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
  values (p_brewery, p_vessel, p_batch, v_start, p_initial_bbl) returning * into v_occ;
  return private.complete_command_request(p_request_id,
    jsonb_build_object('batch', to_jsonb(v_batch), 'occupancy', to_jsonb(v_occ)));
end $$;

-- Moving beer is a ledger entry, never a column edit: occupancy_volumes derives
-- what is in a vessel from initial_bbl, transfers in, transfers out (volume plus
-- its loss) and packaging draws. So this writes exactly one transfers row and
-- lets the view speak. The target vessel is locked before the source occupancy
-- — the same vessel-first order record_brew_day uses — so two brewers racing
-- into one brite queue behind the same lock instead of taking it in opposite
-- orders. That order does not make deadlock impossible: a mutual swap
-- (A -> B while B -> A) still takes the two locks in opposite orders and
-- Postgres aborts one side, which the caller retries.
-- An empty target gets a fresh occupancy at initial_bbl 0 carrying the
-- source's batch; an occupied one is blended into and keeps its own batch identity (a "new batch from two parents"
-- is deliberately not modelled). Every timestamp is now(), so a same-day
-- transfer never collides with a brew day's midnight range start.
create or replace function public.record_cellar_transfer(
  p_brewery uuid, p_from_occupancy uuid, p_to_vessel uuid, p_volume_bbl numeric, p_loss_bbl numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_vessel public.vessels;
  v_from public.vessel_occupancies; v_to public.vessel_occupancies; v_row public.transfers;
  v_available numeric; v_now timestamptz := now();
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_cellar_transfer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'from_occupancy', p_from_occupancy, 'to_vessel', p_to_vessel,
      'volume_bbl', p_volume_bbl, 'loss_bbl', p_loss_bbl));
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
  -- #488: what the target already holds (nothing when empty) plus this volume
  -- must fit it. Checked before an empty target's occupancy is opened.
  perform private.assert_vessel_fits(v_vessel, p_volume_bbl + coalesce(
    (select bbl from public.occupancy_volumes where occupancy_id = v_to.id), 0));
  if v_to.id is null then
    insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
    values (p_brewery, p_to_vessel, v_from.batch_id, v_now, 0) returning * into v_to;
  end if;

  insert into public.transfers (brewery_id, from_occupancy_id, to_occupancy_id, bbl, loss_bbl, at, created_by)
  values (p_brewery, v_from.id, v_to.id, p_volume_bbl, coalesce(p_loss_bbl, 0), v_now, v_actor) returning * into v_row;

  -- Re-read the view: it now includes the row just written.
  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if v_available <= c_epsilon then
    -- greatest(): a brew day may be dated ahead of today, so the occupancy can
    -- start in the future. tstzrange would reject an ended_at below its start;
    -- an empty range there simply frees the vessel.
    update public.vessel_occupancies set ended_at = greatest(v_from.started_at, v_now)
    where id = v_from.id returning * into v_from;
  end if;

  return private.complete_command_request(p_request_id, jsonb_build_object(
    'transfer', to_jsonb(v_row), 'from_occupancy', to_jsonb(v_from), 'to_occupancy', to_jsonb(v_to)));
end $$;

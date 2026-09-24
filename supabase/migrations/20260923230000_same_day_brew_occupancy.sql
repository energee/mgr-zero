-- #434: a vessel emptied earlier today could not be brewed into with today's
-- date. record_brew_day opened the occupancy at midnight of brewed_on, while
-- transfers and completion close occupancies at now(), so the new range
-- [today 00:00, ∞) overlapped the one just closed at, say, 10:00.
--
-- The occupancy now starts at the later of midnight of brewed_on and the last
-- close of that vessel *within that same day*. A close on a later day is still
-- a real conflict (a backdated brew into a stretch the vessel was full) and
-- still reports `occupied`. brewed_on itself is unchanged: the cellar thinks in
-- days, only the range start moves past the same-day emptying. "That day" is
-- the brewery's local day (breweries.timezone), not the UTC day, so a tank
-- emptied at 22:00 in New York still counts as the same day.
-- create or replace keeps the baseline's grants.
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
  insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
  values (p_brewery, p_vessel, p_batch, v_start, p_initial_bbl) returning * into v_occ;
  return private.complete_command_request(p_request_id,
    jsonb_build_object('batch', to_jsonb(v_batch), 'occupancy', to_jsonb(v_occ)));
end $$;

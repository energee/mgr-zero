-- History without tanks (docs/plans/readings-on-batch.md): a fermentation
-- reading and a brew record belong to a batch; the tank stay is optional and,
-- when given, must hold that batch. record_historical_batch writes a past batch
-- (imported history) with no tank and no loss, only before books_opened_on.

-- The composite key a child row points at to prove "this tank holds this batch".
alter table public.vessel_occupancies
  add constraint vessel_occupancies_id_batch_brewery_key unique (id, batch_id, brewery_id);

alter table public.fermentation_readings add column batch_id uuid;
update public.fermentation_readings fr set batch_id = vo.batch_id
  from public.vessel_occupancies vo where vo.id = fr.occupancy_id;
-- MATCH SIMPLE: a null occupancy skips the composite check; a set one must hold
-- this batch. The old (occupancy, brewery) FK goes: the composite covers it, and
-- two FKs to vessel_occupancies would make the PostgREST embed ambiguous.
alter table public.fermentation_readings
  alter column batch_id set not null,
  alter column occupancy_id drop not null,
  drop constraint fermentation_readings_occupancy_id_brewery_id_fkey,
  add foreign key (batch_id, brewery_id) references public.batches (id, brewery_id),
  add foreign key (occupancy_id, batch_id, brewery_id) references public.vessel_occupancies (id, batch_id, brewery_id);
create index readings_batch_idx on public.fermentation_readings (batch_id, at);

alter table public.brew_records
  alter column occupancy_id drop not null,
  drop constraint brew_records_occupancy_id_brewery_id_fkey,
  add foreign key (occupancy_id, batch_id, brewery_id) references public.vessel_occupancies (id, batch_id, brewery_id);

-- A reading names a tank, a batch, or both. With a tank it must be open and hold
-- the batch (the batch is derived when omitted). Without one the batch must be
-- brewed and open -- or historical: closed with no tank stay at all, which only
-- record_historical_batch produces. A live closed batch takes no more readings.
drop function public.record_fermentation_reading(uuid, uuid, timestamptz, numeric, numeric, numeric, text, uuid);
create function public.record_fermentation_reading(
  p_brewery uuid, p_batch uuid, p_occupancy uuid, p_at timestamptz, p_temp_f numeric,
  p_gravity_plato numeric, p_ph numeric, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_row public.fermentation_readings; v_batch public.batches; v_held uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_fermentation_reading', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'occupancy', p_occupancy, 'at', p_at, 'temp_f', p_temp_f,
      'gravity_plato', p_gravity_plato, 'ph', p_ph, 'note', p_note));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);
  if p_occupancy is not null then
    perform private.assert_open_occupancy(p_brewery, p_occupancy);
    select batch_id into v_held from public.vessel_occupancies where id = p_occupancy;
    if p_batch is not null and p_batch <> v_held then raise exception 'occupancy does not hold this batch'; end if;
  else
    if p_batch is null then raise exception 'a reading needs a batch or an occupancy'; end if;
    select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery;
    if v_batch.id is null then raise exception 'batch not found'; end if;
    if v_batch.cancelled_at is not null then raise exception 'batch is cancelled'; end if;
    if v_batch.brewed_on is null then raise exception 'batch has not been brewed'; end if;
    if v_batch.closed_at is not null and exists (select 1 from public.vessel_occupancies where batch_id = p_batch)
      then raise exception 'batch is closed'; end if;
    v_held := p_batch;
  end if;

  insert into public.fermentation_readings (brewery_id, batch_id, occupancy_id, at, temp_f, gravity_plato, ph, note, created_by)
  values (p_brewery, v_held, p_occupancy, coalesce(p_at, now()), p_temp_f, p_gravity_plato, p_ph, p_note, v_actor)
  returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.record_fermentation_reading(uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_fermentation_reading(uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, uuid) to authenticated;

-- Imported history: brew and close a planned batch on past dates with no tank
-- and no completion loss. Only before books_opened_on, so reports (which start
-- there) never see it and live brewing can never take this path.
create function public.record_historical_batch(
  p_brewery uuid, p_batch uuid, p_brewed_on date, p_closed_on date, p_knockout_bbl numeric, p_process jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_batch public.batches; v_record public.brew_records; v_opened date; v_tz text;
begin
  v_actor := private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_historical_batch', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'brewed_on', p_brewed_on, 'closed_on', p_closed_on,
      'knockout_bbl', p_knockout_bbl, 'process', p_process));
  if v_replay is not null then return v_replay; end if;

  perform private.assert_brew_process(p_process);
  if p_knockout_bbl is null or p_knockout_bbl <= 0 or p_knockout_bbl <> round(p_knockout_bbl, 3) or p_knockout_bbl::text in ('NaN','Infinity','-Infinity')
    then raise exception 'knockout barrels must be positive with at most three decimals'; end if;
  if p_brewed_on is null or p_closed_on is null then raise exception 'brewed and closed dates are required'; end if;
  if p_brewed_on > p_closed_on then raise exception 'batch cannot be brewed after it closed'; end if;
  select books_opened_on, timezone into v_opened, v_tz from public.breweries where id = p_brewery;
  if v_opened is null then raise exception 'set the books opened date before recording history'; end if;
  if p_closed_on >= v_opened then raise exception 'historical batches must close before the books opened (%)', v_opened; end if;
  if exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null
      and period_start <= p_closed_on and period_end >= p_brewed_on)
    then raise exception 'a filed report already covers these dates'; end if;

  perform private.lock_cellar_workflow(p_brewery);
  -- Lock before checking, so a concurrent brew day cannot slip in between.
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.cancelled_at is not null then raise exception 'batch is cancelled'; end if;
  if v_batch.brewed_on is not null or v_batch.closed_at is not null
     or exists (select 1 from public.vessel_occupancies where batch_id = p_batch)
     or exists (select 1 from public.brew_records where batch_id = p_batch)
    then raise exception 'batch is already brewed'; end if;

  insert into public.brew_records (brewery_id, batch_id, occupancy_id, recipe_version_id, brewed_on, initial_bbl, plan_snapshot, process, turn, created_by)
  values (p_brewery, p_batch, null, v_batch.recipe_version_id, p_brewed_on, p_knockout_bbl, private.brew_plan_snapshot(p_batch), coalesce(p_process, '{}'), 1, v_actor)
  returning * into v_record;
  -- No completion_adjustment_id: the deferred completion graph checks only a set one.
  update public.batches set brewed_on = p_brewed_on, closed_at = p_closed_on::timestamp at time zone v_tz
    where id = p_batch returning * into v_batch;
  return private.complete_command_request(p_request_id, jsonb_build_object('batch', to_jsonb(v_batch), 'record', to_jsonb(v_record)));
end $$;
revoke all on function public.record_historical_batch(uuid, uuid, date, date, numeric, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_historical_batch(uuid, uuid, date, date, numeric, jsonb, uuid) to authenticated;

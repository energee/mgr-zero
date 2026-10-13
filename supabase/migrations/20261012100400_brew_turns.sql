-- #807: additional same-batch brew turns reuse the open tank and retain revision identity.
alter table public.brew_records add column turn integer not null default 1 check (turn > 0);
drop index public.brew_records_original;
create unique index brew_records_original on public.brew_records(batch_id,turn) where corrects_id is null;

create or replace function public.record_brew_day(
  p_brewery uuid, p_batch uuid, p_vessel uuid, p_initial_bbl numeric, p_brewed_on date, p_request_id uuid, p_actuals jsonb default null, p_process jsonb default '{}', p_confirm_empty boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_batch public.batches; v_vessel public.vessels; v_occ public.vessel_occupancies;
  v_start timestamptz; v_tz text; v_payload jsonb; v_record public.brew_records;
  v_turn integer := 1; v_current_bbl numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery',p_brewery,'batch',p_batch,'vessel',p_vessel,'initial_bbl',p_initial_bbl,'brewed_on',p_brewed_on);
  -- Completed pre-upgrade calls keep their original request hash.
  if p_actuals is not null or p_process<>'{}'::jsonb or p_confirm_empty then
    v_payload := v_payload || jsonb_build_object('actuals',p_actuals,'process',p_process,'confirm_empty',p_confirm_empty);
  end if;
  v_replay := private.claim_command_request(p_brewery,'record_brew_day',p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;

  perform private.assert_brew_process(p_process);
  if p_initial_bbl is null or p_initial_bbl<=0 or p_initial_bbl<>round(p_initial_bbl,3) or p_initial_bbl::text in ('NaN','Infinity','-Infinity') then raise exception 'knockout barrels must be positive with at most three decimals'; end if;
  perform private.lock_cellar_workflow(p_brewery);

  select * into v_vessel from public.vessels where id = p_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.cancelled_at is not null then raise exception 'batch is cancelled'; end if;
  if v_batch.closed_at is not null then raise exception 'batch is closed'; end if;
  if v_batch.brewed_on is not null then
    if p_brewed_on < v_batch.brewed_on then raise exception 'brew turn cannot precede the first brew day'; end if;
    select * into v_occ from public.vessel_occupancies
      where brewery_id=p_brewery and batch_id=p_batch and vessel_id=p_vessel and ended_at is null for update;
    if v_occ.id is null then raise exception 'brew turn must use the batch existing open tank'; end if;
    if exists(select 1 from public.transfers where from_occupancy_id=v_occ.id or to_occupancy_id=v_occ.id) then raise exception 'a cellar transfer already depends on this batch'; end if;
    if exists(select 1 from public.packaging_runs where occupancy_id=v_occ.id and (started_at is not null or closed_at is not null)) then raise exception 'started packaging already depends on this batch'; end if;
    if exists(select 1 from public.report_filings where brewery_id=p_brewery and filed_at is not null and period_start<=p_brewed_on and period_end>=p_brewed_on) then raise exception 'a filed report already depends on this brew turn date'; end if;
    select bbl into v_current_bbl from public.occupancy_volumes where occupancy_id=v_occ.id;
    perform private.assert_vessel_fits(v_vessel,v_current_bbl+p_initial_bbl);
    update public.vessel_occupancies set initial_bbl=initial_bbl+p_initial_bbl where id=v_occ.id returning * into v_occ;
    select coalesce(max(turn),0)+1 into v_turn from public.brew_records where batch_id=p_batch;
  else
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
  end if;
  insert into public.brew_records(brewery_id,batch_id,occupancy_id,recipe_version_id,brewed_on,initial_bbl,plan_snapshot,process,turn,created_by)
    values(p_brewery,p_batch,v_occ.id,v_batch.recipe_version_id,p_brewed_on,p_initial_bbl,private.brew_plan_snapshot(p_batch),p_process,v_turn,auth.uid()) returning * into v_record;
  perform private.append_brew_actuals(v_record.id,p_actuals,p_confirm_empty);
  return private.complete_command_request(p_request_id,
    jsonb_build_object('batch',to_jsonb(v_batch),'occupancy',to_jsonb(v_occ),'record',to_jsonb(v_record)));
end $$;

revoke all on function public.record_brew_day(uuid,uuid,uuid,numeric,date,uuid,jsonb,jsonb,boolean) from public,anon,service_role;
grant execute on function public.record_brew_day(uuid,uuid,uuid,numeric,date,uuid,jsonb,jsonb,boolean) to authenticated;

-- #622: replace unused brew facts with linked, append-only revisions.
create or replace function public.correct_brew_record(
  p_brewery uuid,p_record uuid,p_reason text,p_initial_bbl numeric,p_actuals jsonb,
  p_process jsonb,p_confirm_empty boolean,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare old_record public.brew_records; new_record public.brew_records; vessel public.vessels;
  batch public.batches; occupancy public.vessel_occupancies; replay jsonb; adjustment uuid;
  delta numeric; current_bbl numeric;
begin
  perform private.assert_staff(p_brewery,array['admin','brewer']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery,'correct_brew_record',p_request_id,
    jsonb_build_object('record',p_record,'reason',p_reason,'initial_bbl',p_initial_bbl,'actuals',p_actuals,'process',p_process,'confirm_empty',p_confirm_empty));
  if replay is not null then return replay; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'correction reason required'; end if;
  if p_initial_bbl is null or p_initial_bbl<=0 or p_initial_bbl<>round(p_initial_bbl,3) or p_initial_bbl::text in ('NaN','Infinity','-Infinity') then raise exception 'knockout barrels must be positive with at most three decimals'; end if;
  perform private.assert_brew_process(p_process);
  perform private.lock_cellar_workflow(p_brewery);
  select * into old_record from public.brew_records where id=p_record and brewery_id=p_brewery;
  if old_record.id is null then raise exception 'brew record not found'; end if;
  select v.* into vessel from public.vessels v join public.vessel_occupancies o on o.vessel_id=v.id where o.id=old_record.occupancy_id for update of v;
  select * into batch from public.batches where id=old_record.batch_id for update;
  select * into occupancy from public.vessel_occupancies where id=old_record.occupancy_id for update;
  if exists(select 1 from public.brew_records where corrects_id=p_record) then raise exception 'brew record already corrected; reload the current revision'; end if;
  if batch.closed_at is not null or batch.cancelled_at is not null or occupancy.ended_at is not null then raise exception 'closed batch or occupancy cannot be corrected'; end if;
  if exists(select 1 from public.transfers where from_occupancy_id=occupancy.id or to_occupancy_id=occupancy.id) then raise exception 'a cellar transfer already depends on this brew record'; end if;
  if exists(select 1 from public.batch_additions where batch_id=batch.id and brew_record_id is null) then raise exception 'a later addition already depends on this brew record'; end if;
  if exists(select 1 from public.packaging_runs where occupancy_id=occupancy.id and (started_at is not null or closed_at is not null)) then raise exception 'started packaging already depends on this brew record'; end if;
  if exists(select 1 from public.report_filings where brewery_id=p_brewery and filed_at is not null and period_end>=old_record.brewed_on) then raise exception 'a filed report already depends on this brew record'; end if;
  delta := p_initial_bbl-old_record.initial_bbl;
  select bbl into current_bbl from public.occupancy_volumes where occupancy_id=occupancy.id;
  if current_bbl+delta<=0 then raise exception 'corrected occupancy must retain positive volume'; end if;
  perform private.assert_vessel_fits(vessel,current_bbl+delta);
  -- Both old and replacement identities precede the material ledger lock.
  perform 1 from public.materials where id in (
    select m.material_id from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=p_record
    union select (e->>'material_id')::uuid from jsonb_array_elements(p_actuals) e
  ) order by id for key share;
  perform 1 from public.material_lots where id in (
    select m.lot_id from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=p_record
    union select (e->>'lot_id')::uuid from jsonb_array_elements(p_actuals) e
  ) order by id for key share;
  lock table public.material_movements in share row exclusive mode;
  insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,compensates_id,note,created_by)
    select m.brewery_id,m.material_id,m.location_id,m.bin_id,m.lot_id,-m.qty,'adjustment',m.unit_cost_cents,m.id,p_reason,auth.uid()
    from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=p_record;
  if delta<>0 then
    insert into public.volume_adjustments(brewery_id,occupancy_id,bbl,reason,note,created_by)
      values(p_brewery,occupancy.id,delta,'measurement',p_reason,auth.uid()) returning id into adjustment;
  end if;
  insert into public.brew_records(brewery_id,batch_id,occupancy_id,recipe_version_id,brewed_on,initial_bbl,plan_snapshot,process,corrects_id,correction_reason,volume_adjustment_id,turn,created_by)
    values(p_brewery,batch.id,occupancy.id,old_record.recipe_version_id,old_record.brewed_on,p_initial_bbl,old_record.plan_snapshot,p_process,p_record,p_reason,adjustment,old_record.turn,auth.uid()) returning * into new_record;
  perform private.append_brew_actuals(new_record.id,p_actuals,p_confirm_empty);
  return private.complete_command_request(p_request_id,jsonb_build_object('record',to_jsonb(new_record)));
end $$;
revoke all on function public.correct_brew_record(uuid,uuid,text,numeric,jsonb,jsonb,boolean,uuid) from public,anon,service_role;
grant execute on function public.correct_brew_record(uuid,uuid,text,numeric,jsonb,jsonb,boolean,uuid) to authenticated;

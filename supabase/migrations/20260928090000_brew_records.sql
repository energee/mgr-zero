-- #622: confirmed brew facts and source-linked material consumption.
create table public.brew_records (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  batch_id uuid not null, occupancy_id uuid not null, recipe_version_id uuid,
  brewed_on date not null, initial_bbl numeric not null check (initial_bbl>0 and initial_bbl=round(initial_bbl,8) and initial_bbl not in ('NaN'::numeric,'Infinity'::numeric)),
  plan_snapshot jsonb not null, process jsonb not null,
  corrects_id uuid unique, correction_reason text, volume_adjustment_id uuid,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(id,brewery_id),
  foreign key(batch_id,brewery_id) references public.batches(id,brewery_id),
  foreign key(occupancy_id,brewery_id) references public.vessel_occupancies(id,brewery_id),
  foreign key(recipe_version_id,brewery_id) references public.recipe_versions(id,brewery_id),
  foreign key(corrects_id,brewery_id) references public.brew_records(id,brewery_id),
  foreign key(volume_adjustment_id,brewery_id) references public.volume_adjustments(id,brewery_id),
  check ((corrects_id is null and correction_reason is null) or (corrects_id is not null and correction_reason is not null and length(trim(correction_reason))>0))
);
create unique index brew_records_original on public.brew_records(batch_id) where corrects_id is null;
create index brew_records_brewery_batch on public.brew_records(brewery_id,batch_id,created_at);
alter table public.brew_records enable row level security;
create policy staff_read on public.brew_records for select using(public.is_staff_of(brewery_id));
grant select on public.brew_records to authenticated;
grant all on public.brew_records to service_role;

alter table public.batch_additions add column brew_record_id uuid,
  add column material_name text, add column unit text, add column confirmed_qty numeric,
  add column lot_code text, add column location_name text, add column bin_name text,
  add foreign key(brew_record_id,brewery_id) references public.brew_records(id,brewery_id);
create index batch_additions_brew_record on public.batch_additions(brew_record_id);

-- Both the initial commit and a correction use this one source validator.
create function private.append_brew_actuals(p_record uuid,p_actuals jsonb,p_confirm_empty boolean) returns void
language plpgsql set search_path='' as $$
declare r public.brew_records; a jsonb; m public.materials; bucket record; available numeric; movement uuid;
  qty numeric; lot_code text; location_name text; bin_name text;
begin
  select * into r from public.brew_records where id=p_record;
  if jsonb_typeof(p_actuals) is distinct from 'array' then raise exception 'confirm actual ingredients, including an explicit empty list'; end if;
  if jsonb_array_length(p_actuals)=0 and not coalesce(p_confirm_empty,false) then raise exception 'confirm that no ingredients were used'; end if;
  -- Metadata precedes the ledger lock, as it does in receipt writers.
  perform 1 from public.materials where id in (select (e->>'material_id')::uuid from jsonb_array_elements(p_actuals) e) order by id for key share;
  perform 1 from public.material_lots where id in (select (e->>'lot_id')::uuid from jsonb_array_elements(p_actuals) e) order by id for key share;
  lock table public.material_movements in share row exclusive mode;
  for a in select * from jsonb_array_elements(p_actuals) loop
    qty := (a->>'qty')::numeric;
    if qty is null or qty<=0 or qty::text in ('NaN','Infinity','-Infinity') or qty<>round(qty,4) then raise exception 'actual material quantity must be positive with at most four decimals'; end if;
    select * into m from public.materials where id=(a->>'material_id')::uuid and brewery_id=r.brewery_id;
    if m.id is null then raise exception 'material not found'; end if;
    if m.lot_tracked <> ((a->>'lot_id') is not null) then raise exception 'choose a lot exactly when the material is lot-tracked'; end if;
    if a->>'recipe_ingredient_id' is not null and not exists(select 1 from public.recipe_ingredients where id=(a->>'recipe_ingredient_id')::uuid and recipe_version_id=r.recipe_version_id and brewery_id=r.brewery_id) then raise exception 'ingredient is not in the pinned recipe'; end if;
    if a->>'stage' is null then raise exception 'actual ingredient stage required'; end if;
    perform (a->>'stage')::public.ingredient_stage;
    if not exists(select 1 from public.bins where id=(a->>'bin_id')::uuid and location_id=(a->>'location_id')::uuid and brewery_id=r.brewery_id) then raise exception 'material source bin not found'; end if;
    if a->>'lot_id' is not null and not exists(select 1 from public.material_lots where id=(a->>'lot_id')::uuid and material_id=m.id and brewery_id=r.brewery_id) then raise exception 'material source lot not found'; end if;
  end loop;
  -- UUID casts aggregate aliases of the same bucket before spending stock.
  for bucket in select (e->>'material_id')::uuid material_id,(e->>'location_id')::uuid location_id,
      (e->>'bin_id')::uuid bin_id,(e->>'lot_id')::uuid lot_id,sum((e->>'qty')::numeric) qty
    from jsonb_array_elements(p_actuals) e group by 1,2,3,4
  loop
    select coalesce(sum(mm.qty),0) into available from public.material_movements mm
      where mm.brewery_id=r.brewery_id and mm.material_id=bucket.material_id and mm.location_id=bucket.location_id
        and mm.bin_id=bucket.bin_id and mm.lot_id is not distinct from bucket.lot_id;
    if bucket.qty>available then raise exception 'insufficient actual material stock: % available',available; end if;
  end loop;
  for a in select * from jsonb_array_elements(p_actuals) loop
    select * into m from public.materials where id=(a->>'material_id')::uuid;
    select l.lot_code into lot_code from public.material_lots l where l.id=(a->>'lot_id')::uuid;
    select l.name into location_name from public.locations l where l.id=(a->>'location_id')::uuid;
    select b.name into bin_name from public.bins b where b.id=(a->>'bin_id')::uuid;
    qty := (a->>'qty')::numeric;
    insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,note,created_by)
      values(r.brewery_id,m.id,(a->>'location_id')::uuid,(a->>'bin_id')::uuid,(a->>'lot_id')::uuid,-qty,'consumption','confirmed brew actual',auth.uid()) returning id into movement;
    insert into public.batch_additions(brewery_id,batch_id,occupancy_id,recipe_ingredient_id,stage,movement_id,brew_record_id,material_name,unit,confirmed_qty,lot_code,location_name,bin_name)
      values(r.brewery_id,r.batch_id,r.occupancy_id,(a->>'recipe_ingredient_id')::uuid,(a->>'stage')::public.ingredient_stage,movement,r.id,m.name,m.base_uom::text,qty,lot_code,location_name,bin_name);
  end loop;
end $$;
revoke all on function private.append_brew_actuals(uuid,jsonb,boolean) from public,anon,authenticated,service_role;

create function private.brew_plan_snapshot(p_batch uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('recipe',r.name,'version',to_jsonb(v),
    'units',jsonb_build_object('temperature','F','beerVolume','bbl','waterVolume','gal','duration','minutes','waterIons','ppm'),
    'sourceWater',to_jsonb(sw),'targetWater',to_jsonb(tw),
    'ingredients',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('materialName',m.name,'unit',m.base_uom) order by i.sort,i.id)
      from public.recipe_ingredients i join public.materials m on m.id=i.material_id where i.recipe_version_id=v.id),'[]'::jsonb),
    'waterAdditions',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('materialName',m.name,'baseUnit',m.base_uom) order by a.sort,a.id)
      from public.recipe_water_additions a join public.materials m on m.id=a.material_id where a.recipe_version_id=v.id),'[]'::jsonb))
  from public.batches b left join public.recipe_versions v on v.id=b.recipe_version_id
  left join public.recipes r on r.id=v.recipe_id left join public.water_profiles sw on sw.id=v.source_water_profile_id
  left join public.water_profiles tw on tw.id=v.target_water_profile_id where b.id=p_batch;
$$;
revoke all on function private.brew_plan_snapshot(uuid) from public,anon,authenticated,service_role;

create function private.assert_brew_process(p_process jsonb) returns void
language plpgsql set search_path='' as $$
declare item record; n numeric;
begin
  if jsonb_typeof(p_process) is distinct from 'object' then raise exception 'confirmed process must be an object'; end if;
  for item in select * from jsonb_each(p_process) loop
    if item.key not in ('preBoilBbl','whirlpoolMinutes','whirlpoolTempF','whirlpoolRestMinutes','knockoutTempF','boilMinutes','mashWaterGal','spargeWaterGal','targetMashPh') then raise exception 'unknown confirmed process field: %',item.key; end if;
    if jsonb_typeof(item.value)<>'number' then raise exception 'confirmed process values must be numbers'; end if;
    n := item.value::text::numeric;
    if n::text in ('NaN','Infinity','-Infinity') then raise exception 'confirmed process values must be finite'; end if;
    if item.key in ('preBoilBbl','mashWaterGal') and n<=0 then raise exception 'confirmed volume must be positive'; end if;
    if item.key in ('whirlpoolMinutes','whirlpoolRestMinutes','boilMinutes') and (n<0 or n<>trunc(n)) then raise exception 'confirmed minutes must be whole and nonnegative'; end if;
    if item.key='spargeWaterGal' and n<0 then raise exception 'sparge volume cannot be negative'; end if;
    if item.key='targetMashPh' and (n<4 or n>7) then raise exception 'mash pH must be between 4 and 7'; end if;
  end loop;
end $$;
revoke all on function private.assert_brew_process(jsonb) from public,anon,authenticated,service_role;

drop function public.record_brew_day(uuid,uuid,uuid,numeric,date,uuid);
create function public.record_brew_day(
  p_brewery uuid, p_batch uuid, p_vessel uuid, p_initial_bbl numeric, p_brewed_on date, p_request_id uuid, p_actuals jsonb default null, p_process jsonb default '{}', p_confirm_empty boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_batch public.batches; v_vessel public.vessels; v_occ public.vessel_occupancies;
  v_start timestamptz; v_tz text; v_payload jsonb; v_record public.brew_records;
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
  insert into public.brew_records(brewery_id,batch_id,occupancy_id,recipe_version_id,brewed_on,initial_bbl,plan_snapshot,process,created_by)
    values(p_brewery,p_batch,v_occ.id,v_batch.recipe_version_id,p_brewed_on,p_initial_bbl,private.brew_plan_snapshot(p_batch),p_process,auth.uid()) returning * into v_record;
  perform private.append_brew_actuals(v_record.id,p_actuals,p_confirm_empty);
  return private.complete_command_request(p_request_id,
    jsonb_build_object('batch',to_jsonb(v_batch),'occupancy',to_jsonb(v_occ),'record',to_jsonb(v_record)));
end $$;

revoke all on function public.record_brew_day(uuid,uuid,uuid,numeric,date,uuid,jsonb,jsonb,boolean) from public,anon,service_role;
grant execute on function public.record_brew_day(uuid,uuid,uuid,numeric,date,uuid,jsonb,jsonb,boolean) to authenticated;

create function public.get_brew_day_plan(p_brewery uuid,p_batch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.batches; sources jsonb;
begin
  perform private.assert_staff(p_brewery,array['admin','brewer']::public.staff_role[]);
  select * into b from public.batches where id=p_batch and brewery_id=p_brewery;
  if b.id is null then raise exception 'batch not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.material_name,s.lot_code,s.bin_id),'[]'::jsonb) into sources from (
    select bal.material_id,m.name material_name,m.base_uom::text unit,bal.location_id,l.name location_name,
      bal.bin_id,bin.name bin_name,bal.lot_id,lot.lot_code,bal.qty
    from public.material_lot_bin_on_hand bal join public.materials m on m.id=bal.material_id
    join public.locations l on l.id=bal.location_id join public.bins bin on bin.id=bal.bin_id
    left join public.material_lots lot on lot.id=bal.lot_id
    where bal.brewery_id=p_brewery and bal.qty>0 and m.lot_tracked=(bal.lot_id is not null)
  ) s;
  return jsonb_build_object('batch',to_jsonb(b),'plan',private.brew_plan_snapshot(p_batch),'sources',sources);
end $$;
revoke all on function public.get_brew_day_plan(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_brew_day_plan(uuid,uuid) to authenticated;

create function public.get_brew_record(p_brewery uuid,p_batch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare records jsonb;
begin
  perform private.assert_staff(p_brewery,array['admin','brewer']::public.staff_role[]);
  if not exists(select 1 from public.batches where id=p_batch and brewery_id=p_brewery) then raise exception 'batch not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('additions',coalesce((
    select jsonb_agg(to_jsonb(a)||jsonb_build_object('source',to_jsonb(m)) order by a.id)
    from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=r.id
  ),'[]'::jsonb)) order by r.created_at,r.id),'[]'::jsonb) into records
  from public.brew_records r where r.batch_id=p_batch and r.brewery_id=p_brewery;
  return jsonb_build_object('records',records);
end $$;
revoke all on function public.get_brew_record(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_brew_record(uuid,uuid) to authenticated;

-- Shared correction identity for brew, packaging, and purchase receipts.
alter table public.material_movements add column compensates_id uuid unique,
  add foreign key(compensates_id,brewery_id) references public.material_movements(id,brewery_id);
create function private.enforce_material_compensation() returns trigger
language plpgsql set search_path='' as $$
declare original public.material_movements;
begin
  if new.compensates_id is null then return new; end if;
  select * into original from public.material_movements where id=new.compensates_id and brewery_id=new.brewery_id;
  if original.id is null or original.compensates_id is not null then raise exception 'compensation must reference an original material movement'; end if;
  if new.type<>'adjustment' or new.qty is distinct from -original.qty or new.qty::text in ('NaN','Infinity','-Infinity') then raise exception 'compensation must be the exact opposite adjustment'; end if;
  if row(new.material_id,new.location_id,new.bin_id,new.lot_id,new.unit_cost_cents)
      is distinct from row(original.material_id,original.location_id,original.bin_id,original.lot_id,original.unit_cost_cents) then
    raise exception 'compensation must preserve the original source bucket and frozen cost';
  end if;
  return new;
end $$;
revoke all on function private.enforce_material_compensation() from public,anon,authenticated,service_role;
create trigger material_compensation before insert on public.material_movements
  for each row execute function private.enforce_material_compensation();

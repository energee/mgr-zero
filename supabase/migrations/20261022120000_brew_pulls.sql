-- Prep (docs/plans/brew-day-revamp.md): the lots and amounts a brewer pulls for
-- a planned batch, and the tank it is meant for. Prep is a draft: saving it
-- moves no stock. record_brew_day stays the only consumer of material: the
-- Brew day form starts its actuals from these pulls and the brewer confirms.

-- The tank a planned batch is meant for. Deleting a never-used vessel
-- (delete_vessel) clears the plan rather than blocking the delete.
alter table public.batches add column planned_vessel_id uuid,
  add foreign key (planned_vessel_id, brewery_id) references public.vessels (id, brewery_id)
    on delete set null (planned_vessel_id);

-- One draft pull: a material from a bin (and a lot when lot-tracked). The
-- composite keys mirror material_movements, so a lot belongs to its material
-- and a bin to its location, all in one brewery.
create table public.brew_pulls (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  batch_id uuid not null,
  recipe_ingredient_id uuid,
  material_id uuid not null,
  location_id uuid not null,
  bin_id uuid not null,
  lot_id uuid,
  qty numeric not null check (qty >= 0 and qty = round(qty, 4) and qty not in ('NaN'::numeric, 'Infinity'::numeric)),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  foreign key (batch_id, brewery_id) references public.batches (id, brewery_id) on delete cascade,
  foreign key (recipe_ingredient_id, brewery_id) references public.recipe_ingredients (id, brewery_id),
  foreign key (material_id, brewery_id) references public.materials (id, brewery_id),
  foreign key (location_id, brewery_id) references public.locations (id, brewery_id),
  foreign key (bin_id, location_id, brewery_id) references public.bins (id, location_id, brewery_id),
  foreign key (lot_id, material_id, brewery_id) references public.material_lots (id, material_id, brewery_id)
);
-- Leads with brewery_id for the staff_read policy; serves the per-batch reads.
create index brew_pulls_brewery_batch on public.brew_pulls (brewery_id, batch_id);
alter table public.brew_pulls enable row level security;
create policy staff_read on public.brew_pulls for select using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])))
);
-- Reads only; writes go through save_batch_pulls (security definer).
grant select on public.brew_pulls to authenticated;
grant all on public.brew_pulls to service_role;

-- Replace a planned batch's pulls and planned tank in one call. A full replace,
-- so the client sends every line each time; the request id replays a retried
-- save instead of letting an older one overwrite a newer one.
-- Each line is checked as private.append_brew_actuals checks an actual (same
-- messages). That function also spends stock, and it lives in a committed
-- migration, so the checks are repeated here rather than factored out.
create function public.save_batch_pulls(
  p_brewery uuid, p_batch uuid, p_vessel uuid, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_batch public.batches; v_vessel public.vessels; a jsonb; m public.materials; v_qty numeric; v_pulls jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'save_batch_pulls', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'vessel', p_vessel, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;

  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.cancelled_at is not null then raise exception 'batch is cancelled'; end if;
  if v_batch.brewed_on is not null then raise exception 'batch % was already brewed on %', v_batch.batch_no, v_batch.brewed_on; end if;

  -- No tank yet is fine; a chosen one must be this brewery's and in service.
  if p_vessel is not null then
    select * into v_vessel from public.vessels where id = p_vessel and brewery_id = p_brewery;
    if v_vessel.id is null then raise exception 'vessel not found'; end if;
    if not v_vessel.active then raise exception 'vessel % is retired; choose another tank', v_vessel.name; end if;
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'pull lines must be an array'; end if;
  -- get_brew_day_plan's reader takes one pull per recipe line; a second would be silently ignored.
  if exists(select 1 from jsonb_array_elements(p_lines) e where e->>'recipe_ingredient_id' is not null
      group by e->>'recipe_ingredient_id' having count(*) > 1) then raise exception 'each recipe line is pulled once'; end if;
  for a in select * from jsonb_array_elements(p_lines) loop
    v_qty := (a->>'qty')::numeric;
    if v_qty is null or v_qty < 0 or v_qty::text in ('NaN','Infinity','-Infinity') or v_qty <> round(v_qty, 4) then raise exception 'pulled quantity must be zero or more with at most four decimals'; end if;
    select * into m from public.materials where id = (a->>'material_id')::uuid and brewery_id = p_brewery;
    if m.id is null then raise exception 'material not found'; end if;
    if m.lot_tracked <> ((a->>'lot_id') is not null) then raise exception 'choose a lot exactly when the material is lot-tracked'; end if;
    if a->>'recipe_ingredient_id' is not null and not exists(select 1 from public.recipe_ingredients where id = (a->>'recipe_ingredient_id')::uuid and recipe_version_id = v_batch.recipe_version_id and brewery_id = p_brewery) then raise exception 'ingredient is not in the pinned recipe'; end if;
    if not exists(select 1 from public.bins where id = (a->>'bin_id')::uuid and location_id = (a->>'location_id')::uuid and brewery_id = p_brewery) then raise exception 'material source bin not found'; end if;
    if a->>'lot_id' is not null and not exists(select 1 from public.material_lots where id = (a->>'lot_id')::uuid and material_id = m.id and brewery_id = p_brewery) then raise exception 'material source lot not found'; end if;
  end loop;

  delete from public.brew_pulls where brewery_id = p_brewery and batch_id = p_batch;
  insert into public.brew_pulls (brewery_id, batch_id, recipe_ingredient_id, material_id, location_id, bin_id, lot_id, qty)
    select p_brewery, p_batch, (e->>'recipe_ingredient_id')::uuid, (e->>'material_id')::uuid, (e->>'location_id')::uuid,
      (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, (e->>'qty')::numeric
    from jsonb_array_elements(p_lines) e;
  update public.batches set planned_vessel_id = p_vessel where id = p_batch returning * into v_batch;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) into v_pulls from public.brew_pulls p where p.brewery_id = p_brewery and p.batch_id = p_batch;
  return private.complete_command_request(p_request_id, jsonb_build_object('batch', to_jsonb(v_batch), 'pulls', v_pulls));
end $$;
revoke all on function public.save_batch_pulls(uuid, uuid, uuid, jsonb, uuid) from public, anon, service_role;
grant execute on function public.save_batch_pulls(uuid, uuid, uuid, jsonb, uuid) to authenticated;

-- Each ingredient also carries its material's pack size (purchase_uom_factor,
-- not null and > 0; 1 means no pack size: count in base units). The rest is
-- the 20260928090000_brew_records.sql body unchanged.
create or replace function private.brew_plan_snapshot(p_batch uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('recipe',r.name,'version',to_jsonb(v),
    'units',jsonb_build_object('temperature','F','beerVolume','bbl','waterVolume','gal','duration','minutes','waterIons','ppm'),
    'sourceWater',to_jsonb(sw),'targetWater',to_jsonb(tw),
    'ingredients',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('materialName',m.name,'unit',m.base_uom,'purchaseUomFactor',m.purchase_uom_factor) order by i.sort,i.id)
      from public.recipe_ingredients i join public.materials m on m.id=i.material_id where i.recipe_version_id=v.id),'[]'::jsonb),
    'waterAdditions',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('materialName',m.name,'baseUnit',m.base_uom) order by a.sort,a.id)
      from public.recipe_water_additions a join public.materials m on m.id=a.material_id where a.recipe_version_id=v.id),'[]'::jsonb))
  from public.batches b left join public.recipe_versions v on v.id=b.recipe_version_id
  left join public.recipes r on r.id=v.recipe_id left join public.water_profiles sw on sw.id=v.source_water_profile_id
  left join public.water_profiles tw on tw.id=v.target_water_profile_id where b.id=p_batch;
$$;

-- The plan also returns the batch's saved pulls, named like sources. The
-- planned tank comes through batch (planned_vessel_id). Sources are unchanged.
create or replace function public.get_brew_day_plan(p_brewery uuid,p_batch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.batches; sources jsonb; pulls jsonb;
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
  select coalesce(jsonb_agg(to_jsonb(s) order by s.material_name,s.lot_code,s.bin_name,s.id),'[]'::jsonb) into pulls from (
    select p.id,p.recipe_ingredient_id,p.material_id,m.name material_name,m.base_uom::text unit,p.location_id,l.name location_name,
      p.bin_id,bin.name bin_name,p.lot_id,lot.lot_code,p.qty
    from public.brew_pulls p join public.materials m on m.id=p.material_id
    join public.locations l on l.id=p.location_id join public.bins bin on bin.id=p.bin_id
    left join public.material_lots lot on lot.id=p.lot_id
    where p.brewery_id=p_brewery and p.batch_id=p_batch
  ) s;
  return jsonb_build_object('batch',to_jsonb(b),'plan',private.brew_plan_snapshot(p_batch),'sources',sources,'pulls',pulls);
end $$;

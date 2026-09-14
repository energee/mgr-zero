-- Recipe process spec (issue #278; recipe-builder spec D1-D8): a version is
-- the executable brew sheet. Mash and fermentation schedules are JSONB arrays
-- on the version (read as a unit with it, never queried alone, immutable);
-- the whirlpool, knockout and pre-boil scalars and the water fields are
-- columns; water additions are rows with one stage field (mash, sparge,
-- kettle). mash_temp_f stays and is filled from the saccharification rest so
-- recipe-gravity's input survives (decided 2026-09-13).
alter table public.recipe_versions
  add column mash_schedule jsonb not null default '[]'::jsonb,
  add column fermentation_schedule jsonb not null default '[]'::jsonb,
  add column pre_boil_bbl numeric(10,3) check (pre_boil_bbl > 0),
  add column whirlpool_minutes int check (whirlpool_minutes >= 0),
  add column whirlpool_temp_f numeric,
  add column whirlpool_rest_minutes int check (whirlpool_rest_minutes >= 0),
  add column knockout_temp_f numeric,
  add column target_water_profile_id uuid,
  add column source_water_profile_id uuid,
  add column mash_water_gal numeric(8,2) check (mash_water_gal > 0),
  add column sparge_water_gal numeric(8,2) check (sparge_water_gal >= 0),
  add column target_mash_ph numeric(4,2) check (target_mash_ph between 4 and 7),
  add foreign key (target_water_profile_id, brewery_id) references public.water_profiles (id, brewery_id),
  add foreign key (source_water_profile_id, brewery_id) references public.water_profiles (id, brewery_id);

create table public.recipe_water_additions (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  recipe_version_id uuid not null,
  material_id uuid not null,
  qty numeric(12,4) not null check (qty > 0),
  unit text not null check (unit in ('g', 'mL', 'oz')),
  stage text not null check (stage in ('mash', 'sparge', 'kettle')),
  sort int not null default 0,
  unique (id, brewery_id),
  foreign key (recipe_version_id, brewery_id) references public.recipe_versions (id, brewery_id),
  foreign key (material_id, brewery_id) references public.materials (id, brewery_id)
);
create index recipe_water_additions_version_idx on public.recipe_water_additions (recipe_version_id, sort);
create index recipe_water_additions_brewery_idx on public.recipe_water_additions (brewery_id);
alter table public.recipe_water_additions enable row level security;
create policy staff_read on public.recipe_water_additions for select using (public.is_staff_of(brewery_id));
grant select on public.recipe_water_additions to authenticated;
grant all on public.recipe_water_additions to service_role;

-- The version RPC grows the schedules and one process block; the block keeps
-- the signature readable (p_process ->> 'pre_boil_bbl' …) while every value
-- lands in its own column above.
drop function public.create_recipe_version(uuid,uuid,numeric,numeric,numeric,int,numeric,text,jsonb,uuid);
create function public.create_recipe_version(
  p_brewery uuid, p_recipe uuid, p_mash_schedule jsonb, p_fermentation_schedule jsonb, p_process jsonb,
  p_brewhouse_efficiency numeric, p_yeast_attenuation numeric, p_boil_minutes int, p_target_ibu numeric, p_note text,
  p_ingredients jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_recipe public.recipes; v_row public.recipe_versions; v_mash_temp numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_recipe_version', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'recipe', p_recipe, 'mash_schedule', p_mash_schedule,
      'fermentation_schedule', p_fermentation_schedule, 'process', p_process,
      'brewhouse_efficiency', p_brewhouse_efficiency, 'yeast_attenuation', p_yeast_attenuation,
      'boil_minutes', p_boil_minutes, 'target_ibu', p_target_ibu, 'note', p_note, 'ingredients', p_ingredients));
  if v_replay is not null then return v_replay; end if;
  select * into v_recipe from public.recipes where id = p_recipe and brewery_id = p_brewery for update;
  if v_recipe.id is null then raise exception 'recipe not found'; end if;
  if jsonb_array_length(p_ingredients) = 0 then raise exception 'a recipe version needs at least one ingredient'; end if;
  if jsonb_array_length(p_mash_schedule) = 0 then raise exception 'a recipe version needs a mash schedule'; end if;

  -- The saccharification rest: the longest step between 144 and 162 °F
  -- (lib/mgr/recipe-schedule.ts says the same); none in range → null.
  select (s->>'tempF')::numeric into v_mash_temp from jsonb_array_elements(p_mash_schedule) s
  where (s->>'tempF')::numeric between 144 and 162 order by (s->>'minutes')::numeric desc limit 1;

  insert into public.recipe_versions (brewery_id, recipe_id, version, mash_temp_f, brewhouse_efficiency, yeast_attenuation,
    boil_minutes, target_ibu, note, created_by, mash_schedule, fermentation_schedule,
    pre_boil_bbl, whirlpool_minutes, whirlpool_temp_f, whirlpool_rest_minutes, knockout_temp_f,
    target_water_profile_id, source_water_profile_id, mash_water_gal, sparge_water_gal, target_mash_ph)
  select p_brewery, p_recipe, coalesce(max(rv.version), 0) + 1, v_mash_temp, p_brewhouse_efficiency, p_yeast_attenuation,
    p_boil_minutes, p_target_ibu, p_note, v_actor, p_mash_schedule, p_fermentation_schedule,
    (p_process->>'pre_boil_bbl')::numeric, (p_process->>'whirlpool_minutes')::int, (p_process->>'whirlpool_temp_f')::numeric,
    (p_process->>'whirlpool_rest_minutes')::int, (p_process->>'knockout_temp_f')::numeric,
    (p_process->>'target_water_profile_id')::uuid, (p_process->>'source_water_profile_id')::uuid,
    (p_process->>'mash_water_gal')::numeric, (p_process->>'sparge_water_gal')::numeric, (p_process->>'target_mash_ph')::numeric
  from public.recipe_versions rv where rv.recipe_id = p_recipe
  returning * into v_row;

  insert into public.recipe_ingredients (brewery_id, recipe_version_id, material_id, per_bbl_qty, stage, timing_minutes, sort, extract_snapshot)
  select p_brewery, v_row.id, (line->>'material_id')::uuid, (line->>'per_bbl_qty')::numeric,
    (line->>'stage')::public.ingredient_stage, (line->>'timing_minutes')::int, (ord - 1)::int,
    (select m.extract_potential from public.materials m where m.id = (line->>'material_id')::uuid and m.brewery_id = p_brewery)
  from jsonb_array_elements(p_ingredients) with ordinality as t(line, ord);

  insert into public.recipe_water_additions (brewery_id, recipe_version_id, material_id, qty, unit, stage, sort)
  select p_brewery, v_row.id, (a->>'material_id')::uuid, (a->>'qty')::numeric, a->>'unit', a->>'stage', (ord - 1)::int
  from jsonb_array_elements(coalesce(p_process->'water_additions', '[]'::jsonb)) with ordinality as t(a, ord);

  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.create_recipe_version(uuid,uuid,jsonb,jsonb,jsonb,numeric,numeric,int,numeric,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_recipe_version(uuid,uuid,jsonb,jsonb,jsonb,numeric,numeric,int,numeric,text,jsonb,uuid) to authenticated;

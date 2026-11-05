-- Recipe IBU (docs/plans/recipe-manager.md, PR 3): a hop's alpha acid, typed on
-- the material and frozen on each version like extract_potential and
-- extract_snapshot, so a material edit changes no saved version. IBU itself is
-- computed in lib/recipe-ibu.ts and never in SQL. Nothing here fills a value:
-- existing rows stay null, and a null means no alpha acid was typed.
alter table public.materials
  add column alpha_acid numeric(5,2) check (alpha_acid > 0 and alpha_acid <= 30); -- percent, as on the bag
alter table public.recipe_ingredients
  add column alpha_snapshot numeric(5,2); -- materials.alpha_acid when the version was saved

-- Copied from: 20260917100000_recipe_process_spec.sql; only alpha_snapshot and the materials left join that fills it are new.
-- The left join keeps a line whose material does not exist, so the foreign key still refuses it.
-- The signature is the same, so create or replace keeps its grants.
create or replace function public.create_recipe_version(
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

  insert into public.recipe_ingredients (brewery_id, recipe_version_id, material_id, per_bbl_qty, stage, timing_minutes, sort, extract_snapshot, alpha_snapshot)
  select p_brewery, v_row.id, (line->>'material_id')::uuid, (line->>'per_bbl_qty')::numeric,
    (line->>'stage')::public.ingredient_stage, (line->>'timing_minutes')::int, (ord - 1)::int,
    m.extract_potential, m.alpha_acid
  from jsonb_array_elements(p_ingredients) with ordinality as t(line, ord)
  left join public.materials m on m.id = (line->>'material_id')::uuid and m.brewery_id = p_brewery;

  insert into public.recipe_water_additions (brewery_id, recipe_version_id, material_id, qty, unit, stage, sort)
  select p_brewery, v_row.id, (a->>'material_id')::uuid, (a->>'qty')::numeric, a->>'unit', a->>'stage', (ord - 1)::int
  from jsonb_array_elements(coalesce(p_process->'water_additions', '[]'::jsonb)) with ordinality as t(a, ord);

  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Copied from: 20260927050000_material_units_guard_references.sql; only p_alpha_acid is new.
-- Null on an edit keeps the alpha acid the material had, like extract_potential.
-- A new parameter changes the signature, so the old function is dropped and the
-- new one granted as the old one was.
drop function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,uuid);

create function public.upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_extract_potential numeric, p_alpha_acid numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active,
      'extract_potential', p_extract_potential, 'alpha_acid', p_alpha_acid));
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, active, extract_potential, alpha_acid)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true), p_extract_potential, p_alpha_acid)
    returning * into v_row;
  else
    select * into v_row from public.materials where id = p_material and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'material not found'; end if;
    if (v_row.base_uom, v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, v_row.purchase_uom_factor))
       and (exists (select 1 from public.material_movements where material_id = p_material)
         or exists (select 1 from public.recipe_ingredients where material_id = p_material)
         or exists (select 1 from public.format_bom where material_id = p_material)
         or exists (select 1 from public.purchase_order_lines where material_id = p_material)
         or exists (select 1 from public.material_contracts where material_id = p_material)
         or exists (select 1 from public.stock_transfer_lines where material_id = p_material)) then
      raise exception 'material is in use: its units cannot change';
    end if;
    if not v_row.lot_tracked and p_lot_tracked
       -- per bin: unlotted amounts in different bins must not cancel out
       and exists (select 1 from public.material_movements
                   where brewery_id = p_brewery and material_id = p_material and lot_id is null
                   group by bin_id having sum(qty) <> 0) then
      raise exception 'material has stock without a lot: count it to zero before turning on lot tracking';
    end if;
    update public.materials set name = p_name, category = p_category, base_uom = p_base_uom, purchase_uom = p_purchase_uom,
      purchase_uom_factor = coalesce(p_purchase_uom_factor, purchase_uom_factor), lot_tracked = coalesce(p_lot_tracked, lot_tracked),
      default_vendor_id = p_default_vendor, reorder_point = coalesce(p_reorder_point, reorder_point), active = coalesce(p_active, active),
      extract_potential = coalesce(p_extract_potential, extract_potential),
      alpha_acid = coalesce(p_alpha_acid, alpha_acid)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,uuid) from public, anon, authenticated;
grant execute on function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,uuid) to authenticated;

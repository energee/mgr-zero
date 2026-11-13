-- Saving a recipe moves its scheduled batches to the new copy (#1817). The recipe
-- page hides copies, so a brewer who changes a recipe expects next week's batch
-- to brew the change. Batches of the recipe that are not brewed and not
-- cancelled now point at the copy just saved; a brewed batch never moves. The
-- result gains moved_batches, the count, which the page reports.
-- Copied from: 20261110192920_recipe_batch_size.sql; only the move before the
-- return is new. The signature is the same, so create or replace keeps its grants.
create or replace function public.create_recipe_version(
  p_brewery uuid, p_recipe uuid, p_mash_schedule jsonb, p_fermentation_schedule jsonb, p_process jsonb,
  p_brewhouse_efficiency numeric, p_yeast_attenuation numeric, p_boil_minutes int, p_target_ibu numeric, p_note text,
  p_ingredients jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_recipe public.recipes; v_row public.recipe_versions; v_mash_temp numeric; v_batches uuid[];
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
    target_water_profile_id, source_water_profile_id, mash_water_gal, sparge_water_gal, target_mash_ph, batch_bbl)
  select p_brewery, p_recipe, coalesce(max(rv.version), 0) + 1, v_mash_temp, p_brewhouse_efficiency, p_yeast_attenuation,
    p_boil_minutes, p_target_ibu, p_note, v_actor, p_mash_schedule, p_fermentation_schedule,
    (p_process->>'pre_boil_bbl')::numeric, (p_process->>'whirlpool_minutes')::int, (p_process->>'whirlpool_temp_f')::numeric,
    (p_process->>'whirlpool_rest_minutes')::int, (p_process->>'knockout_temp_f')::numeric,
    (p_process->>'target_water_profile_id')::uuid, (p_process->>'source_water_profile_id')::uuid,
    (p_process->>'mash_water_gal')::numeric, (p_process->>'sparge_water_gal')::numeric, (p_process->>'target_mash_ph')::numeric,
    (p_process->>'batch_bbl')::numeric
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

  -- The recipe's scheduled batches brew this copy from now on: not brewed, not cancelled. A brewed batch keeps the
  -- copy it was brewed from. The recipe row is locked above, so two saves cannot both move the same batch.
  select coalesce(array_agg(b.id), '{}') into v_batches
  from public.batches b join public.recipe_versions rv on rv.id = b.recipe_version_id
  where b.brewery_id = p_brewery and rv.recipe_id = p_recipe and b.recipe_version_id <> v_row.id
    and b.brewed_on is null and b.cancelled_at is null;
  -- A Prep pull follows its line: the nth line of a material in a stage stays the nth in this copy.
  with lines as (
    select ri.id, ri.recipe_version_id, ri.material_id, ri.stage,
      row_number() over (partition by ri.recipe_version_id, ri.material_id, ri.stage order by ri.sort, ri.id) as nth
    from public.recipe_ingredients ri
    where ri.recipe_version_id in (select b.recipe_version_id from public.batches b where b.id = any(v_batches)) or ri.recipe_version_id = v_row.id
  )
  update public.brew_pulls p set recipe_ingredient_id = now_line.id
  from lines was_line join lines now_line
    on now_line.recipe_version_id = v_row.id and now_line.material_id = was_line.material_id
      and now_line.stage = was_line.stage and now_line.nth = was_line.nth
  where p.batch_id = any(v_batches) and p.recipe_ingredient_id = was_line.id and was_line.recipe_version_id <> v_row.id;
  -- A pull whose line this copy no longer has is dropped: Prep is a draft and moved no stock.
  delete from public.brew_pulls p
  where p.batch_id = any(v_batches) and p.recipe_ingredient_id is not null
    and not exists (select 1 from public.recipe_ingredients ri where ri.id = p.recipe_ingredient_id and ri.recipe_version_id = v_row.id);
  update public.batches set recipe_version_id = v_row.id where id = any(v_batches);

  return private.complete_command_request(p_request_id, to_jsonb(v_row) || jsonb_build_object('moved_batches', cardinality(v_batches)));
end $$;

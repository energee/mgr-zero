-- Water profile notes, alkalinity and pH (issue #1205, owner decision
-- 2026-10-23): three optional fields on water_profiles. There is still no
-- source/target classification; one profile can serve either role.
-- - note: free text, at most 2000 characters (the cap on invoice questions,
--   the longest staff free text with one); blank is stored as null.
-- - alkalinity_ppm: total alkalinity as CaCO3 in ppm, shaped like the six ion
--   columns. Bicarbonate does not replace it.
-- - water_ph: the water's own pH. It is not a recipe's target mash pH
--   (recipe_versions.target_mash_ph), hence the column name.
alter table public.water_profiles
  add column note text check (note is null or (btrim(note) <> '' and length(note) <= 2000)),
  add column alkalinity_ppm numeric(7,1) check (alkalinity_ppm >= 0),
  add column water_ph numeric(4,2) check (water_ph between 0 and 14);

-- The upsert takes the three new values, so its signature changes: drop the
-- 20260916100000 version and recreate it with p_alkalinity, p_ph and p_note.
-- An edit writes every field, so a null clears one.
drop function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid);
create function public.upsert_water_profile(
  p_brewery uuid, p_profile uuid, p_name text, p_calcium numeric, p_magnesium numeric, p_sodium numeric,
  p_sulfate numeric, p_chloride numeric, p_bicarbonate numeric, p_alkalinity numeric, p_ph numeric, p_note text,
  p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.water_profiles;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_water_profile', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'profile', p_profile, 'name', p_name, 'calcium', p_calcium, 'magnesium', p_magnesium,
      'sodium', p_sodium, 'sulfate', p_sulfate, 'chloride', p_chloride, 'bicarbonate', p_bicarbonate,
      'alkalinity', p_alkalinity, 'ph', p_ph, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if p_profile is null then
    insert into public.water_profiles (brewery_id, name, calcium_ppm, magnesium_ppm, sodium_ppm, sulfate_ppm, chloride_ppm, bicarbonate_ppm,
      alkalinity_ppm, water_ph, note)
    values (p_brewery, p_name, p_calcium, p_magnesium, p_sodium, p_sulfate, p_chloride, p_bicarbonate, p_alkalinity, p_ph, p_note)
    returning * into v_row;
  else
    update public.water_profiles
    set name = p_name, calcium_ppm = p_calcium, magnesium_ppm = p_magnesium, sodium_ppm = p_sodium,
        sulfate_ppm = p_sulfate, chloride_ppm = p_chloride, bicarbonate_ppm = p_bicarbonate,
        alkalinity_ppm = p_alkalinity, water_ph = p_ph, note = p_note
    where id = p_profile and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'water profile not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,uuid) from public, anon, authenticated;
grant execute on function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,uuid) to authenticated;

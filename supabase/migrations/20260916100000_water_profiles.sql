-- water_profiles (issue #278, Water profiles / Water profile): a catalog
-- entity beside formats — a name and six ions in ppm, referenced by many
-- recipes and edited in one place (recipe-builder spec, "Named, not
-- designed"). No ion arithmetic lives here.
create table public.water_profiles (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  name text not null,
  calcium_ppm numeric(7,1) not null check (calcium_ppm >= 0),
  magnesium_ppm numeric(7,1) not null check (magnesium_ppm >= 0),
  sodium_ppm numeric(7,1) not null check (sodium_ppm >= 0),
  sulfate_ppm numeric(7,1) not null check (sulfate_ppm >= 0),
  chloride_ppm numeric(7,1) not null check (chloride_ppm >= 0),
  bicarbonate_ppm numeric(7,1) not null check (bicarbonate_ppm >= 0),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name)   -- also the brewery index: every read filters brewery_id and sorts by name
);
alter table public.water_profiles enable row level security;
create policy staff_read on public.water_profiles for select using (public.is_staff_of(brewery_id));
grant select on public.water_profiles to authenticated;
grant all on public.water_profiles to service_role;

create function public.upsert_water_profile(
  p_brewery uuid, p_profile uuid, p_name text, p_calcium numeric, p_magnesium numeric, p_sodium numeric,
  p_sulfate numeric, p_chloride numeric, p_bicarbonate numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.water_profiles;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_water_profile', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'profile', p_profile, 'name', p_name, 'calcium', p_calcium, 'magnesium', p_magnesium,
      'sodium', p_sodium, 'sulfate', p_sulfate, 'chloride', p_chloride, 'bicarbonate', p_bicarbonate));
  if v_replay is not null then return v_replay; end if;
  if p_profile is null then
    insert into public.water_profiles (brewery_id, name, calcium_ppm, magnesium_ppm, sodium_ppm, sulfate_ppm, chloride_ppm, bicarbonate_ppm)
    values (p_brewery, p_name, p_calcium, p_magnesium, p_sodium, p_sulfate, p_chloride, p_bicarbonate) returning * into v_row;
  else
    update public.water_profiles
    set name = p_name, calcium_ppm = p_calcium, magnesium_ppm = p_magnesium, sodium_ppm = p_sodium,
        sulfate_ppm = p_sulfate, chloride_ppm = p_chloride, bicarbonate_ppm = p_bicarbonate
    where id = p_profile and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'water profile not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid) from public, anon, authenticated;
grant execute on function public.upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid) to authenticated;

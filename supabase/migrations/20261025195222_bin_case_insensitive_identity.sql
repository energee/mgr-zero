-- #1265: reject new case-variant bin identities without rewriting historical
-- collisions or their linked stock. Keep the original raw request hashes and
-- replay results. No lower(name) unique index: existing Dry/dry bins must survive.
create or replace function public.create_bin(
  p_brewery uuid, p_location uuid, p_name text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins; v_duplicate text;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.locations where id = p_location and brewery_id = p_brewery;
  if not found then raise exception 'location not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'bin-name:' || p_brewery::text || ':' || p_location::text, 0));
  select b.name into v_duplicate from public.bins b
    where b.brewery_id = p_brewery and b.location_id = p_location
      and lower(btrim(b.name)) = lower(btrim(p_name))
    order by b.name, b.id limit 1;
  if found then raise exception 'A bin named % already exists here', btrim(v_duplicate); end if;
  insert into public.bins (brewery_id, location_id, name) values (p_brewery, p_location, p_name) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create or replace function public.update_bin(
  p_brewery uuid, p_bin uuid, p_name text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins; v_duplicate text;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'bin', p_bin, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  select b.* into v_row from public.bins b where b.id = p_bin and b.brewery_id = p_brewery;
  if not found then raise exception 'bin not found'; end if;
  -- Serialize identities before locking this bin, without taking a location
  -- row lock that would invert movement's location -> bin read-lock order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'bin-name:' || p_brewery::text || ':' || v_row.location_id::text, 0));
  select b.* into v_row from public.bins b where b.id = p_bin and b.brewery_id = p_brewery for update;
  if not found then raise exception 'bin not found'; end if;
  -- An unchanged historical collision remains editable without data cleanup.
  if p_name is distinct from v_row.name then
    select b.name into v_duplicate from public.bins b
      where b.brewery_id = p_brewery and b.location_id = v_row.location_id and b.id <> p_bin
        and lower(btrim(b.name)) = lower(btrim(p_name))
      order by b.name, b.id limit 1;
    if found then raise exception 'A bin named % already exists here', btrim(v_duplicate); end if;
  end if;
  update public.bins set name = p_name where id = p_bin and brewery_id = p_brewery returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

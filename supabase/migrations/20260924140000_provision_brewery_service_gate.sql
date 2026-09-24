-- Brewery bootstrap moves behind the server (#467). With open signup any
-- self-registered account could call provision_brewery through PostgREST and
-- create unlimited breweries; MGR_DEDICATED=1 lives in the application
-- environment, which the database cannot read, so it only hid the page.
-- The authenticated RPC is dropped. The replacement is service_role only and
-- takes the actor the server verified from the session (lib/supabase/provision.ts,
-- architecture rule 4); the server refuses before calling it when dedicated.
drop function public.provision_brewery(text, text, text, uuid);

create function public.provision_brewery(p_actor uuid, p_name text, p_timezone text, p_ttb text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_actor)
    then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'brewery name is required'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    then raise exception 'invalid timezone'; end if;
  v_result := private.claim_command_request_for(p_actor, null, 'provision_brewery', p_request_id,
    jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone, 'ttb', nullif(btrim(p_ttb), '')));
  if v_result is not null then return (v_result #>> '{}')::uuid; end if;
  insert into public.breweries(name, timezone, ttb_registry_no)
    values (btrim(p_name), p_timezone, nullif(btrim(p_ttb), '')) returning id into v_id;
  insert into public.brewery_users(brewery_id, user_id, role) values (v_id, p_actor, 'admin');
  perform private.complete_command_request_for(p_actor, p_request_id, to_jsonb(v_id));
  return v_id;
end $$;
revoke all on function public.provision_brewery(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.provision_brewery(uuid, text, text, text, uuid) to service_role;

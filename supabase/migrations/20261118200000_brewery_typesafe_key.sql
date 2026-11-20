-- A brewery's own TypeSafe key for Jev material kind suggestions, and the Admin
-- switch "Suggest kinds for new materials" (docs/plans/jev-suggestions.md,
-- per-brewery key). Turning the switch on is that brewery's consent to send
-- material names to TypeSafe. It replaces the MGR_SUGGESTIONS and
-- TYPESAFE_API_KEY environment variables on the product path.
--
-- The key follows private.integration_tokens: a private table nobody can
-- read, reached only through service-only functions that recheck the actor's
-- current role. Nothing here returns the key except read_brewery_typesafe_key,
-- which lib/supabase/integration-tokens.ts calls on the server to ask TypeSafe.

alter table public.breweries add column suggestions_enabled boolean not null default false;

create table private.brewery_typesafe_keys (
  brewery_id uuid primary key references public.breweries(id),
  api_key text not null check (length(api_key) between 8 and 500)
);
alter table private.brewery_typesafe_keys enable row level security;
revoke all privileges on table private.brewery_typesafe_keys from public, anon, authenticated, service_role;

-- What Settings shows: whether a key is saved, its last four characters, and the switch.
create function private.typesafe_key_status(p_brewery uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'saved', k.api_key is not null,
    'last4', right(k.api_key, 4),
    'enabled', b.suggestions_enabled)
  from public.breweries b
  left join private.brewery_typesafe_keys k on k.brewery_id = b.id
  where b.id = p_brewery;
$$;
revoke all on function private.typesafe_key_status(uuid) from public, anon, authenticated, service_role;

-- Saves (or, with a null key, removes) the key. Removing it also turns
-- suggestions off. claim_command_request_for stores a SHA-256 of the payload,
-- so the payload names only whether a key was sent, never the key: a hash of
-- the key itself would sit in private.command_requests.
create function public.set_brewery_typesafe_key(p_brewery uuid, p_actor uuid, p_api_key text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  if not private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]) then
    raise insufficient_privilege using message = 'permission denied';
  end if;
  v_replay := private.claim_command_request_for(p_actor, p_brewery, 'set_brewery_typesafe_key', p_request_id,
    jsonb_build_object('apiKey', p_api_key is not null));
  if v_replay is not null then return v_replay; end if;
  if p_api_key is null then
    delete from private.brewery_typesafe_keys where brewery_id = p_brewery;
    update public.breweries set suggestions_enabled = false where id = p_brewery;
  else
    insert into private.brewery_typesafe_keys (brewery_id, api_key) values (p_brewery, p_api_key)
    on conflict (brewery_id) do update set api_key = excluded.api_key;
  end if;
  return private.complete_command_request_for(p_actor, p_request_id, private.typesafe_key_status(p_brewery));
end $$;

-- Admin only; null for anyone else, which the server boundary turns into 403.
create function public.get_brewery_typesafe_key_status(p_brewery uuid, p_actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.typesafe_key_status(p_brewery)
  where private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]);
$$;

-- The key for suggest_material_category, only while the brewery's switch is on
-- and only for the roles that may add a material; null otherwise.
create function public.read_brewery_typesafe_key(p_brewery uuid, p_actor uuid) returns text
language sql stable security definer set search_path = '' as $$
  select k.api_key
  from private.brewery_typesafe_keys k
  join public.breweries b on b.id = k.brewery_id
  where k.brewery_id = p_brewery
    and b.suggestions_enabled
    and private.actor_has_staff_roles(p_brewery, p_actor, array['admin', 'warehouse', 'brewer']::public.staff_role[]);
$$;

revoke all on function public.set_brewery_typesafe_key(uuid, uuid, text, uuid),
  public.get_brewery_typesafe_key_status(uuid, uuid),
  public.read_brewery_typesafe_key(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_brewery_typesafe_key(uuid, uuid, text, uuid),
  public.get_brewery_typesafe_key_status(uuid, uuid),
  public.read_brewery_typesafe_key(uuid, uuid)
  to service_role;

-- The switch, copied from set_brewery_agents_enabled (20261105172415_brewery_agents_switch.sql).
-- It turns on only once a key is saved.
create function public.set_brewery_suggestions_enabled(p_brewery uuid, p_enabled boolean, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_enabled boolean;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_brewery_suggestions_enabled', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'enabled', p_enabled));
  if v_replay is not null then return v_replay; end if;
  if p_enabled and not exists (select 1 from private.brewery_typesafe_keys where brewery_id = p_brewery) then
    raise exception 'Save a TypeSafe key first.';
  end if;
  update public.breweries set suggestions_enabled = p_enabled where id = p_brewery returning suggestions_enabled into v_enabled;
  return private.complete_command_request(p_request_id, jsonb_build_object('enabled', v_enabled));
end $$;
revoke all on function public.set_brewery_suggestions_enabled(uuid, boolean, uuid) from public, anon;
grant execute on function public.set_brewery_suggestions_enabled(uuid, boolean, uuid) to authenticated;

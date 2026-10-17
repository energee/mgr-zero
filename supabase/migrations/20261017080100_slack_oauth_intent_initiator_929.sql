-- #929: both callback gates require the intent's initiating administrator,
-- who must still be an admin of its brewery. A different current admin must
-- begin their own intent. CREATE OR REPLACE preserves the service-only grants.

create or replace function public.find_chat_oauth_intent(p_state_hash text, p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then return null; end if;
  select * into r from public.chat_installations where oauth_intent_hash = p_state_hash;
  if not found or not exists (
    select 1 from public.brewery_users
    where brewery_id = r.brewery_id and user_id = p_actor and role = 'admin'
      and r.installer_user_id = p_actor
  ) then return null; end if;
  return jsonb_build_object(
    'installation_id', r.id, 'brewery_id', r.brewery_id, 'state', r.state, 'kind', r.oauth_intent_kind,
    'redirect_uri', r.oauth_redirect_uri, 'expires_at', r.oauth_expires_at, 'consumed_at', r.oauth_consumed_at,
    'external_installation_id', r.external_installation_id);
end $$;

create or replace function public.activate_chat_installation(
  p_installation uuid, p_state_hash text, p_redirect_uri text, p_external_installation_id text,
  p_external_enterprise_id text, p_display_label text, p_token_store_key text, p_granted_capabilities jsonb,
  p_actor uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations; v_key text := 'slack:installation:' || p_external_installation_id;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  if not exists (
    select 1 from public.brewery_users
    where brewery_id = r.brewery_id and user_id = p_actor and role = 'admin'
      and r.installer_user_id = p_actor
  ) then raise exception 'permission denied: brewery admin required' using errcode = '42501'; end if;
  if r.oauth_intent_hash is distinct from p_state_hash then raise exception 'oauth state mismatch'; end if;
  if r.oauth_consumed_at is not null then
    if r.state = 'active' and r.external_installation_id = p_external_installation_id
       and r.token_store_key = v_key then
      return jsonb_build_object('installation_id', r.id, 'replayed', true);
    end if;
    raise exception 'oauth state already used';
  end if;
  if r.oauth_expires_at < now() then raise exception 'oauth state expired'; end if;
  if r.oauth_redirect_uri is distinct from p_redirect_uri then raise exception 'oauth redirect mismatch'; end if;
  if r.oauth_intent_kind = 'reauthorize' and r.external_installation_id <> p_external_installation_id then
    raise exception 'reauthorization returned a different workspace';
  end if;
  if exists (select 1 from public.chat_installations
             where provider = r.provider and external_installation_id = p_external_installation_id
               and state <> 'disconnected' and id <> r.id) then
    raise exception 'workspace is already connected to another brewery';
  end if;
  update public.chat_installations
    set state = 'active', external_installation_id = p_external_installation_id,
        external_enterprise_id = p_external_enterprise_id, display_label = p_display_label,
        token_store_key = v_key, granted_capabilities = coalesce(p_granted_capabilities, '{}'),
        oauth_consumed_at = now(), installed_at = coalesce(installed_at, now()), disabled_at = null,
        last_failure_code = null, last_healthy_at = now(), last_health_checked_at = now(), updated_at = now()
    where id = r.id;
  return jsonb_build_object('installation_id', r.id, 'replayed', false);
end $$;

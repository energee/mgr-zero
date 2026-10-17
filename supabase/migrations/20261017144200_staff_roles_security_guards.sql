-- Preserve independently authored security fixes after the staff-role cutover.
-- #929 binds Slack lookup/activation to the original initiating current admin.
-- #640 never returns a tokenless seller-wide revoke target owned by another brewery.
-- Restate their exact guarded bodies with canonical array-role authorization;
-- committed role-cutover and sibling migrations remain immutable.

-- #929: both callback gates require the intent's initiating administrator,
-- who must still be an admin of its brewery. A different current admin must
-- begin their own intent. CREATE OR REPLACE preserves the service-only grants.

create or replace function public.find_chat_oauth_intent(p_state_hash text, p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then return null; end if;
  select * into r from public.chat_installations where oauth_intent_hash = p_state_hash;
  if not found or (r.installer_user_id is distinct from p_actor
      or not private.actor_has_staff_roles(r.brewery_id, p_actor, array['admin']::public.staff_role[])) then return null; end if;
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
  if (r.installer_user_id is distinct from p_actor
      or not private.actor_has_staff_roles(r.brewery_id, p_actor, array['admin']::public.staff_role[])) then raise exception 'permission denied: brewery admin required' using errcode = '42501'; end if;
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

-- #640: Square's merchant-id revoke terminates the seller's full application
-- authorization. An old unresolved disconnect must not revoke a replacement
-- connection in another brewery. Return no target in that case; the existing
-- disconnect reconciliation records unresolved and keeps the manual guidance.
-- https://developer.squareup.com/reference/square/o-auth-api/revoke-token

CREATE OR REPLACE FUNCTION public.begin_square_disconnect (
  p_brewery    uuid,
  p_connection uuid,
  p_actor      uuid,
  p_request_id uuid
)
  RETURNS TABLE (
    access_token  text,
    merchant_id   text,
    replay_result jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE request private.command_requests; connection public.pos_connections; token text; token_version bigint; next_version bigint; retry boolean;
  payload_hash bytea:=extensions.digest(jsonb_build_object('connectionId',p_connection)::text,'sha256');
BEGIN
  IF NOT private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=p_brewery FOR UPDATE;
  INSERT INTO private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash)
    VALUES(p_actor,p_brewery,p_request_id,'disconnect_square',payload_hash) ON CONFLICT(actor_id,request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
    IF request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'disconnect_square' OR request.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'request id was already used with a different payload' USING errcode='MG409'; END IF;
    IF request.result IS NOT NULL THEN RETURN QUERY SELECT null::text,null::text,request.result; RETURN; END IF;
    RAISE EXCEPTION 'Square disconnect is still being reconciled' USING errcode='MG409';
  END IF;
  UPDATE private.square_oauth_intents SET consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
    WHERE brewery_id=p_brewery AND exchange_state IN ('pending','exchanging');
  SELECT * INTO connection FROM public.pos_connections WHERE brewery_id=p_brewery AND id=p_connection AND state IN ('connected','recovery_required') FOR UPDATE;
  IF NOT FOUND OR connection.remote_revocation_state='pending' THEN RAISE EXCEPTION 'connection not available'; END IF;
  retry:=connection.state='recovery_required' AND connection.remote_revocation_state='unresolved';
  DELETE FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection
    RETURNING t.access_token,t.credential_version INTO token,token_version;
  IF token IS NULL AND NOT retry THEN RAISE EXCEPTION 'connection credential not available'; END IF;
  next_version:=greatest(connection.credential_version,coalesce(token_version,0))+1;
  UPDATE public.pos_connections SET state='recovery_required',remote_revocation_state='pending',
    last_error='Square authorization revocation is pending',credential_version=next_version,updated_at=now()
    WHERE brewery_id=p_brewery AND id=p_connection AND state IN ('connected','recovery_required');
  IF NOT FOUND THEN RAISE EXCEPTION 'connection not available'; END IF;
  INSERT INTO private.square_disconnects(actor_id,request_id,brewery_id,connection_id,credential_version)
    VALUES(p_actor,p_request_id,p_brewery,p_connection,next_version);
  RETURN QUERY SELECT token,CASE WHEN token IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.pos_connections current_owner
    WHERE current_owner.merchant_id=connection.merchant_id
      AND current_owner.brewery_id<>p_brewery AND current_owner.state='connected'
  ) THEN connection.merchant_id END,null::jsonb;
END $function$;

REVOKE ALL ON FUNCTION public.begin_square_disconnect(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_square_disconnect(uuid, uuid, uuid, uuid) TO postgres, service_role;
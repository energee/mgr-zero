-- Canonical trusted-actor membership predicate shared with service-only RPCs.
-- #870 creates the scalar implementation before #797 in migration order; this
-- independently runnable cutover replaces it with array overlap. No role aliases.
create or replace function private.actor_has_staff_roles(
  p_brewery uuid, p_actor uuid, p_roles public.staff_role[]
) returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.brewery_users
    where brewery_id = p_brewery and user_id = p_actor and roles && p_roles)
$$;
-- Only trusted outer definer owners invoke this helper. A caller cannot supply
-- an arbitrary actor directly through an application or service-role RPC.
revoke all on function private.actor_has_staff_roles(uuid, uuid, public.staff_role[])
  from public, anon, authenticated, service_role;

-- private.set_chat_quiet_hours
CREATE OR REPLACE FUNCTION private.set_chat_quiet_hours(p_brewery uuid, p_user uuid, p_start time without time zone, p_end time without time zone, p_timezone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.actor_has_staff_roles(p_brewery, p_user, array['admin','sales','warehouse','brewer']::public.staff_role[]) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if (p_start is null) <> (p_end is null) or p_start = p_end or p_start >= time '24:00' or p_end >= time '24:00'
    or (p_timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name=p_timezone)) then
    raise exception 'invalid quiet hours' using errcode = '22023';
  end if;
  insert into public.notification_preferences (brewery_id,user_id,reason,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,use_brewery_timezone)
  select p_brewery,p_user,r,p_start,p_end,p_timezone,p_timezone is null
    from unnest(array['submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question','operations_digest']) r
  on conflict (brewery_id,user_id,reason) do update set quiet_hours_start=excluded.quiet_hours_start,
    quiet_hours_end=excluded.quiet_hours_end,quiet_hours_timezone=excluded.quiet_hours_timezone,
    use_brewery_timezone=excluded.use_brewery_timezone,updated_at=now();
  update public.notification_deliveries d set next_attempt_at=greatest(d.next_attempt_at,
    public.chat_quiet_release(now(),coalesce(p_start,i.quiet_hours_start),coalesce(p_end,i.quiet_hours_end),
      coalesce(p_timezone,i.quiet_hours_timezone,b.timezone))),updated_at=now()
    from public.notification_destinations dst,public.chat_installations i,public.breweries b
    where dst.id=d.destination_id and dst.user_id=p_user and d.brewery_id=p_brewery
      and i.id=d.installation_id and b.id=p_brewery and d.state in ('queued','retrying');
end $function$;

-- private.snooze_chat_delivery
CREATE OR REPLACE FUNCTION private.snooze_chat_delivery(p_brewery uuid, p_user uuid, p_delivery uuid, p_until timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.actor_has_staff_roles(p_brewery, p_user, array['admin','sales','warehouse','brewer']::public.staff_role[]) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'snooze must be within the next seven days' using errcode='22023';
  end if;
  update public.notification_deliveries d set next_attempt_at=greatest(d.next_attempt_at,p_until),
    state='queued',lease_expires_at=null,updated_at=now()
    from public.notification_destinations dst, public.chat_installations i, public.chat_user_links l, public.notification_occurrences o
    where d.id=p_delivery and d.brewery_id=p_brewery and dst.id=d.destination_id and dst.user_id=p_user
      and dst.kind='personal' and dst.state='active' and i.id=d.installation_id and i.state='active'
      and l.installation_id=i.id and l.user_id=p_user and l.state='active'
      and o.id=d.occurrence_id and o.state='active'
      and exists (
        select 1 from public.scan_chat_today_candidates(p_brewery,now()) c
          join public.brewery_users bu on bu.brewery_id=c.brewery_id and bu.user_id=p_user
          where c.reason=o.reason and c.subject_type=o.subject_type and c.subject_id=o.subject_id and c.source_version=o.source_version
            and ('admin'=any(bu.roles) or (bu.roles::text[] && c.recipient_roles and (c.assigned_user_id is null or c.assigned_user_id=p_user))));
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
end $function$;

-- private.supersede_square_publications
CREATE OR REPLACE FUNCTION private.supersede_square_publications(p_connection uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_connection public.pos_connections; v_attempt private.square_publications;
  v_menu private.square_menu_publications; v_token_version bigint; v_code text; v_result jsonb;
BEGIN
  SELECT * INTO v_connection FROM public.pos_connections WHERE id=p_connection FOR SHARE;
  SELECT credential_version INTO v_token_version FROM private.integration_tokens
    WHERE provider='square' AND connection_id=p_connection FOR SHARE;
  FOR v_attempt IN SELECT * FROM private.square_publications p WHERE p.connection_id=p_connection
    AND p.status IN ('needs_snapshot','prepared') AND (
      v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS DISTINCT FROM v_connection.credential_version
      OR p.credential_version<>v_connection.credential_version OR p.catalog_generation<>v_connection.catalog_sync_generation
      OR NOT private.actor_has_staff_roles(p.brewery_id, p.actor_id, ARRAY['admin','warehouse']::public.staff_role[]))
    FOR UPDATE
  LOOP
    v_code:=CASE WHEN NOT private.actor_has_staff_roles(v_attempt.brewery_id, v_attempt.actor_id, ARRAY['admin','warehouse']::public.staff_role[]) THEN 'role_changed'
      WHEN v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS NULL THEN 'connection_changed'
      WHEN v_attempt.credential_version<>v_connection.credential_version OR v_token_version<>v_connection.credential_version THEN 'credential_changed'
      ELSE 'catalog_changed' END;
    v_result:=jsonb_build_object('published',false,'superseded',true,'errorCode',v_code);
    UPDATE private.square_publications SET status='superseded',error_code=v_code,result=v_result,finished_at=now()
      WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  END LOOP;
  FOR v_menu IN SELECT * FROM private.square_menu_publications p WHERE p.connection_id=p_connection
    AND p.status='publishing' AND (
      v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS DISTINCT FROM v_connection.credential_version
      OR p.credential_version<>v_connection.credential_version OR p.catalog_generation<>v_connection.catalog_sync_generation
      OR NOT private.actor_has_staff_roles(p.brewery_id, p.actor_id, ARRAY['admin','warehouse']::public.staff_role[]))
    FOR UPDATE
  LOOP
    v_code:=CASE WHEN NOT private.actor_has_staff_roles(v_menu.brewery_id, v_menu.actor_id, ARRAY['admin','warehouse']::public.staff_role[]) THEN 'role_changed'
      WHEN v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS NULL THEN 'connection_changed'
      WHEN v_menu.credential_version<>v_connection.credential_version OR v_token_version<>v_connection.credential_version THEN 'credential_changed'
      ELSE 'catalog_changed' END;
    v_result:=jsonb_build_object('published',false,'superseded',true,'errorCode',v_code);
    UPDATE private.square_menu_publications SET status='superseded',result=v_result,finished_at=now() WHERE id=v_menu.id;
    PERFORM private.complete_command_request_for(v_menu.actor_id,v_menu.request_id,private.square_menu_publication_state(v_menu.id));
  END LOOP;
END $function$;

-- public.activate_chat_installation
CREATE OR REPLACE FUNCTION public.activate_chat_installation(p_installation uuid, p_state_hash text, p_redirect_uri text, p_external_installation_id text, p_external_enterprise_id text, p_display_label text, p_token_store_key text, p_granted_capabilities jsonb, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.chat_installations; v_key text := 'slack:installation:' || p_external_installation_id;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  if not private.actor_has_staff_roles(r.brewery_id, p_actor, array['admin']::public.staff_role[]) then raise exception 'permission denied: brewery admin required' using errcode = '42501'; end if;
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
end $function$;

-- public.advance_square_catalog_sync
CREATE OR REPLACE FUNCTION public.advance_square_catalog_sync(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_next_version bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE private.square_catalog_syncs a SET credential_version=p_next_version
    WHERE a.brewery_id=p_brewery AND a.connection_id=p_connection AND a.actor_id=p_actor AND a.request_id=p_request_id
      AND a.credential_version=p_expected_version AND p_next_version>p_expected_version
      AND private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[])
      AND EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
        ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
        WHERE c.brewery_id=p_brewery AND c.id=p_connection AND c.merchant_id=a.merchant_id AND c.state='connected'
          AND c.credential_version=p_next_version AND c.catalog_sync_generation<a.catalog_generation
          AND t.credential_version=p_next_version
          AND NOT EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
            WHERE newer.connection_id=a.connection_id AND newer.catalog_generation>a.catalog_generation));
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $function$;

-- public.advance_square_sales_sync
CREATE OR REPLACE FUNCTION public.advance_square_sales_sync(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_next_version bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE private.square_sales_syncs a SET credential_version=p_next_version
  WHERE a.actor_id=p_actor AND a.request_id=p_request_id AND a.brewery_id=p_brewery AND a.connection_id=p_connection
    AND a.credential_version=p_expected_version AND a.status='in_progress'
    AND private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[])
    AND EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.credential_version=p_next_version
        AND t.credential_version=p_next_version)
  RETURNING true
$function$;

-- public.begin_qbo_disconnect
CREATE OR REPLACE FUNCTION public.begin_qbo_disconnect(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid)
 RETURNS TABLE(refresh_token text, replay_result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_token text; v_version bigint; v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState','unresolved');
begin
 if not private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]) then raise exception 'permission denied'; end if;
 v_replay:=private.claim_command_request_for(p_actor,p_brewery,'disconnect_qbo',p_request_id,jsonb_build_object('connectionId',p_connection));
 if v_replay is not null then return query select null::text,v_replay; return; end if;
 update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
 where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
 delete from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
 returning t.refresh_token,t.credential_version into v_token,v_version;
 update public.qbo_connections q set state='disconnected',remote_revocation_state='unresolved',
   credential_version=greatest(q.credential_version,coalesce(v_version,q.credential_version))+1,
   updated_at=now()
 where q.brewery_id=p_brewery and q.id=p_connection and q.state in ('connected','recovery_required');
 if not found then raise exception 'connection not available'; end if;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(p_brewery,p_connection,'disconnected');
 perform private.complete_command_request_for(p_actor,p_request_id,v_result);
 return query select v_token,null::jsonb;
end $function$;

-- public.begin_square_disconnect
CREATE OR REPLACE FUNCTION public.begin_square_disconnect(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid)
 RETURNS TABLE(access_token text, merchant_id text, replay_result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE request private.command_requests; connection public.pos_connections; token text; token_version bigint; next_version bigint; retry boolean;
  payload_hash bytea:=extensions.digest(jsonb_build_object('connectionId',p_connection)::text,'sha256');
BEGIN
  IF NOT private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
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
  RETURN QUERY SELECT token,CASE WHEN token IS NULL THEN connection.merchant_id END,null::jsonb;
END $function$;

-- public.cas_integration_tokens
CREATE OR REPLACE FUNCTION public.cas_integration_tokens(p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid, p_expected_version bigint, p_access_token text, p_refresh_token text, p_received_at timestamp with time zone, p_access_seconds integer, p_refresh_seconds integer, p_hard_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_version bigint;
BEGIN
  IF p_provider='square' THEN
    PERFORM 1 FROM public.pos_connections p WHERE p.brewery_id=p_brewery AND p.id=p_connection
      AND p.state='connected' AND p.credential_version=p_expected_version FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  UPDATE private.integration_tokens t SET access_token=p_access_token,refresh_token=p_refresh_token,
    credential_version=credential_version+1,updated_at=now()
  WHERE t.brewery_id=p_brewery AND t.provider=p_provider AND t.connection_id=p_connection AND t.credential_version=p_expected_version
    AND private.actor_has_staff_roles(p_brewery, p_actor, case p_provider
      when 'square' then array['admin','warehouse']::public.staff_role[]
      when 'qbo' then array['admin','sales']::public.staff_role[] end)
    AND ((p_provider='qbo' AND EXISTS(SELECT 1 FROM public.qbo_connections q WHERE q.brewery_id=p_brewery AND q.id=p_connection AND q.state='connected'))
      OR (p_provider='square' AND EXISTS(SELECT 1 FROM public.pos_connections p WHERE p.brewery_id=p_brewery AND p.id=p_connection AND p.state='connected')))
  RETURNING credential_version INTO v_version;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_provider='qbo' THEN
    UPDATE public.qbo_connections SET access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),
      refresh_expires_at=CASE WHEN p_refresh_seconds IS NULL THEN null ELSE p_received_at+make_interval(secs=>p_refresh_seconds) END,
      refresh_hard_expires_at=CASE WHEN p_hard_seconds IS NULL THEN refresh_hard_expires_at ELSE p_received_at+make_interval(secs=>p_hard_seconds) END,
      credential_version=v_version,updated_at=now() WHERE brewery_id=p_brewery AND id=p_connection;
  ELSE
    UPDATE public.pos_connections SET access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),credential_version=v_version,updated_at=now()
      WHERE brewery_id=p_brewery AND id=p_connection AND provider='square';
    PERFORM private.supersede_square_publications(p_connection);
  END IF;
  RETURN true;
END $function$;

-- public.chat_settings_request_completed
CREATE OR REPLACE FUNCTION public.chat_settings_request_completed(p_brewery uuid, p_user uuid, p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() is distinct from 'service_role' or not private.actor_has_staff_roles(p_brewery, p_user, array['admin']::public.staff_role[]) then raise exception 'permission denied' using errcode='42501'; end if;
  return exists(select 1 from private.command_requests
    where actor_id=p_user and request_id=p_request_id and command_name='set_notification_destination' and result is not null);
end $function$;

-- public.claim_qbo_oauth
CREATE OR REPLACE FUNCTION public.claim_qbo_oauth(p_state_hash text, p_actor uuid, p_brewery uuid, p_redirect_uri text)
 RETURNS TABLE(intent_id uuid, brewery_id uuid, provider_intent text, requested_scopes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 return query update private.qbo_oauth_intents i set consumed_at=now(),exchange_state='exchanging'
 where i.state_hash=p_state_hash and i.actor_id=p_actor and i.brewery_id=p_brewery and i.redirect_uri=p_redirect_uri
   and i.consumed_at is null and i.exchange_state='pending' and i.expires_at>=now()
   and private.actor_has_staff_roles(i.brewery_id, p_actor, array['admin']::public.staff_role[])
 returning i.id,i.brewery_id,i.provider_intent,i.requested_scopes;
end $function$;

-- public.claim_square_oauth
CREATE OR REPLACE FUNCTION public.claim_square_oauth(p_state_hash text, p_actor uuid, p_brewery uuid, p_redirect_uri text)
 RETURNS TABLE(intent_id uuid, brewery_id uuid, provider_intent text, requested_scopes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY UPDATE private.square_oauth_intents i SET consumed_at=now(),exchange_state='exchanging'
    WHERE i.state_hash=p_state_hash AND i.actor_id=p_actor AND i.brewery_id=p_brewery AND i.redirect_uri=p_redirect_uri
      AND i.consumed_at IS NULL AND i.exchange_state='pending' AND i.expires_at>=now()
      AND private.actor_has_staff_roles(i.brewery_id, p_actor, array['admin']::public.staff_role[])
      AND NOT EXISTS(SELECT 1 FROM public.pos_connections c WHERE c.brewery_id=i.brewery_id AND c.provider='square' AND c.remote_revocation_state='pending')
      AND NOT EXISTS(SELECT 1 FROM private.square_oauth_intents cleanup WHERE cleanup.brewery_id=i.brewery_id AND cleanup.cleanup_state='pending')
    RETURNING i.id,i.brewery_id,i.provider_intent,i.requested_scopes;
END $function$;

-- public.complete_qbo_invoice_sync
CREATE OR REPLACE FUNCTION public.complete_qbo_invoice_sync(p_brewery uuid, p_actor uuid, p_request_id uuid, p_connection uuid, p_realm text, p_observations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_batch private.qbo_invoice_sync_batches; v_request private.command_requests;
  v_target jsonb; v_observation jsonb; v_inv public.invoices; v_push public.qbo_pushes;
  v_entity_type text; v_state text; v_drift boolean; v_paid boolean; v_cash int;
  v_synced int:=0; v_paid_count int:=0; v_voided int:=0; v_deleted int:=0; v_drifted int:=0; v_result jsonb;
begin
  if p_actor is null or not private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','sales']::public.staff_role[]) then
    raise insufficient_privilege using message='permission denied';
  end if;
  perform 1 from public.qbo_connections where brewery_id=p_brewery and id=p_connection
    and realm_id=p_realm and state='connected' for share;
  if not found then raise exception 'QuickBooks connection changed' using errcode='MG409'; end if;
  select * into v_request from private.command_requests
    where actor_id=p_actor and request_id=p_request_id for update;
  if not found or v_request.brewery_id is distinct from p_brewery or v_request.command_name<>'sync_qbo_payments'
    then raise exception 'QuickBooks sync request changed' using errcode='MG409'; end if;
  if v_request.result is not null then return v_request.result; end if;
  select * into v_batch from private.qbo_invoice_sync_batches
    where actor_id=p_actor and request_id=p_request_id for update;
  if not found or v_batch.brewery_id<>p_brewery or v_batch.connection_id<>p_connection or v_batch.realm_id<>p_realm
    then raise exception 'QuickBooks sync request changed' using errcode='MG409'; end if;
  if jsonb_typeof(p_observations)<>'array'
     or jsonb_array_length(p_observations)<>jsonb_array_length(v_batch.targets)
     or exists(select 1 from jsonb_array_elements(p_observations) o
       where (select count(*) from jsonb_array_elements(v_batch.targets) t
         where t->>'invoiceId'=o->>'invoiceId' and t->>'remoteId'=o->>'remoteId')<>1)
     or exists(select 1 from jsonb_array_elements(v_batch.targets) t
       where (select count(*) from jsonb_array_elements(p_observations) o
         where o->>'invoiceId'=t->>'invoiceId' and o->>'remoteId'=t->>'remoteId')<>1)
    then raise exception 'QuickBooks sync observations changed' using errcode='MG409'; end if;

  -- Lock all targets in deterministic order before applying any observation.
  perform 1 from public.invoices i join jsonb_array_elements(v_batch.targets) t
    on i.id=(t->>'invoiceId')::uuid and i.brewery_id=p_brewery order by i.id for update of i;
  for v_target in select value from jsonb_array_elements(v_batch.targets) order by value->>'invoiceId' loop
    select value into v_observation from jsonb_array_elements(p_observations)
      where value->>'invoiceId'=v_target->>'invoiceId' and value->>'remoteId'=v_target->>'remoteId';
    -- Only an absent field belongs to the invoice-only legacy contract.
    v_entity_type:=case when v_target ? 'entityType' then v_target->>'entityType' else 'Invoice' end;
    if v_entity_type is null or v_entity_type not in ('Invoice','CreditMemo') then
      raise exception 'invalid QuickBooks sync entity type';
    end if;
    select * into v_inv from public.invoices where id=(v_target->>'invoiceId')::uuid and brewery_id=p_brewery;
    select * into v_push from public.qbo_pushes where id=(v_target->>'pushId')::uuid and brewery_id=p_brewery
      and invoice_id=v_inv.id and connection_id=p_connection and realm_id=p_realm and status='pushed'
      and qbo_entity_id=v_target->>'remoteId' and entity_type=v_entity_type;
    if v_inv.id is null or v_push.id is null
       or v_entity_type is distinct from (case v_inv.kind when 'invoice' then 'Invoice' else 'CreditMemo' end) or v_inv.qbo_invoice_id is distinct from v_target->>'remoteId'
       or v_inv.qbo_sync_generation is distinct from (v_target->>'generation')::bigint then
      raise exception 'QuickBooks invoice identity changed' using errcode='MG409';
    end if;
    v_state:=v_observation->>'remoteState';
    if v_state is null or v_state not in ('live','voided','deleted')
      or (v_entity_type='CreditMemo' and v_state='voided') then raise exception 'invalid QuickBooks invoice state'; end if;
    v_drift:=false;
    if v_state='live' then
      v_drift:=not (v_observation->>'contentMatches')::boolean
        or (v_push.response ? 'TotalAmt' and round((v_push.response->>'TotalAmt')::numeric*100)::int
          is distinct from (v_observation->>'totalCents')::int)
        or (v_push.response ? 'TotalTax' and round((v_push.response->>'TotalTax')::numeric*100)::int
          is distinct from (v_observation->>'taxCents')::int);
    end if;
    v_cash:=(v_observation->>'cashCollectedCents')::int;
    if v_entity_type='CreditMemo' and (v_cash is distinct from 0 or v_observation->>'paidAt' is not null) then
      raise exception 'invalid QuickBooks credit cash evidence';
    end if;
    if v_cash<0 or v_cash>coalesce((v_observation->>'totalCents')::int,0) then
      raise exception 'invalid QuickBooks cash evidence';
    end if;
    v_paid:=v_entity_type='Invoice' and v_state='live' and v_cash>0
      and (v_observation->>'balanceCents')::int=0 and (v_observation->>'totalCents')::int>0;
    update public.invoices set qbo_remote_state=v_state::public.qbo_remote_state,
      qbo_sync_token=v_observation->>'syncToken',
      qbo_tax_cents=case when v_observation->'taxCents'='null'::jsonb then null else (v_observation->>'taxCents')::int end,
      qbo_total_cents=case when v_observation->'totalCents'='null'::jsonb then null else (v_observation->>'totalCents')::int end,
      -- Credit availability is not the invoice balance consumed by staff payment views.
      qbo_balance_cents=case when v_entity_type='CreditMemo' or v_observation->'balanceCents'='null'::jsonb then null else (v_observation->>'balanceCents')::int end,
      qbo_cash_collected_cents=case when v_entity_type='Invoice' and v_state='live' then v_cash else qbo_cash_collected_cents end,
      qbo_accountant_drift=v_drift,
      paid_at=case when v_entity_type='CreditMemo' then paid_at when v_paid then coalesce(paid_at,nullif(v_observation->>'paidAt','')::timestamptz,now())
        when v_state='live' then null else paid_at end
      where id=v_inv.id and brewery_id=p_brewery;
    v_synced:=v_synced+1;
    v_paid_count:=v_paid_count+v_paid::int;
    v_voided:=v_voided+(v_state='voided')::int;
    v_deleted:=v_deleted+(v_state='deleted')::int;
    v_drifted:=v_drifted+v_drift::int;
  end loop;
  v_result:=jsonb_build_object('synced',v_synced,'paid',v_paid_count,'voided',v_voided,'deleted',v_deleted,'drifted',v_drifted);
  perform private.complete_command_request_for(p_actor,p_request_id,v_result);
  update private.qbo_invoice_sync_batches set completed_at=now(), targets='[]'::jsonb
    where actor_id=p_actor and request_id=p_request_id;
  return v_result;
end $function$;

-- public.complete_qbo_oauth
CREATE OR REPLACE FUNCTION public.complete_qbo_oauth(p_intent uuid, p_actor uuid, p_realm_id text, p_realm_label text, p_access_token text, p_refresh_token text, p_received_at timestamp with time zone, p_access_seconds integer, p_refresh_seconds integer, p_hard_seconds integer, p_granted_scopes text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i private.qbo_oauth_intents; v_id uuid:=private.new_uuid(); v_version bigint; v_scopes text[];
begin
 select * into i from private.qbo_oauth_intents where id=p_intent for update;
 if i.id is null or i.actor_id<>p_actor or i.exchange_state<>'exchanging' or not private.actor_has_staff_roles(i.brewery_id, p_actor, array['admin']::public.staff_role[]) then raise exception 'oauth state invalid'; end if;
 if p_granted_scopes is not null and not p_granted_scopes<@i.requested_scopes then raise exception 'oauth scopes invalid'; end if;
 v_scopes:=coalesce(p_granted_scopes,i.requested_scopes);
 perform 1 from private.integration_tokens where brewery_id=i.brewery_id and provider='qbo' for update;
 insert into public.qbo_connections(id,brewery_id,realm_id,realm_label,state,access_expires_at,refresh_expires_at,refresh_hard_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
 values(v_id,i.brewery_id,p_realm_id,p_realm_label,'connected',p_received_at+make_interval(secs=>p_access_seconds),case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,case when p_hard_seconds is null then null else p_received_at+make_interval(secs=>p_hard_seconds) end,'not_requested',null,1,p_actor,now(),v_scopes)
 on conflict(brewery_id) do update set id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.id else excluded.id end,realm_id=excluded.realm_id,realm_label=excluded.realm_label,state='connected',access_expires_at=excluded.access_expires_at,refresh_expires_at=excluded.refresh_expires_at,refresh_hard_expires_at=excluded.refresh_hard_expires_at,remote_revocation_state='not_requested',last_error=null,
   qbo_deposit_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_deposit_item_id end,
   qbo_one_way_fee_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_one_way_fee_item_id end,
   granted_scopes=excluded.granted_scopes,credential_version=qbo_connections.credential_version+1,connected_by=p_actor,updated_at=now()
 returning id,credential_version into v_id,v_version;
 insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
 values(i.brewery_id,'qbo',v_id,p_access_token,p_refresh_token,v_version)
 on conflict(brewery_id,provider) do update set connection_id=excluded.connection_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
 update private.qbo_oauth_intents set exchange_state='completed' where id=i.id;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(i.brewery_id,v_id,'connected'); return v_id;
end $function$;

-- public.complete_square_oauth
CREATE OR REPLACE FUNCTION public.complete_square_oauth(p_intent uuid, p_actor uuid, p_merchant_id text, p_merchant_label text, p_access_token text, p_refresh_token text, p_access_expires_at timestamp with time zone, p_granted_scopes text[], p_locations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE i private.square_oauth_intents; c public.pos_connections; v_id uuid:=private.new_uuid(); v_version bigint;
  v_sync_result jsonb:=jsonb_build_object('synced',false,'superseded',true,'errorCode','connection_changed');
BEGIN
  SELECT brewery_id INTO i.brewery_id FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'oauth state invalid'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=i.brewery_id FOR UPDATE;
  SELECT * INTO i FROM private.square_oauth_intents WHERE id=p_intent FOR UPDATE;
  IF i.id IS NULL OR i.actor_id<>p_actor OR i.exchange_state<>'exchanging'
    OR NOT private.actor_has_staff_roles(i.brewery_id, p_actor, array['admin']::public.staff_role[]) THEN
    RAISE EXCEPTION 'oauth state invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections current_connection WHERE current_connection.provider='square'
      AND current_connection.remote_revocation_state='pending'
      AND (current_connection.brewery_id=i.brewery_id OR current_connection.merchant_id=p_merchant_id))
    OR EXISTS(SELECT 1 FROM private.square_oauth_intents pending WHERE pending.id<>i.id AND pending.cleanup_state='pending'
      AND (pending.brewery_id=i.brewery_id OR pending.cleanup_merchant_id=p_merchant_id)) THEN
    RAISE EXCEPTION 'Square authorization cleanup is still pending' USING errcode='MG409';
  END IF;
  IF p_merchant_id IS NULL OR btrim(p_merchant_id)='' OR p_access_token IS NULL OR p_refresh_token IS NULL
    OR p_granted_scopes IS NULL OR NOT p_granted_scopes<@i.requested_scopes OR jsonb_typeof(p_locations)<>'array' THEN
    RAISE EXCEPTION 'oauth response invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections x WHERE x.merchant_id=p_merchant_id AND x.brewery_id<>i.brewery_id AND x.state='connected') THEN
    RAISE EXCEPTION 'Square seller is already connected to another brewery' USING errcode='MG409';
  END IF;
  SELECT current_connection.id,current_connection.merchant_id INTO c.id,c.merchant_id
    FROM public.pos_connections current_connection WHERE current_connection.brewery_id=i.brewery_id
      AND current_connection.provider='square';
  IF c.id IS NOT NULL THEN
    PERFORM 1 FROM private.command_requests request
      JOIN private.square_catalog_syncs sync ON sync.actor_id=request.actor_id AND sync.request_id=request.request_id
      WHERE sync.connection_id=c.id AND request.result IS NULL
      ORDER BY request.actor_id,request.request_id FOR UPDATE OF request;
    UPDATE private.command_requests request SET result=v_sync_result
      FROM private.square_catalog_syncs sync
      WHERE sync.actor_id=request.actor_id AND sync.request_id=request.request_id
        AND sync.connection_id=c.id AND request.result IS NULL;
  END IF;
  SELECT * INTO c FROM public.pos_connections WHERE brewery_id=i.brewery_id AND provider='square' FOR UPDATE;
  IF c.id IS NOT NULL AND c.merchant_id IS DISTINCT FROM p_merchant_id THEN
    IF EXISTS(SELECT 1 FROM public.pos_sales WHERE connection_id=c.id)
      OR EXISTS(SELECT 1 FROM public.pos_sales_coverage WHERE connection_id=c.id) THEN
      RAISE EXCEPTION 'Square seller cannot be replaced while retained sales history exists' USING errcode='MG409';
    END IF;
    EXECUTE $cleanup$UPDATE private.square_publications SET status='superseded',error_code='connection_changed',
      result=jsonb_build_object('published',false,'superseded',true,'errorCode','connection_changed'),finished_at=now()
      WHERE connection_id=$1 AND status IN ('needs_snapshot','prepared')$cleanup$ USING c.id;
    EXECUTE $cleanup$UPDATE private.square_menu_publications SET status='superseded',
      result=jsonb_build_object('published',false,'superseded',true,'errorCode','connection_changed'),finished_at=now()
      WHERE connection_id=$1 AND status='publishing'$cleanup$ USING c.id;
    EXECUTE 'DELETE FROM public.pos_catalog_ownership WHERE connection_id=$1' USING c.id;
    EXECUTE 'DELETE FROM public.pos_catalog_items WHERE connection_id=$1' USING c.id;
    DELETE FROM public.pos_menus WHERE connection_id=c.id;
    DELETE FROM public.pos_item_mappings WHERE connection_id=c.id;
    DELETE FROM public.pos_catalog_variations WHERE connection_id=c.id;
    DELETE FROM public.pos_locations WHERE connection_id=c.id;
  END IF;
  IF c.id IS NOT NULL THEN
    UPDATE private.command_requests request SET result=v_sync_result
      FROM private.square_catalog_syncs sync
      WHERE sync.actor_id=request.actor_id AND sync.request_id=request.request_id
        AND sync.connection_id=c.id AND request.result IS NULL;
  END IF;
  INSERT INTO public.pos_connections(id,brewery_id,provider,merchant_id,merchant_label,state,access_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
    VALUES(v_id,i.brewery_id,'square',p_merchant_id,p_merchant_label,'connected',p_access_expires_at,'not_requested',null,1,p_actor,now(),p_granted_scopes)
  ON CONFLICT(brewery_id,provider) DO UPDATE SET merchant_id=excluded.merchant_id,merchant_label=excluded.merchant_label,state='connected',
    access_expires_at=excluded.access_expires_at,remote_revocation_state='not_requested',last_error=null,
    credential_version=pos_connections.credential_version+1,
    catalog_sync_generation=CASE WHEN pos_connections.merchant_id IS DISTINCT FROM excluded.merchant_id THEN 0 ELSE pos_connections.catalog_sync_generation END,
    connected_by=p_actor,updated_at=now(),granted_scopes=excluded.granted_scopes
  RETURNING id,credential_version INTO v_id,v_version;
  INSERT INTO private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    VALUES(i.brewery_id,'square',v_id,p_access_token,p_refresh_token,v_version)
  ON CONFLICT(brewery_id,provider) DO UPDATE SET connection_id=excluded.connection_id,access_token=excluded.access_token,
    refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
  INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
    SELECT i.brewery_id,v_id,x.id,x.name,x.status,true,now()
    FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text)
    WHERE x.id IS NOT NULL AND btrim(x.id)<>''
  ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
    external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
  UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=v_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text) WHERE x.id=l.external_location_id);
  UPDATE private.square_oauth_intents SET exchange_state='completed' WHERE id=i.id;
  RETURN v_id;
END $function$;

-- public.find_chat_oauth_intent
CREATE OR REPLACE FUNCTION public.find_chat_oauth_intent(p_state_hash text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then return null; end if;
  select * into r from public.chat_installations where oauth_intent_hash = p_state_hash;
  if not found or not private.actor_has_staff_roles(r.brewery_id, p_actor, array['admin']::public.staff_role[]) then return null; end if;
  return jsonb_build_object(
    'installation_id', r.id, 'brewery_id', r.brewery_id, 'state', r.state, 'kind', r.oauth_intent_kind,
    'redirect_uri', r.oauth_redirect_uri, 'expires_at', r.oauth_expires_at, 'consumed_at', r.oauth_consumed_at,
    'external_installation_id', r.external_installation_id);
end $function$;

-- public.finish_qbo_disconnect
CREATE OR REPLACE FUNCTION public.finish_qbo_disconnect(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_revoked boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState',case when p_revoked then 'confirmed' else 'unresolved' end);
begin
 update public.qbo_connections q set remote_revocation_state=case when p_revoked then 'confirmed' else 'unresolved' end,last_error=case when p_revoked then null else 'Remote revocation could not be confirmed' end,updated_at=now()
 where q.brewery_id=p_brewery and q.id=p_connection and q.state='disconnected' and private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]);
 if not found then raise exception 'disconnect reconciliation is not available'; end if;
 if not p_revoked then insert into private.qbo_connection_events(brewery_id,connection_id,kind,detail) values(p_brewery,p_connection,'remote_revocation_unresolved','Remote revocation could not be confirmed'); end if;
 return private.complete_command_request_for(p_actor,p_request_id,v_result);
end
$function$;

-- public.finish_qbo_push
CREATE OR REPLACE FUNCTION public.finish_qbo_push(p_brewery uuid, p_push uuid, p_actor uuid, p_status text, p_qbo_entity_id text, p_error text, p_response jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_push public.qbo_pushes; v_replay jsonb; v_result jsonb;
begin
  if not private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','sales']::public.staff_role[])
    then raise insufficient_privilege using message='permission denied'; end if;
  select * into v_push from public.qbo_pushes where id=p_push and brewery_id=p_brewery for update;
  if not found then raise exception 'QuickBooks push not found'; end if;
  perform 1 from public.qbo_connections
    where brewery_id=p_brewery and id=v_push.connection_id and realm_id=v_push.realm_id and state='connected'
    for share;
  if not found then raise exception 'QuickBooks connection changed; pending push remains frozen and cannot be finalized by another connection' using errcode='MG409'; end if;
  if p_request_id<>v_push.finish_request_id then raise exception 'invalid QuickBooks finish identity' using errcode='MG409'; end if;
  if p_status not in ('pushed','push_failed') then raise exception 'invalid QuickBooks push result'; end if;
  if p_status='pushed' and nullif(btrim(p_qbo_entity_id),'') is null then raise exception 'QuickBooks entity id required'; end if;
  v_replay:=private.claim_command_request_for(p_actor,p_brewery,'finish_qbo_push',p_request_id,
    jsonb_build_object('pushId',p_push,'status',p_status,'remoteId',p_qbo_entity_id,'error',p_error,'response',p_response));
  if v_replay is not null then return v_replay; end if;
  if v_push.status<>'pending' then raise exception 'QuickBooks push is already finished' using errcode='MG409'; end if;
  update public.qbo_pushes set status=p_status::public.qbo_sync_status,qbo_entity_id=p_qbo_entity_id,
    response=p_response,error=left(p_error,500),finished_at=now() where id=p_push;
  if p_status='pushed' then
    update public.invoices set qbo_invoice_id=p_qbo_entity_id,qbo_sync_status='pushed',qbo_sync_error=null,
      qbo_sync_token=p_response->>'SyncToken',qbo_remote_state='live',qbo_accountant_drift=false,
      qbo_tax_cents=case when p_response ? 'TotalTax' then round((p_response->>'TotalTax')::numeric*100)::int end,
      qbo_total_cents=case when p_response ? 'TotalAmt' then round((p_response->>'TotalAmt')::numeric*100)::int end,
      qbo_balance_cents=case when p_response ? 'Balance' then round((p_response->>'Balance')::numeric*100)::int end
      where id=v_push.invoice_id and brewery_id=p_brewery;
  else
    update public.invoices set qbo_sync_status='push_failed',qbo_sync_error=left(p_error,500)
      where id=v_push.invoice_id and brewery_id=p_brewery;
  end if;
  v_result:=jsonb_build_object('pushId',p_push,'status',p_status,'remoteId',p_qbo_entity_id);
  return private.complete_command_request_for(p_actor,p_request_id,v_result);
end $function$;

-- public.finish_square_menu_publication
CREATE OR REPLACE FUNCTION public.finish_square_menu_publication(p_brewery uuid, p_publication uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_menu_publications; v_child private.square_publications;
  v_result jsonb; v_items jsonb; v_error text; v_partial boolean;
BEGIN
  IF NOT private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_menu_publications
    WHERE id=p_publication AND brewery_id=p_brewery AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_menu_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.manifest) e JOIN private.square_publications p
    ON p.actor_id=v_attempt.actor_id AND p.request_id=(e->>'requestId')::uuid
      AND p.menu_publication_id=v_attempt.id WHERE p.status='rejected') THEN
    SELECT p.error_code INTO v_error FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
      JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
        AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id
      WHERE p.status='rejected' ORDER BY x.ord LIMIT 1;
    FOR v_child IN
      UPDATE private.square_publications SET status='superseded',error_code='menu_rejected',
        result=jsonb_build_object('published',false,'superseded',true,'errorCode','menu_rejected'),finished_at=now()
      WHERE menu_publication_id=v_attempt.id AND status IN ('needs_snapshot','prepared') RETURNING *
    LOOP
      PERFORM private.complete_command_request_for(v_child.actor_id,v_child.request_id,
        private.square_publication_state(v_child.id));
    END LOOP;
    SELECT coalesce(jsonb_agg(jsonb_build_object('brandId',x.e->>'brandId','requestId',x.e->>'requestId',
      'status',coalesce(p.status,'not_attempted'),'result',p.result) ORDER BY x.ord),'[]'::jsonb),
      coalesce(bool_or(p.status='succeeded'),false) INTO v_items,v_partial
    FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
    LEFT JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
      AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id;
    v_result:=jsonb_build_object('published',false,'rejected',true,'partial',v_partial,
      'errorCode',v_error,'items',v_items);
    UPDATE private.square_menu_publications SET status='rejected',error_code=v_error,result=v_result,finished_at=now()
      WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,
      private.square_menu_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.manifest) e WHERE NOT EXISTS(
    SELECT 1 FROM private.square_publications p WHERE p.actor_id=v_attempt.actor_id
      AND p.request_id=(e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id AND p.status='succeeded'))
  THEN RAISE EXCEPTION 'Square menu publication is incomplete' USING errcode='MG409'; END IF;
  SELECT coalesce(jsonb_agg(p.result ORDER BY x.ord),'[]'::jsonb) INTO v_items
    FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
    JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
      AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id;
  v_result:=jsonb_build_object('published',true,'items',v_items);
  UPDATE private.square_menu_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_menu_publication_state(v_attempt.id));
  RETURN v_result;
END $function$;

-- public.finish_square_publication
CREATE OR REPLACE FUNCTION public.finish_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid, p_error_code text, p_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications; v_result jsonb; v_object jsonb; v_maps jsonb; v_source_variation jsonb;
  v_item text; v_variation text; v_item_version bigint; v_variation_version bigint; v_present boolean; v_format uuid;
  v_expected_versions jsonb; v_changed_variations jsonb; v_request_variation jsonb; v_response_variation jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'square-publish:'||v_attempt.connection_id::text||':'||v_attempt.brand_id::text||':'||v_attempt.catalog_group,0));
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=v_attempt.connection_id AND c.brewery_id=p_brewery AND c.state='connected'
      AND c.credential_version=v_attempt.credential_version AND c.catalog_sync_generation=v_attempt.catalog_generation
      AND t.credential_version=v_attempt.credential_version)
  THEN RAISE EXCEPTION 'Square publication was superseded' USING errcode='MG409'; END IF;
  IF p_error_code IS NOT NULL THEN
    IF p_error_code NOT IN ('version_mismatch','provider_rejected','provider_missing','provider_invalid') OR p_response IS NOT NULL
      OR (v_attempt.status='needs_snapshot' AND p_error_code NOT IN ('provider_missing','provider_invalid'))
    THEN RAISE EXCEPTION 'Square publication result is invalid'; END IF;
    v_result:=jsonb_build_object('published',false,'conflict',p_error_code='version_mismatch','errorCode',p_error_code);
    UPDATE private.square_publications SET status='rejected',error_code=p_error_code,result=v_result,finished_at=now() WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF v_attempt.status<>'prepared' THEN RAISE EXCEPTION 'Square publication was not prepared' USING errcode='MG409'; END IF;
  v_object:=p_response->'catalogObject'; v_maps:=p_response->'idMappings';
  v_expected_versions:=v_attempt.expected_variation_versions->'versions';
  v_changed_variations:=v_attempt.expected_variation_versions->'changed';
  IF jsonb_typeof(v_object)<>'object' OR jsonb_typeof(v_maps)<>'array' THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    SELECT e->>'object_id' INTO v_item FROM jsonb_array_elements(v_maps) e
      WHERE e->>'client_object_id'=(v_attempt.request_body::jsonb#>>'{object,id}');
  ELSE v_item:=v_attempt.external_item_id; END IF;
  IF v_object->>'type'='ITEM' THEN
    IF v_object->>'id'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=(v_object->>'version')::bigint;
    IF v_attempt.expected_item_version IS NOT NULL AND v_item_version<=v_attempt.expected_item_version
      THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
  ELSIF v_object->>'type'='ITEM_VARIATION' THEN
    IF v_object#>>'{item_variation_data,item_id}'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=v_attempt.expected_item_version;
  ELSE RAISE EXCEPTION 'Square publication response type is invalid'; END IF;
  IF nullif(btrim(v_item),'') IS NULL OR v_item_version IS NULL OR v_item_version<0
    THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  v_present:=EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
    WHERE coalesce((e->>'present')::boolean,false));
  INSERT INTO public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership,retired_at)
  VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_item,v_attempt.ownership_intent,
    CASE WHEN v_present THEN null ELSE now() END)
  ON CONFLICT(connection_id,brand_id,catalog_group) DO UPDATE SET external_item_id=excluded.external_item_id,
    ownership=excluded.ownership,retired_at=excluded.retired_at,updated_at=now();
  FOR v_source_variation IN SELECT value FROM jsonb_array_elements(v_attempt.source_snapshot->'variations')
  LOOP
    v_format:=(v_source_variation->>'formatId')::uuid;
    v_variation:=v_source_variation->>'externalVariationId';
    IF v_variation IS NULL AND coalesce((v_source_variation->>'present')::boolean,false) THEN
      SELECT e->>'object_id' INTO v_variation FROM jsonb_array_elements(v_maps) e
        WHERE e->>'client_object_id'='#mgr-variation-'||(v_source_variation->>'formatId');
    END IF;
    IF v_variation IS NULL THEN CONTINUE; END IF;
    IF v_object->>'type'='ITEM' THEN
      SELECT e,(e->>'version')::bigint INTO v_response_variation,v_variation_version
        FROM jsonb_array_elements(v_object#>'{item_data,variations}') e
        WHERE e->>'id'=v_variation;
      SELECT e INTO v_request_variation FROM jsonb_array_elements(v_attempt.request_body::jsonb#>'{object,item_data,variations}') e
        WHERE e->>'id'=v_variation;
    ELSIF v_object->>'id'=v_variation THEN
      v_response_variation:=v_object; v_variation_version:=(v_object->>'version')::bigint;
      v_request_variation:=v_attempt.request_body::jsonb->'object';
    ELSE CONTINUE;
    END IF;
    IF v_variation_version IS NULL OR v_variation_version<0 OR
      ((v_expected_versions ? v_variation) AND
        (v_variation_version<(v_expected_versions->>v_variation)::bigint
          OR (v_changed_variations ? v_variation) AND v_variation_version=(v_expected_versions->>v_variation)::bigint
          OR v_request_variation IS NULL OR NOT (v_response_variation @> (v_request_variation-'version'))))
    THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
    INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,
      external_item_name,external_variation_name,source_version,available,last_seen_at)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_variation,v_attempt.source_snapshot->>'brand',
      v_source_variation->>'format',v_variation_version,true,now())
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,external_variation_name=excluded.external_variation_name,
      source_version=excluded.source_version,available=true,last_seen_at=excluded.last_seen_at;
    INSERT INTO public.pos_item_mappings(brewery_id,connection_id,external_item_id,external_item_name,
      external_variation_id,format_id,sku_id,ignored)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_attempt.source_snapshot->>'brand',v_variation,v_format,null,false)
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,format_id=excluded.format_id,sku_id=null,ignored=false;
    INSERT INTO public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,
      external_item_id,external_variation_id,retired_at)
    VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,v_item,v_variation,
      CASE WHEN coalesce((v_source_variation->>'present')::boolean,false) THEN null ELSE now() END)
    ON CONFLICT(connection_id,format_id,brand_id) DO UPDATE SET external_item_id=excluded.external_item_id,
      external_variation_id=excluded.external_variation_id,retired_at=excluded.retired_at,updated_at=now();
    INSERT INTO private.square_publication_events(publication_id,brewery_id,connection_id,brand_id,catalog_group,
      format_id,external_item_id,external_variation_id,ownership,present)
    VALUES(v_attempt.id,p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,
      v_item,v_variation,v_attempt.ownership_intent,coalesce((v_source_variation->>'present')::boolean,false));
  END LOOP;
  v_result:=jsonb_build_object('published',v_present,'retired',NOT v_present,'externalItemId',v_item,
    'ownership',v_attempt.ownership_intent,'variations',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'formatId',o.format_id,'externalVariationId',o.external_variation_id,'retired',o.retired_at IS NOT NULL)
      ORDER BY o.format_id),'[]'::jsonb) FROM public.pos_catalog_ownership o WHERE o.connection_id=v_attempt.connection_id
        AND o.brand_id=v_attempt.brand_id AND o.catalog_group=v_attempt.catalog_group));
  UPDATE private.square_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR no_data_found THEN
  RAISE EXCEPTION 'Square publication response is invalid';
END $function$;

-- public.get_chat_settings_installation
CREATE OR REPLACE FUNCTION public.get_chat_settings_installation(p_brewery uuid, p_installation uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' or not private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]) then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into i from public.chat_installations where id = p_installation and brewery_id = p_brewery;
  if not found then raise exception 'installation not found'; end if;
  return jsonb_build_object(
    'id', i.id, 'state', i.state, 'external_installation_id', i.external_installation_id, 'updated_at', i.updated_at);
end $function$;

-- public.lease_square_publication
CREATE OR REPLACE FUNCTION public.lease_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid)
 RETURNS TABLE(access_token text, request_body text, superseded boolean, refresh_token text, access_expires_at timestamp with time zone, merchant_id text, credential_version bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications;
BEGIN
  IF NOT private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication AND p.brewery_id=p_brewery;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT p.* INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN
    RETURN QUERY SELECT null::text,null::text,true,null::text,null::timestamptz,null::text,null::bigint;
    RETURN;
  END IF;
  RETURN QUERY SELECT t.access_token,p.request_body,false,t.refresh_token,c.access_expires_at,c.merchant_id,c.credential_version
  FROM private.square_publications p
  JOIN public.pos_connections c ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.provider='square'
    AND c.state='connected' AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
  JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
    AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
  WHERE p.id=p_publication AND p.status IN ('needs_snapshot','prepared') AND (
    (p.external_item_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.pos_catalog_items i
      WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id AND i.catalog_group=p.catalog_group))
    OR EXISTS(SELECT 1 FROM public.pos_catalog_items i WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id
      AND i.catalog_group=p.catalog_group AND i.external_item_id=p.external_item_id AND i.ownership=p.ownership_intent)
    OR (p.ownership_intent='adopted' AND p.adopt_variation_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.pos_catalog_variations v JOIN public.pos_item_mappings m
        ON m.connection_id=v.connection_id AND m.external_item_id=v.external_item_id
          AND m.external_variation_id=v.external_variation_id AND NOT m.ignored
      JOIN public.formats f ON f.id=m.format_id AND f.brewery_id=m.brewery_id AND f.price_group_id=(SELECT price_group_id FROM public.brands WHERE id=p.brand_id AND brewery_id=p.brewery_id)
      WHERE v.connection_id=p.connection_id AND v.external_item_id=p.external_item_id
        AND v.external_variation_id=p.adopt_variation_id AND v.available)));
END $function$;

-- public.mark_qbo_authorization_failed
CREATE OR REPLACE FUNCTION public.mark_qbo_authorization_failed(p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint, p_customer uuid DEFAULT NULL::uuid, p_invoice uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_changed integer;
begin
  -- Refresh CAS locks the credential before updating connection health too.
  perform 1 from private.integration_tokens t
    where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
      and t.credential_version=p_expected_version for update;
  if not found then return false; end if;

  update public.qbo_connections c
    set state='recovery_required', last_error='QuickBooks authorization expired or was revoked', updated_at=now()
    where c.brewery_id=p_brewery and c.id=p_connection and c.state='connected'
      and c.credential_version=p_expected_version
      and (private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','sales']::public.staff_role[])
        or exists(select 1 from public.read_portal_qbo_payment(p_brewery,p_customer,p_invoice,p_actor) claim
          where claim.connection_id=p_connection and claim.credential_version=p_expected_version));
  get diagnostics v_changed = row_count;
  return v_changed=1;
end;
$function$;

-- public.mark_square_authorization_failed
CREATE OR REPLACE FUNCTION public.mark_square_authorization_failed(p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE public.pos_connections c SET state='recovery_required',last_error='Square authorization expired or was revoked',updated_at=now()
    WHERE c.brewery_id=p_brewery AND c.id=p_connection AND c.provider='square' AND c.state='connected'
      AND c.credential_version=p_expected_version
      AND private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','warehouse']::public.staff_role[])
      AND EXISTS(SELECT 1 FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square'
        AND t.connection_id=p_connection AND t.credential_version=p_expected_version);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 THEN PERFORM private.supersede_square_publications(p_connection); END IF;
  RETURN changed=1;
END $function$;

-- public.prepare_square_publication
CREATE OR REPLACE FUNCTION public.prepare_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid, p_request_body text, p_item_version bigint, p_variation_versions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications; v_body jsonb; v_object jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN RETURN false; END IF;
  SELECT p.* INTO v_attempt FROM private.square_publications p JOIN public.pos_connections c
    ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.state='connected'
      AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
    JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
      AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
    WHERE p.id=p_publication AND p.brewery_id=p_brewery FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF v_attempt.status='prepared' THEN RETURN v_attempt.request_body=p_request_body; END IF;
  IF v_attempt.status<>'needs_snapshot' THEN RAISE EXCEPTION 'Square publication is already finished' USING errcode='MG409'; END IF;
  BEGIN v_body:=p_request_body::jsonb; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Square publication body is invalid'; END;
  v_object:=v_body->'object';
  IF v_body->>'idempotency_key'<>v_attempt.provider_key::text OR jsonb_typeof(v_object)<>'object'
    OR jsonb_typeof(p_variation_versions)<>'object'
    OR jsonb_typeof(p_variation_versions->'versions')<>'object'
    OR jsonb_typeof(p_variation_versions->'changed')<>'array'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_variation_versions->'changed') e WHERE jsonb_typeof(e)<>'string')
    OR p_request_body LIKE '%"sold_out"%' OR p_request_body LIKE '%"sold_out_valid_until"%'
    OR p_request_body LIKE '%access_token%' THEN RAISE EXCEPTION 'Square publication body is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    IF v_object->>'type'<>'ITEM' OR left(v_object->>'id',1)<>'#' OR p_item_version IS NOT NULL
      THEN RAISE EXCEPTION 'Square create publication is invalid'; END IF;
  ELSIF p_item_version IS NULL OR v_object->>'id'<>v_attempt.external_item_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
      WHERE e->>'externalVariationId'=v_object->>'id')
  THEN RAISE EXCEPTION 'Square update publication is invalid'; END IF;
  UPDATE private.square_publications SET request_body=p_request_body,expected_item_version=p_item_version,
    expected_variation_versions=coalesce(p_variation_versions,'{}'::jsonb),status='prepared' WHERE id=v_attempt.id;
  RETURN true;
END $function$;

-- public.read_integration_tokens
CREATE OR REPLACE FUNCTION public.read_integration_tokens(p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid)
 RETURNS TABLE(access_token text, refresh_token text, credential_version bigint, access_expires_at timestamp with time zone, refresh_expires_at timestamp with time zone, refresh_hard_expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT t.access_token,t.refresh_token,t.credential_version,coalesce(q.access_expires_at,p.access_expires_at),q.refresh_expires_at,q.refresh_hard_expires_at
  FROM private.integration_tokens t
  LEFT JOIN public.qbo_connections q ON p_provider='qbo' AND q.brewery_id=t.brewery_id AND q.id=t.connection_id
  LEFT JOIN public.pos_connections p ON p_provider='square' AND p.brewery_id=t.brewery_id AND p.id=t.connection_id
  WHERE t.brewery_id=p_brewery AND t.provider=p_provider AND t.connection_id=p_connection
    AND private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','sales']::public.staff_role[])
    AND ((p_provider='qbo' AND q.state='connected') OR (p_provider='square' AND p.state='connected'))
$function$;

-- public.record_qbo_invoice_sync_failure
CREATE OR REPLACE FUNCTION public.record_qbo_invoice_sync_failure(p_brewery uuid, p_actor uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin','sales']::public.staff_role[]) then
    raise insufficient_privilege using message='permission denied';
  end if;
  -- A late failed response cannot overwrite a concurrently committed success.
  update private.qbo_invoice_sync_batches set failed_at=now()
    where brewery_id=p_brewery and actor_id=p_actor and request_id=p_request_id and completed_at is null and superseded_at is null;
end $function$;

-- public.record_square_catalog_snapshot
CREATE OR REPLACE FUNCTION public.record_square_catalog_snapshot(p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint, p_request_id uuid, p_locations jsonb, p_variations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE request private.command_requests; attempt private.square_catalog_syncs; connection public.pos_connections;
  token_version bigint; result jsonb;
BEGIN
  IF NOT private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]) THEN
    RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF jsonb_typeof(p_locations)<>'array' OR jsonb_typeof(p_variations)<>'array' THEN RAISE EXCEPTION 'Square snapshot invalid'; END IF;
  SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'sync_square_catalog'
    OR request.payload_hash<>extensions.digest('{}'::jsonb::text,'sha256') THEN
    RAISE EXCEPTION 'Square catalog sync request is invalid' USING errcode='MG409';
  END IF;
  IF request.result IS NOT NULL THEN RETURN request.result; END IF;
  SELECT * INTO attempt FROM private.square_catalog_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR attempt.brewery_id<>p_brewery OR attempt.connection_id<>p_connection OR attempt.credential_version<>p_expected_version THEN
    RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  SELECT * INTO connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery AND c.id=p_connection FOR UPDATE;
  SELECT credential_version INTO token_version FROM private.integration_tokens t
    WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection FOR UPDATE;
  IF connection.id IS NULL OR connection.provider<>'square' OR connection.state<>'connected'
    OR connection.merchant_id<>attempt.merchant_id OR connection.credential_version<>p_expected_version
    OR connection.catalog_sync_generation>=attempt.catalog_generation OR token_version IS DISTINCT FROM p_expected_version
    OR EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
      WHERE newer.connection_id=attempt.connection_id AND newer.catalog_generation>attempt.catalog_generation) THEN
    RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
    SELECT p_brewery,p_connection,x.id,x.name,x.status,true,now() FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text)
    WHERE x.id IS NOT NULL AND btrim(x.id)<>''
  ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
    external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
  UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=p_connection
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text) WHERE x.id=l.external_location_id);
  INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,external_item_name,
    external_variation_name,source_version,available,last_seen_at)
    SELECT p_brewery,p_connection,x."itemId",x."variationId",x."itemName",x."variationName",x.version,x.available,now()
    FROM jsonb_to_recordset(p_variations) AS x("itemId" text,"itemName" text,"variationId" text,"variationName" text,version bigint,available boolean)
    WHERE x."itemId" IS NOT NULL AND btrim(x."itemId")<>'' AND x."variationId" IS NOT NULL AND btrim(x."variationId")<>'' AND x.version>=0 AND x.available IS NOT NULL
  ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET external_item_name=excluded.external_item_name,
    external_variation_name=excluded.external_variation_name,source_version=excluded.source_version,available=excluded.available,last_seen_at=excluded.last_seen_at
    WHERE public.pos_catalog_variations.source_version<=excluded.source_version;
  UPDATE public.pos_catalog_variations v SET available=false,last_seen_at=now() WHERE v.connection_id=p_connection
    AND v.last_seen_at<attempt.created_at
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_variations) AS x("itemId" text,"variationId" text) WHERE x."itemId"=v.external_item_id AND x."variationId"=v.external_variation_id);
  UPDATE public.pos_connections SET catalog_sync_generation=attempt.catalog_generation,updated_at=now()
    WHERE id=p_connection AND brewery_id=p_brewery AND catalog_sync_generation<attempt.catalog_generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM private.supersede_square_publications(p_connection);
  result:=jsonb_build_object('locations',(SELECT count(*) FROM public.pos_locations WHERE connection_id=p_connection AND available),
    'variations',(SELECT count(*) FROM public.pos_catalog_variations WHERE connection_id=p_connection AND available));
  RETURN private.complete_command_request_for(p_actor,p_request_id,result);
END $function$;

-- public.record_square_sales_locations
CREATE OR REPLACE FUNCTION public.record_square_sales_locations(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_locations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_sales_syncs; v_ids text[];
BEGIN
  IF jsonb_typeof(p_locations)<>'array' THEN RAISE EXCEPTION 'Square locations invalid'; END IF;
  SELECT coalesce(array_agg(x.id ORDER BY x.id),'{}') INTO v_ids
    FROM jsonb_to_recordset(p_locations) x(id text,name text,status text)
    WHERE nullif(btrim(x.id),'') IS NOT NULL AND nullif(btrim(x.name),'') IS NOT NULL AND nullif(btrim(x.status),'') IS NOT NULL;
  IF cardinality(v_ids)<>jsonb_array_length(p_locations) OR cardinality(v_ids)<>cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) THEN
    RAISE EXCEPTION 'Square locations invalid';
  END IF;
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.brewery_id<>p_brewery OR v_attempt.connection_id<>p_connection
    OR v_attempt.credential_version<>p_expected_version OR v_attempt.status<>'in_progress'
    OR NOT private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[])
    OR NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
        AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version)
  THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
      AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version FOR SHARE OF c,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  IF v_attempt.locations_captured THEN
    IF v_attempt.external_location_ids<>v_ids THEN RAISE EXCEPTION 'Square location snapshot changed' USING errcode='MG409'; END IF;
  ELSE
    INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
      SELECT p_brewery,p_connection,x.id,x.name,x.status,true,now() FROM jsonb_to_recordset(p_locations) x(id text,name text,status text)
    ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
      external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
    UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=p_connection
      AND NOT(l.external_location_id=ANY(v_ids));
    UPDATE private.square_sales_syncs SET external_location_ids=v_ids,locations_captured=true
      WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  END IF;
  RETURN jsonb_build_object('locationIds',v_attempt.external_location_ids,'locationOffset',v_attempt.location_offset,
    'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $function$;

-- public.record_square_sales_page
CREATE OR REPLACE FUNCTION public.record_square_sales_page(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_location_ids text[], p_cursor text, p_next_cursor text, p_orders jsonb, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_sales_syncs; v_expected_locations text[]; v_order jsonb; v_fact jsonb; v_previous record;
  v_order_id text; v_line_id text; v_kind text; v_status text; v_reason text; v_source_order text; v_source_line text;
  v_version bigint; v_qty numeric; v_source_qty numeric; v_returned numeric; v_sale_id uuid; v_hash text; v_snapshot_hash text;
  v_inserted integer:=0; v_accepted integer:=0; v_unsupported integer:=0; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_orders)<>'array' OR jsonb_typeof(p_facts)<>'array' THEN RAISE EXCEPTION 'Square sales page invalid'; END IF;
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.brewery_id<>p_brewery OR v_attempt.connection_id<>p_connection
    OR v_attempt.credential_version<>p_expected_version OR v_attempt.status<>'in_progress' OR NOT v_attempt.locations_captured
    OR v_attempt.cursor IS DISTINCT FROM p_cursor
    OR NOT private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[])
    OR NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
        AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version)
  THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection::text,0));
  PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
      AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version FOR SHARE OF c,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  v_expected_locations:=v_attempt.external_location_ids[v_attempt.location_offset+1:v_attempt.location_offset+10];
  IF p_location_ids IS DISTINCT FROM v_expected_locations THEN RAISE EXCEPTION 'Square sales location page changed' USING errcode='MG409'; END IF;
  IF p_next_cursor IS NOT NULL AND (p_next_cursor IS NOT DISTINCT FROM p_cursor OR p_next_cursor=ANY(v_attempt.seen_cursors)) THEN
    RAISE EXCEPTION 'Square sales cursor repeated';
  END IF;

  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
  LOOP
    v_order_id:=nullif(btrim(v_order->>'externalOrderId'),''); v_version:=(v_order->>'sourceVersion')::bigint;
    IF v_order_id IS NULL OR v_version<0 OR NOT((v_order->>'externalLocationId')=ANY(p_location_ids)) THEN
      RAISE EXCEPTION 'Square order snapshot invalid';
    END IF;
    v_snapshot_hash:=encode(extensions.digest(jsonb_build_object(
      'externalOrderId',v_order_id,'sourceVersion',v_version,'externalLocationId',v_order->>'externalLocationId',
      'soldAt',v_order->>'soldAt','orderUpdatedAt',v_order->>'orderUpdatedAt','facts',coalesce((
        SELECT jsonb_agg(jsonb_build_object('factKind',f->>'factKind','externalLineId',f->>'externalLineId',
          'sourceHash',f->>'sourceHash') ORDER BY f->>'factKind',f->>'externalLineId')
        FROM jsonb_array_elements(p_facts) f WHERE f->>'externalOrderId'=v_order_id
          AND (f->>'sourceVersion')::bigint=v_version
      ),'[]'::jsonb))::text,'sha256'),'hex');
    INSERT INTO private.square_order_snapshots(brewery_id,connection_id,merchant_id,external_order_id,source_version,snapshot_hash)
    VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_version,v_snapshot_hash)
    ON CONFLICT(connection_id,external_order_id,source_version) DO NOTHING;
    IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM private.square_order_snapshots s WHERE s.connection_id=p_connection
      AND s.external_order_id=v_order_id AND s.source_version=v_version AND s.snapshot_hash=v_snapshot_hash) THEN
      RAISE EXCEPTION 'Square order changed within one source version' USING errcode='MG409';
    END IF;
  END LOOP;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) WITH ORDINALITY rows(value,n)
    ORDER BY (value->>'factKind'='return'),n
  LOOP
    v_order_id:=nullif(btrim(v_fact->>'externalOrderId'),''); v_line_id:=nullif(btrim(v_fact->>'externalLineId'),'');
    v_kind:=v_fact->>'factKind'; v_status:=v_fact->>'factStatus'; v_reason:=nullif(v_fact->>'unsupportedReason','');
    v_version:=(v_fact->>'sourceVersion')::bigint; v_qty:=CASE WHEN v_fact->>'qty' IS NULL THEN null ELSE (v_fact->>'qty')::numeric END;
    v_source_order:=nullif(v_fact->>'sourceOrderId',''); v_source_line:=nullif(v_fact->>'sourceLineId',''); v_hash:=v_fact->>'sourceHash';
    IF v_order_id IS NULL OR v_line_id IS NULL OR v_kind NOT IN ('sale','return') OR v_status NOT IN ('accepted','unsupported')
      OR v_version<0 OR nullif(v_hash,'') IS NULL OR NOT((v_fact->>'externalLocationId')=ANY(p_location_ids))
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) o WHERE o->>'externalOrderId'=v_order_id
        AND (o->>'sourceVersion')::bigint=v_version AND o->>'externalLocationId'=v_fact->>'externalLocationId')
    THEN RAISE EXCEPTION 'Square sales fact invalid'; END IF;
    IF v_status='accepted' AND (v_qty IS NULL OR v_qty<=0 OR v_qty::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Square sales quantity invalid';
    END IF;
    IF v_kind='return' AND v_status='accepted' THEN
      SELECT s.qty INTO v_source_qty FROM private.pos_current_sales s
        WHERE s.connection_id=p_connection AND s.external_order_id=v_source_order AND s.fact_kind='sale'
          AND s.external_line_id=v_source_line AND s.fact_status='accepted'
          AND s.external_variation_id=v_fact->>'externalVariationId';
      SELECT coalesce(sum(r.qty),0) INTO v_returned FROM private.pos_current_sales r
        WHERE r.connection_id=p_connection AND r.fact_kind='return' AND r.fact_status='accepted'
          AND r.source_order_id=v_source_order AND r.source_line_id=v_source_line
          AND NOT(r.external_order_id=v_order_id AND r.external_line_id=v_line_id);
      IF v_source_qty IS NULL THEN v_status:='unsupported'; v_reason:='return_source_not_found'; v_qty:=null;
      ELSIF v_returned+v_qty>v_source_qty THEN v_status:='unsupported'; v_reason:='return_quantity_exceeds_source'; v_qty:=null;
      END IF;
    END IF;
    INSERT INTO public.pos_sales(brewery_id,connection_id,merchant_id,external_order_id,external_line_id,source_version,
      fact_kind,fact_status,source_quantity,qty,gross_cents,external_item_id,external_variation_id,external_location_id,
      sold_at,source_order_updated_at,catalog_version,quantity_unit,source_order_id,source_line_id,unsupported_reason,source_hash)
    VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_line_id,v_version,v_kind,v_status,
      v_fact->>'sourceQuantity',v_qty,CASE WHEN v_fact->>'grossCents' IS NULL THEN null ELSE (v_fact->>'grossCents')::bigint END,
      (SELECT c.external_item_id FROM public.pos_catalog_variations c WHERE c.connection_id=p_connection
        AND c.external_variation_id=v_fact->>'externalVariationId'),nullif(v_fact->>'externalVariationId',''),
      v_fact->>'externalLocationId',(v_fact->>'soldAt')::timestamptz,(v_fact->>'orderUpdatedAt')::timestamptz,
      CASE WHEN v_fact->>'catalogVersion' IS NULL THEN null ELSE (v_fact->>'catalogVersion')::bigint END,
      v_fact->'quantityUnit',v_source_order,v_source_line,v_reason,v_hash)
    ON CONFLICT(connection_id,external_order_id,fact_kind,external_line_id,source_version) DO NOTHING
    RETURNING id INTO v_sale_id;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted=0 THEN
      SELECT id INTO v_sale_id FROM public.pos_sales WHERE connection_id=p_connection AND external_order_id=v_order_id
        AND fact_kind=v_kind AND external_line_id=v_line_id AND source_version=v_version AND source_hash=v_hash;
      IF NOT FOUND THEN RAISE EXCEPTION 'Square fact changed within one source version' USING errcode='MG409'; END IF;
    ELSE
      IF v_status='accepted' THEN v_accepted:=v_accepted+1; ELSE v_unsupported:=v_unsupported+1; END IF;
    END IF;
    PERFORM private.reconcile_pos_sale(p_brewery,v_sale_id);
  END LOOP;

  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
  LOOP
    v_order_id:=v_order->>'externalOrderId'; v_version:=(v_order->>'sourceVersion')::bigint;
    FOR v_previous IN SELECT DISTINCT ON (s.fact_kind,s.external_line_id) s.* FROM public.pos_sales s
      WHERE s.connection_id=p_connection AND s.external_order_id=v_order_id AND s.source_version<v_version
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_facts) f WHERE f->>'externalOrderId'=v_order_id
          AND f->>'factKind'=s.fact_kind AND f->>'externalLineId'=s.external_line_id)
      ORDER BY s.fact_kind,s.external_line_id,s.source_version DESC,s.id DESC
    LOOP
      v_hash:=encode(extensions.digest(concat_ws('|',p_connection,v_order_id,v_previous.fact_kind,
        v_previous.external_line_id,v_version,'removed'),'sha256'),'hex');
      INSERT INTO public.pos_sales(brewery_id,connection_id,merchant_id,external_order_id,external_line_id,source_version,
        fact_kind,fact_status,external_item_id,external_variation_id,external_location_id,sold_at,source_order_updated_at,
        catalog_version,source_order_id,source_line_id,source_hash)
      VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_previous.external_line_id,v_version,
        v_previous.fact_kind,'removed',v_previous.external_item_id,v_previous.external_variation_id,v_order->>'externalLocationId',
        (v_order->>'soldAt')::timestamptz,(v_order->>'orderUpdatedAt')::timestamptz,v_previous.catalog_version,
        v_previous.source_order_id,v_previous.source_line_id,v_hash)
      ON CONFLICT(connection_id,external_order_id,fact_kind,external_line_id,source_version) DO NOTHING;
      IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.connection_id=p_connection
        AND s.external_order_id=v_order_id AND s.fact_kind=v_previous.fact_kind
        AND s.external_line_id=v_previous.external_line_id AND s.source_version=v_version
        AND s.fact_status='removed' AND s.source_hash=v_hash) THEN
        RAISE EXCEPTION 'Square fact changed within one source version' USING errcode='MG409';
      END IF;
    END LOOP;
  END LOOP;

  UPDATE private.square_sales_syncs SET pages=pages+1,accepted_facts=accepted_facts+v_accepted,
    unsupported_facts=unsupported_facts+v_unsupported,cursor=p_next_cursor,
    seen_cursors=CASE WHEN p_next_cursor IS NULL THEN seen_cursors ELSE array_append(seen_cursors,p_next_cursor) END
    WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  IF p_next_cursor IS NULL AND v_attempt.location_offset+10<cardinality(v_attempt.external_location_ids) THEN
    UPDATE private.square_sales_syncs SET location_offset=location_offset+10
      WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  ELSIF p_next_cursor IS NULL THEN
    INSERT INTO public.pos_sales_coverage(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,complete)
      SELECT p_brewery,p_connection,l.external_location_id,l.location_id,v_attempt.coverage_starts_at,v_attempt.ends_at,true
      FROM public.pos_locations l WHERE l.connection_id=p_connection AND l.external_location_id=ANY(v_attempt.external_location_ids)
      ;
    UPDATE public.pos_connections SET sales_synced_through=greatest(coalesce(sales_synced_through,v_attempt.ends_at),v_attempt.ends_at),updated_at=now()
      WHERE id=p_connection AND brewery_id=p_brewery AND credential_version=p_expected_version;
    v_result:=jsonb_build_object('complete',true,'acceptedFacts',v_attempt.accepted_facts,'unsupportedFacts',v_attempt.unsupported_facts,
      'pages',v_attempt.pages,'locations',cardinality(v_attempt.external_location_ids),'startsAt',v_attempt.starts_at,'endsAt',v_attempt.ends_at);
    UPDATE private.square_sales_syncs SET status='completed',result=v_result WHERE actor_id=p_actor AND request_id=p_request_id;
    PERFORM private.complete_command_request_for(p_actor,p_request_id,v_result);
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('complete',false,'locationIds',v_attempt.external_location_ids,
    'locationOffset',v_attempt.location_offset,'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $function$;

-- public.set_notification_destination
CREATE OR REPLACE FUNCTION public.set_notification_destination(p_brewery uuid, p_installation uuid, p_external_destination_id text, p_request_id uuid, p_actor uuid, p_version timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_result jsonb; i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'permission denied' using errcode='42501'; end if;
  if not private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]) then
    raise exception 'permission denied: brewery admin required' using errcode='42501';
  end if;
  v_replay:=private.claim_command_request_for(p_actor,p_brewery,'set_notification_destination',p_request_id,jsonb_build_object('installation',p_installation,'channel',p_external_destination_id));
  if v_replay is not null then return v_replay; end if;
  select * into i from public.chat_installations where id=p_installation and brewery_id=p_brewery for update;
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
  if i.state <> 'active' or i.updated_at is distinct from p_version then
    raise exception 'installation changed; reload Chat settings';
  end if;
  v_result:=private.set_notification_destination(p_installation,p_external_destination_id);
  return private.complete_command_request_for(p_actor,p_request_id,v_result);
end $function$;

-- public.store_integration_tokens
CREATE OR REPLACE FUNCTION public.store_integration_tokens(p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid, p_access_token text, p_refresh_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with authorized as (
    select true
    where private.actor_has_staff_roles(p_brewery, p_actor, ARRAY['admin', 'sales']::public.staff_role[])
    and (
      (p_provider = 'qbo' and exists (
        select 1 from public.qbo_connections q
        where q.brewery_id = p_brewery and q.id = p_connection and q.state = 'connected'
      ))
      or
      (p_provider = 'square' and exists (
        select 1 from public.pos_connections p
        where p.brewery_id = p_brewery
          and p.provider = p_provider
          and p.id = p_connection
      ))
    )
  ),
  written as (
    insert into private.integration_tokens as t (
      brewery_id, provider, connection_id, access_token, refresh_token
    )
    select p_brewery, p_provider, p_connection, p_access_token, p_refresh_token
    from authorized
    on conflict (brewery_id, provider) do update
      set connection_id = excluded.connection_id,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          credential_version = t.credential_version + 1,
          updated_at = now()
    returning credential_version
  ),
  qbo_version as (
    update public.qbo_connections q set credential_version=w.credential_version
    from written w where p_provider='qbo' and q.brewery_id=p_brewery and q.id=p_connection
    returning true
  )
  select coalesce((select true from written), false);
$function$;

-- Callback permissions are rechecked from current role membership.
create or replace function public.issue_chat_action_intent(p_installation uuid, p_external_user_id text, p_action text, p_delivery uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; actor jsonb; v_id uuid; v_input jsonb:='{}'; d record;
begin
  perform public.chat_assert_job();
  select * into i from public.chat_installations where id=p_installation;
  actor := public.resolve_chat_actor(i.provider,i.external_installation_id,p_external_user_id);
  if actor is null then return null; end if;
  if not private.actor_has_staff_roles(i.brewery_id, (actor->>'user_id')::uuid, array['admin','sales','warehouse','brewer']::public.staff_role[]) and p_action in ('mgr_preferences','mgr_save_preferences','mgr_snooze') then return null; end if;
  if p_action not in ('mgr_open','mgr_snooze','mgr_mute_reason','mgr_preferences','mgr_save_preferences','mgr_refresh','mgr_unlink') then
    raise exception 'unsupported chat action' using errcode='22023'; end if;
  if p_action in ('mgr_snooze','mgr_mute_reason') then
    select nd.id,o.reason,o.semantic_key into d from public.notification_deliveries nd
      join public.notification_destinations dst on dst.id=nd.destination_id
      join public.notification_occurrences o on o.id=nd.occurrence_id
      where nd.id=p_delivery and nd.installation_id=i.id and dst.user_id=(actor->>'user_id')::uuid
        and dst.kind='personal' and dst.state='active' and o.state='active';
    if not found then return null; end if;
    v_input:=jsonb_build_object('delivery',d.id,'reason',d.reason,'until',now()+interval '1 hour');
  end if;
  insert into public.chat_action_intents (brewery_id,installation_id,user_id,provider,external_user_id,
    action_origin_hash,command_name,input_hash,subject_type,subject_id,subject_version,request_id,preview_token_hash,allowed_action,integration_input,expires_at)
  values (i.brewery_id,i.id,(actor->>'user_id')::uuid,i.provider,p_external_user_id,
    encode(extensions.digest(p_external_user_id,'sha256'),'hex'),p_action,encode(extensions.digest(v_input::text,'sha256'),'hex'),
    'chat',coalesce(p_delivery::text,i.id::text),'integration-only',gen_random_uuid(),'integration-only',p_action,v_input,now()+interval '10 minutes')
  returning id into v_id;
  return v_id;
end $$;

-- Callback permissions are rechecked from current role membership.
create or replace function public.consume_chat_action_intent(p_receipt uuid, p_intent uuid, p_action text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.chat_callback_receipts; t public.chat_action_intents; i public.chat_installations;
  actor jsonb; v_result jsonb; pref record; submit_intent uuid;
begin
  perform public.chat_assert_job();
  select * into r from public.chat_callback_receipts where id=p_receipt for update;
  if not found then raise exception 'receipt required' using errcode='42501'; end if;
  if r.result is not null then return r.result; end if;
  select * into t from public.chat_action_intents where id=p_intent for update;
  select * into i from public.chat_installations where id=r.installation_id;
  actor:=public.resolve_chat_actor(r.provider,i.external_installation_id,r.external_user_id);
  v_result:='{"disposition":"ignored","code":"stale_action"}';
  if t.id is not null and actor is not null and t.installation_id=r.installation_id and t.brewery_id=r.brewery_id
    and t.provider=r.provider and t.user_id=(actor->>'user_id')::uuid and t.external_user_id=r.external_user_id
    and t.allowed_action=p_action and r.callback_kind=p_action and t.expires_at>now() and t.consumed_at is null then
    begin
      if p_action='mgr_snooze' then
        if not private.actor_has_staff_roles(t.brewery_id, t.user_id, array['admin','sales','warehouse','brewer']::public.staff_role[]) then raise exception 'permission denied' using errcode='42501'; end if;
        perform private.snooze_chat_delivery(t.brewery_id,t.user_id,(t.integration_input->>'delivery')::uuid,(t.integration_input->>'until')::timestamptz);
      elsif p_action='mgr_mute_reason' then
        perform private.set_chat_preference(t.brewery_id,t.user_id,t.integration_input->>'reason',false);
      elsif p_action='mgr_save_preferences' then
        if not private.actor_has_staff_roles(t.brewery_id, t.user_id, array['admin','sales','warehouse','brewer']::public.staff_role[]) then raise exception 'permission denied' using errcode='42501'; end if;
        if jsonb_typeof(p_input->'enabled') <> 'boolean' or nullif(p_input->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or nullif(p_input->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'invalid preferences' using errcode='22023'; end if;
        perform private.set_chat_preference(t.brewery_id,t.user_id,p_input->>'reason',(p_input->>'enabled')::boolean);
        perform private.set_chat_quiet_hours(t.brewery_id,t.user_id,nullif(p_input->>'start','')::time,nullif(p_input->>'end','')::time,nullif(p_input->>'timezone',''));
      elsif p_action='mgr_unlink' then
        perform private.unlink_chat_identity(t.installation_id,t.user_id);
      end if;
      v_result:=jsonb_build_object('disposition','processed');
      if p_action='mgr_preferences' then
        submit_intent:=public.issue_chat_action_intent(t.installation_id,r.external_user_id,'mgr_save_preferences');
        select quiet_hours_start,quiet_hours_end,quiet_hours_timezone into pref from public.notification_preferences
          where brewery_id=t.brewery_id and user_id=t.user_id order by reason limit 1;
        v_result:=v_result || jsonb_build_object('intentId',submit_intent,'quietHours',jsonb_build_object('start',pref.quiet_hours_start,'end',pref.quiet_hours_end,'timezone',pref.quiet_hours_timezone));
      end if;
      if p_action in ('mgr_refresh','mgr_unlink') then
        insert into public.chat_callback_receipts (brewery_id,installation_id,provider,callback_id,callback_kind,external_user_id,disposition,payload_hash,received_at)
          values (r.brewery_id,r.installation_id,r.provider,'action-home:'||r.id,'app_home_opened',r.external_user_id,'pending',r.payload_hash,now())
          on conflict (installation_id,callback_id) do nothing;
      end if;
      update public.chat_action_intents set consumed_at=now(),first_result_reference=r.id::text where id=t.id;
    exception when invalid_parameter_value or invalid_datetime_format or datetime_field_overflow or insufficient_privilege then
      v_result:='{"disposition":"ignored","code":"invalid_action"}';
    end;
  end if;
  update public.chat_callback_receipts set disposition=v_result->>'disposition',result=v_result,completed_at=now() where id=r.id;
  return v_result;
end $$;

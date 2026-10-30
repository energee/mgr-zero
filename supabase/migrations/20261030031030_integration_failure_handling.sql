-- Full Square cleanup must not revoke an existing stored seller authorization.
CREATE OR REPLACE FUNCTION public.complete_square_oauth(p_intent uuid, p_actor uuid, p_merchant_id text, p_merchant_label text, p_access_token text, p_refresh_token text, p_access_expires_at timestamp with time zone, p_granted_scopes text[], p_locations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE i private.square_oauth_intents; c public.pos_connections; v_id uuid:=private.new_uuid(); v_version bigint;
  v_sync_result jsonb:=jsonb_build_object('synced',false,'superseded',true,'errorCode','connection_changed');
BEGIN
  -- Serialize adoption with a full-authorization cleanup reservation for this seller.
  PERFORM pg_advisory_xact_lock(hashtextextended('square-oauth-cleanup:' || p_merchant_id, 0));
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

CREATE OR REPLACE FUNCTION public.fail_square_oauth (
  p_intent        uuid,
  p_actor         uuid,
  p_cleanup_state text,
  p_merchant_id   text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE i private.square_oauth_intents;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('square-oauth-cleanup:' || p_merchant_id, 0));
  IF p_cleanup_state NOT IN ('not_required','pending','confirmed','unresolved') THEN
    RAISE EXCEPTION 'Square cleanup state invalid'; END IF;
  IF (p_cleanup_state='not_required' AND p_merchant_id IS NOT NULL)
    OR (p_cleanup_state<>'not_required' AND (p_merchant_id IS NULL OR btrim(p_merchant_id)='')) THEN
    RAISE EXCEPTION 'Square cleanup merchant invalid'; END IF;
  SELECT brewery_id INTO i.brewery_id FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.breweries WHERE id=i.brewery_id FOR UPDATE;
  SELECT * INTO i FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor FOR UPDATE;
  IF p_cleanup_state='not_required' THEN
    UPDATE private.square_oauth_intents SET exchange_state='recovery_required',cleanup_state='not_required'
      WHERE id=p_intent AND actor_id=p_actor AND exchange_state='exchanging';
    RETURN FOUND;
  END IF;
  IF p_cleanup_state='pending' THEN
    -- Revoking a seller ends every token, including a different brewery's stored grant.
    IF EXISTS(SELECT 1 FROM public.pos_connections c WHERE c.provider='square'
      AND c.merchant_id=p_merchant_id AND c.state<>'disconnected') THEN
      RAISE EXCEPTION 'Square authorization belongs to a stored connection' USING errcode='MG409';
    END IF;
    IF NOT (i.exchange_state='exchanging' OR (i.exchange_state='recovery_required' AND i.cleanup_state='not_required')) THEN
      RETURN i.exchange_state='recovery_required' AND i.cleanup_state='pending' AND i.cleanup_merchant_id=p_merchant_id; END IF;
    UPDATE private.square_oauth_intents SET exchange_state='recovery_required',cleanup_state='pending',cleanup_merchant_id=p_merchant_id
      WHERE id=p_intent;
    RETURN true;
  END IF;
  IF i.exchange_state='recovery_required' AND i.cleanup_state='pending' AND i.cleanup_merchant_id=p_merchant_id THEN
    UPDATE private.square_oauth_intents SET cleanup_state=p_cleanup_state WHERE id=p_intent;
    RETURN true;
  END IF;
  IF p_cleanup_state='unresolved' AND (i.exchange_state='exchanging'
      OR (i.exchange_state='recovery_required' AND i.cleanup_state='not_required')) THEN
    UPDATE private.square_oauth_intents SET exchange_state='recovery_required',cleanup_state='unresolved',cleanup_merchant_id=p_merchant_id
      WHERE id=p_intent;
    RETURN true;
  END IF;
  RETURN i.exchange_state='recovery_required' AND i.cleanup_state=p_cleanup_state AND i.cleanup_merchant_id=p_merchant_id;
END
$function$;

-- Keep retries within the original 23-hour provider deduplication window.
-- attempt_count advances on lease; delays are 5, 10, 20, 40, then 60 minutes.
create or replace function public.finish_order_email(p_delivery uuid,p_lease uuid,p_provider_id text,p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (p_provider_id is null) = (p_error is null)
    or (p_provider_id is not null and btrim(p_provider_id)='')
    or (p_error is not null and p_error not in ('provider_uncertain','provider_rejected','retry_window_expired')) then
    raise exception 'invalid email outcome';
  end if;
  update private.order_email_deliveries set
    state=case when p_provider_id is not null then 'accepted' when p_error='provider_uncertain' then 'pending' else 'blocked' end,
    provider_id=p_provider_id,accepted_at=case when p_provider_id is not null then clock_timestamp() else null end,
    last_error=p_error,
    next_attempt_at=least(first_attempt_at+interval '23 hours',
      clock_timestamp()+make_interval(mins=>case attempt_count when 1 then 5 when 2 then 10 when 3 then 20 when 4 then 40 else 60 end)),
    lease_token=null,lease_expires_at=null
  where id=p_delivery and lease_token=p_lease and state='sending' and lease_expires_at>clock_timestamp();
  return found;
end $$;
revoke all on function public.finish_order_email(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_order_email(uuid,uuid,text,text) to service_role;

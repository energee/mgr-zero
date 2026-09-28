-- #640: retry Square revocation after a disconnect left it unresolved.
-- That disconnect already deleted the access token, so MGR cannot resend it.
-- Square's RevokeToken also accepts merchant_id (with the Client secret) in
-- place of access_token:
-- https://developer.squareup.com/reference/square/o-auth-api/revoke-token
-- A recovery_required connection whose remote revocation is 'unresolved' may
-- now be disconnected again without a stored token; begin returns its
-- merchant_id and the caller revokes by merchant. finish_square_disconnect is
-- unchanged and records the new outcome. Every other refusal stays as in
-- 20260927090000_recovery_disconnect.sql. The return shape gains merchant_id,
-- so the function is dropped and recreated with its original grants.

DROP FUNCTION public.begin_square_disconnect(uuid, uuid, uuid, uuid);

CREATE FUNCTION public.begin_square_disconnect (
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
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND role='admin') THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
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

REVOKE ALL ON FUNCTION public.begin_square_disconnect(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_square_disconnect(uuid, uuid, uuid, uuid) TO postgres, service_role;

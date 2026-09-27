-- #620: a connection in recovery_required can be disconnected.
-- Both begin functions previously required state='connected', so an admin
-- could neither purge a recovery-state credential nor get an honest state.
-- Only the state predicate changes; everything else is copied verbatim.
--
-- Square: mark_square_authorization_failed leaves the credential in place and
-- remote_revocation_state='not_requested'; disconnect now purges it and
-- attempts revocation exactly as for a connected seller. A recovery row whose
-- revocation is 'pending' is still refused, and one whose credential was
-- already purged (remote 'unresolved') still fails on the missing credential.
--
-- QuickBooks: nothing writes qbo_connections.state='recovery_required' today,
-- but the check constraint allows it; accept it so disconnect is the supported
-- cleanup if it ever occurs. A missing credential records 'unresolved'.
-- Grants are unchanged (CREATE OR REPLACE keeps them).

CREATE OR REPLACE FUNCTION public.begin_square_disconnect (
  p_brewery    uuid,
  p_connection uuid,
  p_actor      uuid,
  p_request_id uuid
)
  RETURNS TABLE (
    access_token  text,
    replay_result jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE request private.command_requests; connection public.pos_connections; token text; token_version bigint; next_version bigint;
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
    IF request.result IS NOT NULL THEN RETURN QUERY SELECT null::text,request.result; RETURN; END IF;
    RAISE EXCEPTION 'Square disconnect is still being reconciled' USING errcode='MG409';
  END IF;
  UPDATE private.square_oauth_intents SET consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
    WHERE brewery_id=p_brewery AND exchange_state IN ('pending','exchanging');
  SELECT * INTO connection FROM public.pos_connections WHERE brewery_id=p_brewery AND id=p_connection AND state IN ('connected','recovery_required') FOR UPDATE;
  IF NOT FOUND OR connection.remote_revocation_state='pending' THEN RAISE EXCEPTION 'connection not available'; END IF;
  DELETE FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection
    RETURNING t.access_token,t.credential_version INTO token,token_version;
  IF token IS NULL THEN RAISE EXCEPTION 'connection credential not available'; END IF;
  next_version:=greatest(connection.credential_version,token_version)+1;
  UPDATE public.pos_connections SET state='recovery_required',remote_revocation_state='pending',
    last_error='Square authorization revocation is pending',credential_version=next_version,updated_at=now()
    WHERE brewery_id=p_brewery AND id=p_connection AND state IN ('connected','recovery_required');
  IF NOT FOUND THEN RAISE EXCEPTION 'connection not available'; END IF;
  INSERT INTO private.square_disconnects(actor_id,request_id,brewery_id,connection_id,credential_version)
    VALUES(p_actor,p_request_id,p_brewery,p_connection,next_version);
  RETURN QUERY SELECT token,null::jsonb;
END $function$;

CREATE OR REPLACE FUNCTION public.begin_qbo_disconnect (
  p_brewery    uuid,
  p_connection uuid,
  p_actor      uuid,
  p_request_id uuid
)
  RETURNS TABLE (
    refresh_token text,
    replay_result jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_token text; v_version bigint; v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState','unresolved');
begin
 if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and role='admin') then raise exception 'permission denied'; end if;
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

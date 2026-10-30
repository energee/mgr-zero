-- #1659: Server-generated random state is stored only as a digest.
-- Retrying a pending start keeps its intent and expiry but rotates the digest:
-- only the newest returned authorization URL works. Never reopen a consumed,
-- expired or superseded attempt merely because its command id was replayed.
alter table public.chat_installations add column oauth_request_id uuid;

create or replace function public.begin_qbo_oauth(p_brewery uuid, p_redirect_uri text, p_state_hash text, p_provider_intent text, p_request_id uuid, p_requested_scopes text[] DEFAULT ARRAY['com.intuit.quickbooks.accounting'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_id uuid;
begin
  perform private.assert_staff_read(p_brewery, array['admin']::public.staff_role[]);
  if p_requested_scopes<>array['com.intuit.quickbooks.accounting']::text[]
    and p_requested_scopes<>array['com.intuit.quickbooks.accounting','indirect-tax.tax-calculation.quickbooks']::text[] then
    raise exception 'oauth scopes invalid';
  end if;
  perform 1 from public.breweries where id=p_brewery for update;
  v_replay := private.claim_command_request(p_brewery, 'begin_qbo_oauth', p_request_id,
    jsonb_build_object('redirectUri',p_redirect_uri,'providerIntent',p_provider_intent,'requestedScopes',p_requested_scopes));
  if v_replay is not null then
    update private.qbo_oauth_intents set state_hash=p_state_hash
      where id=(v_replay->>'intentId')::uuid and actor_id=auth.uid()
        and exchange_state='pending' and consumed_at is null and expires_at>now();
    if not found then raise exception 'OAuth attempt finished or expired; start a new connection' using errcode='MG409'; end if;
    return v_replay;
  end if;
  update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
  where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
  insert into private.qbo_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at)
  values(p_brewery,(select auth.uid()),p_state_hash,p_redirect_uri,p_provider_intent,p_requested_scopes,now()+interval '10 minutes') returning id into v_id;
  v_replay := jsonb_build_object('intentId',v_id);
  perform private.complete_command_request(p_request_id,v_replay); return v_replay;
end $function$;

create or replace function public.begin_square_oauth (
  p_brewery          uuid,
  p_redirect_uri     text,
  p_state_hash       text,
  p_provider_intent  text,
  p_request_id       uuid,
  p_requested_scopes text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE replay jsonb; intent uuid;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin']::public.staff_role[]);
  IF p_requested_scopes<>ARRAY['ITEMS_READ','ITEMS_WRITE','MERCHANT_PROFILE_READ','ORDERS_READ']::text[] THEN RAISE EXCEPTION 'oauth scopes invalid'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=p_brewery FOR UPDATE;
  replay:=private.claim_command_request(p_brewery,'connect_square',p_request_id,jsonb_build_object('redirectUri',p_redirect_uri,'providerIntent',p_provider_intent,'requestedScopes',p_requested_scopes));
  IF replay IS NOT NULL THEN
    UPDATE private.square_oauth_intents SET state_hash=p_state_hash
      WHERE id=(replay->>'intentId')::uuid AND actor_id=auth.uid()
        AND exchange_state='pending' AND consumed_at IS NULL AND expires_at>now();
    IF NOT FOUND THEN RAISE EXCEPTION 'OAuth attempt finished or expired; start a new connection' USING errcode='MG409'; END IF;
    RETURN replay;
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections WHERE brewery_id=p_brewery AND provider='square' AND remote_revocation_state='pending')
    OR EXISTS(SELECT 1 FROM private.square_oauth_intents WHERE brewery_id=p_brewery AND cleanup_state='pending') THEN
    RAISE EXCEPTION 'Square authorization cleanup is still pending' USING errcode='MG409'; END IF;
  UPDATE private.square_oauth_intents SET consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
    WHERE brewery_id=p_brewery AND exchange_state IN ('pending','exchanging');
  INSERT INTO private.square_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at)
    VALUES(p_brewery,auth.uid(),p_state_hash,p_redirect_uri,p_provider_intent,p_requested_scopes,now()+interval '10 minutes') RETURNING id INTO intent;
  replay:=jsonb_build_object('intentId',intent);
  PERFORM private.complete_command_request(p_request_id,replay);
  RETURN replay;
END $function$;

create or replace function public.begin_chat_installation(p_brewery uuid,p_provider text,p_redirect_uri text,p_state_hash text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'begin_chat_installation',p_request_id,jsonb_build_object('provider',p_provider,'redirect',p_redirect_uri));
  if v_replay is not null then
    update public.chat_installations set oauth_intent_hash=p_state_hash
      where id=(v_replay->>'installation_id')::uuid and brewery_id=p_brewery
        and installer_user_id=auth.uid() and oauth_request_id=p_request_id
        and oauth_consumed_at is null and oauth_expires_at>now()
        and state in ('pending','active','disabled','needs_reauthorization');
    if not found then raise exception 'OAuth attempt finished or expired; start a new connection' using errcode='MG409'; end if;
    return v_replay;
  end if;
  v_result := private.begin_chat_installation(p_brewery,p_provider,p_redirect_uri,p_state_hash);
  update public.chat_installations set oauth_request_id=p_request_id
    where id=(v_result->>'installation_id')::uuid;
  return private.complete_command_request(p_request_id,v_result);
end $$;

create or replace function public.begin_chat_reauthorization(p_brewery uuid,p_installation uuid,p_redirect_uri text,p_state_hash text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'begin_chat_reauthorization',p_request_id,jsonb_build_object('installation',p_installation,'redirect',p_redirect_uri));
  if v_replay is not null then
    update public.chat_installations set oauth_intent_hash=p_state_hash
      where id=(v_replay->>'installation_id')::uuid and brewery_id=p_brewery
        and installer_user_id=auth.uid() and oauth_request_id=p_request_id
        and oauth_consumed_at is null and oauth_expires_at>now()
        and state in ('pending','active','disabled','needs_reauthorization');
    if not found then raise exception 'OAuth attempt finished or expired; start a new connection' using errcode='MG409'; end if;
    return v_replay;
  end if;
  if not exists(select 1 from public.chat_installations where id=p_installation and brewery_id=p_brewery) then raise exception 'permission denied' using errcode='42501'; end if;
  v_result := private.begin_chat_reauthorization(p_installation,p_redirect_uri,p_state_hash);
  update public.chat_installations set oauth_request_id=p_request_id
    where id=(v_result->>'installation_id')::uuid;
  return private.complete_command_request(p_request_id,v_result);
end $$;

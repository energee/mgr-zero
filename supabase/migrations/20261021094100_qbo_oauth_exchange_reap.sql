-- #1034: a QuickBooks connect whose callback dies between Intuit's code
-- exchange and the store write stayed 'exchanging' forever, and the refresh
-- token Intuit issued stayed live with nothing referencing it.
--
-- The callback now holds the issued refresh token (and the callback's realm)
-- on the intent right after the exchange. Storing the connection clears it.
-- The daily retention job reaps what is left: it marks an exchange older than
-- ten minutes for recovery, revokes each held token unless a stored
-- connection uses that realm, then discards it.

alter table private.qbo_oauth_intents
  add column issued_realm_id text,
  add column issued_refresh_token text;

-- Called by the OAuth callback right after the code exchange.
create function public.hold_qbo_oauth_tokens(p_intent uuid, p_actor uuid, p_realm_id text, p_refresh_token text)
returns boolean
language sql
security definer
set search_path to ''
as $function$
  with held as (
    update private.qbo_oauth_intents set issued_realm_id = p_realm_id, issued_refresh_token = p_refresh_token
    where id = p_intent and actor_id = p_actor and exchange_state = 'exchanging'
    returning 1)
  select exists(select 1 from held);
$function$;

-- A completed intent's tokens now belong to the stored connection; keep no copy.
create function private.clear_completed_qbo_oauth_tokens() returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.issued_realm_id := null;
  new.issued_refresh_token := null;
  return new;
end $function$;

create trigger qbo_oauth_intents_clear_completed_tokens
  before update of exchange_state on private.qbo_oauth_intents
  for each row when (new.exchange_state = 'completed')
  execute function private.clear_completed_qbo_oauth_tokens();

-- Marks exchanges older than ten minutes for recovery (the intent itself
-- expires ten minutes after it begins, so no live callback is still in one),
-- then returns every unstored held token for the caller to revoke.
create function public.reap_qbo_oauth_exchanges()
returns table(intent_id uuid, realm_id text, refresh_token text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update private.qbo_oauth_intents set exchange_state = 'recovery_required'
    where exchange_state = 'exchanging' and consumed_at < now() - interval '10 minutes';
  return query select i.id, i.issued_realm_id, i.issued_refresh_token
    from private.qbo_oauth_intents i
    where i.exchange_state = 'recovery_required' and i.issued_refresh_token is not null;
end $function$;

-- Clears a held token after the revoke attempt; the token match keeps a
-- concurrent reap from clearing a different value.
create function public.discard_qbo_oauth_tokens(p_intent uuid, p_refresh_token text)
returns void
language sql
security definer
set search_path to ''
as $function$
  update private.qbo_oauth_intents set issued_realm_id = null, issued_refresh_token = null
  where id = p_intent and issued_refresh_token = p_refresh_token;
$function$;

revoke all on function public.hold_qbo_oauth_tokens(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.hold_qbo_oauth_tokens(uuid, uuid, text, text) to service_role;
revoke all on function public.reap_qbo_oauth_exchanges() from public, anon, authenticated;
grant execute on function public.reap_qbo_oauth_exchanges() to service_role;
revoke all on function public.discard_qbo_oauth_tokens(uuid, text) from public, anon, authenticated;
grant execute on function public.discard_qbo_oauth_tokens(uuid, text) to service_role;
revoke all on function private.clear_completed_qbo_oauth_tokens() from public, anon, authenticated, service_role;

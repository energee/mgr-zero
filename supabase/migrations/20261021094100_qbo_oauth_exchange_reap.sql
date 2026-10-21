-- #1034: a QuickBooks connect whose callback dies between Intuit's code
-- exchange and the store write stayed 'exchanging' forever, and the refresh
-- token Intuit issued stayed live with nothing referencing it.
--
-- The callback now holds the issued refresh token (and the callback's realm)
-- on the intent right after the exchange. Storing the connection clears it.
-- The daily retention job reaps what is left: it marks an exchange older than
-- ten minutes for recovery, revokes each held token unless a stored
-- connection uses that realm, then discards it.
--
-- Ten minutes is safe because no callback can still be running by then: the
-- route has no maxDuration, so Vercel Fluid's 300-second default bounds it,
-- and the token request times out after 20 seconds (lib/qbo.ts, #1032).

alter table private.qbo_oauth_intents
  add column issued_realm_id text,
  add column issued_refresh_token text;

-- Called by the OAuth callback right after the code exchange. The realm is
-- the callback's query parameter, not yet verified by the CompanyInfo read.
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

-- Marks exchanges older than ten minutes for recovery, then returns the held
-- tokens to revoke. Every returned intent is at least ten minutes old,
-- including one a newer connect attempt already moved to recovery_required.
-- An intent is skipped while a newer intent of the same brewery is still
-- live (pending and unexpired, or exchanging; stale exchanges were just
-- marked), or another exchange holds the same realm, because Intuit's revoke
-- could disconnect the company that attempt is connecting.
-- give_up is true from seven days on: a revoke that has failed daily for a
-- week is discarded instead of retried forever.
create function public.reap_qbo_oauth_exchanges()
returns table(intent_id uuid, realm_id text, refresh_token text, give_up boolean)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update private.qbo_oauth_intents set exchange_state = 'recovery_required'
    where exchange_state = 'exchanging' and consumed_at < now() - interval '10 minutes';
  return query select i.id, i.issued_realm_id, i.issued_refresh_token, i.consumed_at < now() - interval '7 days'
    from private.qbo_oauth_intents i
    where i.exchange_state = 'recovery_required' and i.issued_refresh_token is not null
      and i.consumed_at < now() - interval '10 minutes'
      and not exists(select 1 from private.qbo_oauth_intents newer
        where newer.id <> i.id
          and ((newer.exchange_state = 'pending' and newer.expires_at > now()) or newer.exchange_state = 'exchanging')
          and ((newer.brewery_id = i.brewery_id and newer.created_at > i.created_at)
            or newer.issued_realm_id = i.issued_realm_id));
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

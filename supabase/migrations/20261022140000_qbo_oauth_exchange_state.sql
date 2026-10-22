-- A second QuickBooks callback for one consent finds its state already
-- claimed. qbo_oauth_already_completed (20261011120000) told the route only
-- whether the first callback had completed, so a second callback that arrived
-- while the first was still exchanging reported an OAuth error (#1034).
--
-- This replaces it with the intent's exchange_state, so the route can tell
-- 'completed' (report connected) from 'exchanging' (return to Accounting with
-- no flag and let the live connection status show the result). A return type
-- cannot change under create or replace, hence a new function and a drop.
-- Read-only; it never exchanges a code or touches a connection, so a replayed
-- state still grants nothing.

-- security-definer: justified — qbo_oauth_intents is in private and only
-- service_role calls the OAuth RPCs; this returns one state word about the
-- caller's own intent (null when this Admin and brewery have no such intent)
-- and exposes no row.
create function public.qbo_oauth_exchange_state(
  p_state_hash text,
  p_actor      uuid,
  p_brewery    uuid
)
  returns text
  language sql
  stable
  security definer
  set search_path to ''
as $function$
  select i.exchange_state from private.qbo_oauth_intents i
  where i.state_hash = p_state_hash and i.actor_id = p_actor
    and i.brewery_id = p_brewery;
$function$;

revoke all on function public.qbo_oauth_exchange_state(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.qbo_oauth_exchange_state(text, uuid, uuid) to postgres, service_role;

drop function public.qbo_oauth_already_completed(text, uuid, uuid);

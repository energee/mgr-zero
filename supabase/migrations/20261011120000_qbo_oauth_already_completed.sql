-- QuickBooks can deliver the OAuth callback twice for one consent (a resubmitted
-- Connect while the first, slow callback was still exchanging). The first
-- callback consumes the state and connects; the second finds it consumed, so
-- claim_qbo_oauth returns nothing and the route reported "authorization was
-- cancelled" over a connection that had just been made.
--
-- The route asks this after a failed claim: did this Admin already complete
-- this exact state for this brewery? Read-only; it never exchanges a code or
-- touches a connection, so a replayed state still grants nothing.

-- security-definer: justified — qbo_oauth_intents is in private and only
-- service_role calls the OAuth RPCs; this answers one boolean about the
-- caller's own completed intent and exposes no row.
create or replace function public.qbo_oauth_already_completed(
  p_state_hash text,
  p_actor      uuid,
  p_brewery    uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $function$
  select exists(
    select 1 from private.qbo_oauth_intents i
    where i.state_hash = p_state_hash and i.actor_id = p_actor
      and i.brewery_id = p_brewery and i.exchange_state = 'completed'
  );
$function$;

revoke all on function public.qbo_oauth_already_completed(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.qbo_oauth_already_completed(text, uuid, uuid) to postgres, service_role;

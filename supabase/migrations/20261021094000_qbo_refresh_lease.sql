-- #1032: one QuickBooks token refresh at a time per connection.
--
-- The refresh compare-and-swap (cas_integration_tokens,
-- cas_portal_qbo_payment_tokens) keeps the database consistent, but both
-- callers had already sent the same refresh token to Intuit, which retires the
-- previous refresh token when it issues a new one. A lease, held across the
-- HTTP call, lets only one caller send it; the others wait for the new
-- credential_version. The holder releases the lease when it finishes. A
-- holder that crashes leaves the lease to expire after 45 seconds. The token
-- request in lib/qbo.ts times out after 20 seconds, which leaves 25 seconds
-- for the store and release calls. Only a holder whose database calls stall
-- past that can overlap the next holder; the compare-and-swap still keeps one
-- stored winner.

alter table private.integration_tokens
  add column refresh_lease uuid,
  add column refresh_leased_until timestamptz;

-- 'unavailable': the connection is not connected (for example the holder just
-- marked it recovery_required after invalid_grant), or the actor fails the
-- check its compare-and-swap would make: a staff admin/sales member
-- (cas_integration_tokens), or the customer's live portal payment claim
-- (cas_portal_qbo_payment_tokens, as mark_qbo_authorization_failed checks it).
-- Such a caller must not reach Intuit.
-- 'leased': the caller now holds the lease for p_expected_version.
-- 'held': another live lease covers that version; wait and ask again.
-- 'superseded': the credential moved past p_expected_version; re-read it.
create function public.lease_qbo_token_refresh(
  p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint, p_lease uuid,
  p_customer uuid default null, p_invoice uuid default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists(select 1 from public.qbo_connections c
      where c.brewery_id = p_brewery and c.id = p_connection and c.state = 'connected')
    or not (private.actor_has_staff_roles(p_brewery, p_actor, array['admin','sales']::public.staff_role[])
      or exists(select 1 from public.read_portal_qbo_payment(p_brewery, p_customer, p_invoice, p_actor) claim
        where claim.connection_id = p_connection)) then
    return 'unavailable';
  end if;
  update private.integration_tokens t
    set refresh_lease = p_lease, refresh_leased_until = clock_timestamp() + interval '45 seconds'
    where t.brewery_id = p_brewery and t.provider = 'qbo' and t.connection_id = p_connection
      and t.credential_version = p_expected_version
      and (t.refresh_leased_until is null or t.refresh_leased_until <= clock_timestamp());
  if found then return 'leased'; end if;
  perform 1 from private.integration_tokens t
    where t.brewery_id = p_brewery and t.provider = 'qbo' and t.connection_id = p_connection
      and t.credential_version = p_expected_version;
  return case when found then 'held' else 'superseded' end;
end $function$;

-- Clears the lease only if p_lease still holds it, so a holder whose lease
-- expired cannot release a later holder's lease.
create function public.release_qbo_token_refresh(p_brewery uuid, p_connection uuid, p_lease uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  update private.integration_tokens t set refresh_lease = null, refresh_leased_until = null
  where t.brewery_id = p_brewery and t.provider = 'qbo' and t.connection_id = p_connection
    and t.refresh_lease = p_lease;
$function$;

revoke all on function public.lease_qbo_token_refresh(uuid, uuid, uuid, bigint, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.lease_qbo_token_refresh(uuid, uuid, uuid, bigint, uuid, uuid, uuid) to service_role;
revoke all on function public.release_qbo_token_refresh(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_qbo_token_refresh(uuid, uuid, uuid) to service_role;

-- A connect or reconnect replaces the stored credential, so a lease taken on
-- the old one must not survive it. Copied from its latest definition
-- (20261017144100_staff_actor_roles.sql); the only change is that the token
-- upsert also clears refresh_lease and refresh_leased_until.
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
 on conflict(brewery_id,provider) do update set connection_id=excluded.connection_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,refresh_lease=null,refresh_leased_until=null,updated_at=now();
 update private.qbo_oauth_intents set exchange_state='completed' where id=i.id;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(i.brewery_id,v_id,'connected'); return v_id;
end $function$;

-- #1032: one QuickBooks token refresh at a time per connection.
--
-- The refresh compare-and-swap (cas_integration_tokens,
-- cas_portal_qbo_payment_tokens) keeps the database consistent, but both
-- callers had already sent the same refresh token to Intuit, which retires the
-- previous refresh token when it issues a new one. A short lease, held across
-- the HTTP call, lets only one caller send it; the others wait for the new
-- credential_version. The holder releases the lease when it finishes. A
-- holder that crashes leaves the lease to expire after 30 seconds. The lease
-- is not renewed, so an Intuit call slower than 30 seconds lets a second
-- caller refresh too; the compare-and-swap still keeps one stored winner.

alter table private.integration_tokens
  add column refresh_lease uuid,
  add column refresh_leased_until timestamptz;

-- 'leased': the caller now holds the lease for p_expected_version.
-- 'held': another live lease covers that version; wait and ask again.
-- 'superseded': the credential moved past p_expected_version (or is gone);
-- re-read the stored credential instead of refreshing.
-- Service-role only. The caller has already read these tokens through an
-- authorized path, so the lease grants no data.
create function public.lease_qbo_token_refresh(
  p_brewery uuid, p_connection uuid, p_expected_version bigint, p_lease uuid
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update private.integration_tokens t
    set refresh_lease = p_lease, refresh_leased_until = clock_timestamp() + interval '30 seconds'
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

revoke all on function public.lease_qbo_token_refresh(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.lease_qbo_token_refresh(uuid, uuid, bigint, uuid) to service_role;
revoke all on function public.release_qbo_token_refresh(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_qbo_token_refresh(uuid, uuid, uuid) to service_role;

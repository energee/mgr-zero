-- #1634: a live buyer quote authorizes credential refresh, never staff access.
-- Reads and new leases require a live claim. A holder may finish its refresh
-- after quote expiry, using its random lease capability and immutable identity.
-- The store and the failure mark therefore bind the lease as well as the
-- credential version: unlike cas_integration_tokens and
-- cas_portal_qbo_payment_tokens, which re-check a live staff role or payment
-- claim at store time, an expired quote has no live claim left to check.
--
-- One read serves the tax call and its refresh: the tax input comes with the
-- credential version it was read under, so a 401 refreshes that version, and
-- a refresh another quote already stored is re-read, not repeated at Intuit.
create function public.read_portal_quote_tax_tokens(p_brewery uuid, p_customer uuid, p_quote uuid, p_actor uuid)
returns table(connection_id uuid, access_token text, refresh_token text, credential_version bigint,
  access_expires_at timestamptz, refresh_expires_at timestamptz, refresh_hard_expires_at timestamptz, tax_input jsonb)
language sql stable security definer set search_path to '' as $function$
  select claim.connection_id, t.access_token, t.refresh_token, t.credential_version,
    c.access_expires_at, c.refresh_expires_at, c.refresh_hard_expires_at, claim.tax_input
  from public.read_portal_quote_tax(p_brewery,p_customer,p_quote,p_actor) claim
  join private.integration_tokens t on t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=claim.connection_id
  join public.qbo_connections c on c.brewery_id=p_brewery and c.id=claim.connection_id;
$function$;

create function public.lease_portal_quote_tax_refresh(p_brewery uuid, p_customer uuid, p_quote uuid, p_actor uuid,
  p_connection uuid, p_expected_version bigint, p_lease uuid)
returns text language plpgsql security definer set search_path to '' as $function$
begin
  if not exists(select 1 from public.read_portal_quote_tax(p_brewery,p_customer,p_quote,p_actor) claim
      where claim.connection_id=p_connection) then return 'unavailable'; end if;
  update private.integration_tokens t
    set refresh_lease=p_lease, refresh_leased_until=clock_timestamp()+interval '45 seconds'
    where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
      and t.credential_version=p_expected_version
      and (t.refresh_leased_until is null or t.refresh_leased_until<=clock_timestamp());
  if found then return 'leased'; end if;
  perform 1 from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo'
    and t.connection_id=p_connection and t.credential_version=p_expected_version;
  return case when found then 'held' else 'superseded' end;
end $function$;

create function public.cas_portal_quote_tax_tokens(p_brewery uuid, p_customer uuid, p_quote uuid, p_actor uuid,
  p_connection uuid, p_expected_version bigint, p_access_token text, p_refresh_token text,
  p_received_at timestamptz, p_access_seconds integer, p_refresh_seconds integer, p_hard_seconds integer, p_lease uuid)
returns boolean language plpgsql security definer set search_path to '' as $function$
declare v_version bigint;
begin
  update private.integration_tokens t set access_token=p_access_token,refresh_token=p_refresh_token,
    credential_version=t.credential_version+1,updated_at=now()
    where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
      and t.credential_version=p_expected_version and t.refresh_lease=p_lease
      and exists(select 1 from private.portal_order_quotes q
        where q.id=p_quote and q.brewery_id=p_brewery and q.customer_id=p_customer
          and q.actor_id=p_actor and q.connection_id=p_connection)
      and exists(select 1 from public.qbo_connections c
        where c.brewery_id=p_brewery and c.id=p_connection and c.state='connected')
    returning t.credential_version into v_version;
  if not found then return false; end if;
  update public.qbo_connections set access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),
    refresh_expires_at=case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,
    refresh_hard_expires_at=case when p_hard_seconds is null then refresh_hard_expires_at else p_received_at+make_interval(secs=>p_hard_seconds) end,
    credential_version=v_version,updated_at=now() where brewery_id=p_brewery and id=p_connection;
  return true;
end $function$;

create function public.mark_portal_quote_tax_authorization_failed(p_brewery uuid, p_customer uuid, p_quote uuid,
  p_actor uuid, p_connection uuid, p_expected_version bigint, p_lease uuid default null)
returns boolean language plpgsql security definer set search_path to '' as $function$
begin
  -- Use the same credential-before-connection lock order as refresh CAS.
  perform 1 from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo'
    and t.connection_id=p_connection and t.credential_version=p_expected_version
    and (p_lease is null or t.refresh_lease=p_lease) for update;
  if not found then return false; end if;
  update public.qbo_connections c
    set state='recovery_required',last_error='QuickBooks authorization expired or was revoked',updated_at=now()
    where c.brewery_id=p_brewery and c.id=p_connection and c.state='connected'
      and c.credential_version=p_expected_version
      and ((p_lease is null and exists(
        select 1 from public.read_portal_quote_tax(p_brewery,p_customer,p_quote,p_actor) claim
        where claim.connection_id=p_connection))
      or (p_lease is not null and exists(select 1 from private.portal_order_quotes q
        where q.id=p_quote and q.brewery_id=p_brewery and q.customer_id=p_customer
          and q.actor_id=p_actor and q.connection_id=p_connection)));
  return found;
end $function$;

revoke all on function public.read_portal_quote_tax_tokens(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_portal_quote_tax_tokens(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.lease_portal_quote_tax_refresh(uuid,uuid,uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.lease_portal_quote_tax_refresh(uuid,uuid,uuid,uuid,uuid,bigint,uuid) to service_role;
revoke all on function public.cas_portal_quote_tax_tokens(uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,integer,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.cas_portal_quote_tax_tokens(uuid,uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,integer,integer,integer,uuid) to service_role;
revoke all on function public.mark_portal_quote_tax_authorization_failed(uuid,uuid,uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.mark_portal_quote_tax_authorization_failed(uuid,uuid,uuid,uuid,uuid,bigint,uuid) to service_role;

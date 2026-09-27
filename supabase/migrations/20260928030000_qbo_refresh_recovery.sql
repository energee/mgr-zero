-- A rejected refresh may only retire the credential that made the request.
-- Keep the credential for the existing disconnect/revocation workflow.
create function public.mark_qbo_authorization_failed(
  p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint,
  p_customer uuid default null, p_invoice uuid default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_changed integer;
begin
  -- Refresh CAS locks the credential before updating connection health too.
  perform 1 from private.integration_tokens t
    where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
      and t.credential_version=p_expected_version for update;
  if not found then return false; end if;

  update public.qbo_connections c
    set state='recovery_required', last_error='QuickBooks authorization expired or was revoked', updated_at=now()
    where c.brewery_id=p_brewery and c.id=p_connection and c.state='connected'
      and c.credential_version=p_expected_version
      and (exists(select 1 from public.brewery_users u
        where u.brewery_id=p_brewery and u.user_id=p_actor and u.role in ('admin','sales'))
        or exists(select 1 from public.read_portal_qbo_payment(p_brewery,p_customer,p_invoice,p_actor) claim
          where claim.connection_id=p_connection and claim.credential_version=p_expected_version));
  get diagnostics v_changed = row_count;
  return v_changed=1;
end;
$$;
revoke all on function public.mark_qbo_authorization_failed(uuid,uuid,uuid,bigint,uuid,uuid) from public, anon, authenticated;
grant execute on function public.mark_qbo_authorization_failed(uuid,uuid,uuid,bigint,uuid,uuid) to service_role;

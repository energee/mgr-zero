-- Central service-actor authorization. The later multi-role cutover replaces
-- this helper, so receipt Bill completion does not depend on a scalar role.
create function private.actor_has_staff_roles(p_brewery uuid,p_actor uuid,p_roles public.staff_role[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.brewery_users u
    where u.brewery_id=p_brewery and u.user_id=p_actor and u.role=any(p_roles));
$$;
revoke all on function private.actor_has_staff_roles(uuid,uuid,public.staff_role[]) from public,anon,authenticated,service_role;

-- Copied from 20261017143000_receipt_qbo_bills.sql; only actor authorization changes.
create or replace function public.finish_qbo_receipt_bill(p_brewery uuid,p_receipt uuid,p_actor uuid,p_provider_request_id uuid,p_remote_id text,p_error text,p_response jsonb,p_definitive_rejection boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bill private.qbo_receipt_bills; v_receipt public.receipts;
begin
  if not private.actor_has_staff_roles(p_brewery,p_actor,array['admin']::public.staff_role[]) then
    raise insufficient_privilege using message='permission denied';
  end if;
  select * into v_bill from private.qbo_receipt_bills where brewery_id=p_brewery and receipt_id=p_receipt and provider_request_id=p_provider_request_id for update;
  if not found then raise exception 'Bill request not found'; end if;
  perform 1 from public.qbo_connections where id=v_bill.connection_id and brewery_id=p_brewery and realm_id=v_bill.realm_id and state='connected' for share;
  if not found then
    raise exception 'QuickBooks connection changed; Bill reconciliation not recorded' using errcode='MG409';
  end if;
  select * into v_receipt from public.receipts where id=p_receipt for update;
  if v_receipt.qbo_bill_request_id is distinct from p_provider_request_id then raise exception 'Bill attempt superseded' using errcode='MG409'; end if;
  if v_receipt.qbo_bill_id is not null and p_remote_id is not null and p_remote_id is distinct from v_receipt.qbo_bill_id then
    raise exception 'Bill identity already recorded' using errcode='MG409';
  end if;
  if p_remote_id is not null then
    if nullif(btrim(p_remote_id),'') is null then raise exception 'Bill identity required'; end if;
    update public.receipts set qbo_bill_id=p_remote_id,qbo_bill_status='pushed',qbo_bill_error=null where id=p_receipt;
    update private.qbo_receipt_bills set status='pushed',response=p_response,error=null where id=v_bill.id;
  elsif v_receipt.qbo_bill_id is null then
    update public.receipts set qbo_bill_error=p_error,qbo_bill_status=case when p_definitive_rejection then 'push_failed' else qbo_bill_status end where id=p_receipt;
    update private.qbo_receipt_bills set error=p_error,status=case when p_definitive_rejection then 'push_failed' else status end where id=v_bill.id;
  end if;
  return jsonb_build_object('receiptId',p_receipt,'status',case when coalesce(p_remote_id,v_receipt.qbo_bill_id) is not null then 'pushed' when p_definitive_rejection then 'push_failed' else v_bill.status end,'remoteId',coalesce(p_remote_id,v_receipt.qbo_bill_id));
end $$;

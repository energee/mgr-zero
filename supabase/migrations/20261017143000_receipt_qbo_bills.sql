-- Freeze each Bill attempt before sending. Reconcile by document identity before
-- replaying its exact request ID; only definite rejections permit a new snapshot.
alter table public.vendors add column qbo_realm_id text;
alter table public.qbo_connections add column qbo_purchase_account_id text;
alter table public.receipts
  add column qbo_bill_id text,
  add column qbo_bill_request_id uuid unique,
  add column qbo_bill_status text check (qbo_bill_status in ('pending','pushed','push_failed')),
  add column qbo_bill_error text;

create table private.qbo_receipt_bills (
  id uuid primary key default private.new_uuid(),
  receipt_id uuid not null,
  brewery_id uuid not null references public.breweries(id),
  connection_id uuid not null,
  realm_id text not null,
  provider_request_id uuid not null unique,
  request_body text not null,
  response jsonb,
  status text not null default 'pending' check (status in ('pending','pushed','push_failed')),
  error text,
  created_at timestamptz not null default now(),
  -- connection_id is historical evidence, not a foreign key to the mutable
  -- current connection ID (OAuth replaces it when the company changes).
  foreign key (receipt_id,brewery_id) references public.receipts(id,brewery_id)
);
create unique index qbo_receipt_bill_live on private.qbo_receipt_bills(receipt_id) where status<>'push_failed';
create index qbo_receipt_bill_history on private.qbo_receipt_bills(receipt_id,created_at desc);
alter table private.qbo_receipt_bills enable row level security;
revoke all on private.qbo_receipt_bills from public, anon, authenticated, service_role;

create function public.set_qbo_vendor_mapping(p_brewery uuid,p_vendor uuid,p_qbo_vendor_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_realm text;
begin
  perform private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  if nullif(btrim(p_qbo_vendor_id),'') is null then raise exception 'QuickBooks vendor ID required'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_vendor_mapping',p_request_id,
    jsonb_build_object('vendorId',p_vendor,'qboVendorId',btrim(p_qbo_vendor_id)));
  if v_replay is not null then return v_replay; end if;
  select realm_id into v_realm from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if not found then raise exception 'Connect QuickBooks in Settings → Accounting first'; end if;
  update public.vendors set qbo_vendor_id=btrim(p_qbo_vendor_id),qbo_realm_id=v_realm where id=p_vendor and brewery_id=p_brewery;
  if not found then raise exception 'vendor not found'; end if;
  return private.complete_command_request(p_request_id,jsonb_build_object('vendorId',p_vendor,'qboVendorId',btrim(p_qbo_vendor_id),'realmId',v_realm));
end $$;

create function public.set_qbo_purchase_account(p_brewery uuid,p_qbo_account_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  if nullif(btrim(p_qbo_account_id),'') is null then raise exception 'QuickBooks purchase account ID required'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_purchase_account',p_request_id,jsonb_build_object('qboAccountId',btrim(p_qbo_account_id)));
  if v_replay is not null then return v_replay; end if;
  update public.qbo_connections set qbo_purchase_account_id=btrim(p_qbo_account_id) where brewery_id=p_brewery and state='connected';
  if not found then raise exception 'Connect QuickBooks in Settings → Accounting first'; end if;
  return private.complete_command_request(p_request_id,jsonb_build_object('qboAccountId',btrim(p_qbo_account_id)));
end $$;

create function private.clear_qbo_purchase_mappings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.realm_id is distinct from new.realm_id then
    new.qbo_purchase_account_id:=null;
    update public.vendors set qbo_vendor_id=null,qbo_realm_id=null where brewery_id=old.brewery_id;
  end if;
  return new;
end $$;
create trigger clear_qbo_purchase_mappings before update of realm_id on public.qbo_connections
for each row execute function private.clear_qbo_purchase_mappings();

create function public.start_qbo_receipt_bill(p_brewery uuid,p_receipt uuid,p_request_id uuid,p_new_attempt_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_receipt public.receipts; v_conn public.qbo_connections; v_vendor public.vendors;
  v_po public.purchase_orders; v_bill private.qbo_receipt_bills; v_chain uuid[];
  v_replay jsonb; v_lines jsonb; v_key uuid; v_body jsonb;
begin
  perform private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  if p_new_attempt_reason is not null and p_new_attempt_reason<>'corrected' then raise exception 'invalid Bill attempt reason'; end if;
  v_replay:=private.claim_command_request(p_brewery,'post_receipt_bill',p_request_id,
    jsonb_strip_nulls(jsonb_build_object('receiptId',p_receipt,'newAttemptReason',p_new_attempt_reason)));
  select * into v_receipt from public.receipts where id=p_receipt and brewery_id=p_brewery;
  if not found then raise exception 'receipt not found'; end if;
  -- Same PO-before-receipt lock order as correct_purchase_receipt.
  select * into v_po from public.purchase_orders where id=v_receipt.po_id and brewery_id=p_brewery for update;
  select * into v_receipt from public.receipts where id=p_receipt and brewery_id=p_brewery for update;
  with recursive ancestors as (
    select id,corrects_receipt_id from public.receipts where id=p_receipt and brewery_id=p_brewery
    union all select r.id,r.corrects_receipt_id from public.receipts r join ancestors a on r.id=a.corrects_receipt_id
  ) select array_agg(id) into v_chain from ancestors;
  if v_replay is not null then
    select * into v_bill from private.qbo_receipt_bills where id=(v_replay->>'billAttemptId')::uuid and receipt_id=any(v_chain);
    if not found then raise exception 'Bill request snapshot missing'; end if;
  else
    select * into v_bill from private.qbo_receipt_bills where receipt_id=any(v_chain) order by created_at desc,id desc limit 1;
  end if;
  if v_bill.id is not null then
    select * into v_receipt from public.receipts where id=v_bill.receipt_id;
    if v_bill.status='push_failed' and (v_replay is not null or p_new_attempt_reason is null) then
      if v_replay is null then perform private.complete_command_request(p_request_id,jsonb_build_object('billAttemptId',v_bill.id)); end if;
      return jsonb_build_object('receiptId',v_bill.receipt_id,'status','push_failed','error',v_bill.error);
    end if;
    -- Completed Bills remain tied to their original company, even after reconnect.
    if v_bill.status='pushed' then
      if v_replay is null then perform private.complete_command_request(p_request_id,jsonb_build_object('billAttemptId',v_bill.id)); end if;
      return jsonb_build_object('receiptId',v_bill.receipt_id,'status','pushed','remoteId',v_bill.response->>'Id');
    end if;
    select * into v_conn from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
    if not found or v_conn.id<>v_bill.connection_id or v_conn.realm_id<>v_bill.realm_id then
      raise exception 'QuickBooks connection changed; frozen Bill must be reconciled in its original company' using errcode='MG409';
    end if;
    if p_new_attempt_reason='corrected' and v_replay is null then
      if v_bill.status<>'push_failed' then raise exception 'Only a definitive rejected Bill allows a corrected attempt; reconcile the pending Bill' using errcode='MG409'; end if;
      -- A rejected attempt is known not to have posted; preserve its immutable
      -- snapshot and use the latest receipt facts for the explicit new attempt.
      select * into v_receipt from public.receipts where id=p_receipt;
    else
      if v_replay is null then perform private.complete_command_request(p_request_id,jsonb_build_object('billAttemptId',v_bill.id)); end if;
      return jsonb_build_object('receiptId',v_bill.receipt_id,'status',v_bill.status,'mayPost',false,
        'error',v_bill.error,'providerRequestId',v_bill.provider_request_id,'requestBody',v_bill.request_body,'realmId',v_bill.realm_id,'connectionId',v_bill.connection_id);
    end if;
  end if;
  if p_new_attempt_reason='corrected' and v_bill.id is null then raise exception 'A corrected Bill requires a definitive rejected attempt'; end if;
  if exists(select 1 from public.receipts where corrects_receipt_id=p_receipt) then
    raise exception 'Receipt superseded; open its latest revision before posting a Bill';
  end if;
  select * into v_conn from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if not found then raise exception 'Connect QuickBooks in Settings → Accounting first'; end if;
  select * into v_vendor from public.vendors where id=v_po.vendor_id and brewery_id=p_brewery;
  if nullif(v_vendor.qbo_vendor_id,'') is null or v_vendor.qbo_realm_id is distinct from v_conn.realm_id then
    raise exception 'Map this vendor in Settings → Accounting → QuickBooks mappings';
  end if;
  if nullif(v_conn.qbo_purchase_account_id,'') is null then
    raise exception 'Map the purchase account for all materials in Settings → Accounting → QuickBooks mappings';
  end if;
  if exists(select 1 from public.receipt_lines rl left join public.material_movements m on m.id=rl.movement_id and m.brewery_id=rl.brewery_id
    where rl.receipt_id=p_receipt and rl.qty_counted>0 and (m.id is null or m.unit_cost_cents is null)) then
    raise exception 'Receipt material has no recorded unit cost; enter a priced PO and receipt before posting a Bill';
  end if;
  select jsonb_agg(jsonb_build_object('DetailType','AccountBasedExpenseLineDetail',
    'Description',coalesce(rl.material_name,mat.name)||' · '||rl.qty_counted::text||' '||coalesce(rl.purchase_uom::text,'purchase units'),
    'Amount',round(m.qty*m.unit_cost_cents)/100,
    'AccountBasedExpenseLineDetail',jsonb_build_object('AccountRef',jsonb_build_object('value',v_conn.qbo_purchase_account_id))) order by rl.id)
    into v_lines from public.receipt_lines rl
    join public.material_movements m on m.id=rl.movement_id and m.brewery_id=rl.brewery_id
    join public.materials mat on mat.id=m.material_id and mat.brewery_id=m.brewery_id
    where rl.receipt_id=p_receipt and rl.qty_counted>0;
  if v_lines is null then raise exception 'A Bill requires a positive counted receipt quantity'; end if;
  v_key:=private.new_uuid();
  v_body:=jsonb_build_object('VendorRef',jsonb_build_object('value',v_vendor.qbo_vendor_id),'TxnDate',v_receipt.received_on,
    'DocNumber','MGR-'||left(replace(v_key::text,'-',''),17),'PrivateNote','MGR receipt bill '||v_key::text,'Line',v_lines);
  insert into private.qbo_receipt_bills(receipt_id,brewery_id,connection_id,realm_id,provider_request_id,request_body)
    values(p_receipt,p_brewery,v_conn.id,v_conn.realm_id,v_key,v_body::text) returning * into v_bill;
  update public.receipts set qbo_bill_request_id=v_key,qbo_bill_status='pending',qbo_bill_error=null where id=p_receipt;
  perform private.complete_command_request(p_request_id,jsonb_build_object('billAttemptId',v_bill.id));
  return jsonb_build_object('receiptId',p_receipt,'status','pending','mayPost',true,'providerRequestId',v_key,
    'requestBody',v_body::text,'realmId',v_conn.realm_id,'connectionId',v_conn.id);
end $$;

-- Service-only outcome recording: only the token/transport boundary calls this.
create function public.finish_qbo_receipt_bill(p_brewery uuid,p_receipt uuid,p_actor uuid,p_provider_request_id uuid,p_remote_id text,p_error text,p_response jsonb,p_definitive_rejection boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bill private.qbo_receipt_bills; v_receipt public.receipts;
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and role='admin') then
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

revoke all on function public.set_qbo_vendor_mapping(uuid,uuid,text,uuid),public.set_qbo_purchase_account(uuid,text,uuid),public.start_qbo_receipt_bill(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.set_qbo_vendor_mapping(uuid,uuid,text,uuid),public.set_qbo_purchase_account(uuid,text,uuid),public.start_qbo_receipt_bill(uuid,uuid,uuid,text) to authenticated;
revoke all on function private.clear_qbo_purchase_mappings() from public,anon,authenticated,service_role;
revoke all on function public.finish_qbo_receipt_bill(uuid,uuid,uuid,uuid,text,text,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.finish_qbo_receipt_bill(uuid,uuid,uuid,uuid,text,text,jsonb,boolean) to service_role;

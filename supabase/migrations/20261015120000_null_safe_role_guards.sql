-- #895: public.staff_role(b) is NULL for a user who is not a member of b, and
-- `NULL <> 'admin'` (or `NULL not in (...)`) is NULL, so these QuickBooks
-- guards never raised for a non-member: any signed-in user could start OAuth,
-- set mappings and push defaults, or push an invoice on another brewery.
-- Each function is restated exactly as it stood except for its guard line.
-- Five raised 42501 'permission denied', which is what private.assert_staff
-- raises, so they now call it like every other staff RPC. begin_qbo_oauth
-- raised a plain exception (P0001), so it keeps an inline guard, made
-- NULL-safe with `is distinct from`, to keep that error class.
-- create or replace keeps owner, grants and comments.

CREATE OR REPLACE FUNCTION public.begin_qbo_oauth(p_brewery uuid, p_redirect_uri text, p_state_hash text, p_provider_intent text, p_request_id uuid, p_requested_scopes text[] DEFAULT ARRAY['com.intuit.quickbooks.accounting'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_id uuid;
begin
  if public.staff_role(p_brewery) is distinct from 'admin' then raise exception 'permission denied'; end if;
  if p_requested_scopes<>array['com.intuit.quickbooks.accounting']::text[]
    and p_requested_scopes<>array['com.intuit.quickbooks.accounting','indirect-tax.tax-calculation.quickbooks']::text[] then
    raise exception 'oauth scopes invalid';
  end if;
  perform 1 from public.breweries where id=p_brewery for update;
  v_replay := private.claim_command_request(p_brewery, 'begin_qbo_oauth', p_request_id,
    jsonb_build_object('redirectUri',p_redirect_uri,'stateHash',p_state_hash,'providerIntent',p_provider_intent,'requestedScopes',p_requested_scopes));
  if v_replay is not null then return v_replay; end if;
  update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
  where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
  insert into private.qbo_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at)
  values(p_brewery,(select auth.uid()),p_state_hash,p_redirect_uri,p_provider_intent,p_requested_scopes,now()+interval '10 minutes') returning id into v_id;
  v_replay := jsonb_build_object('intentId',v_id);
  perform private.complete_command_request(p_request_id,v_replay); return v_replay;
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_push_defaults(p_brewery uuid, p_allow_ach boolean, p_allow_card boolean, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_push_defaults',p_request_id,
    jsonb_build_object('allowAch',p_allow_ach,'allowCard',p_allow_card));
  if v_replay is not null then return v_replay; end if;
  update public.qbo_connections set allow_online_ach_payment=p_allow_ach,
    allow_online_credit_card_payment=p_allow_card,updated_at=now()
    where brewery_id=p_brewery and state='connected';
  if not found then raise exception 'QuickBooks connection required'; end if;
  v_result:=jsonb_build_object('allowAch',p_allow_ach,'allowCard',p_allow_card);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_deposit_mapping(p_brewery uuid, p_qbo_item_id text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  if nullif(btrim(p_qbo_item_id),'') is null then raise exception 'QuickBooks deposit item mapping required'; end if;
  perform 1 from public.qbo_connections where brewery_id=p_brewery and state='connected' for update;
  if not found then raise exception 'QuickBooks connection required'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_deposit_mapping',p_request_id,
    jsonb_build_object('qboItemId',p_qbo_item_id));
  if v_replay is not null then return v_replay; end if;
  update public.qbo_connections set qbo_deposit_item_id=btrim(p_qbo_item_id),updated_at=now() where brewery_id=p_brewery;
  v_result:=jsonb_build_object('qboItemId',btrim(p_qbo_item_id));
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_item_mapping(p_brewery uuid, p_sku uuid, p_qbo_item_id text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_realm text; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  select realm_id into v_realm from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if v_realm is null then raise exception 'QuickBooks connection required'; end if;
  if nullif(btrim(p_qbo_item_id),'') is null then raise exception 'QuickBooks item mapping required'; end if;
  if not exists(select 1 from public.skus where id=p_sku and brewery_id=p_brewery) then raise exception 'SKU not found'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_item_mapping',p_request_id,
    jsonb_build_object('skuId',p_sku,'qboItemId',p_qbo_item_id));
  if v_replay is not null then return v_replay; end if;
  update public.skus set qbo_item_id=btrim(p_qbo_item_id),qbo_realm_id=v_realm where id=p_sku and brewery_id=p_brewery;
  v_result:=jsonb_build_object('skuId',p_sku,'qboItemId',btrim(p_qbo_item_id),'realmId',v_realm);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_customer_mapping(p_brewery uuid, p_customer uuid, p_qbo_customer_id text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_realm text; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  select realm_id into v_realm from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if v_realm is null then raise exception 'QuickBooks connection required'; end if;
  if nullif(btrim(p_qbo_customer_id),'') is null then raise exception 'QuickBooks customer mapping required'; end if;
  if not exists(select 1 from public.customers where id=p_customer and brewery_id=p_brewery) then raise exception 'customer not found'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_customer_mapping',p_request_id,
    jsonb_build_object('customerId',p_customer,'qboCustomerId',p_qbo_customer_id));
  if v_replay is not null then return v_replay; end if;
  update public.customers set qbo_customer_id=btrim(p_qbo_customer_id),qbo_realm_id=v_realm
    where id=p_customer and brewery_id=p_brewery;
  v_result:=jsonb_build_object('customerId',p_customer,'qboCustomerId',btrim(p_qbo_customer_id),'realmId',v_realm);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.start_qbo_push(p_brewery uuid, p_invoice uuid, p_new_attempt_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.invoices; v_conn public.qbo_connections; v_customer public.customers;
  v_push public.qbo_pushes; v_previous public.qbo_pushes; v_ship public.ship_tos;
  v_replay jsonb; v_result jsonb; v_lines jsonb; v_snapshot_lines jsonb;
  v_body jsonb; v_address jsonb; v_email text; v_key uuid; v_reason text;
  v_invalid int; v_unmapped int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if p_new_attempt_reason is not null and p_new_attempt_reason not in ('corrected','remote_deleted') then raise exception 'invalid QuickBooks attempt reason'; end if;

  v_replay:=private.claim_command_request(p_brewery,'push_invoice_to_qbo',p_request_id,
    jsonb_strip_nulls(jsonb_build_object('invoiceId',p_invoice,'newAttemptReason',p_new_attempt_reason)));
  if v_replay is not null then
    select * into v_push from public.qbo_pushes
      where id=nullif(v_replay->>'pushId','')::uuid and brewery_id=p_brewery and invoice_id=p_invoice for update;
    if found and v_push.status<>'pending' then
      return jsonb_strip_nulls(jsonb_build_object('pushId',v_push.id,'status',v_push.status,
        'remoteId',v_push.qbo_entity_id,'error',v_push.error,'alreadyFinished',true));
    end if;
  end if;

  select * into v_conn from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if not found then raise exception 'QuickBooks connection required'; end if;
  select * into v_inv from public.invoices where id=p_invoice and brewery_id=p_brewery for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.written_off_at is not null then raise exception 'written-off invoice cannot be pushed'; end if;
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_push from public.qbo_pushes where invoice_id=p_invoice and status='pending' order by created_at desc,id desc limit 1;
  if found then
    if v_push.connection_id<>v_conn.id or v_push.realm_id<>v_conn.realm_id then
      raise exception 'QuickBooks connection changed; pending push remains frozen and cannot be retargeted' using errcode='MG409';
    end if;
    v_result:=jsonb_build_object('pushId',v_push.id,'providerRequestId',v_push.provider_request_id,
      'finishRequestId',v_push.finish_request_id,'requestBody',v_push.request_body,'entityType',v_push.entity_type,
      'realmId',v_push.realm_id,'connectionId',v_push.connection_id,'status',v_push.status);
    return private.complete_command_request(p_request_id,v_result);
  end if;

  select * into v_previous from public.qbo_pushes where invoice_id=p_invoice order by created_at desc,id desc limit 1;
  if p_new_attempt_reason='corrected' and (v_previous.id is null or v_previous.status<>'push_failed') then
    raise exception 'a corrected QuickBooks attempt requires a definitive rejected push';
  elsif p_new_attempt_reason='remote_deleted' and (v_inv.qbo_invoice_id is null or v_inv.qbo_remote_state<>'deleted') then
    raise exception 'deleted QuickBooks document recreation is not available';
  elsif p_new_attempt_reason is null and v_previous.status='push_failed' then
    raise exception 'choose corrected after fixing the QuickBooks mapping';
  elsif p_new_attempt_reason is null and v_inv.qbo_invoice_id is not null then
    v_result:=jsonb_build_object('status','pushed','remoteId',v_inv.qbo_invoice_id,'alreadyPushed',true);
    return private.complete_command_request(p_request_id,v_result);
  end if;

  select * into v_customer from public.customers where id=v_inv.customer_id and brewery_id=p_brewery;
  if nullif(v_customer.qbo_customer_id,'') is null or v_customer.qbo_realm_id is distinct from v_conn.realm_id then
    raise exception 'QuickBooks customer mapping required';
  end if;
  select st.* into v_ship from public.shipments sh
    join public.orders o on o.id=sh.order_id and o.brewery_id=sh.brewery_id
    join public.ship_tos st on st.id=o.ship_to_id and st.brewery_id=o.brewery_id
    where sh.id=v_inv.shipment_id and sh.brewery_id=p_brewery;
  if not found then
    select * into v_ship from public.ship_tos where customer_id=v_inv.customer_id and brewery_id=p_brewery and is_default limit 1;
  end if;
  if v_ship.id is not null then
    v_address:=jsonb_strip_nulls(jsonb_build_object('Line1',v_ship.address1,'Line2',v_ship.address2,
      'City',v_ship.city,'CountrySubDivisionCode',v_ship.state,'PostalCode',v_ship.zip));
  end if;
  select min(u.email::text) into v_email from public.customer_users cu join auth.users u on u.id=cu.user_id
    where cu.customer_id=v_inv.customer_id;

  select count(*) filter(where
      (v_inv.kind='invoice' and (il.kind not in ('sku','keg_deposit') or il.qty<=0 or il.unit_price_cents<0 or il.amount_cents<0))
      or (v_inv.kind='credit_memo' and (il.kind not in ('sku','keg_deposit_refund') or il.qty>=0 or il.unit_price_cents<0 or il.amount_cents>=0))),
    count(*) filter(where
      (il.kind='sku' and (s.qbo_item_id is null or s.qbo_realm_id is distinct from v_conn.realm_id))
      or (il.kind in ('keg_deposit','keg_deposit_refund') and v_conn.qbo_deposit_item_id is null))
    into v_invalid,v_unmapped
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;
  if not exists(select 1 from public.invoice_lines where invoice_id=p_invoice and brewery_id=p_brewery) then raise exception 'invoice lines required'; end if;
  if v_invalid>0 then raise exception 'QuickBooks does not support this invoice line shape'; end if;
  if v_unmapped>0 then
    if exists(select 1 from public.invoice_lines where invoice_id=p_invoice and kind in ('keg_deposit','keg_deposit_refund')) and v_conn.qbo_deposit_item_id is null
      then raise exception 'QuickBooks deposit item mapping required'; end if;
    raise exception 'QuickBooks item mapping required';
  end if;

  select jsonb_agg(jsonb_build_object(
      'Amount',round((case when v_inv.kind='credit_memo' then -il.amount_cents else il.amount_cents end)::numeric/100,2),
      'Description',il.description,
      'DetailType','SalesItemLineDetail',
      'SalesItemLineDetail',jsonb_build_object(
        'ItemRef',jsonb_build_object('value',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id else s.qbo_item_id end),
        'Qty',case when v_inv.kind='credit_memo' then -il.qty else il.qty end,
        'UnitPrice',round(il.unit_price_cents::numeric/100,2))) order by il.id),
    jsonb_agg(jsonb_build_object('id',il.id,'kind',il.kind,'skuId',il.sku_id,'qty',il.qty,
      'unitPriceCents',il.unit_price_cents,'amountCents',il.amount_cents,
      'qboItemId',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id else s.qbo_item_id end) order by il.id)
    into v_lines,v_snapshot_lines
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;

  v_body:=jsonb_strip_nulls(jsonb_build_object(
    'CustomerRef',jsonb_build_object('value',v_customer.qbo_customer_id),
    'DocNumber',v_inv.invoice_no::text,'TxnDate',v_inv.issued_on,
    'DueDate',case when v_inv.kind='invoice' then v_inv.due_on end,
    'AllowOnlineACHPayment',case when v_inv.kind='invoice' then v_conn.allow_online_ach_payment end,
    'AllowOnlineCreditCardPayment',case when v_inv.kind='invoice' then v_conn.allow_online_credit_card_payment end,
    'BillAddr',v_address,'BillEmail',case when v_email is null then null else jsonb_build_object('Address',v_email) end,
    'Line',v_lines));
  v_reason:=coalesce(p_new_attempt_reason,'initial');
  v_key:=case when v_previous.id is null and p_new_attempt_reason is null then v_inv.qbo_idempotency_key else private.new_uuid() end;
  if v_key is distinct from v_inv.qbo_idempotency_key then update public.invoices set qbo_idempotency_key=v_key where id=p_invoice; end if;
  insert into public.qbo_pushes(brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
    request_body,local_snapshot,attempt_reason,supersedes_push_id)
  values(p_brewery,p_invoice,v_conn.id,v_conn.realm_id,case when v_inv.kind='credit_memo' then 'CreditMemo' else 'Invoice' end,
    v_key,v_body::text,jsonb_build_object('invoice',jsonb_build_object('id',v_inv.id,'kind',v_inv.kind,'invoiceNo',v_inv.invoice_no,
      'issuedOn',v_inv.issued_on,'dueOn',v_inv.due_on,'customerId',v_inv.customer_id,'qboCustomerId',v_customer.qbo_customer_id,
      'address',v_address,'email',v_email),'lines',v_snapshot_lines),v_reason,v_previous.id)
  returning * into v_push;
  update public.invoices set qbo_sync_status='pending',qbo_sync_error=null where id=p_invoice;
  v_result:=jsonb_build_object('pushId',v_push.id,'providerRequestId',v_push.provider_request_id,
    'finishRequestId',v_push.finish_request_id,'requestBody',v_push.request_body,'entityType',v_push.entity_type,
    'realmId',v_push.realm_id,'connectionId',v_push.connection_id,'status',v_push.status);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

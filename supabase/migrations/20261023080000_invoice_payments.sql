-- Invoice payments recorded in MGR (#1045, docs/plans/invoice-local-payments.md).
-- Owner decision 2026-10-22: only an invoice with no QuickBooks identity takes
-- a local payment; corrections void a payment, never edit or delete it; only
-- Admin and Sales write; a QuickBooks push of an invoice with an unvoided
-- local payment is refused. Paid in full sets invoices.paid_at, the paid
-- marker every reader already uses (record_historical_order does the same).
-- Both tables are append-only ledgers (baseline convention): a void is its own
-- row, as inventory_movements.compensates_id points at the row it reverses.

create table public.invoice_payments (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  invoice_id uuid not null,
  amount_cents int not null check (amount_cents > 0),
  received_on date not null,
  -- Mirrored by PAYMENT_METHODS, as deliveries.refusal_reason is by REFUSAL_REASONS.
  method text not null check (method in ('cash','check','ach','other')),
  reference text check (reference is null or (btrim(reference) <> '' and length(reference) <= 200)),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (invoice_id, brewery_id) references public.invoices (id, brewery_id)
);
-- Leads with brewery_id for the staff_read policy; serves the per-invoice sums.
create index invoice_payments_brewery_invoice on public.invoice_payments (brewery_id, invoice_id);

create table public.invoice_payment_voids (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  payment_id uuid not null,
  reason text not null check (btrim(reason) <> '' and length(reason) <= 500),
  voided_by uuid not null references auth.users(id),
  voided_at timestamptz not null default now(),
  unique (id, brewery_id),
  -- One void per payment; leads with brewery_id for the staff_read policy.
  unique (brewery_id, payment_id),
  foreign key (payment_id, brewery_id) references public.invoice_payments (id, brewery_id)
);

alter table public.invoice_payments enable row level security;
alter table public.invoice_payment_voids enable row level security;
revoke all on public.invoice_payments, public.invoice_payment_voids from public, anon, authenticated, service_role;
grant select on public.invoice_payments, public.invoice_payment_voids to authenticated;
-- The roles of get_invoice and list_invoices, which read them (#770).
create policy staff_read on public.invoice_payments for select to authenticated using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse']::public.staff_role[])))
);
create policy staff_read on public.invoice_payment_voids for select to authenticated using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse']::public.staff_role[])))
);

-- Copied from private.preserve_reporting_basis_history
-- (20261017093900_reporting_basis_correction.sql:39); only the message differs.
create function private.preserve_invoice_payment_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'invoice payment history is immutable; void a payment instead';
end $$;
revoke all on function private.preserve_invoice_payment_history() from public, anon, authenticated, service_role;
create trigger immutable_history before update or delete on public.invoice_payments
  for each row execute function private.preserve_invoice_payment_history();
create trigger immutable_history before update or delete on public.invoice_payment_voids
  for each row execute function private.preserve_invoice_payment_history();

-- Copied from: 20260910120847_deploy_current_schema.sql:1748; only
-- local_paid_cents is new, appended last as create or replace view requires.
-- list_invoices reads it beside subtotal_cents in the same request.
-- collected_cents stays QuickBooks cash only; local_paid_cents is the ledger's
-- unvoided sum. A reader wanting all cash collected adds both for a
-- ledger-owned invoice (docs/plans/invoice-local-payments.md, Design 6).
create or replace view public.invoice_totals with (security_invoker = true) as
select i.id as invoice_id,
  i.brewery_id,
  i.customer_id,
  i.kind,
  i.qbo_sync_status,
  i.paid_at,
  coalesce(sum(l.amount_cents), 0)::int as subtotal_cents,
  i.qbo_tax_cents,
  i.qbo_total_cents,
  i.qbo_balance_cents,
  case when i.kind = 'invoice' and i.qbo_remote_state = 'live' and i.written_off_at is null
    then i.qbo_cash_collected_cents else 0 end as collected_cents,
  (select coalesce(sum(p.amount_cents), 0)::int from public.invoice_payments p
    where p.invoice_id = i.id and p.brewery_id = i.brewery_id
      and not exists (select 1 from public.invoice_payment_voids v
        where v.payment_id = p.id and v.brewery_id = p.brewery_id)) as local_paid_cents
from public.invoices i
left join public.invoice_lines l on l.invoice_id = i.id
group by i.id;

-- Record one payment received outside QuickBooks. Admin or Sales, replayable.
create function public.record_invoice_payment(
  p_brewery uuid, p_invoice uuid, p_amount_cents int, p_received_on date,
  p_method text, p_reference text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_inv public.invoices; v_tz text;
  v_total int; v_paid int; v_payment uuid; v_reference text := nullif(btrim(p_reference), '');
begin
  v_actor := private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_invoice_payment', p_request_id,
    jsonb_build_object('invoiceId', p_invoice, 'amountCents', p_amount_cents, 'receivedOn', p_received_on,
      'method', p_method, 'reference', v_reference));
  if v_replay is not null then return v_replay; end if;

  -- for update: start_qbo_push locks the same row, so a push and a payment serialize.
  select * into v_inv from public.invoices where id = p_invoice and brewery_id = p_brewery for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'only an invoice takes a payment'; end if;
  if v_inv.qbo_invoice_id is not null then raise exception 'this invoice is in QuickBooks; record its payment there'; end if;
  if v_inv.written_off_at is not null then raise exception 'a written-off invoice takes no payment'; end if;  -- Q6
  -- Covers a historical invoice (Q7) and one marked paid before a company change (Q4).
  if v_inv.paid_at is not null then raise exception 'this invoice is already paid'; end if;
  -- Any connection: a push frozen by a company or connection change also refuses (Q3).
  if exists (select 1 from public.qbo_pushes where invoice_id = p_invoice and brewery_id = p_brewery and status = 'pending')
    then raise exception 'a QuickBooks push of this invoice is unresolved; retry it first'; end if;  -- Q3
  -- Only an invoice whose identity a company change purged reaches this (Q4).
  if exists (select 1 from public.qbo_pushes where invoice_id = p_invoice and brewery_id = p_brewery and status = 'pushed')
    then raise exception 'this invoice was in a previous QuickBooks company; push it to the current one'; end if;  -- Q4
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'a payment must be more than $0.00'; end if;
  if p_received_on is null or p_method is null then raise exception 'a payment needs a received date and a method'; end if;
  if length(v_reference) > 200 then raise exception 'a payment reference is at most 200 characters'; end if;
  select timezone into v_tz from public.breweries where id = p_brewery;
  -- A date before issued_on is allowed: a prepayment (Q10).
  if p_received_on > (now() at time zone v_tz)::date then
    raise exception 'a payment cannot be received in the future'; end if;

  select coalesce(sum(amount_cents), 0) into v_total from public.invoice_lines
    where invoice_id = p_invoice and brewery_id = p_brewery;
  select coalesce(sum(local_paid_cents), 0) into v_paid from public.invoice_totals
    where invoice_id = p_invoice and brewery_id = p_brewery;
  -- Also refuses every payment on a $0.00 invoice: nothing is due (Design 4).
  if p_amount_cents > v_total - v_paid then  -- Q1
    raise exception 'a payment cannot be more than the balance due'; end if;

  insert into public.invoice_payments (brewery_id, invoice_id, amount_cents, received_on, method, reference, recorded_by)
  values (p_brewery, p_invoice, p_amount_cents, p_received_on, p_method, v_reference, v_actor)
  returning id into v_payment;
  -- Paid in full: the brewery-local start of the received day, as record_historical_order dates paid_at.
  if v_paid + p_amount_cents = v_total then
    update public.invoices set paid_at = p_received_on::timestamp at time zone v_tz
      where id = p_invoice and brewery_id = p_brewery;
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object(
    'paymentId', v_payment, 'invoiceId', p_invoice, 'balanceCents', v_total - v_paid - p_amount_cents));
end $$;
revoke all on function public.record_invoice_payment(uuid, uuid, int, date, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_invoice_payment(uuid, uuid, int, date, text, text, uuid)
  to authenticated;

-- Void one payment with a reason: the only correction (owner decision).
-- It appends a void row; the payment row is never changed.
-- No QuickBooks check: start_qbo_push refuses an invoice with an unvoided
-- payment, so a payment that can still be voided is never on a QuickBooks invoice.
create function public.void_invoice_payment(p_brewery uuid, p_payment uuid, p_reason text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_payment public.invoice_payments; v_inv public.invoices;
  v_total int; v_paid int;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) > 500 then
    raise exception 'void reason must be 1 to 500 characters'; end if;
  v_replay := private.claim_command_request(p_brewery, 'void_invoice_payment', p_request_id,
    jsonb_build_object('paymentId', p_payment, 'reason', btrim(p_reason)));
  if v_replay is not null then return v_replay; end if;

  select * into v_payment from public.invoice_payments where id = p_payment and brewery_id = p_brewery;
  if not found then raise exception 'payment not found'; end if;
  -- The invoice row lock serializes two voids of one payment, and a void with a
  -- payment or a push (the lock order of record_invoice_payment and start_qbo_push).
  select * into v_inv from public.invoices where id = v_payment.invoice_id and brewery_id = p_brewery for update;
  if exists (select 1 from public.invoice_payment_voids where payment_id = p_payment and brewery_id = p_brewery)
    then raise exception 'this payment is already voided'; end if;

  insert into public.invoice_payment_voids (brewery_id, payment_id, reason, voided_by)
  values (p_brewery, p_payment, btrim(p_reason), v_actor);
  select coalesce(sum(amount_cents), 0) into v_total from public.invoice_lines
    where invoice_id = v_inv.id and brewery_id = p_brewery;
  select coalesce(sum(local_paid_cents), 0) into v_paid from public.invoice_totals
    where invoice_id = v_inv.id and brewery_id = p_brewery;
  -- record_invoice_payment refuses an invoice already paid, so on an invoice
  -- with payments only the ledger set paid_at; below the total it clears.
  if v_paid < v_total then
    update public.invoices set paid_at = null where id = v_inv.id and brewery_id = p_brewery;
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object(
    'paymentId', p_payment, 'invoiceId', v_inv.id, 'balanceCents', v_total - v_paid));
end $$;
revoke all on function public.void_invoice_payment(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_invoice_payment(uuid, uuid, text, uuid) to authenticated;

-- Copied from: 20261016100800_historical_orders.sql; only the local-payment refusal is new.
-- It sits beside the written-off and historical refusals, after the invoice row lock.
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
  if v_inv.qbo_sync_status = 'not_synced' then raise exception 'historical invoices are not sent to QuickBooks'; end if;
  if exists (select 1 from public.invoice_payments p where p.invoice_id=p_invoice and p.brewery_id=p_brewery
      and not exists (select 1 from public.invoice_payment_voids v where v.payment_id=p.id and v.brewery_id=p.brewery_id))
    then raise exception 'payments for this invoice are recorded in MGR, so it is not sent to QuickBooks'; end if;  -- Q8: voided payments do not block
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
      'City',v_ship.city,'CountrySubDivisionCode',v_ship.state,'PostalCode',v_ship.zip,'Country',v_ship.country));
  end if;
  select min(u.email::text) into v_email from public.customer_users cu join auth.users u on u.id=cu.user_id
    where cu.customer_id=v_inv.customer_id;

  select count(*) filter(where
      (v_inv.kind='invoice' and (il.kind not in ('sku','keg_deposit','one_way_keg_fee') or il.qty<=0 or il.unit_price_cents<0 or il.amount_cents<0))
      or (v_inv.kind='credit_memo' and (il.kind not in ('sku','keg_deposit_refund') or il.qty>=0 or il.unit_price_cents<0 or il.amount_cents>=0))),
    count(*) filter(where
      (il.kind='sku' and (s.qbo_item_id is null or s.qbo_realm_id is distinct from v_conn.realm_id))
      or (il.kind in ('keg_deposit','keg_deposit_refund') and v_conn.qbo_deposit_item_id is null)
      or (il.kind='one_way_keg_fee' and v_conn.qbo_one_way_fee_item_id is null))
    into v_invalid,v_unmapped
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;
  if not exists(select 1 from public.invoice_lines where invoice_id=p_invoice and brewery_id=p_brewery) then raise exception 'invoice lines required'; end if;
  if v_invalid>0 then raise exception 'QuickBooks does not support this invoice line shape'; end if;
  if v_unmapped>0 then
    if exists(select 1 from public.invoice_lines where invoice_id=p_invoice and kind in ('keg_deposit','keg_deposit_refund')) and v_conn.qbo_deposit_item_id is null
      then raise exception 'QuickBooks deposit item mapping required'; end if;
    if exists(select 1 from public.invoice_lines where invoice_id=p_invoice and kind='one_way_keg_fee') and v_conn.qbo_one_way_fee_item_id is null
      then raise exception 'map the one-way keg fee item'; end if;
    raise exception 'QuickBooks item mapping required';
  end if;

  select jsonb_agg(jsonb_build_object(
      'Amount',round((case when v_inv.kind='credit_memo' then -il.amount_cents else il.amount_cents end)::numeric/100,2),
      'Description',il.description,
      'DetailType','SalesItemLineDetail',
      'SalesItemLineDetail',jsonb_build_object(
        'ItemRef',jsonb_build_object('value',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id when il.kind='one_way_keg_fee' then v_conn.qbo_one_way_fee_item_id else s.qbo_item_id end),
        'Qty',case when v_inv.kind='credit_memo' then -il.qty else il.qty end,
        'UnitPrice',round(il.unit_price_cents::numeric/100,2))) order by il.id),
    jsonb_agg(jsonb_build_object('id',il.id,'kind',il.kind,'skuId',il.sku_id,'qty',il.qty,
      'unitPriceCents',il.unit_price_cents,'amountCents',il.amount_cents,
      'qboItemId',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id when il.kind='one_way_keg_fee' then v_conn.qbo_one_way_fee_item_id else s.qbo_item_id end) order by il.id)
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

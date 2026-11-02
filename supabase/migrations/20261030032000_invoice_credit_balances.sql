-- Credit linked, live credit-memo lines against an MGR-owned invoice (#1627).
-- Gross document totals and cash remain separate. A negative net balance is
-- credit owed to the buyer; it is not silently discarded or applied elsewhere.
-- Copies: invoice_totals, record_invoice_payment and void_invoice_payment from
-- 20261023130000_invoice_payments.sql; only the credit term changes their math.

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
        where v.payment_id = p.id and v.brewery_id = p.brewery_id)) as local_paid_cents,
  (select coalesce(-sum(c.amount_cents), 0)::int
    from public.invoice_lines original
    join public.invoice_lines c on c.credited_invoice_line_id = original.id and c.brewery_id = original.brewery_id
    join public.invoices memo on memo.id = c.invoice_id and memo.brewery_id = c.brewery_id
    where original.invoice_id = i.id and original.brewery_id = i.brewery_id
      and memo.kind = 'credit_memo' and memo.qbo_remote_state = 'live' and memo.written_off_at is null) as local_credit_cents
from public.invoices i
left join public.invoice_lines l on l.invoice_id = i.id
group by i.id;

create or replace function public.record_invoice_payment(
  p_brewery uuid, p_invoice uuid, p_amount_cents int, p_received_on date,
  p_method text, p_reference text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_inv public.invoices; v_tz text;
  v_total int; v_paid_before int; v_payment uuid; v_reference text := nullif(btrim(p_reference), '');
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
  if v_inv.written_off_at is not null then raise exception 'a written-off invoice takes no payment'; end if;
  -- Covers a historical invoice and one marked paid before a company change.
  if v_inv.paid_at is not null then raise exception 'this invoice is already paid'; end if;
  -- Any connection: a push frozen by a company or connection change also refuses.
  if exists (select 1 from public.qbo_pushes where invoice_id = p_invoice and brewery_id = p_brewery and status = 'pending')
    then raise exception 'a QuickBooks push of this invoice is unresolved; retry it first'; end if;
  -- Only an invoice whose identity a company change purged reaches this.
  if exists (select 1 from public.qbo_pushes where invoice_id = p_invoice and brewery_id = p_brewery and status = 'pushed')
    then raise exception 'this invoice was in a previous QuickBooks company; push it to the current one'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'a payment must be more than $0.00'; end if;
  if p_received_on is null or p_method is null then raise exception 'a payment needs a received date and a method'; end if;
  if length(v_reference) > 200 then raise exception 'a payment reference is at most 200 characters'; end if;
  select timezone into v_tz from public.breweries where id = p_brewery;
  -- A date before issued_on is allowed: a prepayment.
  if p_received_on > (now() at time zone v_tz)::date then
    raise exception 'a payment cannot be received in the future'; end if;

  select subtotal_cents - local_credit_cents, local_paid_cents into v_total, v_paid_before
    from public.invoice_totals where invoice_id = p_invoice and brewery_id = p_brewery;
  -- Also refuses every payment on a $0.00 invoice: nothing is due.
  if p_amount_cents > v_total - v_paid_before then
    raise exception 'a payment cannot be more than the balance due'; end if;

  insert into public.invoice_payments (brewery_id, invoice_id, amount_cents, received_on, method, reference, recorded_by)
  values (p_brewery, p_invoice, p_amount_cents, p_received_on, p_method, v_reference, v_actor)
  returning id into v_payment;
  -- Paid in full: the brewery-local start of the latest received day among the
  -- unvoided payments, as record_historical_order dates paid_at. A backdated
  -- payment can complete the total, so this payment's day is not always the last.
  if v_paid_before + p_amount_cents = v_total then
    update public.invoices set paid_at = (select max(p.received_on) from public.invoice_payments p
        where p.invoice_id = p_invoice and p.brewery_id = p_brewery
          and not exists (select 1 from public.invoice_payment_voids v where v.payment_id = p.id and v.brewery_id = p.brewery_id)
      )::timestamp at time zone v_tz
      where id = p_invoice and brewery_id = p_brewery;
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object(
    'paymentId', v_payment, 'invoiceId', p_invoice, 'balanceCents', v_total - v_paid_before - p_amount_cents));
end $$;
revoke all on function public.record_invoice_payment(uuid, uuid, int, date, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_invoice_payment(uuid, uuid, int, date, text, text, uuid)
  to authenticated;

create or replace function public.void_invoice_payment(p_brewery uuid, p_payment uuid, p_reason text, p_request_id uuid)
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
  -- The invoice row lock serializes two voids of the same payment.
  -- It also orders a void against record_invoice_payment and start_qbo_push,
  -- which lock the same row.
  select * into v_inv from public.invoices where id = v_payment.invoice_id and brewery_id = p_brewery for update;
  if exists (select 1 from public.invoice_payment_voids where payment_id = p_payment and brewery_id = p_brewery)
    then raise exception 'this payment is already voided'; end if;

  insert into public.invoice_payment_voids (brewery_id, payment_id, reason, voided_by)
  values (p_brewery, p_payment, btrim(p_reason), v_actor);
  select subtotal_cents - local_credit_cents, local_paid_cents into v_total, v_paid
    from public.invoice_totals where invoice_id = v_inv.id and brewery_id = p_brewery;
  -- A void reopens the invoice only when cash plus linked credits no longer
  -- covers its frozen total.
  if v_paid < v_total then
    update public.invoices set paid_at = null where id = v_inv.id and brewery_id = p_brewery;
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object(
    'paymentId', p_payment, 'invoiceId', v_inv.id, 'balanceCents', v_total - v_paid));
end $$;
revoke all on function public.void_invoice_payment(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.void_invoice_payment(uuid, uuid, text, uuid) to authenticated;

-- Reuse paid_at as the closure marker read by unpaid filters and the portal.
-- Credit closure is dated when it happens, not presented as a cash receipt.
-- The invoice lock is shared with payments, voids, returns and QuickBooks push.
create function private.refresh_credited_invoice(p_invoice uuid) returns void
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_total int; v_paid int; v_credit int;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found or v_inv.kind <> 'invoice' or v_inv.qbo_invoice_id is not null
    or v_inv.qbo_sync_status = 'not_synced' or v_inv.written_off_at is not null
    or v_inv.qbo_remote_state <> 'live' then return; end if;
  if exists (select 1 from public.qbo_pushes where invoice_id = v_inv.id
    and brewery_id = v_inv.brewery_id and status in ('pending','pushed')) then return; end if;
  select subtotal_cents, local_paid_cents, local_credit_cents into v_total, v_paid, v_credit
    from public.invoice_totals where invoice_id = v_inv.id and brewery_id = v_inv.brewery_id;
  update public.invoices set paid_at = case
    when v_paid + v_credit >= v_total and v_total > 0 then coalesce(paid_at, now())
    else null end
    where id = v_inv.id and brewery_id = v_inv.brewery_id;
end $$;
revoke all on function private.refresh_credited_invoice(uuid) from public, anon, authenticated, service_role;

-- Like private.set_invoice_due_on, these private definer triggers derive state
-- from tenant-bound references. They need ledger reads unavailable to service_role.
create function private.refresh_credit_line_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_credited_invoice((select invoice_id from public.invoice_lines
    where id = new.credited_invoice_line_id and brewery_id = new.brewery_id));
  return new;
end $$;
revoke all on function private.refresh_credit_line_balance() from public, anon, authenticated, service_role;
create trigger refresh_credit_balance after insert on public.invoice_lines
  for each row when (new.credited_invoice_line_id is not null)
  execute function private.refresh_credit_line_balance();

-- A memo later voided/deleted in QuickBooks no longer reduces the local balance.
create function private.refresh_credit_memo_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_invoice uuid;
begin
  for v_invoice in select distinct original.invoice_id
    from public.invoice_lines c join public.invoice_lines original
      on original.id = c.credited_invoice_line_id and original.brewery_id = c.brewery_id
    where c.invoice_id = new.id and c.brewery_id = new.brewery_id
  loop
    perform private.refresh_credited_invoice(v_invoice);
  end loop;
  return new;
end $$;
revoke all on function private.refresh_credit_memo_balance() from public, anon, authenticated, service_role;
create trigger refresh_credit_balance after update of qbo_remote_state, written_off_at on public.invoices
  for each row when (new.kind = 'credit_memo' and
    (old.qbo_remote_state is distinct from new.qbo_remote_state or old.written_off_at is distinct from new.written_off_at))
  execute function private.refresh_credit_memo_balance();

-- Existing returns must stop stranding balances as soon as this migration lands.
do $$
declare v_invoice uuid;
begin
  for v_invoice in select distinct original.invoice_id
    from public.invoice_lines c join public.invoice_lines original
      on original.id = c.credited_invoice_line_id and original.brewery_id = c.brewery_id
  loop
    perform private.refresh_credited_invoice(v_invoice);
  end loop;
end $$;

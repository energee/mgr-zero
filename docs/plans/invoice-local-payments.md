# Record an invoice payment in MGR without QuickBooks (#1045)

Status: plan, awaiting owner approval. No implementation code until it is
approved and the open questions below are answered. Implementation branch:
`feat/1045-local-payments`, PR to `main`.

## Goal

Admin or Sales record a payment on an invoice that QuickBooks never received.
MGR's own record then drives that invoice's paid state, balance, overdue flag
and its row in the AR list (the Invoices register). A brewery without
QuickBooks finally sees overdue invoices, and can say an invoice was paid.

## Owner decisions

The binding decision, quoted from the issue comment "Owner decision —
2026-10-22":

> - Only invoices with **no QuickBooks identity** (no `qbo_invoice_id`) can take a local payment.
> - Payments go in a ledger (amount, received date, method cash/check/ACH/other, optional reference, actor). Corrections are made by voiding, never by editing or deleting.
> - The MGR-derived balance drives paid, overdue and AR for those invoices.
> - A QBO push of an invoice that has local payments is refused, with a reason, rather than reconciled automatically.
> - Only Admin and Sales can write.

The earlier triage comment (2026-10-22) also binds: a null QuickBooks balance
is never treated as zero, as paid, or as an inferred amount owed.

That answers the issue's four questions. Scope: any invoice with no QuickBooks
identity, at any brewery. What wins later: nothing is reconciled; a push is
refused. Partial payments: yes, a ledger of amounts allows them. Method and
reference: method required, reference optional.

### One reading, stated (AGENTS.md Negative 15)

"Those invoices" is read as **every invoice with no QuickBooks identity**, not
only invoices that already have a local payment. The issue's problem statement
is "a brewery without QuickBooks never sees an overdue invoice". Only this
reading fixes it. The consequences are listed under "What changes on the
register" below. If the owner meant the narrower reading, tasks 6 and 7 change
and the two #1025 tests named in task 7 stay as they are.

## What exists (searched 2026-10-22 on `dd266cd2`, equal to `origin/main`)

| Piece | Where | Reuse |
| --- | --- | --- |
| Payment ledger | none. `grep -rn "payment" supabase/migrations` finds only `payment_terms`, portal online pay and QuickBooks sync | build new |
| A set-once correction on an invoice | `write_off_invoice` (`20260910120847_deploy_current_schema.sql:1656`): `written_off_at`, `written_off_by`, `written_off_reason`, a 1–500 character reason, Admin, replayable | **yes**: the void columns and reason rule copy it |
| Immutable-row trigger | `private.preserve_reporting_basis_history` (`20261017093900_reporting_basis_correction.sql:39`) | **yes**: the same trigger shape, allowing only the void |
| A paid invoice with no QuickBooks balance | `record_historical_order` (`20261016100800_historical_orders.sql:14`) sets `paid_at` to the brewery-local start of the day; `invoiceCurrentState` reads `paid_at` + null balance as `paid` | **yes**: the ledger stamps `paid_at` the same way, so every existing reader says Paid |
| Line total of an invoice | `public.invoice_totals` view, `subtotal_cents` (`20260910120847_deploy_current_schema.sql:1748`); `list_invoices` already reads it | **yes**: append `local_paid_cents` to it; no extra round trip |
| Push guard | `public.start_qbo_push`, latest body `20261016100800_historical_orders.sql:88` (refuses written-off and historical invoices) | **yes**: one more refusal beside those two |
| Role check in an authenticated RPC | `private.assert_staff(p_brewery, roles)`, as `start_qbo_push` and `save_batch_pulls` use. `private.actor_has_staff_roles` (`20261017144100_staff_actor_roles.sql:4`) is for service-only RPCs that receive a trusted actor, so it is not used here | **yes**: `assert_staff` |
| Read policy shape | `staff_read ... my_staff_brewery_ids(array[...])` (`20261022080000_staff_read_policies_once_per_query.sql`), roles matching the reading command (#770, `tests/rls-taproom.test.ts:98`) | **yes** |
| Presentation | `invoiceCurrentState` (`lib/mgr/invoice-state.ts`), `toInvoiceListRow` (`lib/mgr/invoices-view.ts`), `toInvoiceViewProps` (`lib/mgr/invoice-view.ts`), `qboInvoicePresentation` (`lib/mgr/qbo-ui.ts:36`) | **yes**: each gains the ledger branch; no second state machine |
| Money field and form | `dollarsInput` / `toCents` (`lib/mgr/money.ts`); `KegPoolFields` + `PoolForm` (`components/mgr/views/keg-fleet.tsx`, `app/(app)/kegs/pool-form.tsx`): `E.edit(..., "number", { step: 0.01 })` inside `CommandForm` | **yes**: the payment form copies this shape |
| Reason dialog | Write off in `QboInvoiceActions` (`app/(app)/settings/accounting/qbo-controls.tsx:86`) | **yes**: the Void dialog copies it |
| Option list for a picker | `lib/mgr/enums.ts` (imports nothing); labels in `lib/mgr/labels.ts` (`PAYMENT_TERM_LABEL`) | **yes**: `PAYMENT_METHODS`, `PAYMENT_METHOD_LABEL` |
| API reference area | `API_AREAS` in `lib/mgr/api-operations.ts`: the `orders` rule matches `invoice`; no earlier rule matches `record_invoice_payment` or `void_invoice_payment` | **yes**: no new rule; run `bun run docs:api` |

No open PR or branch covers #1045. Issue #1135 (open) edits the same
register copy (`lib/mgr/invoices-view.ts`, the Invoices page). Whichever lands
second merges the other's wording.

## Design

1. **Ledger.** `public.invoice_payments` holds one row per payment. A void sets
   `voided_at`, `voided_by` and `void_reason` once, as a write-off does. A
   trigger refuses every other update and every delete. Application roles can
   only read it; two RPCs write it.
2. **Who owns the balance.** MGR's ledger owns an invoice's balance when all
   three hold:
   - QuickBooks has never identified it (`qbo_invoice_id` is null).
   - No push is in flight for it (Q3).
   - Nothing outside the ledger marked it paid: no `paid_at` without a local
     payment (a historical import, or a previous QuickBooks company; Q4, Q7).

   Then the balance is the line total minus unvoided payments. Otherwise the
   balance is QuickBooks', and may be unknown, exactly as today.
3. **Paid state.** When payments reach the total, `record_invoice_payment` sets
   `invoices.paid_at`. A void that drops below the total clears it. This
   stores a fact that could be derived. It is safe because an invoice's lines
   are frozen at issue, both RPCs hold the invoice row lock, and only the
   ledger can set `paid_at` on such an invoice (a payment is refused once
   `paid_at` is set). In exchange, every existing reader of paid state (the
   register, invoice detail, `portal_invoices`, the portal views) says Paid
   with no change.
4. **Push refusal.** `start_qbo_push` refuses an invoice with an unvoided
   local payment. `record_invoice_payment` refuses an invoice with a pending
   push. Both lock the invoice row first, so they serialize, and an invoice can
   never reach QuickBooks with a payment already on it.

### What changes on the register (read before approving)

- Every invoice with no QuickBooks identity now shows a balance. These are
  invoices never pushed, rejected by QuickBooks, at a brewery that never
  connected, or reset by a company change. The balance is the total minus
  recorded payments, and the invoice can be **Overdue**. Today these read
  **Payment status unavailable** or **Payment unverified** and are never
  overdue (#1025).
- **Payment unverified** retires. A rejected push created no QuickBooks
  document, so MGR's ledger owns that invoice's balance.
- An invoice whose push result is unknown keeps the unknown balance and is not
  overdue (Q3). So does a QuickBooks invoice that has not synced yet.
- Once an invoice has a payment, the detail page drops Push. The Accounting
  column says **Payments recorded in MGR**.

## Open questions for the owner

Each has a recommended default. The plan and SQL below are written with the
defaults; lines that depend on an answer carry a `-- Qn` comment. Say which to
change.

| # | Question | Recommended default | Why | Tasks that depend on it |
| --- | --- | --- | --- | --- |
| Q1 | **Overpayment / credit balance.** May unvoided payments add up to more than the total? | Refuse a payment above the remaining balance. | No credit balance, refund or carry-forward to model. The register's **Credit balance** caption stays QuickBooks-only. | 2 (RPC check), 6 (balance never below zero), 8 and 10 (form maximum) |
| Q2 | **Credit memos.** Does a credit memo against a local invoice lower its MGR balance? | No. The credit memo stays its own register row, as today. | The decision names payments only. Netting needs `create_credit_memo_impl` to set or clear `paid_at` too. **Cost of the default:** after a return, an invoice keeps the credited amount due and cannot reach Paid if the customer pays the net. If that is unacceptable, netting is a follow-up issue. | Netting would add a `create_credit_memo_impl` copy to task 1 and a credit term to tasks 2, 6, 8 |
| Q3 | **Push in flight.** An invoice with a pending push has no `qbo_invoice_id` yet. May it take a payment? | Refuse while a push is pending. Its balance stays unknown. | A push that finishes after the payment would give a paid invoice a QuickBooks identity. The refusal closes that race. | 2, 6, 7 |
| Q4 | **Company change.** `private.purge_qbo_identity` clears `qbo_invoice_id` on every non-historical invoice when the realm changes. Should those invoices take local payments? | Follow the literal rule for one that was unpaid: it takes payments, and then its re-push is refused. One already marked paid keeps `paid_at` through the purge, so it takes none and still reads Paid. | No predicate on push history. The same `paid_at` check covers Q7. | 2, 6 |
| Q5 | **Portal.** Should the portal show the MGR-derived paid state and balance? | No portal code change. Paid in full shows as Paid already, through `paid_at`. A partial payment shows no remaining balance, because the portal shows totals only. Online pay stays QuickBooks-only. | Nothing to build for Paid. A balance needs a new `portal_invoices` projection. | Default: none. "Show the balance" adds a task: a new migration for `portal_invoices`, `lib/mgr/portal-invoice(s)-view.ts`, `portal-guide.mdx` |
| Q6 | **Written-off invoices.** May one take a local payment? | Refuse. | `invoiceCurrentState` already puts written-off before paid. Write-off means nothing is collected. | 2, 6 |
| Q7 | **Historical invoices** (`not_synced`, recorded paid before the books opened). They have no `qbo_invoice_id`, so the literal rule admits them. | Refuse. `record_historical_order` already set `paid_at`. They keep reading **Paid**. | A second payment record for an import would double-count. | 2, 6 |
| Q8 | **Voided payments and push.** Is an invoice whose payments are all voided pushable? | Yes. Only an unvoided payment blocks a push. | A voided payment did not happen. | 3, 9 |

## Schema — `supabase/migrations/20261022130000_invoice_payments.sql`

The name sorts after the latest file on `origin/main`,
`20261022120000_brew_pulls.sql`. If `main` moves first, rename to a later
timestamp before `bun run migrations:lock`.

```sql
-- Invoice payments recorded in MGR (#1045, docs/plans/invoice-local-payments.md).
-- Owner decision 2026-10-22: only an invoice with no QuickBooks identity takes
-- a local payment; corrections void a payment, never edit or delete it; only
-- Admin and Sales write; a QuickBooks push of an invoice with an unvoided
-- local payment is refused. Paid in full sets invoices.paid_at, the paid
-- marker every reader already uses (record_historical_order does the same).

create type public.payment_method as enum ('cash', 'check', 'ach', 'other');

create table public.invoice_payments (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  invoice_id uuid not null,
  amount_cents int not null check (amount_cents > 0),
  received_on date not null,
  method public.payment_method not null,
  reference text check (reference is null or (btrim(reference) <> '' and length(reference) <= 200)),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or (btrim(void_reason) <> '' and length(void_reason) <= 500)),
  unique (id, brewery_id),
  foreign key (invoice_id, brewery_id) references public.invoices (id, brewery_id),
  -- A void sets all three at once, as write_off_invoice sets its three.
  check ((voided_at is null) = (voided_by is null) and (voided_at is null) = (void_reason is null))
);
-- Leads with brewery_id for the staff_read policy; serves the per-invoice sums.
create index invoice_payments_brewery_invoice on public.invoice_payments (brewery_id, invoice_id);
alter table public.invoice_payments enable row level security;
revoke all on public.invoice_payments from public, anon, authenticated, service_role;
grant select on public.invoice_payments to authenticated;
-- The roles of get_invoice and list_invoices, which read it (#770).
create policy staff_read on public.invoice_payments for select to authenticated using (
  (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse']::public.staff_role[])))
);

-- Void-only: a payment is never deleted, and the void is its one change.
create function private.invoice_payments_void_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'an invoice payment is never deleted; void it'; end if;
  if old.voided_at is not null or new.voided_at is null
     or (new.id, new.brewery_id, new.invoice_id, new.amount_cents, new.received_on, new.method,
         new.reference, new.recorded_by, new.recorded_at)
        is distinct from
        (old.id, old.brewery_id, old.invoice_id, old.amount_cents, old.received_on, old.method,
         old.reference, old.recorded_by, old.recorded_at)
  then raise exception 'an invoice payment is never edited; void it'; end if;
  return new;
end $$;
revoke all on function private.invoice_payments_void_only() from public, anon, authenticated, service_role;
create trigger void_only before update or delete on public.invoice_payments
  for each row execute function private.invoice_payments_void_only();

-- Copied from: 20260910120847_deploy_current_schema.sql:1748; only
-- local_paid_cents is new, appended last as create or replace view requires.
-- list_invoices reads it beside subtotal_cents in the same request.
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
    where p.invoice_id = i.id and p.brewery_id = i.brewery_id and p.voided_at is null) as local_paid_cents
from public.invoices i
left join public.invoice_lines l on l.invoice_id = i.id
group by i.id;

-- Record one payment received outside QuickBooks. Admin or Sales, replayable.
create function public.record_invoice_payment(
  p_brewery uuid, p_invoice uuid, p_amount_cents int, p_received_on date,
  p_method public.payment_method, p_reference text, p_request_id uuid
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
  -- Covers a historical invoice and one paid in a previous QuickBooks company (Q4, Q7).
  if v_inv.paid_at is not null then raise exception 'this invoice is already paid'; end if;
  if exists (select 1 from public.qbo_pushes where invoice_id = p_invoice and brewery_id = p_brewery and status = 'pending')
    then raise exception 'a QuickBooks push of this invoice is unresolved; retry it first'; end if;  -- Q3
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'a payment must be more than $0.00'; end if;
  if p_received_on is null or p_method is null then raise exception 'a payment needs a received date and a method'; end if;
  if length(v_reference) > 200 then raise exception 'a payment reference is at most 200 characters'; end if;

  select coalesce(sum(amount_cents), 0) into v_total from public.invoice_lines
    where invoice_id = p_invoice and brewery_id = p_brewery;
  select coalesce(sum(amount_cents), 0) into v_paid from public.invoice_payments
    where invoice_id = p_invoice and brewery_id = p_brewery and voided_at is null;
  if p_amount_cents > v_total - v_paid then  -- Q1
    raise exception 'a payment cannot be more than the balance due'; end if;

  insert into public.invoice_payments (brewery_id, invoice_id, amount_cents, received_on, method, reference, recorded_by)
  values (p_brewery, p_invoice, p_amount_cents, p_received_on, p_method, v_reference, v_actor)
  returning id into v_payment;
  -- Paid in full: the brewery-local start of the received day, as record_historical_order dates paid_at.
  if v_paid + p_amount_cents = v_total then
    select timezone into v_tz from public.breweries where id = p_brewery;
    update public.invoices set paid_at = p_received_on::timestamp at time zone v_tz
      where id = p_invoice and brewery_id = p_brewery;
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object(
    'paymentId', v_payment, 'invoiceId', p_invoice, 'balanceCents', v_total - v_paid - p_amount_cents));
end $$;
revoke all on function public.record_invoice_payment(uuid, uuid, int, date, public.payment_method, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_invoice_payment(uuid, uuid, int, date, public.payment_method, text, uuid)
  to authenticated;

-- Void one payment with a reason: the only correction (owner decision).
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
  -- The invoice row first: the same lock order as record_invoice_payment and start_qbo_push.
  select * into v_inv from public.invoices where id = v_payment.invoice_id and brewery_id = p_brewery for update;
  select * into v_payment from public.invoice_payments where id = p_payment and brewery_id = p_brewery for update;
  if v_payment.voided_at is not null then raise exception 'this payment is already voided'; end if;

  update public.invoice_payments set voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason)
    where id = p_payment and brewery_id = p_brewery;
  select coalesce(sum(amount_cents), 0) into v_total from public.invoice_lines
    where invoice_id = v_inv.id and brewery_id = p_brewery;
  select coalesce(sum(amount_cents), 0) into v_paid from public.invoice_payments
    where invoice_id = v_inv.id and brewery_id = p_brewery and voided_at is null;
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
  if exists (select 1 from public.invoice_payments where invoice_id=p_invoice and brewery_id=p_brewery and voided_at is null)
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
```

`create or replace function` keeps `start_qbo_push`'s existing grants. The
generated types (`bun run types:database`) gain the table, the enum, the view
column and both RPCs.

## Commands and reads

| Name | Kind | Roles | Input (zod) | Calls |
| --- | --- | --- | --- | --- |
| `record_invoice_payment` | command | `[...salesRoles]` | `{ invoiceId: z.string().uuid(), amountCents: z.number().int().positive(), receivedOn: z.string().date(), method: z.enum(PAYMENT_METHODS), reference: z.string().trim().max(200).optional() }` | `record_invoice_payment` RPC |
| `void_invoice_payment` | command, `requiresConfirmation: true` (a correction, like `write_off_invoice`) | `[...salesRoles]` | `{ paymentId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }` | `void_invoice_payment` RPC |
| `list_invoices` | query, existing | unchanged | unchanged | reads `local_paid_cents` from `invoice_totals` in its existing call |
| `get_invoice` | query, existing | unchanged | unchanged | one more parallel read: this invoice's `invoice_payments`, newest received first |

Both commands live in `lib/commands/orders.ts`, which owns invoices
(`.agents/ARCHITECTURE.md`). The push refusal needs no change in
`lib/commands/qbo.ts` or `lib/qbo.ts`: `pushInvoiceToQbo` already surfaces a
`start_qbo_push` exception through `unwrap`, as the historical-invoice refusal
shows (`tests/historical-orders.test.ts:73`).

## TypeScript types

```ts
// lib/mgr/enums.ts
export const PAYMENT_METHODS = ["cash", "check", "ach", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// lib/mgr/labels.ts
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", check: "Check", ach: "ACH", other: "Other" };

// lib/mgr/invoice-state.ts — the one owner of "who owns the balance"
/** What the payment ledger and push state add to an invoice row (#1045). */
export type InvoiceLedgerFacts = { localPaidCents: number; hasPendingPush: boolean };
/** True when MGR's payment ledger, not QuickBooks, owns this invoice's balance. */
export function invoiceLedgerOwnsBalance(
  invoice: { kind: "invoice" | "credit_memo"; qbo_invoice_id: string | null; paid_at: string | null },
  facts: InvoiceLedgerFacts,
): boolean;
/** The ledger's balance (total minus payments) when it owns the balance; else QuickBooks' balance, possibly null. */
export function invoiceBalanceCents(
  invoice: Parameters<typeof invoiceLedgerOwnsBalance>[0] & { qbo_balance_cents?: number | null },
  totalCents: number, facts: InvoiceLedgerFacts,
): number | null;
/** The Record payment rule, mirroring record_invoice_payment's refusals. */
export function invoiceTakesLocalPayment(
  invoice: Parameters<typeof invoiceCurrentState>[0] & Parameters<typeof invoiceLedgerOwnsBalance>[0],
  totalCents: number, facts: InvoiceLedgerFacts,
): boolean;

// lib/mgr/invoices-view.ts — InvoiceListRecord gains
qbo_invoice_id: string | null; local_paid_cents: number;

// lib/mgr/invoice-view.ts
export type InvoicePaymentRecord = { id: string; amount_cents: number; received_on: string; method: PaymentMethod; reference: string | null; voided_at: string | null; void_reason: string | null };
export type InvoicePaymentView = { key: string; id: string; amount: string; receivedOn: string; method: string; reference?: string; voidReason?: string };
// InvoiceSnapshot gains: invoice.qbo_invoice_id, payments: InvoicePaymentRecord[], hasPendingPush: boolean
// InvoiceViewModel gains: payments: InvoicePaymentView[]
export type InvoicePaymentValue = { amount: string; receivedOn: string; method: PaymentMethod | ""; reference: string };
export function invoicePaymentReady(value: InvoicePaymentValue, balanceCents: number): boolean;

// lib/mgr/qbo-ui.ts — qboInvoicePresentation input gains
localPaidCents?: number;  // > 0: "payments recorded in MGR · not sent to QuickBooks", no actions
```

## Tasks

Each task starts by writing its named failing test and watching it fail
(TDD; UI rendering is checked by eye in task 14). "DB" tests need the
`mgr_test` stack (`scripts/test-db.sh`).

1. **Migration: enum, table, void-only trigger, view column.**
   - Files: `supabase/migrations/20261022130000_invoice_payments.sql`,
     `supabase/migrations.lock.json` (`bun run migrations:lock`),
     `lib/supabase/database.generated.ts` (`bun run types:database`).
   - Test first: `tests/invoice-payments.test.ts` (DB, new). A payment row
     inserted with privileged SQL cannot be updated (other than its one void)
     or deleted. A second void is refused. `authenticated` has no insert,
     update or delete grant. `invoice_totals.local_paid_cents` sums unvoided
     rows only.
   - Also: add `invoice_payments: "get_invoice"` to `readBy` in
     `tests/rls-taproom.test.ts`.
   - Accept: the test file, `tests/rls-taproom.test.ts`,
     `tests/migrations-applied.test.ts`, `tests/schema-rules.test.ts`,
     `tests/schema-rls-indexes.test.ts` pass.
   - Deps: none.
2. **`record_invoice_payment` and `void_invoice_payment` RPCs.**
   - Files: the task 1 migration (unmerged; re-run `bun run migrations:lock`).
   - Test first: extend `tests/invoice-payments.test.ts` (DB), calling the
     RPCs. Partial then full payment; full sets `paid_at` to the received
     day's brewery-local start; a void below the total clears it. Replay
     returns the first result; a changed payload conflicts. Refusals, each by
     message: a QuickBooks invoice, a credit memo, written off (Q6), already
     paid including a historical invoice (Q4, Q7), a pending push (Q3), above
     the balance (Q1), warehouse and brewer callers, another brewery.
   - Also: both signatures in `tests/rpc-allowlist.test.ts`; both RPCs in the
     role-gate map of `tests/rls-taproom.test.ts`.
   - Accept: test passes; `tests/write-atomicity.test.ts`,
     `tests/command-idempotency.test.ts`, `tests/rpc-allowlist.test.ts` pass.
   - Deps: 1. Answers: Q1, Q3, Q4, Q6, Q7.
3. **Push refusal in `start_qbo_push`.**
   - Files: the task 1 migration.
   - Test first: extend `tests/invoice-payments.test.ts` (DB). With a
     connected company, `start_qbo_push` and the `push_invoice_to_qbo`
     command refuse an invoice with an unvoided payment and name the reason.
     After every payment is voided, the push starts (Q8). A payment and a
     push on the same invoice in two transactions serialize on the row lock.
   - Accept: test passes; `tests/qbo-push.test.ts` and
     `tests/historical-orders.test.ts` stay green.
   - Deps: 1. Answers: Q8.
4. **Commands.**
   - Files: `lib/commands/orders.ts` (two `defineCommand`s, types above),
     `lib/mgr/enums.ts` (`PAYMENT_METHODS`), `lib/supabase/rpc-results.ts`
     (both result shapes:
     `{ paymentId: string; invoiceId: string; balanceCents: number }`).
   - Test first: extend `tests/invoice-payments.test.ts` through
     `runCommand`. Warehouse is refused by the registry before the RPC.
     Reference is trimmed. `receivedOn` must be a date.
   - Accept: test passes; `tests/registry.test.ts`; `bunx tsc --noEmit`.
   - Deps: 2.
5. **Reads carry the ledger.**
   - Files: `lib/commands/orders.ts` (`list_invoices` selects
     `local_paid_cents`; `get_invoice` returns `payments`).
   - Test first: extend `tests/invoice-payments.test.ts` (DB). The register
     row and the detail read return the payment sum and the rows; a voided
     payment is listed with its reason and not summed.
   - Accept: test passes; `bunx tsc --noEmit`.
   - Deps: 2.
6. **Who owns the balance (pure).**
   - Files: `lib/mgr/invoice-state.ts` (three functions above),
     `lib/mgr/labels.ts` (`PAYMENT_METHOD_LABEL`).
   - Test first: `tests/invoice-state.test.ts` (new). The ledger owns a
     never-pushed, a rejected-push and a company-reset unpaid invoice. It does
     not own an invoice with a pending push, a QuickBooks identity, a credit
     memo, or `paid_at` with no local payment (historical, previous company).
     `invoiceBalanceCents` never turns a null QuickBooks balance into zero.
     `invoiceTakesLocalPayment` is false for written off, paid, or zero
     balance. `PAYMENT_METHODS` equals
     `Constants.public.Enums.payment_method`.
   - Accept: test passes.
   - Deps: none (types from task 1 only for the enum assertion). Answers: Q1,
     Q3, Q4, Q6, Q7. Narrower reading of "those invoices" changes this task.
7. **Register.**
   - Files: `lib/mgr/invoices-view.ts` (balance, overdue, `paymentFact`,
     `accountingFact` through `invoiceBalanceCents`),
     `lib/mgr/fixtures/invoices.ts` (`qbo_invoice_id` and `local_paid_cents`
     on every row; add a partly paid and a paid local row).
   - Test first: `tests/invoices-view.test.ts`. A ledger invoice reads
     **Balance due**, **Partial payment** or **Paid**; past due it is
     **Overdue**; with payments its Accounting caption is **Payments recorded
     in MGR**. These existing cases change on purpose, per "What changes on
     the register": "separates failed accounting pushes from unverified
     payment evidence" and "#1025 does not mark an unknown balance overdue: a
     failed push says Payment unverified only". Each keeps its #1025 guarantee
     for an unknown push result and for a QuickBooks invoice with no balance.
   - Accept: the screen-only proof list in AGENTS.md.
   - Deps: 6. Answers: Q3; the reading of "those invoices".
8. **Invoice detail model.**
   - Files: `lib/mgr/invoice-view.ts` (the settlement rows use
     `invoiceBalanceCents` and add **Paid in MGR**; the state reads
     **Partially paid**; `payments`; `invoicePaymentReady`),
     `lib/mgr/fixtures/invoice.ts` (a local partly paid snapshot; existing
     snapshots gain `qbo_invoice_id`, `payments: []`, `hasPendingPush`).
   - Test first: `tests/invoice-view.test.ts`. A local partly paid invoice
     shows its outstanding balance and paid amount. A pending push still
     reads **Unknown**. A voided payment shows its reason. Ready refuses zero,
     above-balance (Q1), and a missing date or method.
   - Accept: test passes.
   - Deps: 6. Answers: Q1.
9. **QuickBooks presentation.**
   - Files: `lib/mgr/qbo-ui.ts` (`localPaidCents` input).
   - Test first: `tests/qbo-ui.test.ts`. With payments, no Push, Retry or
     corrected push is offered, for any role. With only voided payments
     (`localPaidCents` 0), today's actions return (Q8).
   - Accept: test passes.
   - Deps: none. Parallel with 1–8. Answers: Q8.
10. **Shared view.**
    - Files: `components/mgr/views/invoice.tsx`: a **Payments** section (one
      row per payment: amount, received date, method, reference; a voided row
      shows **Voided** and its reason) with `recordPayment?: ReactNode` and
      `paymentAction?: (p: InvoicePaymentView) => ReactNode` slots, following
      the `questionAction` slot; `InvoicePaymentFields` (`E.edit` amount with
      `step: 0.01` and the balance as maximum, `E.edit` date, `E.pick` method,
      `E.edit` reference), like `KegPoolFields`.
    - Test first: extend `tests/invoice-view.test.ts` with a
      `renderToStaticMarkup` case: the section lists payments, an omitted slot
      draws no button, and `null` suppresses it.
    - Accept: the screen-only proof list in AGENTS.md.
    - Deps: 8. Answers: Q1 (the maximum).
11. **Live forms and page.**
    - Files: `app/(app)/invoices/[id]/payment-form.tsx` (new):
      `RecordPaymentForm` (`CommandForm` + `InvoicePaymentFields`, received
      date defaulting to `breweryDate(timeZone)`, `toCents` on submit) and
      `VoidPaymentForm` (reason dialog, like Write off).
      `app/(app)/invoices/[id]/page.tsx`: shows Record payment when
      `invoiceTakesLocalPayment` and `canRun(ctx, "record_invoice_payment")`;
      Void on each unvoided payment when `canRun(ctx, "void_invoice_payment")`;
      passes `localPaidCents` to `qboInvoicePresentation`. Update the page's
      header comment.
    - Test first: `tests/app-screen-parity.test.ts` fails until
      `lib/mgr/screen-routes.ts` maps **Record payment** and **Void payment**
      to `payment-form.tsx` (added in task 12).
    - Accept: `bunx tsc --noEmit && bun run lint`; the eye check in task 14.
    - Deps: 4, 5, 9, 10.
12. **Inventory.**
    - Files: `components/mgr/screens.tsx`:
      - **Invoice**: `writes` adds `record_invoice_payment ·
        void_invoice_payment`; states add **paid in MGR** and **payments
        block push**; spec says where the balance comes from; `to` maps
        **Record payment** and **Void**.
      - New sheet records **Record payment** and **Void payment**, drawing the
        shared fields.
      - **Invoices**: spec and the **paid** state name the MGR ledger, and the
        overdue sentence follows "What changes on the register".
      - QuickBooks **Payment** venue frame: the job becomes "The accountant
        records payment here for an invoice in QuickBooks"; the spec drops
        "there is deliberately no Mark paid button anywhere in MGR" and says
        Record payment exists only for an invoice QuickBooks never received.
      - Fixtures from tasks 7 and 8.

      Also `lib/mgr/screen-routes.ts` and, if a tap needs it,
      `lib/mgr/screen-links.ts`.
    - Test first: `tests/mgr-screens.test.ts` and `tests/tap-coverage.test.ts`
      fail on the new names until the records exist.
    - Accept: the screen-only proof list in AGENTS.md, plus
      `tests/app-screen-parity.test.ts`.
    - Deps: 10, 11.
13. **Docs.**
    - Files: `content/docs/staff-guide.mdx`, Invoices section:
      - Replace "Payment is display-only; there is no record-payment action."
        (line 516) with Record payment: who, which invoices, the fields.
      - Add voiding as the only correction, and the push refusal with its
        reason.
      - Label table: **Balance due**, **Partial payment** and **Paid** include
        MGR payments. Remove **Payment unverified**. **Payment status
        unavailable** narrows to an unknown push result, an unsynced
        QuickBooks invoice, or a deleted one. Add **Payments recorded in
        MGR**.
      - The overdue sentence follows "What changes on the register".

      `content/docs/api/` through `bun run docs:api`: no `API_AREAS` change
      (see "What exists"). `portal-guide.mdx` only if Q5 changes.
    - Test first: `tests/api-docs.test.ts` fails until the generated blocks
      list both operations.
    - Accept: `tests/api-docs.test.ts`, `tests/docs.test.ts`,
      `tests/design-docs.test.ts` pass.
    - Deps: 4, 12.
14. **End-to-end acceptance (the triage comment's).**
    - On the test stack, with no QuickBooks connection (`browse` skill, seed
      plus `next dev` against `.env.test.local`):
      1. Record a partial payment. Detail and register show the same
         balance; a past-due invoice stays **Overdue**.
      2. Record the rest. Both read **Paid**, not overdue. The portal invoice
         reads **Paid**.
      3. Void one payment. Both return to **Partial payment**.
    - Then connect a fixture company. Push is not offered. A push through
      `/api/command` is refused with the reason (task 3 proves the same in
      vitest).
    - Desktop and phone screenshots go in a PR comment, test-stack data only.
    - Deps: 11, 12, 13.
15. **Final proof.** `bun run test && bunx tsc --noEmit && bun run lint`.
    Then `/simplify`, the Haiku check (AGENTS.md Negative 3), the read-only
    review of the simplify diff, and the same checks again.
    - Deps: all.

Q5 = "show the balance" would add a task 16 (portal projection migration,
portal views, `portal-guide.mdx`), after 2. Q2 = "net credit memos" would
widen tasks 1, 2, 6 and 8 as the Q2 row says.

## Parallelism

- Start together: 1, 6 and 9.
- 2 and 3 follow 1. They edit one migration file, so one agent owns 1, 2 and
  3 in sequence.
- 4 and 5 follow 2, in parallel.
- 7 and 8 follow 6, in parallel.
- 10 follows 8. 11 waits on 4, 5, 9 and 10.
- 12, then 13, then 14 and 15 close, in that order.

## Out of scope

- Reconciling a local payment into QuickBooks, or a QuickBooks Payment push.
- Refunds, overpayment credit, and applying credit across invoices (Q1).
- Netting credit memos into a local balance (Q2), unless the owner picks it.
- Online pay for local invoices: the portal pay link stays QuickBooks-only.
- An AR total or aging report: the register is the AR list.
- Showing who recorded a payment: the actor is stored, not displayed.

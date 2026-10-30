# Record an invoice payment in MGR without QuickBooks (#1045)

Status: approved 2026-10-23 (owner comment on #1045), all recommended defaults
Q1–Q10 and the Design 2 reading; implemented on `feat/1045-local-payments`
(PR #1162, to `main`). The Q9 follow-up is #1228. "Deviations" at the end lists
where the implementation differs from the tasks below.

## Credit-balance correction (#1627)

This correction supersedes the original Q2 default and the Q1 statement that
credit balances are QuickBooks-only. The approved payment cap still applies:
an operator cannot record more cash than is due.

For an MGR-owned invoice, the balance is its frozen line total minus unvoided
payments minus live credit-memo lines linked by `credited_invoice_line_id`.
Gross invoice totals and cash stay unchanged. A credit that closes the balance
sets the existing closure marker, so the unpaid query and portal do not leave
the invoice open. Staff distinguish **Settled** from cash-only **Paid**.
Voiding a payment reopens only the net amount still due. A voided or deleted
credit memo stops reducing that amount.

Excess credit remains a signed negative balance in the register. Invoice detail
labels its positive magnitude **Credit balance**. Neither view calls it overdue
or offers another payment. Refund execution and applying credit to a different
invoice remain outside this change; the UI and guide say explicitly that the
credit is not proof of a refund. QuickBooks-owned balances remain authoritative
and are never netted again locally.


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

"No QuickBooks identity" is read as a necessary condition, not a sufficient
one. An invoice also needs no QuickBooks evidence that a company change erased
(Q4) and no unresolved push (Q3). Otherwise the triage rule above would be
broken.

### One reading, stated (AGENTS.md Negative 15)

"Those invoices" is read as **every invoice whose balance the ledger owns**
(Design 2), not only invoices that already have a local payment. The issue's
problem statement is "a brewery without QuickBooks never sees an overdue
invoice". Only this reading fixes it. The consequences are listed under "What
changes on the register" below. If the owner meant the narrower reading, tasks
6 and 7 change and the two #1025 tests named in task 7 stay as they are.

## What exists (searched 2026-10-22 on `dd266cd2`, equal to `origin/main`)

| Piece | Where | Reuse |
| --- | --- | --- |
| Payment ledger | none. `grep -rn "payment" supabase/migrations` finds only `payment_terms`, portal online pay and QuickBooks sync | build new |
| Ledger convention | `00001_baseline.sql:9` and schema-design §0: ledgers are append-only (update and delete revoked), and a correction is a reversal row | **yes**: a void is its own row in `invoice_payment_voids`; no row is ever updated |
| A reversal row pointing at what it corrects | `inventory_movements.compensates_id` (`00001_baseline.sql:639`, unique, composite FK), written by `reverse_inventory_movement` with a required note | **yes**: `invoice_payment_voids.payment_id` is the same shape: unique, composite FK, required reason |
| Immutable-row trigger | `private.preserve_reporting_basis_history` (`20261017093900_reporting_basis_correction.sql:39`): one unconditional `raise exception` | **yes**: copied verbatim with its own message, attached to both new tables |
| Reason rule and Admin/Sales correction RPC | `write_off_invoice` (`20260910120847_deploy_current_schema.sql:1656`): a 1–500 character trimmed reason, replayable | **yes**: the void reason rule copies it |
| A paid invoice with no QuickBooks balance | `record_historical_order` (`20261016100800_historical_orders.sql:14`) sets `paid_at` to the brewery-local start of the day; `invoiceCurrentState` reads `paid_at` + null balance as `paid` | **yes**: the ledger stamps `paid_at` the same way, so every existing reader says Paid |
| Company change | `private.purge_qbo_identity` (`20261016100800_historical_orders.sql:312`): on a realm change it nulls `qbo_invoice_id` and `qbo_balance_cents` and zeroes `qbo_cash_collected_cents` on every non-historical invoice. It keeps `paid_at` and does not touch `qbo_pushes` | read: the `qbo_pushes` history is the evidence it leaves (Q3, Q4) |
| Push facts on the reads | `list_invoices` reads `qbo_pushes` with `status = 'pending'` into `has_pending_qbo_push` (`lib/commands/orders.ts:385`); `get_invoice` reads the same into `hasPendingPush` (`:406`) | **yes**: the same read widens to `status in ('pending','pushed')` and also yields `was_pushed_to_qbo` |
| Line total of an invoice | `public.invoice_totals` view, `subtotal_cents` (`20260910120847_deploy_current_schema.sql:1748`); `list_invoices` already reads it | **yes**: append `local_paid_cents` to it; no extra round trip |
| Push guard | `public.start_qbo_push`, latest body `20261016100800_historical_orders.sql:88` (refuses written-off and historical invoices) | **yes**: one more refusal beside those two |
| Role check in an authenticated RPC | `private.assert_staff(p_brewery, roles)`, as `start_qbo_push` and `save_batch_pulls` use. `private.actor_has_staff_roles` (`20261017144100_staff_actor_roles.sql:4`) is for service-only RPCs that receive a trusted actor, so it is not used here | **yes**: `assert_staff` |
| Read policy shape | `staff_read ... my_staff_brewery_ids(array[...])` (`20261022080000_staff_read_policies_once_per_query.sql`), roles matching the reading command (#770, `tests/rls-taproom.test.ts:98`) | **yes** |
| RLS test obligations | `tests/rls-fixtures.ts` `matrix` (every RLS table, with a nonempty fixture) and `privilegedRead` (tables service_role cannot select); `tests/rls-multi-role.test.ts` role groups (every staff policy, 95 today) | **yes**: both new tables are added to each (task 1) |
| Option list stored as text | `deliveries.refusal_reason text check (...)` (`20261016*_delivery_outcomes.sql:3`), mirrored by `REFUSAL_REASONS` in `lib/mgr/enums.ts`. No migration after the baseline creates an enum type | **yes**: `method text check (...)`, mirrored by `PAYMENT_METHODS` |
| Presentation | `invoiceCurrentState` (`lib/mgr/invoice-state.ts`), `toInvoiceListRow` (`lib/mgr/invoices-view.ts`), `toInvoiceViewProps` (`lib/mgr/invoice-view.ts`), `qboInvoicePresentation` (`lib/mgr/qbo-ui.ts:36`) | **yes**: each gains the ledger branch; no second state machine |
| Optional action slot on the shared invoice view | `questionAction` (`components/mgr/views/invoice.tsx:50`): `ReactNode \| ((q) => ReactNode)`; omitted draws an inert default button, `null` draws none | **yes**: `recordPayment` and `paymentAction` take the same type and default |
| Money field and form | `dollarsInput` / `toCents` (`lib/mgr/money.ts`); `KegPoolFields` + `PoolForm` (`components/mgr/views/keg-fleet.tsx`, `app/(app)/kegs/pool-form.tsx`): `E.edit(..., "number", { step: 0.01 })` inside `CommandForm` | **yes**: the payment form copies this shape |
| Reason dialog | Write off in `QboInvoiceActions` (`app/(app)/settings/accounting/qbo-controls.tsx:86`) | **yes**: the Void dialog copies it |
| Option list for a picker | `lib/mgr/enums.ts` (imports nothing); labels in `lib/mgr/labels.ts` (`PAYMENT_TERM_LABEL`) | **yes**: `PAYMENT_METHODS`, `PAYMENT_METHOD_LABEL` |
| Tests of `invoice-state.ts` | `tests/qbo-state.test.ts` imports `invoiceCurrentState` (line 8, used at 348) | **yes**: the new functions are tested there, not in a new file |
| API reference area | `API_AREAS` in `lib/mgr/api-operations.ts`: the `orders` rule matches `invoice`; no earlier rule matches `record_invoice_payment` or `void_invoice_payment` | **yes**: no new rule; run `bun run docs:api` |

No open PR or branch covers #1045. Issue #1135 (open) edits the same
register copy (`lib/mgr/invoices-view.ts`, the Invoices page). Whichever lands
second merges the other's wording.

## Design

1. **Ledger.** `public.invoice_payments` holds one row per payment.
   `public.invoice_payment_voids` holds one row per void: the payment, a
   reason, who and when. Both are append-only, guarded by a copy of the
   one-line `preserve_reporting_basis_history` trigger. This is the baseline's
   ledger rule (a correction is a reversal row), and it needs no column
   comparison. A payment is voided when a void row names it. Application roles
   can only read both tables; two RPCs write them.
2. **Who owns the balance.** MGR's ledger owns an invoice's balance when all
   of these hold:
   - It is an invoice, not a credit memo.
   - QuickBooks has never identified it (`qbo_invoice_id` is null).
   - No push is pending for it, on any connection (Q3).
   - No push of it ever succeeded (`qbo_pushes.status = 'pushed'`). A company
     change erases that invoice's QuickBooks balance and cash, so the ledger
     would otherwise show money collected in the old company as owed (Q4).
   - Nothing outside the ledger marked it paid: no `paid_at` without a local
     payment (a historical import, Q7).

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
4. **Nothing to pay.** A ledger-owned invoice whose total is $0.00 or less
   (all lines priced at zero) reads **No payment due**. It is settled, never
   overdue, and takes no payment. Today it reads **Payment status
   unavailable**.
5. **Push refusal.** `start_qbo_push` refuses an invoice with an unvoided
   local payment. `record_invoice_payment` refuses an invoice with a pending
   push. Both lock the invoice row first, so they serialize, and an invoice can
   never reach QuickBooks with a payment already on it.
6. **Collected cash.** `invoice_totals.collected_cents` stays QuickBooks-only,
   as its comment says. `local_paid_cents` is the ledger's sum, beside it. No
   reader adds the two today. A future reporting reader that wants all cash
   collected adds `local_paid_cents` for a ledger-owned invoice.

### What changes on the register (read before approving)

- Every ledger-owned invoice now shows a balance. These are invoices never
  pushed, rejected by QuickBooks, or at a brewery that never connected. The
  balance is the total minus recorded payments, and the invoice can be
  **Overdue**. Today these read **Payment status unavailable** or **Payment
  unverified** and are never overdue (#1025).
- The balance column is headed **Balance**, not **QuickBooks balance**,
  because it now shows MGR's balance for ledger-owned invoices.
- **Payment unverified** retires. A rejected push created no QuickBooks
  document, so MGR's ledger owns that invoice's balance.
- These keep the unknown balance, are not overdue, and take no payment:
  - an invoice whose push result is unknown (Q3);
  - an invoice whose push was left pending when the QuickBooks company or
    connection changed. That push can never finish, so the invoice can be
    neither pushed nor paid in MGR (Q3);
  - an invoice pushed to a previous QuickBooks company, until it is pushed to
    the current one (Q4);
  - a QuickBooks invoice that has not synced yet.
- A ledger-owned invoice past its due day reads **Overdue** until it is paid.
  There is no way to write it off or void it in MGR (Q9). This includes a
  fully credited one (Q2).
- Once an invoice has an unvoided payment, the detail page drops Push and the
  mapping rows. The Accounting column says **Payments recorded in MGR**.
- At a brewery connected to QuickBooks, Record payment warns: "This invoice
  will not be sent to QuickBooks while it has payments recorded in MGR."

## Open questions for the owner

Each has a recommended default. The plan and SQL below are written with the
defaults; lines that depend on an answer carry a `-- Qn` comment. Say which to
change.

| # | Question | Recommended default | Why | Tasks that depend on it |
| --- | --- | --- | --- | --- |
| Q1 | **Overpayment / credit balance.** May unvoided payments add up to more than the total? | Refuse a payment above the remaining balance. | No credit balance, refund or carry-forward to model. The register's **Credit balance** caption stays QuickBooks-only. | 2 (RPC check), 6 (balance never below zero), 8 (ready rule), 10 (field maximum), 11 (form) |
| Q2 | **Credit memos.** Does a credit memo against a local invoice lower its MGR balance? | No. The credit memo stays its own register row, as today. | The decision names payments only. Netting needs `create_credit_memo_impl` to set or clear `paid_at` too. **Cost of the default:** after a return, an invoice keeps the credited amount due and cannot reach Paid if the customer pays the net. A fully credited invoice keeps its full amount due and reads **Overdue** once past due, with no way to clear it (Q9). If that is unacceptable, netting is a follow-up issue. | Netting would add a `create_credit_memo_impl` copy to task 1, a credit term to tasks 2, 6, 8, and wording to 13 |
| Q3 | **Push in flight.** An invoice with a pending push has no `qbo_invoice_id` yet. May it take a payment? | Refuse while a push is pending on any connection. Its balance stays unknown. | A push that finishes after the payment would give a paid invoice a QuickBooks identity. The refusal closes that race. **Cost of the default:** a push left pending when the QuickBooks company or connection changes never resolves. `start_qbo_push` and `finish_qbo_push` raise MG409 for a pending push on another connection, and `purge_qbo_identity` leaves `qbo_pushes` alone. That invoice keeps an unknown balance and can take neither a push nor a payment. The staff guide says so. | 2, 5, 6, 7, 8, 11, 13 |
| Q4 | **Company change.** `purge_qbo_identity` clears `qbo_invoice_id` and the QuickBooks balance and cash on every non-historical invoice. Should those invoices take local payments? | No, for any invoice that was pushed (a `qbo_pushes` row with status `pushed`). It keeps **Payment status unavailable** and can be pushed to the current company, which `start_qbo_push` already allows. One already marked paid keeps `paid_at` and still reads **Paid**. A purged invoice that was never pushed is ledger-owned like any other. | The purge erased the evidence, not the money. An invoice partly paid in the old company has no `paid_at`, so the ledger would show its full total as owed and possibly **Overdue**. That breaks the triage rule: a null QuickBooks balance is never an inferred amount owed. **Cost of the default:** at a brewery that leaves QuickBooks for good, such an invoice never takes an MGR payment. | 2, 5, 6, 7, 8, 13 |
| Q5 | **Portal.** Should the portal show the MGR-derived paid state and balance? | No portal code change. Paid in full shows as Paid already, through `paid_at`. A partial payment shows no remaining balance, because the portal shows totals only. Online pay stays QuickBooks-only. | Nothing to build for Paid. A balance needs a new `portal_invoices` projection. | Default: none. "Show the balance" adds a task: a new migration for `portal_invoices`, `lib/mgr/portal-invoice(s)-view.ts`, `portal-guide.mdx` |
| Q6 | **Written-off invoices.** May one take a local payment? | Refuse. | `invoiceCurrentState` already puts written-off before paid. Write-off means nothing is collected. | 2, 6, 8, 13 |
| Q7 | **Historical invoices** (`not_synced`, recorded paid before the books opened). They have no `qbo_invoice_id`, so the literal rule admits them. | Refuse. `record_historical_order` already set `paid_at`. They keep reading **Paid**. | A second payment record for an import would double-count. | 2, 6, 8, 13 |
| Q8 | **Voided payments and push.** Is an invoice whose payments are all voided pushable? | Yes. Only an unvoided payment blocks a push. Its register row has no **Payments recorded in MGR** caption. | A voided payment did not happen. | 3, 7, 9, 13 |
| Q9 | **Clearing Overdue.** How does an uncollectable, mistaken or fully credited local invoice stop reading **Overdue**? `write_off_invoice` accepts only an invoice QuickBooks voided or deleted, and MGR has no void for a local invoice. | Out of scope here. Open a follow-up issue that lets `write_off_invoice` accept a ledger-owned invoice (filed as #1228). | The decision names payments only. **Cost of the default:** until the follow-up lands, such an invoice reads **Overdue** with no way to clear it except recording a payment. | In scope: a `write_off_invoice` copy in task 2, plus 6, 7, 13 |
| Q10 | **Received before issue.** May a payment's received date be before the invoice's issue date (a prepayment taken at order time)? A date after today in the brewery's zone is always refused. | Allow it. | A buyer can pay at order time, before the shipment issues the invoice. **Cost of the default:** `paid_at` can then be earlier than the issue date. | 2, 8, 10 |

## Schema — `supabase/migrations/20261023130000_invoice_payments.sql`

The name sorts after the latest file on `origin/main` (`398b83ad`),
`20261023120000_taproom_read_policies_once_per_query.sql`. It was written as
`20261023080000` and renamed when `main` moved first. If `main` moves again,
rename to a later timestamp before `bun run migrations:lock`.

The SQL below is the approved draft. The migration differs in three places
(see "Deviations"): `paid_at` takes the latest received day, a new
`invoice_push_facts` function serves the reads, and comments.

```sql
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
```

`create or replace function` keeps `start_qbo_push`'s existing grants. The
generated types (`bun run types:database`) gain both tables, the view column
and both RPCs. No enum type is created, so `Constants` gains nothing.

## Commands and reads

| Name | Kind | Roles | Input (zod) | Calls |
| --- | --- | --- | --- | --- |
| `record_invoice_payment` | command | `[...salesRoles]` | `{ invoiceId: z.string().uuid(), amountCents: z.number().int().positive(), receivedOn: z.string().date(), method: z.enum(PAYMENT_METHODS), reference: z.string().trim().max(200).optional() }` | `record_invoice_payment` RPC (which refuses a future date in the brewery's zone) |
| `void_invoice_payment` | command, `requiresConfirmation: true` (a correction, like `write_off_invoice`) | `[...salesRoles]` | `{ paymentId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }` | `void_invoice_payment` RPC |
| `list_invoices` | query, existing | unchanged | unchanged | reads `local_paid_cents` from `invoice_totals` in its existing call; its `qbo_pushes` read takes `status in ('pending','pushed')` and yields `has_pending_qbo_push` and `was_pushed_to_qbo`. Description gains "and the sum of payments recorded in MGR" |
| `get_invoice` | query, existing | unchanged | unchanged | its `qbo_pushes` read becomes a list (`status in ('pending','pushed')`, not `maybeSingle`) yielding `hasPendingPush` and `wasPushedToQbo`; one more parallel read: this invoice's `invoice_payments` with their `invoice_payment_voids`, newest received first; returns `payments` and `localPaidCents` (the unvoided sum). Description becomes "One invoice with its lines and the payments recorded in MGR" |

Both commands live in `lib/commands/orders.ts`, which owns invoices
(`.agents/ARCHITECTURE.md`). The push refusal needs no change in
`lib/commands/qbo.ts` or `lib/qbo.ts`: `pushInvoiceToQbo` already surfaces a
`start_qbo_push` exception through `unwrap`, as the historical-invoice refusal
shows (`tests/historical-orders.test.ts:73`).

## TypeScript types

```ts
// lib/mgr/enums.ts — mirrors invoice_payments.method's check
export const PAYMENT_METHODS = ["cash", "check", "ach", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// lib/mgr/labels.ts
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", check: "Check", ach: "ACH", other: "Other" };

// lib/mgr/invoice-state.ts — the one owner of "who owns the balance".
// The fields keep InvoiceListRecord's names, so a register row passes as is.
type LedgerInvoice = {
  kind: "invoice" | "credit_memo"; qbo_invoice_id: string | null; paid_at: string | null;
  qbo_balance_cents?: number | null; has_pending_qbo_push: boolean; was_pushed_to_qbo: boolean; local_paid_cents: number;
};
/** True when MGR's payment ledger, not QuickBooks, owns this invoice's balance (Design 2).
 * Called by invoiceBalanceCents, toInvoiceListRow and toInvoiceViewProps. */
export function invoiceLedgerOwnsBalance(invoice: LedgerInvoice): boolean;
/** The ledger's balance (total minus payments, never below zero) when it owns the balance; else QuickBooks' balance, possibly null. */
export function invoiceBalanceCents(invoice: LedgerInvoice, totalCents: number): number | null;

// lib/mgr/invoices-view.ts — InvoiceListRecord gains
qbo_invoice_id: string | null; local_paid_cents: number; was_pushed_to_qbo: boolean;

// lib/mgr/invoice-view.ts
export type InvoicePaymentRecord = { id: string; amount_cents: number; received_on: string; method: PaymentMethod; reference: string | null; void: { reason: string } | null };
export type InvoicePaymentView = { key: string; id: string; amount: string; receivedOn: string; method: string; reference?: string; voidReason?: string };
// InvoiceSnapshot gains: invoice.qbo_invoice_id, payments: InvoicePaymentRecord[],
//   hasPendingPush: boolean, wasPushedToQbo: boolean, localPaidCents: number
// InvoiceViewModel gains: payments: InvoicePaymentView[], takesPayment: boolean
//   (mirrors record_invoice_payment's refusals; derived here, not in the page)
export type InvoicePaymentValue = { amount: string; receivedOn: string; method: PaymentMethod | ""; reference: string };
export function invoicePaymentReady(value: InvoicePaymentValue, balanceCents: number, today: string): boolean;
// (#1485 replaced it with invoicePaymentReason, which names what is missing, and invoicePaymentAmountError.)

// lib/mgr/qbo-ui.ts — qboInvoicePresentation input gains a required field, so tsc names every caller
localPaidCents: number;  // > 0: "Payments recorded in MGR · not sent to QuickBooks", no actions
```

## Tasks

Each task starts by writing its named failing test and watching it fail
(TDD; UI rendering is checked by eye in task 15). "DB" tests need the
`mgr_test` stack (`scripts/test-db.sh`).

1. **Migration: both tables, immutable triggers, RLS, view column.**
   - Files: `supabase/migrations/20261023130000_invoice_payments.sql`,
     `supabase/migrations.lock.json` (`bun run migrations:lock`),
     `lib/supabase/database.generated.ts` (`bun run types:database`),
     `tests/rls-fixtures.ts`, `tests/rls-taproom.test.ts`,
     `tests/rls-multi-role.test.ts`.
   - Test first: `tests/invoice-payments.test.ts` (DB, new). A payment row and
     a void row, inserted with privileged SQL, refuse update and delete with
     "invoice payment history is immutable". A second void row for one
     payment is refused by the unique key. An unknown method is refused by the
     check. `authenticated` has select only. `invoice_totals.local_paid_cents`
     sums unvoided payments only.
   - RLS obligations:
     - `tests/rls-fixtures.ts`: add `invoice_payments: "deny"` and
       `invoice_payment_voids: "deny"` to `matrix`, and both to
       `privilegedRead` (the migration revokes service_role, as
       `reporting_basis_corrections` does). In `fixtures()`, seed one payment
       on the fixture invoice and one void of it, for both `own` and
       `foreign`, with privileged SQL (authenticated has no insert grant).
     - `tests/rls-taproom.test.ts`: add `invoice_payments: "get_invoice"` and
       `invoice_payment_voids: "get_invoice"` to `readBy`. Its `seen > 0`
       check for admin, sales and warehouse relies on the seeded rows.
     - `tests/rls-multi-role.test.ts`: add both tables to the
       `salesWarehouse` group, and raise the staff policy count from 95 to
       97.
   - Accept: `bunx vitest run tests/invoice-payments.test.ts
     tests/rls-taproom.test.ts tests/rls-multi-role.test.ts
     tests/migrations-applied.test.ts tests/schema-rules.test.ts
     tests/schema-rls-indexes.test.ts`; `bunx tsc --noEmit`.
   - Deps: none.
2. **`record_invoice_payment` and `void_invoice_payment` RPCs.**
   - Files: the task 1 migration (unmerged; re-run `bun run migrations:lock`).
   - Test first: extend `tests/invoice-payments.test.ts` (DB), calling the
     RPCs. Partial then full payment; full sets `paid_at` to the received
     day's brewery-local start; a void below the total clears it. Replay
     returns the first result; a changed payload conflicts. Refusals, each by
     message:
     - a QuickBooks invoice; a credit memo; written off (Q6);
     - already paid, including a historical invoice (Q7);
     - a pending push (Q3), and the same pending push after the connection's
       realm changed, so a later change cannot relax it (Q3);
     - an unpaid invoice pushed and then purged by a realm change (Q4);
     - above the balance (Q1); any payment on a $0.00 invoice (Design 4);
     - a received date after today in the brewery's zone, while a date
       before `issued_on` is accepted (Q10);
     - a second void of one payment;
     - warehouse and brewer callers; another brewery.
   - Also: both signatures in `tests/rpc-allowlist.test.ts`; both RPCs in the
     role-gate map of `tests/rls-taproom.test.ts`.
   - Accept: `bunx vitest run tests/invoice-payments.test.ts
     tests/write-atomicity.test.ts tests/command-idempotency.test.ts
     tests/rpc-allowlist.test.ts tests/rls-taproom.test.ts`.
   - Deps: 1. Answers: Q1, Q3, Q4, Q6, Q7, Q10.
3. **Push refusal in `start_qbo_push`.**
   - Files: the task 1 migration.
   - Test first: extend `tests/invoice-payments.test.ts` (DB). With a
     connected company, `start_qbo_push` and the `push_invoice_to_qbo`
     command refuse an invoice with an unvoided payment and name the reason.
     After every payment is voided, the push starts (Q8). A payment and a
     push on the same invoice in two transactions serialize on the row lock.
   - Accept: `bunx vitest run tests/invoice-payments.test.ts
     tests/qbo-push.test.ts tests/historical-orders.test.ts`.
   - Deps: 1. Answers: Q8.
4. **Commands.**
   - Files: `lib/commands/orders.ts` (two `defineCommand`s, types above),
     `lib/mgr/enums.ts` (`PAYMENT_METHODS`), `lib/supabase/rpc-results.ts`
     (both result shapes:
     `{ paymentId: string; invoiceId: string; balanceCents: number }`).
   - Test first: extend `tests/invoice-payments.test.ts` through
     `runCommand`. Warehouse is refused by the registry before the RPC.
     Reference is trimmed. `receivedOn` must be a date. Every
     `PAYMENT_METHODS` value is accepted by the database check. That keeps
     the TypeScript list and the SQL list equal, since no enum type is
     generated.
   - Accept: `bunx vitest run tests/invoice-payments.test.ts
     tests/registry.test.ts`; `bunx tsc --noEmit`.
   - Deps: 2.
5. **Reads carry the ledger.**
   - Files: `lib/commands/orders.ts` (`list_invoices` and `get_invoice` as
     in "Commands and reads", including both descriptions);
     `lib/mgr/invoices-view.ts` (`InvoiceListRecord` gains the three fields);
     the base records in `lib/mgr/fixtures/invoices.ts` and
     `tests/invoices-view.test.ts` gain them. The test base record gets
     `qbo_invoice_id: "qbo-1042"`, so its existing QuickBooks cases stay
     QuickBooks-owned.
   - Test first: extend `tests/invoice-payments.test.ts` (DB). The register
     row and the detail read return the payment sum and the rows. A voided
     payment is listed with its reason and not summed. An invoice pushed and
     then purged reports `was_pushed_to_qbo`.
   - Accept: `bunx vitest run tests/invoice-payments.test.ts`;
     `bunx tsc --noEmit`.
   - Deps: 2.
6. **Who owns the balance (pure).**
   - Files: `lib/mgr/invoice-state.ts` (the two functions above),
     `lib/mgr/labels.ts` (`PAYMENT_METHOD_LABEL`).
   - Test first: a new `describe` block in `tests/qbo-state.test.ts`, which
     already tests this module. The ledger owns:
     - a never-pushed, a rejected-push and a purged never-pushed unpaid
       invoice;
     - one whose payments are all voided.

     It does not own:
     - an invoice with a pending push (Q3);
     - one pushed and then purged (Q4);
     - a QuickBooks identity; a credit memo;
     - `paid_at` with no local payment (Q7).

     `invoiceBalanceCents` never turns a null QuickBooks balance into zero.
     A ledger-owned $0.00 invoice has balance 0 (Design 4).
   - Accept: `bunx vitest run tests/qbo-state.test.ts`; `bunx tsc --noEmit`.
   - Deps: none (`LedgerInvoice` is its own type, with the names task 5
     gives `InvoiceListRecord`). Answers: Q3, Q4, Q7. The narrower reading
     of "those invoices" changes this task.
7. **Register.**
   - Files:
     - `lib/mgr/invoices-view.ts`: balance and overdue through
       `invoiceBalanceCents`; `paymentFact` gains **No payment due** for a
       ledger-owned invoice with `total_cents <= 0`; `accountingFact`; the
       `qboInvoicePresentation` call at line 69 passes
       `localPaidCents: inv.local_paid_cents`, so `needsMapping` is false for
       a row with payments.
     - `components/mgr/views/invoices.tsx:32`: the header **QuickBooks
       balance** becomes **Balance**.
     - `lib/mgr/fixtures/invoices.ts`: a partly paid and a paid local row.
   - Test first: `tests/invoices-view.test.ts`. A ledger invoice reads
     **Balance due**, **Partial payment** or **Paid**; past due it is
     **Overdue**; with payments its Accounting caption is **Payments recorded
     in MGR**. New cases:
     - a `push_failed` row with payments has `needsMapping` false and
       offers no QuickBooks action;
     - a row with only voided payments has no such caption (Q8);
     - a ledger-owned $0.00 row reads **No payment due** and is not overdue;
     - a pushed-then-purged row reads **Payment status unavailable** (Q4).

     These existing cases change on purpose, per "What changes on the
     register": "separates failed accounting pushes from unverified payment
     evidence" and "#1025 does not mark an unknown balance overdue: a failed
     push says Payment unverified only". Each keeps its #1025 guarantee for
     an unknown push result and for a QuickBooks invoice with no balance.
   - Accept: `bunx vitest run tests/invoices-view.test.ts` plus the
     screen-only list in AGENTS.md; `bunx tsc --noEmit`.
   - Deps: 6, 9. Answers: Q3, Q4, Q8; the reading of "those invoices".
8. **Invoice detail model.**
   - Files:
     - `lib/mgr/invoice-view.ts`: the settlement rows use
       `invoiceBalanceCents` and add **Paid in MGR**; the state reads
       **Partially paid**, or **No payment due** for a ledger-owned $0.00
       invoice; `payments`; `takesPayment`; `invoicePaymentReady`. With an
       unvoided payment the model drops `mappings`, the same predicate
       `qboInvoicePresentation` uses for its actions.
     - `lib/mgr/fixtures/invoice.ts`: a local partly paid snapshot; existing
       snapshots gain `qbo_invoice_id`, `payments: []`, `hasPendingPush`,
       `wasPushedToQbo`, `localPaidCents: 0`.
   - Test first: `tests/invoice-view.test.ts`:
     - a local partly paid invoice shows its outstanding balance and paid
       amount, and no mapping rows;
     - a pending push still reads **Unknown** (Q3); a pushed-then-purged
       invoice too (Q4);
     - a voided payment shows its reason;
     - `takesPayment` is false for written off (Q6), paid (Q7), a pending
       push (Q3), pushed-then-purged (Q4) and a $0.00 total;
     - ready refuses zero, above-balance (Q1), a date after `today`, and a
       missing date or method; it accepts a date before issue (Q10);
     - "shows no Unknown balance under Paid when the paid invoice has no
       QuickBooks balance" (line 146) keeps its guarantee unchanged: its
       fixture has `paid_at` and no local payment, so QuickBooks owns it.
   - Accept: `bunx vitest run tests/invoice-view.test.ts`;
     `bunx tsc --noEmit`.
   - Deps: 6, 9. Answers: Q1, Q3, Q4, Q6, Q7, Q10.
9. **QuickBooks presentation.**
   - Files: `lib/mgr/qbo-ui.ts` (required `localPaidCents`). Every caller
     gains the field in this task, so `tsc` stays green:
     - `lib/mgr/invoices-view.ts:69` (`inv.local_paid_cents`);
     - `app/(app)/invoices/[id]/page.tsx:42` (`localPaidCents` from
       `get_invoice`);
     - `lib/mgr/fixtures/invoice.ts:58`, and the calls in
       `tests/qbo-ui.test.ts`, `tests/qbo-state.test.ts` and
       `tests/multi-role-exclusions.test.ts` (`0`: none has a payment).
   - Test first: `tests/qbo-ui.test.ts`. With payments, no Push, Retry or
     corrected push is offered, for any role. With only voided payments
     (`localPaidCents` 0), today's actions return (Q8).
   - Accept: `bunx vitest run tests/qbo-ui.test.ts`; `bunx tsc --noEmit`.
   - Deps: 5. Answers: Q8.
10. **Shared view.**
    - Files: `components/mgr/views/invoice.tsx`:
      - A **Payments** section: one row per payment (amount, received date,
        method, reference). A voided row shows **Voided** and its reason.
      - Two slots typed like `questionAction`:
        `recordPayment?: ReactNode` and
        `paymentAction?: ReactNode | ((p: InvoicePaymentView) => ReactNode)`.
        Omitted draws the inert default button (**Record payment**, **Void**
        on each unvoided payment), as the inventory shows it; `null` draws
        none.
      - `InvoicePaymentFields({ maxCents, maxDate, quickbooksConnected })`,
        like `KegPoolFields`: `E.edit` amount with `step: 0.01` and
        `maxCents` as maximum, `E.edit` date with `maxDate` as maximum,
        `E.pick` method, `E.edit` reference. When `quickbooksConnected`, it
        states "This invoice will not be sent to QuickBooks while it has
        payments recorded in MGR."
    - Test first: extend `tests/invoice-view.test.ts` with
      `renderToStaticMarkup` cases. The section lists payments and a voided
      row's reason. An omitted slot draws the default button, and `null`
      draws none. The connected sentence appears only when connected.
    - Accept: `bunx vitest run tests/invoice-view.test.ts` plus the
      screen-only list in AGENTS.md; `bunx tsc --noEmit`.
    - Deps: 8. Answers: Q1 (the amount maximum), Q10 (the date maximum).
11. **Live forms and page.**
    - Files:
      - `app/(app)/invoices/[id]/payment-form.tsx` (new, with a module
        comment): `RecordPaymentForm` (`CommandForm` +
        `InvoicePaymentFields`; received date defaults to and is capped at
        `breweryDate(timeZone)`; `quickbooksConnected` from
        `health.connected`; `toCents` on submit) and `VoidPaymentForm` (a
        reason dialog, like Write off).
      - `app/(app)/invoices/[id]/page.tsx`: shows Record payment when
        `model.takesPayment` and `canRun(ctx, "record_invoice_payment")`;
        Void on each unvoided payment when `canRun(ctx,
        "void_invoice_payment")`; otherwise passes `null` to both slots.
        Update the page's header comment.
    - Test first: none of its own. The logic below the component boundary is
      tested in tasks 8 and 9 (`takesPayment`, `invoicePaymentReady`,
      `localPaidCents`), and rendering is the UI exception.
      `tests/app-screen-parity.test.ts` stays task 12's: a `SCREEN_ROUTES`
      row must name an inventory screen that exists, so the route rows land
      with the inventory records.
    - Accept: `bunx tsc --noEmit && bun run lint`; the eye check in task 15.
    - Deps: 4, 5, 9, 10.
12. **Inventory.**
    - Files: `components/mgr/screens.tsx`:
      - **Invoice**: `writes` adds `record_invoice_payment ·
        void_invoice_payment`; states add **paid in MGR**, **payments block
        push** (no Push and no mapping rows) and **no payment due**; `to`
        maps **Record payment** and **Void**.
      - Invoice state **partly paid** (line 1370): "the summary shows the
        QuickBooks balance and the cash received" becomes "the summary shows
        the balance and the cash received, from QuickBooks or from payments
        recorded in MGR".
      - Invoice spec: "the balance comes from QuickBooks only" becomes "the
        balance comes from QuickBooks, or from MGR's payment ledger for an
        invoice QuickBooks never received".
      - New sheets record **Record payment** and **Void payment**, drawing
        the shared fields.
      - **Invoices** state **paid** (line 1357): "payment status is
        confirmed by QuickBooks Online sync · no settlement date or user
        verb" becomes "confirmed by QuickBooks Online sync, or paid in full
        by payments recorded in MGR".
      - **Invoices** spec (line 1358): "invoices whose QuickBooks balance is
        unknown (never pushed, pending or failed) ... are never marked
        overdue" becomes "invoices whose balance is unknown (push result
        unknown, pushed to a previous company, or not yet synced)". "payments
        come back through manual sync and are read-only" becomes "payments
        come back through manual sync and are read-only, except on an
        invoice QuickBooks never received, which takes Record payment".
      - The **Invoices** register header in the frame follows task 7.
      - QuickBooks **Payment** venue frame: the job becomes "The accountant
        records payment here for an invoice in QuickBooks"; the spec drops
        "there is deliberately no Mark paid button anywhere in MGR" and says
        Record payment exists only for an invoice QuickBooks never received.
      - Fixtures from tasks 7 and 8.

      Also `lib/mgr/screen-routes.ts` (**Record payment** and **Void
      payment** to `app/(app)/invoices/[id]/payment-form.tsx`) and, if a tap
      needs it, `lib/mgr/screen-links.ts`.
    - Test first: `tests/mgr-screens.test.ts`, `tests/tap-coverage.test.ts`
      and `tests/app-screen-parity.test.ts` fail on the new names until the
      records and route rows exist.
    - Accept: the screen-only list in AGENTS.md, plus
      `bunx vitest run tests/app-screen-parity.test.ts`; `bunx tsc --noEmit`.
    - Deps: 10, 11.
13. **Customer and API docs.**
    - Files: `content/docs/staff-guide.mdx`:
      - Roles table (line 63): the Sales row adds "record and void invoice
        payments".
      - Invoices register paragraph (line 516): "the current **QuickBooks
        balance**" becomes "the current **Balance**", from QuickBooks or from
        payments recorded in MGR. Replace "Payment is display-only; there is
        no record-payment action." with Record payment: who, which invoices,
        the fields, and that a future date is refused.
      - Add voiding as the only correction, and the push refusal with its
        reason.
      - State the exceptions: an invoice whose QuickBooks push never
        finished keeps an unknown balance and cannot take a payment (Q3). An
        invoice pushed to a previous QuickBooks company cannot take one until
        it is pushed to the current company (Q4). At a connected brewery, an
        invoice with payments is not sent to QuickBooks. A local invoice past
        due stays **Overdue** until paid (Q9).
      - Label table: **Balance due**, **Partial payment** and **Paid**
        include MGR payments. Remove **Payment unverified**. **Payment status
        unavailable** narrows to an unknown push result, an invoice pushed to
        a previous company, an unsynced QuickBooks invoice, or a deleted one.
        Add **No payment due** and **Payments recorded in MGR**.
      - The overdue sentence follows "What changes on the register".
      - The **Paid** paragraph: a ledger invoice's `paid_at` is the day its
        last payment was received.
      - Invoice detail paragraph (line 545): the balance comes from MGR's
        payments for a ledger invoice, with a **Paid in MGR** row; the
        **Payments** section lists each payment, and voided ones with their
        reasons; **Record payment** is for Admin and Sales, and is hidden for
        a pending push, a previous-company push, a paid, written-off, $0.00
        or QuickBooks invoice; Push and the mapping rows are absent while a
        payment exists.
    - `content/docs/api/orders.mdx:40`: the `paid_at` paragraph adds that
      for a ledger-owned invoice `paid_at` is the brewery-local start of the
      day the last payment was received, and that `local_paid_cents` (on
      `list_invoices`) and `payments` (on `get_invoice`) carry the ledger.
      `content/docs/api/portal.mdx:21` adds the `paid_at` sentence only;
      the portal has no balance (Q5).
    - `content/docs/api/` generated blocks through `bun run docs:api`: no
      `API_AREAS` change (see "What exists"). The descriptions come from
      task 5. `portal-guide.mdx` only if Q5 changes.
    - Test first: `tests/api-docs.test.ts` fails until the generated blocks
      list both operations.
    - Accept: `bunx vitest run tests/api-docs.test.ts tests/docs.test.ts
      tests/design-docs.test.ts`.
    - Deps: 4, 5, 12. Answers: Q3, Q4, Q6, Q7, Q8, Q9.
14. **Schema design docs.**
    - Files:
      - `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`: mark
        decision 5 ("Payments have no table", line 769) **Reversed
        2026-10-22** (#1045, owner decision), linking this plan, in the same
        form as decision 6. Add `invoice_payments` and
        `invoice_payment_voids` entries (columns, immutable trigger, RLS). In
        the invoices paragraph (line 331), say `paid_at` is also written by
        `record_invoice_payment` and `void_invoice_payment` for a
        ledger-owned invoice.
      - `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`: the
        why (an invoice QuickBooks never received had no paid state or
        overdue; the void is a reversal row per the ledger convention).
    - Test first: `tests/design-docs.test.ts` and `tests/docs.test.ts`
      already guard these files; no new behavior to test.
    - Accept: `bunx vitest run tests/design-docs.test.ts tests/docs.test.ts`.
    - Deps: 1, 2.
15. **End-to-end acceptance (the triage comment's).**
    - On the test stack, with no QuickBooks connection (`browse` skill, seed
      plus `next dev` against `.env.test.local`):
      1. Record a partial payment. Detail and register show the same
         balance; a past-due invoice stays **Overdue**.
      2. Record the rest. Both read **Paid**, not overdue. The portal invoice
         reads **Paid**.
      3. Void one payment. Both return to **Partial payment**.
    - Then connect a fixture company. Push and the mapping rows are not
      offered. A push through `/api/command` is refused with the reason (task
      3 proves the same in vitest).
    - Desktop and phone screenshots go in a PR comment, test-stack data only.
    - Deps: 11, 12, 13.
16. **Final proof.** `bun run test && bunx tsc --noEmit && bun run lint`.
    Then `/simplify`, the Haiku check (AGENTS.md Negative 3), the read-only
    review of the simplify diff, and the same checks again.
    - Deps: all.

Q5 = "show the balance" would add a task 17 (portal projection migration,
portal views, `portal-guide.mdx`), after 2. Q2 = "net credit memos" would
widen tasks 1, 2, 6, 8 and 13 as the Q2 row says. Q9 in scope would widen
tasks 2, 6, 7 and 13 as the Q9 row says.

## Parallelism

- 1, 2 and 3 edit one migration file, so one agent owns them in sequence.
- 6 starts with 1. 4 and 5 follow 2, in parallel. 14 can start after 2.
- 9 follows 5.
- 7 and 8 follow 6 and 9, in parallel.
- 10 follows 8. 11 waits on 4, 5, 9 and 10.
- 12, then 13, then 15 and 16 close, in that order.

## Out of scope

- Reconciling a local payment into QuickBooks, or a QuickBooks Payment push.
- Refunds, overpayment credit, and applying credit across invoices (Q1).
- Netting credit memos into a local balance (Q2), unless the owner picks it.
- Writing off or voiding a local invoice (Q9), unless the owner picks it.
- Refusing a credit memo push because its original invoice has local
  payments. A credit memo row has no reference to the invoice it credits
  (`create_credit_memo_impl` inserts brewery, kind, customer and issue date
  only), so `start_qbo_push` cannot tell. **Cost:** at a connected brewery, a
  credit memo against a ledger-owned invoice still pushes, and QuickBooks
  holds it as unapplied customer credit. A follow-up issue would add the
  reference first.
- Online pay for local invoices: the portal pay link stays QuickBooks-only.
- An AR total or aging report: the register is the AR list.
- Showing who recorded a payment: the actor is stored, not displayed.

## Deviations (final gate, 2026-10-23)

- **Migration name.** `20261023080000` became `20261023130000`, after
  `main` gained `20261023100000` and `20261023120000`.
- **Push facts for Warehouse.** `qbo_pushes` is readable by Admin and Sales
  only, so `list_invoices` and `get_invoice` read `has_pending_qbo_push` and
  `was_pushed_to_qbo` through a new `public.invoice_push_facts(p_brewery,
  p_invoices)` (security definer, Admin, Sales and Warehouse), not a direct
  `qbo_pushes` select. Without it a Warehouse reader saw a pending or
  previous-company invoice as ledger-owned, with an inferred balance.
- **`paid_at`.** Paid in full stamps the latest received day among the
  unvoided payments, not the day of the payment that completed the total, so
  a backdated payment cannot date it early. The docs already said "the day its
  last payment was received".
- **`paymentBalanceCents` replaces `takesPayment`.** `InvoiceViewModel` carries
  the most a payment may be, or `null` when the invoice takes no payment. The
  page passes it to the form instead of recomputing the balance.
- **`InvoicePaymentFields` merged into `RecordPaymentView`**, its only caller.

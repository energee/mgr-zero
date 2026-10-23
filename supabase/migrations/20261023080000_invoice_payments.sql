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

-- #754: portal customers read only buyer columns of invoices, invoice_lines,
-- order_events, shipments and deliveries. Staff and customers share the
-- `authenticated` table grant, so a column grant would hide staff columns too.
-- Instead the customer SELECT policies on those base tables go away, and each
-- read the portal makes gets a portal_* projection in the portal_brewery shape
-- (baseline): a security definer rows function pins the caller to
-- my_customer_ids() and returns only what the portal reads; a
-- security_invoker view wraps it. Staff keep staff_read.
--
-- Hidden from buyers: invoices.qbo_* sync bookkeeping, written_off_by/reason,
-- refused_delivery_id; invoice_lines pool, order-line and credit links;
-- order_events.actor and payload (short-pick and cancellation reasons);
-- shipments.created_by; every deliveries column (the portal shows no delivery
-- stop, so there is no portal_deliveries).

-- security-definer: justified — no customer SELECT on invoices or
-- invoice_lines; returns only portal columns for my_customer_ids().
-- invoice_lines is jsonb because a view has no foreign key PostgREST could
-- embed through.
create function public.portal_invoice_rows()
returns table (
  id uuid, brewery_id uuid, customer_id uuid, shipment_id uuid, invoice_no bigint,
  kind public.invoice_kind, issued_on date, due_on date, paid_at timestamptz,
  qbo_remote_state public.qbo_remote_state, qbo_total_cents integer, qbo_tax_cents integer,
  qbo_balance_cents integer, qbo_accountant_drift boolean, written_off_at timestamptz,
  created_at timestamptz, invoice_lines jsonb
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.brewery_id, i.customer_id, i.shipment_id, i.invoice_no, i.kind, i.issued_on,
         i.due_on, i.paid_at, i.qbo_remote_state, i.qbo_total_cents, i.qbo_tax_cents,
         i.qbo_balance_cents, i.qbo_accountant_drift, i.written_off_at, i.created_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', l.id, 'kind', l.kind, 'description', l.description,
                     'qty', l.qty, 'amount_cents', l.amount_cents,
                     'skus', case when s.id is null then null else jsonb_build_object('name', s.name) end
                   ) order by l.id)
                   from public.invoice_lines l left join public.skus s on s.id = l.sku_id
                   where l.invoice_id = i.id), '[]'::jsonb)
  from public.invoices i
  where i.customer_id in (select public.my_customer_ids());
$$;
comment on function public.portal_invoice_rows() is
  'portal invoice projection; never add qbo sync bookkeeping, write-off attribution or line links';

-- security-definer: justified — no customer SELECT on order_events.
create function public.portal_order_event_rows()
returns table (id uuid, order_id uuid, event text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.order_id, e.event, e.created_at
  from public.order_events e
  join public.orders o on o.id = e.order_id
  where o.customer_id in (select public.my_customer_ids());
$$;
comment on function public.portal_order_event_rows() is
  'portal order-event projection; never add actor or payload';

-- security-definer: justified — no customer SELECT on shipments.
create function public.portal_shipment_rows()
returns table (id uuid, order_id uuid, invoice_timing text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.order_id, s.invoice_timing
  from public.shipments s
  join public.orders o on o.id = s.order_id
  where o.customer_id in (select public.my_customer_ids());
$$;
comment on function public.portal_shipment_rows() is
  'portal shipment projection; never add created_by';

-- keg_deposit_balances joins invoices under the caller's RLS, so it now
-- returns no customer rows; buyers read their own deposits here instead.
-- `= any(array(...))` rather than `in (select ...)`: Postgres pushes the
-- array comparison below the view's GROUP BY onto invoices_customer_idx; a
-- semi-join would aggregate every brewery's keg lines first.
-- security-definer: justified — same rows keg_deposit_balances computes,
-- limited to my_customer_ids().
create function public.portal_keg_deposit_rows()
returns table (customer_id uuid, keg_size public.keg_size, kegs_on_deposit integer, deposit_cents integer)
language sql stable security definer set search_path = '' as $$
  select k.customer_id, k.keg_size, k.kegs_on_deposit, k.deposit_cents
  from public.keg_deposit_balances k
  where k.customer_id = any(array(select public.my_customer_ids()));
$$;
comment on function public.portal_keg_deposit_rows() is
  'portal keg deposit projection; never add pool or internal columns';

revoke all on function public.portal_invoice_rows(), public.portal_order_event_rows(),
  public.portal_shipment_rows(), public.portal_keg_deposit_rows() from public, anon;
grant execute on function public.portal_invoice_rows(), public.portal_order_event_rows(),
  public.portal_shipment_rows(), public.portal_keg_deposit_rows() to authenticated;

create view public.portal_invoices with (security_invoker = true) as
  select * from public.portal_invoice_rows();
create view public.portal_order_events with (security_invoker = true) as
  select * from public.portal_order_event_rows();
create view public.portal_shipments with (security_invoker = true) as
  select * from public.portal_shipment_rows();
create view public.portal_keg_deposits with (security_invoker = true) as
  select * from public.portal_keg_deposit_rows();
grant select on public.portal_invoices, public.portal_order_events, public.portal_shipments,
  public.portal_keg_deposits to authenticated;

drop policy customer_read on public.invoices;
drop policy customer_read on public.invoice_lines;
drop policy customer_read on public.order_events;
drop policy customer_read on public.shipments;
drop policy customer_read on public.deliveries;

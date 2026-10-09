-- #788 (follow-up to #754): portal customers read only buyer columns of
-- orders, order_lines and skus. Staff and customers share the `authenticated`
-- table grant, so a column grant would hide staff columns too. Same shape as
-- 20261008130000_portal_buyer_columns.sql: the customer SELECT policies on the
-- base tables go away, and the portal reads security definer rows functions
-- pinned to my_customer_ids(), wrapped in security_invoker views. Staff keep
-- staff_read.
--
-- Buyers see only the columns portal_order_rows and portal_sku_price_rows
-- return; every other column stays hidden. That includes orders.created_by
-- (staff uuid), kind, from/to locations, sale channel, needs_restock and
-- shipped_at; order_lines.brewery_id, order_id and qty_picked; and
-- skus.qbo_item_id, qbo_realm_id, keg_pool_id, container_source and upc.
-- order_deposit_lines gets no projection: the portal never read it, and its
-- customer policy filtered through orders, which customers can no longer read.
--
-- Cost: a definer function is never inlined, so a filter on the view runs
-- after the function has built every row the caller may see (same tradeoff as
-- portal_invoice_rows, #754). The order history list accepts that cost: it is
-- one customer's orders. The single-order read passes p_order instead, so it
-- builds one order.
--
-- Deploy: the production build runs db push and then builds the app
-- (scripts/vercel-build.sh), so the old app serves empty order history and
-- catalog reads for the length of that build.

-- security-definer: justified — no customer SELECT on orders, order_lines or
-- skus; returns only portal columns for my_customer_ids(). ship_tos and
-- order_lines are jsonb because a view has no foreign key PostgREST could
-- embed through. Lines are ordered by SKU name so every read shows one order.
-- The SKU name comes without an active filter: a retired SKU keeps its name
-- in order history.
create function public.portal_order_rows(p_order uuid default null)
returns table (
  id uuid, brewery_id uuid, customer_id uuid, order_no bigint, status public.order_status,
  ship_to_id uuid, requested_ship_date date, po_number text, note text, created_at timestamptz,
  ship_tos jsonb, order_lines jsonb
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.brewery_id, o.customer_id, o.order_no, o.status, o.ship_to_id,
         o.requested_ship_date, o.po_number, o.note, o.created_at,
         (select jsonb_build_object('label', t.label, 'city', t.city, 'state', t.state)
          from public.ship_tos t where t.id = o.ship_to_id),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', l.id, 'sku_id', l.sku_id, 'qty_ordered', l.qty_ordered,
                     'qty_shipped', l.qty_shipped, 'qty_refused', l.qty_refused,
                     'short_reason', l.short_reason, 'unit_price_cents', l.unit_price_cents,
                     'skus', jsonb_build_object('name', s.name)
                   ) order by s.name, l.id)
                   from public.order_lines l join public.skus s on s.id = l.sku_id
                   where l.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.customer_id in (select public.my_customer_ids())
    and (p_order is null or o.id = p_order);
$$;
comment on function public.portal_order_rows(uuid) is
  'portal order projection; add only columns a buyer may see (never created_by, locations, sale channel or qty_picked)';

-- sku_prices is security_invoker over skus, so it returns no customer rows
-- once skus has no customer policy. Same price resolution, limited to active
-- SKUs on the caller's sale channels (what the dropped skus policy allowed).
-- security-definer: justified — no customer SELECT on skus.
create function public.portal_sku_price_rows()
returns table (brewery_id uuid, sale_channel_id uuid, sku_id uuid, sku_name text, brand_name text, unit_price_cents integer)
language sql stable security definer set search_path = '' as $$
  select p.brewery_id, p.sale_channel_id, p.sku_id, p.sku_name, p.brand_name, p.unit_price_cents
  from public.sku_prices p
  where p.active
    and p.sale_channel_id in (select c.sale_channel_id from public.customers c
                              where c.id in (select public.my_customer_ids()));
$$;
comment on function public.portal_sku_price_rows() is
  'portal price projection; never add qbo mapping or keg pool columns';

revoke all on function public.portal_order_rows(uuid), public.portal_sku_price_rows() from public, anon;
grant execute on function public.portal_order_rows(uuid), public.portal_sku_price_rows() to authenticated;

create view public.portal_orders with (security_invoker = true) as
  select * from public.portal_order_rows();
create view public.portal_sku_prices with (security_invoker = true) as
  select * from public.portal_sku_price_rows();
grant select on public.portal_orders, public.portal_sku_prices to authenticated;

drop policy customer_read on public.orders;
drop policy customer_read on public.order_lines;
drop policy customer_read on public.order_deposit_lines;
drop policy customer_read on public.skus;

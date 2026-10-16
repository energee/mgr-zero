-- The portal order's ship-to names its country (docs/plans/lolev-orders.md).
-- A foreign ship-to may have no city or state, and the portal reads it as
-- its country (lib/mgr/ship-to-view.ts shipToAddress). Only the ship_tos
-- jsonb gains 'country'; the signature, grants and the portal_orders view
-- are unchanged, so this is a create or replace of
-- 20261009100000_portal_hide_internal_columns.sql's body.

-- security-definer: justified — no customer SELECT on orders, order_lines or
-- skus; returns only portal columns for my_customer_ids().
create or replace function public.portal_order_rows(p_order uuid default null)
returns table (
  id uuid, brewery_id uuid, customer_id uuid, order_no bigint, status public.order_status,
  ship_to_id uuid, requested_ship_date date, po_number text, note text, created_at timestamptz,
  ship_tos jsonb, order_lines jsonb
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.brewery_id, o.customer_id, o.order_no, o.status, o.ship_to_id,
         o.requested_ship_date, o.po_number, o.note, o.created_at,
         (select jsonb_build_object('label', t.label, 'country', t.country, 'city', t.city, 'state', t.state)
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

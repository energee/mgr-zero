-- Portal brand reference sheet (owner decision 2026-11-19). Tapping a brand
-- heading on Shop or on an order opens what the brewery knows about the beer:
-- its label, name and alias, style, ABV, description, hops, and its COLA TTB
-- ID. Buyers cannot read brands, styles or brand_approvals, so
-- portal_brand_rows returns those fields, scoped like portal_availability
-- (my_customer_ids(), brands priced on the caller's sale channel only).
--
-- It replaces portal_cola_labels (20261119020000): one list read for Shop and
-- orders. ttb_id is the COLA whose stored label Shop shows
-- (private.portal_cola_label_rows), else the brand's earliest approved COLA,
-- so the sheet's TTB ID and image name the same approval whenever there is an
-- image. has_label says MGR holds a copy; portal_cola_label_image serves it.
--
-- portal_order_rows (latest: 20261119010000_portal_brand_alias.sql) adds the
-- brand id to each line's skus.brands, so an order groups its lines under the
-- same brand heading Shop draws. Otherwise unchanged.

drop function public.portal_cola_labels(uuid);

-- security-definer: justified — no customer SELECT on brands, styles or
-- brand_approvals; returns only sell-sheet fields for my_customer_ids().
create function public.portal_brand_rows(p_customer uuid)
returns table (brand_id uuid, name text, alias text, style text, abv numeric, description text, hops text, ttb_id text, has_label boolean)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id, c.sale_channel_id from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  ), labels as (
    select r.brand_id, r.ttb_id from private.portal_cola_label_rows(p_customer) r
  )
  select b.id, b.name, b.alias, st.name, b.abv, b.description, b.hops,
    coalesce(l.ttb_id, (select a.ttb_id from public.brand_approvals a
                        where a.brand_id = b.id and a.brewery_id = b.brewery_id and a.kind = 'cola' and a.approved_on is not null
                        order by a.approved_on, a.ttb_id limit 1)),
    l.brand_id is not null
  from caller
  join public.brands b on b.brewery_id = caller.brewery_id
  left join public.styles st on st.id = b.style_id
  left join labels l on l.brand_id = b.id
  where exists (
    select 1 from public.sku_prices p join public.skus s on s.id = p.sku_id and s.brewery_id = p.brewery_id
    where s.brand_id = b.id and p.brewery_id = caller.brewery_id and p.sale_channel_id = caller.sale_channel_id and p.active
  )
  order by b.name, b.id;
$$;
revoke all on function public.portal_brand_rows(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_brand_rows(uuid) to authenticated;

-- Buyer order lines: skus.brands also carries the brand id.
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
                     'release_id', l.release_id,
                     'skus', jsonb_build_object('name', s.name,
                       'brands', jsonb_build_object('id', b.id, 'name', b.name, 'alias', b.alias),
                       'formats', jsonb_build_object('name', f.name))
                   ) order by s.name, l.id)
                   from public.order_lines l join public.skus s on s.id = l.sku_id
                   join public.brands b on b.id = s.brand_id
                   join public.formats f on f.id = s.format_id
                   where l.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.customer_id in (select public.my_customer_ids())
    and (p_order is null or o.id = p_order);
$$;

-- Buyers see a line's brand with the brand's alias under it (owner decision
-- 2026-11-18). A SKU name may carry the alias in place of the brand ("Animal
-- #31 · Sixtel" for brand Masai Giraffe), so the portal names a line from its
-- brand and format instead. Buyers cannot read brands, formats or skus (#788,
-- #793), so the portal projections carry them:
--   portal_sku_price_rows: brand_alias and format_name beside brand_name.
--   portal_order_rows and portal_invoice_rows: each line's skus object gains
--     brands {name, alias} and formats {name}, the shape staff reads embed.
-- The alias was staff-only until now; it is a label, not pricing or provider
-- data.
--
-- Redefined functions start from their latest definition and keep all of it:
--   portal_sku_price_rows 20261119000000_format_pallet_fit.sql
--   portal_order_rows     20261118190000_releases.sql
--   portal_invoice_rows   20261008130000_portal_buyer_columns.sql

-- security-definer: justified — no customer SELECT on skus, brands or formats
-- (#788, #793); returns only portal columns for my_customer_ids().
drop view public.portal_sku_prices;
drop function public.portal_sku_price_rows();
create function public.portal_sku_price_rows()
returns table (brewery_id uuid, sale_channel_id uuid, sku_id uuid, sku_name text, brand_name text, unit_price_cents integer,
  package_type public.package_type, keg_size public.keg_size, units_per_case integer, pallet_fit integer,
  brand_alias text, format_name text)
language sql stable security definer set search_path = '' as $$
  select p.brewery_id, p.sale_channel_id, p.sku_id, p.sku_name, p.brand_name, p.unit_price_cents,
    f.package_type, f.keg_size, f.units_per_case, f.pallet_fit, b.alias, f.name
  from public.sku_prices p
  join public.skus s on s.id = p.sku_id and s.brewery_id = p.brewery_id
  join public.brands b on b.id = s.brand_id and b.brewery_id = s.brewery_id
  join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
  where p.active
    and p.sale_channel_id in (select c.sale_channel_id from public.customers c
                              where c.id in (select public.my_customer_ids()));
$$;
comment on function public.portal_sku_price_rows() is
  'portal price projection; never add qbo mapping or keg pool columns';
revoke all on function public.portal_sku_price_rows() from public, anon;
grant execute on function public.portal_sku_price_rows() to authenticated;
create view public.portal_sku_prices with (security_invoker = true) as
  select * from public.portal_sku_price_rows();
grant select on public.portal_sku_prices to authenticated;

-- Buyer order lines: skus carries its brand (with alias) and format names.
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
                       'brands', jsonb_build_object('name', b.name, 'alias', b.alias),
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

-- Buyer invoice lines: a SKU line's skus carries its brand (with alias) and format names.
create or replace function public.portal_invoice_rows()
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
                     'id', l.id, 'kind', l.kind, 'sku_id', l.sku_id, 'description', l.description,
                     'qty', l.qty, 'unit_price_cents', l.unit_price_cents, 'amount_cents', l.amount_cents,
                     'skus', case when s.id is null then null else jsonb_build_object('name', s.name,
                       'brands', jsonb_build_object('name', b.name, 'alias', b.alias),
                       'formats', jsonb_build_object('name', f.name)) end
                   ))
                   from public.invoice_lines l left join public.skus s on s.id = l.sku_id
                   left join public.brands b on b.id = s.brand_id
                   left join public.formats f on f.id = s.format_id
                   where l.invoice_id = i.id), '[]'::jsonb)
  from public.invoices i
  where i.customer_id in (select public.my_customer_ids());
$$;
comment on function public.portal_invoice_rows() is
  'portal invoice projection; never add qbo sync bookkeeping, write-off attribution or line links';

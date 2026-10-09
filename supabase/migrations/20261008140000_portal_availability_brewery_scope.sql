-- #755: portal_availability summed every tenant's movement ledger and only then
-- joined the caller's customer. Resolve the caller's customer (and so its
-- brewery) first, then aggregate only that brewery's movements and open
-- allocations. Each aggregate filters by the brewery before grouping, so it
-- uses movements_onhand_idx and allocations_open_idx.
-- Contract unchanged: own-account coarse badges, security definer because
-- customers cannot read the ledger, never public.atp (staff-scoped).
create or replace function public.portal_availability(p_customer uuid) returns table (sku_id uuid, badge text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  ), on_hand as (
    select m.sku_id, sum(m.qty) as qty from public.inventory_movements m
    where m.brewery_id = (select brewery_id from caller) group by 1
  ), allocated as (
    select al.sku_id, sum(al.qty) as qty from public.allocations al
    where al.brewery_id = (select brewery_id from caller) and al.status = 'open' group by 1
  ), availability as (
    select coalesce(o.sku_id, al.sku_id) as sku_id,
      coalesce(o.qty, 0) - coalesce(al.qty, 0) as qty
    from on_hand o full join allocated al on al.sku_id = o.sku_id
  )
  select a.sku_id, case when a.qty <= 0 then 'out' when a.qty < 20 then 'low' else 'in' end
  from availability a;
$$;
-- ponytail: fixed low-stock threshold, per-brewery setting when someone asks

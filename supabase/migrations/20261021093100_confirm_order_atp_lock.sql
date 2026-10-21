-- #1035: two orders for the same SKU confirmed at the same moment both
-- skipped the oversell warning. Each confirm inserted its allocations and
-- then read public.atp, which cannot see the other's uncommitted
-- allocations, so both saw enough stock and the SKU was overcommitted
-- silently. (Shipping re-checks on-hand under the ledger lock, so stock never
-- went negative; the warning was what went wrong.)
--
-- confirm_order_impl now takes one transaction advisory lock per ordered SKU
-- before it allocates, in SKU id order, after the order row lock. A second
-- confirm sharing a SKU waits, then reads ATP with the first one committed,
-- so its warning is exact. Confirms of different SKUs do not wait for each
-- other. The key follows the existing pg_advisory_xact_lock(hashtextextended(
-- '<scope>:' || ...)) pattern of the taproom-count and square-publish locks.
-- Nothing else takes this lock, so no other lock order is involved.
--
-- Body otherwise copied from 00001_baseline.sql (no later migration
-- redefines it).
create or replace function private.confirm_order_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; w jsonb;
begin
  o := private.lock_order(p_order, array['submitted']::public.order_status[]);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atp:' || sku_id::text, 0))
  from (select distinct sku_id from public.order_lines where order_id = p_order order by sku_id) s;
  insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
  select o.brewery_id, sku_id, qty_ordered, 'order_line', id, 'open'
  from public.order_lines where order_id = p_order;
  update public.orders set status = 'confirmed' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'confirmed');
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', a.sku_id, 'atp', a.qty)), '[]') into w
  from public.atp a join public.order_lines ol on ol.sku_id = a.sku_id and ol.order_id = p_order
  where a.brewery_id = o.brewery_id and a.qty < 0;
  return jsonb_build_object('order_id', p_order, 'warnings', w);
end $$;

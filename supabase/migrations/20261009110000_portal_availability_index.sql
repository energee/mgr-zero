-- #794: portal_availability sums qty per SKU for one brewery from
-- inventory_movements and from open allocations. Both indexes it reads had
-- the brewery and SKU but not qty, so every matching row was read from the
-- heap. EXPLAIN showed a Seq Scan or Bitmap Heap Scan, then a HashAggregate.
-- Carrying qty makes both sums index-only scans, already grouped by SKU.
--
-- The existing indexes are widened, not joined by new ones: same key columns,
-- so every other reader (such as the per-bin stock checks) keeps its plan
-- and the ledgers pay for no extra index on insert.
drop index if exists public.movements_onhand_idx;
create index movements_onhand_idx on public.inventory_movements (brewery_id, sku_id, location_id, bin_id) include (qty);

drop index if exists public.allocations_open_idx;
create index allocations_open_idx on public.allocations (brewery_id, sku_id) include (qty) where status = 'open';

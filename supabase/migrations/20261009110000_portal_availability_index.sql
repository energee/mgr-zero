-- #794: portal_availability sums qty per SKU for one brewery from
-- inventory_movements and from open allocations. Both indexes it reads had
-- the brewery and SKU but not qty, so every matching row was read from the
-- heap (EXPLAIN on a seeded copy: Seq Scan or Bitmap Heap Scan, then
-- HashAggregate; numbers in PR #795). Carrying qty lets both sums be
-- index-only scans, already grouped by SKU. Heap fetches remain only for
-- pages vacuum has not yet marked all-visible.
--
-- The existing indexes are widened, not joined by new ones: same key columns,
-- so every other reader (such as the per-bin stock checks) keeps its plan.
-- Cost: each entry is one numeric wider. inventory_movements is append-only,
-- so nothing else changes there. On allocations, an update that changes qty
-- on an open row (order edit, short pick) is no longer a HOT update; accepted
-- because open allocations are few per brewery.
--
-- Plain drop index, not if exists: the baseline creates both, so a missing
-- one is drift and should fail the push.
--
-- Not concurrent: the rebuild locks both tables for its duration. Acceptable
-- only because hosted is pre-release with almost no ledger rows. Once a table
-- is large, build `create index concurrently <new> ...` in its own
-- non-transactional migration, then drop the old index and rename the new one.
drop index public.movements_onhand_idx;
create index movements_onhand_idx on public.inventory_movements (brewery_id, sku_id, location_id, bin_id) include (qty);

drop index public.allocations_open_idx;
create index allocations_open_idx on public.allocations (brewery_id, sku_id) include (qty) where status = 'open';

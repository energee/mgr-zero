-- The SKU history prefix is also eligible for tenant/SKU ledger sums. Keep
-- those reads index-only if the planner chooses it instead of on-hand's index.
drop index public.movements_sku_history_idx;
create index movements_sku_history_idx on public.inventory_movements
  (brewery_id, sku_id, created_at desc, id desc) include (qty);

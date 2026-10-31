-- Today and Work read these sparse queues even after years of completed orders.
-- Keep cancelled orders that still have staged beer in the restock queue.
create index orders_needs_restock_idx on public.orders (brewery_id)
  where needs_restock;

-- Let refused_delivery_returns start with refused lines, not delivery history.
create index order_lines_refused_idx on public.order_lines (order_id)
  where qty_refused > 0;
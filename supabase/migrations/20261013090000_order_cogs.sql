-- #810 PR 2: what the beer on one order cost. Reads the sale_removal ledger rows
-- of an order, takes back what came home (credit memos and refused deliveries
-- both write return_in rows linked by source_movement_id), and prices the rest
-- at the frozen packaging-close cost of the lot each unit shipped from: the
-- same join sku_inventory_value uses. A unit with no lot, or whose run has no
-- cost, is counted in uncosted_qty and never priced at a guess.
create view public.order_line_cogs with (security_invoker=true) as
  select sale.brewery_id, sale.ref as order_id, sale.sku_id,
    sum(net.qty) as qty,
    coalesce(sum(net.qty * output.unit_cost_cents) filter(where output.unit_cost_cents is not null),0) as cost_cents,
    coalesce(sum(net.qty) filter(where output.unit_cost_cents is null),0) as uncosted_qty
  from public.inventory_movements sale
  join public.orders o on o.id=sale.ref and o.brewery_id=sale.brewery_id
  cross join lateral (
    select -sale.qty - coalesce((
      select sum(returned.qty) from public.inventory_movements returned
      where returned.brewery_id=sale.brewery_id and returned.source_movement_id=sale.id and returned.type='return_in'),0) as qty
  ) net
  left join public.lots lot on lot.id=sale.lot_id and lot.brewery_id=sale.brewery_id
  left join public.packaging_run_outputs output on output.run_id=lot.packaging_run_id
    and output.sku_id=sale.sku_id and output.brewery_id=sale.brewery_id
  where sale.type='sale_removal'
  group by sale.brewery_id,sale.ref,sale.sku_id;
revoke all on public.order_line_cogs from public,anon,authenticated;
grant select on public.order_line_cogs to authenticated;
grant all on public.order_line_cogs to postgres,service_role;

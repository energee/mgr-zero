-- #1664: filtered order history and cursor-based movement history.
create index orders_status_history_idx on public.orders (brewery_id, status, created_at desc, id desc);
create index movements_history_idx on public.inventory_movements (brewery_id, created_at desc, id desc);
-- movements_history_idx covers every read of the baseline (brewery_id, created_at) index.
drop index public.movements_created_idx;
-- The SKU history prefix is also eligible for tenant/SKU ledger sums. Keep
-- those reads index-only if the planner chooses it instead of on-hand's index.
create index movements_sku_history_idx on public.inventory_movements
  (brewery_id, sku_id, created_at desc, id desc) include (qty);

-- The named channel/vendor FK lookups scanned their tenant's rows, and the
-- vendor-filtered PO list uses the same equality predicates. Do not add an
-- index for every FK column: existing composite/partial indexes serve others.
create index orders_sale_channel_idx on public.orders (sale_channel_id, brewery_id);
create index purchase_orders_vendor_idx on public.purchase_orders (vendor_id, brewery_id);

-- FIFO count-ledger aging, reduced in PostgreSQL instead of shipping every
-- historical event to the command process. An excess return is discarded,
-- just as an empty FIFO queue discards it; it cannot retire a later shipment.
create function public.get_keg_report_aging(p_brewery uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with permitted as materialized (
    select p_brewery as brewery_id
    where p_brewery in (select public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[]))
  ), running as materialized (
    select e.customer_id, e.pool_id, e.keg_size, e.qty, e.reason, e.at,
      sum(case when e.reason = 'shipped' then e.qty else 0 end) over ledger as shipped,
      sum(case when e.reason = 'shipped' then e.qty else -e.qty end) over ledger as balance
    from public.keg_events e
    where e.brewery_id = (select brewery_id from permitted) and e.customer_id is not null
      and e.reason in ('shipped', 'returned', 'lost')
    window ledger as (partition by e.customer_id, e.pool_id, e.keg_size
      order by e.at, e.created_at, e.id rows unbounded preceding)
  ), retired as (
    -- Adding the negative running-balance minimum removes returns/losses
    -- made while the queue was empty; only actual retirements consume FIFO.
    select customer_id, pool_id, keg_size,
      sum(case when reason <> 'shipped' then qty else 0 end) + least(0, min(balance)) as qty
    from running group by customer_id, pool_id, keg_size
  ), open_shipments as materialized (
    select r.customer_id, r.pool_id, r.keg_size, r.at,
      greatest(0, least(r.qty, r.shipped - t.qty)) as qty,
      floor(extract(epoch from (now() - r.at)) / 86400) as days
    from running r join retired t using (customer_id, pool_id, keg_size)
    where r.reason = 'shipped'
  ), held as (
    select * from open_shipments where qty > 0
  ), buckets as (
    select case when days <= 30 then '0-30' when days <= 60 then '31-60'
      when days <= 90 then '61-90' else '90+' end as bucket,
      sum(h.qty) as kegs, sum(h.qty * coalesce(p.deposit_cents, 0)) as deposit_cents
    from held h left join public.keg_pools p on p.id = h.pool_id and p.brewery_id = p_brewery
    group by 1
  ), sizes as (
    select pool_id, keg_size, sum(qty) as qty from held group by pool_id, keg_size
  ), customers as (
    select h.customer_id, coalesce(c.name, '') as name,
      sum(case when h.days > 90 then h.qty else 0 end) as over_90, min(h.at) as oldest_at
    from held h left join public.customers c on c.id = h.customer_id and c.brewery_id = p_brewery
    group by h.customer_id, c.name
  ), losses as (
    select customer_id, pool_id, keg_size, sum(qty) as qty from running
    where reason = 'lost' group by customer_id, pool_id, keg_size
  )
  select jsonb_build_object(
    'customerNames', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
      from public.customers c where c.brewery_id = (select brewery_id from permitted)), '[]'::jsonb),
    'aging', coalesce((select jsonb_agg(to_jsonb(b)) from buckets b), '[]'::jsonb),
    'bySize', coalesce((select jsonb_agg(to_jsonb(s)) from sizes s), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(c)) from customers c), '[]'::jsonb),
    'lost', coalesce((select jsonb_agg(to_jsonb(l)) from losses l), '[]'::jsonb)
  );
$$;
revoke all on function public.get_keg_report_aging(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_keg_report_aging(uuid) to authenticated;
comment on function public.get_keg_report_aging(uuid) is
  'Admin/Warehouse caller-RLS-bound FIFO keg aging and customer losses; returns report aggregates without event-page or exact-count round trips.';

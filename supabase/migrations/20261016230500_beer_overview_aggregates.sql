-- Keep the Beer landing's location/SKU and customer/pool grids in SQL.
-- Invoker security preserves the existing RLS visibility of every source;
-- on_hand keeps its own authorized-stock projection, including for brewers.
create function public.get_beer_overview_aggregates(p_brewery uuid)
returns table (taproom_below_par bigint, kegs_out bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*)
     from public.taproom_pars p
     left join public.on_hand o
       on o.brewery_id = p.brewery_id
       and o.location_id = p.location_id
       and o.sku_id = p.sku_id
     where p.brewery_id = p_brewery and coalesce(o.qty, 0) < p.par_qty),
    (select coalesce(sum(k.qty), 0)
     from public.keg_customer_balances k
     where k.brewery_id = p_brewery);
$$;

revoke all on function public.get_beer_overview_aggregates(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_beer_overview_aggregates(uuid) to authenticated;
comment on function public.get_beer_overview_aggregates(uuid) is
  'Beer landing scalars over caller-visible pars, stock and signed customer keg balances; no stored counters or RLS bypass.';

-- Portal Pre-order section (owner decision 2026-11-19). Shop lists the
-- packages staff released from a planned batch in their own section, apart
-- from packaged stock. A buyer cannot read releases or batches, so
-- portal_releases now also says which kind each open release is: from_batch
-- is true for a planned-batch release and false for a stock release. Nothing
-- else about the batch is exposed. The return type changes, so the function is
-- dropped and created again; its body, scope and grants are otherwise those of
-- 20261118190000_releases.sql.
drop function public.portal_releases(uuid);
create function public.portal_releases(p_customer uuid)
returns table (release_id uuid, sku_id uuid, ships_from date, orders_close_on date, badge text, from_batch boolean)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id, c.sale_channel_id, c.release_delay_days from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  )
  select r.id, r.sku_id, r.ships_from, r.orders_close_on,
    case when r.remaining <= 0 then 'out' when r.remaining < 20 then 'low' else 'in' end,
    r.batch_id is not null
  from private.release_state((select brewery_id from caller)) r
  join public.sku_prices p on p.sku_id = r.sku_id and p.active
  join caller c on c.brewery_id = p.brewery_id and c.sale_channel_id = p.sale_channel_id
  where r.open and r.days_open >= c.release_delay_days
  order by r.ships_from, r.id;
$$;
revoke all on function public.portal_releases(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_releases(uuid) to authenticated;

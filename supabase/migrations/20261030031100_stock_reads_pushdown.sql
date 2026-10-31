-- #1643: staff stock filters must reach the ledger before aggregation.
-- Taproom staff cannot read raw movement history, so retain only their safe
-- quantity projection behind a definer boundary. Mixed-role memberships use
-- the ordinary RLS branch, never both branches.
create function public.taproom_on_hand_rows()
returns table(brewery_id uuid, sku_id uuid, location_id uuid, qty numeric)
language sql stable security definer set search_path = '' as $$
  with staff as materialized (
    select bu.brewery_id from public.brewery_users bu
    where bu.user_id = auth.uid()
      and 'taproom' = any(bu.roles)
      and not (bu.roles && array['admin','sales','warehouse','brewer']::public.staff_role[])
      and private.request_scope_allows(bu.brewery_id))
  select m.brewery_id, m.sku_id, m.location_id, sum(m.qty)
  from staff s
  join public.inventory_movements m on m.brewery_id = s.brewery_id
  join public.locations l on l.id = m.location_id and l.brewery_id = m.brewery_id
  where 'taproom' = any(l.uses)
  group by 1,2,3;
$$;
comment on function public.taproom_on_hand_rows() is
  'Taproom-only membership balances at taproom-use locations; never raw movement history. Mixed roles use on_hand through ledger RLS.';
revoke all on function public.taproom_on_hand_rows() from public, anon, authenticated, service_role;
grant execute on function public.taproom_on_hand_rows() to authenticated;

create or replace view public.on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, sum(qty) as qty
  from public.inventory_movements
  where brewery_id in (
    select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))
  group by brewery_id, sku_id, location_id
  union all
  select brewery_id, sku_id, location_id, qty from public.taproom_on_hand_rows();

-- ATP is one SKU-grain sum, not a second aggregation of location balances.
-- Open reservations without any movement still produce negative ATP; closed
-- reservations alone produce no row. Both source branches permit pushdown.
create or replace view public.atp with (security_invoker = true) as
  select brewery_id, sku_id, sum(qty) as qty
  from (
    select brewery_id, sku_id, qty from public.inventory_movements
    union all
    select brewery_id, sku_id, -qty from public.allocations where status = 'open'
  ) stock
  where brewery_id in (
    select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))
  group by brewery_id, sku_id;

drop function public.on_hand_rows();

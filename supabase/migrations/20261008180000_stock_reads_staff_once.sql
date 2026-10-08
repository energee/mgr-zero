-- #756: on_hand_rows / keg_bin_on_hand_rows resolve the caller's staff
-- memberships once per query instead of once per ledger row.
--
-- Both called public.is_staff_of() (and public.staff_role() for taproom) for
-- every movement row. Each call runs private.request_scope_allows, whose
-- exception block is a subtransaction; at 50k movements for one brewery that
-- made `select ... from on_hand` take ~850 ms against ~11 ms for this form.
--
-- Same rows as before: staff of any original role see the whole brewery;
-- taproom staff see only locations put to taproom use; non-staff see nothing.

create or replace function public.on_hand_rows()
returns table(brewery_id uuid, sku_id uuid, location_id uuid, qty numeric)
language sql stable security definer set search_path = '' as $$
  with staff as (
    select bu.brewery_id, bu.role from public.brewery_users bu
    where bu.user_id = auth.uid() and private.request_scope_allows(bu.brewery_id))
  select m.brewery_id, m.sku_id, m.location_id, sum(m.qty)
  from public.inventory_movements m
  join staff s on s.brewery_id = m.brewery_id
  join public.locations l on l.id = m.location_id and l.brewery_id = m.brewery_id
  where s.role <> 'taproom' or 'taproom' = any(l.uses)
  group by 1,2,3;
$$;

create or replace function public.keg_bin_on_hand_rows()
returns table(brewery_id uuid, pool_id uuid, keg_size public.keg_size, location_id uuid, bin_id uuid, qty integer)
language sql stable security definer set search_path = '' as $$
  -- A loss at a customer (customer_id set) is off that customer's balance;
  -- the shipped event already took it out of the bin.
  -- private.bin_stock_on_hand (#532) repeats this reason-to-sign arithmetic
  -- for keg bins; change both together.
  with staff as (
    select bu.brewery_id, bu.role from public.brewery_users bu
    where bu.user_id = auth.uid() and private.request_scope_allows(bu.brewery_id))
  select e.brewery_id, e.pool_id, e.keg_size, e.location_id, e.bin_id,
         sum(case e.reason when 'acquired' then e.qty when 'found' then e.qty when 'transferred_in' then e.qty when 'returned' then e.qty
                         when 'retired' then -e.qty when 'transferred_out' then -e.qty when 'shipped' then -e.qty
                         when 'lost' then case when e.customer_id is null then -e.qty else 0 end
                         else 0 end)::int
  from public.keg_events e
  join staff s on s.brewery_id = e.brewery_id
  join public.locations l on l.id = e.location_id and l.brewery_id = e.brewery_id
  where s.role <> 'taproom' or 'taproom' = any(l.uses)
  group by 1,2,3,4,5;
$$;

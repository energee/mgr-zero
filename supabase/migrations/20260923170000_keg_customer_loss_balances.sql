-- 20260923170000_keg_customer_loss_balances.sql — keg balances stay whole
-- when kegs are lost or returned at a customer (#449, #464): a customer loss
-- no longer comes off the bin a second time, and returned/lost at a customer
-- are checked against what that customer holds.
--
-- Both are copies of the latest definitions (keg_bin_on_hand_rows from
-- 20260913140000_location_multi_use.sql, record_keg_event from the baseline)
-- with only those changes. create or replace keeps grants and comments.

CREATE OR REPLACE FUNCTION public.keg_bin_on_hand_rows()
 RETURNS TABLE(brewery_id uuid, pool_id uuid, keg_size keg_size, location_id uuid, bin_id uuid, qty integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- A loss at a customer (customer_id set) is off that customer's balance;
  -- the shipped event already took it out of the bin.
  -- private.bin_stock_on_hand (#532) repeats this reason-to-sign arithmetic
  -- for keg bins; change both together.
  select e.brewery_id, e.pool_id, e.keg_size, e.location_id, e.bin_id,
         sum(case e.reason when 'acquired' then e.qty when 'found' then e.qty when 'transferred_in' then e.qty when 'returned' then e.qty
                         when 'retired' then -e.qty when 'transferred_out' then -e.qty when 'shipped' then -e.qty
                         when 'lost' then case when e.customer_id is null then -e.qty else 0 end
                         else 0 end)::int
  from public.keg_events e
  join public.locations l on l.id = e.location_id and l.brewery_id = e.brewery_id
  where e.brewery_id in (select public.my_brewery_ids())
    and (public.is_staff_of(e.brewery_id)
         or (public.staff_role(e.brewery_id) = 'taproom' and 'taproom' = any(l.uses)))
  group by 1,2,3,4,5;
$function$
;

-- One ledger row. qty is always positive; the reason is the direction.
-- Bin-side removals (retired, shipped, lost with no customer) cannot exceed
-- what the bin holds; customer-side removals (returned, lost at a customer)
-- cannot exceed what the customer holds for that pool and size.
CREATE OR REPLACE FUNCTION public.record_keg_event(p_brewery uuid, p_pool uuid, p_keg_size keg_size, p_qty integer, p_reason keg_event_reason, p_location uuid, p_bin uuid, p_customer uuid, p_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_row public.keg_events; v_active boolean; v_on_hand int; v_held int;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_keg_event', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'pool', p_pool, 'keg_size', p_keg_size, 'qty', p_qty, 'reason', p_reason,
                       'location', p_location, 'bin', p_bin, 'customer', p_customer, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  -- The bin and customer checks below read a total then insert; take the keg
  -- ledger lock (as every keg writer does) so two cannot both pass on the same kegs.
  lock table public.keg_events in share row exclusive mode;
  if p_qty <= 0 then raise exception 'qty must be positive'; end if;
  if p_reason in ('transferred_in','transferred_out') then raise exception 'transfers are recorded by stock transfers and bin moves'; end if;
  if p_reason in ('shipped','returned') and p_customer is null then raise exception 'customer is required for % kegs', p_reason; end if;
  -- found is a fleet correction at the bin; a keg found at a customer is a
  -- shipped event, so the customer balance is never moved by found.
  if p_reason in ('acquired','retired','found') and p_customer is not null then raise exception '% kegs carry no customer', p_reason; end if;
  select active into v_active from public.keg_pools where id = p_pool and brewery_id = p_brewery;
  if v_active is null then raise exception 'keg pool not found'; end if;
  if not v_active then raise exception 'keg pool is out of service'; end if;
  if not exists (select 1 from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery) then
    raise exception 'bin is not in that location';
  end if;
  if p_reason in ('retired','shipped') or (p_reason = 'lost' and p_customer is null) then
    select coalesce(sum(qty), 0) into v_on_hand from public.keg_bin_on_hand
      where pool_id = p_pool and keg_size = p_keg_size and bin_id = p_bin;
    if v_on_hand < p_qty then raise exception 'not enough kegs in that bin: % on hand', v_on_hand; end if;
  end if;
  if p_reason in ('returned','lost') and p_customer is not null then
    select coalesce(sum(qty), 0) into v_held from public.keg_customer_balances
      where brewery_id = p_brewery and customer_id = p_customer and pool_id = p_pool and keg_size = p_keg_size;
    if v_held < p_qty then raise exception 'not enough kegs at that customer: customer holds %', v_held; end if;
  end if;
  insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, customer_id, note, created_by)
  values (p_brewery, p_pool, p_keg_size, p_location, p_bin, p_qty, p_reason, p_customer, p_note, auth.uid()) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$
;

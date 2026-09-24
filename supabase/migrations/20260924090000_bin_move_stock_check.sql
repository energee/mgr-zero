-- #451: a bin move or transfer receipt never takes more out of the source bin
-- than it holds. Before this, move_stock_bin checked a SKU only when a lot was
-- named or lot-tracked stock sat in the bin, and never checked materials or
-- empty kegs; receive_stock_transfer_impl skipped lot-less material sources
-- without explicit sources, untracked SKUs likewise, and never checked keg
-- lines. Every bin-stock check now goes through one helper:
--   private.bin_stock_on_hand  what a bin holds of one SKU, material, or keg
--                              pool and size; for one lot (a null lot is the
--                              lot-less rows) or, with p_any_lot, every lot;
--   private.assert_bin_stock   refuses a quantity above that, and owns the
--                              messages;
--   private.assert_movement_stock (#450) now delegates to it.
-- Kegs are summed from keg_events for the bin directly, by the same reason
-- rules as keg_bin_on_hand_rows (with #449's rule that a loss at a customer is
-- not a bin removal); keg_bin_on_hand is a SECURITY DEFINER function wrapper,
-- so a filter on it rebuilt every keg balance per check.
-- Procedure bodies copy the latest definitions (00001_baseline.sql; no later
-- migration redefines either) with only the stock checks and ledger locks
-- changed.

create or replace function private.bin_stock_on_hand(p_brewery uuid, p_bin uuid,
  p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size public.keg_size,
  p_lot uuid, p_any_lot boolean default false)
 returns numeric
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(case
    when p_sku is not null then
      (select sum(qty) from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku
         and bin_id = p_bin and (p_any_lot or lot_id is not distinct from p_lot))
    when p_material is not null then
      (select sum(qty) from public.material_movements where brewery_id = p_brewery and material_id = p_material
         and bin_id = p_bin and (p_any_lot or lot_id is not distinct from p_lot))
    else
      (select sum(case reason when 'acquired' then qty when 'found' then qty when 'transferred_in' then qty when 'returned' then qty
                              when 'retired' then -qty when 'transferred_out' then -qty when 'shipped' then -qty
                              when 'lost' then case when customer_id is null then -qty else 0 end
                              else 0 end)
         from public.keg_events where brewery_id = p_brewery and pool_id = p_keg_pool and keg_size = p_keg_size and bin_id = p_bin)
  end, 0)
$function$;

-- Refuses taking p_qty (positive) out of the bin. With a null lot and not
-- p_any_lot, only lot-less rows count, and lot rows in the bin ask for a lot.
-- Callers hold the ledger lock.
create or replace function private.assert_bin_stock(p_brewery uuid, p_bin uuid,
  p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size public.keg_size,
  p_lot uuid, p_any_lot boolean, p_qty numeric)
 returns void
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_available numeric;
begin
  v_available := private.bin_stock_on_hand(p_brewery, p_bin, p_sku, p_material, p_keg_pool, p_keg_size, p_lot, p_any_lot);
  if p_qty <= v_available then return; end if;
  if p_lot is null and not p_any_lot and (
       (p_sku is not null and exists(select 1 from public.inventory_movements
          where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_bin and lot_id is not null))
    or (p_material is not null and exists(select 1 from public.material_movements
          where brewery_id = p_brewery and material_id = p_material and bin_id = p_bin and lot_id is not null)))
    then raise exception 'choose the recorded lot for this removal'; end if;
  raise exception 'insufficient selected bin and lot stock: % on hand in the source bin', pg_catalog.trim_scale(v_available);
end $function$;

-- #450's check, now the SKU case of assert_bin_stock. A bin outside
-- p_location holds nothing there.
create or replace function private.assert_movement_stock(p_brewery uuid, p_sku uuid, p_location uuid,
  p_bin uuid, p_lot uuid, p_qty numeric)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
  if p_qty >= 0 then return; end if;
  perform private.assert_bin_stock(p_brewery,
    (select id from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery),
    p_sku, null, null, null, p_lot, false, -p_qty);
end $function$;

revoke all on function private.bin_stock_on_hand(uuid, uuid, uuid, uuid, uuid, public.keg_size, uuid, boolean) from public;
revoke all on function private.assert_bin_stock(uuid, uuid, uuid, uuid, uuid, public.keg_size, uuid, boolean, numeric) from public;
grant execute on function private.bin_stock_on_hand(uuid, uuid, uuid, uuid, uuid, public.keg_size, uuid, boolean) to postgres;
grant execute on function private.assert_bin_stock(uuid, uuid, uuid, uuid, uuid, public.keg_size, uuid, boolean, numeric) to postgres;

create or replace function private.receive_stock_transfer_impl(p_transfer uuid, p_lines jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare t public.stock_transfers; l public.stock_transfer_lines; rq record; v_qty numeric; v_sources jsonb; src record;
begin
  t := private.lock_transfer(p_transfer, array['picked','in_transit']::public.stock_transfer_status[]);
  -- ponytail: global ledger locks, shared stock-key locks across every writer at higher throughput.
  lock table public.inventory_movements in share row exclusive mode;
  lock table public.material_movements in share row exclusive mode;
  lock table public.keg_events in share row exclusive mode;
  if jsonb_typeof(p_lines) is distinct from 'array' or exists (select 1 from jsonb_array_elements(p_lines) e where not exists (select 1 from public.stock_transfer_lines where id = (e->>'line_id')::uuid and transfer_id = p_transfer))
     or (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then raise exception 'invalid transfer line coverage'; end if;
  for l in select * from public.stock_transfer_lines where transfer_id = p_transfer loop
    select (e->>'qty')::numeric into v_qty from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e->>'line_id')::uuid = l.id;
    v_qty := coalesce(v_qty, l.qty_picked, l.qty);
    if l.keg_pool_id is not null and v_qty <> trunc(v_qty) then raise exception 'empty kegs must be whole units'; end if;
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty < 0 or v_qty > least(l.qty,coalesce(l.qty_picked,l.qty)) then raise exception 'invalid received quantity'; end if;
    if l.material_id is not null and v_qty <> round(v_qty,4) then raise exception 'material quantities require at most four decimals'; end if;
    if l.sku_id is not null and v_qty <> round(v_qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
    select e->'sources' into v_sources from jsonb_array_elements(p_lines) e where (e->>'line_id')::uuid = l.id;
    v_sources := coalesce(v_sources, case when v_qty = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('lot_id', null, 'qty', v_qty)) end);
    if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'sources must be an array'; end if;
    if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e),0) <> v_qty or
       (select count(distinct jsonb_build_array((e->>'lot_id')::uuid)) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources) then raise exception 'distinct sources must sum to received quantity'; end if;
    if v_qty = 0 then
      if jsonb_array_length(v_sources) <> 0 then raise exception 'zero receipt has no sources'; end if;
      continue;
    end if;
    for src in select (e->>'lot_id')::uuid lot_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
      if src.qty is null or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <= 0 then raise exception 'invalid source quantity'; end if;
      if l.sku_id is not null and src.qty <> round(src.qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
      if l.material_id is not null and src.qty <> round(src.qty,4) then raise exception 'material quantities require at most four decimals'; end if;
      if l.keg_pool_id is not null and src.lot_id is not null then raise exception 'empty kegs have no lot'; end if;
      perform private.assert_bin_stock(t.brewery_id, l.from_bin_id, l.sku_id, l.material_id, l.keg_pool_id, l.keg_size, src.lot_id, false, src.qty);
    end loop;
    if l.sku_id is not null then
      insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
      select t.brewery_id, l.sku_id, t.from_location_id, l.from_bin_id, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'location_transfer'::public.movement_type, t.id, auth.uid() from jsonb_array_elements(v_sources) e
      union all select t.brewery_id, l.sku_id, t.to_location_id, l.to_bin_id, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'location_transfer'::public.movement_type, t.id, auth.uid() from jsonb_array_elements(v_sources) e;
    elsif l.material_id is not null then
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, note, created_by)
      select t.brewery_id, l.material_id, t.from_location_id, l.from_bin_id, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'transfer_out'::public.material_movement_type, 'transfer ' || t.id, auth.uid() from jsonb_array_elements(v_sources) e
      union all select t.brewery_id, l.material_id, t.to_location_id, l.to_bin_id, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'transfer_in'::public.material_movement_type, 'transfer ' || t.id, auth.uid() from jsonb_array_elements(v_sources) e;
    else
      insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, note, created_by)
      values (t.brewery_id, l.keg_pool_id, l.keg_size, t.from_location_id, l.from_bin_id, v_qty::int, 'transferred_out', 'transfer ' || t.id, auth.uid()),
             (t.brewery_id, l.keg_pool_id, l.keg_size, t.to_location_id,   l.to_bin_id,   v_qty::int, 'transferred_in',  'transfer ' || t.id, auth.uid());
    end if;
  end loop;
  update public.stock_transfers set status = 'received', received_at = now() where id = p_transfer;
  return jsonb_build_object('transfer_id', p_transfer);
end $$;

create or replace function public.move_stock_bin(
  p_brewery uuid, p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size public.keg_size,
  p_qty numeric, p_from_bin uuid, p_to_bin uuid, p_note text, p_request_id uuid, p_material_lot uuid default null, p_sku_lot uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_from public.bins; v_to public.bins;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'move_stock_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'material', p_material, 'keg_pool', p_keg_pool, 'keg_size', p_keg_size,
                       'qty', p_qty, 'from_bin', p_from_bin, 'to_bin', p_to_bin, 'note', p_note, 'material_lot', p_material_lot, 'sku_lot', p_sku_lot));
  if v_replay is not null then return v_replay; end if;
  if p_qty is null or p_qty <= 0 or p_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'qty must be positive'; end if;
  if num_nonnulls(p_sku, p_material, p_keg_pool) <> 1 then raise exception 'exactly one of sku, material, keg pool'; end if;
  if p_material_lot is not null and p_material is null then raise exception 'material lot requires material'; end if;
  if p_sku_lot is not null and (p_sku is null or not exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and lot_id = p_sku_lot)) then raise exception 'lot does not belong to SKU'; end if;
  if p_keg_pool is not null and p_qty <> trunc(p_qty) then raise exception 'empty kegs must be whole units'; end if;
  if (p_keg_pool is null) <> (p_keg_size is null) then raise exception 'keg size is required only for empty kegs'; end if;
  if p_from_bin = p_to_bin then raise exception 'from and to bin are the same'; end if;
  select * into v_from from public.bins where id = p_from_bin and brewery_id = p_brewery;
  select * into v_to   from public.bins where id = p_to_bin   and brewery_id = p_brewery;
  if v_from.id is null or v_to.id is null then raise exception 'bin not found'; end if;
  if v_from.location_id <> v_to.location_id then raise exception 'bins are in different locations: use create_stock_transfer'; end if;
  if p_sku is not null then
    -- ponytail: global ledger lock; migrate all writers to shared stock-key locks for throughput.
    lock table public.inventory_movements in share row exclusive mode;
    if p_qty <> round(p_qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
    perform private.assert_bin_stock(p_brewery, p_from_bin, p_sku, null, null, null, p_sku_lot, false, p_qty);
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, note, created_by)
    values (p_brewery, p_sku, v_from.location_id, p_from_bin, -p_qty, 'location_transfer', p_sku_lot, p_note, auth.uid()),
           (p_brewery, p_sku, v_to.location_id,   p_to_bin,    p_qty, 'location_transfer', p_sku_lot, p_note, auth.uid());
  elsif p_material is not null then
    lock table public.material_movements in share row exclusive mode;
    perform private.assert_bin_stock(p_brewery, p_from_bin, null, p_material, null, null, p_material_lot, false, p_qty);
    insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, lot_id, note, created_by)
    values (p_brewery, p_material, v_from.location_id, p_from_bin, -p_qty, 'transfer_out', p_material_lot, p_note, auth.uid()),
           (p_brewery, p_material, v_to.location_id,   p_to_bin,    p_qty, 'transfer_in',  p_material_lot, p_note, auth.uid());
  else
    if p_keg_size is null then raise exception 'keg_size is required with a keg pool'; end if;
    lock table public.keg_events in share row exclusive mode;
    perform private.assert_bin_stock(p_brewery, p_from_bin, null, null, p_keg_pool, p_keg_size, null, false, p_qty);
    insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, note, created_by)
    values (p_brewery, p_keg_pool, p_keg_size, v_from.location_id, p_from_bin, p_qty::int, 'transferred_out', p_note, auth.uid()),
           (p_brewery, p_keg_pool, p_keg_size, v_to.location_id,   p_to_bin,   p_qty::int, 'transferred_in',  p_note, auth.uid());
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('from_bin_id', p_from_bin, 'to_bin_id', p_to_bin, 'qty', p_qty));
end $$;

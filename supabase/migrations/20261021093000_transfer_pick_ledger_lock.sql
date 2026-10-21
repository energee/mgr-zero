-- #1033: record_stock_transfer_pick checked the source bin without the
-- ledger lock that private.assert_bin_stock requires of its callers. A bin
-- move, receipt, or shipment still open when the pick read the ledger was
-- invisible to it, so the pick passed on stock that was leaving, and the
-- transfer then stuck at receipt. The pick now takes the same three ledger
-- locks as receive_stock_transfer_impl, in the same order: the transfer row
-- (private.lock_transfer), then inventory_movements, material_movements,
-- keg_events. A writer that is mid-removal makes the pick wait, and the check
-- then reads the committed result.
--
-- A pick still reserves nothing: two picks of the same stock both pass, and
-- receipt (which re-checks under the same locks) refuses the second. That
-- transfer is still picked: record the pick again with what the bin holds,
-- or cancel it (#578, final) and create a new transfer.
--
-- Body otherwise copied from 20260924110000_transfer_pick_stock.sql (no later
-- migration redefines it).
create or replace function public.record_stock_transfer_pick(p_transfer uuid, p_picks jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; t public.stock_transfers; pk record; l public.stock_transfer_lines; g record;
begin
  select brewery_id into v_brewery from public.stock_transfers where id = p_transfer;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'record_stock_transfer_pick', p_request_id, jsonb_build_object('transfer', p_transfer, 'picks', p_picks));
  if v_replay is not null then return v_replay; end if;
  t := private.lock_transfer(p_transfer, array['submitted','picked']::public.stock_transfer_status[]);
  -- The ledger locks assert_bin_stock requires, in receive_stock_transfer_impl's order.
  lock table public.inventory_movements in share row exclusive mode;
  lock table public.material_movements in share row exclusive mode;
  lock table public.keg_events in share row exclusive mode;
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_picks) e loop
    select * into l from public.stock_transfer_lines where id = pk.line_id and transfer_id = p_transfer;
    if l.id is null then raise exception 'transfer line % not found', pk.line_id; end if;
    if pk.qty <> trunc(pk.qty) and l.keg_pool_id is not null then raise exception 'empty kegs must be whole units'; end if;
    update public.stock_transfer_lines set qty_picked = pk.qty where id = pk.line_id and transfer_id = p_transfer;
  end loop;
  -- Every picked line of the transfer, this call's and earlier ones', per source bin and stock.
  for g in select from_bin_id, sku_id, material_id, keg_pool_id, keg_size, sum(qty_picked) as qty
      from public.stock_transfer_lines where transfer_id = p_transfer and qty_picked > 0
      group by from_bin_id, sku_id, material_id, keg_pool_id, keg_size loop
    perform private.assert_bin_stock(t.brewery_id, g.from_bin_id, g.sku_id, g.material_id, g.keg_pool_id, g.keg_size, null, true, g.qty);
  end loop;
  update public.stock_transfers set status = 'picked' where id = p_transfer;
  return private.complete_command_request(p_request_id, jsonb_build_object('transfer_id', p_transfer));
end $$;

-- #487: a transfer pick must not claim stock the source bin does not hold.
-- record_stock_transfer_pick accepted 999 from an empty bin, marked the
-- transfer picked, and receipt could then never balance its sources.
-- The pick now asks private.assert_bin_stock (#451), the same check receipt
-- makes, so a pick that passes is receivable:
--   * any lot counts (p_any_lot): the pick names no lot, and receipt draws the
--     picked quantity from whichever lots (or untracked stock) are chosen then;
--   * picked lines drawing the same stock from the same bin are summed first,
--     since receipt takes them out of that bin one after another.
-- Body otherwise copied from 00001_baseline.sql.
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

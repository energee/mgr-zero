-- #1625: new lots share the receipt's saved date, even if timezone metadata changes while receiving.
-- Keep the existing precision, cost provenance, replay and authorization behavior.
create or replace function public.receive_purchase_order(
  p_brewery uuid, p_po uuid, p_location uuid, p_bin uuid, p_received_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_po public.purchase_orders; v_receipt_id uuid; v_received_on date; l jsonb;
  v_line public.purchase_order_lines; v_mat public.materials; v_counted numeric; v_expected numeric;
  v_lot uuid; v_movement uuid; v_cost numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'receive_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'location', p_location, 'bin', p_bin, 'received_on', p_received_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_po := private.lock_purchase_order(p_brewery, p_po, array['sent','partially_received']::public.po_status[]);
  if jsonb_array_length(p_lines) = 0 then raise exception 'a receipt needs at least one counted line'; end if;
  insert into public.receipts (brewery_id, po_id, received_on, received_by, location_id, bin_id)
  values (p_brewery, p_po, coalesce(p_received_on, private.brewery_today(p_brewery)), v_actor, p_location, p_bin)
    returning id, received_on into v_receipt_id, v_received_on;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.purchase_order_lines where id = (l->>'po_line_id')::uuid and po_id = p_po;
    if v_line.id is null then raise exception 'line % is not on this purchase order', l->>'po_line_id'; end if;
    v_cost := (l->>'unit_cost_cents')::numeric;
    if v_cost is not null and (v_cost::text in ('NaN','Infinity','-Infinity') or v_cost<0 or v_cost>2147483647 or v_cost<>trunc(v_cost)) then
      raise exception 'unit cost must be integer cents from 0 to 2147483647';
    end if;
    v_cost := coalesce(v_cost,v_line.unit_cost_cents);
    select * into v_mat from public.materials where id = v_line.material_id;
    v_counted := (l->>'qty_counted')::numeric;
    if v_counted is null or v_counted::text in ('NaN','Infinity','-Infinity') or v_counted<0 or v_counted<>round(v_counted,4) then
      raise exception 'counted quantities must be finite, nonnegative, and have at most four decimals';
    end if;
    if v_counted*v_mat.purchase_uom_factor<>round(v_counted*v_mat.purchase_uom_factor,4) then
      raise exception 'counted quantity is too precise for the base unit';
    end if;
    select qty_open into v_expected from public.po_open_balances where po_line_id = v_line.id;
    v_lot := null; v_movement := null;
    if v_mat.lot_tracked and v_counted > 0 then  -- #453: a zero count needs no lot
      if nullif(trim(l->>'lot_code'), '') is null then raise exception '% is lot-tracked: a lot code is required', v_mat.name; end if;
      insert into public.material_lots (brewery_id, material_id, lot_code, vendor_id, received_on, best_by)
      values (p_brewery, v_mat.id, trim(l->>'lot_code'), v_po.vendor_id, v_received_on, (l->>'best_by')::date)
      -- ponytail: exact (trimmed) lot-code match; case/punctuation normalization needs a generated column carrying the unique
      on conflict (material_id, lot_code) do update set best_by = coalesce(excluded.best_by, public.material_lots.best_by)
      returning id into v_lot;
    end if;
    if v_counted > 0 then
      -- Cost per base unit, unrounded (#495): the purchase-unit price over the factor.
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, unit_cost_cents, created_by)
      values (p_brewery, v_mat.id, p_location, p_bin, v_lot, v_counted * v_mat.purchase_uom_factor, 'receipt',
              v_cost / v_mat.purchase_uom_factor, v_actor)
      returning id into v_movement;
    end if;
    insert into public.receipt_lines (brewery_id, receipt_id, po_line_id, qty_expected, qty_counted, lot_id, movement_id,
      material_id, material_name, base_uom, purchase_uom, purchase_uom_factor, purchase_unit_cost_cents,
      lot_code, lot_received_on, lot_best_by, cost_recorded_at, cost_order_id)
    select p_brewery, v_receipt_id, v_line.id, v_expected, v_counted, v_lot, v_movement,
      v_mat.id, v_mat.name, v_mat.base_uom, v_mat.purchase_uom, v_mat.purchase_uom_factor, v_cost,
      ml.lot_code, ml.received_on, ml.best_by, now(), v_receipt_id
    from (select 1) singleton left join public.material_lots ml on ml.id=v_lot;
  end loop;
  select * into v_po from public.purchase_orders where id = p_po;
  return private.complete_command_request(p_request_id, jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po, 'status', v_po.status));
end $$;

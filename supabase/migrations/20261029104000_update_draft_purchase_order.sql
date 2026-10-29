-- #1584: a draft purchase order's vendor, expected date and lines can be
-- edited until it is marked sent. create_purchase_order's line loop moves into
-- private.insert_purchase_order_lines so both writers check contracts the same
-- way; create_purchase_order's behaviour is unchanged.

-- Inserts every line of p_lines on purchase order p_po. A line with a contract
-- takes the contract's price when none is typed; a contract never gates
-- ordering (spec 2026-09-07 §4).
create function private.insert_purchase_order_lines(p_brewery uuid, p_po uuid, p_vendor uuid, p_lines jsonb)
returns void language plpgsql set search_path = '' as $$
declare l jsonb; v_contract_price int;
begin
  if jsonb_array_length(p_lines) = 0 then raise exception 'a purchase order needs at least one line'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    -- The composite FK only proves the brewery; a contract drawn down here must be this vendor's, for this material.
    v_contract_price := null;
    if l->>'contract_id' is not null then
      select unit_cost_cents into v_contract_price from public.material_contracts
        where id = (l->>'contract_id')::uuid and brewery_id = p_brewery and vendor_id = p_vendor and material_id = (l->>'material_id')::uuid;
      if not found then raise exception 'contract % is not this vendor''s contract for that material', l->>'contract_id'; end if;
    end if;
    insert into public.purchase_order_lines (brewery_id, po_id, material_id, qty_ordered, unit_cost_cents, contract_id, expected_lot_code)
    values (p_brewery, p_po, (l->>'material_id')::uuid, (l->>'qty_ordered')::numeric,
      coalesce((l->>'unit_cost_cents')::int, v_contract_price), (l->>'contract_id')::uuid, l->>'expected_lot_code');
  end loop;
end $$;
revoke all on function private.insert_purchase_order_lines(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- One RPC writes the draft PO and every line.
create or replace function public.create_purchase_order(
  p_brewery uuid, p_vendor uuid, p_expected_on date, p_note text, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_po public.purchase_orders;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vendor', p_vendor, 'expected_on', p_expected_on, 'note', p_note, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  if jsonb_array_length(p_lines) = 0 then raise exception 'a purchase order needs at least one line'; end if;
  insert into public.purchase_orders (brewery_id, vendor_id, expected_on, note, created_by)
  values (p_brewery, p_vendor, p_expected_on, p_note, v_actor) returning * into v_po;
  perform private.insert_purchase_order_lines(p_brewery, v_po.id, p_vendor, p_lines);
  return private.complete_command_request(p_request_id, to_jsonb(v_po));
end $$;

-- A draft has no receipts, so its lines are replaced whole: nothing refers to
-- them yet. The note is kept; marking sent stays its own step.
create function public.update_purchase_order(
  p_brewery uuid, p_po uuid, p_vendor uuid, p_expected_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_po public.purchase_orders;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'vendor', p_vendor, 'expected_on', p_expected_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_purchase_order(p_brewery, p_po, array['draft']::public.po_status[]);
  update public.purchase_orders set vendor_id = p_vendor, expected_on = p_expected_on
    where id = p_po and brewery_id = p_brewery returning * into v_po;
  delete from public.purchase_order_lines where po_id = p_po and brewery_id = p_brewery;
  perform private.insert_purchase_order_lines(p_brewery, p_po, p_vendor, p_lines);
  return private.complete_command_request(p_request_id, to_jsonb(v_po));
end $$;
revoke all on function public.update_purchase_order(uuid,uuid,uuid,date,jsonb,uuid) from public,anon;
grant execute on function public.update_purchase_order(uuid,uuid,uuid,date,jsonb,uuid) to authenticated;

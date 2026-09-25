-- #454: a taproom transfer from a location to itself was accepted (a location can
-- be both warehouse and taproom). Reject it in the one function every order path
-- (create_order, create_replenishment_order) goes through. Body otherwise
-- unchanged from 00001_baseline.sql.
create or replace function private.create_order_impl(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_order uuid; v_channel uuid; l record;
begin
  perform private.assert_order_lines(p_lines);
  if p_kind = 'taproom_transfer' and p_from_location = p_to_location then
    raise exception 'A transfer needs a different source and destination location.';
  end if;
  if p_kind = 'wholesale' then
    select sale_channel_id into v_channel from public.customers where id = p_customer and brewery_id = p_brewery;
    if v_channel is null then raise exception 'customer not found'; end if;
  else
    -- a transfer has no customer: the seeded taproom system_code, else the first by name
    select id into v_channel from public.sale_channels where brewery_id = p_brewery
      order by (system_code = 'taproom') desc, name limit 1;
  end if;
  insert into public.orders (brewery_id, kind, customer_id, ship_to_id, from_location_id, to_location_id,
                             sale_channel_id, requested_ship_date, po_number, note, created_by)
  values (p_brewery, p_kind, p_customer, p_ship_to, p_from_location, p_to_location,
          v_channel, p_requested, p_po, p_note, auth.uid())
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (p_brewery, v_order, l.sku_id, l.qty,
            case when p_kind = 'wholesale' then private.order_line_price(p_brewery, v_channel, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;

-- #471: a pick cannot exceed the ordered quantity. ship_order_impl already caps
-- shipped at least(qty_ordered, qty_picked), so an over-pick left the Ship form
-- defaulting to a quantity the server refuses, and put-back asked to return
-- stock that never existed. Copied from 00001_baseline.sql (the only prior
-- definition); the only change is the per-line cap before the update.
create or replace function private.record_pick_impl(p_order uuid, p_picks jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; pk record; v_ordered numeric;
begin
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty_picked')::numeric as qty from jsonb_array_elements(p_picks) e loop
    select qty_ordered into v_ordered from public.order_lines where id = pk.line_id and order_id = p_order;
    if found and pk.qty > v_ordered then
      raise exception 'picked quantity cannot exceed ordered (% ordered, % picked)', v_ordered, pk.qty;
    end if;
    update public.order_lines set qty_picked = pk.qty where id = pk.line_id and order_id = p_order;
  end loop;
  update public.orders set status = 'picked', needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'picked', jsonb_build_object('picks', p_picks));
  return jsonb_build_object('order_id', p_order);
end $$;

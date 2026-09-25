-- #514: "the order becomes picked when every line is counted" has one owner.
-- record_pick_impl set status = 'picked' unconditionally (#471) while
-- resolve_short_pick_impl checked for an uncounted line (#419); both now call
-- private.mark_picked_if_complete. Bodies otherwise copied from
-- 20260923210000_record_pick_cap.sql and 20260923200000_short_pick_order_status.sql.

-- A confirmed order becomes picked once no line is still uncounted
-- (qty_picked null). The caller holds the order lock (private.lock_order).
create function private.mark_picked_if_complete(p_order uuid) returns void
language sql set search_path = '' as $$
  update public.orders set status = 'picked' where id = p_order
    and not exists (select 1 from public.order_lines where order_id = p_order and qty_picked is null);
$$;
revoke all on function private.mark_picked_if_complete(uuid) from public, anon, authenticated, service_role;

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
  -- A re-pick is the restock the badge asked for; picked-ness is the helper's.
  update public.orders set needs_restock = false where id = p_order;
  perform private.mark_picked_if_complete(p_order);
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'picked', jsonb_build_object('picks', p_picks));
  return jsonb_build_object('order_id', p_order);
end $$;

-- Short pick: one line counted below ordered. adjust_down makes the count the
-- order (allocation shrinks, ATP recovers); keep_owed records the count and
-- leaves the remainder owed, so the order stays on pick_due.
create or replace function private.resolve_short_pick_impl(p_order uuid, p_line uuid, p_qty numeric, p_reason text, p_resolution text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l public.order_lines;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason is required'; end if;
  if p_qty < 0 then raise exception 'qty_picked cannot be negative'; end if;
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  select * into l from public.order_lines where id = p_line and order_id = p_order for update;
  if not found then raise exception 'order line not found'; end if;
  if p_qty >= l.qty_ordered then raise exception 'line is not short'; end if;
  if p_resolution = 'adjust_down' then
    if p_qty = 0 then raise exception 'adjust the order lines to drop a line entirely'; end if;
    update public.order_lines set qty_ordered = p_qty, qty_picked = p_qty, short_reason = p_reason where id = p_line;
    update public.allocations set qty = p_qty where source = 'order_line' and ref = p_line and status = 'open';
  elsif p_resolution = 'keep_owed' then
    update public.order_lines set qty_picked = p_qty, short_reason = p_reason where id = p_line;
  else
    raise exception 'unknown resolution';
  end if;
  perform private.mark_picked_if_complete(p_order);
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'short_pick',
          jsonb_build_object('line_id', p_line, 'qty_picked', p_qty, 'reason', p_reason, 'resolution', p_resolution));
  return jsonb_build_object('order_id', p_order);
end $$;

-- #419: resolving a short pick on one line no longer marks the whole order
-- picked. The order moves from confirmed to picked only once every line has a
-- counted quantity (qty_picked not null); otherwise it stays confirmed so the
-- remaining lines are still picked through record_pick. Body otherwise copied
-- from 00001_baseline.sql.
--
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
  -- Picked only when no line is still uncounted (#419).
  update public.orders set status = 'picked' where id = p_order
    and not exists (select 1 from public.order_lines where order_id = p_order and qty_picked is null);
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'short_pick',
          jsonb_build_object('line_id', p_line, 'qty_picked', p_qty, 'reason', p_reason, 'resolution', p_resolution));
  return jsonb_build_object('order_id', p_order);
end $$;

-- #1635: a short pick can adjust the order down, but cannot promise a backorder.
-- Keep the existing RPC boundary and request ledger; reject the removed resolution
-- before any line, allocation, status, or event mutation.
create or replace function private.resolve_short_pick_impl(p_order uuid, p_line uuid, p_qty numeric, p_reason text, p_resolution text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l public.order_lines;
begin
  if p_resolution is distinct from 'adjust_down' then
    raise exception 'short picks require adjust_down; missing quantities are cancelled, not backordered';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason is required'; end if;
  if p_qty < 0 then raise exception 'qty_picked cannot be negative'; end if;
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  if o.needs_restock then raise exception 'put back staged beer before recording another pick'; end if;
  select * into l from public.order_lines where id = p_line and order_id = p_order for update;
  if not found then raise exception 'order line not found'; end if;
  if p_qty >= l.qty_ordered then raise exception 'line is not short'; end if;
  if p_qty = 0 then raise exception 'adjust the order lines to drop a line entirely'; end if;
  update public.order_lines set qty_ordered = p_qty, qty_picked = p_qty, short_reason = p_reason where id = p_line;
  update public.allocations set qty = p_qty where source = 'order_line' and ref = p_line and status = 'open';
  perform private.mark_picked_if_complete(p_order);
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'short_pick',
          jsonb_build_object('line_id', p_line, 'qty_picked', p_qty, 'reason', p_reason, 'resolution', p_resolution));
  return jsonb_build_object('order_id', p_order);
end $$;

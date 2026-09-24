-- 20260923160000_confirm_restock_lowers_picked.sql — Put back records what
-- went back (#416, #417).
--
-- confirm_restock used to clear needs_restock and leave qty_picked alone, so
-- ship_order (qty_shipped < qty_picked) flagged the same staged beer again
-- after an adjust-down was put back. Put back now lowers each line's
-- qty_picked to what the order still takes and writes the put-back amounts on
-- the restocked event. "Kept" matches stagedQty in lib/mgr/put-back-view.ts.
-- Replaces the baseline definition (00001_baseline.sql); the ledger never moves.
create or replace function private.confirm_restock_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; v_lines jsonb;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.needs_restock is not true then raise exception 'order is not waiting for restock'; end if;
  with kept as (
    select ol.id, ol.qty_picked,
           case when o.status = 'cancelled' then 0 else coalesce(ol.qty_shipped, ol.qty_ordered) end as keep
      from public.order_lines ol
     where ol.order_id = p_order and ol.qty_picked is not null
  ), put_back as (
    update public.order_lines ol set qty_picked = k.keep
      from kept k
     where ol.id = k.id and k.qty_picked > k.keep
    returning ol.id, k.qty_picked - k.keep as qty
  )
  select coalesce(jsonb_agg(jsonb_build_object('line_id', id, 'qty', qty) order by id), '[]'::jsonb)
    into v_lines from put_back;
  update public.orders set needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'restocked', jsonb_build_object('lines', v_lines));
  return jsonb_build_object('order_id', p_order);
end $$;

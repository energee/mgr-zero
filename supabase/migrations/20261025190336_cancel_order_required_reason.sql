-- Reject blank new cancellation reasons after public.cancel_order has recovered
-- any committed raw-payload request. Existing request hashes stay unchanged.
-- Copied from: 00001_baseline.sql, private.cancel_order_impl.
create or replace function private.cancel_order_impl(p_order uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  o public.orders;
  -- Match String.trim(), including tabs, line breaks, and Unicode whitespace.
  v_reason text := btrim(p_reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
  if v_reason is null or v_reason = '' then
    raise exception 'a cancellation reason is required' using errcode = '22023';
  end if;
  o := private.lock_order(p_order, array['draft','submitted','confirmed','picked']::public.order_status[]);
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order);
  update public.orders set status = 'cancelled', needs_restock = (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'cancelled', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('order_id', p_order);
end $$;
revoke all on function private.cancel_order_impl(uuid, text) from public, anon, authenticated, service_role;

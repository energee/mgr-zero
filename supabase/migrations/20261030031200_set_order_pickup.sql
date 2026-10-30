-- #1636: staff can correct collection vs delivery until the order ships.
-- Keep this separate from line adjustment: changing fulfillment does not reprice
-- lines, release allocations, or require another pick.
create function public.set_order_pickup(p_order uuid, p_pickup boolean, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb; o public.orders;
begin
  v_brewery := private.assert_order_staff(p_order, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'set_order_pickup', p_request_id,
    jsonb_build_object('order', p_order, 'pickup', p_pickup));
  if v_replay is not null then return v_replay; end if;
  if p_pickup is null then raise exception 'pickup is required' using errcode = '22023'; end if;
  o := private.lock_order(p_order, array['draft','submitted','confirmed','picked']::public.order_status[]);
  if o.kind <> 'wholesale' then
    raise exception 'only wholesale orders can be pickups' using errcode = '22023';
  end if;
  if o.pickup is distinct from p_pickup then
    update public.orders set pickup = p_pickup where id = p_order;
    insert into public.order_events (brewery_id, order_id, actor, event, payload)
    values (v_brewery, p_order, auth.uid(), 'pickup_changed', jsonb_build_object('before', o.pickup, 'pickup', p_pickup));
  end if;
  v_result := jsonb_build_object('order_id', p_order, 'pickup', p_pickup);
  return private.complete_command_request(p_request_id, v_result);
end $$;
revoke all on function public.set_order_pickup(uuid, boolean, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_order_pickup(uuid, boolean, uuid) to authenticated;

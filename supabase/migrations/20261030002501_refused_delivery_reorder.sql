-- #1662: rebuild the refused quantities as an editable draft, preserving the buyer's context.
create function public.reorder_refused_delivery(p_order uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; replay jsonb; result jsonb; lines jsonb;
begin
  select * into o from public.orders where id=p_order;
  perform private.assert_staff(o.brewery_id,array['admin','sales']::public.staff_role[]);
  replay := private.claim_command_request(o.brewery_id,'reorder_refused_delivery',p_request_id,jsonb_build_object('order',p_order));
  if replay is not null then return replay; end if;
  select * into o from public.orders where id=p_order for update;
  if o.kind<>'wholesale' or o.status<>'shipped' then raise exception 'a shipped wholesale order is required'; end if;
  select jsonb_agg(jsonb_build_object('sku_id',sku_id,'qty',qty_refused) order by id) into lines
    from public.order_lines where order_id=p_order and qty_refused>0;
  if lines is null then raise exception 'this order has no refused delivery quantities'; end if;
  result := private.create_order_impl(o.brewery_id,o.kind,o.customer_id,o.ship_to_id,o.from_location_id,
    o.to_location_id,null,o.po_number,o.note,lines,o.pickup);
  insert into public.order_events(brewery_id,order_id,actor,event,payload)
    values(o.brewery_id,(result->>'order_id')::uuid,auth.uid(),'reordered',jsonb_build_object('source_order_id',o.id));
  return private.complete_command_request(p_request_id,result);
end $$;
revoke all on function public.reorder_refused_delivery(uuid,uuid) from public,anon,service_role;
grant execute on function public.reorder_refused_delivery(uuid,uuid) to authenticated;

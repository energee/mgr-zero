-- An unattempted open stop leaves its route without refusal or stock/money changes.
create function public.leave_delivery_for_later(p_route uuid, p_delivery uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; d public.deliveries; r public.routes; v_order uuid;
begin
  v_brewery := private.assert_route_runner(p_route);
  v_replay := private.claim_command_request(v_brewery, 'leave_delivery_for_later', p_request_id,
    jsonb_build_object('route', p_route, 'delivery', p_delivery));
  if v_replay is not null then return v_replay; end if;
  select * into d from public.deliveries
    where id = p_delivery and route_id = p_route and brewery_id = v_brewery for update;
  if not found then raise exception 'delivery not found'; end if;
  select * into r from public.routes where id = p_route and brewery_id = v_brewery for update;
  -- Recheck membership after the locks; replay above still works after deletion/return.
  perform private.assert_route_runner(p_route);
  if r.departed_at is null then raise exception 'route has not departed'; end if;
  if r.returned_at is not null then raise exception 'route has already returned'; end if;
  if d.delivered_at is not null or d.outcome is not null then raise exception 'already delivered or refused'; end if;
  if d.shipment_id is not null then
    select order_id into v_order from public.shipments where id = d.shipment_id and brewery_id = v_brewery;
    insert into public.order_events(brewery_id, order_id, actor, event, payload)
      values (v_brewery, v_order, auth.uid(), 'delivery_not_attempted',
        jsonb_build_object('delivery_id', d.id, 'route_id', d.route_id));
  end if;
  delete from public.deliveries where id = d.id and brewery_id = v_brewery;
  return private.complete_command_request(p_request_id,
    jsonb_build_object('delivery_id', d.id, 'route_id', d.route_id,
      'shipment_id', d.shipment_id, 'stock_transfer_id', d.stock_transfer_id));
end $$;
revoke all on function public.leave_delivery_for_later(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.leave_delivery_for_later(uuid, uuid, uuid) to authenticated;

-- Historical closed rows remain valid. Exact completed requests replay before the fresh-reason guard.
create or replace function public.confirm_delivery(p_delivery uuid,p_signed_by text,p_request_id uuid,
  p_refused jsonb default '[]',p_reason text default null,p_note text default null,p_transfer_refused boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; d public.deliveries; sh public.shipments; o public.orders;
  v_invoice uuid; v_qty numeric; v_shipped numeric; v_outcome text; e jsonb; ol public.order_lines;
begin
  v_brewery := private.assert_route_runner((select route_id from public.deliveries where id=p_delivery));
  v_replay := private.claim_command_request(v_brewery,'confirm_delivery',p_request_id,
    -- Default successful deliveries retain the pre-outcome replay identity.
    case when p_refused='[]'::jsonb and p_reason is null and nullif(p_note,'') is null and p_transfer_refused=false
      then jsonb_build_object('delivery',p_delivery,'signed_by',p_signed_by)
      else jsonb_build_object('delivery',p_delivery,'signed_by',p_signed_by,'refused',p_refused,'reason',p_reason,'note',p_note,'transfer_refused',p_transfer_refused) end);
  if v_replay is not null then return v_replay; end if;
  select * into d from public.deliveries where id=p_delivery for update;
  if d.delivered_at is not null then raise exception 'already delivered or refused'; end if;
  if not exists(select 1 from public.routes where id=d.route_id and departed_at is not null) then raise exception 'route has not departed'; end if;
  if p_refused is null or jsonb_typeof(p_refused)<>'array' then raise exception 'refused lines must be an array'; end if;
  if d.stock_transfer_id is not null then
    if jsonb_array_length(p_refused)>0 then raise exception 'transfer refusals must close the whole stop'; end if;
    v_outcome := case when p_transfer_refused then 'refused' else 'delivered' end;
  else
    if p_transfer_refused then raise exception 'not a transfer stop'; end if;
    select * into sh from public.shipments where id=d.shipment_id;
    select * into o from public.orders where id=sh.order_id for update;
    if (select count(distinct item->>'order_line_id') from jsonb_array_elements(p_refused) item)<>jsonb_array_length(p_refused) then raise exception 'duplicate refused line'; end if;
    for e in select * from jsonb_array_elements(p_refused) loop
      select * into ol from public.order_lines where id=(e->>'order_line_id')::uuid and order_id=o.id;
      if not found then raise exception 'order line not found'; end if;
      v_qty := (e->>'qty')::numeric;
      if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) or v_qty>coalesce(ol.qty_shipped,0) then raise exception 'invalid refused quantity'; end if;
      update public.order_lines set qty_refused=v_qty where id=ol.id;
    end loop;
    select coalesce(sum(qty_refused),0),coalesce(sum(qty_shipped),0) into v_qty,v_shipped from public.order_lines where order_id=o.id;
    v_outcome := case when v_qty=0 then 'delivered' when v_qty=v_shipped then 'refused' else 'partial' end;
  end if;
  -- Completed requests returned above; a fresh refusal rolls back its claim and preceding line writes.
  if p_reason='closed' then raise exception 'closed is no longer a refusal reason: leave the unattempted delivery for later'; end if;
  if v_outcome<>'delivered' and (p_reason is null or p_reason not in ('customer_refused','damaged','wrong_item','other')) then raise exception 'choose a refusal reason'; end if;
  if v_outcome<>'delivered' and p_reason='other' and nullif(trim(p_note),'') is null then raise exception 'other refusal needs a note'; end if;
  if v_outcome<>'refused' and nullif(trim(p_signed_by),'') is null then raise exception 'received by is required for accepted goods'; end if;
  update public.deliveries set delivered_at=now(),signed_by=nullif(trim(p_signed_by),''),outcome=v_outcome,
    refusal_reason=case when v_outcome<>'delivered' then p_reason end,
    refusal_note=case when v_outcome<>'delivered' then nullif(trim(p_note),'') end where id=d.id;
  if d.shipment_id is not null then
    select id into v_invoice from public.invoices where shipment_id=sh.id and kind='invoice';
    if v_invoice is null and sh.invoice_timing='on_delivery' and o.kind='wholesale' and v_outcome<>'refused' then
      insert into public.invoices(brewery_id,kind,customer_id,shipment_id,issued_on)
        values(o.brewery_id,'invoice',o.customer_id,sh.id,current_date) returning id into v_invoice;
      insert into public.invoice_lines(brewery_id,invoice_id,kind,sku_id,qty,unit_price_cents,description)
        select o.brewery_id,v_invoice,'sku',l.sku_id,l.qty_shipped-l.qty_refused,l.unit_price_cents,s.name
        from public.order_lines l join public.skus s on s.id=l.sku_id where l.order_id=o.id and l.qty_shipped>l.qty_refused;
      insert into public.invoice_lines(brewery_id,invoice_id,kind,order_line_id,keg_pool_id,keg_size,qty,unit_price_cents,description)
        select o.brewery_id,v_invoice,'keg_deposit',dl.order_line_id,dl.keg_pool_id,dl.keg_size,l.qty_shipped-l.qty_refused,dl.unit_price_cents,dl.description
        from public.order_deposit_lines dl join public.order_lines l on l.id=dl.order_line_id where dl.order_id=o.id and l.qty_shipped>l.qty_refused;
    end if;
    insert into public.order_events(brewery_id,order_id,actor,event,payload)
      values(o.brewery_id,o.id,auth.uid(),'delivered',jsonb_build_object('delivery_id',d.id,'outcome',v_outcome,'refused',p_refused,'reason',p_reason,'note',p_note,'invoice_id',v_invoice));
  end if;
  return private.complete_command_request(p_request_id,jsonb_build_object('delivery_id',d.id,'invoice_id',v_invoice,'outcome',v_outcome));
end $$;

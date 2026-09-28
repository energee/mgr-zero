-- Refusal closes the stop. Only a physical check-in restores shipped stock.
alter table public.deliveries add column outcome text check (outcome in ('delivered','partial','refused')),
  add column refusal_reason text check (refusal_reason in ('customer_refused','closed','damaged','wrong_item','other')),
  add column refusal_note text;
update public.deliveries set outcome = 'delivered' where delivered_at is not null;
alter table public.order_lines add column qty_refused numeric(12,2) not null default 0
  check (qty_refused >= 0 and qty_refused <= coalesce(qty_shipped,0));

drop function public.confirm_delivery(uuid,text,uuid);
drop function private.confirm_delivery_impl(uuid,text);
create function public.confirm_delivery(p_delivery uuid,p_signed_by text,p_request_id uuid,
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
  if v_outcome<>'delivered' and (p_reason is null or p_reason not in ('customer_refused','closed','damaged','wrong_item','other')) then raise exception 'choose a refusal reason'; end if;
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
revoke all on function public.confirm_delivery(uuid,text,uuid,jsonb,text,text,boolean) from public,anon,service_role;
grant execute on function public.confirm_delivery(uuid,text,uuid,jsonb,text,text,boolean) to authenticated;

create function public.check_in_refused_return(p_delivery uuid,p_location uuid,p_lines jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.deliveries; sh public.shipments; ol public.order_lines; m public.inventory_movements;
  v_replay jsonb; l jsonb; s jsonb; v_qty numeric; v_remaining numeric; v_return uuid; v_ids uuid[] := '{}';
begin
  select * into d from public.deliveries where id=p_delivery;
  perform private.assert_staff(d.brewery_id,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(d.brewery_id,'check_in_refused_return',p_request_id,jsonb_build_object('delivery',p_delivery,'location',p_location,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  select * into d from public.deliveries where id=p_delivery for update;
  select * into sh from public.shipments where id=d.shipment_id;
  if sh.id is null or sh.invoice_timing<>'on_delivery' then raise exception 'use Return and credit for an invoice-now shipment'; end if;
  if d.outcome is null or d.outcome='delivered' then raise exception 'stop has no refused beer'; end if;
  perform 1 from public.orders where id=sh.order_id for update;
  -- Accepted-unit credits lock the invoice too; both return paths must serialize
  -- before the shared source movement cap and frozen-volume rounding are read.
  perform 1 from public.invoices where shipment_id=sh.id and kind='invoice' for update;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'return lines are required'; end if;
  if not exists(select 1 from public.locations where id=p_location and brewery_id=d.brewery_id) then raise exception 'location not found'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into ol from public.order_lines where id=(l->>'order_line_id')::uuid and order_id=sh.order_id for update;
    if not found then raise exception 'order line not found'; end if;
    if jsonb_typeof(l->'sources') is distinct from 'array' or jsonb_array_length(l->'sources')=0 then raise exception 'return sources are required'; end if;
    for s in select * from jsonb_array_elements(l->'sources') loop
      select * into m from public.inventory_movements where id=(s->>'movement_id')::uuid and brewery_id=d.brewery_id and ref=sh.order_id and sku_id=ol.sku_id and type='sale_removal' for update;
      if not found then raise exception 'shipped source not found'; end if;
      v_qty := (s->>'qty')::numeric;
      if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'invalid return quantity'; end if;
      select ol.qty_refused-coalesce(sum(r.qty),0) into v_remaining from public.inventory_movements r
        join public.inventory_movements original on original.id=r.source_movement_id
        where original.ref=sh.order_id and original.sku_id=ol.sku_id and original.type='sale_removal' and r.type='return_in' and r.ref=d.id;
      if v_qty>v_remaining then raise exception 'return exceeds outstanding refused quantity'; end if;
      if not exists(select 1 from public.bins where id=(s->>'bin_id')::uuid and location_id=p_location and brewery_id=d.brewery_id) then raise exception 'return bin not found at location'; end if;
      insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,source_movement_id,qty,type,ref,note,created_by)
        values(d.brewery_id,m.sku_id,p_location,(s->>'bin_id')::uuid,m.lot_id,m.id,v_qty,'return_in',d.id,'refused delivery check-in',auth.uid()) returning id into v_return;
      v_ids := array_append(v_ids,v_return);
      if coalesce((s->>'damaged')::boolean,false) then
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,source_movement_id,qty,type,ref,note,created_by)
          values(d.brewery_id,m.sku_id,p_location,(s->>'bin_id')::uuid,m.lot_id,v_return,-v_qty,'loss',d.id,'damaged refused return',auth.uid());
      end if;
    end loop;
  end loop;
  return private.complete_command_request(p_request_id,jsonb_build_object('delivery_id',d.id,'movement_ids',v_ids));
end $$;
revoke all on function public.check_in_refused_return(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.check_in_refused_return(uuid,uuid,jsonb,uuid) to authenticated;

create view public.refused_delivery_returns with (security_invoker=true) as
select d.brewery_id,d.id delivery_id,d.route_id,sh.invoice_timing,o.id order_id,o.order_no,
  o.customer_id,c.name customer_name,l.id order_line_id,l.sku_id,s.name sku_name,l.qty_refused,
  greatest(0,l.qty_refused-coalesce((select sum(r.qty) from public.inventory_movements r
    join public.inventory_movements original on original.id=r.source_movement_id
    where original.ref=o.id and original.sku_id=l.sku_id and original.type='sale_removal' and r.type='return_in' and (sh.invoice_timing='now' or r.ref=d.id)),0)) outstanding_qty
from public.deliveries d join public.shipments sh on sh.id=d.shipment_id
join public.orders o on o.id=sh.order_id join public.customers c on c.id=o.customer_id
join public.order_lines l on l.order_id=o.id join public.skus s on s.id=l.sku_id
where l.qty_refused>0;
grant select on public.refused_delivery_returns to authenticated,service_role;

create or replace function public.return_route(p_route uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; r public.routes;
begin
  v_brewery := private.assert_route_runner(p_route);
  v_replay := private.claim_command_request(v_brewery,'return_route',p_request_id,jsonb_build_object('route',p_route));
  if v_replay is not null then return v_replay; end if;
  select * into r from public.routes where id=p_route for update;
  if r.returned_at is not null then raise exception 'route has already returned'; end if;
  if r.departed_at is null then raise exception 'route has not departed'; end if;
  if exists(select 1 from public.deliveries where route_id=p_route and outcome is null) then raise exception 'every stop needs an outcome before the route returns'; end if;
  update public.routes set returned_at=now() where id=p_route returning * into r;
  return private.complete_command_request(p_request_id,jsonb_build_object('routeId',p_route,'returned_at',r.returned_at));
end $$;

create or replace view private.today_candidates with (security_invoker = true) as
  select o.brewery_id, 'submitted_order'::text as reason, 'order'::text as subject_type, o.id::text as subject_id,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)) as source_version,
         private.doc_no('ORD', o.order_no) as safe_label,
         'submitted' || coalesce(' · ships ' || to_char(o.requested_ship_date, 'Dy FMMM/FMDD'), '') as detail,
         (o.requested_ship_date::timestamp at time zone b.timezone) as due_at,
         '/orders/' || o.id as href,
         array['admin','sales']::text[] as recipient_roles,
         null::uuid as assigned_user_id
    from orders o join breweries b on b.id = o.brewery_id
    where o.status = 'submitted'
  union all
  select o.brewery_id, 'pick_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)),
         private.doc_no('ORD', o.order_no),
         'pick due' || coalesce(' · ships ' || to_char(o.requested_ship_date, 'Dy FMMM/FMDD'), ''),
         (o.requested_ship_date::timestamp at time zone b.timezone),
         '/orders/' || o.id,
         array['admin','warehouse']::text[],
         null::uuid
    from orders o join breweries b on b.id = o.brewery_id
    where (o.status = 'confirmed' and o.requested_ship_date is not null)
       -- a picked order with a line still owed keeps its pick
       or (o.status = 'picked' and exists (
             select 1 from order_lines ol where ol.order_id = o.id and coalesce(ol.qty_picked, 0) < ol.qty_ordered))
  union all
  -- standing work, not date-due: staged beer to put back while the flag is set
  select o.brewery_id, 'restock_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.needs_restock)),
         private.doc_no('ORD', o.order_no),
         'restock staged beer',
         null::timestamptz,
         '/orders/' || o.id || '/restock',
         array['admin','warehouse']::text[],
         null::uuid
    from orders o
    where o.needs_restock = true
  union all
  -- only the lowest undelivered stop of a departed, unreturned route is "next"
  select r.brewery_id, 'delivery_next', 'delivery', d.id::text,
         md5(concat_ws('|', r.driver_user_id, r.delivery_date, d.stop_no, d.delivered_at, r.returned_at)),
         coalesce(r.name, 'Route') || ' · stop ' || d.stop_no,
         'next stop',
         (r.delivery_date::timestamp at time zone b.timezone),
         '/work/deliveries/' || d.id,
         array['admin','warehouse']::text[],
         r.driver_user_id
    from deliveries d
    join routes r on r.id = d.route_id
    join breweries b on b.id = r.brewery_id
    where d.delivered_at is null and r.departed_at is not null and r.returned_at is null
      and d.stop_no = (select min(d2.stop_no) from deliveries d2 where d2.route_id = d.route_id and d2.delivered_at is null)
  union all
  -- overdue when the latest reading (or occupancy start when none) plus the
  -- brewery cadence has passed; never synthesizes a reading
  select vo.brewery_id, 'fermentation_reading_overdue', 'occupancy', vo.id::text,
         md5(concat_ws('|', last.at, vo.started_at, b.fermentation_reading_due_hours)),
         v.name,
         'reading due',
         coalesce(last.at, vo.started_at) + make_interval(hours => b.fermentation_reading_due_hours),
         '/cellar/' || vo.id || '/reading',
         array['admin','brewer']::text[],
         null::uuid
    from vessel_occupancies vo
    join vessels v on v.id = vo.vessel_id
    join breweries b on b.id = vo.brewery_id
    left join lateral (select max(fr.at) as at from fermentation_readings fr where fr.occupancy_id = vo.id) last on true
    where vo.ended_at is null
  union all
  -- a buyer's open question about an invoice; Mark answered clears it
  -- the row is one question: two open questions on one invoice are two rows,
  -- so the subject is the question and only the href points at the invoice
  select q.brewery_id, 'invoice_question', 'invoice', q.id::text,
         md5(concat_ws('|', q.id, q.answered_at)),
         private.doc_no('INV', i.invoice_no) || ' · ' || c.name,
         'buyer asked: ' || left(q.body, 60),
         null::timestamptz,
         '/invoices/' || q.invoice_id,
         array['admin','sales']::text[],
         null::uuid
    from invoice_questions q
    join invoices i on i.id = q.invoice_id
    join customers c on c.id = q.customer_id
    where q.answered_at is null
  union all
  select r.brewery_id,'refused_return','delivery',r.delivery_id::text,
    md5(string_agg(r.order_line_id::text || ':' || r.outstanding_qty::text,',' order by r.order_line_id)),
    'Refused beer to check in',r.customer_name || ' · ' || sum(r.outstanding_qty)::text || ' units',
    null::timestamptz,'/work/deliveries/' || r.delivery_id || '/return',
    case when r.invoice_timing='now' then array['admin','sales']::text[] else array['admin','warehouse']::text[] end,null::uuid
  from public.refused_delivery_returns r where r.outstanding_qty>0
  group by r.brewery_id,r.delivery_id,r.customer_name,r.invoice_timing;

-- Refused returns are Today work; the existing chat reason set stays unchanged.
create or replace function public.get_today_items(p_brewery uuid, p_now timestamptz default now())
returns setof private.today_candidates
language sql stable security definer set search_path = '' as $$
  -- definer only to reach the private view; visibility is re-derived from the
  -- caller's own brewery_users row below, never widened.
  select c.*
    from private.today_candidates c
    join public.brewery_users bu on bu.brewery_id = c.brewery_id and bu.user_id = auth.uid()
    where c.brewery_id = p_brewery
      and private.request_scope_allows(p_brewery)
      and (c.reason = 'refused_return' or c.reason = any (public.today_live_reasons()))
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
      and (bu.role = 'admin'
           or (bu.role::text = any (c.recipient_roles) and (c.assigned_user_id is null or c.assigned_user_id = auth.uid())))
    order by c.due_at nulls last, c.safe_label
$$;

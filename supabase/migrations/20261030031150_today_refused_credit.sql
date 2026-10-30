-- #1637: Make the Sales refusal task actionable on Today and the Orders Work chip.
-- Keep credit authority with Admin/Sales and keep chat notification reasons unchanged.
create or replace view private.today_candidates with (security_invoker = true) as
  select o.brewery_id, 'submitted_order'::text as reason, 'order'::text as subject_type, o.id::text as subject_id,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)) as source_version,
         private.doc_no('ORD', o.order_no) as safe_label,
         'submitted' || coalesce(' · ships ' || to_char(o.requested_ship_date, 'Mon FMDD, YYYY'), '') as detail,
         (o.requested_ship_date::timestamp at time zone b.timezone) as due_at,
         '/orders/' || o.id || '/confirm' as href,
         array['admin','sales']::text[] as recipient_roles,
         null::uuid as assigned_user_id,
         cust.name as customer_name
    from orders o join breweries b on b.id = o.brewery_id
    left join customers cust on cust.id = o.customer_id
    where o.status = 'submitted'
  union all
  select o.brewery_id, 'pick_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)),
         private.doc_no('ORD', o.order_no),
         'pick due · ' || coalesce('ships ' || to_char(o.requested_ship_date, 'Mon FMDD, YYYY'), 'no ship date')
           || case when o.repick_since is not null then ' · changed after pick' else '' end,
         (o.requested_ship_date::timestamp at time zone b.timezone),
         '/orders/' || o.id || '/pick',
         array['admin','warehouse']::text[],
         null::uuid,
         cust.name
    from orders o join breweries b on b.id = o.brewery_id
    left join customers cust on cust.id = o.customer_id
    -- An undated confirmed order is standing pick work; readers already keep
    -- null due dates always due and sort them after dated work.
    where o.status = 'confirmed'
       -- a picked order with a line still owed keeps its pick
       or (o.status = 'picked' and exists (
             select 1 from order_lines ol where ol.order_id = o.id and coalesce(ol.qty_picked, 0) < ol.qty_ordered))
  union all
  -- every line picked and nothing to put back: ship it (a taproom transfer completes)
  select o.brewery_id, 'ship_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)),
         private.doc_no('ORD', o.order_no),
         'ship due · ' || coalesce('ships ' || to_char(o.requested_ship_date, 'Mon FMDD, YYYY'), 'no ship date'),
         (o.requested_ship_date::timestamp at time zone b.timezone),
         '/orders/' || o.id || case when o.kind = 'taproom_transfer' then '/complete' else '/ship' end,
         array['admin','warehouse']::text[],
         null::uuid,
         cust.name
    from orders o join breweries b on b.id = o.brewery_id
    left join customers cust on cust.id = o.customer_id
    where o.status = 'picked' and not o.needs_restock
      and not exists (
            select 1 from order_lines ol where ol.order_id = o.id and coalesce(ol.qty_picked, 0) < ol.qty_ordered)
  union all
  -- standing work, not date-due: staged beer to put back while the flag is set
  select o.brewery_id, 'restock_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.needs_restock)),
         private.doc_no('ORD', o.order_no),
         'restock staged beer',
         null::timestamptz,
         '/orders/' || o.id || '/restock',
         array['admin','warehouse']::text[],
         null::uuid,
         cust.name
    from orders o
    left join customers cust on cust.id = o.customer_id
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
         r.driver_user_id,
         null::text
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
         null::uuid,
         null::text
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
         null::uuid,
         null::text
    from invoice_questions q
    join invoices i on i.id = q.invoice_id
    join customers c on c.id = q.customer_id
    where q.answered_at is null
  union all
  -- Warehouse checks in uninvoiced refusals. Sales owns the stock-and-credit
  -- correction for invoiced refusals, with a direct link to that invoice form.
  select r.brewery_id,
    case when r.invoice_timing = 'now' then 'refused_credit' else 'refused_return' end,
    'delivery', r.delivery_id::text,
    md5(string_agg(r.order_line_id::text || ':' || r.outstanding_qty::text, ',' order by r.order_line_id)),
    case when r.invoice_timing = 'now' then 'Refused beer to return and credit' else 'Refused beer to check in' end,
    r.customer_name || ' · ' || sum(r.outstanding_qty)::text || ' units',
    null::timestamptz,
    case when r.invoice_timing = 'now'
      then '/invoices/' || i.id || '/return?refusedDeliveryId=' || r.delivery_id
      else '/work/deliveries/' || r.delivery_id || '/return' end,
    case when r.invoice_timing = 'now' then array['admin','sales']::text[] else array['admin','warehouse']::text[] end,
    null::uuid, null::text
  from public.refused_delivery_returns r
  join public.deliveries d on d.id = r.delivery_id
  left join public.invoices i on i.shipment_id = d.shipment_id
  where r.outstanding_qty > 0
  group by r.brewery_id, r.delivery_id, r.customer_name, r.invoice_timing, i.id;

CREATE OR REPLACE FUNCTION public.get_today_items(p_brewery uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS SETOF private.today_candidates
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- definer only to reach the private view; visibility is re-derived from the
  -- caller's own brewery_users row below, never widened.
  select c.*
    from private.today_candidates c
    join public.brewery_users bu on bu.brewery_id = c.brewery_id and bu.user_id = auth.uid()
    where c.brewery_id = p_brewery
      and private.request_scope_allows(p_brewery)
      and (c.reason in ('refused_return', 'refused_credit', 'ship_due') or c.reason = any (public.today_live_reasons()))
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
      and ('admin' = any(bu.roles)
           or (bu.roles::text[] && c.recipient_roles and (c.assigned_user_id is null or c.assigned_user_id = auth.uid())))
    order by c.due_at nulls last, c.safe_label
$function$;

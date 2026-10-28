-- #1512 item 6: Today order rows name the customer. The name rides in its own
-- column, customer_name, appended last, so safe_label stays the chat-safe
-- label (order number only). Same view as 20261027150000 plus that column:
-- the four order reasons fill it from the order's customer (none for a
-- customerless order); every other reason leaves it null.
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
  select r.brewery_id,'refused_return','delivery',r.delivery_id::text,
    md5(string_agg(r.order_line_id::text || ':' || r.outstanding_qty::text,',' order by r.order_line_id)),
    'Refused beer to check in',r.customer_name || ' · ' || sum(r.outstanding_qty)::text || ' units',
    null::timestamptz,'/work/deliveries/' || r.delivery_id || '/return',
    case when r.invoice_timing='now' then array['admin','sales']::text[] else array['admin','warehouse']::text[] end,null::uuid,null::text
  from public.refused_delivery_returns r where r.outstanding_qty>0
  group by r.brewery_id,r.delivery_id,r.customer_name,r.invoice_timing;

-- Chat payloads are built from this scan, so it never carries the customer:
-- the baseline select plus a null customer_name.
create or replace function public.scan_chat_today_candidates(p_brewery_id uuid, p_now timestamptz)
returns setof private.today_candidates
language sql stable security definer set search_path = '' as $$
  -- Chat carries invoice identity and a link; buyer notes stay in MGR Today.
  select c.brewery_id, c.reason, c.subject_type, c.subject_id, c.source_version,
    case when c.reason = 'invoice_question' then split_part(c.safe_label, ' · ', 1) else c.safe_label end,
    case when c.reason = 'invoice_question' then 'Buyer asked about this invoice' else c.detail end,
    c.due_at, c.href, c.recipient_roles, c.assigned_user_id, null::text
    from private.today_candidates c
    where c.brewery_id = p_brewery_id
      and c.reason = any (public.today_live_reasons())
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
$$;

-- Today shows an order's amount beside its customer and ship day, so the row
-- says what the order is worth without opening it. The candidates view gains a
-- trailing amount_cents column. get_today_items selects c.* and needs no
-- change; scan_chat_today_candidates names its columns, so it is restated
-- below with a null amount, since chat payloads carry no money. The view body
-- is otherwise 20261030031150_today_refused_credit.sql as written.

-- An order's amount before tax, so Today's Amount column matches the order page
-- (lib/mgr/order-view.ts orderSummary). It adds up three things:
--   1. each line's ordered qty × captured unit price;
--   2. each line's one-way keg fee, worked out the same way;
--   3. the returnable keg deposits frozen at submit.
-- Each line is rounded to the cent the way orderLineCents rounds it in TypeScript.
-- qty_ordered is numeric(12,2), so round(qty * 100) turns it into whole hundredths
-- (1.15 → 115). Times the price in cents, that is the line in hundredths of a cent.
-- Adding 50 and dividing by 100 as integers rounds it half up to a whole cent.
-- For example, 1.15 × 50¢ = 5750 hundredths → 58¢.
-- A taproom transfer is no customer charge, so it has no amount.
create or replace function private.order_amount_cents(o public.orders)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when o.kind = 'taproom_transfer' then null else (
      coalesce((select sum((round(l.qty_ordered * 100)::bigint * l.unit_price_cents + 50) / 100
                         + coalesce((round(l.qty_ordered * 100)::bigint * l.one_way_fee_cents + 50) / 100, 0))
                  from public.order_lines l where l.order_id = o.id), 0)
      + coalesce((select sum(d.amount_cents) from public.order_deposit_lines d where d.order_id = o.id), 0)
    )::integer end
$$;

create or replace view private.today_candidates with (security_invoker = true) as
  select o.brewery_id, 'submitted_order'::text as reason, 'order'::text as subject_type, o.id::text as subject_id,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)) as source_version,
         private.doc_no('ORD', o.order_no) as safe_label,
         'submitted' || coalesce(' · ships ' || to_char(o.requested_ship_date, 'Mon FMDD, YYYY'), '') as detail,
         (o.requested_ship_date::timestamp at time zone b.timezone) as due_at,
         '/orders/' || o.id || '/confirm' as href,
         array['admin','sales']::text[] as recipient_roles,
         null::uuid as assigned_user_id,
         cust.name as customer_name,
         private.order_amount_cents(o) as amount_cents
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
         cust.name,
         private.order_amount_cents(o)
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
         cust.name,
         private.order_amount_cents(o)
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
         cust.name,
         private.order_amount_cents(o)
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
         null::text,
         null::integer
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
         null::text,
         null::integer
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
         null::text,
         null::integer
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
    null::uuid, null::text, null::integer
  from public.refused_delivery_returns r
  join public.deliveries d on d.id = r.delivery_id
  left join public.invoices i on i.shipment_id = d.shipment_id
  where r.outstanding_qty > 0
  group by r.brewery_id, r.delivery_id, r.customer_name, r.invoice_timing, i.id;

-- 20261028231000_today_customer_name.sql's scan, plus the null amount.
create or replace function public.scan_chat_today_candidates(p_brewery_id uuid, p_now timestamptz)
returns setof private.today_candidates
language sql stable security definer set search_path = '' as $$
  -- Chat carries invoice identity and a link; buyer notes stay in MGR Today.
  select c.brewery_id, c.reason, c.subject_type, c.subject_id, c.source_version,
    case when c.reason = 'invoice_question' then split_part(c.safe_label, ' · ', 1) else c.safe_label end,
    case when c.reason = 'invoice_question' then 'Buyer asked about this invoice' else c.detail end,
    c.due_at, c.href, c.recipient_roles, c.assigned_user_id, null::text, null::integer
    from private.today_candidates c
    where c.brewery_id = p_brewery_id
      and c.reason = any (public.today_live_reasons())
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
$$;

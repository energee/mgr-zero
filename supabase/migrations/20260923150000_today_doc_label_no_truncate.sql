-- 20260923150000_today_doc_label_no_truncate.sql — Today / Slack safe labels
-- stop truncating document numbers past four digits (#474).
-- Postgres lpad truncates a longer string to the target length, so
-- lpad('12345', 4, '0') is '1234' and ORD-12345 was labelled ORD-1234 (another
-- order). Pad only numbers below 1000, matching lib/mgr/doc-no.ts docNo
-- (padStart never truncates). to_char(n, 'FM0000') is no fix: it prints '####'.
-- Same columns in the same order as 00001_baseline.sql, so create or replace
-- keeps the readers (setof private.today_candidates) and the service_role grant.
create or replace view private.today_candidates with (security_invoker = true) as
  select o.brewery_id, 'submitted_order'::text as reason, 'order'::text as subject_type, o.id::text as subject_id,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)) as source_version,
         'ORD-' || case when o.order_no < 1000 then lpad(o.order_no::text, 4, '0') else o.order_no::text end as safe_label,
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
         'ORD-' || case when o.order_no < 1000 then lpad(o.order_no::text, 4, '0') else o.order_no::text end,
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
         'ORD-' || case when o.order_no < 1000 then lpad(o.order_no::text, 4, '0') else o.order_no::text end,
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
         'INV-' || case when i.invoice_no < 1000 then lpad(i.invoice_no::text, 4, '0') else i.invoice_no::text end || ' · ' || c.name,
         'buyer asked: ' || left(q.body, 60),
         null::timestamptz,
         '/invoices/' || q.invoice_id,
         array['admin','sales']::text[],
         null::uuid
    from invoice_questions q
    join invoices i on i.id = q.invoice_id
    join customers c on c.id = q.customer_id
    where q.answered_at is null;

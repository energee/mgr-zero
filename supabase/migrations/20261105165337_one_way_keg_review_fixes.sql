-- Review fixes for one-way kegs, customer imports and historical orders:
-- * one-way kegs ship in whole kegs, so the per-keg fee is never fractional;
-- * a refused-delivery credit (return_shipment with a refused delivery) also
--   credits the one-way keg fee for the refused kegs, and start_qbo_push sends
--   that credit line, so an invoice-now order ends billed for the kegs kept;
-- * the CSV import refuses a state on a non-US row in words;
-- * record_historical_order refuses NaN however it is spelled.

-- Copied from: 20261104010440_brewery_ledger_locks.sql; only the one-way whole-keg check is new.
CREATE OR REPLACE FUNCTION private.ship_order_impl(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text, p_invoice_timing text DEFAULT 'now'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.orders; sp record; v_state text; v_country text; v_invoice uuid; v_shipment uuid;
  v_channel uuid; v_tax public.tax_treatment; v_sources jsonb; src record; v_line public.order_lines; v_available numeric; v_pool uuid; v_size public.keg_size;
  v_posted_at timestamptz; v_posted_on date;
  v_drain jsonb; v_warnings jsonb := '[]'::jsonb; v_shells jsonb := '[]'::jsonb;
begin
  o := private.lock_order(p_order, array['picked']::public.order_status[]);
  if o.needs_restock then raise exception 'order is waiting for restock'; end if;
  -- Only a route delivery invoices on_delivery, and a pickup is never routed.
  if o.pickup and coalesce(p_invoice_timing, 'now') = 'on_delivery' then
    raise exception 'a pickup order is invoiced when it ships';
  end if;
  -- #811: legacy rows and any writer that skipped adjust's demotion
  if exists (select 1 from public.order_lines where order_id = p_order and qty_picked is null) then
    raise exception 'every line must be picked before shipping';
  end if;
  perform private.lock_ledger(o.brewery_id, 'inventory_movements');
  perform private.lock_ledger(o.brewery_id, 'keg_events');
  if jsonb_typeof(p_ship) is distinct from 'array' then raise exception 'ship list must cover every order line exactly once'; end if;
  if jsonb_array_length(p_ship) <> (select count(*) from public.order_lines where order_id = p_order)
     or (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_ship) e) <> jsonb_array_length(p_ship)
     or exists (select 1 from jsonb_array_elements(p_ship) e where not exists
       (select 1 from public.order_lines where id = (e->>'line_id')::uuid and order_id = p_order)) then
    raise exception 'ship list must cover every order line exactly once';
  end if;
  v_posted_at := clock_timestamp();
  select (v_posted_at at time zone timezone)::date into v_posted_on from public.breweries where id = o.brewery_id;
  -- The one-way keg fee was frozen on each line at submit (ensure_order_deposit_lines).
  insert into public.shipments (brewery_id, order_id, carrier, tracking, invoice_timing, created_by, shipped_at, created_at)
  values (o.brewery_id, p_order, p_carrier, p_tracking, coalesce(p_invoice_timing, 'now'), auth.uid(), v_posted_at, v_posted_at) returning id into v_shipment;
  if o.kind = 'wholesale' then
    select state, country into v_state, v_country from public.ship_tos where id = o.ship_to_id;
    -- One lookup for the whole shipment: the channel a wholesale ship removes
    -- under, and the tax treatment frozen onto every movement it writes
    -- (customer override -> channel default, §16.3).
    -- orders.sale_channel_id is not null and FK-backed, so no null guard here.
    select o.sale_channel_id, coalesce(c.tax_treatment, sc.tax_treatment)
      into v_channel, v_tax
      from public.sale_channels sc
      left join public.customers c on c.id = o.customer_id
     where sc.id = o.sale_channel_id;
    -- A removal outside the US names the country, not a state, and is an
    -- export: a taxpaid removal is always to a US state.
    if v_country <> 'US' and v_tax is distinct from 'export' then
      raise exception 'only an export order can ship outside the US';
    end if;
    -- Empty-invoice guard: only create invoice if at least one line ships qty > 0;
    -- on_delivery defers the invoice to confirm_delivery
    if coalesce(p_invoice_timing, 'now') = 'now'
       and exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then
    insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on, created_at)
    values (o.brewery_id, 'invoice', o.customer_id, v_shipment, v_posted_on, v_posted_at)
    returning id into v_invoice;
    end if;
  end if;
  for sp in select (e->>'line_id')::uuid as line_id, (e->>'qty_shipped')::numeric as qty, e->'sources' as sources,
      nullif(trim(e->>'short_reason'), '') as short_reason from jsonb_array_elements(p_ship) e loop
    select * into v_line from public.order_lines where id = sp.line_id and order_id = p_order;
    if sp.qty is null or sp.qty::text in ('NaN','Infinity','-Infinity') or sp.qty < 0 or sp.qty <> round(sp.qty, 2)
       or sp.qty > least(v_line.qty_ordered, coalesce(v_line.qty_picked, 0)) then raise exception 'invalid shipped quantity'; end if;
    -- #624: a wholesale line shipped below picked says why, on the line the
    -- buyer reads. The ship form prefills any short-pick reason, so an
    -- unchanged one is resent rather than retyped; a full ship leaves it alone.
    if o.kind = 'wholesale' and sp.qty < coalesce(v_line.qty_picked, 0) then
      if sp.short_reason is null then raise exception 'shortage reason is required when shipping less than picked'; end if;
      update public.order_lines set short_reason = sp.short_reason where id = sp.line_id and order_id = p_order;
    end if;
    -- Old callers can only consume actual untracked first-bin stock.
    v_sources := coalesce(sp.sources, case when sp.qty = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'bin_id', private.first_bin(o.from_location_id), 'lot_id', null, 'qty', sp.qty,
      'to_bin_id', case when o.kind = 'taproom_transfer' then private.first_bin(o.to_location_id) end)) end);
    if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'sources must be an array'; end if;
    if (sp.qty = 0 and jsonb_array_length(v_sources) <> 0)
       or coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e), 0) <> sp.qty
       or (select count(distinct jsonb_build_array((e->>'bin_id')::uuid, (e->>'lot_id')::uuid)) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources)
    then raise exception 'distinct sources must sum to shipped quantity'; end if;
    for src in select (e->>'bin_id')::uuid bin_id, (e->>'lot_id')::uuid lot_id, (e->>'to_bin_id')::uuid to_bin_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
      if src.qty is null or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <= 0 or src.qty <> round(src.qty, 2) then raise exception 'invalid source quantity'; end if;
      if not exists (select 1 from public.bins where id = src.bin_id and location_id = o.from_location_id and brewery_id = o.brewery_id) then raise exception 'invalid source bin'; end if;
      if o.kind = 'taproom_transfer' and not exists (select 1 from public.bins where id = src.to_bin_id and location_id = o.to_location_id and brewery_id = o.brewery_id) then raise exception 'choose a destination bin'; end if;
      if o.kind = 'wholesale' and src.to_bin_id is not null then raise exception 'wholesale source has no destination bin'; end if;
      select coalesce(sum(qty), 0) into v_available from public.inventory_movements
        where brewery_id = o.brewery_id and sku_id = v_line.sku_id and bin_id = src.bin_id and lot_id is not distinct from src.lot_id;
      if v_available < src.qty then raise exception 'Not enough stock in the selected bin and lot: % on hand. Reduce the quantity or choose another source.',
        pg_catalog.trim_scale(v_available); end if;
    end loop;
    -- A one-way keg (a keg format with no container source) leaves whole, as a
    -- returnable keg does, so its fee is billed per keg.
    if sp.qty <> trunc(sp.qty) and exists (select 1 from public.skus s join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
        where s.id = v_line.sku_id and f.package_type = 'keg' and s.container_source is null) then
      raise exception 'one-way kegs ship in whole kegs';
    end if;
    update public.order_lines set qty_shipped = sp.qty where id = sp.line_id and order_id = p_order;
    if sp.qty > 0 then
      if o.kind = 'wholesale' then
        -- A foreign ship-to has no state (ship_tos_state_by_country), so
        -- exactly one of dest_state and dest_country is set.
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, dest_country, ref, created_by, created_at, occurred_on)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric,
          'sale_removal', v_channel, v_tax, v_state, nullif(v_country, 'US'), p_order, auth.uid(), v_posted_at, v_posted_on from jsonb_array_elements(v_sources) e;
        -- Automatic Shipped alone may overdraw shells: beer must still leave.
        select s.keg_pool_id, f.keg_size into v_pool, v_size
          from public.skus s join public.formats f on f.id=s.format_id and f.brewery_id=s.brewery_id
          where s.id=v_line.sku_id and s.brewery_id=o.brewery_id
            and s.container_source in ('owned_fleet','per_fill_rental');
        if v_pool is not null then
          if sp.qty <> trunc(sp.qty) then raise exception 'returnable kegs ship in whole kegs'; end if;
          v_shells := v_shells || jsonb_build_array(jsonb_build_object('order_line_id',v_line.id,'sku_id',v_line.sku_id,
            'pool_id',v_pool,'keg_size',v_size,'qty',sp.qty));
          -- Drain bins holding shells by name. A remainder the bins cannot cover
          -- stays at the last bin drained; when none held shells, first_bin is
          -- the existing location fallback, not FG stock. Earlier lines' Shipped
          -- events are already in the ledger, so the next line sees them.
          with held as (
            select bin_id,bin_name,qty,
                   coalesce(sum(qty) over (order by bin_name,bin_id rows between unbounded preceding and 1 preceding),0) before
              from private.keg_location_bins(o.brewery_id,o.from_location_id)
             where pool_id=v_pool and keg_size=v_size and qty>0),
          taken as (
            select bin_id,bin_name,least(qty,sp.qty::integer-before) qty from held where before<sp.qty::integer),
          rest as (
            select coalesce((select bin_id from taken order by bin_name desc,bin_id desc limit 1),
                            private.first_bin(o.from_location_id)) bin_id,
                   sp.qty::integer-coalesce((select sum(qty) from taken),0) qty)
          select jsonb_agg(jsonb_build_object('bin_id',bin_id,'qty',qty)) into v_drain
            from (select bin_id,qty from taken union all select bin_id,qty from rest where qty>0) d;
          insert into public.keg_events(brewery_id,pool_id,keg_size,location_id,bin_id,qty,reason,customer_id,shipment_id,note,created_by,at,created_at)
            select o.brewery_id,v_pool,v_size,o.from_location_id,(d->>'bin_id')::uuid,(d->>'qty')::integer,'shipped',
                   o.customer_id,v_shipment,private.doc_no('ORD',o.order_no),auth.uid(),v_posted_at,v_posted_at
              from jsonb_array_elements(v_drain) d;
        end if;
        if v_invoice is not null then
          insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description)
          select o.brewery_id, v_invoice, 'sku', ol.sku_id, sp.qty, ol.unit_price_cents, s.name
          from public.order_lines ol join public.skus s on s.id = ol.sku_id where ol.id = sp.line_id;
          insert into public.invoice_lines (brewery_id, invoice_id, kind, order_line_id, keg_pool_id, keg_size, qty, unit_price_cents, description)
          select o.brewery_id,v_invoice,'keg_deposit',d.order_line_id,d.keg_pool_id,d.keg_size,sp.qty,d.unit_price_cents,d.description
          from public.order_deposit_lines d where d.order_id=p_order and d.order_line_id=sp.line_id;
          insert into public.invoice_lines (brewery_id, invoice_id, kind, order_line_id, qty, unit_price_cents, description)
          select o.brewery_id, v_invoice, 'one_way_keg_fee', ol.id, sp.qty, ol.one_way_fee_cents, 'One-way keg fee'
          from public.order_lines ol where ol.id = sp.line_id and ol.one_way_fee_cents is not null;
        end if;
      else
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by, created_at, occurred_on)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'taproom_transfer'::public.movement_type, p_order, auth.uid(), v_posted_at, v_posted_on from jsonb_array_elements(v_sources) e
        union all
        select o.brewery_id, v_line.sku_id, o.to_location_id, (e->>'to_bin_id')::uuid, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'taproom_transfer'::public.movement_type, p_order, auth.uid(), v_posted_at, v_posted_on from jsonb_array_elements(v_sources) e;
      end if;
      update public.allocations set status = 'fulfilled'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    else
      update public.allocations set status = 'released'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    end if;
  end loop;
  -- Reconcile the net location balance, not only the bins we could drain.
  -- An older negative bin remains a shortfall even when another bin held enough.
  -- Saved structured so Shipment done and Keg fleet print one wording
  -- (kegShortageText in lib/mgr/keg-fleet-view.ts).
  select coalesce(jsonb_agg(jsonb_build_object('pool',p.name,'keg_size',n.keg_size,'location',l.name,'short',-n.qty)
                            order by p.name,n.keg_size),'[]'::jsonb) into v_warnings
    from (select k.pool_id,k.keg_size,sum(k.qty) qty from private.keg_location_bins(o.brewery_id,o.from_location_id) k
           where (k.pool_id,k.keg_size) in (select pool_id,keg_size from public.keg_events
                                             where brewery_id=o.brewery_id and shipment_id=v_shipment and reason='shipped')
           group by 1,2) n
    join public.keg_pools p on p.id=n.pool_id and p.brewery_id=o.brewery_id
    join public.locations l on l.id=o.from_location_id and l.brewery_id=o.brewery_id
   where n.qty<0;
  -- anything picked but held back is staged on the floor: put it back
  update public.orders
     set status = 'shipped', shipped_at = v_posted_at,
         needs_restock = exists (
           select 1 from jsonb_array_elements(p_ship) e
           join public.order_lines ol on ol.id = (e->>'line_id')::uuid
           where (e->>'qty_shipped')::numeric < coalesce(ol.qty_picked, ol.qty_ordered))
   where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'shipped',
          jsonb_build_object('ship', p_ship, 'carrier', p_carrier, 'invoice_id', v_invoice, 'warnings', v_warnings, 'keg_shells', v_shells));
  return jsonb_build_object('order_id', p_order, 'invoice_id', v_invoice, 'warnings', v_warnings);
end $function$;

-- Copied from: 20261104010440_brewery_ledger_locks.sql; only the refused fee credit is new.
CREATE OR REPLACE FUNCTION public.return_shipment(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text, p_request_id uuid, p_refused_delivery uuid DEFAULT NULL::uuid, p_return_empty boolean DEFAULT false, p_bin uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_brewery uuid; v_replay jsonb; v_result jsonb; v_payload jsonb;
  v_delivery public.deliveries; v_shipment public.shipments; v_invoice public.invoices;
  v_line record; v_outstanding numeric; v_beer boolean; v_customer uuid;
begin
  v_brewery := private.assert_invoice_staff(p_invoice,array['admin','sales']::public.staff_role[]);
  -- Ordinary returns retain the original five-argument request hash.
  v_payload := jsonb_build_object('invoice',p_invoice,'lines',p_lines,'location',p_location,'reason',p_reason);
  if p_refused_delivery is not null then v_payload := v_payload || jsonb_build_object('refused_delivery',p_refused_delivery); end if;
  if p_return_empty or p_bin is not null then v_payload := v_payload || jsonb_build_object('return_empty',p_return_empty,'bin',p_bin); end if;
  v_replay := private.claim_command_request(v_brewery,'return_shipment',p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if p_refused_delivery is not null then
    -- Same delivery -> order -> invoice order as physical refusal check-in.
    -- NO KEY UPDATE permits ordinary returns to insert their order-event FK.
    -- The invoice lock also serializes ordinary returns of accepted beer.
    select * into v_delivery from public.deliveries where id=p_refused_delivery and brewery_id=v_brewery for update;
    if v_delivery.id is null or v_delivery.delivered_at is null then raise exception 'closed refused delivery required'; end if;
    select * into v_shipment from public.shipments where id=v_delivery.shipment_id;
    if v_shipment.id is null or v_shipment.invoice_timing<>'now' then raise exception 'use refused beer check-in for an invoice-on-delivery shipment'; end if;
    perform 1 from public.orders where id=v_shipment.order_id for no key update;
    select * into v_invoice from public.invoices where id=p_invoice for update;
    if v_invoice.shipment_id is distinct from v_shipment.id then raise exception 'refused delivery does not belong to this invoice'; end if;
    -- Group by SKU so multiple submitted lines cannot each spend the same cap.
    for v_line in
      select il.sku_id,sum((e->>'qty')::numeric) qty
      from jsonb_array_elements(p_lines) e join public.invoice_lines il on il.id=(e->>'invoice_line_id')::uuid
      where il.invoice_id=p_invoice and il.kind='sku' group by il.sku_id
    loop
      select outstanding_qty into v_outstanding from public.refused_delivery_returns
      where delivery_id=p_refused_delivery and sku_id=v_line.sku_id;
      if v_line.qty > coalesce(v_outstanding,0) then raise exception 'return exceeds outstanding refusal'; end if;
    end loop;
  end if;
  select exists(select 1 from jsonb_array_elements(p_lines) e join public.invoice_lines l
    on l.id=(e->>'invoice_line_id')::uuid and l.invoice_id=p_invoice where l.kind='sku') into v_beer;
  if v_beer and (p_location is null or p_reason is null) then raise exception 'beer returns require a location and reason'; end if;
  if p_return_empty and v_beer then raise exception 'full beer returns already record their shells; return empty kegs with deposit-only refunds'; end if;
  -- Beer stock is locked before shells, matching the full-keg return path.
  v_result := private.return_shipment_impl(p_invoice,p_lines,p_location,p_reason);
  if p_return_empty then
    if not exists(select 1 from public.bins where id=p_bin and location_id=p_location and brewery_id=v_brewery) then
      raise exception 'choose the bin receiving the empty kegs';
    end if;
    perform private.lock_ledger(v_brewery, 'keg_events');
    select customer_id into v_customer from public.invoices where id=p_invoice;
    for v_line in
      select l.keg_pool_id,l.keg_size,sum((e->>'qty')::numeric)::integer qty
      from jsonb_array_elements(p_lines) e join public.invoice_lines l on l.id=(e->>'invoice_line_id')::uuid
      where l.invoice_id=p_invoice and l.kind='keg_deposit' group by l.keg_pool_id,l.keg_size
    loop
      select coalesce(sum(qty),0) into v_outstanding from public.keg_customer_balances
        where brewery_id=v_brewery and customer_id=v_customer and pool_id=v_line.keg_pool_id and keg_size=v_line.keg_size;
      if v_line.qty>v_outstanding then raise exception 'empty-keg return exceeds the customer balance; refund only if the kegs were already returned'; end if;
      insert into public.keg_events(brewery_id,pool_id,keg_size,location_id,bin_id,qty,reason,customer_id,note,created_by)
        values(v_brewery,v_line.keg_pool_id,v_line.keg_size,p_location,p_bin,v_line.qty,'returned',v_customer,
          'deposit refund '||(v_result->>'credit_memo_id'),auth.uid());
    end loop;
  end if;
  if p_refused_delivery is not null then
    update public.invoices set refused_delivery_id=p_refused_delivery where id=(v_result->>'credit_memo_id')::uuid;
    -- A refused one-way keg was never kept, so its fee is credited with the beer,
    -- as confirm_delivery bills an on-delivery invoice only for kegs kept.
    -- A later ordinary return never credits the fee. order_lines is unique on
    -- (order_id, sku_id), so one SKU's credited beer matches one fee line.
    insert into public.invoice_lines (brewery_id, invoice_id, kind, order_line_id, qty, unit_price_cents, description, credited_invoice_line_id)
    select fee.brewery_id, (v_result->>'credit_memo_id')::uuid, 'one_way_keg_fee', fee.order_line_id, credited.qty, fee.unit_price_cents, fee.description, fee.id
      from public.invoice_lines fee
      join public.order_lines ol on ol.id = fee.order_line_id
      join lateral (select sum(c.qty) qty from public.invoice_lines c
                     where c.invoice_id = (v_result->>'credit_memo_id')::uuid and c.kind = 'sku' and c.sku_id = ol.sku_id) credited on credited.qty < 0
     where fee.invoice_id = p_invoice and fee.kind = 'one_way_keg_fee';
  end if;
  return private.complete_command_request(p_request_id,v_result);
end $function$;

-- Copied from: 20261030031000_qbo_push_reconcile.sql; only the credit memo fee line is new.
CREATE OR REPLACE FUNCTION public.start_qbo_push(p_brewery uuid, p_invoice uuid, p_new_attempt_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.invoices; v_conn public.qbo_connections; v_customer public.customers;
  v_push public.qbo_pushes; v_previous public.qbo_pushes; v_ship public.ship_tos;
  v_replay jsonb; v_result jsonb; v_lines jsonb; v_snapshot_lines jsonb;
  v_body jsonb; v_address jsonb; v_email text; v_key uuid; v_reason text;
  v_invalid int; v_unmapped int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if p_new_attempt_reason is not null and p_new_attempt_reason not in ('corrected','remote_deleted') then raise exception 'invalid QuickBooks attempt reason'; end if;

  v_replay:=private.claim_command_request(p_brewery,'push_invoice_to_qbo',p_request_id,
    jsonb_strip_nulls(jsonb_build_object('invoiceId',p_invoice,'newAttemptReason',p_new_attempt_reason)));
  -- Replay of a push that already finished: return its outcome, before any refusal.
  if v_replay is not null then
    select * into v_push from public.qbo_pushes
      where id=nullif(v_replay->>'pushId','')::uuid and brewery_id=p_brewery and invoice_id=p_invoice for update;
    if found and v_push.status<>'pending' then
      return jsonb_strip_nulls(jsonb_build_object('pushId',v_push.id,'status',v_push.status,
        'remoteId',v_push.qbo_entity_id,'error',v_push.error,'alreadyFinished',true));
    end if;
  end if;

  select * into v_conn from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if not found then raise exception 'QuickBooks connection required'; end if;
  select * into v_inv from public.invoices where id=p_invoice and brewery_id=p_brewery for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.written_off_at is not null then raise exception 'written-off invoice cannot be pushed'; end if;
  if v_inv.qbo_sync_status = 'not_synced' then raise exception 'historical invoices are not sent to QuickBooks'; end if;
  if exists (select 1 from public.invoice_payments p where p.invoice_id=p_invoice and p.brewery_id=p_brewery
      and not exists (select 1 from public.invoice_payment_voids v where v.payment_id=p.id and v.brewery_id=p.brewery_id))
    then raise exception 'payments for this invoice are recorded in MGR, so it is not sent to QuickBooks'; end if;  -- voided payments do not block
  -- Any other replay (its push not finished): the first result, once the refusals above pass.
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_push from public.qbo_pushes where invoice_id=p_invoice and status='pending' order by created_at desc,id desc limit 1;
  if found then
    if v_push.connection_id<>v_conn.id or v_push.realm_id<>v_conn.realm_id then
      raise exception 'QuickBooks connection changed; pending push remains frozen and cannot be retargeted' using errcode='MG409';
    end if;
    v_result:=jsonb_build_object('pushId',v_push.id,'providerRequestId',v_push.provider_request_id,
      'finishRequestId',v_push.finish_request_id,'requestBody',v_push.request_body,'entityType',v_push.entity_type,
      'realmId',v_push.realm_id,'connectionId',v_push.connection_id,'status',v_push.status);
    return private.complete_command_request(p_request_id,v_result);
  end if;

  select * into v_previous from public.qbo_pushes where invoice_id=p_invoice order by created_at desc,id desc limit 1;
  if p_new_attempt_reason='corrected' and (v_previous.id is null or v_previous.status<>'push_failed') then
    raise exception 'a corrected QuickBooks attempt requires a definitive rejected push';
  elsif p_new_attempt_reason='remote_deleted' and (v_inv.qbo_invoice_id is null or v_inv.qbo_remote_state<>'deleted') then
    raise exception 'deleted QuickBooks document recreation is not available';
  elsif p_new_attempt_reason is null and v_previous.status='push_failed' then
    raise exception 'choose corrected after fixing the QuickBooks mapping';
  elsif p_new_attempt_reason is null and v_inv.qbo_invoice_id is not null then
    v_result:=jsonb_build_object('status','pushed','remoteId',v_inv.qbo_invoice_id,'alreadyPushed',true);
    return private.complete_command_request(p_request_id,v_result);
  end if;

  select * into v_customer from public.customers where id=v_inv.customer_id and brewery_id=p_brewery;
  if nullif(v_customer.qbo_customer_id,'') is null or v_customer.qbo_realm_id is distinct from v_conn.realm_id then
    raise exception 'QuickBooks customer mapping required';
  end if;
  select st.* into v_ship from public.shipments sh
    join public.orders o on o.id=sh.order_id and o.brewery_id=sh.brewery_id
    join public.ship_tos st on st.id=o.ship_to_id and st.brewery_id=o.brewery_id
    where sh.id=v_inv.shipment_id and sh.brewery_id=p_brewery;
  if not found then
    select * into v_ship from public.ship_tos where customer_id=v_inv.customer_id and brewery_id=p_brewery and is_default limit 1;
  end if;
  if v_ship.id is not null then
    v_address:=jsonb_strip_nulls(jsonb_build_object('Line1',v_ship.address1,'Line2',v_ship.address2,
      'City',v_ship.city,'CountrySubDivisionCode',v_ship.state,'PostalCode',v_ship.zip,'Country',v_ship.country));
  end if;
  select min(u.email::text) into v_email from public.customer_users cu join auth.users u on u.id=cu.user_id
    where cu.customer_id=v_inv.customer_id;

  select count(*) filter(where
      (v_inv.kind='invoice' and (il.kind not in ('sku','keg_deposit','one_way_keg_fee') or il.qty<=0 or il.unit_price_cents<0 or il.amount_cents<0))
      or (v_inv.kind='credit_memo' and (il.kind not in ('sku','keg_deposit_refund','one_way_keg_fee') or il.qty>=0 or il.unit_price_cents<0 or il.amount_cents>=0))),
    count(*) filter(where
      (il.kind='sku' and (s.qbo_item_id is null or s.qbo_realm_id is distinct from v_conn.realm_id))
      or (il.kind in ('keg_deposit','keg_deposit_refund') and v_conn.qbo_deposit_item_id is null)
      or (il.kind='one_way_keg_fee' and v_conn.qbo_one_way_fee_item_id is null))
    into v_invalid,v_unmapped
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;
  if not exists(select 1 from public.invoice_lines where invoice_id=p_invoice and brewery_id=p_brewery) then raise exception 'invoice lines required'; end if;
  if v_invalid>0 then raise exception 'QuickBooks does not support this invoice line shape'; end if;
  if v_unmapped>0 then
    if exists(select 1 from public.invoice_lines where invoice_id=p_invoice and kind in ('keg_deposit','keg_deposit_refund')) and v_conn.qbo_deposit_item_id is null
      then raise exception 'QuickBooks deposit item mapping required'; end if;
    if exists(select 1 from public.invoice_lines where invoice_id=p_invoice and kind='one_way_keg_fee') and v_conn.qbo_one_way_fee_item_id is null
      then raise exception 'map the one-way keg fee item'; end if;
    raise exception 'QuickBooks item mapping required';
  end if;

  select jsonb_agg(jsonb_build_object(
      'Amount',round((case when v_inv.kind='credit_memo' then -il.amount_cents else il.amount_cents end)::numeric/100,2),
      'Description',il.description,
      'DetailType','SalesItemLineDetail',
      'SalesItemLineDetail',jsonb_build_object(
        'ItemRef',jsonb_build_object('value',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id when il.kind='one_way_keg_fee' then v_conn.qbo_one_way_fee_item_id else s.qbo_item_id end),
        'Qty',case when v_inv.kind='credit_memo' then -il.qty else il.qty end,
        'UnitPrice',round(il.unit_price_cents::numeric/100,2))) order by il.id),
    jsonb_agg(jsonb_build_object('id',il.id,'kind',il.kind,'skuId',il.sku_id,'qty',il.qty,
      'unitPriceCents',il.unit_price_cents,'amountCents',il.amount_cents,
      'qboItemId',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id when il.kind='one_way_keg_fee' then v_conn.qbo_one_way_fee_item_id else s.qbo_item_id end) order by il.id)
    into v_lines,v_snapshot_lines
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;

  v_body:=jsonb_strip_nulls(jsonb_build_object(
    'CustomerRef',jsonb_build_object('value',v_customer.qbo_customer_id),
    'DocNumber',v_inv.invoice_no::text,'TxnDate',v_inv.issued_on,
    'DueDate',case when v_inv.kind='invoice' then v_inv.due_on end,
    'AllowOnlineACHPayment',case when v_inv.kind='invoice' then v_conn.allow_online_ach_payment end,
    'AllowOnlineCreditCardPayment',case when v_inv.kind='invoice' then v_conn.allow_online_credit_card_payment end,
    'BillAddr',v_address,'BillEmail',case when v_email is null then null else jsonb_build_object('Address',v_email) end,
    'Line',v_lines));
  v_reason:=coalesce(p_new_attempt_reason,'initial');
  v_key:=case when v_previous.id is null and p_new_attempt_reason is null then v_inv.qbo_idempotency_key else private.new_uuid() end;
  if v_key is distinct from v_inv.qbo_idempotency_key then update public.invoices set qbo_idempotency_key=v_key where id=p_invoice; end if;
  insert into public.qbo_pushes(brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
    request_body,local_snapshot,attempt_reason,supersedes_push_id)
  values(p_brewery,p_invoice,v_conn.id,v_conn.realm_id,case when v_inv.kind='credit_memo' then 'CreditMemo' else 'Invoice' end,
    v_key,v_body::text,jsonb_build_object('invoice',jsonb_build_object('id',v_inv.id,'kind',v_inv.kind,'invoiceNo',v_inv.invoice_no,
      'issuedOn',v_inv.issued_on,'dueOn',v_inv.due_on,'customerId',v_inv.customer_id,'qboCustomerId',v_customer.qbo_customer_id,
      'address',v_address,'email',v_email),'lines',v_snapshot_lines),v_reason,v_previous.id)
  returning * into v_push;
  update public.invoices set qbo_sync_status='pending',qbo_sync_error=null where id=p_invoice;
  v_result:=jsonb_build_object('pushId',v_push.id,'providerRequestId',v_push.provider_request_id,
    'finishRequestId',v_push.finish_request_id,'requestBody',v_push.request_body,'entityType',v_push.entity_type,
    'realmId',v_push.realm_id,'connectionId',v_push.connection_id,'status',v_push.status);
  return private.complete_command_request(p_request_id,v_result) || jsonb_build_object('mayPost',true);
end $function$;

-- Copied from: 20261016100800_historical_orders.sql; only the NaN check on the number is new.
create or replace function public.record_historical_order(
  p_brewery uuid, p_customer uuid, p_ship_to uuid, p_picked_up_on date, p_lines jsonb, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_opened date; v_tz text; v_at timestamptz; v_channel uuid; v_location uuid;
  v_order public.orders; v_shipment uuid; v_invoice uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_historical_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'customer', p_customer, 'ship_to', p_ship_to,
      'picked_up_on', p_picked_up_on, 'lines', p_lines, 'note', p_note));
  if v_replay is not null then return v_replay; end if;

  select books_opened_on, timezone into v_opened, v_tz from public.breweries where id = p_brewery;
  if v_opened is null then raise exception 'set the books opened date before recording history'; end if;
  if p_picked_up_on is null or p_picked_up_on >= v_opened then
    raise exception 'historical orders must be picked up before the books opened (%)', v_opened; end if;
  if exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null
      and period_start <= p_picked_up_on and period_end >= p_picked_up_on)
    then raise exception 'a filed report already covers this date'; end if;
  select sale_channel_id into v_channel from public.customers where id = p_customer and brewery_id = p_brewery;
  if v_channel is null then raise exception 'customer not found'; end if;
  if not exists (select 1 from public.ship_tos where id = p_ship_to and customer_id = p_customer and brewery_id = p_brewery)
    then raise exception 'ship-to not found for this customer'; end if;
  select coalesce(
    (select l.id from public.breweries b join public.locations l on l.id = b.portal_fulfillment_location_id and l.brewery_id = b.id
      where b.id = p_brewery and 'warehouse' = any(l.uses)),
    (select id from public.locations where brewery_id = p_brewery and 'warehouse' = any(uses) order by name, id limit 1))
    into v_location;
  if v_location is null then raise exception 'add a warehouse location before recording historical orders'; end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0
    then raise exception 'a historical order needs at least one line'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where not exists
      (select 1 from public.skus s where s.id = (e->>'sku_id')::uuid and s.brewery_id = p_brewery))
    then raise exception 'every line must be a SKU of this brewery'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where (e->>'qty')::numeric is null or (e->>'qty')::numeric <= 0
      or (e->>'qty')::numeric <> round((e->>'qty')::numeric, 2) or (e->>'qty')::numeric::text in ('NaN','Infinity','-Infinity'))
    then raise exception 'quantities must be positive with at most two decimals'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where (e->>'unit_price_cents')::numeric is null
      or (e->>'unit_price_cents')::numeric < 0 or (e->>'unit_price_cents')::numeric <> trunc((e->>'unit_price_cents')::numeric))
    then raise exception 'unit prices must be whole cents, zero or more'; end if;
  if (select count(distinct e->>'sku_id') from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines)
    then raise exception 'each SKU may appear once in a historical order'; end if;

  v_at := p_picked_up_on::timestamp at time zone v_tz;
  -- Inserted shipped, never updated to it: order_confirmation_email fires only
  -- on a status update, and get_today_items lists no shipped order.
  insert into public.orders (brewery_id, kind, status, customer_id, ship_to_id, from_location_id, sale_channel_id,
                             note, created_by, shipped_at, pickup)
  values (p_brewery, 'wholesale', 'shipped', p_customer, p_ship_to, v_location, v_channel, p_note, v_actor, v_at, true)
  returning * into v_order;
  insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, qty_picked, qty_shipped, unit_price_cents)
  select p_brewery, v_order.id, (e->>'sku_id')::uuid, (e->>'qty')::numeric, (e->>'qty')::numeric, (e->>'qty')::numeric,
         (e->>'unit_price_cents')::int
  from jsonb_array_elements(p_lines) e;
  insert into public.shipments (brewery_id, order_id, shipped_at, invoice_timing, created_by)
  values (p_brewery, v_order.id, v_at, 'now', v_actor) returning id into v_shipment;
  insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on, due_on, paid_at, qbo_sync_status)
  values (p_brewery, 'invoice', p_customer, v_shipment, p_picked_up_on, p_picked_up_on, v_at, 'not_synced')
  returning id into v_invoice;
  -- Described by SKU name, as ship_order_impl describes its sku lines.
  insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description)
  select p_brewery, v_invoice, 'sku', ol.sku_id, ol.qty_shipped, ol.unit_price_cents, s.name
  from public.order_lines ol join public.skus s on s.id = ol.sku_id and s.brewery_id = ol.brewery_id
  where ol.order_id = v_order.id;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order.id, v_actor, 'recorded_historical', jsonb_build_object('lines', p_lines, 'invoice_id', v_invoice));
  return private.complete_command_request(p_request_id,
    jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no, 'invoice_id', v_invoice));
end $$;

-- Copied from: 20261016101000_us_ship_to_state_only.sql; only the foreign-state refusal is new.
create or replace function public.import_csv_row(p_brewery uuid, p_request_id uuid, p_row_n integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_manifest jsonb; v_kind text; v_raw_row jsonb; v_row jsonb;
  v_required_field record; v_cell record; v_required text[]; v_allowed text[];
  v_id uuid; v_brand uuid; v_result jsonb; v_replay jsonb; v_request uuid;
  v_channel uuid; v_customer uuid; v_group uuid; v_format uuid; v_sku uuid; v_location uuid; v_bin uuid;
  v_us boolean;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  select result into v_manifest from private.command_requests
    where actor_id = auth.uid() and request_id = p_request_id and brewery_id = p_brewery and command_name = 'import_csv';
  if v_manifest is null then raise exception 'import manifest not found'; end if;
  if p_row_n is null or p_row_n < 0 or p_row_n >= jsonb_array_length(v_manifest->'rows') or p_row_n >= 5000 then raise exception 'invalid import row index'; end if;
  v_kind := v_manifest->>'kind'; v_raw_row := v_manifest->'rows'->p_row_n;
  v_request := private.import_request_id(p_request_id, p_row_n::text);
  v_replay := private.claim_command_request(p_brewery, 'import_csv_row', v_request, jsonb_build_object('parent', p_request_id, 'row_n', p_row_n, 'kind', v_kind, 'row', v_raw_row));
  if v_replay is not null then return v_replay; end if;
  -- Only this inner subtransaction catches row failures: any new brand/style,
  -- child ledger entry, and SKU are rolled back together. Siblings live in other calls.
  begin
    v_us := coalesce(nullif(btrim(v_raw_row->>'country'), ''), 'US') = 'US';
    v_required := case v_kind
      when 'customers' then array['name','type','saleChannelId'] || case when v_us then array['state'] else array[]::text[] end
      when 'ship_tos' then array['customerId','label'] || case when v_us then array['state'] else array[]::text[] end
      when 'products_skus' then array['product','formatId']
      when 'channel_prices' then array['saleChannelId','priceGroupId','formatId','unitPriceCents']
      when 'opening_balances' then array['skuId','locationId','binId','qty'] end;
    if v_required is null then raise exception 'invalid import kind'; end if;
    v_allowed := v_required || case v_kind
      when 'customers' then array['state','licenseNumber','paymentTerms','country','alias']
      when 'ship_tos' then array['address1','city','state','zip','address2','country']
      when 'products_skus' then array['sku_name','style','abv','upc']
      when 'opening_balances' then array['note'] else array[]::text[] end;
    for v_required_field in select unnest(v_required) as name loop
      if nullif(btrim(v_raw_row->>v_required_field.name), '') is null then raise exception '% is required', v_required_field.name; end if;
    end loop;
    for v_cell in select key, btrim(value) as value from jsonb_each_text(v_raw_row) loop
      if not v_cell.key = any(v_allowed) then raise exception 'unknown CSV field %', v_cell.key; end if;
      if v_cell.value = '' then continue; end if;
      if v_cell.key = 'state' and not v_us then raise exception 'state is for a US address only; leave it blank for another country'; end if;
      if v_cell.key = 'state' and v_cell.value !~ '^[A-Z]{2}$' then raise exception 'state must be two uppercase letters'; end if;
      if v_cell.key = 'country' and v_cell.value !~ '^[A-Z]{2}$' then raise exception 'country must be two uppercase letters'; end if;
      if v_cell.key in ('qty','abv','unitPriceCents') then
        if v_cell.value !~ '^[+-]?[0-9]+(\.[0-9]+)?$' then raise exception '% must be a decimal', v_cell.key; end if;
        if v_cell.key = 'qty' and v_cell.value::numeric <= 0 then raise exception 'qty must be positive'; end if;
        if v_cell.key = 'unitPriceCents' and (v_cell.value !~ '^[0-9]+$' or v_cell.value::numeric > 2147483647) then raise exception 'unitPriceCents must be whole cents (0–2147483647)'; end if;
      end if;
    end loop;
    -- Normalize a separate write row; replay above always uses the untouched manifest row.
    select jsonb_object_agg(key, nullif(case when key like '%Id'
      then private.js_btrim(value) else btrim(value) end, '')) into v_row from jsonb_each_text(v_raw_row);
    v_id := private.import_request_id(v_request, 'write');
    -- Resolve references inside this brewery, then reuse each kind's existing write RPC.
    case v_kind
      when 'customers' then
        v_channel := private.import_ref('saleChannelId', v_row->>'saleChannelId', p_brewery, 'sale_channels');
        v_result := public.upsert_customer(p_brewery, null, v_row->>'name', (v_row->>'type')::public.customer_type, v_row->>'state', v_channel, v_row->>'licenseNumber', v_row->>'paymentTerms', null, v_id,
          v_row->>'alias', coalesce(v_row->>'country', 'US'));
      when 'ship_tos' then
        v_customer := private.import_ref('customerId', v_row->>'customerId', p_brewery, 'customers');
        v_result := public.upsert_ship_to(p_brewery, null, v_customer, v_row->>'label', v_row->>'address1', v_row->>'address2', v_row->>'city', v_row->>'state', v_row->>'zip', v_id,
          null, coalesce(v_row->>'country', 'US'));
      when 'products_skus' then
        v_format := private.import_ref('formatId', v_row->>'formatId', p_brewery, 'formats', $s$basis = 'packaged'$s$);
        -- Existing brands are reused without replacing their metadata. An
        -- advisory lock serializes same-name creation across simultaneous rows.
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_brewery::text || ':' || (v_row->>'product'), 0));
        select id into v_brand from public.brands where brewery_id = p_brewery and name = v_row->>'product';
        if v_brand is null then
          v_result := public.upsert_brand(p_brewery, null, v_row->>'product', v_row->>'style', (v_row->>'abv')::numeric, null, null, null, null, private.import_request_id(v_request, 'brand'));
          v_brand := (v_result->>'id')::uuid;
        end if;
        v_result := public.create_sku(p_brewery, v_brand, v_format, v_row->>'sku_name', v_row->>'upc', v_id);
      when 'channel_prices' then
        -- Resolve the group before formats: pour names can repeat across groups.
        v_channel := private.import_ref('saleChannelId', v_row->>'saleChannelId', p_brewery, 'sale_channels');
        v_group := private.import_ref('priceGroupId', v_row->>'priceGroupId', p_brewery, 'price_groups');
        v_format := private.import_ref('formatId', v_row->>'formatId', p_brewery, 'formats', $s$basis = 'packaged' or price_group_id = $3$s$, v_group);
        v_result := public.set_channel_price(p_brewery, v_channel, v_group, v_format, (v_row->>'unitPriceCents')::integer, v_id);
      when 'opening_balances' then
        -- Resolve the location before its bin; bin names are local to a location.
        v_sku := private.import_ref('skuId', v_row->>'skuId', p_brewery, 'skus');
        v_location := private.import_ref('locationId', v_row->>'locationId', p_brewery, 'locations');
        v_bin := private.import_ref('binId', v_row->>'binId', p_brewery, 'bins', 'location_id = $3', v_location);
        v_result := public.record_inventory_movement(p_brewery, v_sku, v_location, v_bin, (v_row->>'qty')::numeric, 'opening_balance', null, null, v_row->>'note', v_id);
    end case;
    v_result := jsonb_build_object('status', 'committed', 'result', v_result);
  -- Nested tenant-reference refusals are row failures too. Actor/admin and
  -- manifest checks above remain outside this catch and deny the whole call.
  exception when sqlstate 'P0001' or insufficient_privilege or integrity_constraint_violation or data_exception then
    v_result := jsonb_build_object('status', 'blocked', 'error', SQLERRM);
  end;
  -- Failed rows also have durable results. Corrected input starts a new batch
  -- containing ONLY blocked rows; transport retries always use the old manifest.
  return private.complete_command_request(v_request, v_result);
end $$;

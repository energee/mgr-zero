-- Historical orders (docs/plans/lolev-orders.md task 7). An order picked up
-- before books_opened_on is recorded as shipped, picked up and paid. It writes
-- no inventory movement, allocation, deposit line, fee line or keg event: that
-- beer and its kegs were settled outside MGR. Its invoice is `not_synced`, so it
-- is never sent to QuickBooks, and it cannot be returned or credited.

alter type public.qbo_sync_status add value 'not_synced';

-- Admin only, replayable, like record_historical_batch. The caller supplies
-- each line's price (the grid price frozen at import). The source location is
-- the portal fulfillment location, else the first warehouse by name: an order
-- needs one, and no stock moves from it. Dates are the brewery-local start of
-- the pickup day, as record_historical_batch dates closed_at.
create function public.record_historical_order(
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
      or (e->>'qty')::numeric <> round((e->>'qty')::numeric, 2) or (e->>'qty') in ('NaN','Infinity','-Infinity'))
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
revoke all on function public.record_historical_order(uuid, uuid, uuid, date, jsonb, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_historical_order(uuid, uuid, uuid, date, jsonb, text, uuid) to authenticated;

-- Copied from: 20261016100700_one_way_keg_fee.sql; only the not_synced refusal is new.
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
      or (v_inv.kind='credit_memo' and (il.kind not in ('sku','keg_deposit_refund') or il.qty>=0 or il.unit_price_cents<0 or il.amount_cents>=0))),
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
  return private.complete_command_request(p_request_id,v_result);
end $function$;

-- Copied from: 20261012101000_ship_and_return_keg_events.sql; only the historical refusal is new.
-- return_shipment credits through this, so it refuses a historical invoice too.
create or replace function private.create_credit_memo_impl(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_cm uuid; v_order uuid; cl record; v_orig_qty numeric; v_already_credited numeric; v_sources jsonb; src record; v_original public.inventory_movements; v_sku uuid; v_line public.invoice_lines;
begin
  -- for update: concurrent memos against one invoice serialize here, so the
  -- over-credit guard below always sees the other memo's lines.
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'can only credit an invoice'; end if;
  -- A historical invoice shipped no stock, so nothing can come back against it.
  if v_inv.qbo_sync_status = 'not_synced' then raise exception 'a historical order cannot be returned'; end if;
  if v_inv.written_off_at is not null or v_inv.qbo_remote_state <> 'live' then
    raise exception 'cannot credit a voided or written-off invoice';
  end if;
  insert into public.invoices (brewery_id, kind, customer_id, issued_on)
  values (v_inv.brewery_id, 'credit_memo', v_inv.customer_id, current_date)
  returning id into v_cm;
  select order_id into v_order from public.shipments where id = v_inv.shipment_id;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'credit lines required'; end if;
  if (select count(distinct (e->>'invoice_line_id')::uuid) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then raise exception 'duplicate credit line'; end if;
  for cl in select (e->>'invoice_line_id')::uuid as line_id, (e->>'qty')::numeric as qty, e->'sources' as sources from jsonb_array_elements(p_lines) e loop
    if cl.qty is null or cl.qty::text in ('NaN','Infinity','-Infinity') or cl.qty <= 0 or cl.qty <> round(cl.qty, 2) then raise exception 'invalid return quantity'; end if;
    select qty into v_orig_qty from public.invoice_lines where id = cl.line_id and invoice_id = p_invoice;
    if v_orig_qty is null then raise exception 'invoice line % not found on invoice', cl.line_id; end if;
    -- Over-credit guard: qty already credited against this invoice line across
    -- all prior credit memos, plus this request, must not exceed the original.
    select coalesce(sum(-il.qty), 0) into v_already_credited
      from public.invoice_lines il where il.credited_invoice_line_id = cl.line_id;
    if cl.qty > (v_orig_qty - v_already_credited) then
      raise exception 'credit exceeds remaining creditable qty for line %', cl.line_id;
    end if;
    select * into v_line from public.invoice_lines where id = cl.line_id and invoice_id = p_invoice;
    if v_line.kind = 'keg_deposit' then
      if cl.qty <> trunc(cl.qty) then raise exception 'a deposit refund is in whole kegs'; end if;
      if cl.sources is not null then raise exception 'a deposit refund takes no return sources'; end if;
      insert into public.invoice_lines (brewery_id, invoice_id, kind, keg_pool_id, keg_size, qty, unit_price_cents, description, credited_invoice_line_id)
      values (v_inv.brewery_id, v_cm, 'keg_deposit_refund', v_line.keg_pool_id, v_line.keg_size, -cl.qty, v_line.unit_price_cents, v_line.description, v_line.id);
      continue;
    end if;
    if v_line.kind <> 'sku' then raise exception 'cannot credit a % line', v_line.kind; end if;
    insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description, credited_invoice_line_id)
    values (v_inv.brewery_id, v_cm, 'sku', v_line.sku_id, -cl.qty, v_line.unit_price_cents, v_line.description, v_line.id);
    v_sku := v_line.sku_id;
    v_sources := cl.sources;
    if v_sources is null and v_order is not null then
      -- A legacy caller may return one untracked shipment source; no guessed lot.
      select * into v_original from public.inventory_movements where brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal';
      if v_original.id is null or v_original.lot_id is not null or
         (select count(*) from public.inventory_movements where brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal') <> 1 then
        raise exception 'choose original shipped sources for this return';
      end if;
      v_sources := jsonb_build_array(jsonb_build_object('movement_id', v_original.id, 'bin_id', private.first_bin(p_location), 'qty', cl.qty));
    end if;
    if v_sources is null and v_order is null then
      insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, note, created_by)
      values (v_inv.brewery_id, v_sku, p_location, private.first_bin(p_location), cl.qty, 'return_in', v_cm, p_reason, auth.uid());
    else
      if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'return sources must be an array'; end if;
      if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e),0) <> cl.qty
         or (select count(distinct (e->>'movement_id')::uuid) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources) then raise exception 'distinct return sources must sum to returned quantity'; end if;
      for src in select (e->>'movement_id')::uuid movement_id, (e->>'bin_id')::uuid bin_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
        if src.qty is null or src.qty <= 0 or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <> round(src.qty,2) then raise exception 'invalid return source quantity'; end if;
        select * into v_original from public.inventory_movements where id = src.movement_id and brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal';
        if v_original.id is null then raise exception 'source was not shipped on this invoice'; end if;
        if not exists (select 1 from public.bins where id = src.bin_id and location_id = p_location and brewery_id = v_inv.brewery_id) then raise exception 'invalid return destination bin'; end if;
        if src.qty > -v_original.qty - (select coalesce(sum(qty),0) from public.inventory_movements where brewery_id = v_inv.brewery_id and source_movement_id = v_original.id and type = 'return_in') then raise exception 'return exceeds remaining shipped source quantity'; end if;
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, source_movement_id, qty, type, ref, note, created_by)
        values (v_inv.brewery_id, v_sku, p_location, src.bin_id, v_original.lot_id, v_original.id, src.qty, 'return_in', v_cm, p_reason, auth.uid());
        perform private.return_keg_shells(v_inv.shipment_id,v_sku,src.qty,p_location,src.bin_id);
      end loop;
    end if;
  end loop;
  -- Append to the originating order's event log, if this invoice came from a
  -- shipment (credit memos on a manually-issued invoice have none).
  if v_order is not null then
    insert into public.order_events (brewery_id, order_id, actor, event, payload)
    values (v_inv.brewery_id, v_order, auth.uid(), 'credit_memo',
            jsonb_build_object('invoice_id', p_invoice, 'credit_memo_id', v_cm, 'lines', p_lines, 'reason', p_reason));
  end if;
  return jsonb_build_object('invoice_id', v_cm);
end $$;

-- Copied from: 20260910120847_deploy_current_schema.sql; only the not_synced exclusion is new.
-- A new QuickBooks company resets invoices to pending; history must stay out.
CREATE OR REPLACE FUNCTION private.purge_qbo_identity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if old.realm_id is distinct from new.realm_id then
  update public.customers set qbo_customer_id=null,qbo_realm_id=null where brewery_id=old.brewery_id;
  update public.skus set qbo_item_id=null,qbo_realm_id=null where brewery_id=old.brewery_id;
  update public.invoices set qbo_invoice_id=null,qbo_sync_status='pending',qbo_sync_error=null,qbo_sync_token=null,qbo_remote_state='live',qbo_tax_cents=null,qbo_total_cents=null,qbo_balance_cents=null,qbo_cash_collected_cents=0,qbo_accountant_drift=false where brewery_id=old.brewery_id and qbo_sync_status<>'not_synced';
 end if; return new;
end $function$;

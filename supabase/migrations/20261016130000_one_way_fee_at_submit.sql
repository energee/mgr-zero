-- The one-way keg fee is frozen on the order line at submit, like a keg
-- deposit, instead of at ship: staff see it on a submitted order, and a buyer
-- sees it on the portal quote before placing the order (it was invoice-only).
-- ensure_order_deposit_lines runs at submit (submit_order_impl,
-- portal_submit_quote) and on adjust, so it now stamps the fee on any one-way
-- keg line that has none. ship_order_impl no longer stamps it.

-- Copied from: 20260923130000_deposits_on_every_order.sql; only the fee update is new.
create or replace function private.ensure_order_deposit_lines(o public.orders) returns void
language plpgsql set search_path = '' as $$
declare r record;
begin
  if o.kind <> 'wholesale' then return; end if;
  -- A one-way keg: a keg format with no container source (no shell to return).
  -- ponytail: a line stamped with no fee (fee 0) is restamped on a later adjust.
  update public.order_lines ol set one_way_fee_cents = nullif(b.one_way_keg_fee_cents, 0)
    from public.skus s join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id,
         public.breweries b
   where ol.order_id = o.id and ol.one_way_fee_cents is null and b.id = o.brewery_id
     and s.id = ol.sku_id and s.brewery_id = o.brewery_id
     and f.package_type = 'keg' and s.container_source is null;
  for r in
    select ol.id as line_id, ol.qty_ordered, f.package_type, f.keg_size, k.id as pool_id, k.name, k.deposit_cents
    from public.order_lines ol
    join public.skus s on s.id = ol.sku_id and s.brewery_id = o.brewery_id
    join public.formats f on f.id = s.format_id and f.brewery_id = o.brewery_id
    left join public.keg_pools k on k.id = s.keg_pool_id and k.brewery_id = o.brewery_id
    where ol.order_id = o.id and s.container_source in ('owned_fleet','per_fill_rental')
      and not exists (select 1 from public.order_deposit_lines d where d.order_line_id = ol.id)
  loop
    if r.package_type is distinct from 'keg' or r.keg_size is null or r.pool_id is null then
      raise exception 'returnable keg deposit is not configured';
    end if;
    if r.deposit_cents > 0 then
      insert into public.order_deposit_lines (brewery_id, order_id, order_line_id, keg_pool_id, keg_size, description, qty_ordered, unit_price_cents)
      values (o.brewery_id, o.id, r.line_id, r.pool_id, r.keg_size, r.name || ' deposit', r.qty_ordered, r.deposit_cents);
    end if;
  end loop;
end $$;
revoke all on function private.ensure_order_deposit_lines(public.orders) from public, anon, authenticated, service_role;

-- Copied from: 20261016100700_one_way_keg_fee.sql; only the fee stamp is removed.
CREATE OR REPLACE FUNCTION private.ship_order_impl(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text, p_invoice_timing text DEFAULT 'now'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.orders; sp record; v_state text; v_country text; v_invoice uuid; v_shipment uuid;
  v_channel uuid; v_tax public.tax_treatment; v_sources jsonb; src record; v_line public.order_lines; v_available numeric; v_pool uuid; v_size public.keg_size;
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
  -- ponytail: serialize ledger consumers globally; use shared per-stock-key
  -- locks in every writer if warehouse write throughput outgrows this lock.
  lock table public.inventory_movements in share row exclusive mode;
  lock table public.keg_events in share row exclusive mode;
  if jsonb_typeof(p_ship) is distinct from 'array' then raise exception 'ship list must cover every order line exactly once'; end if;
  if jsonb_array_length(p_ship) <> (select count(*) from public.order_lines where order_id = p_order)
     or (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_ship) e) <> jsonb_array_length(p_ship)
     or exists (select 1 from jsonb_array_elements(p_ship) e where not exists
       (select 1 from public.order_lines where id = (e->>'line_id')::uuid and order_id = p_order)) then
    raise exception 'ship list must cover every order line exactly once';
  end if;
  -- The one-way keg fee was frozen on each line at submit (ensure_order_deposit_lines).
  insert into public.shipments (brewery_id, order_id, carrier, tracking, invoice_timing, created_by)
  values (o.brewery_id, p_order, p_carrier, p_tracking, coalesce(p_invoice_timing, 'now'), auth.uid()) returning id into v_shipment;
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
    insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on)
    values (o.brewery_id, 'invoice', o.customer_id, v_shipment, current_date)
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
      if v_available < src.qty then raise exception 'insufficient selected bin/lot stock; choose recorded sources'; end if;
    end loop;
    update public.order_lines set qty_shipped = sp.qty where id = sp.line_id and order_id = p_order;
    if sp.qty > 0 then
      if o.kind = 'wholesale' then
        -- A foreign ship-to has no state (ship_tos_state_by_country), so
        -- exactly one of dest_state and dest_country is set.
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, dest_country, ref, created_by)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric,
          'sale_removal', v_channel, v_tax, v_state, nullif(v_country, 'US'), p_order, auth.uid() from jsonb_array_elements(v_sources) e;
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
          insert into public.keg_events(brewery_id,pool_id,keg_size,location_id,bin_id,qty,reason,customer_id,shipment_id,note,created_by)
            select o.brewery_id,v_pool,v_size,o.from_location_id,(d->>'bin_id')::uuid,(d->>'qty')::integer,'shipped',
                   o.customer_id,v_shipment,private.doc_no('ORD',o.order_no),auth.uid()
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
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'taproom_transfer'::public.movement_type, p_order, auth.uid() from jsonb_array_elements(v_sources) e
        union all
        select o.brewery_id, v_line.sku_id, o.to_location_id, (e->>'to_bin_id')::uuid, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'taproom_transfer'::public.movement_type, p_order, auth.uid() from jsonb_array_elements(v_sources) e;
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
     set status = 'shipped', shipped_at = now(),
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

-- Copied from: 20260913140000_location_multi_use.sql; only the one-way fees are new.
CREATE OR REPLACE FUNCTION private.portal_quote_snapshot(p_brewery uuid, p_customer uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_customer public.customers; v_ship public.ship_tos; v_source public.locations;
  v_lines jsonb; v_deposits jsonb; v_subtotal bigint; v_deposit bigint; v_fees jsonb; v_fee bigint;
begin
  perform private.assert_order_lines(p_lines);
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where jsonb_typeof(e)<>'object' or not (e ?& array['sku_id','qty'])
      or (select count(*) from jsonb_object_keys(e))<>2
      or jsonb_typeof(e->'sku_id')<>'string' or jsonb_typeof(e->'qty')<>'number'
      or (e->>'qty')::numeric<=0 or (e->>'qty')::numeric<>trunc((e->>'qty')::numeric)
  ) then raise exception 'quote lines require a SKU and positive whole quantity'; end if;
  if (select count(distinct (e->>'sku_id')::uuid) from jsonb_array_elements(p_lines) e)<>jsonb_array_length(p_lines) then
    raise exception 'duplicate quote line';
  end if;
  select * into v_customer from public.customers where id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'customer not found'; end if;
  select * into v_ship from public.ship_tos where id=p_ship_to and customer_id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'ship-to not found'; end if;
  select l.* into v_source from public.breweries b join public.locations l
    on l.id=b.portal_fulfillment_location_id and l.brewery_id=b.id
    where b.id=p_brewery and 'warehouse' = any(l.uses);
  if not found then raise exception 'portal fulfillment source is not configured'; end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), resolved as (
    select r.sku_id,r.qty,p.sku_name,p.brand_name,p.unit_price_cents,
      (r.qty*p.unit_price_cents)::bigint amount_cents,s.qbo_item_id,s.qbo_realm_id,
      k.id pool_id,k.name pool_name,f.keg_size,k.deposit_cents
    from requested r
    join public.sku_prices p on p.brewery_id=p_brewery and p.sale_channel_id=v_customer.sale_channel_id
      and p.sku_id=r.sku_id and p.active
    join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    left join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
  )
  select jsonb_agg(jsonb_build_object(
      'skuId',sku_id,'name',sku_name,'product',brand_name,'qty',qty,
      'unitPriceCents',unit_price_cents,'amountCents',amount_cents,
      'qboItemId',qbo_item_id,'qboRealmId',qbo_realm_id,
      'depositPoolId',pool_id,'depositName',pool_name,'kegSize',keg_size,
      'depositUnitPriceCents',case when deposit_cents>0 then deposit_cents end) order by sku_id),
    coalesce(sum(amount_cents),0)
  into v_lines,v_subtotal from resolved;
  if coalesce(jsonb_array_length(v_lines),0)<>jsonb_array_length(p_lines) then
    raise exception 'sku is not active and priced for this customer';
  end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), deposits as (
    select k.id pool_id,k.name,k.deposit_cents,f.keg_size,sum(r.qty)::int qty
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
    where k.deposit_cents>0 group by k.id,k.name,k.deposit_cents,f.keg_size
  )
  select coalesce(jsonb_agg(jsonb_build_object('poolId',pool_id,'name',name,'kegSize',keg_size,
      'qty',qty,'unitPriceCents',deposit_cents,'amountCents',qty*deposit_cents) order by pool_id),'[]'),
    coalesce(sum(qty*deposit_cents),0)
  into v_deposits,v_deposit from deposits;

  -- One-way kegs (a keg SKU with no container source) carry the brewery's fee, as submit stamps it.
  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), fees as (
    select s.id,s.name,r.qty,b.one_way_keg_fee_cents fee
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id and f.brewery_id=p_brewery
    join public.breweries b on b.id=p_brewery
    where f.package_type='keg' and s.container_source is null and b.one_way_keg_fee_cents>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'qty',qty,'unitPriceCents',fee,'amountCents',(qty*fee)::bigint) order by id),'[]'),
    coalesce(sum(qty*fee),0)::bigint
  into v_fees,v_fee from fees;

  return jsonb_build_object(
    'input',jsonb_build_object('shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines),
    'customer',jsonb_build_object('id',v_customer.id,'name',v_customer.name,'qboCustomerId',v_customer.qbo_customer_id,'qboRealmId',v_customer.qbo_realm_id),
    'source',jsonb_build_object('id',v_source.id,'name',v_source.name,'address',v_source.address),
    'destination',jsonb_build_object('id',v_ship.id,'label',v_ship.label,'address1',v_ship.address1,'address2',v_ship.address2,'city',v_ship.city,'state',v_ship.state,'zip',v_ship.zip),
    'lines',v_lines,'deposits',v_deposits,'subtotalCents',v_subtotal,
    'depositCents',v_deposit,'oneWayFees',v_fees,'oneWayFeeCents',v_fee,'amountBeforeTaxCents',v_subtotal+v_deposit+v_fee
  );
end $function$;

-- Copied from: 20260910120847_deploy_current_schema.sql; only the one-way fee result and tax line are new.
CREATE OR REPLACE FUNCTION public.portal_quote_order (
  p_brewery    uuid,
  p_customer   uuid,
  p_ship_to    uuid,
  p_requested  date,
  p_po         text,
  p_note       text,
  p_lines      jsonb,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid; v_replay jsonb; v_snapshot jsonb; v_result jsonb;
  v_quote uuid:=private.new_uuid(); v_connection uuid; v_realm text; v_deposit_item text; v_fee_item text;
  v_public_lines jsonb; v_tax_lines jsonb; v_public_deposits jsonb;
begin
  v_actor:=private.assert_customer(p_brewery,p_customer);
  v_replay:=private.claim_command_request(p_brewery,'portal_quote_order',p_request_id,
    jsonb_build_object('brewery',p_brewery,'customer',p_customer,'shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  v_snapshot:=private.portal_quote_snapshot(p_brewery,p_customer,p_ship_to,p_requested,p_po,p_note,p_lines);
  select coalesce(jsonb_agg(x-array['qboItemId','qboRealmId','depositPoolId','depositName','kegSize','depositUnitPriceCents']),'[]') into v_public_lines
    from jsonb_array_elements(v_snapshot->'lines') x;
  select coalesce(jsonb_agg(x-array['poolId']),'[]') into v_public_deposits
    from jsonb_array_elements(v_snapshot->'deposits') x;
  select c.id,c.realm_id,c.qbo_deposit_item_id,c.qbo_one_way_fee_item_id into v_connection,v_realm,v_deposit_item,v_fee_item
  from public.qbo_connections c
  where c.brewery_id=p_brewery and c.state='connected'
    and 'com.intuit.quickbooks.accounting'=any(c.granted_scopes)
    and 'indirect-tax.tax-calculation.quickbooks'=any(c.granted_scopes)
    and c.realm_id=v_snapshot#>>'{customer,qboRealmId}'
    and nullif(v_snapshot#>>'{customer,qboCustomerId}','') is not null
    and nullif(v_snapshot#>>'{source,address}','') is not null
    and not exists(select 1 from jsonb_array_elements(v_snapshot->'lines') x
      where nullif(x->>'qboItemId','') is null or x->>'qboRealmId'<>c.realm_id)
    and ((v_snapshot->>'depositCents')::bigint=0 or nullif(c.qbo_deposit_item_id,'') is not null)
    and ((v_snapshot->>'oneWayFeeCents')::bigint=0 or nullif(c.qbo_one_way_fee_item_id,'') is not null)
    and exists(select 1 from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=c.id);
  if v_connection is not null then
    select coalesce(jsonb_agg(jsonb_build_object('itemId',x->>'qboItemId','qty',(x->>'qty')::numeric,
      'unitPriceCents',(x->>'unitPriceCents')::int)),'[]') into v_tax_lines
      from jsonb_array_elements(v_snapshot->'lines') x;
    if (v_snapshot->>'depositCents')::bigint>0 then
      v_tax_lines:=v_tax_lines||jsonb_build_array(jsonb_build_object(
        'itemId',v_deposit_item,'qty',1,'unitPriceCents',(v_snapshot->>'depositCents')::int));
    end if;
    if (v_snapshot->>'oneWayFeeCents')::bigint>0 then
      v_tax_lines:=v_tax_lines||jsonb_build_array(jsonb_build_object(
        'itemId',v_fee_item,'qty',1,'unitPriceCents',(v_snapshot->>'oneWayFeeCents')::int));
    end if;
    v_snapshot:=v_snapshot||jsonb_build_object('taxInput',jsonb_build_object(
      'transactionDate',coalesce(p_requested,current_date),'customerId',v_snapshot#>>'{customer,qboCustomerId}',
      'sourceAddress',v_snapshot#>>'{source,address}',
      'destinationAddress',concat_ws(', ',v_snapshot#>>'{destination,address1}',v_snapshot#>>'{destination,address2}',v_snapshot#>>'{destination,city}',v_snapshot#>>'{destination,state}',v_snapshot#>>'{destination,zip}'),
      'lines',v_tax_lines));
  end if;
  v_result:=jsonb_build_object('quoteId',v_quote,'expiresAt',now()+interval '10 minutes','taxStatus','pending',
    'source',v_snapshot->'source','destination',v_snapshot->'destination','lines',v_public_lines,'deposits',v_public_deposits,
    'subtotalCents',(v_snapshot->>'subtotalCents')::bigint,'depositCents',(v_snapshot->>'depositCents')::bigint,
    'oneWayFees',v_snapshot->'oneWayFees','oneWayFeeCents',(v_snapshot->>'oneWayFeeCents')::bigint,
    'amountBeforeTaxCents',(v_snapshot->>'amountBeforeTaxCents')::bigint,'taxReady',v_connection is not null);
  insert into private.portal_order_quotes(id,actor_id,brewery_id,customer_id,request_id,snapshot,result,connection_id)
    values(v_quote,v_actor,p_brewery,p_customer,p_request_id,v_snapshot,v_result,v_connection);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

-- Open orders submitted before this change get today's fee: the one ship would
-- have stamped on them.
update public.order_lines ol set one_way_fee_cents = b.one_way_keg_fee_cents
  from public.orders o, public.skus s, public.formats f, public.breweries b
 where o.id = ol.order_id and o.kind = 'wholesale' and o.status in ('submitted','confirmed','picked')
   and ol.one_way_fee_cents is null and s.id = ol.sku_id and f.id = s.format_id
   and f.package_type = 'keg' and s.container_source is null
   and b.id = o.brewery_id and b.one_way_keg_fee_cents > 0;

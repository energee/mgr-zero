-- #1625: automatic document dates use the same brewery-local day as stock removals.
-- Existing dates are facts of record and are not rewritten.
create function private.brewery_today(p_brewery uuid) returns date
language sql stable set search_path = '' as $$
  select (now() at time zone b.timezone)::date
    from public.breweries b where b.id = p_brewery;
$$;
revoke all on function private.brewery_today(uuid) from public, anon, authenticated, service_role;

-- A column default cannot read brewery_id. Fill the issue date in the existing
-- invoice-date trigger before deriving due_on, and preserve explicit dates.
alter table public.invoices alter column issued_on drop default;
create or replace function private.set_invoice_due_on() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.issued_on := coalesce(new.issued_on, private.brewery_today(new.brewery_id));
  if new.kind = 'invoice' and new.due_on is null then
    select new.issued_on + private.payment_term_days(c.payment_terms)
      into new.due_on
      from public.customers c
     where c.id = new.customer_id and c.brewery_id = new.brewery_id;
  end if;
  return new;
end $$;

alter table public.receipts alter column received_on drop default;
create function private.set_receipt_received_on() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.received_on := coalesce(new.received_on, private.brewery_today(new.brewery_id));
  return new;
end $$;
revoke all on function private.set_receipt_received_on() from public, anon, authenticated, service_role;
create trigger receipts_set_received_on before insert on public.receipts
  for each row execute function private.set_receipt_received_on();

alter table public.material_counts alter column counted_on drop default;
create function private.set_material_count_counted_on() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.counted_on := coalesce(new.counted_on, private.brewery_today(new.brewery_id));
  return new;
end $$;
revoke all on function private.set_material_count_counted_on() from public, anon, authenticated, service_role;
create trigger material_counts_set_counted_on before insert on public.material_counts
  for each row execute function private.set_material_count_counted_on();

-- Preserve #1663's post-lock wall clock when deriving the brewery-local ship date.
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

-- Copied from 20261016100700_one_way_keg_fee.sql; only automatic dates change.
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
        values(o.brewery_id,'invoice',o.customer_id,sh.id,private.brewery_today(o.brewery_id)) returning id into v_invoice;
      insert into public.invoice_lines(brewery_id,invoice_id,kind,sku_id,qty,unit_price_cents,description)
        select o.brewery_id,v_invoice,'sku',l.sku_id,l.qty_shipped-l.qty_refused,l.unit_price_cents,s.name
        from public.order_lines l join public.skus s on s.id=l.sku_id where l.order_id=o.id and l.qty_shipped>l.qty_refused;
      insert into public.invoice_lines(brewery_id,invoice_id,kind,order_line_id,keg_pool_id,keg_size,qty,unit_price_cents,description)
        select o.brewery_id,v_invoice,'keg_deposit',dl.order_line_id,dl.keg_pool_id,dl.keg_size,l.qty_shipped-l.qty_refused,dl.unit_price_cents,dl.description
        from public.order_deposit_lines dl join public.order_lines l on l.id=dl.order_line_id where dl.order_id=o.id and l.qty_shipped>l.qty_refused;
      -- The fee frozen on the line at ship, for the kegs the customer kept.
      insert into public.invoice_lines(brewery_id,invoice_id,kind,order_line_id,qty,unit_price_cents,description)
        select o.brewery_id,v_invoice,'one_way_keg_fee',l.id,l.qty_shipped-l.qty_refused,l.one_way_fee_cents,'One-way keg fee'
        from public.order_lines l where l.order_id=o.id and l.qty_shipped>l.qty_refused and l.one_way_fee_cents is not null;
    end if;
    insert into public.order_events(brewery_id,order_id,actor,event,payload)
      values(o.brewery_id,o.id,auth.uid(),'delivered',jsonb_build_object('delivery_id',d.id,'outcome',v_outcome,'refused',p_refused,'reason',p_reason,'note',p_note,'invoice_id',v_invoice));
  end if;
  return private.complete_command_request(p_request_id,jsonb_build_object('delivery_id',d.id,'invoice_id',v_invoice,'outcome',v_outcome));
end $$;

-- Copied from 20261016100800_historical_orders.sql; only automatic dates change.
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
  values (v_inv.brewery_id, 'credit_memo', v_inv.customer_id, private.brewery_today(v_inv.brewery_id))
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

-- Preserve #1641's exact quantities and #1638's actual purchase-unit cost.
create or replace function public.receive_purchase_order(
  p_brewery uuid, p_po uuid, p_location uuid, p_bin uuid, p_received_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_po public.purchase_orders; v_receipt_id uuid; l jsonb;
  v_line public.purchase_order_lines; v_mat public.materials; v_counted numeric; v_expected numeric;
  v_lot uuid; v_movement uuid; v_cost numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'receive_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'location', p_location, 'bin', p_bin, 'received_on', p_received_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_po := private.lock_purchase_order(p_brewery, p_po, array['sent','partially_received']::public.po_status[]);
  if jsonb_array_length(p_lines) = 0 then raise exception 'a receipt needs at least one counted line'; end if;
  insert into public.receipts (brewery_id, po_id, received_on, received_by, location_id, bin_id)
  values (p_brewery, p_po, coalesce(p_received_on, private.brewery_today(p_brewery)), v_actor, p_location, p_bin) returning id into v_receipt_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.purchase_order_lines where id = (l->>'po_line_id')::uuid and po_id = p_po;
    if v_line.id is null then raise exception 'line % is not on this purchase order', l->>'po_line_id'; end if;
    v_cost := (l->>'unit_cost_cents')::numeric;
    if v_cost is not null and (v_cost::text in ('NaN','Infinity','-Infinity') or v_cost<0 or v_cost>2147483647 or v_cost<>trunc(v_cost)) then
      raise exception 'unit cost must be integer cents from 0 to 2147483647';
    end if;
    v_cost := coalesce(v_cost,v_line.unit_cost_cents);
    select * into v_mat from public.materials where id = v_line.material_id;
    v_counted := (l->>'qty_counted')::numeric;
    if v_counted is null or v_counted::text in ('NaN','Infinity','-Infinity') or v_counted<0 or v_counted<>round(v_counted,4) then
      raise exception 'counted quantities must be finite, nonnegative, and have at most four decimals';
    end if;
    if v_counted*v_mat.purchase_uom_factor<>round(v_counted*v_mat.purchase_uom_factor,4) then
      raise exception 'counted quantity is too precise for the base unit';
    end if;
    select qty_open into v_expected from public.po_open_balances where po_line_id = v_line.id;
    v_lot := null; v_movement := null;
    if v_mat.lot_tracked and v_counted > 0 then  -- #453: a zero count needs no lot
      if nullif(trim(l->>'lot_code'), '') is null then raise exception '% is lot-tracked: a lot code is required', v_mat.name; end if;
      insert into public.material_lots (brewery_id, material_id, lot_code, vendor_id, received_on, best_by)
      values (p_brewery, v_mat.id, trim(l->>'lot_code'), v_po.vendor_id, coalesce(p_received_on, private.brewery_today(p_brewery)), (l->>'best_by')::date)
      -- ponytail: exact (trimmed) lot-code match; case/punctuation normalization needs a generated column carrying the unique
      on conflict (material_id, lot_code) do update set best_by = coalesce(excluded.best_by, public.material_lots.best_by)
      returning id into v_lot;
    end if;
    if v_counted > 0 then
      -- Cost per base unit, unrounded (#495): the purchase-unit price over the factor.
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, unit_cost_cents, created_by)
      values (p_brewery, v_mat.id, p_location, p_bin, v_lot, v_counted * v_mat.purchase_uom_factor, 'receipt',
              v_cost / v_mat.purchase_uom_factor, v_actor)
      returning id into v_movement;
    end if;
    insert into public.receipt_lines (brewery_id, receipt_id, po_line_id, qty_expected, qty_counted, lot_id, movement_id,
      material_id, material_name, base_uom, purchase_uom, purchase_uom_factor, purchase_unit_cost_cents,
      lot_code, lot_received_on, lot_best_by, cost_recorded_at, cost_order_id)
    select p_brewery, v_receipt_id, v_line.id, v_expected, v_counted, v_lot, v_movement,
      v_mat.id, v_mat.name, v_mat.base_uom, v_mat.purchase_uom, v_mat.purchase_uom_factor, v_cost,
      ml.lot_code, ml.received_on, ml.best_by, now(), v_receipt_id
    from (select 1) singleton left join public.material_lots ml on ml.id=v_lot;
  end loop;
  select * into v_po from public.purchase_orders where id = p_po;
  return private.complete_command_request(p_request_id, jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po, 'status', v_po.status));
end $$;

-- Copied from 20260929010000_material_count_preview.sql; only automatic dates change.
create or replace function public.record_material_count(p_brewery uuid, p_location uuid, p_bin uuid, p_counted_on date, p_lines jsonb, p_request_id uuid, p_revision text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; replay jsonb; plan jsonb; counted public.material_counts;
  line jsonb; adjustment jsonb; movement uuid; movement_ids jsonb; result_lines jsonb := '[]';
begin
  actor := private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery, 'record_material_count', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'bin', p_bin, 'counted_on', p_counted_on, 'lines', p_lines) || case when p_revision is null then '{}'::jsonb else jsonb_build_object('revision', p_revision) end);
  if replay is not null then return replay; end if;
  if p_revision is null then raise exception 'Preview the count before recording.' using errcode = 'MG409'; end if;
  perform private.lock_material_count();
  plan := private.plan_material_count(p_brewery, p_location, p_bin, p_lines);
  if p_revision is null or p_revision <> plan->>'revision' then
    raise exception 'Material stock changed. Preview the count again.' using errcode = 'MG409';
  end if;
  insert into public.material_counts (brewery_id, location_id, bin_id, counted_on, counted_by)
    values (p_brewery, p_location, p_bin, coalesce(p_counted_on, private.brewery_today(p_brewery)), actor) returning * into counted;
  for line in select value from jsonb_array_elements(plan->'lines') loop
    movement_ids := '[]';
    if jsonb_array_length(line->'adjustments') = 0 then
      insert into public.material_count_lines (brewery_id, count_id, material_id, qty_expected, qty_counted)
        values (p_brewery, counted.id, (line->>'material_id')::uuid, (line->>'qty_expected')::numeric, (line->>'qty_counted')::numeric);
    else
      for adjustment in select value from jsonb_array_elements(line->'adjustments') loop
        insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, created_by)
          values (p_brewery, (line->>'material_id')::uuid, p_location, p_bin, (adjustment->>'lot_id')::uuid, (adjustment->>'delta')::numeric, 'count_adjustment', actor)
          returning id into movement;
        insert into public.material_count_lines (brewery_id, count_id, material_id, lot_id, qty_expected, qty_counted, movement_id)
          values (p_brewery, counted.id, (line->>'material_id')::uuid, (adjustment->>'lot_id')::uuid, (adjustment->>'qty_expected')::numeric, (adjustment->>'qty_counted')::numeric, movement);
        movement_ids := movement_ids || to_jsonb(movement);
      end loop;
    end if;
    result_lines := result_lines || jsonb_build_array(jsonb_build_object('material_id', line->'material_id', 'qty_expected', line->'qty_expected', 'qty_counted', line->'qty_counted', 'movement_ids', movement_ids));
  end loop;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', counted.id, 'counted_on', counted.counted_on, 'lines', result_lines));
end $$;

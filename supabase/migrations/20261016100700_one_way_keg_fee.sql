-- The one-way keg fee (docs/plans/lolev-orders.md task 6). A one-way keg
-- (a keg format whose SKU has no container source) charges no deposit; each
-- one shipped carries the brewery's flat fee instead, and that fee is never
-- refunded: create_credit_memo_impl credits only sku and keg_deposit lines.
alter type public.invoice_line_kind add value 'one_way_keg_fee';
alter table public.breweries add column one_way_keg_fee_cents int not null default 0
  check (one_way_keg_fee_cents >= 0);
-- The fee frozen at ship; null when the line is not a one-way keg or the fee is 0.
alter table public.order_lines add column one_way_fee_cents int
  check (one_way_fee_cents is null or one_way_fee_cents > 0);
-- The QuickBooks item the fee lines push to, cleared on a realm change like the deposit item.
alter table public.qbo_connections add column qbo_one_way_fee_item_id text;

-- A fee line names its order line and bills a positive count; the existing
-- check's `else true` already admits the new kind, so no new constraint.

-- Admin-only, replayable.
create function public.set_one_way_keg_fee(p_brewery uuid, p_fee_cents int, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_one_way_keg_fee', p_request_id,
    jsonb_build_object('fee_cents', p_fee_cents));
  if v_replay is not null then return v_replay; end if;
  update public.breweries set one_way_keg_fee_cents = p_fee_cents where id = p_brewery;
  return private.complete_command_request(p_request_id, jsonb_build_object('fee_cents', p_fee_cents));
end $$;
revoke all on function public.set_one_way_keg_fee(uuid, int, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_one_way_keg_fee(uuid, int, uuid) to authenticated;

-- Copied from: 20261015120000_null_safe_role_guards.sql (set_qbo_deposit_mapping); only the fee item column is new.
create function public.set_qbo_one_way_fee_mapping(p_brewery uuid, p_qbo_item_id text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  if nullif(btrim(p_qbo_item_id),'') is null then raise exception 'map the one-way keg fee item'; end if;
  perform 1 from public.qbo_connections where brewery_id=p_brewery and state='connected' for update;
  if not found then raise exception 'QuickBooks connection required'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_one_way_fee_mapping',p_request_id,
    jsonb_build_object('qboItemId',p_qbo_item_id));
  if v_replay is not null then return v_replay; end if;
  update public.qbo_connections set qbo_one_way_fee_item_id=btrim(p_qbo_item_id),updated_at=now() where brewery_id=p_brewery;
  v_result:=jsonb_build_object('qboItemId',btrim(p_qbo_item_id));
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.set_qbo_one_way_fee_mapping(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_qbo_one_way_fee_mapping(uuid, text, uuid) to authenticated;

-- Copied from: 20261016100600_export_destination.sql; only the one-way keg fee is new.
CREATE OR REPLACE FUNCTION private.ship_order_impl(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text, p_invoice_timing text DEFAULT 'now'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.orders; sp record; v_state text; v_country text; v_invoice uuid; v_shipment uuid;
  v_channel uuid; v_tax public.tax_treatment; v_sources jsonb; src record; v_line public.order_lines; v_available numeric; v_pool uuid; v_size public.keg_size;
  v_drain jsonb; v_warnings jsonb := '[]'::jsonb; v_shells jsonb := '[]'::jsonb; v_fee int;
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
  -- The one-way keg fee is frozen on each one-way keg line at ship, so a fee
  -- changed before confirm_delivery invoices it does not change the price.
  -- A one-way keg: a keg format with no container source (no shell to return).
  select nullif(one_way_keg_fee_cents, 0) into v_fee from public.breweries where id = o.brewery_id;
  update public.order_lines ol set one_way_fee_cents = case when o.kind = 'wholesale' then v_fee end
    from public.skus s join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
   where ol.order_id = p_order and s.id = ol.sku_id and s.brewery_id = o.brewery_id
     and f.package_type = 'keg' and s.container_source is null;
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

-- Copied from: 20261012120300_leave_delivery_for_later.sql; only the one-way keg fee is new.
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

-- Copied from: 20261016100500_customer_country_alias.sql; only the one-way keg fee is new.
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

-- Copied from: 20260910120847_deploy_current_schema.sql; only the one-way keg fee item reset is new.
CREATE OR REPLACE FUNCTION public.complete_qbo_oauth (
  p_intent          uuid,
  p_actor           uuid,
  p_realm_id        text,
  p_realm_label     text,
  p_access_token    text,
  p_refresh_token   text,
  p_received_at     timestamp with time zone,
  p_access_seconds  integer,
  p_refresh_seconds integer,
  p_hard_seconds    integer,
  p_granted_scopes  text[]                   DEFAULT NULL::text[]
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare i private.qbo_oauth_intents; v_id uuid:=private.new_uuid(); v_version bigint; v_scopes text[];
begin
 select * into i from private.qbo_oauth_intents where id=p_intent for update;
 if i.id is null or i.actor_id<>p_actor or i.exchange_state<>'exchanging' or not exists(select 1 from public.brewery_users u where u.brewery_id=i.brewery_id and u.user_id=p_actor and u.role='admin') then raise exception 'oauth state invalid'; end if;
 if p_granted_scopes is not null and not p_granted_scopes<@i.requested_scopes then raise exception 'oauth scopes invalid'; end if;
 v_scopes:=coalesce(p_granted_scopes,i.requested_scopes);
 perform 1 from private.integration_tokens where brewery_id=i.brewery_id and provider='qbo' for update;
 insert into public.qbo_connections(id,brewery_id,realm_id,realm_label,state,access_expires_at,refresh_expires_at,refresh_hard_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
 values(v_id,i.brewery_id,p_realm_id,p_realm_label,'connected',p_received_at+make_interval(secs=>p_access_seconds),case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,case when p_hard_seconds is null then null else p_received_at+make_interval(secs=>p_hard_seconds) end,'not_requested',null,1,p_actor,now(),v_scopes)
 on conflict(brewery_id) do update set id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.id else excluded.id end,realm_id=excluded.realm_id,realm_label=excluded.realm_label,state='connected',access_expires_at=excluded.access_expires_at,refresh_expires_at=excluded.refresh_expires_at,refresh_hard_expires_at=excluded.refresh_hard_expires_at,remote_revocation_state='not_requested',last_error=null,
   qbo_deposit_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_deposit_item_id end,
   qbo_one_way_fee_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_one_way_fee_item_id end,
   granted_scopes=excluded.granted_scopes,credential_version=qbo_connections.credential_version+1,connected_by=p_actor,updated_at=now()
 returning id,credential_version into v_id,v_version;
 insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
 values(i.brewery_id,'qbo',v_id,p_access_token,p_refresh_token,v_version)
 on conflict(brewery_id,provider) do update set connection_id=excluded.connection_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
 update private.qbo_oauth_intents set exchange_state='completed' where id=i.id;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(i.brewery_id,v_id,'connected'); return v_id;
end $function$;

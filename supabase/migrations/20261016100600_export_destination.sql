-- Export removals name a destination country (docs/plans/lolev-orders.md,
-- task 4). A sale removal to a US state keeps dest_state. A sale removal
-- outside the US names dest_country instead, and only an export may: a
-- taxpaid removal is always to a US state. The compliance removals total
-- already files these under export (generate_compliance_report keys sale
-- removals by tax_treatment), so it is unchanged. The destination-state facts
-- leave them out: they have no state, and would otherwise read Unassigned.

alter table public.inventory_movements add column dest_country text
  check (dest_country is null or dest_country ~ '^[A-Z]{2}$');
comment on column public.inventory_movements.dest_country is
  'ISO 3166-1 alpha-2 destination of an export sale removal outside the US; dest_state is then null.';

-- Copied from: 00001_baseline.sql (never altered); only the country is new.
-- A sale removal names exactly one of a state and a country, a country only
-- under export, and no other movement names a country. Every other branch is
-- unchanged.
alter table public.inventory_movements drop constraint removal_shape;
alter table public.inventory_movements add constraint removal_shape check (
  (dest_country is null or type = 'sale_removal') and
  case type
    when 'sale_removal' then qty < 0 and sale_channel_id is not null and tax_treatment is not null
      and num_nonnulls(dest_state, dest_country) = 1 and (dest_country is null or tax_treatment = 'export')
    when 'depletion'    then (qty < 0 or compensates_id is not null) and sale_channel_id is not null and dest_state is null and tax_treatment is not null
    when 'destruction'      then qty < 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'loss'             then (qty < 0 or compensates_id is not null) and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'sample'           then qty < 0 and dest_state is not null
    when 'festival_removal' then qty < 0 and dest_state is not null
    when 'opening_balance'  then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'production_in'    then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'return_in'        then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'adjustment'       then sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'taproom_transfer' then sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'location_transfer' then sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'repack'           then sale_channel_id is null and dest_state is null and tax_treatment is null
    else true
  end);

-- A wholesale ship reads the ship-to's country. US: dest_state, as before.
-- Anywhere else: dest_country, refused unless the frozen treatment is export.
-- Copied from: 20261016100200_pickup_orders.sql; only the destination country is new.
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

-- Facts are by US state, so an export to a country has none. The movement
-- branch already drops a removal with no state; it now also drops a return or
-- adjustment of one (they read the original's state, and would fall to
-- Unassigned). The invoice-line branch drops lines whose shipment's removals
-- name a country. create or replace keeps the function's grants.
-- Copied from: 20260928236000_destination_state_facts_on_ledger.sql; only the
-- dest_country exclusions are new.
create or replace function private.destination_state_facts(p_brewery uuid, p_start date, p_end date)
returns table(state text, kind text, event_date date, source_id uuid, original_source_id uuid,
  volume_bbl numeric, sales_cents bigint, source_status text, tax_treatment text)
language sql stable security definer set search_path = '' as $$
  with r as materialized (select * from private.report_movements(p_brewery, p_end)),
  shipped_state as (
    select ref as order_id, sku_id, case when count(distinct dest_state) = 1 then min(dest_state) end as state,
      bool_or(dest_country is not null) as has_country
    from public.inventory_movements
    where brewery_id = p_brewery and type = 'sale_removal' and ref is not null
    group by ref, sku_id)
  select coalesce(m.dest_state, original.dest_state, 'Unassigned'), m.type::text, m.d, m.id, m.original_id,
    -m.bbl, 0::bigint, 'posted'::text, m.tax_treatment::text
  from r m left join r original on original.id = m.original_id
  where m.d >= p_start
    and (m.dest_state is not null or m.type in ('return_in', 'adjustment') or original.dest_state is not null)
    -- a return or adjustment of an export to a country has no state to fall to
    and not exists (select 1 from public.inventory_movements exported
                     where exported.id = m.original_id and exported.dest_country is not null)
  union all
  select a.dest_state, 'cellar_' || a.removal_class, a.d, a.id, null::uuid, -a.bbl, 0::bigint, 'posted'::text, a.tax_treatment
  from private.report_cellar_removals(p_brewery, p_start, p_end) a
  where a.dest_state is not null
  union all
  select coalesce(destination.state, 'Unassigned'), i.kind::text, i.issued_on,
    line.id, line.credited_invoice_line_id, 0::numeric,
    case when i.qbo_remote_state = 'live' then line.amount_cents::bigint else 0::bigint end,
    i.qbo_remote_state::text, null::text
  from public.invoice_lines line join public.invoices i on i.id = line.invoice_id and i.brewery_id = line.brewery_id
  left join public.invoice_lines original_line on original_line.id = line.credited_invoice_line_id and original_line.brewery_id = line.brewery_id
  left join public.invoices original_invoice on original_invoice.id = original_line.invoice_id and original_invoice.brewery_id = line.brewery_id
  left join public.shipments shipment on shipment.id = coalesce(i.shipment_id, original_invoice.shipment_id) and shipment.brewery_id = i.brewery_id
  left join shipped_state destination on destination.order_id = shipment.order_id and destination.sku_id = line.sku_id
  where i.brewery_id = p_brewery and i.issued_on between p_start and p_end and line.kind = 'sku'
    -- an invoice or credit line for a shipment out of the US has no state
    and not coalesce(destination.has_country, false);
$$;

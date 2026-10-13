-- #815: automatic shipment/full-beer-return shell events and persisted shortage warnings.
-- Bodies copy their newest committed owners; manual event checks and public
-- request hashes remain unchanged. Inventory lock precedes the shell lock.

-- Full kegs returned with beer also return their shell. The two beer-return
-- callers already cap quantities against original shipment movements. Historical
-- shipments with no automatic Shipped event post no shell return; deposit-only
-- refunds never call this helper. Manual Returned/Lost reconciliation may have
-- already changed the customer balance: do not block the beer credit for that.
create function private.return_keg_shells(p_shipment uuid,p_sku uuid,p_qty numeric,p_location uuid,p_bin uuid)
returns void language plpgsql set search_path = '' as $$
declare v_pool uuid; v_size public.keg_size; v_brewery uuid; v_customer uuid;
begin
  if p_shipment is null then return; end if;
  -- Physical ownership is frozen at shipment, independently of deposit charges.
  -- Buyer order-event projections exclude payload, so this map stays internal.
  select sh.brewery_id,o.customer_id,(shell->>'pool_id')::uuid,(shell->>'keg_size')::public.keg_size
    into v_brewery,v_customer,v_pool,v_size
    from public.shipments sh join public.orders o on o.id=sh.order_id and o.brewery_id=sh.brewery_id
    join public.order_events event on event.order_id=sh.order_id and event.brewery_id=sh.brewery_id and event.event='shipped'
    cross join lateral jsonb_array_elements(coalesce(event.payload->'keg_shells','[]'::jsonb)) shell
    where sh.id=p_shipment and (shell->>'sku_id')::uuid=p_sku;
  -- A legacy shipment has no keg_shells snapshot and never put shells on this
  -- customer: skip before checking whole-keg quantities so its historical
  -- fractional beer returns stay valid. ship_order_impl snapshots a line only
  -- where it also posted that line's Shipped events.
  if v_pool is null then return; end if;
  if p_qty<>trunc(p_qty) then raise exception 'returnable kegs return in whole kegs'; end if;
  insert into public.keg_events(brewery_id,pool_id,keg_size,location_id,bin_id,qty,reason,customer_id,shipment_id,note,created_by)
    values(v_brewery,v_pool,v_size,p_location,p_bin,p_qty::integer,'returned',v_customer,p_shipment,'returned with beer',auth.uid());
end $$;
revoke all on function private.return_keg_shells(uuid,uuid,numeric,uuid,uuid) from public,anon,authenticated,service_role;

-- What each bin at one location holds of every keg pool and size, in one
-- grouped scan of keg_events. Same reason-to-sign arithmetic as
-- private.bin_stock_on_hand and public.keg_bin_on_hand_rows; change all three
-- together. Callers hold the keg_events lock.
create function private.keg_location_bins(p_brewery uuid,p_location uuid)
returns table(pool_id uuid,keg_size public.keg_size,bin_id uuid,bin_name text,qty integer)
language sql stable set search_path = '' as $$
  select e.pool_id,e.keg_size,e.bin_id,bn.name,
         sum(case e.reason when 'acquired' then e.qty when 'found' then e.qty when 'transferred_in' then e.qty when 'returned' then e.qty
                           when 'retired' then -e.qty when 'transferred_out' then -e.qty when 'shipped' then -e.qty
                           when 'lost' then case when e.customer_id is null then -e.qty else 0 end
                           else 0 end)::integer
  from public.keg_events e join public.bins bn on bn.id=e.bin_id and bn.brewery_id=e.brewery_id
  where e.brewery_id=p_brewery and e.location_id=p_location
  group by 1,2,3,4;
$$;
revoke all on function private.keg_location_bins(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ship_order_impl(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text, p_invoice_timing text DEFAULT 'now'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.orders; sp record; v_state text; v_invoice uuid; v_shipment uuid;
  v_channel uuid; v_tax public.tax_treatment; v_sources jsonb; src record; v_line public.order_lines; v_available numeric; v_pool uuid; v_size public.keg_size;
  v_drain jsonb; v_warnings jsonb := '[]'::jsonb; v_shells jsonb := '[]'::jsonb;
begin
  o := private.lock_order(p_order, array['picked']::public.order_status[]);
  if o.needs_restock then raise exception 'order is waiting for restock'; end if;
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
    select state into v_state from public.ship_tos where id = o.ship_to_id;
    -- One lookup for the whole shipment: the channel a wholesale ship removes
    -- under, and the tax treatment frozen onto every movement it writes
    -- (customer override -> channel default, §16.3).
    -- orders.sale_channel_id is not null and FK-backed, so no null guard here.
    select o.sale_channel_id, coalesce(c.tax_treatment, sc.tax_treatment)
      into v_channel, v_tax
      from public.sale_channels sc
      left join public.customers c on c.id = o.customer_id
     where sc.id = o.sale_channel_id;
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
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, ref, created_by)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric,
          'sale_removal', v_channel, v_tax, v_state, p_order, auth.uid() from jsonb_array_elements(v_sources) e;
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

create or replace function private.create_credit_memo_impl(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_cm uuid; v_order uuid; cl record; v_orig_qty numeric; v_already_credited numeric; v_sources jsonb; src record; v_original public.inventory_movements; v_sku uuid; v_line public.invoice_lines;
begin
  -- for update: concurrent memos against one invoice serialize here, so the
  -- over-credit guard below always sees the other memo's lines.
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'can only credit an invoice'; end if;
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

create or replace function public.check_in_refused_return(p_delivery uuid,p_location uuid,p_lines jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.deliveries; sh public.shipments; ol public.order_lines; m public.inventory_movements;
  v_replay jsonb; l jsonb; s jsonb; v_qty numeric; v_remaining numeric; v_return uuid; v_ids uuid[] := '{}';
begin
  select * into d from public.deliveries where id=p_delivery;
  perform private.assert_staff(d.brewery_id,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(d.brewery_id,'check_in_refused_return',p_request_id,jsonb_build_object('delivery',p_delivery,'location',p_location,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  select * into d from public.deliveries where id=p_delivery for update;
  select * into sh from public.shipments where id=d.shipment_id;
  if sh.id is null or sh.invoice_timing<>'on_delivery' then raise exception 'use Return and credit for an invoice-now shipment'; end if;
  if d.outcome is null or d.outcome='delivered' then raise exception 'stop has no refused beer'; end if;
  -- The order key is unchanged; allow the accepted return's order-event FK.
  perform 1 from public.orders where id=sh.order_id for no key update;
  -- Accepted-unit credits lock the invoice too; both return paths must serialize
  -- before the shared source movement cap and frozen-volume rounding are read.
  perform 1 from public.invoices where shipment_id=sh.id and kind='invoice' for update;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'return lines are required'; end if;
  if not exists(select 1 from public.locations where id=p_location and brewery_id=d.brewery_id) then raise exception 'location not found'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into ol from public.order_lines where id=(l->>'order_line_id')::uuid and order_id=sh.order_id for update;
    if not found then raise exception 'order line not found'; end if;
    if jsonb_typeof(l->'sources') is distinct from 'array' or jsonb_array_length(l->'sources')=0 then raise exception 'return sources are required'; end if;
    select coalesce(max(outstanding_qty),0) into v_remaining from public.refused_delivery_returns where delivery_id=d.id and order_line_id=ol.id;
    for s in select * from jsonb_array_elements(l->'sources') loop
      select * into m from public.inventory_movements where id=(s->>'movement_id')::uuid and brewery_id=d.brewery_id and ref=sh.order_id and sku_id=ol.sku_id and type='sale_removal' for update;
      if not found then raise exception 'shipped source not found'; end if;
      v_qty := (s->>'qty')::numeric;
      if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'invalid return quantity'; end if;
      if v_qty>v_remaining then raise exception 'return exceeds outstanding refused quantity'; end if;
      v_remaining := v_remaining-v_qty;
      if not exists(select 1 from public.bins where id=(s->>'bin_id')::uuid and location_id=p_location and brewery_id=d.brewery_id) then raise exception 'return bin not found at location'; end if;
      insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,source_movement_id,qty,type,ref,note,created_by)
        values(d.brewery_id,m.sku_id,p_location,(s->>'bin_id')::uuid,m.lot_id,m.id,v_qty,'return_in',d.id,'refused delivery check-in',auth.uid()) returning id into v_return;
      perform private.return_keg_shells(sh.id,m.sku_id,v_qty,p_location,(s->>'bin_id')::uuid);
      v_ids := array_append(v_ids,v_return);
      if coalesce((s->>'damaged')::boolean,false) then
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,source_movement_id,qty,type,ref,note,created_by)
          values(d.brewery_id,m.sku_id,p_location,(s->>'bin_id')::uuid,m.lot_id,v_return,-v_qty,'loss',d.id,'damaged refused return',auth.uid());
      end if;
    end loop;
  end loop;
  return private.complete_command_request(p_request_id,jsonb_build_object('delivery_id',d.id,'movement_ids',v_ids));
end $$;

-- Keg fleet's reconciliation flags: every pool, size and location whose bins
-- net below zero. Built on keg_bin_on_hand, so the caller's staff scope
-- applies and the arithmetic matches private.keg_location_bins.
create view public.keg_location_shortages with (security_invoker = true) as
  select h.brewery_id,h.pool_id,p.name pool,h.keg_size,h.location_id,l.name location,(-sum(h.qty))::integer short
    from public.keg_bin_on_hand h
    join public.keg_pools p on p.id=h.pool_id and p.brewery_id=h.brewery_id
    join public.locations l on l.id=h.location_id and l.brewery_id=h.brewery_id
   group by h.brewery_id,h.pool_id,p.name,h.keg_size,h.location_id,l.name
  having sum(h.qty)<0;
grant select on public.keg_location_shortages to authenticated;

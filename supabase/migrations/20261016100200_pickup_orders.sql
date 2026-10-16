-- Pickup orders (docs/plans/lolev-orders.md, task 5). A pickup order is
-- collected at the brewery, so it is never put on a delivery route. It still
-- names a ship-to, which stays its destination for TTB.
--
-- create_order and update_draft_order take a trailing defaulted p_pickup, so
-- every positional caller stays valid. The key joins a request's claim payload
-- only when it is set, so requests completed before this keep their hash.
-- Only staff mark a pickup. portal_create_order and portal_submit_quote call
-- create_order_impl positionally and get the default; a buyer passing
-- p_pickup to update_draft_order is refused.

alter table public.orders add column pickup boolean not null default false;
-- A taproom transfer moves stock between locations; only a sale is collected.
alter table public.orders add constraint orders_pickup_wholesale check (not pickup or kind = 'wholesale');

-- Copied from: 20260925093817_transfer_distinct_locations.sql; only pickup is new.
drop function private.create_order_impl(uuid, public.order_kind, uuid, uuid, uuid, uuid, date, text, text, jsonb);
create function private.create_order_impl(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb,
  p_pickup boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare v_order uuid; v_channel uuid; l record;
begin
  perform private.assert_order_lines(p_lines);
  if p_kind = 'taproom_transfer' and p_from_location = p_to_location then
    raise exception 'A transfer needs a different source and destination location.';
  end if;
  if p_kind = 'wholesale' then
    select sale_channel_id into v_channel from public.customers where id = p_customer and brewery_id = p_brewery;
    if v_channel is null then raise exception 'customer not found'; end if;
  else
    -- a transfer has no customer: the seeded taproom system_code, else the first by name
    select id into v_channel from public.sale_channels where brewery_id = p_brewery
      order by (system_code = 'taproom') desc, name limit 1;
  end if;
  insert into public.orders (brewery_id, kind, customer_id, ship_to_id, from_location_id, to_location_id,
                             sale_channel_id, requested_ship_date, po_number, note, created_by, pickup)
  values (p_brewery, p_kind, p_customer, p_ship_to, p_from_location, p_to_location,
          v_channel, p_requested, p_po, p_note, auth.uid(), coalesce(p_pickup, false))
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (p_brewery, v_order, l.sku_id, l.qty,
            case when p_kind = 'wholesale' then private.order_line_price(p_brewery, v_channel, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;
revoke all on function private.create_order_impl(uuid, public.order_kind, uuid, uuid, uuid, uuid, date, text, text, jsonb, boolean) from public, anon, authenticated, service_role;

-- Copied from: 00001_baseline.sql; only pickup is new. A null keeps the saved value.
drop function private.update_draft_order_impl(uuid, uuid, date, text, text, jsonb);
create function private.update_draft_order_impl(
  p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb,
  p_pickup boolean default null
) returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l record;
begin
  perform private.assert_order_lines(p_lines);
  o := private.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set ship_to_id = coalesce(p_ship_to, ship_to_id),
    requested_ship_date = coalesce(p_requested, requested_ship_date),
    po_number = coalesce(p_po, po_number), note = coalesce(p_note, note),
    pickup = coalesce(p_pickup, pickup)
    where id = p_order;
  delete from public.order_lines where order_id = p_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then private.order_line_price(o.brewery_id, o.sale_channel_id, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'updated', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', p_order);
end $$;
revoke all on function private.update_draft_order_impl(uuid, uuid, date, text, text, jsonb, boolean) from public, anon, authenticated, service_role;

-- Copied from: 00001_baseline.sql; only pickup is new.
drop function public.create_order(uuid, public.order_kind, uuid, uuid, uuid, uuid, date, text, text, jsonb, uuid);
create function public.create_order(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text,
  p_lines jsonb, p_request_id uuid, p_pickup boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_location_brewery uuid; v_payload jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  select brewery_id into v_location_brewery from public.locations where id = p_from_location;
  if v_location_brewery is null or v_location_brewery <> p_brewery then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object('brewery',p_brewery,'kind',p_kind,'customer',p_customer,'ship_to',p_ship_to,'from',p_from_location,'to',p_to_location,'requested',p_requested,'po',p_po,'note',p_note,'lines',p_lines);
  -- Requests completed before pickup existed keep their original hash.
  if p_pickup then v_payload := v_payload || jsonb_build_object('pickup', true); end if;
  v_replay := private.claim_command_request(p_brewery, 'create_order', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  v_result := private.create_order_impl(p_brewery,p_kind,p_customer,p_ship_to,p_from_location,p_to_location,p_requested,p_po,p_note,p_lines,p_pickup);
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.create_order(uuid, public.order_kind, uuid, uuid, uuid, uuid, date, text, text, jsonb, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.create_order(uuid, public.order_kind, uuid, uuid, uuid, uuid, date, text, text, jsonb, uuid, boolean) to authenticated;

-- Copied from: 20260913110000_hosted_schema_catchup.sql; only pickup is new.
drop function public.update_draft_order(uuid, uuid, date, text, text, jsonb, uuid, boolean, uuid, uuid);
CREATE FUNCTION public.update_draft_order (
  p_order             uuid,
  p_ship_to           uuid,
  p_requested         date,
  p_po                text,
  p_note              text,
  p_lines             jsonb,
  p_request_id        uuid,
  p_clear_requested   boolean DEFAULT false,
  p_expected_brewery  uuid    DEFAULT NULL::uuid,
  p_expected_customer uuid    DEFAULT NULL::uuid,
  p_pickup            boolean DEFAULT NULL::boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_brewery uuid; v_customer uuid; v_replay jsonb; v_result jsonb; v_is_staff boolean; v_payload jsonb;
begin
  select o.brewery_id, o.customer_id,
    exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.role = any(array['admin','sales']::public.staff_role[])
    )
    into v_brewery, v_customer, v_is_staff
  from public.orders o
  where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    and (
      exists (
        select 1 from public.brewery_users bu
        where bu.brewery_id = o.brewery_id
          and bu.user_id = auth.uid()
          and bu.role = any(array['admin','sales']::public.staff_role[])
      )
      or exists (
        select 1 from public.customer_users cu
        where cu.customer_id = o.customer_id and cu.user_id = auth.uid()
      )
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  -- The portal adapter supplies p_expected_customer. A customer calling this
  -- RPC directly cannot omit that argument to bypass whole-unit validation;
  -- an authorized staff call keeps its fractional-quantity contract even when
  -- the same user also belongs to the order's customer account.
  if p_expected_customer is not null or not v_is_staff then
    perform private.assert_portal_order_lines(p_lines);
    -- Buyers supply only ship-to, PO, note and lines; staff mark a pickup.
    if p_pickup is not null then raise exception 'permission denied' using errcode = '42501'; end if;
  end if;
  v_payload := jsonb_build_object('order',p_order,'ship_to',p_ship_to,'requested',p_requested,'po',p_po,'note',p_note,'lines',p_lines,'clear_requested',p_clear_requested,'expected_brewery',p_expected_brewery,'expected_customer',p_expected_customer);
  -- Requests completed before pickup existed keep their original hash.
  if p_pickup is not null then v_payload := v_payload || jsonb_build_object('pickup', p_pickup); end if;
  v_replay := private.claim_command_request(v_brewery,'update_draft_order',p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  -- Keep the shared claim-before-order-lock ordering. The first scope check
  -- rejects a wrong active account without claiming; this locked check prevents
  -- target scope changing between that read and the transactional write.
  perform 1 from public.orders o where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    for update of o;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  v_result := private.update_draft_order_impl(p_order,p_ship_to,p_requested,p_po,p_note,p_lines,p_pickup);
  if p_clear_requested then update public.orders set requested_ship_date = null where id = p_order; end if;
  return private.complete_command_request(p_request_id,v_result);
end $function$;
revoke all on function public.update_draft_order(uuid, uuid, date, text, text, jsonb, uuid, boolean, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.update_draft_order(uuid, uuid, date, text, text, jsonb, uuid, boolean, uuid, uuid, boolean) to authenticated;

-- Copied from: 00001_baseline.sql; only the pickup refusal is new.
create or replace function private.save_route_impl(
  p_brewery uuid, p_id uuid, p_name text, p_delivery_date date, p_driver uuid, p_vehicle text, p_note text, p_stops jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_id uuid := p_id; r public.routes; s jsonb; v_ship uuid; v_tr uuid; v_doc uuid; v_route uuid; v_seen uuid[] := '{}'; v_no int; v_seen_no int[] := '{}';
begin
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then raise exception 'a route needs at least one stop'; end if;
  if p_driver is not null and not exists (
    select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_driver and role in ('admin','warehouse')
  ) then raise exception 'driver must be a warehouse or admin member'; end if;
  if v_id is null then
    insert into public.routes (brewery_id, name, delivery_date, driver_user_id, vehicle, note)
    values (p_brewery, nullif(trim(p_name), ''), p_delivery_date, p_driver, nullif(trim(p_vehicle), ''), nullif(trim(p_note), ''))
    returning id into v_id;
  else
    select * into r from public.routes where id = v_id and brewery_id = p_brewery for update;
    if not found then raise exception 'route not found'; end if;
    -- ponytail: a departed route is frozen, so a refused stop blocks the return until it is delivered; a per-stop
    -- "leave for a later route" verb on the run page is the upgrade path
    if r.departed_at is not null then raise exception 'route has departed'; end if;
    update public.routes set name = nullif(trim(p_name), ''), delivery_date = p_delivery_date, driver_user_id = p_driver,
      vehicle = nullif(trim(p_vehicle), ''), note = nullif(trim(p_note), '') where id = v_id;
  end if;
  for s in select * from jsonb_array_elements(p_stops) loop
    v_ship := (s->>'shipment_id')::uuid; v_tr := (s->>'stock_transfer_id')::uuid; v_doc := coalesce(v_ship, v_tr);
    if num_nonnulls(v_ship, v_tr) <> 1 then raise exception 'a stop is one shipment or one stock transfer'; end if;
    if v_doc = any(v_seen) then raise exception 'the same document is listed twice'; end if;
    v_seen := v_seen || v_doc;
    v_no := (s->>'stop_no')::int;
    if v_no is null or v_no < 1 then raise exception 'stop number must be positive'; end if;
    if v_no = any(v_seen_no) then raise exception 'stop number % is used twice', v_no; end if;
    v_seen_no := v_seen_no || v_no;
    -- the brewery check comes first so a foreign id learns nothing about where it sits
    if v_ship is not null and not exists (select 1 from public.shipments where id = v_ship and brewery_id = p_brewery) then raise exception 'shipment not found'; end if;
    if v_ship is not null and exists (
      select 1 from public.shipments sh join public.orders o on o.id = sh.order_id and o.brewery_id = sh.brewery_id
      where sh.id = v_ship and o.pickup
    ) then raise exception 'a pickup order is not delivered on a route'; end if;
    if v_tr is not null and not exists (
      select 1 from public.stock_transfers where id = v_tr and brewery_id = p_brewery and status in ('picked','in_transit')
    ) then raise exception 'transfer must be picked before it can be delivered'; end if;
    select d.route_id into v_route from public.deliveries d where d.brewery_id = p_brewery and coalesce(d.shipment_id, d.stock_transfer_id) = v_doc;
    if v_route is not null and v_route <> v_id then raise exception 'document is already on route %', v_route; end if;
  end loop;
  -- delivered stops stay; replace the rest
  if exists (
    select 1 from public.deliveries d where d.route_id = v_id and d.delivered_at is not null
      and not (coalesce(d.shipment_id, d.stock_transfer_id) = any(v_seen))
  ) then raise exception 'a delivered stop cannot be removed'; end if;
  -- kept stops keep their id: Today rows, chat subjects and open Confirm pages point at it
  delete from public.deliveries where route_id = v_id and delivered_at is null and not (coalesce(shipment_id, stock_transfer_id) = any(v_seen));
  -- two passes so renumbering never collides with a kept stop
  update public.deliveries set stop_no = -stop_no where route_id = v_id;
  for s in select * from jsonb_array_elements(p_stops) loop
    v_ship := (s->>'shipment_id')::uuid; v_tr := (s->>'stock_transfer_id')::uuid;
    update public.deliveries set stop_no = (s->>'stop_no')::int where route_id = v_id and coalesce(shipment_id, stock_transfer_id) = coalesce(v_ship, v_tr);
    if not found then
      insert into public.deliveries (brewery_id, route_id, shipment_id, stock_transfer_id, stop_no)
      values (p_brewery, v_id, v_ship, v_tr, (s->>'stop_no')::int);
    end if;
  end loop;
  return jsonb_build_object('routeId', v_id);
end $$;

-- Copied from: 20261012110100_adjust_after_pick_repicks.sql; only the pickup check is new.
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

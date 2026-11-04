-- #1628: ledger writers lock per brewery instead of locking whole tables.
--
-- Before: sixteen stock writers ran `lock table <ledger> in share row exclusive
-- mode`. That serialized every brewery's writes behind one another, and it
-- conflicts with autovacuum, which yields only after deadlock_timeout (1 s).
--
-- After: the same conflict pattern, scoped to one brewery and one ledger table,
-- on advisory locks (which autovacuum never takes):
--   * private.lock_ledger takes the EXCLUSIVE lock. A writer that reads a
--     balance and then writes against it calls it first, as it took the table
--     lock before.
--   * the ledger_write_lock trigger takes the SHARED lock on every row written.
--     So a plain insert still waits for a balance check in progress, and the
--     check still waits for plain inserts in flight, exactly as SHARE ROW
--     EXCLUSIVE conflicted with ROW EXCLUSIVE, but only within one brewery.
-- A session never conflicts with its own advisory locks, so a locked writer's
-- own inserts pass the trigger.
-- Packaging close, material counts and receipt corrections still take NOWAIT
-- table locks through private.lock_tables_or_busy. lock_ledger also takes ROW
-- EXCLUSIVE on the table, which conflicts with those, so they still serialize
-- with every balance-checked writer.
--
-- ponytail: one key per brewery and table; per-stock-key locks if one
-- brewery's write throughput outgrows it.

create function private.lock_ledger(p_brewery uuid, p_table text) returns void
language plpgsql set search_path = '' as $$
begin
  -- A null brewery would skip the lock silently; every caller has read its row by now.
  if p_brewery is null then raise exception 'ledger lock needs a brewery'; end if;
  -- The lock every insert takes anyway, taken before the balance read: it still
  -- conflicts with the NOWAIT table locks private.lock_tables_or_busy takes.
  -- It comes first, so a writer waiting on such a table locker holds no
  -- advisory lock that the locker's own inserts would then wait on (deadlock).
  execute pg_catalog.format('lock table public.%I in row exclusive mode', p_table);
  -- Same key as private.ledger_write_lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ledger:' || p_table || ':' || p_brewery::text, 0));
end $$;

create function private.ledger_write_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Same key as private.lock_ledger; inlined so the trigger calls nothing in
  -- private as the writing role.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('ledger:' || tg_table_name || ':'
    || (case when tg_op = 'DELETE' then old.brewery_id else new.brewery_id end)::text, 0));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

revoke all on function private.lock_ledger(uuid, text), private.ledger_write_lock() from public, anon, authenticated, service_role;

-- Row triggers fire in name order; the a_ prefix runs this one first, so the
-- lock comes before any other trigger reads the ledger (as the table lock did).

create trigger a_ledger_write_lock before insert or update or delete on public.inventory_movements
  for each row execute function private.ledger_write_lock();
create trigger a_ledger_write_lock before insert or update or delete on public.material_movements
  for each row execute function private.ledger_write_lock();
create trigger a_ledger_write_lock before insert or update or delete on public.keg_events
  for each row execute function private.ledger_write_lock();

-- private.append_brew_actuals(p_record uuid, p_actuals jsonb, p_confirm_empty boolean): 1 table lock(s) -> brewery lock on r.brewery_id
CREATE OR REPLACE FUNCTION private.append_brew_actuals(p_record uuid, p_actuals jsonb, p_confirm_empty boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.brew_records; a jsonb; m public.materials; bucket record; available numeric; movement uuid;
  qty numeric; lot_code text; location_name text; bin_name text;
begin
  select * into r from public.brew_records where id=p_record;
  if jsonb_typeof(p_actuals) is distinct from 'array' then raise exception 'confirm actual ingredients, including an explicit empty list'; end if;
  if jsonb_array_length(p_actuals)=0 and not coalesce(p_confirm_empty,false) then raise exception 'confirm that no ingredients were used'; end if;
  -- Metadata precedes the ledger lock, as it does in receipt writers.
  perform 1 from public.materials where id in (select (e->>'material_id')::uuid from jsonb_array_elements(p_actuals) e) order by id for key share;
  perform 1 from public.material_lots where id in (select (e->>'lot_id')::uuid from jsonb_array_elements(p_actuals) e) order by id for key share;
  perform private.lock_ledger(r.brewery_id, 'material_movements');
  for a in select * from jsonb_array_elements(p_actuals) loop
    qty := (a->>'qty')::numeric;
    if qty is null or qty<=0 or qty::text in ('NaN','Infinity','-Infinity') or qty<>round(qty,4) then raise exception 'actual material quantity must be positive with at most four decimals'; end if;
    select * into m from public.materials where id=(a->>'material_id')::uuid and brewery_id=r.brewery_id;
    if m.id is null then raise exception 'material not found'; end if;
    if m.lot_tracked <> ((a->>'lot_id') is not null) then raise exception 'choose a lot exactly when the material is lot-tracked'; end if;
    if a->>'recipe_ingredient_id' is not null and not exists(select 1 from public.recipe_ingredients where id=(a->>'recipe_ingredient_id')::uuid and recipe_version_id=r.recipe_version_id and brewery_id=r.brewery_id) then raise exception 'ingredient is not in the pinned recipe'; end if;
    if a->>'stage' is null then raise exception 'actual ingredient stage required'; end if;
    perform (a->>'stage')::public.ingredient_stage;
    if not exists(select 1 from public.bins where id=(a->>'bin_id')::uuid and location_id=(a->>'location_id')::uuid and brewery_id=r.brewery_id) then raise exception 'material source bin not found'; end if;
    if a->>'lot_id' is not null and not exists(select 1 from public.material_lots where id=(a->>'lot_id')::uuid and material_id=m.id and brewery_id=r.brewery_id) then raise exception 'material source lot not found'; end if;
  end loop;
  -- UUID casts aggregate aliases of the same bucket before spending stock.
  for bucket in select (e->>'material_id')::uuid material_id,(e->>'location_id')::uuid location_id,
      (e->>'bin_id')::uuid bin_id,(e->>'lot_id')::uuid lot_id,sum((e->>'qty')::numeric) qty
    from jsonb_array_elements(p_actuals) e group by 1,2,3,4
  loop
    select coalesce(sum(mm.qty),0) into available from public.material_movements mm
      where mm.brewery_id=r.brewery_id and mm.material_id=bucket.material_id and mm.location_id=bucket.location_id
        and mm.bin_id=bucket.bin_id and mm.lot_id is not distinct from bucket.lot_id;
    if bucket.qty>available then raise exception 'insufficient actual material stock: % available',available; end if;
  end loop;
  for a in select * from jsonb_array_elements(p_actuals) loop
    select * into m from public.materials where id=(a->>'material_id')::uuid;
    select l.lot_code into lot_code from public.material_lots l where l.id=(a->>'lot_id')::uuid;
    select l.name into location_name from public.locations l where l.id=(a->>'location_id')::uuid;
    select b.name into bin_name from public.bins b where b.id=(a->>'bin_id')::uuid;
    qty := (a->>'qty')::numeric;
    insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,note,created_by)
      values(r.brewery_id,m.id,(a->>'location_id')::uuid,(a->>'bin_id')::uuid,(a->>'lot_id')::uuid,-qty,'consumption','confirmed brew actual',auth.uid()) returning id into movement;
    insert into public.batch_additions(brewery_id,batch_id,occupancy_id,recipe_ingredient_id,stage,movement_id,brew_record_id,material_name,unit,confirmed_qty,lot_code,location_name,bin_name)
      values(r.brewery_id,r.batch_id,r.occupancy_id,(a->>'recipe_ingredient_id')::uuid,(a->>'stage')::public.ingredient_stage,movement,r.id,m.name,m.base_uom::text,qty,lot_code,location_name,bin_name);
  end loop;
end $function$;

-- private.receive_stock_transfer_impl(p_transfer uuid, p_lines jsonb): 3 table lock(s) -> brewery lock on t.brewery_id
CREATE OR REPLACE FUNCTION private.receive_stock_transfer_impl(p_transfer uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.stock_transfers; l public.stock_transfer_lines; rq record; v_qty numeric; v_sources jsonb; src record;
begin
  t := private.lock_transfer(p_transfer, array['picked','in_transit']::public.stock_transfer_status[]);
  perform private.lock_ledger(t.brewery_id, 'inventory_movements');
  perform private.lock_ledger(t.brewery_id, 'material_movements');
  perform private.lock_ledger(t.brewery_id, 'keg_events');
  if jsonb_typeof(p_lines) is distinct from 'array' or exists (select 1 from jsonb_array_elements(p_lines) e where not exists (select 1 from public.stock_transfer_lines where id = (e->>'line_id')::uuid and transfer_id = p_transfer))
     or (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then raise exception 'invalid transfer line coverage'; end if;
  for l in select * from public.stock_transfer_lines where transfer_id = p_transfer loop
    select (e->>'qty')::numeric into v_qty from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e->>'line_id')::uuid = l.id;
    v_qty := coalesce(v_qty, l.qty_picked, l.qty);
    if l.keg_pool_id is not null and v_qty <> trunc(v_qty) then raise exception 'empty kegs must be whole units'; end if;
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty < 0 or v_qty > least(l.qty,coalesce(l.qty_picked,l.qty)) then raise exception 'invalid received quantity'; end if;
    if l.material_id is not null and v_qty <> round(v_qty,4) then raise exception 'material quantities require at most four decimals'; end if;
    if l.sku_id is not null and v_qty <> round(v_qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
    select e->'sources' into v_sources from jsonb_array_elements(p_lines) e where (e->>'line_id')::uuid = l.id;
    v_sources := coalesce(v_sources, case when v_qty = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('lot_id', null, 'qty', v_qty)) end);
    if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'sources must be an array'; end if;
    if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e),0) <> v_qty or
       (select count(distinct jsonb_build_array((e->>'lot_id')::uuid)) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources) then raise exception 'distinct sources must sum to received quantity'; end if;
    if v_qty = 0 then
      if jsonb_array_length(v_sources) <> 0 then raise exception 'zero receipt has no sources'; end if;
      continue;
    end if;
    for src in select (e->>'lot_id')::uuid lot_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
      if src.qty is null or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <= 0 then raise exception 'invalid source quantity'; end if;
      if l.sku_id is not null and src.qty <> round(src.qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
      if l.material_id is not null and src.qty <> round(src.qty,4) then raise exception 'material quantities require at most four decimals'; end if;
      if l.keg_pool_id is not null and src.lot_id is not null then raise exception 'empty kegs have no lot'; end if;
      perform private.assert_bin_stock(t.brewery_id, l.from_bin_id, l.sku_id, l.material_id, l.keg_pool_id, l.keg_size, src.lot_id, false, src.qty);
    end loop;
    if l.sku_id is not null then
      insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
      select t.brewery_id, l.sku_id, t.from_location_id, l.from_bin_id, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'location_transfer'::public.movement_type, t.id, auth.uid() from jsonb_array_elements(v_sources) e
      union all select t.brewery_id, l.sku_id, t.to_location_id, l.to_bin_id, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'location_transfer'::public.movement_type, t.id, auth.uid() from jsonb_array_elements(v_sources) e;
    elsif l.material_id is not null then
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, note, created_by)
      select t.brewery_id, l.material_id, t.from_location_id, l.from_bin_id, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'transfer_out'::public.material_movement_type, 'transfer ' || t.id, auth.uid() from jsonb_array_elements(v_sources) e
      union all select t.brewery_id, l.material_id, t.to_location_id, l.to_bin_id, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'transfer_in'::public.material_movement_type, 'transfer ' || t.id, auth.uid() from jsonb_array_elements(v_sources) e;
    else
      insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, note, created_by)
      values (t.brewery_id, l.keg_pool_id, l.keg_size, t.from_location_id, l.from_bin_id, v_qty::int, 'transferred_out', 'transfer ' || t.id, auth.uid()),
             (t.brewery_id, l.keg_pool_id, l.keg_size, t.to_location_id,   l.to_bin_id,   v_qty::int, 'transferred_in',  'transfer ' || t.id, auth.uid());
    end if;
  end loop;
  update public.stock_transfers set status = 'received', received_at = now() where id = p_transfer;
  return jsonb_build_object('transfer_id', p_transfer);
end $function$;

-- private.record_repack_impl(p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric, p_child_sku uuid, p_child_qty numeric, p_lot uuid, p_actor uuid): 2 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION private.record_repack_impl(p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric, p_child_sku uuid, p_child_qty numeric, p_lot uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_ref uuid := private.new_uuid();
  v_parent public.skus; v_child public.skus;
  v_component numeric; v_expected numeric; v_net numeric;
  v_lot_tracked text; v_bom record;
begin
  if p_parent_qty <= 0 then raise exception 'parentQty must be positive'; end if;
  -- Composite FKs on inventory_movements already pin location/bin/sku to this
  -- brewery; these lookups are scoped too so the error is a sentence, not 23503.
  select * into v_parent from public.skus where id = p_parent_sku and brewery_id = p_brewery;
  select * into v_child  from public.skus where id = p_child_sku  and brewery_id = p_brewery;
  if v_parent.id is null or v_child.id is null then raise exception 'sku not found'; end if;
  if v_parent.brand_id <> v_child.brand_id then raise exception 'a repack stays inside one brand'; end if;

  select c.qty into v_component from public.format_components c
   where c.brewery_id = p_brewery and c.parent_format_id = v_parent.format_id and c.child_format_id = v_child.format_id;
  if v_component is null then
    raise exception 'format % is not a component of format %: composition is one level deep',
      v_child.format_id, v_parent.format_id;
  end if;

  v_expected := p_parent_qty * v_component;
  if p_child_qty <> v_expected then
    raise exception 'childQty % does not match parentQty % x % per unit: expected %, and only that ratio is volume-neutral',
      p_child_qty, p_parent_qty, v_component, v_expected;
  end if;

  -- A lot-tracked material needs a lot chosen for it, and a repack has nowhere
  -- to say which one; enforce_material_lot would otherwise fail the call with a
  -- bare uuid. Refuse up front, by name, before a single row is written.
  -- ponytail: take an optional per-material lot pick on the input and pass it
  -- through to material_movements.lot_id when someone lot-tracks packaging.
  select m.name into v_lot_tracked
  from public.format_bom bom join public.materials m on m.id = bom.material_id
  where bom.brewery_id = p_brewery and bom.format_id = v_parent.format_id and m.lot_tracked
  order by m.name limit 1;
  if v_lot_tracked is not null then
    raise exception 'repack cannot post BOM for lot-tracked material "%" yet; mark it untracked or remove it from the format''s BOM', v_lot_tracked;
  end if;

  -- The bin cannot go short in the chosen lot (a null lot is the lot-less
  -- stock; lotted stock in the bin asks for its lot).
  perform private.lock_ledger(p_brewery, 'inventory_movements');
  perform private.assert_bin_stock(p_brewery,
    (select id from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery),
    p_parent_sku, null, null, null, p_lot, false, p_parent_qty);

  -- Both legs carry the source lot, so the four-packs stay in its trace.
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
  -- created_by is the actor assert_staff verified in the public wrapper, not
  -- auth.uid() read again here: the wrapper is the one place identity is proven.
  values (p_brewery, p_parent_sku, p_location, p_bin, p_lot, -p_parent_qty, 'repack', v_ref, p_actor),
         (p_brewery, p_child_sku,  p_location, p_bin, p_lot,  p_child_qty,  'repack', v_ref, p_actor);

  -- The trigger froze bbl on each row from format_volumes; if the pair does not
  -- cancel the repack invented or destroyed beer, so the whole call rolls back.
  -- Filtered on the on-hand index columns too: `ref` alone has no index, and
  -- the two rows just written are exactly this brewery/bin/sku pair.
  select coalesce(sum(m.bbl), 0) into v_net from public.inventory_movements m
   where m.brewery_id = p_brewery and m.location_id = p_location and m.bin_id = p_bin
     and m.sku_id in (p_parent_sku, p_child_sku) and m.ref = v_ref and m.type = 'repack';
  if abs(v_net) >= 0.000001 then
    raise exception 'repack is not volume-neutral: % bbl left over', v_net;
  end if;

  -- The packaging that came off, in whole units for a counted material: what
  -- is consumed rounds up, as close_packaging_run draws it (#436), and what
  -- goes back on the shelf rounds down, so neither books part of a carrier.
  -- A consumed line has to be on the shelf; take the material ledger lock
  -- (as close and move_stock_bin do) so two writers cannot both pass (#588).
  perform private.lock_ledger(p_brewery, 'material_movements');
  for v_bom in
    select bom.material_id, bom.on_break = 'consumed' as consumed,
           case when m.base_uom <> 'each' then bom.qty_per_unit * p_parent_qty
                when bom.on_break = 'consumed' then ceil(bom.qty_per_unit * p_parent_qty)
                else floor(bom.qty_per_unit * p_parent_qty) end as qty
    from public.format_bom bom join public.materials m on m.id = bom.material_id
    where bom.brewery_id = p_brewery and bom.format_id = v_parent.format_id
  loop
    continue when v_bom.qty = 0;
    if v_bom.consumed then
      perform private.assert_bin_stock(p_brewery, p_bin, null, v_bom.material_id, null, null, null, false, v_bom.qty);
    end if;
    insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, note, created_by)
    values (p_brewery, v_bom.material_id, p_location, p_bin,
            case when v_bom.consumed then -v_bom.qty else v_bom.qty end,
            case when v_bom.consumed then 'consumption' else 'return_to_stock' end::public.material_movement_type,
            'repack ' || v_ref, p_actor);
  end loop;

  return jsonb_build_object('ref', v_ref, 'parent_qty', p_parent_qty, 'child_qty', p_child_qty);
end $function$;

-- private.ship_order_impl(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text, p_invoice_timing text): 2 table lock(s) -> brewery lock on o.brewery_id
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

-- public.complete_batch(p_brewery uuid, p_batch uuid, p_request_id uuid, p_confirm_in_tank_bbl numeric): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.complete_batch(p_brewery uuid, p_batch uuid, p_request_id uuid, p_confirm_in_tank_bbl numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid; v_replay jsonb; v_result jsonb; v_batch public.batches;
  v_close timestamptz; v_anchor uuid; v_adjustment uuid; v_residual numeric; v_threshold numeric;
  v_payload jsonb; v_tanks text; v_in_tank_bbl numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  -- Retain the pre-upgrade hash for ordinary and recovered unconfirmed requests.
  v_payload := jsonb_build_object('brewery', p_brewery, 'batch', p_batch);
  if p_confirm_in_tank_bbl is not null then
    v_payload := v_payload || jsonb_build_object('confirm_in_tank_bbl', p_confirm_in_tank_bbl);
  end if;
  v_replay := private.claim_command_request(p_brewery, 'complete_batch', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);
  perform private.lock_ledger(p_brewery, 'inventory_movements');
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  perform o.id from public.vessel_occupancies o
    where o.brewery_id = p_brewery and o.batch_id = p_batch order by o.id for update;
  v_result := private.batch_completion_calculation(p_brewery, p_batch);
  v_residual := (v_result->>'residualBbl')::numeric;
  v_threshold := (v_result->>'thresholdBbl')::numeric;
  v_in_tank_bbl := (v_result->>'inTankBbl')::numeric;
  if (v_result->>'inTankRequiresConfirmation')::boolean
    and p_confirm_in_tank_bbl is distinct from v_in_tank_bbl then
    select string_agg(trim_scale((tank->>'bbl')::numeric)::text || ' bbl in ' || (tank->>'vesselName'), ', ' order by tank->>'vesselName')
    into v_tanks from jsonb_array_elements(v_result->'inTank') tank;
    if p_confirm_in_tank_bbl is null then
      raise exception 'Completing writes off % bbl still in tanks (%). Confirm this loss explicitly.',
        trim_scale(v_in_tank_bbl), v_tanks;
    end if;
    raise exception 'Tanks now hold % bbl (%), not the % bbl acknowledged. Review the batch and confirm again.',
      trim_scale(v_in_tank_bbl), v_tanks, trim_scale(p_confirm_in_tank_bbl);
  end if;

  select o.id into v_anchor from public.vessel_occupancies o
    where o.brewery_id = p_brewery and o.batch_id = p_batch
    order by (o.ended_at is null) desc, o.started_at desc, o.id desc limit 1;
  select greatest(now(), max(o.started_at)) into v_close from public.vessel_occupancies o
    where o.brewery_id = p_brewery and o.batch_id = p_batch;

  if v_residual >= v_threshold then
    insert into public.volume_adjustments
      (brewery_id, occupancy_id, bbl, reason, removal_class, affects_occupancy, at, created_by)
    values (p_brewery, v_anchor, -v_residual, 'loss', 'loss', false, v_close, v_actor)
    returning id into v_adjustment;
  end if;
  update public.vessel_occupancies set ended_at = v_close
    where brewery_id = p_brewery and batch_id = p_batch and ended_at is null;
  update public.batches set closed_at = v_close, completion_adjustment_id = v_adjustment
    where id = p_batch;

  v_result := v_result || jsonb_build_object('closedAt', v_close, 'adjustmentId', v_adjustment);
  return private.complete_command_request(p_request_id, v_result);
end $function$;

-- public.correct_brew_record(p_brewery uuid, p_record uuid, p_reason text, p_initial_bbl numeric, p_actuals jsonb, p_process jsonb, p_confirm_empty boolean, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.correct_brew_record(p_brewery uuid, p_record uuid, p_reason text, p_initial_bbl numeric, p_actuals jsonb, p_process jsonb, p_confirm_empty boolean, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_record public.brew_records; new_record public.brew_records; vessel public.vessels;
  batch public.batches; occupancy public.vessel_occupancies; replay jsonb; adjustment uuid;
  delta numeric; current_bbl numeric;
begin
  perform private.assert_staff(p_brewery,array['admin','brewer']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery,'correct_brew_record',p_request_id,
    jsonb_build_object('record',p_record,'reason',p_reason,'initial_bbl',p_initial_bbl,'actuals',p_actuals,'process',p_process,'confirm_empty',p_confirm_empty));
  if replay is not null then return replay; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'correction reason required'; end if;
  if p_initial_bbl is null or p_initial_bbl<=0 or p_initial_bbl<>round(p_initial_bbl,3) or p_initial_bbl::text in ('NaN','Infinity','-Infinity') then raise exception 'knockout barrels must be positive with at most three decimals'; end if;
  perform private.assert_brew_process(p_process);
  perform private.lock_cellar_workflow(p_brewery);
  select * into old_record from public.brew_records where id=p_record and brewery_id=p_brewery;
  if old_record.id is null then raise exception 'brew record not found'; end if;
  select v.* into vessel from public.vessels v join public.vessel_occupancies o on o.vessel_id=v.id where o.id=old_record.occupancy_id for update of v;
  select * into batch from public.batches where id=old_record.batch_id for update;
  select * into occupancy from public.vessel_occupancies where id=old_record.occupancy_id for update;
  if exists(select 1 from public.brew_records where corrects_id=p_record) then raise exception 'brew record already corrected; reload the current revision'; end if;
  delta := p_initial_bbl-old_record.initial_bbl;
  -- Ingredient and process corrections do not rewrite downstream beer facts.
  -- A volume change still needs beer in this occupancy and unfiled books.
  if delta<>0 then
    if batch.closed_at is not null or batch.cancelled_at is not null or occupancy.ended_at is not null then
      raise exception 'a volume correction requires an open batch and occupancy; keep the recorded knockout to correct ingredients or process';
    end if;
    if exists(select 1 from public.report_filings where brewery_id=p_brewery and filed_at is not null and period_end>=old_record.brewed_on) then
      raise exception 'a filed report already depends on this brew volume';
    end if;
    select bbl into current_bbl from public.occupancy_volumes where occupancy_id=occupancy.id;
    if current_bbl+delta<=0 then raise exception 'corrected occupancy must retain positive volume'; end if;
    perform private.assert_vessel_fits(vessel,current_bbl+delta);
  end if;
  -- Both old and replacement identities precede the material ledger lock.
  perform 1 from public.materials where id in (
    select m.material_id from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=p_record
    union select (e->>'material_id')::uuid from jsonb_array_elements(p_actuals) e
  ) order by id for key share;
  perform 1 from public.material_lots where id in (
    select m.lot_id from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=p_record
    union select (e->>'lot_id')::uuid from jsonb_array_elements(p_actuals) e
  ) order by id for key share;
  perform private.lock_ledger(p_brewery, 'material_movements');
  insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,compensates_id,note,created_by)
    select m.brewery_id,m.material_id,m.location_id,m.bin_id,m.lot_id,-m.qty,'adjustment',m.unit_cost_cents,m.id,p_reason,auth.uid()
    from public.batch_additions a join public.material_movements m on m.id=a.movement_id where a.brew_record_id=p_record;
  if delta<>0 then
    insert into public.volume_adjustments(brewery_id,occupancy_id,bbl,reason,note,created_by)
      values(p_brewery,occupancy.id,delta,'measurement',p_reason,auth.uid()) returning id into adjustment;
  end if;
  insert into public.brew_records(brewery_id,batch_id,occupancy_id,recipe_version_id,brewed_on,initial_bbl,plan_snapshot,process,corrects_id,correction_reason,volume_adjustment_id,turn,created_by)
    values(p_brewery,batch.id,occupancy.id,old_record.recipe_version_id,old_record.brewed_on,p_initial_bbl,old_record.plan_snapshot,p_process,p_record,p_reason,adjustment,old_record.turn,auth.uid()) returning * into new_record;
  perform private.append_brew_actuals(new_record.id,p_actuals,p_confirm_empty);
  return private.complete_command_request(p_request_id,jsonb_build_object('record',to_jsonb(new_record)));
end $function$;

-- public.correct_reporting_basis(p_brewery uuid, p_books_opened_on date, p_expected_books_opened_on date, p_reason text, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.correct_reporting_basis(p_brewery uuid, p_books_opened_on date, p_expected_books_opened_on date, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_replay jsonb;
  v_old date;
  v_correction public.reporting_basis_corrections;
  v_filing public.report_filings;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'correct_reporting_basis', p_request_id,
    jsonb_build_object('books_opened_on', p_books_opened_on, 'expected_books_opened_on', p_expected_books_opened_on, 'reason', p_reason));
  if v_replay is not null then return v_replay; end if;
  -- The same gate as filing and the ordinary setter: no filing can slip
  -- between the before/after comparison and recording its amendment flag.
  perform private.lock_cellar_workflow(p_brewery);
  select books_opened_on into v_old from public.breweries where id = p_brewery;
  if v_old is distinct from p_expected_books_opened_on then
    raise exception 'the reporting basis changed; refresh and review before correcting it';
  end if;
  if v_old is not distinct from p_books_opened_on then raise exception 'choose a different reporting basis'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a correction reason is required'; end if;
  if not exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null) then
    raise exception 'no report has been filed; change Books opened on in brewery details instead';
  end if;
  -- Match existing cellar -> ledger lock order. An inventory write cannot
  -- masquerade as a basis change between the two balance calculations.
  perform private.lock_ledger(p_brewery, 'inventory_movements');

  select jsonb_object_agg(filing.id::text,
    private.generate_compliance_report(p_brewery, filing.jurisdiction, filing.period_start, filing.period_end)->'figures')
    into v_before from public.report_filings filing where brewery_id = p_brewery and filed_at is not null;
  insert into public.reporting_basis_corrections(brewery_id, old_basis, new_basis, corrected_by, reason)
    values (p_brewery, v_old, p_books_opened_on, auth.uid(), btrim(p_reason)) returning * into v_correction;
  update public.breweries set books_opened_on = p_books_opened_on where id = p_brewery;
  for v_filing in select * from public.report_filings where brewery_id = p_brewery and filed_at is not null loop
    -- Use the private generator to retain evidence even when the new basis
    -- invalidates this period. Public generation still refuses such a range.
    v_after := private.generate_compliance_report(p_brewery, v_filing.jurisdiction, v_filing.period_start, v_filing.period_end)->'figures';
    if v_before->v_filing.id::text is distinct from v_after
        or v_filing.period_start < p_books_opened_on then
      insert into public.report_basis_amendments(brewery_id, filing_id, correction_id, old_figures, new_figures)
        values (p_brewery, v_filing.id, v_correction.id, v_before->v_filing.id::text, v_after);
    end if;
  end loop;
  return private.complete_command_request(p_request_id, to_jsonb(v_correction));
end $function$;

-- public.correct_taproom_count(p_brewery uuid, p_count uuid, p_corrections jsonb, p_reason text, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.correct_taproom_count(p_brewery uuid, p_count uuid, p_corrections jsonb, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_replay jsonb; root public.taproom_counts; correction uuid; item record;
  replacement uuid; v_channel uuid; v_tax public.tax_treatment;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  v_replay:=private.claim_command_request(p_brewery,'correct_taproom_count',p_request_id,
    jsonb_build_object('count',p_count,'corrections',p_corrections,'reason',p_reason));
  if v_replay is not null then return v_replay; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'enter a correction reason'; end if;
  if jsonb_typeof(p_corrections) is distinct from 'array' or jsonb_array_length(p_corrections)=0 then raise exception 'include at least one changed count line'; end if;
  if exists(select 1 from jsonb_array_elements(p_corrections) e where jsonb_typeof(e) is distinct from 'object'
    or not (e ?& array['line_id','qty_counted'])
    or (select count(*) from jsonb_object_keys(e))<>2
    or jsonb_typeof(e->'line_id') is distinct from 'string' or jsonb_typeof(e->'qty_counted') is distinct from 'number') then
    raise exception 'line ID and corrected whole quantity are required';
  end if;
  if (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_corrections) e)<>jsonb_array_length(p_corrections) then
    raise exception 'duplicate correction line';
  end if;
  select * into root from public.taproom_counts where id=p_count and brewery_id=p_brewery;
  if not found then raise exception 'count not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('taproom-count:'||p_brewery::text||':'||root.location_id::text,0));
  perform private.lock_ledger(p_brewery, 'inventory_movements');
  select * into root from public.taproom_counts where id=p_count and brewery_id=p_brewery for update;
  perform 1 from public.taproom_count_lines where count_id=root.id and brewery_id=p_brewery for update;
  if root.corrects_count_id is not null then raise exception 'only an original count can be corrected' using errcode='MG409'; end if;
  if exists(select 1 from public.taproom_counts where corrects_count_id=root.id and brewery_id=p_brewery) then raise exception 'count already corrected' using errcode='MG409'; end if;
  if exists(select 1 from public.taproom_counts later where later.brewery_id=p_brewery and later.location_id=root.location_id
    and later.corrects_count_id is null and (later.observed_at,later.id)>(root.observed_at,root.id)) then
    raise exception 'only the latest count can be corrected' using errcode='MG409';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_corrections) e(line_id uuid,qty_counted numeric)
    left join public.taproom_count_lines l on l.id=e.line_id and l.brewery_id=p_brewery and l.count_id=root.id
    left join public.inventory_movements m on m.id=l.movement_id and m.brewery_id=l.brewery_id
    where l.id is null or e.qty_counted::text in ('NaN','Infinity','-Infinity') or e.qty_counted<>trunc(e.qty_counted)
      or e.qty_counted<0 or e.qty_counted=l.qty_counted or e.qty_counted>l.qty_before
      or (l.movement_id is null and l.qty_counted<>l.qty_before)
      or (l.movement_id is not null and (m.id is null or m.type<>'depletion' or m.ref<>root.id or m.qty<>l.qty_counted-l.qty_before
        or m.compensates_id is not null or m.source_movement_id is not null or m.correction_source_id is not null))) then
    raise exception 'change only owned depletion or matching lines within zero and recorded stock';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_corrections) e(line_id uuid,qty_counted numeric)
    join public.taproom_count_lines l on l.id=e.line_id and l.brewery_id=p_brewery and l.count_id=root.id
    where e.qty_counted<l.qty_counted and
      (select coalesce(sum(m.qty),0) from public.inventory_movements m where m.brewery_id=p_brewery
        and m.location_id=l.location_id and m.bin_id=l.bin_id and m.sku_id=l.sku_id and m.lot_id is not distinct from l.lot_id)
        + e.qty_counted-l.qty_counted < 0) then
    raise exception 'stock has been used since this count; ask Warehouse to review before correcting' using errcode='MG409';
  end if;
  insert into public.taproom_counts(brewery_id,location_id,counted_on,counted_by,observed_at,prior_count_id,corrects_count_id,correction_reason)
    values(p_brewery,root.location_id,root.counted_on,v_actor,root.observed_at,root.prior_count_id,root.id,btrim(p_reason)) returning id into correction;
  for item in
    select l.*,e.qty_counted requested from public.taproom_count_lines l
    left join jsonb_to_recordset(p_corrections) e(line_id uuid,qty_counted numeric) on e.line_id=l.id
    where l.count_id=root.id and l.brewery_id=p_brewery order by l.id
  loop
    replacement:=null;
    if item.requested is not null then
      if item.movement_id is not null then
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,dest_state,
          compensates_id,ref,note,created_by)
          select m.brewery_id,m.sku_id,m.location_id,m.bin_id,m.lot_id,-m.qty,m.type,m.sale_channel_id,m.tax_treatment,m.dest_state,
            m.id,correction,btrim(p_reason),v_actor from public.inventory_movements m where m.id=item.movement_id and m.brewery_id=p_brewery;
        if item.requested<item.qty_before then
          insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,dest_state,
            correction_source_id,ref,note,created_by)
            select m.brewery_id,m.sku_id,m.location_id,m.bin_id,m.lot_id,item.requested-item.qty_before,m.type,m.sale_channel_id,m.tax_treatment,m.dest_state,
              m.id,correction,btrim(p_reason),v_actor from public.inventory_movements m where m.id=item.movement_id and m.brewery_id=p_brewery
            returning id into replacement;
        end if;
      else
        -- A matching root had no removal to reverse or frozen removal facts to copy.
        -- Its first depletion freezes the current format and Taproom channel as usual.
        select id,tax_treatment into v_channel,v_tax from public.sale_channels where brewery_id=p_brewery and system_code='taproom';
        if v_channel is null then raise exception 'Admin must restore the Taproom sale channel before recording depletion'; end if;
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,ref,note,created_by)
          values(p_brewery,item.sku_id,item.location_id,item.bin_id,item.lot_id,item.requested-item.qty_before,'depletion',v_channel,v_tax,
            correction,btrim(p_reason),v_actor) returning id into replacement;
      end if;
    end if;
    insert into public.taproom_count_lines(brewery_id,count_id,location_id,bin_id,sku_id,lot_id,qty_before,qty_counted,movement_id,corrects_line_id)
      values(p_brewery,correction,item.location_id,item.bin_id,item.sku_id,item.lot_id,item.qty_before,coalesce(item.requested,item.qty_counted),replacement,item.id);
  end loop;
  return private.complete_command_request(p_request_id,private.get_taproom_count(p_brewery,root.id));
end $function$;

-- public.move_stock_bin(p_brewery uuid, p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size keg_size, p_qty numeric, p_from_bin uuid, p_to_bin uuid, p_note text, p_request_id uuid, p_material_lot uuid, p_sku_lot uuid): 3 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.move_stock_bin(p_brewery uuid, p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size keg_size, p_qty numeric, p_from_bin uuid, p_to_bin uuid, p_note text, p_request_id uuid, p_material_lot uuid DEFAULT NULL::uuid, p_sku_lot uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_from public.bins; v_to public.bins;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'move_stock_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'material', p_material, 'keg_pool', p_keg_pool, 'keg_size', p_keg_size,
                       'qty', p_qty, 'from_bin', p_from_bin, 'to_bin', p_to_bin, 'note', p_note, 'material_lot', p_material_lot, 'sku_lot', p_sku_lot));
  if v_replay is not null then return v_replay; end if;
  if p_qty is null or p_qty <= 0 or p_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'qty must be positive'; end if;
  if num_nonnulls(p_sku, p_material, p_keg_pool) <> 1 then raise exception 'exactly one of sku, material, keg pool'; end if;
  if p_material_lot is not null and p_material is null then raise exception 'material lot requires material'; end if;
  if p_sku_lot is not null and (p_sku is null or not exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and lot_id = p_sku_lot)) then raise exception 'lot does not belong to SKU'; end if;
  if p_keg_pool is not null and p_qty <> trunc(p_qty) then raise exception 'empty kegs must be whole units'; end if;
  if (p_keg_pool is null) <> (p_keg_size is null) then raise exception 'keg size is required only for empty kegs'; end if;
  if p_from_bin = p_to_bin then raise exception 'from and to bin are the same'; end if;
  select * into v_from from public.bins where id = p_from_bin and brewery_id = p_brewery;
  select * into v_to   from public.bins where id = p_to_bin   and brewery_id = p_brewery;
  if v_from.id is null or v_to.id is null then raise exception 'bin not found'; end if;
  if v_from.location_id <> v_to.location_id then raise exception 'bins are in different locations: use create_stock_transfer'; end if;
  if p_sku is not null then
    perform private.lock_ledger(p_brewery, 'inventory_movements');
    if p_qty <> round(p_qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
    perform private.assert_bin_stock(p_brewery, p_from_bin, p_sku, null, null, null, p_sku_lot, false, p_qty);
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, note, created_by)
    values (p_brewery, p_sku, v_from.location_id, p_from_bin, -p_qty, 'location_transfer', p_sku_lot, p_note, auth.uid()),
           (p_brewery, p_sku, v_to.location_id,   p_to_bin,    p_qty, 'location_transfer', p_sku_lot, p_note, auth.uid());
  elsif p_material is not null then
    perform private.lock_ledger(p_brewery, 'material_movements');
    perform private.assert_bin_stock(p_brewery, p_from_bin, null, p_material, null, null, p_material_lot, false, p_qty);
    insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, lot_id, note, created_by)
    values (p_brewery, p_material, v_from.location_id, p_from_bin, -p_qty, 'transfer_out', p_material_lot, p_note, auth.uid()),
           (p_brewery, p_material, v_to.location_id,   p_to_bin,    p_qty, 'transfer_in',  p_material_lot, p_note, auth.uid());
  else
    if p_keg_size is null then raise exception 'keg_size is required with a keg pool'; end if;
    perform private.lock_ledger(p_brewery, 'keg_events');
    perform private.assert_bin_stock(p_brewery, p_from_bin, null, null, p_keg_pool, p_keg_size, null, false, p_qty);
    insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, note, created_by)
    values (p_brewery, p_keg_pool, p_keg_size, v_from.location_id, p_from_bin, p_qty::int, 'transferred_out', p_note, auth.uid()),
           (p_brewery, p_keg_pool, p_keg_size, v_to.location_id,   p_to_bin,   p_qty::int, 'transferred_in',  p_note, auth.uid());
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('from_bin_id', p_from_bin, 'to_bin_id', p_to_bin, 'qty', p_qty));
end $function$;

-- public.record_batch_addition(p_brewery uuid, p_occupancy uuid, p_material uuid, p_stage ingredient_stage, p_lot uuid, p_qty numeric, p_note text, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.record_batch_addition(p_brewery uuid, p_occupancy uuid, p_material uuid, p_stage ingredient_stage, p_lot uuid, p_qty numeric, p_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid; v_replay jsonb; v_occ public.vessel_occupancies; v_mat public.materials;
  v_bin record; v_movement uuid; v_row public.batch_additions;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_batch_addition', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'occupancy', p_occupancy, 'material', p_material,
      'stage', p_stage, 'lot', p_lot, 'qty', p_qty, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'quantity must be positive'; end if;
  if p_qty <> round(p_qty, 4) then raise exception 'material quantities require at most four decimals'; end if;

  perform private.lock_cellar_workflow(p_brewery);
  -- The stock check below must see every other material writer's drain; they
  -- all check under this table lock, which the cellar advisory lock does not block.
  perform private.lock_ledger(p_brewery, 'material_movements');
  perform private.assert_open_occupancy(p_brewery, p_occupancy);
  select * into v_occ from public.vessel_occupancies where id = p_occupancy and brewery_id = p_brewery;

  select * into v_mat from public.materials where id = p_material and brewery_id = p_brewery;
  if v_mat.id is null then raise exception 'material not found'; end if;
  -- enforce_material_lot on the movement also refuses this; the message here is the one the sheet shows.
  if v_mat.lot_tracked and p_lot is null then raise exception 'choose a lot: % is lot-tracked', v_mat.name; end if;

  -- The bin with the most of this material (and lot) on hand; refuse to drain
  -- more than it holds so a typo never drives a bin negative.
  select location_id, bin_id, qty into v_bin from public.material_lot_bin_on_hand
  where brewery_id = p_brewery and material_id = p_material and (p_lot is null or lot_id = p_lot)
  order by qty desc limit 1;
  if v_bin.bin_id is null or v_bin.qty < p_qty then
    raise exception 'only % % of % on hand', coalesce(v_bin.qty, 0), v_mat.base_uom, v_mat.name;
  end if;

  insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, note, created_by)
  values (p_brewery, p_material, v_bin.location_id, v_bin.bin_id, p_lot, -p_qty, 'consumption', p_note, v_actor)
  returning id into v_movement;
  insert into public.batch_additions (brewery_id, batch_id, occupancy_id, stage, movement_id)
  values (p_brewery, v_occ.batch_id, p_occupancy, p_stage, v_movement) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

-- public.record_inventory_movement(p_brewery uuid, p_sku uuid, p_location uuid, p_bin uuid, p_qty numeric, p_type movement_type, p_sale_channel uuid, p_dest_state text, p_note text, p_request_id uuid, p_lot uuid, p_origin text, p_conversation uuid, p_preview_token uuid): 2 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.record_inventory_movement(p_brewery uuid, p_sku uuid, p_location uuid, p_bin uuid, p_qty numeric, p_type movement_type, p_sale_channel uuid, p_dest_state text, p_note text, p_request_id uuid, p_lot uuid DEFAULT NULL::uuid, p_origin text DEFAULT 'ui'::text, p_conversation uuid DEFAULT NULL::uuid, p_preview_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_row public.inventory_movements; v_tax public.tax_treatment; v_actor uuid; v_input jsonb;
  v_preview private.command_previews; v_current jsonb;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  if (p_origin='chat') is distinct from (p_conversation is not null and p_preview_token is not null)
    then raise exception 'chat preview token required'; end if;
  if p_origin not in ('ui','chat') then raise exception 'invalid command origin'; end if;
  if p_origin='chat' and p_type not in ('opening_balance','production_in','adjustment','depletion','return_in','destruction','loss','sample','festival_removal')
    then raise exception 'movement type is not supported in chat'; end if;
  v_input := jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'location', p_location, 'bin', p_bin, 'qty', p_qty, 'type', p_type, 'sale_channel', p_sale_channel, 'dest_state', p_dest_state, 'note', p_note, 'lot', p_lot);
  v_replay := private.claim_command_request(p_brewery, 'record_inventory_movement', p_request_id, v_input,
    p_origin,p_conversation,p_preview_token);
  if v_replay is not null then return v_replay; end if;

  if not exists (select 1 from public.skus where id = p_sku and brewery_id = p_brewery and active) then
    raise exception 'inactive SKU cannot receive a new movement';
  end if;
  if (p_type in ('sample','festival_removal','sale_removal')
      and (p_dest_state is null or p_dest_state !~ '^[A-Z]{2}$'))
     or (p_type not in ('sample','festival_removal','sale_removal') and p_dest_state is not null) then
    raise exception 'classified removals require a two-letter uppercase destination state';
  end if;

  if p_origin='chat' then
    select * into v_preview from private.command_previews
      where token=p_preview_token and actor_id=v_actor and brewery_id=p_brewery
        and command_name='record_movement' and rpc_name='record_inventory_movement'
        and canonical_input=v_input and conversation_id=p_conversation;
    if not found then raise exception 'invalid preview token'; end if;
    if v_preview.expires_at<=now() then raise exception 'expired preview token'; end if;
    perform private.lock_ledger(p_brewery, 'inventory_movements');
    v_current:=private.inventory_movement_proposal(p_brewery,p_sku,p_location,p_bin,p_qty,p_type,
      p_sale_channel,p_dest_state,p_note,p_lot,true);
    if v_current->'version' is distinct from v_preview.version
       or v_current->'effects' is distinct from v_preview.effects
       or v_current->'warnings' is distinct from v_preview.warnings then
      raise exception 'preview changed; preview again' using errcode='MG409';
    end if;
    v_tax:=(v_current->'effects'->0->>'taxTreatment')::public.tax_treatment;
  else
    if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty = 0 or p_qty <> round(p_qty,2) then raise exception 'invalid movement quantity'; end if;
    if p_lot is not null and not exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and lot_id = p_lot)
      then raise exception 'lot does not belong to SKU'; end if;
    if p_qty < 0 then
      perform private.lock_ledger(p_brewery, 'inventory_movements');
      -- #450: the same bin/lot stock check the chat preview applies.
      perform private.assert_movement_stock(p_brewery,p_sku,p_location,p_bin,p_lot,p_qty);
    end if;
    -- A staff-entered movement has no customer, so the channel default is the
    -- resolved treatment; the composite FK below rejects another brewery's channel.
    if p_sale_channel is not null then
      select tax_treatment into v_tax from public.sale_channels
       where id = p_sale_channel and brewery_id = p_brewery;
    end if;
  end if;
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, note, created_by)
    values (p_brewery, p_sku, p_location, p_bin, p_lot, p_qty, p_type, p_sale_channel, v_tax, p_dest_state, p_note, auth.uid()) returning * into v_row;
  if p_origin='chat' then
    insert into private.chat_messages(conversation_id,brewery_id,actor_id,role,result,request_id)
      values(p_conversation,p_brewery,v_actor,'result',to_jsonb(v_row),p_request_id);
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

-- public.record_keg_event(p_brewery uuid, p_pool uuid, p_keg_size keg_size, p_qty integer, p_reason keg_event_reason, p_location uuid, p_bin uuid, p_customer uuid, p_note text, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.record_keg_event(p_brewery uuid, p_pool uuid, p_keg_size keg_size, p_qty integer, p_reason keg_event_reason, p_location uuid, p_bin uuid, p_customer uuid, p_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_row public.keg_events; v_active boolean; v_on_hand int; v_held int;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_keg_event', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'pool', p_pool, 'keg_size', p_keg_size, 'qty', p_qty, 'reason', p_reason,
                       'location', p_location, 'bin', p_bin, 'customer', p_customer, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  -- The bin and customer checks below read a total then insert; take the keg
  -- ledger lock (as every keg writer does) so two cannot both pass on the same kegs.
  perform private.lock_ledger(p_brewery, 'keg_events');
  if p_qty <= 0 then raise exception 'qty must be positive'; end if;
  if p_reason in ('transferred_in','transferred_out') then raise exception 'transfers are recorded by stock transfers and bin moves'; end if;
  if p_reason in ('shipped','returned') and p_customer is null then raise exception 'customer is required for % kegs', p_reason; end if;
  -- found is a fleet correction at the bin; a keg found at a customer is a
  -- shipped event, so the customer balance is never moved by found.
  if p_reason in ('acquired','retired','found') and p_customer is not null then raise exception '% kegs carry no customer', p_reason; end if;
  select active into v_active from public.keg_pools where id = p_pool and brewery_id = p_brewery;
  if v_active is null then raise exception 'keg pool not found'; end if;
  if not v_active then raise exception 'keg pool is out of service'; end if;
  if not exists (select 1 from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery) then
    raise exception 'bin is not in that location';
  end if;
  if p_reason in ('retired','shipped') or (p_reason = 'lost' and p_customer is null) then
    select coalesce(sum(qty), 0) into v_on_hand from public.keg_bin_on_hand
      where pool_id = p_pool and keg_size = p_keg_size and bin_id = p_bin;
    if v_on_hand < p_qty then raise exception 'Not enough kegs in that bin: % on hand. Check the quantity and source bin.', v_on_hand; end if;
  end if;
  if p_reason in ('returned','lost') and p_customer is not null then
    select coalesce(sum(qty), 0) into v_held from public.keg_customer_balances
      where brewery_id = p_brewery and customer_id = p_customer and pool_id = p_pool and keg_size = p_keg_size;
    if v_held < p_qty then raise exception 'Not enough kegs at that customer: customer holds %. Check the quantity and customer.', v_held; end if;
  end if;
  insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, customer_id, note, created_by)
  values (p_brewery, p_pool, p_keg_size, p_location, p_bin, p_qty, p_reason, p_customer, p_note, auth.uid()) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

-- public.record_stock_transfer_pick(p_transfer uuid, p_picks jsonb, p_request_id uuid): 3 table lock(s) -> brewery lock on v_brewery
CREATE OR REPLACE FUNCTION public.record_stock_transfer_pick(p_transfer uuid, p_picks jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid; v_replay jsonb; t public.stock_transfers; pk record; l public.stock_transfer_lines; g record;
begin
  select brewery_id into v_brewery from public.stock_transfers where id = p_transfer;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'record_stock_transfer_pick', p_request_id, jsonb_build_object('transfer', p_transfer, 'picks', p_picks));
  if v_replay is not null then return v_replay; end if;
  t := private.lock_transfer(p_transfer, array['submitted','picked']::public.stock_transfer_status[]);
  -- The ledger locks assert_bin_stock requires, in receive_stock_transfer_impl's order.
  perform private.lock_ledger(v_brewery, 'inventory_movements');
  perform private.lock_ledger(v_brewery, 'material_movements');
  perform private.lock_ledger(v_brewery, 'keg_events');
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_picks) e loop
    select * into l from public.stock_transfer_lines where id = pk.line_id and transfer_id = p_transfer;
    if l.id is null then raise exception 'transfer line % not found', pk.line_id; end if;
    if pk.qty <> trunc(pk.qty) and l.keg_pool_id is not null then raise exception 'empty kegs must be whole units'; end if;
    update public.stock_transfer_lines set qty_picked = pk.qty where id = pk.line_id and transfer_id = p_transfer;
  end loop;
  -- Every picked line of the transfer, this call's and earlier ones', per source bin and stock.
  for g in select from_bin_id, sku_id, material_id, keg_pool_id, keg_size, sum(qty_picked) as qty
      from public.stock_transfer_lines where transfer_id = p_transfer and qty_picked > 0
      group by from_bin_id, sku_id, material_id, keg_pool_id, keg_size loop
    perform private.assert_bin_stock(t.brewery_id, g.from_bin_id, g.sku_id, g.material_id, g.keg_pool_id, g.keg_size, null, true, g.qty);
  end loop;
  update public.stock_transfers set status = 'picked' where id = p_transfer;
  return private.complete_command_request(p_request_id, jsonb_build_object('transfer_id', p_transfer));
end $function$;

-- public.record_taproom_count(p_brewery uuid, p_location uuid, p_counted_on date, p_revision text, p_lines jsonb, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.record_taproom_count(p_brewery uuid, p_location uuid, p_counted_on date, p_revision text, p_lines jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_replay jsonb; v_snapshot jsonb; v_count uuid; v_channel uuid; v_tax public.tax_treatment;
  v_qty numeric; v_before numeric; v_movement uuid; v_bin uuid; v_sku uuid; v_lot uuid; v_disposition text;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse','taproom']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_taproom_count', p_request_id,
    jsonb_build_object('location', p_location, 'counted_on', p_counted_on, 'revision', p_revision, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  if not exists (select 1 from public.locations where id = p_location and brewery_id = p_brewery and 'taproom' = any(uses)) then
    raise exception 'choose an owned taproom location';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'count lines must be an array'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where jsonb_typeof(e) is distinct from 'object'
    or not (e ?& array['bin_id','sku_id','lot_id','qty_counted'])
    or jsonb_typeof(e->'bin_id') is distinct from 'string' or jsonb_typeof(e->'sku_id') is distinct from 'string'
    or jsonb_typeof(e->'lot_id') not in ('string','null') or jsonb_typeof(e->'qty_counted') is distinct from 'number') then raise exception 'explicit bin, SKU, lot UUID or null, and numeric counted quantity are required'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) e where e ? 'disposition' and (jsonb_typeof(e->'disposition') is distinct from 'string' or e->>'disposition' not in ('sold','destroyed'))) then raise exception 'choose sold or destroyed'; end if;
  if (select count(distinct jsonb_build_array((e->>'bin_id')::uuid, (e->>'sku_id')::uuid, (e->>'lot_id')::uuid)) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines)
    then raise exception 'duplicate count bucket'; end if;
  -- Count recording and correction share this location lock before the ledger lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('taproom-count:' || p_brewery::text || ':' || p_location::text, 0));
  perform private.lock_ledger(p_brewery, 'inventory_movements');
  v_snapshot := private.taproom_count_snapshot(p_brewery, p_location);
  if p_counted_on is distinct from (v_snapshot->>'counted_on')::date then raise exception 'count today in the brewery timezone; historical counts cannot use current stock' using errcode = 'MG409'; end if;
  if p_counted_on <= (v_snapshot->'prior_count'->>'counted_on')::date then raise exception 'a count already exists on this date; count corrections are not yet available'; end if;
  if p_revision is distinct from v_snapshot->>'revision' then raise exception 'stock or prior count changed; refresh and review every bucket' using errcode = 'MG409'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric, disposition text)
    full join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
    where e.bin_id is null or b.bin_id is null)
    then raise exception 'count every displayed bucket exactly once; refresh for changed stock'; end if;
  -- Validate all observations before the first durable write.
  for v_bin, v_sku, v_lot, v_qty, v_before, v_disposition in
    select e.bin_id, e.sku_id, e.lot_id, e.qty_counted, b.qty_before, coalesce(e.disposition, 'sold')
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric, disposition text)
    join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
  loop
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty < 0 or v_qty <> trunc(v_qty) then raise exception 'count remaining whole packaged units; a partial keg counts as one until gone'; end if;
    if v_before < 0 or v_before <> trunc(v_before) then raise exception 'stock needs Warehouse review before counting'; end if;
    if v_qty > v_before then raise exception 'count exceeds recorded stock; ask Warehouse to investigate. Count correction is not yet available'; end if;
    if v_disposition='destroyed' and v_qty=v_before then raise exception 'classify destruction only for a shortage'; end if;
  end loop;
  insert into public.taproom_counts(brewery_id, location_id, counted_on, counted_by, prior_count_id)
    values(p_brewery, p_location, p_counted_on, v_actor, (v_snapshot->'prior_count'->>'id')::uuid) returning id into v_count;
  for v_bin, v_sku, v_lot, v_qty, v_before, v_disposition in
    select e.bin_id, e.sku_id, e.lot_id, e.qty_counted, b.qty_before, coalesce(e.disposition, 'sold')
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric, disposition text)
    join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
  loop
    v_movement := null;
    if v_qty < v_before then
      v_channel:=null; v_tax:=null;
      if v_disposition='sold' then
        select id, tax_treatment into v_channel, v_tax from public.sale_channels where brewery_id = p_brewery and system_code = 'taproom';
        if v_channel is null then raise exception 'Admin must restore the Taproom sale channel before recording depletion'; end if;
      end if;
      insert into public.inventory_movements(brewery_id, location_id, bin_id, sku_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, ref, created_by)
        values(p_brewery, p_location, v_bin, v_sku, v_lot,
          v_qty - v_before, case when v_disposition='destroyed' then 'destruction'::public.movement_type else 'depletion'::public.movement_type end, v_channel, v_tax, null, v_count, v_actor) returning id into v_movement;
    end if;
    insert into public.taproom_count_lines(brewery_id, count_id, location_id, bin_id, sku_id, lot_id, qty_before, qty_counted, movement_id)
      values(p_brewery, v_count, p_location, v_bin, v_sku, v_lot, v_before, v_qty, v_movement);
  end loop;
  return private.complete_command_request(p_request_id, private.get_taproom_count(p_brewery, v_count));
end $function$;

-- public.return_shipment(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text, p_request_id uuid, p_refused_delivery uuid, p_return_empty boolean, p_bin uuid): 1 table lock(s) -> brewery lock on v_brewery
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
  end if;
  return private.complete_command_request(p_request_id,v_result);
end $function$;

-- public.reverse_inventory_movement(p_brewery uuid, p_movement uuid, p_note text, p_request_id uuid): 1 table lock(s) -> brewery lock on p_brewery
CREATE OR REPLACE FUNCTION public.reverse_inventory_movement(p_brewery uuid, p_movement uuid, p_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; original public.inventory_movements; compensation public.inventory_movements;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  if not exists (select 1 from public.inventory_movements where id = p_movement and brewery_id = p_brewery) then raise exception 'movement not found'; end if;
  v_replay := private.claim_command_request(p_brewery, 'reverse_inventory_movement', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'movement', p_movement, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if p_note is null or length(btrim(p_note)) = 0 then raise exception 'correction note required'; end if;
  perform private.lock_ledger(p_brewery, 'inventory_movements');
  select * into original from public.inventory_movements where id = p_movement and brewery_id = p_brewery for update;
  if original.type not in ('adjustment','loss') or original.compensates_id is not null
     or original.source_movement_id is not null or original.ref is not null then raise exception 'only standalone adjustment and loss movements can be reversed'; end if;
  if exists (select 1 from public.inventory_movements where brewery_id = p_brewery and compensates_id = p_movement) then raise exception 'movement already reversed'; end if;
  if original.qty > 0 and original.qty > (select coalesce(sum(qty),0) from public.inventory_movements
      where brewery_id = p_brewery and sku_id = original.sku_id and location_id = original.location_id
        and bin_id = original.bin_id and lot_id is not distinct from original.lot_id) then raise exception 'insufficient stock in original bin and lot'; end if;
  insert into public.inventory_movements(brewery_id, sku_id, location_id, bin_id, lot_id, qty, type,
    sale_channel_id, tax_treatment, dest_state, compensates_id, note, created_by)
  values(p_brewery, original.sku_id, original.location_id, original.bin_id, original.lot_id, -original.qty, original.type,
    original.sale_channel_id, original.tax_treatment, original.dest_state, original.id, p_note, auth.uid()) returning * into compensation;
  return private.complete_command_request(p_request_id, to_jsonb(compensation));
end $function$;

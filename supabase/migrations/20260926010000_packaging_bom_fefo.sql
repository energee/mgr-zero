-- Packaging BOM draws, honest end to end (#436, #588).
--
-- close_packaging_run draws a lot-tracked material instead of refusing it: lot
-- by lot at the finished-goods bin, first-expiring-first (earliest best-by,
-- undated lots last, then receipt order -- record_material_count's shortage
-- order). Otherwise a copy of 20260925113742 (#499, with #544's whole-unit
-- rounding and material ledger lock). The FEFO draw replaces #544's separate
-- on-hand read and keeps its refusal wording.
--
-- private.record_repack_impl rounds counted materials as close does (consumed
-- up, returned down), checks each consumed line with private.assert_bin_stock
-- under the material ledger lock, and still refuses a lot-tracked material
-- (a return has no lot to name). Otherwise a copy of 00001_baseline.sql, its
-- only definition.
--
-- material_requirements and packaging_run_requirements plan a counted
-- material in whole units per output line, rounded up, so "short" matches what
-- a close will draw. Otherwise copies of 00001_baseline.sql; the view bodies
-- run as the caller, who cannot reach schema private, so the rounding is
-- written inline rather than as a helper.

create or replace function public.close_packaging_run(
  p_brewery uuid, p_run uuid, p_bbl_drawn numeric, p_outputs jsonb, p_lot_code text,
  p_packaged_on date, p_best_by date, p_location uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_run public.packaging_runs; v_lot uuid; v_available numeric;
  v_occupancy public.vessel_occupancies;
  v_line jsonb; v_sku uuid; v_qty numeric; v_format uuid;
  v_movement uuid; v_consumption uuid; v_bom record; v_packaged numeric;
  v_need numeric; v_balance jsonb; v_lot_row record; v_take numeric; v_left numeric;
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'close_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'bbl_drawn', p_bbl_drawn,
      'outputs', p_outputs, 'lot_code', p_lot_code, 'packaged_on', p_packaged_on,
      'best_by', p_best_by, 'location', p_location, 'bin', p_bin));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;
  -- The check constraint says the same thing as a constraint name; these are
  -- the two sentences a brewer would actually say.
  if v_run.occupancy_id is null then
    raise exception 'pick the tank this run drew from before closing it';
  end if;
  if v_run.started_at is null then raise exception 'start the run before closing it'; end if;

  -- Finished goods have to land somewhere real: the bin must be a bin of that
  -- location, and the location this brewery's.
  if not exists (
    select 1 from public.bins b join public.locations l on l.id = b.location_id
    where b.id = p_bin and b.location_id = p_location and l.brewery_id = p_brewery
  ) then
    raise exception 'bin does not belong to that location';
  end if;

  -- Lock the tank before reading its volume, as record_cellar_transfer does:
  -- the run lock above serialises closes of *this* run, but two runs drawing
  -- the same tank (or a cellar transfer out of it) would otherwise both see
  -- the pre-draw volume and both pass the check below.
  select * into v_occupancy from public.vessel_occupancies
  where id = v_run.occupancy_id and brewery_id = p_brewery for update;
  if v_occupancy.id is null then raise exception 'occupancy not found'; end if;
  -- The over-draw check below would refuse this anyway -- an ended occupancy
  -- holds nothing -- but only for a run that drew something. Saying it here
  -- keeps a zero-bbl close from quietly booking beer against an emptied tank,
  -- and names the order the two steps belong in.
  if v_occupancy.ended_at is not null then
    raise exception 'the tank was emptied before this run closed; close runs before transferring the heel out';
  end if;

  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_occupancy.id;
  if p_bbl_drawn > coalesce(v_available, 0) + c_epsilon then
    raise exception 'only % bbl in that tank; asked to draw %', coalesce(v_available, 0), p_bbl_drawn;
  end if;

  perform private.assert_one_line_per_sku(p_outputs);

  -- lots is unique (brewery_id, code); say so as a sentence rather than let a
  -- 23505 carrying a constraint name reach the brewer.
  if exists (select 1 from public.lots where brewery_id = p_brewery and code = p_lot_code) then
    raise exception 'lot code "%" is already used', p_lot_code;
  end if;
  insert into public.lots (brewery_id, packaging_run_id, brand_id, code, packaged_on, best_by)
  values (p_brewery, p_run, v_run.brand_id, p_lot_code, p_packaged_on, p_best_by)
  returning id into v_lot;

  -- A planned line nobody filled is settled at zero rather than left null: the
  -- run is history now, and "we filled none of those" is the answer.
  update public.packaging_run_outputs set qty_actual = 0 where run_id = p_run;

  -- The BOM check below reads material on hand then inserts; take the material
  -- ledger lock (as move_stock_bin does) so two closes cannot both pass on the
  -- same cans.
  lock table public.material_movements in share row exclusive mode;

  for v_line in select * from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb)) loop
    v_sku := (v_line->>'sku_id')::uuid;
    v_qty := (v_line->>'qty_actual')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'qty_actual must not be negative';
    end if;
    if not exists (select 1 from public.packaging_run_outputs where run_id = p_run and sku_id = v_sku) then
      raise exception 'sku % is not one of this run''s planned outputs', v_sku;
    end if;
    if v_qty = 0 then continue; end if;

    select s.format_id into v_format from public.skus s where s.id = v_sku and s.brewery_id = p_brewery;

    -- One production_in per package filled, all carrying the run's lot and the
    -- run id as ref, so the whole close reads back as one event. bbl is frozen
    -- from the format by the enforce_bbl_integrity trigger.
    insert into public.inventory_movements
      (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, ref, created_by)
    values (p_brewery, v_sku, p_location, p_bin, v_qty, 'production_in', v_lot, p_run, v_actor)
    returning id into v_movement;
    update public.packaging_run_outputs set qty_actual = v_qty, movement_id = v_movement
    where run_id = p_run and sku_id = v_sku;

    -- The packaging bill belongs to the format (§16.12), and every line of it
    -- comes off the same shelf the finished goods land on.
    for v_bom in
      select fb.material_id, fb.qty_per_unit, m.name, m.lot_tracked, m.base_uom
      from public.format_bom fb join public.materials m on m.id = fb.material_id
      where fb.format_id = v_format
    loop
      -- Nobody consumes three-quarters of a can: a counted material is drawn
      -- in whole units, rounded up (brewing-domain.md, BOM & packaging).
      -- 'each' is the only count unit in public.uom; the rest are weighed or
      -- measured and stay exact.
      v_need := v_bom.qty_per_unit * v_qty;
      if v_bom.base_uom = 'each' then v_need := ceil(v_need); end if;
      -- The draw comes off the bin the goods land on, lot by lot,
      -- first-expiring-first: earliest best-by, lots with none behind those
      -- that have one, then receipt order -- the order a cycle count's
      -- shortage takes (record_material_count). An untracked material is one
      -- group with no lot. Only what can be drawn counts: a lot-tracked
      -- material's stock recorded without a lot is not. Earlier lines of this
      -- close are already in the ledger, so a material shared by two packages
      -- is drawn from what is left.
      v_left := v_need;
      for v_lot_row in
        select ml.id as lot_id, sum(mm.qty) as qty
        from public.material_movements mm left join public.material_lots ml on ml.id = mm.lot_id
        where mm.brewery_id = p_brewery and mm.material_id = v_bom.material_id
          and mm.location_id = p_location and mm.bin_id = p_bin
          and (mm.lot_id is not null) = v_bom.lot_tracked
        group by ml.id
        having sum(mm.qty) > 0
        order by ml.best_by asc nulls last, ml.received_on asc nulls last, ml.created_at
      loop
        exit when v_left <= 0;
        v_take := least(v_lot_row.qty, v_left);
        insert into public.material_movements
          (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, created_by)
        values (p_brewery, v_bom.material_id, p_location, p_bin, v_lot_row.lot_id,
                -v_take, 'consumption', v_actor)
        returning id into v_consumption;
        insert into public.packaging_run_consumptions (brewery_id, run_id, movement_id)
        values (p_brewery, p_run, v_consumption);
        v_left := v_left - v_take;
      end loop;
      -- The bin could not cover it: the raise rolls back what was drawn.
      if v_left > 0 then
        raise exception 'only % "%" in that bin; this run needs %', trim_scale(v_need - v_left), v_bom.name, trim_scale(v_need);
      end if;
    end loop;
  end loop;

  -- Packaging never makes beer: what this run put in packages cannot exceed
  -- what the tank held, or the batch's completion residual goes negative for
  -- good with no way to reopen the run (#432).
  select coalesce(sum(bbl), 0) into v_packaged from public.inventory_movements
  where brewery_id = p_brewery and lot_id = v_lot and type = 'production_in';
  if v_packaged > coalesce(v_available, 0) + c_epsilon then
    raise exception 'packaged % bbl but the tank held %; check the package counts', round(v_packaged, 2), round(coalesce(v_available, 0), 2);
  end if;

  update public.packaging_runs set closed_at = now(), bbl_drawn = p_bbl_drawn
  where id = p_run returning * into v_run;

  -- Nor across runs: several closes that each fit their tank can together
  -- package more than the batch had. Refuse the close that tips it over, with
  -- the same arithmetic Complete batch uses, so its operator hears why (#499).
  v_balance := private.batch_volume_balance(p_brewery, v_occupancy.batch_id);
  if (v_balance->>'residualBbl')::numeric < 0 then
    raise exception 'packaged % bbl across this batch''s runs, but the batch had % bbl; check the package counts',
      round((v_balance->>'packagedBbl')::numeric, 2),
      round((v_balance->>'baselineBbl')::numeric - (v_balance->>'attributedBbl')::numeric, 2);
  end if;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

create or replace function private.record_repack_impl(
  p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric,
  p_child_sku uuid, p_child_qty numeric, p_actor uuid
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_ref uuid := private.new_uuid();
  v_parent public.skus; v_child public.skus;
  v_component numeric; v_expected numeric; v_on_hand numeric; v_net numeric;
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

  -- The bin cannot go short. Same balance bin_on_hand reads, at the same grain;
  -- read straight from the ledger because that view is security_invoker.
  -- ponytail: global ledger lock, matching all stock writers; shared stock-key locks at higher throughput.
  lock table public.inventory_movements in share row exclusive mode;
  select coalesce(sum(m.qty), 0) into v_on_hand from public.inventory_movements m
   where m.brewery_id = p_brewery and m.sku_id = p_parent_sku
     and m.location_id = p_location and m.bin_id = p_bin;
  if v_on_hand < p_parent_qty then
    raise exception 'only % on hand in that bin, cannot repack %', v_on_hand, p_parent_qty;
  end if;

  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, created_by)
  -- created_by is the actor assert_staff verified in the public wrapper, not
  -- auth.uid() read again here: the wrapper is the one place identity is proven.
  values (p_brewery, p_parent_sku, p_location, p_bin, -p_parent_qty, 'repack', v_ref, p_actor),
         (p_brewery, p_child_sku,  p_location, p_bin,  p_child_qty,  'repack', v_ref, p_actor);

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
  lock table public.material_movements in share row exclusive mode;
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
end $$;

create or replace view public.material_requirements with (security_invoker = true) as
  with req as (
    select b.brewery_id, ri.material_id, sum(ri.per_bbl_qty * b.planned_bbl) as required, min(b.planned_on) as needed_by
    from batches b join recipe_ingredients ri on ri.recipe_version_id = b.recipe_version_id
    where b.brewed_on is null group by 1,2
    union all
    select r.brewery_id, bom.material_id, sum(case when pm.base_uom = 'each' then ceil(o.qty_planned * bom.qty_per_unit) else o.qty_planned * bom.qty_per_unit end), min(r.planned_on)
    from packaging_runs r join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_bom bom on bom.format_id = s.format_id
    join materials pm on pm.id = bom.material_id
    where r.closed_at is null group by 1,2),
  gap as (
    select req.brewery_id, req.material_id, sum(req.required) as required, min(req.needed_by) as needed_by,
           coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
           sum(req.required) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short
    from req
    left join material_on_hand oh on oh.material_id = req.material_id
    left join material_on_order oo on oo.material_id = req.material_id
    group by 1,2, oh.qty, oo.qty)
  select gap.*, m.name as material_name, m.base_uom, m.purchase_uom, m.purchase_uom_factor,
         ceil(greatest(gap.short, 0) / m.purchase_uom_factor) as purchase_units_short,
         coalesce(c.vendor_id, m.default_vendor_id) as vendor_id, v.name as vendor_name, v.lead_time_days,
         gap.needed_by - v.lead_time_days as buy_by,
         coalesce(gap.needed_by - v.lead_time_days < current_date, false) as out_of_reach,
         c.contract_id, c.qty_available as contract_qty_available, c.unit_cost_cents as contract_unit_cost_cents
  from gap join materials m on m.id = gap.material_id
  left join lateral (
    select cb.contract_id, cb.vendor_id, cb.qty_available, mc.unit_cost_cents
    from contract_balances cb join material_contracts mc on mc.id = cb.contract_id
    where cb.material_id = gap.material_id and cb.qty_available > 0
      and (mc.starts_on is null or mc.starts_on <= current_date) and (mc.ends_on is null or mc.ends_on >= current_date)
    order by mc.ends_on nulls last limit 1) c on true
  left join vendors v on v.id = coalesce(c.vendor_id, m.default_vendor_id);

create or replace view public.packaging_run_requirements with (security_invoker = true) as
  select run_id, brewery_id, material_id, required, on_hand, on_order,
         required - on_hand - on_order as short
  from (
    select r.id as run_id, r.brewery_id, bom.material_id,
           sum(case when pm.base_uom = 'each' then ceil(o.qty_planned * bom.qty_per_unit) else o.qty_planned * bom.qty_per_unit end) as required,
           coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order
    from packaging_runs r
    join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_bom bom on bom.format_id = s.format_id
    join materials pm on pm.id = bom.material_id
    left join material_on_hand oh on oh.material_id = bom.material_id
    left join material_on_order oo on oo.material_id = bom.material_id
    where r.closed_at is null
    group by r.id, bom.material_id, oh.qty, oo.qty
  ) req;

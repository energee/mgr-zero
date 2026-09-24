-- A packaging close that tips the batch's packaged total past its baseline is
-- refused at the close, not later at Complete batch (#499). The batch volume
-- arithmetic moves out of private.batch_completion_calculation into a
-- non-raising private.batch_volume_balance, which both completion and
-- close_packaging_run call. close_packaging_run is otherwise a copy of
-- 20260924190000 (#436, including its material ledger lock), and
-- batch_completion_calculation keeps 20260924040000's rule (#431): only a
-- negative baseline is refused, so a zero-baseline batch still completes.

-- A batch's volume balance: what it had (baseline), what closed runs put in
-- packages, what losses and removals account for, and what is left over
-- (residual). Never raises; the callers decide what a negative residual means.
create function private.batch_volume_balance(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_initial numeric; v_in numeric; v_out numeric;
  v_physical numeric; v_packaged numeric; v_transfer_loss numeric; v_removals numeric;
  v_baseline numeric; v_attributed numeric;
begin
  select coalesce(sum(o.initial_bbl), 0) into v_initial
    from public.vessel_occupancies o where o.brewery_id = p_brewery and o.batch_id = p_batch;
  select coalesce(sum(t.bbl), 0) into v_in
    from public.transfers t
    join public.vessel_occupancies destination on destination.id = t.to_occupancy_id
    join public.vessel_occupancies source on source.id = t.from_occupancy_id
    where destination.brewery_id = p_brewery and destination.batch_id = p_batch and source.batch_id <> p_batch;
  select coalesce(sum(t.bbl), 0) into v_out
    from public.transfers t
    join public.vessel_occupancies source on source.id = t.from_occupancy_id
    join public.vessel_occupancies destination on destination.id = t.to_occupancy_id
    where source.brewery_id = p_brewery and source.batch_id = p_batch and destination.batch_id <> p_batch;
  select coalesce(sum(a.bbl), 0) into v_physical
    from public.volume_adjustments a join public.vessel_occupancies o on o.id = a.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and a.affects_occupancy
      and a.removal_class is null and a.reason in ('gain','measurement');
  select coalesce(sum(m.bbl), 0) into v_packaged
    from public.packaging_runs r
    join public.vessel_occupancies o on o.id = r.occupancy_id
    join public.packaging_run_outputs output on output.run_id = r.id
    join public.inventory_movements m on m.id = output.movement_id and m.brewery_id = r.brewery_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and r.closed_at is not null
      and m.type = 'production_in' and m.bbl > 0;
  select coalesce(sum(t.loss_bbl), 0) into v_transfer_loss
    from public.transfers t join public.vessel_occupancies o on o.id = t.from_occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch;
  select coalesce(sum(a.bbl), 0) into v_removals
    from public.volume_adjustments a join public.vessel_occupancies o on o.id = a.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and a.removal_class is not null;

  v_baseline := v_initial + v_in - v_out + v_physical;
  v_attributed := v_transfer_loss - v_removals;
  return jsonb_build_object(
    'baselineBbl', v_baseline, 'packagedBbl', v_packaged, 'attributedBbl', v_attributed,
    'residualBbl', v_baseline - v_packaged - v_attributed);
end $$;
revoke all on function private.batch_volume_balance(uuid, uuid) from public, anon, authenticated, service_role;

-- One formula owns both the advisory preview and the authoritative completion;
-- the volume arithmetic is private.batch_volume_balance's, this adds the
-- refusals and the threshold.
create or replace function private.batch_completion_calculation(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batch public.batches; v_balance jsonb; v_baseline numeric; v_residual numeric;
begin
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.brewed_on is null then raise exception 'batch has not been brewed'; end if;
  if v_batch.closed_at is not null then raise exception 'batch is already completed'; end if;

  if not exists (select 1 from public.vessel_occupancies o where o.brewery_id = p_brewery and o.batch_id = p_batch)
    then raise exception 'batch has no authoritative occupancy'; end if;
  if exists (
    select 1 from public.packaging_runs r join public.vessel_occupancies o on o.id = r.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and r.closed_at is null
  ) then raise exception 'a packaging run is still open for this batch'; end if;

  v_balance := private.batch_volume_balance(p_brewery, p_batch);
  v_baseline := (v_balance->>'baselineBbl')::numeric;
  v_residual := (v_balance->>'residualBbl')::numeric;
  if v_baseline < 0 then raise exception 'batch completion baseline must not be negative'; end if;
  if v_residual < 0 then raise exception 'batch has a negative completion residual; packaged and attributed volume exceed its baseline'; end if;
  return v_balance || jsonb_build_object(
    'batchId', p_batch, 'closedAt', null,
    'thresholdBbl', greatest(0.05::numeric, v_baseline * 0.005::numeric), 'adjustmentId', null);
end $$;

create or replace function public.close_packaging_run(
  p_brewery uuid, p_run uuid, p_bbl_drawn numeric, p_outputs jsonb, p_lot_code text,
  p_packaged_on date, p_best_by date, p_location uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_run public.packaging_runs; v_lot uuid; v_available numeric;
  v_occupancy public.vessel_occupancies;
  v_line jsonb; v_sku uuid; v_qty numeric; v_format uuid;
  v_movement uuid; v_consumption uuid; v_bom record; v_packaged numeric;
  v_need numeric; v_on_hand numeric; v_balance jsonb;
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
      if v_bom.lot_tracked then
        -- ponytail: which lot of crowns went into a run is a real question with
        -- no UI behind it yet (FEFO or an explicit pick), and enforce_material_lot
        -- would reject a null lot_id anyway. Refuse loudly rather than invent one.
        -- Upgrade path: take a lot_id per BOM line on the close input.
        raise exception 'cannot post BOM for lot-tracked material "%" yet', v_bom.name;
      end if;
      -- Nobody consumes three-quarters of a can: a counted material is drawn
      -- in whole units, rounded up (brewing-domain.md, BOM & packaging).
      -- 'each' is the only count unit in public.uom; the rest are weighed or
      -- measured and stay exact.
      v_need := v_bom.qty_per_unit * v_qty;
      if v_bom.base_uom = 'each' then v_need := ceil(v_need); end if;
      -- The draw comes off the bin the goods land on, and that bin has to hold
      -- it. Earlier lines of this close are already in the ledger, so a
      -- material shared by two packages is checked against what is left.
      select coalesce(sum(qty), 0) into v_on_hand from public.material_bin_on_hand
      where brewery_id = p_brewery and material_id = v_bom.material_id
        and location_id = p_location and bin_id = p_bin;
      if v_need > v_on_hand then
        raise exception 'only % "%" in that bin; this run needs %', trim_scale(v_on_hand), v_bom.name, trim_scale(v_need);
      end if;
      insert into public.material_movements
        (brewery_id, material_id, location_id, bin_id, qty, type, created_by)
      values (p_brewery, v_bom.material_id, p_location, p_bin,
              -v_need, 'consumption', v_actor)
      returning id into v_consumption;
      insert into public.packaging_run_consumptions (brewery_id, run_id, movement_id)
      values (p_brewery, p_run, v_consumption);
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

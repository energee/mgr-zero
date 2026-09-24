-- close_packaging_run refuses a close that packages more beer than the tank held (#432).
create or replace function public.close_packaging_run(
  p_brewery uuid, p_run uuid, p_bbl_drawn numeric, p_outputs jsonb, p_lot_code text,
  p_packaged_on date, p_best_by date, p_location uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_run public.packaging_runs; v_lot uuid; v_available numeric;
  v_occupancy public.vessel_occupancies;
  v_line jsonb; v_sku uuid; v_qty numeric; v_format uuid;
  v_movement uuid; v_consumption uuid; v_bom record; v_packaged numeric;
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
      select fb.material_id, fb.qty_per_unit, m.name, m.lot_tracked
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
      insert into public.material_movements
        (brewery_id, material_id, location_id, bin_id, qty, type, created_by)
      values (p_brewery, v_bom.material_id, p_location, p_bin,
              -(v_bom.qty_per_unit * v_qty), 'consumption', v_actor)
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

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

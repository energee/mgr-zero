-- A batch started by a cellar transfer (20261116120000_batch_split.sql) has no
-- brew record, so its packaged beer froze with no cost. The owner's rule: a
-- split divides the source batch's cost by how much is split off. The beer that
-- moves carries the source's cost per barrel; the source just packages fewer
-- barrels. One function now owns the beer's cost per barrel, and the two
-- procedures that freeze package cost call it.

-- What a barrel of this batch's beer cost, in cents; null means uncosted.
-- A brewed batch: its ingredient cost over the knockout of its current brew
-- records, exactly as close_packaging_run computed it inline before.
-- A batch started by a transfer (no current brew record): the barrels
-- transferred in from other batches, each at its source batch's cost per barrel,
-- plus the batch's own additions, over the barrels transferred in.
-- p_depth counts the steps back through source batches. Two transfer-started
-- batches can blend into each other, so past 10 steps the answer is null: the
-- same "uncosted" a missing receipt price gives, never a guessed number.
-- Ceiling: the source batch's cost per barrel is read when the split batch's
-- run closes or is corrected, not when the beer moved. An addition to the
-- source after the split is shared by a split batch packaged after it, and not
-- by one packaged before. If that matters, freeze the source's cost per barrel
-- on the transfers row at split time and read it here.
create function private.batch_liquid_cost_per_bbl(p_brewery uuid, p_batch uuid, p_depth integer default 0)
returns numeric language plpgsql stable set search_path = '' as $$
declare
  v_knockout_bbl numeric; v_bbl_in numeric; v_carried numeric; v_own numeric;
begin
  -- Knockout is every brew turn's current revision (correct_brew_record leaves
  -- vessel_occupancies.initial_bbl at the original value), not the
  -- transfer-adjusted baseline.
  select sum(record.initial_bbl) into v_knockout_bbl from public.brew_records record
    where record.brewery_id = p_brewery and record.batch_id = p_batch
      and not exists (select 1 from public.brew_records later where later.corrects_id = record.id);
  if v_knockout_bbl is not null then
    return private.batch_material_cost(p_brewery, p_batch) / nullif(v_knockout_bbl, 0);
  end if;

  if p_depth >= 10 then return null; end if;

  -- One source batch with no cost leaves the whole batch uncosted.
  select sum(moved.bbl),
         case when bool_and(source.cost_per_bbl is not null) then sum(moved.bbl * source.cost_per_bbl) end
    into v_bbl_in, v_carried
  from (
    select from_occupancy.batch_id, sum(transfer.bbl) as bbl
    from public.transfers transfer
    join public.vessel_occupancies to_occupancy on to_occupancy.id = transfer.to_occupancy_id
    join public.vessel_occupancies from_occupancy on from_occupancy.id = transfer.from_occupancy_id
    where transfer.brewery_id = p_brewery and to_occupancy.batch_id = p_batch
      and from_occupancy.batch_id <> p_batch
    group by from_occupancy.batch_id
  ) moved
  cross join lateral (
    select private.batch_liquid_cost_per_bbl(p_brewery, moved.batch_id, p_depth + 1) as cost_per_bbl
  ) source;

  -- private.batch_material_cost is null for a batch with no additions, which
  -- here costs nothing extra rather than being uncosted.
  if exists (
    select 1 from public.batch_additions addition
    where addition.brewery_id = p_brewery and addition.batch_id = p_batch
      and not exists (select 1 from public.material_movements reversal where reversal.compensates_id = addition.movement_id)
  ) then
    v_own := private.batch_material_cost(p_brewery, p_batch);
  else
    v_own := 0;
  end if;

  -- No transfer in means no barrels to divide by: null, as before.
  return (v_carried + v_own) / v_bbl_in;
end $$;
revoke all on function private.batch_liquid_cost_per_bbl(uuid, uuid, integer) from public, anon, authenticated, service_role;

-- close_packaging_run as in 20261027170000_close_run_whole_kegs.sql; only the
-- cost per barrel changed, from the inline brew-record division to the function.
create or replace function public.close_packaging_run(
  p_brewery uuid, p_run uuid, p_bbl_drawn numeric, p_outputs jsonb, p_lot_code text,
  p_packaged_on date, p_best_by date, p_location uuid, p_bin uuid, p_request_id uuid,
  p_actuals jsonb default null, p_plan_revision text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan jsonb; v_record uuid; v_hash jsonb;
  v_actor uuid; v_replay jsonb; v_run public.packaging_runs; v_lot uuid; v_available numeric;
  v_occupancy public.vessel_occupancies;
  v_line jsonb; v_sku uuid; v_qty numeric; v_format uuid;
  v_movement uuid; v_packaged numeric; v_balance jsonb; v_drawn numeric;
  v_cost_per_bbl numeric;
  -- Allow half the stored tank/draw precision (numeric(10,3)); compare frozen
  -- output volume without rounding it to that precision.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_hash := jsonb_build_object('brewery',p_brewery,'run',p_run,'bbl_drawn',p_bbl_drawn,
    'outputs',p_outputs,'lot_code',p_lot_code,'packaged_on',p_packaged_on,
    'best_by',p_best_by,'location',p_location,'bin',p_bin);
  -- Omitted new fields retain old completed request identity, never a new
  -- theoretical close. Claim/replay precedes all new validation.
  if p_actuals is not null then v_hash := v_hash||jsonb_build_object('actuals',p_actuals,'plan_revision',p_plan_revision); end if;
  v_replay := private.claim_command_request(p_brewery,'close_packaging_run',p_request_id,v_hash);
  if v_replay is not null then return v_replay; end if;

  if p_bbl_drawn is null or p_bbl_drawn < 0 or p_bbl_drawn::text in ('NaN','Infinity','-Infinity') then
    raise exception 'barrels drawn must be nonnegative and finite';
  end if;
  -- Match the stored numeric(10,3) draw, but retain raw input in replay identity
  -- and the existing tank guard so rounding never admits a previously refused draw.
  v_drawn := round(p_bbl_drawn, 3);

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;
  if v_run.cancelled_at is not null then raise exception 'packaging run is cancelled'; end if;
  -- The check constraint says the same thing as a constraint name; these are
  -- the two sentences a brewer would actually say.
  if v_run.occupancy_id is null then
    raise exception 'pick the tank this run drew from before closing it';
  end if;
  if v_run.started_at is null then raise exception 'start the run before closing it'; end if;

  -- Filing takes this same workflow lock, so the date check cannot race it.
  if p_packaged_on is null then raise exception 'packaged on is required'; end if;
  if p_packaged_on > (select (now() at time zone timezone)::date from public.breweries where id = p_brewery) then
    raise exception 'packaged on % is after today; enter the day the beer was packaged', p_packaged_on;
  end if;
  if exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null and period_end >= p_packaged_on) then
    raise exception 'packaged on % is inside a filed report period; packaging cannot be dated into a filed month', p_packaged_on;
  end if;

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

  perform private.lock_packaging_materials();
  v_plan := public.packaging_material_plan(p_brewery,(select coalesce(jsonb_agg(jsonb_build_object('sku_id',sku_id,'qty_planned',qty_planned) order by sku_id),'[]'::jsonb) from public.packaging_run_outputs where run_id=p_run));
  if p_actuals is null or p_plan_revision is null then raise exception 'review packaging material plan and confirm actuals before closing'; end if;
  if p_plan_revision is distinct from encode(extensions.digest(v_plan::text,'sha256'),'hex') then raise exception 'Packaging material plan changed. Review it again.' using errcode='MG412'; end if;
  insert into public.packaging_material_records(brewery_id,run_id,planned,created_by)
    values(p_brewery,p_run,v_plan,v_actor) returning id into v_record;
  perform private.append_packaging_actuals(v_record,p_actuals);

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
    -- A keg is a whole container: check the raw value before numeric(12,2)
    -- rounds it, as private.replace_packaging_run_outputs does for planned kegs.
    if (v_qty::text in ('NaN', 'Infinity', '-Infinity') or v_qty <> trunc(v_qty)) and exists (
         select 1 from public.skus s join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
         where s.id = v_sku and s.brewery_id = p_brewery and f.package_type = 'keg') then
      raise exception 'Enter a whole number of kegs.';
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
      (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, ref, created_by, occurred_on)
    values (p_brewery, v_sku, p_location, p_bin, v_qty, 'production_in', v_lot, p_run, v_actor, p_packaged_on)
    returning id into v_movement;
    update public.packaging_run_outputs set qty_actual = v_qty, movement_id = v_movement
    where run_id = p_run and sku_id = v_sku;

  end loop;

  -- Packaging never makes beer: what this run put in packages cannot exceed
  -- what the tank held, or the batch's completion residual goes negative for
  -- good with no way to reopen the run (#432).
  select coalesce(sum(bbl), 0) into v_packaged from public.inventory_movements
  where brewery_id = p_brewery and lot_id = v_lot and type = 'production_in';
  if v_packaged > coalesce(v_available, 0) + c_epsilon then
    raise exception 'packaged % bbl but the tank held %; check the package counts', round(v_packaged, 2), round(coalesce(v_available, 0), 2);
  end if;

  -- Tank availability is not the run's draw: packages cannot create beer (#723).
  if v_packaged > v_drawn + c_epsilon then
    raise exception 'packaged % bbl but only % bbl drawn; check the barrels drawn and package counts', v_packaged, v_drawn;
  end if;

  update public.packaging_runs set closed_at = now(), bbl_drawn = v_drawn
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

  -- Freeze after all conservation checks. The beer's cost per barrel is
  -- private.batch_liquid_cost_per_bbl; draw loss is absorbed here.
  if v_packaged > 0 then
    v_cost_per_bbl := private.batch_liquid_cost_per_bbl(p_brewery, v_occupancy.batch_id);
    update public.packaging_run_outputs output set unit_cost_cents =
      v_cost_per_bbl * v_drawn / v_packaged * (movement.bbl / movement.qty)
      + (select case when count(*)=0 then 0
                when bool_and(cost.unit_cost_cents is not null)
                then sum(bom.qty_per_unit * cost.unit_cost_cents) end
         from public.format_bom bom
         left join lateral (
           select actual.lot_id from public.packaging_material_actuals actual
           where actual.record_id=v_record and actual.material_id=bom.material_id
           order by actual.qty_used desc,actual.lot_id limit 1
         ) actual_source on true
         cross join lateral (
           select private.material_source_cost(p_brewery,bom.material_id,actual_source.lot_id) as unit_cost_cents
         ) cost
         where bom.brewery_id=p_brewery and bom.format_id=sku.format_id)
      from public.inventory_movements movement, public.skus sku
      where output.brewery_id=p_brewery and output.run_id=p_run and output.qty_actual>0
        and movement.id=output.movement_id and movement.brewery_id=p_brewery
        and sku.id=output.sku_id and sku.brewery_id=p_brewery;
  end if;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

-- correct_packaging_run_outputs as in
-- 20261030032503_packaging_output_draw_rounding_guard.sql; the same one change.
create or replace function public.correct_packaging_run_outputs(
  p_brewery uuid,p_run uuid,p_previous uuid,p_reason text,p_bbl_drawn numeric,
  p_outputs jsonb,p_location uuid,p_bin uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid; replay jsonb; run public.packaging_runs; lot public.lots;
  occupancy public.vessel_occupancies; batch public.batches; previous uuid;
  correction public.packaging_output_corrections; source public.inventory_movements;
  line jsonb; sku uuid; qty numeric; movement uuid; available numeric; packaged numeric;
  drawn numeric; before_outputs jsonb; replacement_outputs jsonb; balance jsonb; current_material_record uuid;
  cost_per_bbl numeric;
  c_epsilon constant numeric := 0.0005;
begin
  actor := private.assert_staff(p_brewery,array['admin','brewer','warehouse']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery,'correct_packaging_run_outputs',p_request_id,
    jsonb_build_object('run',p_run,'previous',p_previous,'reason',p_reason,'bbl_drawn',p_bbl_drawn,
      'outputs',p_outputs,'location',p_location,'bin',p_bin));
  if replay is not null then return replay; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'correction reason required'; end if;
  if p_bbl_drawn is null or p_bbl_drawn<0 or p_bbl_drawn::text in ('NaN','Infinity','-Infinity') then
    raise exception 'barrels drawn must be nonnegative and finite';
  end if;
  drawn := round(p_bbl_drawn,3);
  perform private.lock_cellar_workflow(p_brewery);
  select * into run from public.packaging_runs where id=p_run and brewery_id=p_brewery for update;
  if run.id is null then raise exception 'packaging run not found'; end if;
  if run.closed_at is null then raise exception 'only a closed packaging run can be corrected'; end if;
  if run.occupancy_id is null then raise exception 'historical packaging has no stock outputs to correct'; end if;
  select c.id into previous from public.packaging_output_corrections c
    where c.run_id=p_run and not exists(select 1 from public.packaging_output_corrections later where later.corrects_id=c.id);
  if previous is distinct from p_previous then raise exception 'output record already corrected; reload current revision' using errcode='MG409'; end if;
  select * into occupancy from public.vessel_occupancies where id=run.occupancy_id for update;
  select * into batch from public.batches where id=occupancy.batch_id for update;
  if batch.closed_at is not null then raise exception 'completed batch prevents output correction'; end if;
  if occupancy.ended_at is not null and drawn<run.bbl_drawn then
    raise exception 'cannot reduce barrels drawn after the source tank was emptied';
  end if;
  select * into lot from public.lots where packaging_run_id=p_run;
  if exists(select 1 from public.report_filings where brewery_id=p_brewery and filed_at is not null and period_end>=lot.packaged_on) then
    raise exception 'a filed report prevents output correction';
  end if;
  perform private.lock_packaging_materials();
  if exists(select 1 from public.inventory_movements where brewery_id=p_brewery and lot_id=lot.id and type<>'production_in') then
    raise exception 'sold, transferred, repacked, or adjusted finished goods prevent output correction';
  end if;
  if not exists(select 1 from public.bins where id=p_bin and location_id=p_location and brewery_id=p_brewery) then
    raise exception 'bin does not belong to that location';
  end if;
  if exists(select 1 from public.inventory_movements where lot_id=lot.id and (location_id<>p_location or bin_id<>p_bin)) then
    raise exception 'output correction must retain the original finished goods bin';
  end if;
  perform private.assert_one_line_per_sku(p_outputs);
  for line in select * from jsonb_array_elements(p_outputs) loop
    sku := (line->>'sku_id')::uuid;
    qty := (line->>'qty_actual')::numeric;
    if qty is null or qty<0 or qty>9999999999.99 or qty::text in ('NaN','Infinity','-Infinity') then
      raise exception 'qty_actual must be nonnegative, finite and at most 9999999999.99';
    end if;
    if not exists(select 1 from public.packaging_run_outputs where run_id=p_run and sku_id=sku) then
      raise exception 'sku % is not one of this run''s planned outputs',sku;
    end if;
    if qty<>trunc(qty) and exists(select 1 from public.skus s join public.formats f on f.id=s.format_id
      where s.id=sku and f.package_type='keg') then raise exception 'Enter a whole number of kegs.'; end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(o) order by o.sku_id),'[]'::jsonb) into before_outputs
    from public.packaging_run_outputs o where o.run_id=p_run;
  -- The audit and stock writes share the complete quantities actually applied.
  select coalesce(jsonb_agg(jsonb_build_object('sku_id',o.sku_id,
    'qty_actual',round(coalesce((input->>'qty_actual')::numeric,0),2)) order by o.sku_id),'[]'::jsonb)
    into replacement_outputs
    from public.packaging_run_outputs o
    left join jsonb_array_elements(p_outputs) input on (input->>'sku_id')::uuid=o.sku_id
    where o.run_id=p_run;
  insert into public.packaging_output_corrections(brewery_id,run_id,corrects_id,reason,
    previous_bbl_drawn,replacement_bbl_drawn,previous_outputs,replacement_outputs,created_by)
  values(p_brewery,p_run,previous,trim(p_reason),run.bbl_drawn,drawn,before_outputs,replacement_outputs,actor) returning * into correction;
  for source in select m.* from public.packaging_run_outputs o join public.inventory_movements m on m.id=o.movement_id
    where o.run_id=p_run loop
    insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,compensates_id,ref,note,created_by,occurred_on)
      values(p_brewery,source.sku_id,source.location_id,source.bin_id,lot.id,-source.qty,'production_in',source.id,correction.id,p_reason,actor,source.occurred_on);
  end loop;
  update public.packaging_run_outputs set qty_actual=0,movement_id=null,unit_cost_cents=null where run_id=p_run;
  for line in select * from jsonb_array_elements(replacement_outputs) loop
    sku := (line->>'sku_id')::uuid;
    qty := (line->>'qty_actual')::numeric;
    if qty=0 then continue; end if;
    insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,ref,created_by,occurred_on)
      values(p_brewery,sku,p_location,p_bin,lot.id,qty,'production_in',p_run,actor,lot.packaged_on) returning id into movement;
    update public.packaging_run_outputs set qty_actual=qty,movement_id=movement where run_id=p_run and sku_id=sku;
  end loop;
  select coalesce(sum(m.bbl),0) into packaged from public.packaging_run_outputs o
    join public.inventory_movements m on m.id=o.movement_id where o.run_id=p_run;
  select bbl+run.bbl_drawn into available from public.occupancy_volumes where occupancy_id=occupancy.id;
  if p_bbl_drawn>available+c_epsilon or drawn>available then raise exception 'only % bbl available for this run; asked to draw %',available,p_bbl_drawn; end if;
  if packaged>available+c_epsilon then raise exception 'packaged % bbl but only % bbl available for this run',packaged,available; end if;
  if packaged>drawn+c_epsilon then raise exception 'packaged % bbl but only % bbl drawn; check the barrels drawn and package counts',packaged,drawn; end if;
  update public.packaging_runs set bbl_drawn=drawn where id=p_run returning * into run;
  balance := private.batch_volume_balance(p_brewery,occupancy.batch_id);
  if (balance->>'residualBbl')::numeric<0 then raise exception 'packaged outputs exceed this batch''s available volume'; end if;

  -- Replacement outputs use the same costing formula as a close. Actual source
  -- usage is unchanged, and the current material record still owns those sources.
  if packaged>0 then
    cost_per_bbl := private.batch_liquid_cost_per_bbl(p_brewery,occupancy.batch_id);
    select r.id into current_material_record from public.packaging_material_records r where r.run_id=p_run
      and not exists(select 1 from public.packaging_material_records later where later.corrects_id=r.id);
    update public.packaging_run_outputs output set unit_cost_cents =
      cost_per_bbl*drawn/packaged*(m.bbl/m.qty)
      + (select case when count(*)=0 then 0 when bool_and(cost.unit_cost_cents is not null)
          then sum(bom.qty_per_unit*cost.unit_cost_cents) end
         from public.format_bom bom
         left join lateral (select a.lot_id from public.packaging_material_actuals a
           where a.record_id=current_material_record and a.material_id=bom.material_id order by a.qty_used desc,a.lot_id limit 1) actual_source on true
         cross join lateral (select private.material_source_cost(p_brewery,bom.material_id,actual_source.lot_id) as unit_cost_cents) cost
         where bom.brewery_id=p_brewery and bom.format_id=s.format_id)
      from public.inventory_movements m,public.skus s where output.run_id=p_run and output.qty_actual>0
        and m.id=output.movement_id and s.id=output.sku_id;
  end if;
  return private.complete_command_request(p_request_id,jsonb_build_object('run',to_jsonb(run),'correction',to_jsonb(correction)));
end $$;

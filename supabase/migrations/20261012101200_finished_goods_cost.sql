-- #810 PR1: freeze package cost and current inventory value. Packaging close
-- otherwise retains 20261001205704_packaging_draw_conservation.sql verbatim.
alter table public.packaging_run_outputs add column unit_cost_cents numeric
  check (unit_cost_cents >= 0);
comment on column public.packaging_run_outputs.unit_cost_cents is
  'Cost per package frozen at close. Null means an input has no cost; historical runs are not backfilled.';

-- A tracked lot uses only its own newest uncorrected receipt, never another
-- lot's latest price. Untracked material uses the existing last-cost owner.
create function private.material_source_cost(p_brewery uuid,p_material uuid,p_lot uuid)
returns numeric language sql stable set search_path='' as $$
  select case when material.lot_tracked then
    -- Use the same economic receipt order as material_last_cost: correcting
    -- an old receipt does not make it the newest purchase. A newest null
    -- price, or an absent tracked source, stays uncosted rather than falling back.
    (select movement.unit_cost_cents from public.material_movements movement
     left join public.receipt_lines receipt on receipt.movement_id=movement.id
       and receipt.brewery_id=movement.brewery_id
     where movement.brewery_id=p_brewery and movement.material_id=p_material and movement.lot_id=p_lot
       and movement.type='receipt'
       and not exists(select 1 from public.material_movements reversal where reversal.compensates_id=movement.id)
     order by coalesce(receipt.cost_recorded_at,movement.created_at) desc,
       coalesce(receipt.cost_order_id,receipt.receipt_id,movement.id) desc,movement.id desc limit 1)
  else
    (select cost.unit_cost_cents from public.material_last_cost cost
     where cost.brewery_id=p_brewery and cost.material_id=p_material)
  end
  from public.materials material where material.brewery_id=p_brewery and material.id=p_material;
$$;
revoke all on function private.material_source_cost(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Batch additions link the actual consumption. Corrections compensate the
-- original movement; exclude it rather than counting both recipe revisions.
create function private.batch_material_cost(p_brewery uuid,p_batch uuid)
returns numeric language sql stable set search_path='' as $$
  select case when bool_and(cost.unit_cost_cents is not null)
    then sum(-movement.qty * cost.unit_cost_cents) end
  from public.batch_additions addition
  join public.material_movements movement on movement.id=addition.movement_id
    and movement.brewery_id=addition.brewery_id
  cross join lateral (
    select private.material_source_cost(movement.brewery_id,movement.material_id,movement.lot_id) as unit_cost_cents
  ) cost
  where addition.brewery_id=p_brewery and addition.batch_id=p_batch
    and not exists(select 1 from public.material_movements reversal where reversal.compensates_id=movement.id);
$$;
revoke all on function private.batch_material_cost(uuid,uuid) from public,anon,authenticated,service_role;

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
  v_liquid numeric; v_knockout_bbl numeric; v_cost_per_bbl numeric;
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

  -- Freeze after all conservation checks. Knockout includes every brew turn,
  -- not the transfer-adjusted operational baseline; draw loss is absorbed here.
  if v_packaged > 0 then
    v_liquid := private.batch_material_cost(p_brewery, v_occupancy.batch_id);
    select sum(o.initial_bbl) into v_knockout_bbl from public.vessel_occupancies o
      where o.brewery_id=p_brewery and o.batch_id=v_occupancy.batch_id;
    v_cost_per_bbl := v_liquid / nullif(v_knockout_bbl,0);
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

revoke all on function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text) to authenticated;

-- Costed stock is valued at frozen lot/SKU cost. Lot-less stock and repack
-- children with no original output cost remain explicitly uncosted.
create view public.sku_inventory_value with (security_invoker=true) as
  select movement.brewery_id,movement.sku_id,sum(movement.qty) as qty,
    sum(movement.qty * output.unit_cost_cents) filter(where output.unit_cost_cents is not null) as value_cents,
    coalesce(sum(movement.qty) filter(where output.unit_cost_cents is null),0) as uncosted_qty
  from public.inventory_movements movement
  left join public.lots lot on lot.id=movement.lot_id and lot.brewery_id=movement.brewery_id
  left join public.packaging_run_outputs output on output.run_id=lot.packaging_run_id
    and output.sku_id=movement.sku_id and output.brewery_id=movement.brewery_id
  group by movement.brewery_id,movement.sku_id having sum(movement.qty)<>0;
revoke all on public.sku_inventory_value from public,anon,authenticated;
grant select on public.sku_inventory_value to authenticated;
grant all on public.sku_inventory_value to postgres,service_role;

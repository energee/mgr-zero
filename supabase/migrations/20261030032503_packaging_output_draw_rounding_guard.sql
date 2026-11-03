-- #1626: the rounded stored draw must fit the source tank as well as the raw input.
-- Preserve raw request identity, applied output snapshots, and earlier migrations.
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
  liquid numeric; knockout numeric; cost_per_bbl numeric;
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
    liquid := private.batch_material_cost(p_brewery,occupancy.batch_id);
    select sum(r.initial_bbl) into knockout from public.brew_records r where r.brewery_id=p_brewery and r.batch_id=occupancy.batch_id
      and not exists(select 1 from public.brew_records later where later.corrects_id=r.id);
    cost_per_bbl := liquid/nullif(knockout,0);
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
revoke all on function public.correct_packaging_run_outputs(uuid,uuid,uuid,text,numeric,jsonb,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.correct_packaging_run_outputs(uuid,uuid,uuid,text,numeric,jsonb,uuid,uuid,uuid) to authenticated;

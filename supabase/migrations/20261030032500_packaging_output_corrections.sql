-- #1626: correct unused closed-run outputs without rewriting the stock ledger.
create table public.packaging_output_corrections (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id), run_id uuid not null,
  corrects_id uuid unique,
  reason text not null check(length(trim(reason))>0),
  previous_bbl_drawn numeric(10,3) not null,
  replacement_bbl_drawn numeric(10,3) not null,
  previous_outputs jsonb not null, replacement_outputs jsonb not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(id,brewery_id),
  foreign key(run_id,brewery_id) references public.packaging_runs(id,brewery_id),
  foreign key(corrects_id,brewery_id) references public.packaging_output_corrections(id,brewery_id)
);
create unique index packaging_output_corrections_original on public.packaging_output_corrections(run_id) where corrects_id is null;
create index packaging_output_corrections_run on public.packaging_output_corrections(brewery_id,run_id,created_at);
alter table public.packaging_output_corrections enable row level security;
create policy staff_read on public.packaging_output_corrections for select to authenticated using (
  brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','brewer','warehouse']::public.staff_role[]))
);
grant select on public.packaging_output_corrections to authenticated;
revoke all on public.packaging_output_corrections from anon,service_role;

-- A reversal retains the original production classification and frozen barrels.
-- The trigger admits it only through an existing correction's exact source graph.
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
    when 'production_in'    then (qty > 0 or compensates_id is not null) and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'return_in'        then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'adjustment'       then sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'taproom_transfer' then sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'location_transfer' then sale_channel_id is null and dest_state is null and tax_treatment is null
    when 'repack'           then sale_channel_id is null and dest_state is null and tax_treatment is null
    else true
  end);

create or replace function public.enforce_bbl_integrity() returns trigger language plpgsql set search_path = '' as $$
declare original public.inventory_movements; returned_qty numeric; returned_bbl numeric; root_line record;
begin
  if new.compensates_id is not null then
    select * into original from public.inventory_movements where id = new.compensates_id and brewery_id = new.brewery_id;
    if original.id is null or original.id = new.id or original.compensates_id is not null
       or original.source_movement_id is not null or original.correction_source_id is not null
       or new.source_movement_id is not null or new.correction_source_id is not null
       or (new.sku_id, new.location_id, new.bin_id, new.lot_id, new.type, new.sale_channel_id, new.tax_treatment, new.dest_state)
          is distinct from (original.sku_id, original.location_id, original.bin_id, original.lot_id, original.type, original.sale_channel_id, original.tax_treatment, original.dest_state)
       or new.qty <> -original.qty then raise exception 'invalid movement compensation'; end if;
    if original.type in ('adjustment','loss') then
      if original.ref is not null or new.ref is not null then raise exception 'invalid standalone movement compensation'; end if;
    elsif original.type = 'production_in' then
      if original.ref is null or new.qty >= 0 or new.occurred_on <> original.occurred_on
         or not exists (
           select 1 from public.packaging_output_corrections correction
           cross join lateral jsonb_array_elements(correction.previous_outputs) output
           where correction.id=new.ref and correction.brewery_id=new.brewery_id
             and correction.run_id=original.ref and (output->>'movement_id')::uuid=original.id
         ) then raise exception 'invalid packaging output compensation'; end if;
    elsif original.type = 'depletion' then
      select l.* into root_line from public.taproom_count_lines l
      join public.taproom_counts root on root.id=l.count_id and root.brewery_id=l.brewery_id and root.corrects_count_id is null
      join public.taproom_counts correction on correction.id=new.ref and correction.brewery_id=l.brewery_id
        and correction.location_id=l.location_id and correction.corrects_count_id=root.id
      where l.brewery_id=new.brewery_id and l.movement_id=original.id and original.ref=root.id;
      if root_line.id is null or new.type <> 'depletion' or new.qty <= 0 then raise exception 'invalid count compensation'; end if;
    else
      raise exception 'invalid standalone movement compensation';
    end if;
    new.bbl := -original.bbl;
    new.package_type := original.package_type;
    return new;
  end if;
  if new.correction_source_id is not null then
    select * into original from public.inventory_movements where id = new.correction_source_id and brewery_id = new.brewery_id;
    select l.* into root_line from public.taproom_count_lines l
    join public.taproom_counts root on root.id=l.count_id and root.brewery_id=l.brewery_id and root.corrects_count_id is null
    join public.taproom_counts correction on correction.id=new.ref and correction.brewery_id=l.brewery_id
      and correction.location_id=l.location_id and correction.corrects_count_id=root.id
    where l.brewery_id=new.brewery_id and l.movement_id=original.id and original.ref=root.id;
    if original.id is null or root_line.id is null or original.type <> 'depletion' or new.type <> 'depletion'
       or original.compensates_id is not null or original.source_movement_id is not null or original.correction_source_id is not null
       or (new.sku_id, new.location_id, new.bin_id, new.lot_id, new.sale_channel_id, new.tax_treatment, new.dest_state)
          is distinct from (original.sku_id, original.location_id, original.bin_id, original.lot_id, original.sale_channel_id, original.tax_treatment, original.dest_state)
       or new.qty >= 0 or root_line.qty_before + new.qty <= root_line.qty_counted
       or root_line.qty_before + new.qty >= root_line.qty_before then raise exception 'invalid corrected-count replacement'; end if;
    new.bbl := round(original.bbl * new.qty / original.qty, 8);
    new.package_type := original.package_type;
    return new;
  end if;
  if new.source_movement_id is not null then
    select * into original from public.inventory_movements where id = new.source_movement_id and brewery_id = new.brewery_id;
    if original.id is null or original.sku_id <> new.sku_id or original.lot_id is distinct from new.lot_id
       or not ((new.type = 'return_in' and original.type = 'sale_removal' and new.qty > 0 and new.qty <= -original.qty)
            or (new.type = 'loss' and original.type = 'return_in' and new.qty = -original.qty and new.ref = original.ref)) then
      raise exception 'invalid movement compensation source';
    end if;
    new.package_type := original.package_type;
    -- The original volume is a frozen fact, even after a format is edited.
    if new.type = 'return_in' then
      select coalesce(sum(qty),0), coalesce(sum(bbl),0) into returned_qty, returned_bbl from public.inventory_movements
        where brewery_id = new.brewery_id and source_movement_id = original.id and type = 'return_in';
      if returned_qty + new.qty > -original.qty then raise exception 'return exceeds original shipment'; end if;
      new.bbl := round(original.bbl * (returned_qty + new.qty) / original.qty, 8) - returned_bbl;
    else
      new.bbl := -original.bbl;
    end if;
    return new;
  end if;
  select (new.qty * f.bbl_per_unit), p.package_type into new.bbl, new.package_type
    from public.skus s join public.format_volumes f on f.id = s.format_id
    join public.formats p on p.id = s.format_id where s.id = new.sku_id;
  if new.bbl is null then raise exception 'format has no bbl_per_unit'; end if;
  return new;
end $$;

create function public.get_packaging_output_corrections(p_brewery uuid,p_run uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.assert_staff_read(p_brewery,array['admin','brewer','warehouse']::public.staff_role[]);
  if not exists(select 1 from public.packaging_runs where id=p_run and brewery_id=p_brewery) then
    raise exception 'packaging run not found';
  end if;
  return jsonb_build_object('corrections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]'::jsonb)
    from public.packaging_output_corrections c where c.run_id=p_run and c.brewery_id=p_brewery));
end $$;
revoke all on function public.get_packaging_output_corrections(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_packaging_output_corrections(uuid,uuid) to authenticated;

create function public.correct_packaging_run_outputs(
  p_brewery uuid,p_run uuid,p_previous uuid,p_reason text,p_bbl_drawn numeric,
  p_outputs jsonb,p_location uuid,p_bin uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid; replay jsonb; run public.packaging_runs; lot public.lots;
  occupancy public.vessel_occupancies; batch public.batches; previous uuid;
  correction public.packaging_output_corrections; source public.inventory_movements;
  line jsonb; sku uuid; qty numeric; movement uuid; available numeric; packaged numeric;
  drawn numeric; before_outputs jsonb; balance jsonb; current_material_record uuid;
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
  insert into public.packaging_output_corrections(brewery_id,run_id,corrects_id,reason,
    previous_bbl_drawn,replacement_bbl_drawn,previous_outputs,replacement_outputs,created_by)
  values(p_brewery,p_run,previous,trim(p_reason),run.bbl_drawn,drawn,before_outputs,p_outputs,actor) returning * into correction;
  for source in select m.* from public.packaging_run_outputs o join public.inventory_movements m on m.id=o.movement_id
    where o.run_id=p_run loop
    insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,compensates_id,ref,note,created_by,occurred_on)
      values(p_brewery,source.sku_id,source.location_id,source.bin_id,lot.id,-source.qty,'production_in',source.id,correction.id,p_reason,actor,source.occurred_on);
  end loop;
  update public.packaging_run_outputs set qty_actual=0,movement_id=null,unit_cost_cents=null where run_id=p_run;
  for line in select * from jsonb_array_elements(p_outputs) loop
    sku := (line->>'sku_id')::uuid;
    qty := round((line->>'qty_actual')::numeric,2);
    if qty=0 then continue; end if;
    insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,ref,created_by,occurred_on)
      values(p_brewery,sku,p_location,p_bin,lot.id,qty,'production_in',p_run,actor,lot.packaged_on) returning id into movement;
    update public.packaging_run_outputs set qty_actual=qty,movement_id=movement where run_id=p_run and sku_id=sku;
  end loop;
  select coalesce(sum(m.bbl),0) into packaged from public.packaging_run_outputs o
    join public.inventory_movements m on m.id=o.movement_id where o.run_id=p_run;
  select bbl+run.bbl_drawn into available from public.occupancy_volumes where occupancy_id=occupancy.id;
  if p_bbl_drawn>available+c_epsilon then raise exception 'only % bbl available for this run; asked to draw %',available,p_bbl_drawn; end if;
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

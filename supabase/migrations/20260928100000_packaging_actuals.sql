-- #623: packaging closes freeze the reviewed BOM and confirmed source usage.
create table public.packaging_material_records (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id), run_id uuid not null,
  planned jsonb not null, corrects_id uuid unique, correction_reason text,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(id,brewery_id),
  foreign key(run_id,brewery_id) references public.packaging_runs(id,brewery_id),
  foreign key(corrects_id,brewery_id) references public.packaging_material_records(id,brewery_id),
  check ((corrects_id is null and correction_reason is null) or (corrects_id is not null and length(trim(correction_reason))>0))
);
create unique index packaging_material_records_original on public.packaging_material_records(run_id) where corrects_id is null;
create index packaging_material_records_run on public.packaging_material_records(brewery_id,run_id,created_at);
create table public.packaging_material_actuals (
  id uuid primary key default private.new_uuid(), brewery_id uuid not null references public.breweries(id),
  record_id uuid not null, material_id uuid not null, location_id uuid not null, bin_id uuid not null, lot_id uuid,
  material_name text not null, unit text not null, location_name text not null, bin_name text not null, lot_code text,
  qty_used numeric(14,4) not null check(qty_used>=0), qty_loss numeric(14,4) not null check(qty_loss>=0), qty_unused numeric(14,4) not null check(qty_unused>=0),
  used_movement_id uuid unique, loss_movement_id uuid unique,
  foreign key(record_id,brewery_id) references public.packaging_material_records(id,brewery_id),
  foreign key(material_id,brewery_id) references public.materials(id,brewery_id),
  foreign key(location_id,brewery_id) references public.locations(id,brewery_id),
  foreign key(bin_id,location_id,brewery_id) references public.bins(id,location_id,brewery_id),
  foreign key(lot_id,brewery_id) references public.material_lots(id,brewery_id),
  foreign key(used_movement_id,brewery_id) references public.material_movements(id,brewery_id),
  foreign key(loss_movement_id,brewery_id) references public.material_movements(id,brewery_id),
  unique nulls not distinct(record_id,material_id,location_id,bin_id,lot_id)
);
alter table public.packaging_material_records enable row level security;
alter table public.packaging_material_actuals enable row level security;
create policy staff_read on public.packaging_material_records for select using(public.is_staff_of(brewery_id));
create policy staff_read on public.packaging_material_actuals for select using(public.is_staff_of(brewery_id));
grant select on public.packaging_material_records, public.packaging_material_actuals to authenticated;
grant all on public.packaging_material_records, public.packaging_material_actuals to service_role;

-- One requirement calculation serves saved runs and unsaved schedule drafts.
-- Round each counted output before aggregating, preserving the original owner.
create function public.packaging_material_plan(p_brewery uuid,p_outputs jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare planned jsonb;
begin
  if current_user='authenticated' and not public.is_staff_of(p_brewery) then raise exception 'permission denied' using errcode='42501'; end if;
  if (select count(*)<>count(distinct (e->>'sku_id')::uuid) from jsonb_array_elements(p_outputs) e) then raise exception 'one planned line per SKU'; end if;
  if exists(select 1 from jsonb_array_elements(p_outputs) e left join public.skus s on s.id=(e->>'sku_id')::uuid and s.brewery_id=p_brewery
    where s.id is null or (e->>'qty_planned')::numeric is null or (e->>'qty_planned')::numeric<0 or (e->>'qty_planned')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'invalid packaging plan output'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('materialId',material_id,'name',name,'unit',base_uom,'lotTracked',lot_tracked,'qty',qty,'bom',bom) order by material_id),'[]'::jsonb) into planned
  from (
    select m.id material_id,m.name,m.base_uom,m.lot_tracked,
      sum(case when m.base_uom='each' then ceil((e->>'qty_planned')::numeric*b.qty_per_unit) else (e->>'qty_planned')::numeric*b.qty_per_unit end) qty,
      jsonb_agg(jsonb_build_object('skuId',s.id,'formatId',s.format_id,'qtyPlanned',(e->>'qty_planned')::numeric,'qtyPerUnit',b.qty_per_unit) order by s.id) bom
    from jsonb_array_elements(p_outputs) e join public.skus s on s.id=(e->>'sku_id')::uuid and s.brewery_id=p_brewery
    join public.format_bom b on b.format_id=s.format_id and b.brewery_id=p_brewery
    join public.materials m on m.id=b.material_id and m.brewery_id=p_brewery group by m.id
  ) requirements;
  return planned;
end $$;
revoke all on function public.packaging_material_plan(uuid,jsonb) from public,anon,service_role;
grant execute on function public.packaging_material_plan(uuid,jsonb) to authenticated,service_role;

create or replace view public.packaging_run_requirements with(security_invoker=true) as
select r.id run_id,r.brewery_id,(p->>'materialId')::uuid material_id,(p->>'qty')::numeric required,
  coalesce(oh.qty,0) on_hand,coalesce(oo.qty,0) on_order,(p->>'qty')::numeric-coalesce(oh.qty,0)-coalesce(oo.qty,0) short
from public.packaging_runs r
cross join lateral jsonb_array_elements(public.packaging_material_plan(r.brewery_id,
  (select coalesce(jsonb_agg(jsonb_build_object('sku_id',o.sku_id,'qty_planned',o.qty_planned) order by o.sku_id),'[]'::jsonb) from public.packaging_run_outputs o where o.run_id=r.id))) p
left join public.material_on_hand oh on oh.material_id=(p->>'materialId')::uuid
left join public.material_on_order oo on oo.material_id=(p->>'materialId')::uuid
where r.closed_at is null and r.cancelled_at is null;
grant select on public.packaging_run_requirements to authenticated;

create function public.get_packaging_material_plan(p_brewery uuid,p_outputs jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare planned jsonb; requirements jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','sales','brewer','warehouse']::public.staff_role[]);
  planned := public.packaging_material_plan(p_brewery,p_outputs);
  select coalesce(jsonb_agg(p||jsonb_build_object('onHand',coalesce(oh.qty,0),'onOrder',coalesce(oo.qty,0),'short',(p->>'qty')::numeric-coalesce(oh.qty,0)-coalesce(oo.qty,0))),'[]'::jsonb) into requirements
  from jsonb_array_elements(planned) p left join public.material_on_hand oh on oh.material_id=(p->>'materialId')::uuid
  left join public.material_on_order oo on oo.material_id=(p->>'materialId')::uuid;
  return jsonb_build_object('planned',requirements,'revision',encode(extensions.digest(planned::text,'sha256'),'hex'));
end $$;
revoke all on function public.get_packaging_material_plan(uuid,jsonb) from public,anon,service_role;
grant execute on function public.get_packaging_material_plan(uuid,jsonb) to authenticated;

-- These short, transaction-scoped locks cannot wait while holding a lock that
-- another writer needs. A busy response asks for retry instead of deadlocking.
create function private.lock_packaging_materials() returns void language plpgsql set search_path='' as $$
begin
  lock table public.materials,public.skus in exclusive mode nowait;
  lock table public.format_bom,public.material_lots in share mode nowait;
  lock table public.inventory_movements,public.material_movements in share row exclusive mode nowait;
exception when lock_not_available then raise exception 'Packaging materials are busy. Retry unchanged.' using errcode='MG409';
end $$;
revoke all on function private.lock_packaging_materials() from public,anon,authenticated,service_role;

-- Caller has locked metadata and the ledger. Validation and insertion share
-- the exact source bucket; a confirmed tracked lot is never silently replaced.
create function private.append_packaging_actuals(p_record uuid,p_actuals jsonb)
returns void language plpgsql set search_path='' as $$
declare r public.packaging_material_records; item jsonb; material public.materials; lot public.material_lots;
  loc public.locations; bin public.bins; used numeric; loss numeric; unused numeric; available numeric; used_id uuid; loss_id uuid;
begin
  select * into r from public.packaging_material_records where id=p_record;
  if p_actuals is null or jsonb_typeof(p_actuals)<>'array' then raise exception 'confirm packaging material actuals'; end if;
  if exists(select 1 from jsonb_array_elements(r.planned) p where not exists(select 1 from jsonb_array_elements(p_actuals) a where (a->>'material_id')::uuid=(p->>'materialId')::uuid)) then raise exception 'confirm every planned material, including zero used'; end if;
  if (select count(*)<>count(distinct ((a->>'material_id')::uuid,(a->>'location_id')::uuid,(a->>'bin_id')::uuid,(a->>'lot_id')::uuid)) from jsonb_array_elements(p_actuals) a) then raise exception 'one actual row per material source'; end if;
  for item in select * from jsonb_array_elements(p_actuals) loop
    select * into material from public.materials where id=(item->>'material_id')::uuid and brewery_id=r.brewery_id;
    if material.id is null then raise exception 'material not found'; end if;
    select * into loc from public.locations where id=(item->>'location_id')::uuid and brewery_id=r.brewery_id;
    select * into bin from public.bins where id=(item->>'bin_id')::uuid and location_id=loc.id;
    if bin.id is null then raise exception 'bin does not belong to that location'; end if;
    select * into lot from public.material_lots where id=(item->>'lot_id')::uuid and material_id=material.id and brewery_id=r.brewery_id;
    used := (item->>'used')::numeric; loss := (item->>'loss')::numeric; unused := (item->>'unused')::numeric;
    if exists(select 1 from unnest(array[used,loss,unused]) q where q is null or q<0 or q>9999999999.9999 or q<>round(q,4) or q::text in ('NaN','Infinity','-Infinity') or (material.base_uom='each' and q<>trunc(q))) then raise exception 'actual quantities must be nonnegative base units; counted materials require whole units'; end if;
    if (item->>'lot_id' is not null and lot.id is null) or (not material.lot_tracked and lot.id is not null) or (material.lot_tracked and used+loss+unused>0 and lot.id is null) then raise exception 'select the material source lot'; end if;
    select coalesce(sum(qty),0) into available from public.material_movements where brewery_id=r.brewery_id and material_id=material.id and location_id=loc.id and bin_id=bin.id and lot_id is not distinct from lot.id;
    if used+loss>available then raise exception 'insufficient material stock for %: % available; % used plus loss',material.name,available,used+loss; end if;
    used_id := null; loss_id := null;
    if used>0 then
      insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,created_by) values(r.brewery_id,material.id,loc.id,bin.id,lot.id,-used,'consumption',r.created_by) returning id into used_id;
      insert into public.packaging_run_consumptions(brewery_id,run_id,movement_id) values(r.brewery_id,r.run_id,used_id);
    end if;
    if loss>0 then
      insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,created_by) values(r.brewery_id,material.id,loc.id,bin.id,lot.id,-loss,'loss',r.created_by) returning id into loss_id;
      insert into public.packaging_run_consumptions(brewery_id,run_id,movement_id) values(r.brewery_id,r.run_id,loss_id);
    end if;
    insert into public.packaging_material_actuals(brewery_id,record_id,material_id,location_id,bin_id,lot_id,material_name,unit,location_name,bin_name,lot_code,qty_used,qty_loss,qty_unused,used_movement_id,loss_movement_id)
    values(r.brewery_id,r.id,material.id,loc.id,bin.id,lot.id,material.name,material.base_uom,loc.name,bin.name,lot.lot_code,used,loss,unused,used_id,loss_id);
  end loop;
end $$;
revoke all on function private.append_packaging_actuals(uuid,jsonb) from public,anon,authenticated,service_role;

-- Replace the old signature while preserving completed legacy replay.
drop function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid);
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
  v_movement uuid; v_packaged numeric; v_balance jsonb;
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
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
  if p_plan_revision is distinct from encode(extensions.digest(v_plan::text,'sha256'),'hex') then raise exception 'Packaging material plan changed. Review it again.' using errcode='MG409'; end if;
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

revoke all on function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text) to authenticated;

create function public.get_packaging_close_plan(p_brewery uuid,p_run uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare plan jsonb; outputs jsonb; sources jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','brewer','warehouse']::public.staff_role[]);
  if not exists(select 1 from public.packaging_runs where id=p_run and brewery_id=p_brewery) then raise exception 'packaging run not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('sku_id',sku_id,'qty_planned',qty_planned) order by sku_id),'[]'::jsonb) into outputs from public.packaging_run_outputs where run_id=p_run;
  plan := public.get_packaging_material_plan(p_brewery,outputs);
  select coalesce(jsonb_agg(jsonb_build_object('materialId',m.id,'materialName',m.name,'unit',m.base_uom,'lotTracked',m.lot_tracked,'locationId',s.location_id,'locationName',l.name,'binId',s.bin_id,'binName',b.name,'lotId',s.lot_id,'lotCode',ml.lot_code,'qty',s.qty)
    order by m.name,ml.best_by nulls last,ml.received_on nulls last,ml.created_at,l.name,b.name),'[]'::jsonb) into sources
  from public.material_lot_bin_on_hand s join public.materials m on m.id=s.material_id
  join public.locations l on l.id=s.location_id join public.bins b on b.id=s.bin_id
  left join public.material_lots ml on ml.id=s.lot_id
  where s.brewery_id=p_brewery and s.qty>0 and m.lot_tracked=(s.lot_id is not null);
  return plan||jsonb_build_object('sources',sources,
    'materials',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'unit',base_uom,'lotTracked',lot_tracked) order by name),'[]'::jsonb) from public.materials where brewery_id=p_brewery),
    'lots',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'materialId',material_id,'code',lot_code) order by best_by nulls last,received_on,created_at),'[]'::jsonb) from public.material_lots where brewery_id=p_brewery));
end $$;
revoke all on function public.get_packaging_close_plan(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_packaging_close_plan(uuid,uuid) to authenticated;

create function public.get_packaging_material_record(p_brewery uuid,p_run uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare records jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','brewer','warehouse']::public.staff_role[]);
  if not exists(select 1 from public.packaging_runs where id=p_run and brewery_id=p_brewery) then raise exception 'packaging run not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('actuals',(
    select coalesce(jsonb_agg(to_jsonb(a) order by a.material_name,a.location_name,a.bin_name,a.lot_code),'[]'::jsonb) from public.packaging_material_actuals a where a.record_id=r.id
  )) order by r.created_at,r.id),'[]'::jsonb) into records from public.packaging_material_records r where r.brewery_id=p_brewery and r.run_id=p_run;
  return jsonb_build_object('records',records);
end $$;
revoke all on function public.get_packaging_material_record(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_packaging_material_record(uuid,uuid) to authenticated;

create function public.correct_packaging_material_record(p_brewery uuid,p_record uuid,p_reason text,p_actuals jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.packaging_material_records; revision public.packaging_material_records;
  run public.packaging_runs; batch public.batches; lot public.lots; replay jsonb; actor uuid;
begin
  actor := private.assert_staff(p_brewery,array['admin','brewer','warehouse']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery,'correct_packaging_material_record',p_request_id,
    jsonb_build_object('record',p_record,'reason',p_reason,'actuals',p_actuals));
  if replay is not null then return replay; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'correction reason required'; end if;
  perform private.lock_cellar_workflow(p_brewery);
  select * into original from public.packaging_material_records where id=p_record and brewery_id=p_brewery;
  if original.id is null then raise exception 'packaging material record not found'; end if;
  select * into run from public.packaging_runs where id=original.run_id for update;
  if exists(select 1 from public.packaging_material_records where corrects_id=p_record) then raise exception 'material record already corrected; reload current revision'; end if;
  select b.* into batch from public.batches b join public.vessel_occupancies o on o.batch_id=b.id where o.id=run.occupancy_id for update of b;
  if batch.closed_at is not null then raise exception 'completed batch prevents material correction'; end if;
  select * into lot from public.lots where packaging_run_id=run.id;
  if exists(select 1 from public.report_filings where brewery_id=p_brewery and filed_at is not null and period_end>=lot.packaged_on) then raise exception 'a filed report prevents material correction'; end if;
  -- Freeze downstream stock use while checking dependency guards. NOWAIT
  -- avoids inversion with writers that acquire their ledger before metadata.
  begin
    lock table public.inventory_movements in share row exclusive mode nowait;
  exception when lock_not_available then raise exception 'Packaging stock is busy. Retry unchanged.' using errcode='MG409'; end;
  perform private.lock_packaging_materials();
  if exists(select 1 from public.inventory_movements where brewery_id=p_brewery and lot_id=lot.id and type<>'production_in') then raise exception 'sold, transferred, repacked, or adjusted finished goods prevent material correction'; end if;
  with reversals as (
  insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,compensates_id,note,created_by)
    select m.brewery_id,m.material_id,m.location_id,m.bin_id,m.lot_id,-m.qty,'adjustment',m.unit_cost_cents,m.id,p_reason,actor
    from public.packaging_material_actuals a join public.material_movements m on m.id in(a.used_movement_id,a.loss_movement_id) where a.record_id=p_record returning id
  ) insert into public.packaging_run_consumptions(brewery_id,run_id,movement_id) select p_brewery,run.id,id from reversals;
  insert into public.packaging_material_records(brewery_id,run_id,planned,corrects_id,correction_reason,created_by)
    values(p_brewery,run.id,original.planned,original.id,p_reason,actor) returning * into revision;
  perform private.append_packaging_actuals(revision.id,p_actuals);
  return private.complete_command_request(p_request_id,jsonb_build_object('record',to_jsonb(revision)));
end $$;
revoke all on function public.correct_packaging_material_record(uuid,uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.correct_packaging_material_record(uuid,uuid,text,jsonb,uuid) to authenticated;

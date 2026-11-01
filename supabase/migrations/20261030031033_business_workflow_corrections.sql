-- #1662: safe, append-only workflow corrections. Existing request hashes remain valid.

create or replace function private.record_pick_impl(p_order uuid, p_picks jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; pk record; v_ordered numeric;
begin
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  if o.needs_restock then raise exception 'put back staged beer before recording another pick'; end if;
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty_picked')::numeric as qty from jsonb_array_elements(p_picks) e loop
    select qty_ordered into v_ordered from public.order_lines where id = pk.line_id and order_id = p_order;
    if found and pk.qty > v_ordered then
      raise exception 'picked quantity cannot exceed ordered (% ordered, % picked)', v_ordered, pk.qty;
    end if;
    update public.order_lines set qty_picked = pk.qty where id = pk.line_id and order_id = p_order;
  end loop;
  perform private.mark_picked_if_complete(p_order);
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'picked', jsonb_build_object('picks', p_picks));
  return jsonb_build_object('order_id', p_order);
end $$;


create or replace function public.correct_brew_record(
  p_brewery uuid,p_record uuid,p_reason text,p_initial_bbl numeric,p_actuals jsonb,
  p_process jsonb,p_confirm_empty boolean,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
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
  lock table public.material_movements in share row exclusive mode;
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
end $$;
revoke all on function public.correct_brew_record(uuid,uuid,text,numeric,jsonb,jsonb,boolean,uuid) from public,anon,service_role;
grant execute on function public.correct_brew_record(uuid,uuid,text,numeric,jsonb,jsonb,boolean,uuid) to authenticated;

drop function public.correct_purchase_receipt(uuid,uuid,text,jsonb,uuid);
create function public.correct_purchase_receipt(
  p_brewery uuid, p_receipt uuid, p_reason text, p_lines jsonb, p_request_id uuid, p_location uuid default null, p_bin uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_payload jsonb; v_original public.receipts; v_po public.purchase_orders;
  v_old public.receipt_lines; v_source public.material_movements; v_material public.materials;
  v_lot public.material_lots; v_new_receipt uuid; v_movement uuid; v_chain uuid[];
  v_input jsonb; v_qty numeric; v_factor numeric; v_cost numeric; v_expected numeric;
  v_location uuid; v_bin uuid; v_material_id uuid; v_lot_id uuid; v_best_by date;
  v_code text; v_status public.po_status; v_reason text := trim(p_reason); v_po_id uuid;
begin
  v_actor := private.assert_staff(p_brewery,array['admin','warehouse']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery',p_brewery,'receipt',p_receipt,'reason',p_reason,'lines',p_lines);
  if p_location is not null or p_bin is not null then
    v_payload := v_payload || jsonb_build_object('location',p_location,'bin',p_bin);
  end if;
  v_replay := private.claim_command_request(p_brewery,'correct_purchase_receipt',p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if nullif(v_reason,'') is null then raise exception 'a correction reason is required'; end if;
  select po_id into v_po_id from public.receipts where id=p_receipt and brewery_id=p_brewery;
  if v_po_id is null then raise exception 'receipt not found'; end if;
  v_po := private.lock_purchase_order(p_brewery,v_po_id,array['sent','partially_received','received']::public.po_status[]);
  -- One locked read after the PO lock (lock order unchanged) supplies the receipt.
  select * into v_original from public.receipts where id=p_receipt for update;
  if exists (select 1 from public.receipts where corrects_receipt_id=p_receipt) then
    raise exception 'receipt already corrected; reload its latest revision';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'a correction must include every original receipt line';
  end if;
  if (select count(*) <> count(distinct (l->>'po_line_id')::uuid) from jsonb_array_elements(p_lines) l)
    or jsonb_array_length(p_lines) <> (select count(*) from public.receipt_lines where receipt_id=p_receipt)
    or exists (select 1 from jsonb_array_elements(p_lines) l where not exists (
      select 1 from public.receipt_lines where receipt_id=p_receipt and po_line_id=(l->>'po_line_id')::uuid
    )) then raise exception 'a correction must name each original receipt line exactly once'; end if;

  -- ponytail: table locks serialize receipt corrections with receiving and
  -- material writers; use bucket locks only if correction throughput requires it.
  perform private.lock_tables_or_busy(array[
    'public.material_lots in share row exclusive mode',
    'public.material_movements in share row exclusive mode'
  ],'material stock is busy; reload and retry the receipt correction');
  with recursive ancestors as (
    select id,corrects_receipt_id from public.receipts where id=p_receipt
    union all
    select r.id,r.corrects_receipt_id from public.receipts r join ancestors a on r.id=a.corrects_receipt_id
  ) select array_agg(id) into v_chain from ancestors;

  -- Resolve historical location only from the receipt's own stock facts.
  select m.location_id,m.bin_id into v_location,v_bin
    from public.receipt_lines rl join public.material_movements m on m.id=rl.movement_id
    where rl.receipt_id=p_receipt order by rl.id limit 1;
  v_location := coalesce(v_original.location_id,v_location);
  v_bin := coalesce(v_original.bin_id,v_bin);
  v_location := coalesce(p_location,v_location);
  v_bin := coalesce(p_bin,v_bin);
  -- A pre-#680 receipt froze no destination: name that gap before the bin lookup, which a null bin would fail as a wrong choice.
  if v_location is null or v_bin is null then
    raise exception 'historical receipt has no frozen receiving location; correction is unavailable';
  end if;
  if not exists(select 1 from public.bins where id=v_bin and location_id=v_location and brewery_id=p_brewery) then
    raise exception 'choose a receiving bin in this brewery location';
  end if;
  insert into public.receipts(brewery_id,po_id,received_on,received_by,corrects_receipt_id,correction_reason,location_id,bin_id)
    values(p_brewery,v_po.id,v_original.received_on,v_actor,p_receipt,v_reason,v_location,v_bin)
    returning id into v_new_receipt;

  for v_input in select * from jsonb_array_elements(p_lines) loop
    select * into strict v_old from public.receipt_lines
      where receipt_id=p_receipt and po_line_id=(v_input->>'po_line_id')::uuid;
    select * into v_source from public.material_movements where id=v_old.movement_id;
    select coalesce(v_old.material_id,material_id) into v_material_id
      from public.purchase_order_lines where id=v_old.po_line_id;
    select * into v_material from public.materials where id=v_material_id and brewery_id=p_brewery;
    v_qty := (v_input->>'qty_counted')::numeric;
    if v_qty is null or v_qty::text in ('NaN','Infinity','-Infinity') or v_qty<0 or v_qty<>round(v_qty,4) then
      raise exception 'counted quantities must be finite, nonnegative, and have at most four decimals';
    end if;
    v_factor := v_old.purchase_uom_factor;
    if v_factor is null and v_old.qty_counted>0 and v_source.qty>0 then
      v_factor := round(v_source.qty/v_old.qty_counted,6);
      if v_factor*v_old.qty_counted<>v_source.qty then
        raise exception 'historical receipt conversion is ambiguous; correction is unavailable';
      end if;
    end if;
    if v_factor is null or v_factor<=0 then
      raise exception 'historical receipt has no frozen purchase-unit conversion; correction is unavailable';
    end if;
    if v_qty*v_factor<>round(v_qty*v_factor,4) then
      raise exception 'corrected quantity is too precise for the frozen base unit';
    end if;
    v_cost := coalesce(v_old.purchase_unit_cost_cents,v_source.unit_cost_cents*v_factor);
    v_lot_id := null;
    if v_material.lot_tracked and v_qty>0 then
      v_code := nullif(trim(v_input->>'lot_code'),'');
      v_best_by := (v_input->>'best_by')::date;
      if v_code is null then raise exception '% requires the actual lot code',v_material.name; end if;
      select * into v_lot from public.material_lots where material_id=v_material_id and lot_code=v_code;
      if v_lot.id is not null then
        if v_lot.best_by is distinct from v_best_by then
          if exists (select 1 from public.receipt_lines rl where rl.lot_id=v_lot.id and not (rl.receipt_id=any(v_chain)))
            or exists (select 1 from public.material_movements m where m.brewery_id=p_brewery and m.material_id=v_material_id and m.lot_id=v_lot.id and
              (m.qty<0 and m.compensates_id is null or m.type<>'receipt' and m.compensates_id is null))
            or not exists (select 1 from public.receipt_lines rl where rl.lot_id=v_lot.id and rl.receipt_id=any(v_chain)) then
            raise exception 'shared or used lot has different best-by facts; select the actual matching lot';
          end if;
          update public.material_lots set best_by=v_best_by where id=v_lot.id;
        end if;
        v_lot_id := v_lot.id;
      else
        insert into public.material_lots(brewery_id,material_id,lot_code,vendor_id,received_on,best_by)
          values(p_brewery,v_material_id,v_code,v_po.vendor_id,v_original.received_on,v_best_by)
          returning id into v_lot_id;
      end if;
    elsif not v_material.lot_tracked and nullif(trim(v_input->>'lot_code'),'') is not null then
      raise exception 'untracked material cannot name a lot';
    end if;
    -- Moving away from a used shared lot would also rewrite its provenance.
    if v_old.lot_id is not null and v_old.lot_id is distinct from v_lot_id and exists (
      select 1 from public.material_movements m where m.brewery_id=p_brewery and m.material_id=v_material_id and m.lot_id=v_old.lot_id and m.qty<0 and m.compensates_id is null
    ) then raise exception 'original lot has downstream use; its receipt facts cannot be corrected'; end if;

    if v_source.id is not null then
      insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,compensates_id,note,created_by)
        values(p_brewery,v_source.material_id,v_source.location_id,v_source.bin_id,v_source.lot_id,-v_source.qty,
          'adjustment',v_source.unit_cost_cents,v_source.id,v_reason,v_actor);
    end if;
    v_movement := null;
    if v_qty>0 then
      insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,note,created_by)
        values(p_brewery,v_material_id,v_location,v_bin,v_lot_id,v_qty*v_factor,'receipt',v_cost/v_factor,v_reason,v_actor)
        returning id into v_movement;
    end if;
    if exists (select 1 from public.material_movements m where m.brewery_id=p_brewery and m.material_id=v_material_id
        and ((m.location_id=v_location and m.bin_id=v_bin)
          or (m.location_id=v_source.location_id and m.bin_id=v_source.bin_id))
        and (m.lot_id is not distinct from v_source.lot_id or m.lot_id is not distinct from v_lot_id)
      group by m.location_id,m.bin_id,m.lot_id having sum(m.qty)<0) then
      raise exception 'receipt correction would leave negative material stock';
    end if;
    select greatest(qty_ordered-qty_received,0) into v_expected
      from public.po_open_balances where po_line_id=v_old.po_line_id;
    insert into public.receipt_lines(brewery_id,receipt_id,po_line_id,qty_expected,qty_counted,lot_id,movement_id,
      material_id,material_name,base_uom,purchase_uom,purchase_uom_factor,purchase_unit_cost_cents,
      lot_code,lot_received_on,lot_best_by,cost_recorded_at,cost_order_id)
    select p_brewery,v_new_receipt,v_old.po_line_id,v_expected,v_qty,v_lot_id,v_movement,
      v_material_id,coalesce(v_old.material_name,v_material.name),coalesce(v_old.base_uom,v_material.base_uom),
      coalesce(v_old.purchase_uom,v_material.purchase_uom),v_factor,v_cost,
      ml.lot_code,ml.received_on,ml.best_by,
      coalesce(v_old.cost_recorded_at,v_source.created_at,v_original.created_at),coalesce(v_old.cost_order_id,v_original.id)
    from (select 1) singleton left join public.material_lots ml on ml.id=v_lot_id;
  end loop;
  v_status := private.po_receipt_status(v_po.id);
  update public.purchase_orders set status=v_status where id=v_po.id;
  return private.complete_command_request(p_request_id,jsonb_build_object('receipt_id',v_new_receipt,'po_id',v_po.id,'status',v_status));
end $$;
revoke all on function public.correct_purchase_receipt(uuid,uuid,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.correct_purchase_receipt(uuid,uuid,text,jsonb,uuid,uuid,uuid) to authenticated;

create or replace function private.resolve_short_pick_impl(p_order uuid,p_line uuid,p_qty numeric,p_reason text,p_resolution text)
returns jsonb language plpgsql set search_path='' as $$
declare o public.orders; l public.order_lines;
begin
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'reason is required'; end if;
  if p_qty<0 then raise exception 'qty_picked cannot be negative'; end if;
  o := private.lock_order(p_order,array['confirmed','picked']::public.order_status[]);
  if o.needs_restock then raise exception 'put back staged beer before recording another pick'; end if;
  select * into l from public.order_lines where id=p_line and order_id=p_order for update;
  if not found then raise exception 'order line not found'; end if;
  if p_qty>=l.qty_ordered then raise exception 'line is not short'; end if;
  if p_resolution='adjust_down' then
    if p_qty=0 then raise exception 'adjust the order lines to drop a line entirely'; end if;
    update public.order_lines set qty_ordered=p_qty,qty_picked=p_qty,short_reason=p_reason where id=p_line;
    update public.allocations set qty=p_qty where source='order_line' and ref=p_line and status='open';
  elsif p_resolution='keep_owed' then
    update public.order_lines set qty_picked=p_qty,short_reason=p_reason where id=p_line;
  else
    raise exception 'unknown resolution';
  end if;
  perform private.mark_picked_if_complete(p_order);
  insert into public.order_events(brewery_id,order_id,actor,event,payload)
    values(o.brewery_id,p_order,auth.uid(),'short_pick',
      jsonb_build_object('line_id',p_line,'qty_picked',p_qty,'reason',p_reason,'resolution',p_resolution));
  return jsonb_build_object('order_id',p_order);
end $$;

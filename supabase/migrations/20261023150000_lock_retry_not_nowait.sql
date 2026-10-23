-- #1234: every NOWAIT lock set retries before refusing as busy.
-- Autovacuum and autoanalyze hold SHARE UPDATE EXCLUSIVE on a table for a
-- moment. A NOWAIT lock fails at once instead of waiting it out, so staff got
-- a random "busy" whenever autovacuum touched a locked table. A plain wait is
-- not safe: a lock set that waits while holding part of itself can deadlock
-- with a ledger writer, and Postgres then aborts that writer.

-- Takes each lock in p_locks ("<tables> in <mode> mode") with NOWAIT, all or
-- nothing. A refused attempt rolls back the locks it took, so the caller never
-- waits while holding part of the set. It sleeps 0.25 s, 0.5 s, then 0.75 s
-- between four attempts (1.5 s in all), which outlasts a brief writer or an
-- autoanalyze. Still refused, it raises p_busy as MG409 (a 409 retry message).
-- Locks the caller took earlier stay held during the sleeps. A sleep is not a
-- lock wait, so it cannot close a deadlock cycle; others wait up to 1.5 s longer.
create function private.lock_tables_or_busy(p_locks text[],p_busy text) returns void
language plpgsql set search_path='' as $$
declare lock_clause text;
begin
  for attempt in 1..4 loop
    begin
      foreach lock_clause in array p_locks loop
        execute 'lock table ' || lock_clause || ' nowait';
      end loop;
      return;
    exception when lock_not_available then
      if attempt = 4 then raise exception '%', p_busy using errcode='MG409'; end if;
      perform pg_sleep(0.25 * attempt);
    end;
  end loop;
end $$;
revoke all on function private.lock_tables_or_busy(text[],text) from public,anon,authenticated,service_role;

-- Packaging close and correction freeze materials, SKUs, BOMs, lots and both
-- ledgers while they check stock and post consumption.
create or replace function private.lock_packaging_materials() returns void language plpgsql set search_path='' as $$
begin
  perform private.lock_tables_or_busy(array[
    'public.materials,public.skus in exclusive mode',
    'public.format_bom,public.material_lots in share mode',
    'public.inventory_movements,public.material_movements in share row exclusive mode'
  ],'Packaging materials are busy. Retry unchanged.');
end $$;

-- A material count's preview and commit freeze materials, lots and the
-- material ledger while they plan lot adjustments.
create or replace function private.lock_material_count() returns void
language plpgsql set search_path = '' as $$
begin
  perform private.lock_tables_or_busy(array[
    'public.materials in exclusive mode',
    'public.material_lots in share mode',
    'public.material_movements in share row exclusive mode'
  ],'Material stock is busy. Try preview again.');
end $$;

create or replace function public.correct_packaging_material_record(p_brewery uuid,p_record uuid,p_reason text,p_actuals jsonb,p_request_id uuid)
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
  -- The packaging lock set includes inventory_movements, so it also freezes
  -- downstream stock use while the guards below run.
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

create or replace function public.correct_purchase_receipt(
  p_brewery uuid, p_receipt uuid, p_reason text, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_original public.receipts; v_po public.purchase_orders;
  v_old public.receipt_lines; v_source public.material_movements; v_material public.materials;
  v_lot public.material_lots; v_new_receipt uuid; v_movement uuid; v_chain uuid[];
  v_input jsonb; v_qty numeric; v_factor numeric; v_cost numeric; v_expected numeric;
  v_location uuid; v_bin uuid; v_material_id uuid; v_lot_id uuid; v_best_by date;
  v_code text; v_status public.po_status; v_reason text := trim(p_reason); v_po_id uuid;
begin
  v_actor := private.assert_staff(p_brewery,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'correct_purchase_receipt',p_request_id,
    jsonb_build_object('brewery',p_brewery,'receipt',p_receipt,'reason',p_reason,'lines',p_lines));
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
  if v_location is null or v_bin is null then
    raise exception 'historical receipt has no frozen receiving location; correction is unavailable';
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
    if v_source.id is not null and exists (
      select 1 from public.material_movements m where m.brewery_id=p_brewery
        and m.material_id=v_source.material_id and m.location_id=v_source.location_id and m.bin_id=v_source.bin_id
        and m.lot_id is not distinct from v_source.lot_id and m.qty<0 and m.compensates_id is null
        and m.created_at>=v_source.created_at
    ) then raise exception 'receipt stock has subsequent use; its quantity or lot cannot be corrected'; end if;

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
        and m.location_id=v_location and m.bin_id=v_bin
        and (m.lot_id is not distinct from v_source.lot_id or m.lot_id is not distinct from v_lot_id)
      group by m.location_id,m.bin_id,m.lot_id having sum(m.qty)<0) then
      raise exception 'receipt correction would leave negative material stock';
    end if;
    -- The replacement header already supersedes this receipt. Other effective
    -- receipts still count, but a closed header's operational zero is not an expected count.
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

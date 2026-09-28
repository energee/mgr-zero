-- Receipt corrections preserve the original receipt and reverse its exact stock facts.
-- The shared compensation constraint/trigger is introduced by #622.
alter table public.receipts
  add column corrects_receipt_id uuid unique,
  add column correction_reason text,
  add column location_id uuid,
  add column bin_id uuid,
  add unique (id, brewery_id, po_id),
  add foreign key (corrects_receipt_id, brewery_id, po_id) references public.receipts(id, brewery_id, po_id),
  add foreign key (location_id, brewery_id) references public.locations(id, brewery_id),
  add foreign key (bin_id, location_id, brewery_id) references public.bins(id, location_id, brewery_id),
  add check (corrects_receipt_id is null or (corrects_receipt_id <> id and nullif(trim(correction_reason),'') is not null));

alter table public.receipt_lines
  add column material_id uuid,
  add column material_name text,
  add column base_uom public.uom,
  add column purchase_uom public.uom,
  add column purchase_uom_factor numeric check (purchase_uom_factor > 0),
  add column purchase_unit_cost_cents numeric check (purchase_unit_cost_cents >= 0),
  add column lot_code text,
  add column lot_received_on date,
  add column lot_best_by date,
  add column cost_recorded_at timestamptz,
  add column cost_order_id uuid,
  add foreign key (material_id, brewery_id) references public.materials(id, brewery_id);

create or replace view public.po_open_balances with (security_invoker = true) as
  select l.brewery_id, l.po_id, l.id as po_line_id, l.material_id, l.contract_id, l.qty_ordered,
    coalesce(r.counted,0) as qty_received,
    greatest(l.qty_ordered-coalesce(r.counted,0),0) as qty_open
  from public.purchase_order_lines l
  left join lateral (
    select sum(rl.qty_counted) counted from public.receipt_lines rl
    where rl.po_line_id=l.id and not exists (
      select 1 from public.receipts successor where successor.corrects_receipt_id=rl.receipt_id
    )
  ) r on true;

-- Correcting an older receipt keeps its economic cost order. Non-receipt
-- compensation rows are excluded, as are the original receipts they reverse.
create or replace view public.material_last_cost with (security_invoker = true) as
  select distinct on (m.brewery_id,m.material_id)
    m.brewery_id,m.material_id,m.unit_cost_cents,
    coalesce(rl.cost_recorded_at,m.created_at) as created_at
  from public.material_movements m
  left join public.receipt_lines rl on rl.movement_id=m.id
  where m.type='receipt' and m.unit_cost_cents is not null
    and not exists (select 1 from public.material_movements reversal where reversal.compensates_id=m.id)
  order by m.brewery_id,m.material_id,coalesce(rl.cost_recorded_at,m.created_at) desc,
    coalesce(rl.cost_order_id,rl.receipt_id,m.id) desc,m.id desc;

create or replace function public.receive_purchase_order(
  p_brewery uuid, p_po uuid, p_location uuid, p_bin uuid, p_received_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_po public.purchase_orders; v_receipt_id uuid; l jsonb;
  v_line public.purchase_order_lines; v_mat public.materials; v_counted numeric; v_expected numeric;
  v_lot uuid; v_movement uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'receive_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'location', p_location, 'bin', p_bin, 'received_on', p_received_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_po := private.lock_purchase_order(p_brewery, p_po, array['sent','partially_received']::public.po_status[]);
  if jsonb_array_length(p_lines) = 0 then raise exception 'a receipt needs at least one counted line'; end if;
  insert into public.receipts (brewery_id, po_id, received_on, received_by, location_id, bin_id)
  values (p_brewery, p_po, coalesce(p_received_on, current_date), v_actor, p_location, p_bin) returning id into v_receipt_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.purchase_order_lines where id = (l->>'po_line_id')::uuid and po_id = p_po;
    if v_line.id is null then raise exception 'line % is not on this purchase order', l->>'po_line_id'; end if;
    select * into v_mat from public.materials where id = v_line.material_id;
    v_counted := (l->>'qty_counted')::numeric;
    select qty_open into v_expected from public.po_open_balances where po_line_id = v_line.id;
    v_lot := null; v_movement := null;
    if v_mat.lot_tracked and v_counted > 0 then  -- #453: a zero count needs no lot
      if nullif(trim(l->>'lot_code'), '') is null then raise exception '% is lot-tracked: a lot code is required', v_mat.name; end if;
      insert into public.material_lots (brewery_id, material_id, lot_code, vendor_id, received_on, best_by)
      values (p_brewery, v_mat.id, trim(l->>'lot_code'), v_po.vendor_id, coalesce(p_received_on, current_date), (l->>'best_by')::date)
      -- ponytail: exact (trimmed) lot-code match; case/punctuation normalization needs a generated column carrying the unique
      on conflict (material_id, lot_code) do update set best_by = coalesce(excluded.best_by, public.material_lots.best_by)
      returning id into v_lot;
    end if;
    if v_counted > 0 then
      -- Cost per base unit, unrounded (#495): the purchase-unit price over the factor.
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, unit_cost_cents, created_by)
      values (p_brewery, v_mat.id, p_location, p_bin, v_lot, v_counted * v_mat.purchase_uom_factor, 'receipt',
              v_line.unit_cost_cents / v_mat.purchase_uom_factor, v_actor)
      returning id into v_movement;
    end if;
    insert into public.receipt_lines (brewery_id, receipt_id, po_line_id, qty_expected, qty_counted, lot_id, movement_id,
      material_id, material_name, base_uom, purchase_uom, purchase_uom_factor, purchase_unit_cost_cents,
      lot_code, lot_received_on, lot_best_by, cost_recorded_at, cost_order_id)
    select p_brewery, v_receipt_id, v_line.id, v_expected, v_counted, v_lot, v_movement,
      v_mat.id, v_mat.name, v_mat.base_uom, v_mat.purchase_uom, v_mat.purchase_uom_factor, v_line.unit_cost_cents,
      ml.lot_code, ml.received_on, ml.best_by, now(), v_receipt_id
    from (select 1) singleton left join public.material_lots ml on ml.id=v_lot;
  end loop;
  select * into v_po from public.purchase_orders where id = p_po;
  return private.complete_command_request(p_request_id, jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po, 'status', v_po.status));
end $$;

create function public.correct_purchase_receipt(
  p_brewery uuid, p_receipt uuid, p_reason text, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_original public.receipts; v_po public.purchase_orders;
  v_old public.receipt_lines; v_source public.material_movements; v_material public.materials;
  v_lot public.material_lots; v_new_receipt uuid; v_movement uuid; v_chain uuid[];
  v_input jsonb; v_qty numeric; v_factor numeric; v_cost numeric; v_expected numeric;
  v_location uuid; v_bin uuid; v_material_id uuid; v_lot_id uuid; v_best_by date;
  v_code text; v_status public.po_status;
begin
  v_actor := private.assert_staff(p_brewery,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'correct_purchase_receipt',p_request_id,
    jsonb_build_object('brewery',p_brewery,'receipt',p_receipt,'reason',p_reason,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'a correction reason is required'; end if;
  select * into v_original from public.receipts where id=p_receipt and brewery_id=p_brewery;
  if v_original.id is null then raise exception 'receipt not found'; end if;
  v_po := private.lock_purchase_order(p_brewery,v_original.po_id,array['sent','partially_received','received']::public.po_status[]);
  perform 1 from public.receipts where id=p_receipt for update;
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
  -- NOWAIT avoids holding half this lock set while another writer waits on us.
  begin
    lock table public.material_lots in share row exclusive mode nowait;
    lock table public.material_movements in share row exclusive mode nowait;
  exception when lock_not_available then
    raise exception 'material stock is busy; reload and retry the receipt correction' using errcode='55P03';
  end;
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
    values(p_brewery,v_po.id,v_original.received_on,v_actor,p_receipt,trim(p_reason),v_location,v_bin)
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
            or exists (select 1 from public.material_movements m where m.lot_id=v_lot.id and
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
      select 1 from public.material_movements m where m.lot_id=v_old.lot_id and m.qty<0 and m.compensates_id is null
    ) then raise exception 'original lot has downstream use; its receipt facts cannot be corrected'; end if;

    if v_source.id is not null then
      insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,compensates_id,note,created_by)
        values(p_brewery,v_source.material_id,v_source.location_id,v_source.bin_id,v_source.lot_id,-v_source.qty,
          'adjustment',v_source.unit_cost_cents,v_source.id,trim(p_reason),v_actor);
    end if;
    v_movement := null;
    if v_qty>0 then
      insert into public.material_movements(brewery_id,material_id,location_id,bin_id,lot_id,qty,type,unit_cost_cents,note,created_by)
        values(p_brewery,v_material_id,v_location,v_bin,v_lot_id,v_qty*v_factor,'receipt',v_cost/v_factor,trim(p_reason),v_actor)
        returning id into v_movement;
    end if;
    if exists (select 1 from public.material_movements m where m.brewery_id=p_brewery and m.material_id=v_material_id
        and m.location_id=v_location and m.bin_id=v_bin
        and (m.lot_id is not distinct from v_source.lot_id or m.lot_id is not distinct from v_lot_id)
      group by m.location_id,m.bin_id,m.lot_id having sum(m.qty)<0) then
      raise exception 'receipt correction would leave negative material stock';
    end if;
    select qty_open into v_expected from public.po_open_balances where po_line_id=v_old.po_line_id;
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
revoke all on function public.correct_purchase_receipt(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.correct_purchase_receipt(uuid,uuid,text,jsonb,uuid) to authenticated;

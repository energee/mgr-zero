-- Admin may correct the latest count once in either direction, preserving immutable history.

create or replace function enforce_bbl_integrity() returns trigger language plpgsql set search_path = '' as $$
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
       or new.qty >= 0 or root_line.qty_before + new.qty = root_line.qty_counted
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

create or replace function private.validate_taproom_correction_graph(p_correction uuid) returns void
language plpgsql set search_path = '' as $$
declare correction public.taproom_counts; root public.taproom_counts; line record;
  original public.inventory_movements; replacement public.inventory_movements; changed boolean := false;
begin
  select * into correction from public.taproom_counts where id=p_correction;
  if not found or correction.corrects_count_id is null then return; end if;
  select * into root from public.taproom_counts where id=correction.corrects_count_id and brewery_id=correction.brewery_id;
  if not found or root.corrects_count_id is not null
     or (correction.location_id,correction.counted_on,correction.observed_at,correction.prior_count_id)
        is distinct from (root.location_id,root.counted_on,root.observed_at,root.prior_count_id) then
    raise exception 'invalid taproom correction header';
  end if;
  if exists(select 1 from public.taproom_count_lines rl where rl.count_id=root.id and rl.brewery_id=root.brewery_id
       and not exists(select 1 from public.taproom_count_lines cl where cl.count_id=correction.id and cl.brewery_id=correction.brewery_id and cl.corrects_line_id=rl.id))
    or exists(select 1 from public.taproom_count_lines cl where cl.count_id=correction.id and cl.brewery_id=correction.brewery_id
       and not exists(select 1 from public.taproom_count_lines rl where rl.id=cl.corrects_line_id and rl.count_id=root.id and rl.brewery_id=root.brewery_id)) then
    raise exception 'incomplete taproom correction graph';
  end if;
  for line in
    select cl.*,rl.qty_counted original_counted,rl.movement_id original_movement,
      rl.location_id original_location,rl.bin_id original_bin,rl.sku_id original_sku,rl.lot_id original_lot,rl.qty_before original_before
    from public.taproom_count_lines cl join public.taproom_count_lines rl on rl.id=cl.corrects_line_id and rl.brewery_id=cl.brewery_id
    where cl.count_id=correction.id and cl.brewery_id=correction.brewery_id
  loop
    if (line.location_id,line.bin_id,line.sku_id,line.lot_id,line.qty_before)
       is distinct from (line.original_location,line.original_bin,line.original_sku,line.original_lot,line.original_before) then
      raise exception 'incomplete taproom correction graph';
    end if;
    if line.qty_counted=line.original_counted then
      if line.movement_id is not null or exists(select 1 from public.inventory_movements m
        where m.brewery_id=correction.brewery_id and m.ref=correction.id
          and (m.compensates_id=line.original_movement or m.correction_source_id=line.original_movement)) then
        raise exception 'incomplete taproom correction graph';
      end if;
      continue;
    end if;
    changed:=true;
    select * into original from public.inventory_movements where id=line.original_movement and brewery_id=correction.brewery_id;
    if line.original_movement is not null then
      if original.id is null or original.type<>'depletion' or original.ref is distinct from root.id
        or original.qty<>line.original_counted-line.qty_before
        or original.compensates_id is not null or original.correction_source_id is not null or original.source_movement_id is not null
        or not exists(select 1 from public.inventory_movements m where m.brewery_id=correction.brewery_id and m.ref=correction.id
          and m.compensates_id=original.id and m.qty=-original.qty and m.bbl=-original.bbl
          and m.type='depletion' and m.correction_source_id is null and m.source_movement_id is null
          and (m.location_id,m.bin_id,m.sku_id,m.lot_id,m.sale_channel_id,m.tax_treatment,m.dest_state,m.package_type)
            is not distinct from (original.location_id,original.bin_id,original.sku_id,original.lot_id,original.sale_channel_id,original.tax_treatment,original.dest_state,original.package_type)) then
        raise exception 'incomplete taproom correction graph';
      end if;
    elsif line.original_counted<>line.qty_before then
      raise exception 'incomplete taproom correction graph';
    end if;
    if line.qty_counted=line.qty_before then
      if line.movement_id is not null then raise exception 'incomplete taproom correction graph'; end if;
      continue;
    end if;
    select * into replacement from public.inventory_movements where id=line.movement_id and brewery_id=correction.brewery_id;
    if replacement.id is null or replacement.ref is distinct from correction.id or replacement.type<>'depletion'
      or replacement.qty<>line.qty_counted-line.qty_before
      or (replacement.location_id,replacement.bin_id,replacement.sku_id,replacement.lot_id)
        is distinct from (line.location_id,line.bin_id,line.sku_id,line.lot_id)
      or replacement.compensates_id is not null or replacement.source_movement_id is not null
      or replacement.correction_source_id is distinct from line.original_movement then
      raise exception 'incomplete taproom correction graph';
    end if;
    if original.id is not null then
      if replacement.bbl<>round(original.bbl*replacement.qty/original.qty,8)
        or (replacement.sale_channel_id,replacement.tax_treatment,replacement.dest_state,replacement.package_type)
          is distinct from (original.sale_channel_id,original.tax_treatment,original.dest_state,original.package_type) then
        raise exception 'incomplete taproom correction graph';
      end if;
    elsif replacement.dest_state is not null or not exists(select 1 from public.sale_channels c
      where c.id=replacement.sale_channel_id and c.brewery_id=correction.brewery_id and c.system_code='taproom') then
      raise exception 'incomplete taproom correction graph';
    end if;
  end loop;
  if not changed or exists(select 1 from public.inventory_movements m where m.brewery_id=correction.brewery_id and m.ref=correction.id
    and not exists(select 1 from public.taproom_count_lines cl join public.taproom_count_lines rl on rl.id=cl.corrects_line_id and rl.brewery_id=cl.brewery_id
      where cl.count_id=correction.id and (m.id=cl.movement_id or (cl.qty_counted<>rl.qty_counted and m.compensates_id=rl.movement_id)))) then
    raise exception 'incomplete taproom correction graph';
  end if;
end $$;

create or replace function correct_taproom_count(p_brewery uuid,p_count uuid,p_corrections jsonb,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; root public.taproom_counts; correction uuid; item record;
  replacement uuid; v_channel uuid; v_tax public.tax_treatment;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  v_replay:=private.claim_command_request(p_brewery,'correct_taproom_count',p_request_id,
    jsonb_build_object('count',p_count,'corrections',p_corrections,'reason',p_reason));
  if v_replay is not null then return v_replay; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'enter a correction reason'; end if;
  if jsonb_typeof(p_corrections) is distinct from 'array' or jsonb_array_length(p_corrections)=0 then raise exception 'include at least one changed count line'; end if;
  if exists(select 1 from jsonb_array_elements(p_corrections) e where jsonb_typeof(e) is distinct from 'object'
    or not (e ?& array['line_id','qty_counted'])
    or (select count(*) from jsonb_object_keys(e))<>2
    or jsonb_typeof(e->'line_id') is distinct from 'string' or jsonb_typeof(e->'qty_counted') is distinct from 'number') then
    raise exception 'line ID and corrected whole quantity are required';
  end if;
  if (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_corrections) e)<>jsonb_array_length(p_corrections) then
    raise exception 'duplicate correction line';
  end if;
  select * into root from public.taproom_counts where id=p_count and brewery_id=p_brewery;
  if not found then raise exception 'count not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('taproom-count:'||p_brewery::text||':'||root.location_id::text,0));
  lock table public.inventory_movements in share row exclusive mode;
  select * into root from public.taproom_counts where id=p_count and brewery_id=p_brewery for update;
  perform 1 from public.taproom_count_lines where count_id=root.id and brewery_id=p_brewery for update;
  if root.corrects_count_id is not null then raise exception 'only an original count can be corrected' using errcode='MG409'; end if;
  if exists(select 1 from public.taproom_counts where corrects_count_id=root.id and brewery_id=p_brewery) then raise exception 'count already corrected' using errcode='MG409'; end if;
  if exists(select 1 from public.taproom_counts later where later.brewery_id=p_brewery and later.location_id=root.location_id
    and later.corrects_count_id is null and (later.observed_at,later.id)>(root.observed_at,root.id)) then
    raise exception 'only the latest count can be corrected' using errcode='MG409';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_corrections) e(line_id uuid,qty_counted numeric)
    left join public.taproom_count_lines l on l.id=e.line_id and l.brewery_id=p_brewery and l.count_id=root.id
    left join public.inventory_movements m on m.id=l.movement_id and m.brewery_id=l.brewery_id
    where l.id is null or e.qty_counted::text in ('NaN','Infinity','-Infinity') or e.qty_counted<>trunc(e.qty_counted)
      or e.qty_counted<0 or e.qty_counted=l.qty_counted or e.qty_counted>l.qty_before
      or (l.movement_id is null and l.qty_counted<>l.qty_before)
      or (l.movement_id is not null and (m.id is null or m.type<>'depletion' or m.ref<>root.id or m.qty<>l.qty_counted-l.qty_before
        or m.compensates_id is not null or m.source_movement_id is not null or m.correction_source_id is not null))) then
    raise exception 'change only owned depletion or matching lines within zero and recorded stock';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_corrections) e(line_id uuid,qty_counted numeric)
    join public.taproom_count_lines l on l.id=e.line_id and l.brewery_id=p_brewery and l.count_id=root.id
    where e.qty_counted<l.qty_counted and
      (select coalesce(sum(m.qty),0) from public.inventory_movements m where m.brewery_id=p_brewery
        and m.location_id=l.location_id and m.bin_id=l.bin_id and m.sku_id=l.sku_id and m.lot_id is not distinct from l.lot_id)
        + e.qty_counted-l.qty_counted < 0) then
    raise exception 'stock has been used since this count; ask Warehouse to review before correcting' using errcode='MG409';
  end if;
  insert into public.taproom_counts(brewery_id,location_id,counted_on,counted_by,observed_at,prior_count_id,corrects_count_id,correction_reason)
    values(p_brewery,root.location_id,root.counted_on,v_actor,root.observed_at,root.prior_count_id,root.id,btrim(p_reason)) returning id into correction;
  for item in
    select l.*,e.qty_counted requested from public.taproom_count_lines l
    left join jsonb_to_recordset(p_corrections) e(line_id uuid,qty_counted numeric) on e.line_id=l.id
    where l.count_id=root.id and l.brewery_id=p_brewery order by l.id
  loop
    replacement:=null;
    if item.requested is not null then
      if item.movement_id is not null then
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,dest_state,
          compensates_id,ref,note,created_by)
          select m.brewery_id,m.sku_id,m.location_id,m.bin_id,m.lot_id,-m.qty,m.type,m.sale_channel_id,m.tax_treatment,m.dest_state,
            m.id,correction,btrim(p_reason),v_actor from public.inventory_movements m where m.id=item.movement_id and m.brewery_id=p_brewery;
        if item.requested<item.qty_before then
          insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,dest_state,
            correction_source_id,ref,note,created_by)
            select m.brewery_id,m.sku_id,m.location_id,m.bin_id,m.lot_id,item.requested-item.qty_before,m.type,m.sale_channel_id,m.tax_treatment,m.dest_state,
              m.id,correction,btrim(p_reason),v_actor from public.inventory_movements m where m.id=item.movement_id and m.brewery_id=p_brewery
            returning id into replacement;
        end if;
      else
        -- A matching root had no removal to reverse or frozen removal facts to copy.
        -- Its first depletion freezes the current format and Taproom channel as usual.
        select id,tax_treatment into v_channel,v_tax from public.sale_channels where brewery_id=p_brewery and system_code='taproom';
        if v_channel is null then raise exception 'Admin must restore the Taproom sale channel before recording depletion'; end if;
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,qty,type,sale_channel_id,tax_treatment,ref,note,created_by)
          values(p_brewery,item.sku_id,item.location_id,item.bin_id,item.lot_id,item.requested-item.qty_before,'depletion',v_channel,v_tax,
            correction,btrim(p_reason),v_actor) returning id into replacement;
      end if;
    end if;
    insert into public.taproom_count_lines(brewery_id,count_id,location_id,bin_id,sku_id,lot_id,qty_before,qty_counted,movement_id,corrects_line_id)
      values(p_brewery,correction,item.location_id,item.bin_id,item.sku_id,item.lot_id,item.qty_before,coalesce(item.requested,item.qty_counted),replacement,item.id);
  end loop;
  return private.complete_command_request(p_request_id,private.get_taproom_count(p_brewery,root.id));
end $$;

CREATE OR REPLACE FUNCTION private.get_taproom_count(p_brewery uuid, p_count uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_root uuid;
begin
  select root_id into v_root from private.taproom_effective_counts
    where brewery_id=p_brewery and (root_id=p_count or effective_id=p_count) limit 1;
  select jsonb_build_object('id',h.root_id,'root_id',h.root_id,'effective_id',h.effective_id,
    'location_id',h.location_id,'counted_on',h.counted_on,'observed_at',h.observed_at,
    'counted_by',h.counted_by,'created_at',h.created_at,'prior_count_id',h.prior_count_id,
    'corrected_at',h.corrected_at,'corrected_by',h.corrected_by,'correction_reason',h.correction_reason,
    'correction_eligible',h.corrected_at is null
      -- A sold line can always be raised; a matching line can be lowered only while its bucket still holds stock.
      and exists(select 1 from private.taproom_effective_counts l where l.brewery_id=h.brewery_id and l.root_id=h.root_id
        and (l.movement_type='depletion' or (l.movement_id is null and l.qty_counted>0
          and private.bin_stock_on_hand(l.brewery_id,l.bin_id,l.sku_id,null,null,null,l.lot_id)>0)))
      and not exists(select 1 from private.taproom_effective_counts newer
      where newer.brewery_id=h.brewery_id and newer.location_id=h.location_id and newer.root_id<>h.root_id
        and (newer.observed_at,newer.root_id)>(h.observed_at,h.root_id)),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',e.root_line_id,'effective_line_id',e.line_id,
      'corrects_line_id',case when e.line_id=e.root_line_id then null else e.root_line_id end,
      'brewery_id',e.brewery_id,'count_id',e.effective_id,'location_id',e.location_id,
      'bin_id',e.bin_id,'bin_name',b.name,'sku_id',e.sku_id,'sku_name',s.name,'lot_id',e.lot_id,'lot_code',l.code,
      'qty_before',e.qty_before,'qty_counted',e.qty_counted,'movement_id',e.movement_id,'bbl',e.bbl,'movement_type',e.movement_type)
      order by e.bin_id,e.sku_id,e.lot_id nulls first),'[]'::jsonb)
      from private.taproom_effective_counts e
      left join public.bins b on b.id=e.bin_id and b.brewery_id=e.brewery_id
      left join public.skus s on s.id=e.sku_id and s.brewery_id=e.brewery_id
      left join public.lots l on l.id=e.lot_id and l.brewery_id=e.brewery_id
      where e.brewery_id=p_brewery and e.root_id=h.root_id and e.line_id is not null)) into v_result
  from private.taproom_effective_counts h
  join public.locations loc on loc.id=h.location_id and loc.brewery_id=h.brewery_id and 'taproom' = any(loc.uses)
  where h.brewery_id=p_brewery and h.root_id=v_root limit 1;
  if v_result is null then raise exception 'count not found'; end if;
  return v_result;
end $function$
;

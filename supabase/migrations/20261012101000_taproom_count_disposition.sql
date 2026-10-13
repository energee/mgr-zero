-- Classify each count shortage as sold or destroyed, retaining legacy sold request identities.

-- Expose the effective movement's type beside its bbl so readers need no second ledger lookup.
-- Same columns and joins as the baseline view, with movement_type appended last (replace keeps grants).
CREATE OR REPLACE VIEW private.taproom_effective_counts AS
  select root.brewery_id,root.location_id,root.id root_id,coalesce(correction.id,root.id) effective_id,
    root.counted_on,root.observed_at,root.created_at,root.counted_by,
    coalesce(correction.prior_count_id,root.prior_count_id) prior_count_id,
    correction.created_at corrected_at,correction.counted_by corrected_by,correction.correction_reason,
    effective_line.id line_id,root_line.id root_line_id,effective_line.bin_id,effective_line.sku_id,effective_line.lot_id,
    effective_line.qty_before,effective_line.qty_counted,
    case when correction.id is not null and effective_line.qty_counted=root_line.qty_counted
      then root_line.movement_id else effective_line.movement_id end movement_id,
    case when correction.id is not null and effective_line.qty_counted=root_line.qty_counted
      then root_movement.bbl else effective_movement.bbl end bbl,
    case when correction.id is not null and effective_line.qty_counted=root_line.qty_counted
      then root_movement.type else effective_movement.type end movement_type
  from public.taproom_counts root
  left join public.taproom_counts correction on correction.corrects_count_id=root.id and correction.brewery_id=root.brewery_id
  left join public.taproom_count_lines effective_line on effective_line.count_id=coalesce(correction.id,root.id) and effective_line.brewery_id=root.brewery_id
  left join public.taproom_count_lines root_line on root_line.id=coalesce(effective_line.corrects_line_id,effective_line.id) and root_line.brewery_id=root.brewery_id
  left join public.inventory_movements root_movement on root_movement.id=root_line.movement_id and root_movement.brewery_id=root.brewery_id
  left join public.inventory_movements effective_movement on effective_movement.id=effective_line.movement_id and effective_movement.brewery_id=root.brewery_id
  where root.corrects_count_id is null;

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
      and exists(select 1 from private.taproom_effective_counts shortage where shortage.brewery_id=h.brewery_id and shortage.root_id=h.root_id and shortage.qty_counted<shortage.qty_before and shortage.movement_type='depletion')
      and not exists(select 1 from private.taproom_effective_counts newer
      where newer.brewery_id=h.brewery_id and newer.location_id=h.location_id and newer.root_id<>h.root_id
        and (newer.observed_at,newer.root_id)>(h.observed_at,h.root_id)),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',e.root_line_id,'effective_line_id',e.line_id,
      'corrects_line_id',case when e.line_id=e.root_line_id then null else e.root_line_id end,
      'brewery_id',e.brewery_id,'count_id',e.effective_id,'location_id',e.location_id,
      'bin_id',e.bin_id,'bin_name',b.name,'sku_id',e.sku_id,'sku_name',s.name,'lot_id',e.lot_id,
      'qty_before',e.qty_before,'qty_counted',e.qty_counted,'movement_id',e.movement_id,'bbl',e.bbl,'movement_type',e.movement_type)
      order by e.bin_id,e.sku_id,e.lot_id nulls first),'[]'::jsonb)
      from private.taproom_effective_counts e
      left join public.bins b on b.id=e.bin_id and b.brewery_id=e.brewery_id
      left join public.skus s on s.id=e.sku_id and s.brewery_id=e.brewery_id
      where e.brewery_id=p_brewery and e.root_id=h.root_id and e.line_id is not null)) into v_result
  from private.taproom_effective_counts h
  join public.locations loc on loc.id=h.location_id and loc.brewery_id=h.brewery_id and 'taproom' = any(loc.uses)
  where h.brewery_id=p_brewery and h.root_id=v_root limit 1;
  if v_result is null then raise exception 'count not found'; end if;
  return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_taproom_count(p_brewery uuid, p_location uuid, p_counted_on date, p_revision text, p_lines jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_replay jsonb; v_snapshot jsonb; v_count uuid; v_channel uuid; v_tax public.tax_treatment;
  v_qty numeric; v_before numeric; v_movement uuid; v_bin uuid; v_sku uuid; v_lot uuid; v_disposition text;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse','taproom']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_taproom_count', p_request_id,
    jsonb_build_object('location', p_location, 'counted_on', p_counted_on, 'revision', p_revision, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  if not exists (select 1 from public.locations where id = p_location and brewery_id = p_brewery and 'taproom' = any(uses)) then
    raise exception 'choose an owned taproom location';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'count lines must be an array'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where jsonb_typeof(e) is distinct from 'object'
    or not (e ?& array['bin_id','sku_id','lot_id','qty_counted'])
    or jsonb_typeof(e->'bin_id') is distinct from 'string' or jsonb_typeof(e->'sku_id') is distinct from 'string'
    or jsonb_typeof(e->'lot_id') not in ('string','null') or jsonb_typeof(e->'qty_counted') is distinct from 'number') then raise exception 'explicit bin, SKU, lot UUID or null, and numeric counted quantity are required'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) e where e ? 'disposition' and (jsonb_typeof(e->'disposition') is distinct from 'string' or e->>'disposition' not in ('sold','destroyed'))) then raise exception 'choose sold or destroyed'; end if;
  if (select count(distinct jsonb_build_array((e->>'bin_id')::uuid, (e->>'sku_id')::uuid, (e->>'lot_id')::uuid)) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines)
    then raise exception 'duplicate count bucket'; end if;
  -- Count recording and correction share this location lock before the ledger lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('taproom-count:' || p_brewery::text || ':' || p_location::text, 0));
  -- ponytail: global ledger lock; migrate every writer to shared stock-key locks for higher throughput.
  lock table public.inventory_movements in share row exclusive mode;
  v_snapshot := private.taproom_count_snapshot(p_brewery, p_location);
  if p_counted_on is distinct from (v_snapshot->>'counted_on')::date then raise exception 'count today in the brewery timezone; historical counts cannot use current stock' using errcode = 'MG409'; end if;
  if p_counted_on <= (v_snapshot->'prior_count'->>'counted_on')::date then raise exception 'a count already exists on this date; count corrections are not yet available'; end if;
  if p_revision is distinct from v_snapshot->>'revision' then raise exception 'stock or prior count changed; refresh and review every bucket' using errcode = 'MG409'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric, disposition text)
    full join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
    where e.bin_id is null or b.bin_id is null)
    then raise exception 'count every displayed bucket exactly once; refresh for changed stock'; end if;
  -- Validate all observations before the first durable write.
  for v_bin, v_sku, v_lot, v_qty, v_before, v_disposition in
    select e.bin_id, e.sku_id, e.lot_id, e.qty_counted, b.qty_before, coalesce(e.disposition, 'sold')
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric, disposition text)
    join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
  loop
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty < 0 or v_qty <> trunc(v_qty) then raise exception 'count remaining whole packaged units; a partial keg counts as one until gone'; end if;
    if v_before < 0 or v_before <> trunc(v_before) then raise exception 'stock needs Warehouse review before counting'; end if;
    if v_qty > v_before then raise exception 'count exceeds recorded stock; ask Warehouse to investigate. Count correction is not yet available'; end if;
    if v_disposition='destroyed' and v_qty=v_before then raise exception 'classify destruction only for a shortage'; end if;
  end loop;
  insert into public.taproom_counts(brewery_id, location_id, counted_on, counted_by, prior_count_id)
    values(p_brewery, p_location, p_counted_on, v_actor, (v_snapshot->'prior_count'->>'id')::uuid) returning id into v_count;
  for v_bin, v_sku, v_lot, v_qty, v_before, v_disposition in
    select e.bin_id, e.sku_id, e.lot_id, e.qty_counted, b.qty_before, coalesce(e.disposition, 'sold')
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric, disposition text)
    join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
  loop
    v_movement := null;
    if v_qty < v_before then
      v_channel:=null; v_tax:=null;
      if v_disposition='sold' then
        select id, tax_treatment into v_channel, v_tax from public.sale_channels where brewery_id = p_brewery and system_code = 'taproom';
        if v_channel is null then raise exception 'Admin must restore the Taproom sale channel before recording depletion'; end if;
      end if;
      insert into public.inventory_movements(brewery_id, location_id, bin_id, sku_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, ref, created_by)
        values(p_brewery, p_location, v_bin, v_sku, v_lot,
          v_qty - v_before, case when v_disposition='destroyed' then 'destruction'::public.movement_type else 'depletion'::public.movement_type end, v_channel, v_tax, null, v_count, v_actor) returning id into v_movement;
    end if;
    insert into public.taproom_count_lines(brewery_id, count_id, location_id, bin_id, sku_id, lot_id, qty_before, qty_counted, movement_id)
      values(p_brewery, v_count, p_location, v_bin, v_sku, v_lot, v_before, v_qty, v_movement);
  end loop;
  return private.complete_command_request(p_request_id, private.get_taproom_count(p_brewery, v_count));
end $function$
;

CREATE OR REPLACE FUNCTION public.get_taproom_variance(p_brewery uuid, p_location uuid, p_weeks integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_today date; v_start date; v_result jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if p_weeks is null or p_weeks not in (4,12) then raise exception 'choose 4 or 12 weeks'; end if;
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  select (now() at time zone timezone)::date into v_today from public.breweries where id=p_brewery;
  v_start:=v_today-p_weeks*7+1;
  with counts as materialized (
    select brewery_id,location_id,root_id,effective_id,counted_on,observed_at,prior_count_id
    from private.taproom_effective_counts where brewery_id=p_brewery and location_id=p_location
    group by brewery_id,location_id,root_id,effective_id,counted_on,observed_at,prior_count_id
  ), periods as materialized (
    select c.effective_id count_id,c.prior_count_id,c.counted_on,prior.observed_at starts_at,c.observed_at ends_at,
      (prior.observed_at at time zone b.timezone)::date < v_start starts_before_window
    from counts c join public.breweries b on b.id=c.brewery_id
    left join counts prior on prior.effective_id=c.prior_count_id and prior.brewery_id=c.brewery_id and prior.location_id=c.location_id
    where c.counted_on between v_start and v_today
  ), actual as materialized (
    select p.count_id,s.brand_id,-sum(case when l.movement_type='depletion' then coalesce(l.bbl,0) else 0 end) actual_bbl, -sum(case when l.movement_type='destruction' then coalesce(l.bbl,0) else 0 end) destroyed_bbl
    from periods p join private.taproom_effective_counts l on l.effective_id=p.count_id and l.brewery_id=p_brewery
    join public.skus s on s.id=l.sku_id and s.brewery_id=p_brewery
    group by p.count_id,s.brand_id
  ), sources as (
    select l.connection_id,l.external_location_id,
      (select range_agg(tstzrange(c.starts_at,c.ends_at,'(]')) from public.pos_sales_coverage c
        where c.brewery_id=p_brewery and c.location_id=p_location and c.connection_id=l.connection_id and c.external_location_id=l.external_location_id and c.complete) covered
    from public.pos_locations l where l.brewery_id=p_brewery and l.location_id=p_location
  ), facts as materialized (
    select p.count_id,f.* from periods p
    cross join lateral private.taproom_pos_allocations(p_brewery,p_location,p.starts_at,p.ends_at) f
  ), expected as materialized (
    select count_id,brand_id,
      sum(expected_bbl) expected_bbl,sum(excluded_bbl) excluded_bbl,
      sum(unattributed_bbl) unattributed_bbl,bool_or(split) split
    from facts where brand_id is not null group by count_id,brand_id
  ), meta as materialized (
    select p.*,
      coalesce((select bool_and(coalesce(covered @> tstzrange(p.starts_at,p.ends_at,'(]'),false)) from sources),false) and p.prior_count_id is not null coverage_complete,
      (select count(*) from facts f where f.count_id=p.count_id and f.unmapped) unmapped_lines,
      (select sum(actual_bbl) from actual a where a.count_id=p.count_id) actual_bbl,
      (select coalesce(sum(destroyed_bbl),0) from actual a where a.count_id=p.count_id) destroyed_bbl,
      (select sum(expected_bbl) from expected e where e.count_id=p.count_id) mapped_bbl
    from periods p
  ), comparable as (
    select m.*,case when prior_count_id is null then 'missing_baseline'
      when mapped_bbl is null and not coverage_complete then 'no_pos_coverage' else null end reason
    from meta m
  ), brand_periods as (
    select c.count_id,k.brand_id,coalesce(a.actual_bbl,0) actual_bbl,coalesce(a.destroyed_bbl,0) destroyed_bbl,
      case when e.brand_id is not null then e.expected_bbl when c.coverage_complete and c.unmapped_lines=0 then 0 else null end expected_bbl,
      coalesce(e.excluded_bbl,0) excluded_bbl,coalesce(e.unattributed_bbl,0) unattributed_bbl,coalesce(e.split,false) split
    from comparable c join (select count_id,brand_id from actual union select count_id,brand_id from expected) k on k.count_id=c.count_id
    left join actual a on a.count_id=k.count_id and a.brand_id=k.brand_id
    left join expected e on e.count_id=k.count_id and e.brand_id=k.brand_id
    where c.reason is null
  ), totals as (
    select bp.brand_id,b.name brand_name,sum(actual_bbl) actual_bbl,sum(destroyed_bbl) destroyed_bbl,
      case when count(*)=count(expected_bbl) then sum(expected_bbl) end expected_bbl,
      case when count(*)=count(expected_bbl) then sum(expected_bbl)-sum(actual_bbl) end variance_bbl,
      sum(excluded_bbl) excluded_bbl,sum(unattributed_bbl) unattributed_bbl,bool_or(split) split,count(*) compared_periods
    from brand_periods bp join public.brands b on b.id=bp.brand_id and b.brewery_id=p_brewery group by bp.brand_id,b.name
  )
  select jsonb_build_object('location_id',p_location,'weeks',p_weeks,'window_start',v_start,'window_end',v_today,'as_of',now(),
    'projection','current; late reconciled sales can change expected and variance',
    'reason',case when not exists(select 1 from periods where prior_count_id is not null) then 'no_completed_periods'
      when not exists(select 1 from comparable where reason is null) then 'no_pos_coverage' else null end,
    'rows',(select coalesce(jsonb_agg(to_jsonb(t) order by brand_name,brand_id),'[]'::jsonb) from totals t),
    'periods',(select coalesce(jsonb_agg(to_jsonb(c)-'mapped_bbl' || jsonb_build_object('actual_bbl',coalesce(c.actual_bbl,0),
      'expected_bbl',case when c.reason is null then coalesce(c.mapped_bbl,case when c.unmapped_lines=0 then 0 end) end)
      order by c.ends_at,c.count_id),'[]'::jsonb) from comparable c)) into v_result;
  return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_taproom_counts(p_brewery uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  with headers as (
    select root_id,effective_id,location_id,counted_on,observed_at,counted_by,created_at,prior_count_id,corrected_at,corrected_by,correction_reason,
      count(line_id) observations,count(movement_id) movements,
      coalesce(sum(case when movement_type='depletion' then qty_before-qty_counted else 0 end),0) depleted_units,
      coalesce(sum(case when movement_type='destruction' then qty_before-qty_counted else 0 end),0) destroyed_units
    from private.taproom_effective_counts where brewery_id=p_brewery and location_id=p_location
    group by root_id,effective_id,location_id,counted_on,observed_at,counted_by,created_at,prior_count_id,corrected_at,corrected_by,correction_reason
    order by observed_at desc,effective_id desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',root_id,'root_id',root_id,'effective_id',effective_id,
    'location_id',location_id,'counted_on',counted_on,'observed_at',observed_at,'counted_by',counted_by,'created_at',created_at,
    'prior_count_id',prior_count_id,'corrected_at',corrected_at,'corrected_by',corrected_by,
    'correction_reason',correction_reason,'observations',observations,'movements',movements,'depleted_units',depleted_units,'destroyed_units',destroyed_units)
    order by observed_at desc,effective_id desc),'[]'::jsonb) into v_result from headers;
  return v_result;
end $function$
;

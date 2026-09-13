-- Locations carry a set of uses, not one kind. A site like Lawrenceville is a
-- taproom and storage and a warehouse at once; `locations.kind` could only say
-- one of those, so every guard that asked "is this a taproom?" was really
-- asking "is a taproom what this place mainly is?". `uses location_kind[]`
-- answers membership instead, and every predicate becomes `'x' = any(uses)`.
--
-- Order matters: add and backfill the column, replace every function and policy
-- that read `kind`, then drop the column. create_location/update_location change
-- signature (p_kind -> p_uses), so they are dropped and recreated with grants.

alter table public.locations add column uses public.location_kind[];
update public.locations set uses = array[kind];
alter table public.locations
  alter column uses set not null,
  add constraint locations_uses_nonempty check (cardinality(uses) >= 1);

-- One place to make a use list canonical: deduplicated, ordered, never empty.
-- Both location RPCs call it, so a caller can send ['taproom','taproom'] or a
-- different order and the stored row (and the replay payload) still compares equal.
create function private.clean_location_uses(p_uses public.location_kind[])
returns public.location_kind[] language plpgsql immutable set search_path = '' as $$
declare v_uses public.location_kind[];
begin
  if p_uses is null or cardinality(p_uses) = 0 then raise exception 'a location needs at least one use'; end if;
  select array_agg(distinct u order by u) into v_uses from unnest(p_uses) u;
  return v_uses;
end $$;

-- Predicates rewritten from kind = 'x' to 'x' = any(uses).
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
      and exists(select 1 from public.taproom_count_lines shortage where shortage.count_id=h.root_id and shortage.brewery_id=h.brewery_id and shortage.qty_counted<shortage.qty_before)
      and not exists(select 1 from private.taproom_effective_counts newer
      where newer.brewery_id=h.brewery_id and newer.location_id=h.location_id and newer.root_id<>h.root_id
        and (newer.observed_at,newer.root_id)>(h.observed_at,h.root_id)),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',e.root_line_id,'effective_line_id',e.line_id,
      'corrects_line_id',case when e.line_id=e.root_line_id then null else e.root_line_id end,
      'brewery_id',e.brewery_id,'count_id',e.effective_id,'location_id',e.location_id,
      'bin_id',e.bin_id,'bin_name',b.name,'sku_id',e.sku_id,'sku_name',s.name,'lot_id',e.lot_id,
      'qty_before',e.qty_before,'qty_counted',e.qty_counted,'movement_id',e.movement_id,'bbl',e.bbl)
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


CREATE OR REPLACE FUNCTION private.open_tap(p_brewery uuid, p_location uuid, p_sku uuid, p_label text, p_nominal_bbl numeric, p_tap_number text, p_opening_fill numeric, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_nominal numeric; v_format uuid; v_untracked boolean; v_row public.tap_intervals;
begin
  perform 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses) for share;
  if not found then raise exception 'choose an owned taproom location'; end if;
  if p_sku is null then
    if p_label is null or p_nominal_bbl is null then raise exception 'guest keg requires a label and nominal size'; end if;
    v_nominal:=p_nominal_bbl; v_untracked:=true;
  else
    if p_label is not null or p_nominal_bbl is not null then raise exception 'own keg uses its SKU label and format volume'; end if;
    -- Hold the authoritative identity and volume against concurrent catalog edits.
    select f.id into v_format from public.skus s join public.formats f on f.id=s.format_id and f.brewery_id=s.brewery_id
      where s.id=p_sku and s.brewery_id=p_brewery and f.basis='packaged' and f.package_type='keg' for share of s,f;
    if v_format is null then raise exception 'choose an owned packaged keg SKU'; end if;
    -- Component replacement locks its parent; child volume edits lock each child.
    perform 1 from public.format_components c join public.formats f on f.id=c.child_format_id and f.brewery_id=c.brewery_id
      where c.parent_format_id=v_format and c.brewery_id=p_brewery order by f.id for share of f;
    select bbl_per_unit into v_nominal from public.format_volumes where id=v_format and brewery_id=p_brewery;
    if v_nominal is null then raise exception 'keg format needs a nominal volume'; end if;
    select coalesce(sum(qty),0)<=0 into v_untracked from public.inventory_movements where brewery_id=p_brewery and location_id=p_location and sku_id=p_sku;
  end if;
  insert into public.tap_intervals(brewery_id,location_id,sku_id,label,nominal_bbl,tap_number,opening_fill,not_in_inventory,opened_by)
    values(p_brewery,p_location,p_sku,btrim(p_label),v_nominal,btrim(p_tap_number),p_opening_fill,v_untracked,p_actor) returning * into v_row;
  return to_jsonb(v_row);
end $function$
;


CREATE OR REPLACE FUNCTION private.portal_quote_snapshot(p_brewery uuid, p_customer uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_customer public.customers; v_ship public.ship_tos; v_source public.locations;
  v_lines jsonb; v_deposits jsonb; v_subtotal bigint; v_deposit bigint;
begin
  perform private.assert_order_lines(p_lines);
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where jsonb_typeof(e)<>'object' or not (e ?& array['sku_id','qty'])
      or (select count(*) from jsonb_object_keys(e))<>2
      or jsonb_typeof(e->'sku_id')<>'string' or jsonb_typeof(e->'qty')<>'number'
      or (e->>'qty')::numeric<=0 or (e->>'qty')::numeric<>trunc((e->>'qty')::numeric)
  ) then raise exception 'quote lines require a SKU and positive whole quantity'; end if;
  if (select count(distinct (e->>'sku_id')::uuid) from jsonb_array_elements(p_lines) e)<>jsonb_array_length(p_lines) then
    raise exception 'duplicate quote line';
  end if;
  select * into v_customer from public.customers where id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'customer not found'; end if;
  select * into v_ship from public.ship_tos where id=p_ship_to and customer_id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'ship-to not found'; end if;
  select l.* into v_source from public.breweries b join public.locations l
    on l.id=b.portal_fulfillment_location_id and l.brewery_id=b.id
    where b.id=p_brewery and 'warehouse' = any(l.uses);
  if not found then raise exception 'portal fulfillment source is not configured'; end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), resolved as (
    select r.sku_id,r.qty,p.sku_name,p.brand_name,p.unit_price_cents,
      (r.qty*p.unit_price_cents)::bigint amount_cents,s.qbo_item_id,s.qbo_realm_id,
      k.id pool_id,k.name pool_name,f.keg_size,k.deposit_cents
    from requested r
    join public.sku_prices p on p.brewery_id=p_brewery and p.sale_channel_id=v_customer.sale_channel_id
      and p.sku_id=r.sku_id and p.active
    join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    left join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
  )
  select jsonb_agg(jsonb_build_object(
      'skuId',sku_id,'name',sku_name,'product',brand_name,'qty',qty,
      'unitPriceCents',unit_price_cents,'amountCents',amount_cents,
      'qboItemId',qbo_item_id,'qboRealmId',qbo_realm_id,
      'depositPoolId',pool_id,'depositName',pool_name,'kegSize',keg_size,
      'depositUnitPriceCents',case when deposit_cents>0 then deposit_cents end) order by sku_id),
    coalesce(sum(amount_cents),0)
  into v_lines,v_subtotal from resolved;
  if coalesce(jsonb_array_length(v_lines),0)<>jsonb_array_length(p_lines) then
    raise exception 'sku is not active and priced for this customer';
  end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), deposits as (
    select k.id pool_id,k.name,k.deposit_cents,f.keg_size,sum(r.qty)::int qty
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
    where k.deposit_cents>0 group by k.id,k.name,k.deposit_cents,f.keg_size
  )
  select coalesce(jsonb_agg(jsonb_build_object('poolId',pool_id,'name',name,'kegSize',keg_size,
      'qty',qty,'unitPriceCents',deposit_cents,'amountCents',qty*deposit_cents) order by pool_id),'[]'),
    coalesce(sum(qty*deposit_cents),0)
  into v_deposits,v_deposit from deposits;

  return jsonb_build_object(
    'input',jsonb_build_object('shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines),
    'customer',jsonb_build_object('id',v_customer.id,'name',v_customer.name,'qboCustomerId',v_customer.qbo_customer_id,'qboRealmId',v_customer.qbo_realm_id),
    'source',jsonb_build_object('id',v_source.id,'name',v_source.name,'address',v_source.address),
    'destination',jsonb_build_object('id',v_ship.id,'label',v_ship.label,'address1',v_ship.address1,'address2',v_ship.address2,'city',v_ship.city,'state',v_ship.state,'zip',v_ship.zip),
    'lines',v_lines,'deposits',v_deposits,'subtotalCents',v_subtotal,
    'depositCents',v_deposit,'amountBeforeTaxCents',v_subtotal+v_deposit
  );
end $function$
;


CREATE OR REPLACE FUNCTION private.require_taproom_count_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.locations where id = new.location_id and brewery_id = new.brewery_id and 'taproom' = any(uses)) then
    raise exception 'choose an owned taproom location';
  end if;
  return new;
end $function$
;


CREATE OR REPLACE FUNCTION public.get_taproom_count_snapshot(p_brewery uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_staff_read(p_brewery, array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists (select 1 from public.locations where id = p_location and brewery_id = p_brewery and 'taproom' = any(uses)) then
    raise exception 'choose an owned taproom location';
  end if;
  return private.taproom_count_snapshot(p_brewery, p_location);
end $function$
;


CREATE OR REPLACE FUNCTION public.get_taproom_draft_projection(p_brewery uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count record; v_as_of timestamptz:=now(); v_result jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  select root_id,effective_id,counted_on,observed_at,created_at into v_count from private.taproom_effective_counts
    where brewery_id=p_brewery and location_id=p_location
    group by root_id,effective_id,counted_on,observed_at,created_at order by observed_at desc,effective_id desc limit 1;
  if not found then
    return jsonb_build_object('location_id',p_location,'prior_count',null,'starts_at',null,'ends_at',v_as_of,'as_of',v_as_of,
      'projection','current; late reconciled sales can change expected','reason','missing_baseline','expected_bbl',null,
      'coverage_complete',false,'coverage_sources','[]'::jsonb,'mapped_lines',0,'unmapped_lines',0,'ignored_lines',0,
      'excluded_bbl',0,'unattributed_bbl',0,'rows','[]'::jsonb);
  end if;
  with sources as materialized (
    select l.connection_id,l.external_location_id,
      coalesce(c.covered,'{}'::tstzmultirange) @> tstzrange(v_count.observed_at,v_as_of,'(]') complete,
      c.observed_starts_at,c.observed_ends_at,c.observed_windows
    from public.pos_locations l cross join lateral (
      select range_agg(tstzrange(c.starts_at,c.ends_at,'(]')) filter(where c.complete) covered,
        min(greatest(c.starts_at,v_count.observed_at)) observed_starts_at,
        max(least(c.ends_at,v_as_of)) observed_ends_at,count(*) observed_windows
      from public.pos_sales_coverage c where c.brewery_id=p_brewery and c.location_id=p_location
        and c.connection_id=l.connection_id and c.external_location_id=l.external_location_id
        and c.ends_at>v_count.observed_at and c.starts_at<v_as_of
    ) c where l.brewery_id=p_brewery and l.location_id=p_location
  ), facts as materialized (
    select * from private.taproom_pos_allocations(p_brewery,p_location,v_count.observed_at,v_as_of)
  ), brands as materialized (
    select f.brand_id,b.name brand_name,sum(f.expected_bbl) expected_bbl,sum(f.excluded_bbl) excluded_bbl,
      sum(f.unattributed_bbl) unattributed_bbl,bool_or(f.split) split
    from facts f join public.brands b on b.id=f.brand_id and b.brewery_id=p_brewery
    group by f.brand_id,b.name
  ), meta as (
    select (select sum(expected_bbl) from facts where brand_id is not null) mapped_bbl,
      (select count(*) from facts where brand_id is not null) mapped_lines,
      (select count(*) from facts where unmapped) unmapped_lines,
      (select count(*) from facts where ignored) ignored_lines,
      coalesce((select sum(excluded_bbl) from facts where brand_id is not null),0) excluded_bbl,
      coalesce((select sum(unattributed_bbl) from facts where brand_id is not null),0) unattributed_bbl,
      coalesce((select bool_and(complete) from sources),false) coverage_complete,
      coalesce((select sum(observed_windows) from sources),0) observed_windows
  )
  select jsonb_build_object('location_id',p_location,
    'prior_count',jsonb_build_object('id',v_count.effective_id,'counted_on',v_count.counted_on,'created_at',v_count.created_at,'observed_at',v_count.observed_at),
    'starts_at',v_count.observed_at,'ends_at',v_as_of,'as_of',v_as_of,
    'projection','current; late reconciled sales can change expected',
    'reason',case when m.mapped_bbl is not null then null
      when m.coverage_complete and m.unmapped_lines=0 then null
      when m.coverage_complete then 'unmapped_pos_lines'
      when m.observed_windows=0 then 'no_pos_coverage' else 'incomplete_pos_coverage' end,
    'expected_bbl',case when m.mapped_bbl is not null then m.mapped_bbl
      when m.coverage_complete and m.unmapped_lines=0 then 0 end,
    'coverage_complete',m.coverage_complete,
    'coverage_sources',(select coalesce(jsonb_agg(to_jsonb(s)-'observed_windows' order by external_location_id,connection_id),'[]'::jsonb) from sources s),
    'mapped_lines',m.mapped_lines,'unmapped_lines',m.unmapped_lines,'ignored_lines',m.ignored_lines,
    'excluded_bbl',m.excluded_bbl,'unattributed_bbl',m.unattributed_bbl,
    'rows',(select coalesce(jsonb_agg(to_jsonb(b) order by brand_name,brand_id),'[]'::jsonb) from brands b)) into v_result
  from meta m;
  return v_result;
end $function$
;


CREATE OR REPLACE FUNCTION public.get_taproom_print_labels(p_brewery uuid, p_location uuid, p_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_snapshot jsonb;
begin
  perform private.assert_staff_read(p_brewery, array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists (select 1 from public.locations where id = p_location and brewery_id = p_brewery and 'taproom' = any(uses)) then
    raise exception 'choose an owned taproom location';
  end if;
  v_snapshot := private.taproom_count_snapshot(p_brewery, p_location);
  if p_revision is distinct from v_snapshot->>'revision' then
    raise exception 'stock or prior count changed; reload and review the count before printing' using errcode = 'MG409';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'worksheet_row', d.worksheet_row,
      'bin_id', d.bin_id, 'bin_name', d.bin_name,
      'sku_id', d.sku_id, 'sku_name', d.sku_name,
      'brand_id', d.brand_id, 'brand_name', d.brand_name,
      'package_volume_label', f.name,
      'lot_id', d.lot_id, 'lot_code', l.code,
      'qty', d.qty_before
    ) order by d.worksheet_row)
    from (
      select row_number() over (order by s.bin_id, s.sku_id, s.lot_id nulls first) worksheet_row, s.*
      from jsonb_to_recordset(v_snapshot->'lines') as s(
        bin_id uuid, bin_name text, sku_id uuid, sku_name text, brand_id uuid,
        brand_name text, bbl_per_unit numeric, lot_id uuid, qty_before numeric)
    ) d
    join public.skus s on s.id = d.sku_id and s.brewery_id = p_brewery
    join public.formats f on f.id = s.format_id and f.brewery_id = p_brewery
    left join public.lots l on l.id = d.lot_id and l.brewery_id = p_brewery
    where d.qty_before > 0
  ), '[]'::jsonb);
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
    select p.count_id,s.brand_id,-sum(coalesce(l.bbl,0)) actual_bbl
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
      (select sum(expected_bbl) from expected e where e.count_id=p.count_id) mapped_bbl
    from periods p
  ), comparable as (
    select m.*,case when prior_count_id is null then 'missing_baseline'
      when mapped_bbl is null and not coverage_complete then 'no_pos_coverage' else null end reason
    from meta m
  ), brand_periods as (
    select c.count_id,k.brand_id,coalesce(a.actual_bbl,0) actual_bbl,
      case when e.brand_id is not null then e.expected_bbl when c.coverage_complete and c.unmapped_lines=0 then 0 else null end expected_bbl,
      coalesce(e.excluded_bbl,0) excluded_bbl,coalesce(e.unattributed_bbl,0) unattributed_bbl,coalesce(e.split,false) split
    from comparable c join (select count_id,brand_id from actual union select count_id,brand_id from expected) k on k.count_id=c.count_id
    left join actual a on a.count_id=k.count_id and a.brand_id=k.brand_id
    left join expected e on e.count_id=k.count_id and e.brand_id=k.brand_id
    where c.reason is null
  ), totals as (
    select bp.brand_id,b.name brand_name,sum(actual_bbl) actual_bbl,
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


CREATE OR REPLACE FUNCTION public.keg_bin_on_hand_rows()
 RETURNS TABLE(brewery_id uuid, pool_id uuid, keg_size keg_size, location_id uuid, bin_id uuid, qty integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select e.brewery_id, e.pool_id, e.keg_size, e.location_id, e.bin_id,
         sum(case e.reason when 'acquired' then e.qty when 'found' then e.qty when 'transferred_in' then e.qty when 'returned' then e.qty
                         when 'retired' then -e.qty when 'lost' then -e.qty when 'transferred_out' then -e.qty when 'shipped' then -e.qty else 0 end)::int
  from public.keg_events e
  join public.locations l on l.id = e.location_id and l.brewery_id = e.brewery_id
  where e.brewery_id in (select public.my_brewery_ids())
    and (public.is_staff_of(e.brewery_id)
         or (public.staff_role(e.brewery_id) = 'taproom' and 'taproom' = any(l.uses)))
  group by 1,2,3,4,5;
$function$
;


CREATE OR REPLACE FUNCTION public.list_open_taps(p_brewery uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('sku_name',s.name,'brand_id',s.brand_id,'brand_name',b.name,'opened_by_label',split_part(u.email,'@',1))
    order by t.tap_number nulls last,t.opened_at,t.id),'[]'::jsonb)
    from public.tap_intervals t left join public.skus s on s.id=t.sku_id and s.brewery_id=t.brewery_id
    left join public.brands b on b.id=s.brand_id and b.brewery_id=t.brewery_id
    left join auth.users u on u.id=t.opened_by
    where t.brewery_id=p_brewery and t.location_id=p_location and t.closed_at is null);
end $function$
;


CREATE OR REPLACE FUNCTION public.list_tap_history(p_brewery uuid, p_location uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('opened_by_label',split_part(o.email,'@',1),
    'closed_by_label',split_part(c.email,'@',1),'sku_name',s.name,'brand_name',b.name) order by t.closed_at desc,t.id),'[]'::jsonb) from
    (select * from public.tap_intervals where brewery_id=p_brewery and location_id=p_location and closed_at is not null order by closed_at desc,id limit 50) t
    left join auth.users o on o.id=t.opened_by left join auth.users c on c.id=t.closed_by
    left join public.skus s on s.id=t.sku_id and s.brewery_id=t.brewery_id left join public.brands b on b.id=s.brand_id and b.brewery_id=t.brewery_id);
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
      coalesce(sum(qty_before-qty_counted),0) depleted_units
    from private.taproom_effective_counts where brewery_id=p_brewery and location_id=p_location
    group by root_id,effective_id,location_id,counted_on,observed_at,counted_by,created_at,prior_count_id,corrected_at,corrected_by,correction_reason
    order by observed_at desc,effective_id desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',root_id,'root_id',root_id,'effective_id',effective_id,
    'location_id',location_id,'counted_on',counted_on,'observed_at',observed_at,'counted_by',counted_by,'created_at',created_at,
    'prior_count_id',prior_count_id,'corrected_at',corrected_at,'corrected_by',corrected_by,
    'correction_reason',correction_reason,'observations',observations,'movements',movements,'depleted_units',depleted_units)
    order by observed_at desc,effective_id desc),'[]'::jsonb) into v_result from headers;
  return v_result;
end $function$
;


CREATE OR REPLACE FUNCTION public.on_hand_rows()
 RETURNS TABLE(brewery_id uuid, sku_id uuid, location_id uuid, qty numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.brewery_id, m.sku_id, m.location_id, sum(m.qty)
  from public.inventory_movements m
  join public.locations l on l.id = m.location_id and l.brewery_id = m.brewery_id
  where m.brewery_id in (select public.my_brewery_ids())
    and (public.is_staff_of(m.brewery_id)
         or (public.staff_role(m.brewery_id) = 'taproom' and 'taproom' = any(l.uses)))
  group by 1,2,3;
$function$
;


CREATE OR REPLACE FUNCTION public.record_taproom_count(p_brewery uuid, p_location uuid, p_counted_on date, p_revision text, p_lines jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_replay jsonb; v_snapshot jsonb; v_count uuid; v_channel uuid; v_tax public.tax_treatment;
  v_qty numeric; v_before numeric; v_movement uuid; v_bin uuid; v_sku uuid; v_lot uuid;
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
  if (select count(distinct jsonb_build_array((e->>'bin_id')::uuid, (e->>'sku_id')::uuid, (e->>'lot_id')::uuid)) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines)
    then raise exception 'duplicate count bucket'; end if;
  -- Count-only scope lock precedes the ledger, like shipping's document lock.
  -- No sibling ledger writer acquires this advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('taproom-count:' || p_brewery::text || ':' || p_location::text, 0));
  -- ponytail: global ledger lock; migrate every writer to shared stock-key locks for higher throughput.
  lock table public.inventory_movements in share row exclusive mode;
  v_snapshot := private.taproom_count_snapshot(p_brewery, p_location);
  if p_counted_on is distinct from (v_snapshot->>'counted_on')::date then raise exception 'count today in the brewery timezone; historical counts cannot use current stock' using errcode = 'MG409'; end if;
  if p_counted_on <= (v_snapshot->'prior_count'->>'counted_on')::date then raise exception 'a count already exists on this date; count corrections are not yet available'; end if;
  if p_revision is distinct from v_snapshot->>'revision' then raise exception 'stock or prior count changed; refresh and review every bucket' using errcode = 'MG409'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric)
    full join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
    where e.bin_id is null or b.bin_id is null)
    then raise exception 'count every displayed bucket exactly once; refresh for changed stock'; end if;
  -- Validate all observations before the first durable write.
  for v_bin, v_sku, v_lot, v_qty, v_before in
    select e.bin_id, e.sku_id, e.lot_id, e.qty_counted, b.qty_before
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric)
    join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
  loop
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty < 0 or v_qty <> trunc(v_qty) then raise exception 'count remaining whole packaged units; a partial keg counts as one until gone'; end if;
    if v_before < 0 or v_before <> trunc(v_before) then raise exception 'stock needs Warehouse review before counting'; end if;
    if v_qty > v_before then raise exception 'count exceeds recorded stock; ask Warehouse to investigate. Count correction is not yet available'; end if;
  end loop;
  insert into public.taproom_counts(brewery_id, location_id, counted_on, counted_by, prior_count_id)
    values(p_brewery, p_location, p_counted_on, v_actor, (v_snapshot->'prior_count'->>'id')::uuid) returning id into v_count;
  for v_bin, v_sku, v_lot, v_qty, v_before in
    select e.bin_id, e.sku_id, e.lot_id, e.qty_counted, b.qty_before
    from jsonb_to_recordset(p_lines) as e(bin_id uuid, sku_id uuid, lot_id uuid, qty_counted numeric)
    join jsonb_to_recordset(v_snapshot->'lines') as b(bin_id uuid, sku_id uuid, lot_id uuid, qty_before numeric, bin_name text, sku_name text)
      on e.bin_id = b.bin_id and e.sku_id = b.sku_id and e.lot_id is not distinct from b.lot_id
  loop
    v_movement := null;
    if v_qty < v_before then
      select id, tax_treatment into v_channel, v_tax from public.sale_channels where brewery_id = p_brewery and system_code = 'taproom';
      if v_channel is null then raise exception 'Admin must restore the Taproom sale channel before recording depletion'; end if;
      insert into public.inventory_movements(brewery_id, location_id, bin_id, sku_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, ref, created_by)
        values(p_brewery, p_location, v_bin, v_sku, v_lot,
          v_qty - v_before, 'depletion', v_channel, v_tax, null, v_count, v_actor) returning id into v_movement;
    end if;
    insert into public.taproom_count_lines(brewery_id, count_id, location_id, bin_id, sku_id, lot_id, qty_before, qty_counted, movement_id)
      values(p_brewery, v_count, p_location, v_bin, v_sku, v_lot, v_before, v_qty, v_movement);
  end loop;
  return private.complete_command_request(p_request_id, private.get_taproom_count(p_brewery, v_count));
end $function$
;


CREATE OR REPLACE FUNCTION public.set_portal_fulfillment_source(p_brewery uuid, p_location uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_portal_fulfillment_source', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location));
  if v_replay is not null then return v_replay; end if;
  if not exists (
    select 1 from public.locations where id = p_location and brewery_id = p_brewery and 'warehouse' = any(uses)
  ) then
    raise exception 'portal fulfillment source must be a brewery warehouse';
  end if;
  update public.breweries set portal_fulfillment_location_id = p_location where id = p_brewery;
  return private.complete_command_request(p_request_id, jsonb_build_object('brewery_id', p_brewery, 'location_id', p_location));
end $function$
;

-- Movement preview metadata reports the whole set.
CREATE OR REPLACE FUNCTION private.inventory_movement_proposal(p_brewery uuid, p_sku uuid, p_location uuid, p_bin uuid, p_qty numeric, p_type movement_type, p_sale_channel uuid, p_dest_state text, p_note text, p_lot uuid, p_lock boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_meta jsonb; v_lot jsonb; v_channel jsonb; v_stock_qty numeric; v_stock_bbl numeric;
  v_brand uuid; v_format uuid;
  v_movement_count bigint; v_movement_ids jsonb; v_components jsonb; v_registration jsonb;
  v_effects jsonb; v_warnings jsonb := '[]'::jsonb; v_version jsonb;
begin
  if p_type not in ('opening_balance','production_in','adjustment','depletion','return_in','destruction','loss','sample','festival_removal')
    then raise exception 'movement type is not supported in chat'; end if;
  if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty=0 or p_qty<>round(p_qty,2)
    then raise exception 'invalid movement quantity'; end if;

  if (p_type in ('opening_balance','production_in','return_in') and p_qty<0)
     or (p_type in ('depletion','destruction','loss','sample','festival_removal') and p_qty>0)
    then raise exception 'movement quantity has the wrong sign for its type'; end if;
  if (p_type='depletion') is distinct from (p_sale_channel is not null)
    then raise exception 'depletion requires a sale channel and other movements cannot carry one'; end if;
  if (p_type in ('sample','festival_removal')) is distinct from (p_dest_state is not null)
    or (p_dest_state is not null and p_dest_state !~ '^[A-Z]{2}$')
    then raise exception 'sample and festival removals require a two-letter destination state'; end if;

  if p_lock then
    select brand_id,format_id into v_brand,v_format from public.skus
      where id=p_sku and brewery_id=p_brewery for share;
    perform 1 from public.brands where id=v_brand and brewery_id=p_brewery for share;
    -- The parent row conflicts with complete component replacement, including
    -- inserting a child where no component row existed at preview time.
    perform 1 from public.formats where id=v_format and brewery_id=p_brewery for share;
    perform 1 from public.format_components where brewery_id=p_brewery
      and parent_format_id=v_format order by child_format_id for share;
    perform 1 from public.formats where brewery_id=p_brewery and id in (
      select child_format_id from public.format_components
      where brewery_id=p_brewery and parent_format_id=v_format
    ) order by id for share;
    perform 1 from public.locations where id=p_location and brewery_id=p_brewery for share;
    perform 1 from public.bins where id=p_bin and location_id=p_location and brewery_id=p_brewery for share;
  end if;
  -- Each statement gets a fresh READ COMMITTED snapshot. Build displayed
  -- metadata only after every relevant row lock has completed.
  select jsonb_build_object(
    'skuId',s.id,'skuName',s.name,'skuActive',s.active,
    'brandId',br.id,'brandName',br.name,'formatId',f.id,'formatName',f.name,
    'packageType',f.package_type,'bblPerUnit',fv.bbl_per_unit,
    'locationId',l.id,'locationName',l.name,'locationUses',l.uses,'binId',b.id,'binName',b.name
  ) into v_meta
  from public.skus s
  join public.brands br on br.id=s.brand_id and br.brewery_id=s.brewery_id
  join public.formats f on f.id=s.format_id and f.brewery_id=s.brewery_id
  join public.format_volumes fv on fv.id=f.id and fv.brewery_id=f.brewery_id
  join public.locations l on l.id=p_location and l.brewery_id=s.brewery_id
  join public.bins b on b.id=p_bin and b.location_id=l.id and b.brewery_id=l.brewery_id
  where s.id=p_sku and s.brewery_id=p_brewery;
  if v_meta is null then raise exception 'invalid movement selection'; end if;
  if not (v_meta->>'skuActive')::boolean then raise exception 'inactive SKU cannot receive a new movement'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',child.id,'name',child.name,'qty',fc.qty,
    'bblPerUnit',child.bbl_per_unit) order by child.id),'[]'::jsonb) into v_components
  from public.format_components fc join public.formats child
    on child.id=fc.child_format_id and child.brewery_id=fc.brewery_id
  where fc.brewery_id=p_brewery and fc.parent_format_id=(v_meta->>'formatId')::uuid;

  if p_lot is not null then
    if p_lock then perform 1 from public.lots where id=p_lot and brewery_id=p_brewery for share; end if;
    select to_jsonb(lot) into v_lot from public.lots lot where id=p_lot and brewery_id=p_brewery;
    if not found or not exists(select 1 from public.inventory_movements
      where brewery_id=p_brewery and sku_id=p_sku and lot_id=p_lot)
      then raise exception 'lot does not belong to SKU'; end if;
  end if;

  if p_sale_channel is not null then
    if p_lock then perform 1 from public.sale_channels where id=p_sale_channel and brewery_id=p_brewery for share; end if;
    select jsonb_build_object('id',id,'name',name,'taxTreatment',tax_treatment)
      into v_channel from public.sale_channels where id=p_sale_channel and brewery_id=p_brewery;
    if not found then raise exception 'invalid sale channel'; end if;
  end if;

  select count(*),coalesce(sum(qty),0),coalesce(sum(bbl),0),coalesce(jsonb_agg(id order by id),'[]'::jsonb)
    into v_movement_count,v_stock_qty,v_stock_bbl,v_movement_ids
  from public.inventory_movements where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location
    and bin_id=p_bin and lot_id is not distinct from p_lot;
  if p_qty<0 and -p_qty>v_stock_qty then
    if p_lot is null and exists(select 1 from public.inventory_movements
      where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location and bin_id=p_bin and lot_id is not null)
      then raise exception 'choose the recorded lot for this removal'; end if;
    raise exception 'insufficient selected bin and lot stock';
  end if;

  if p_dest_state is not null then
    if p_lock then perform 1 from public.state_registrations where brewery_id=p_brewery
      and brand_id=(v_meta->>'brandId')::uuid and state=p_dest_state for share; end if;
    select to_jsonb(r) into v_registration from (
      select id,state,registration_no,approved_on,expires_on from public.state_registrations
      where brewery_id=p_brewery and brand_id=(v_meta->>'brandId')::uuid and state=p_dest_state
    ) r;
    if v_registration is null or (v_registration->>'approved_on')::date>current_date
       or (v_registration->>'expires_on')::date<current_date then
      v_warnings:=jsonb_build_array((v_meta->>'brandName')||' is not registered in '||p_dest_state);
    end if;
  end if;

  v_version:=jsonb_build_object(
    'sku',jsonb_build_object('id',v_meta->>'skuId','name',v_meta->>'skuName','active',(v_meta->>'skuActive')::boolean),
    'brand',jsonb_build_object('id',v_meta->>'brandId','name',v_meta->>'brandName'),
    'format',jsonb_build_object('id',v_meta->>'formatId','name',v_meta->>'formatName',
      'packageType',v_meta->>'packageType','bblPerUnit',(v_meta->>'bblPerUnit')::numeric,'components',v_components),
    'location',jsonb_build_object('id',v_meta->>'locationId','name',v_meta->>'locationName','uses',v_meta->'locationUses'),
    'bin',jsonb_build_object('id',v_meta->>'binId','name',v_meta->>'binName'),
    'lot',case when p_lot is null then null else jsonb_build_object('id',v_lot->>'id','code',v_lot->>'code','packagedOn',v_lot->>'packaged_on','bestBy',v_lot->>'best_by') end,
    'channel',v_channel,
    'registration',v_registration,
    'proposal',jsonb_build_object('qty',p_qty,'type',p_type,'destState',p_dest_state,'note',p_note),
    'stock',jsonb_build_object('movementCount',v_movement_count,'movementIds',v_movement_ids,'qty',v_stock_qty,'bbl',v_stock_bbl));
  v_effects:=jsonb_build_array(jsonb_build_object(
    'label',(v_meta->>'skuName')||' · '||(v_meta->>'locationName')||' · '||(v_meta->>'binName'),
    'qty',p_qty::text,'bbl',round(p_qty*(v_meta->>'bblPerUnit')::numeric,8)::text,
    'stockBeforeQty',v_stock_qty::text,'stockAfterQty',(v_stock_qty+p_qty)::text,
    'stockBeforeBbl',v_stock_bbl::text,'stockAfterBbl',round(v_stock_bbl+p_qty*(v_meta->>'bblPerUnit')::numeric,8)::text,
    'type',p_type,'taxTreatment',v_channel->>'taxTreatment','destinationState',p_dest_state,
    'correction',case when p_type in ('adjustment','loss') then 'reverse_inventory_movement' else null end));
  return jsonb_build_object('effects',v_effects,'warnings',v_warnings,'version',v_version);
end $function$
;


-- Taproom staff see a location, its bins and its pars when a taproom is among
-- that location's uses.
drop policy staff_read on public.locations;
create policy staff_read on public.locations for select using (
  public.is_staff_of(brewery_id) or (public.taproom_can(brewery_id, 'locations') and 'taproom' = any(uses)));
drop policy staff_read on public.bins;
create policy staff_read on public.bins for select using (
  public.is_staff_of(brewery_id) or (public.taproom_can(brewery_id, 'bins')
    and location_id in (select id from public.locations where 'taproom' = any(uses))));
drop policy staff_read on public.taproom_pars;
create policy staff_read on public.taproom_pars for select using (
  public.is_staff_of(brewery_id) or (public.taproom_can(brewery_id, 'taproom_pars')
    and location_id in (select id from public.locations where 'taproom' = any(uses))));

alter table public.locations drop column kind;

drop function public.create_location(uuid, text, public.location_kind, uuid);
drop function public.update_location(uuid, uuid, text, public.location_kind, uuid);

create function create_location(
  p_brewery uuid, p_name text, p_uses public.location_kind[], p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.locations; v_uses public.location_kind[];
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_uses := private.clean_location_uses(p_uses);
  v_replay := private.claim_command_request(p_brewery, 'create_location', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'uses', to_jsonb(v_uses)));
  if v_replay is not null then return v_replay; end if;
  insert into public.locations (brewery_id, name, uses) values (p_brewery, p_name, v_uses) returning * into v_row;
  -- A location always has at least one bin; the trio is a starting point the
  -- brewery renames or trims (never to zero: delete_bin refuses the last one).
  insert into public.bins (brewery_id, location_id, name)
    values (p_brewery, v_row.id, 'Walk-in'), (p_brewery, v_row.id, 'Cold'), (p_brewery, v_row.id, 'Dry');
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function update_location(
  p_brewery uuid, p_id uuid, p_name text, p_uses public.location_kind[], p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.locations; v_uses public.location_kind[];
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_uses := private.clean_location_uses(p_uses);
  v_replay := private.claim_command_request(p_brewery, 'update_location', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'uses', to_jsonb(v_uses)));
  if v_replay is not null then return v_replay; end if;
  update public.locations set name = p_name, uses = v_uses where id = p_id and brewery_id = p_brewery returning * into v_row;
  if v_row.id is null then raise exception 'location not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function create_location(uuid,text,public.location_kind[],uuid) from public, anon, authenticated;
revoke all on function update_location(uuid,uuid,text,public.location_kind[],uuid) from public, anon, authenticated;
grant execute on function
  create_location(uuid,text,public.location_kind[],uuid),
  update_location(uuid,uuid,text,public.location_kind[],uuid)
  to authenticated;

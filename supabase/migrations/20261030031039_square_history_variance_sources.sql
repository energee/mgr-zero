-- Retired mappings remain sources for historical count comparisons and for
-- unresolved/ignored sales made before retirement.
create function private.pos_location_periods(p_brewery uuid)
returns table(brewery_id uuid,connection_id uuid,external_location_id text,location_id uuid,starts_at timestamptz,ends_at timestamptz)
language sql stable set search_path='' as $$
  select l.brewery_id,l.connection_id,l.external_location_id,l.location_id,l.mapping_started_at,'infinity'::timestamptz
    from public.pos_locations l where l.brewery_id=p_brewery and l.location_id is not null
  union all
  select h.brewery_id,h.connection_id,h.external_location_id,h.location_id,h.starts_at,h.ends_at
    from public.pos_location_mapping_history h where h.brewery_id=p_brewery;
$$;
revoke all on function private.pos_location_periods(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.taproom_pos_allocations (
  p_brewery   uuid,
  p_location  uuid,
  p_starts_at timestamp with time zone,
  p_ends_at   timestamp with time zone
)
  RETURNS TABLE (
    sale_id          uuid,
    brand_id         uuid,
    expected_bbl     numeric,
    excluded_bbl     numeric,
    unattributed_bbl numeric,
    split            boolean,
    ignored          boolean,
    unmapped         boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  WITH facts AS (
    SELECT s.id,e.brand_id,e.expected_bbl,e.sku_id,coalesce(m.ignored,false) ignored,s.sold_at,s.fact_status,s.contributes
    FROM private.pos_current_sales s
    LEFT JOIN public.pos_sale_expectations e ON e.sale_id=s.id AND e.brewery_id=p_brewery AND s.contributes
    LEFT JOIN private.pos_location_periods(p_brewery) loc ON loc.connection_id=s.connection_id AND loc.external_location_id=s.external_location_id
      AND s.sold_at>=loc.starts_at AND s.sold_at<loc.ends_at
    LEFT JOIN public.pos_catalog_variations c ON c.connection_id=s.connection_id AND c.external_variation_id=s.external_variation_id
    LEFT JOIN public.pos_item_mappings m ON m.connection_id=s.connection_id AND m.external_item_id=coalesce(s.external_item_id,c.external_item_id)
      AND m.external_variation_id=s.external_variation_id AND m.brewery_id=p_brewery
    WHERE s.brewery_id=p_brewery AND s.fact_status<>'removed' AND s.sold_at>p_starts_at AND s.sold_at<=p_ends_at
      AND coalesce(e.location_id,loc.location_id)=p_location
  )
  SELECT f.id,f.brand_id,
    f.expected_bbl*CASE WHEN coalesce(t.n,0)=0 THEN 1 ELSE (t.n-t.excluded)::numeric/t.n END,
    f.expected_bbl*CASE WHEN coalesce(t.n,0)=0 THEN 0 ELSE t.excluded::numeric/t.n END,
    CASE WHEN coalesce(t.n,0)=0 AND f.sku_id IS NULL THEN f.expected_bbl ELSE 0 END,
    coalesce(t.n,0)>1,f.ignored,f.brand_id IS NULL AND NOT f.ignored
  FROM facts f LEFT JOIN LATERAL (
    SELECT count(*) n,count(*) FILTER(WHERE i.not_in_inventory) excluded FROM public.tap_intervals i
    JOIN public.skus s ON s.id=i.sku_id AND s.brewery_id=p_brewery
    WHERE i.brewery_id=p_brewery AND i.location_id=p_location AND s.brand_id=f.brand_id
      AND i.opened_at<=f.sold_at AND (i.closed_at IS NULL OR f.sold_at<i.closed_at)
  ) t ON f.sku_id IS NULL
$function$;


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
    select l.connection_id,l.external_location_id,l.starts_at,l.ends_at,
      (select range_agg(tstzrange(c.starts_at,c.ends_at,'(]')) from public.pos_sales_coverage c
        where c.brewery_id=p_brewery and c.location_id=p_location and c.connection_id=l.connection_id and c.external_location_id=l.external_location_id and c.complete) covered
    from private.pos_location_periods(p_brewery) l where l.location_id=p_location
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
      coalesce((select bool_and(coalesce(covered @> tstzrange(greatest(p.starts_at,s.starts_at),least(p.ends_at,s.ends_at),'(]'),false))
        and range_agg(tstzrange(greatest(p.starts_at,s.starts_at),least(p.ends_at,s.ends_at),'(]')) @> tstzrange(p.starts_at,p.ends_at,'(]')
        from sources s where s.starts_at<p.ends_at and s.ends_at>p.starts_at),false) and p.prior_count_id is not null coverage_complete,
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
      coalesce(c.covered,'{}'::tstzmultirange) @> tstzrange(greatest(v_count.observed_at,l.starts_at),least(v_as_of,l.ends_at),'(]') complete,
      tstzrange(greatest(v_count.observed_at,l.starts_at),least(v_as_of,l.ends_at),'(]') required_window,
      c.observed_starts_at,c.observed_ends_at,c.observed_windows
    from private.pos_location_periods(p_brewery) l cross join lateral (
      select range_agg(tstzrange(c.starts_at,c.ends_at,'(]')) filter(where c.complete) covered,
        min(greatest(c.starts_at,v_count.observed_at,l.starts_at)) observed_starts_at,
        max(least(c.ends_at,v_as_of,l.ends_at)) observed_ends_at,count(*) observed_windows
      from public.pos_sales_coverage c where c.brewery_id=p_brewery and c.location_id=p_location
        and c.connection_id=l.connection_id and c.external_location_id=l.external_location_id
        and c.ends_at>greatest(v_count.observed_at,l.starts_at) and c.starts_at<least(v_as_of,l.ends_at)
    ) c where l.location_id=p_location and l.starts_at<v_as_of and l.ends_at>v_count.observed_at
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
      coalesce((select bool_and(complete) and range_agg(required_window) @> tstzrange(v_count.observed_at,v_as_of,'(]') from sources),false) coverage_complete,
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
    'coverage_sources',(select coalesce(jsonb_agg(to_jsonb(s)-'observed_windows'-'required_window' order by external_location_id,connection_id),'[]'::jsonb) from sources s),
    'mapped_lines',m.mapped_lines,'unmapped_lines',m.unmapped_lines,'ignored_lines',m.ignored_lines,
    'excluded_bbl',m.excluded_bbl,'unattributed_bbl',m.unattributed_bbl,
    'rows',(select coalesce(jsonb_agg(to_jsonb(b) order by brand_name,brand_id),'[]'::jsonb) from brands b)) into v_result
  from meta m;
  return v_result;
end $function$
;



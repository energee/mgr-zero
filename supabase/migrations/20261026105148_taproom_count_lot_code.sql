-- Saved count labels come from their durable lot, even after stock reaches zero.
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

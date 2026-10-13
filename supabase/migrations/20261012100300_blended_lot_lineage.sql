-- Lot lineage records membership and stored transfers, never proportional shares.
-- Each upstream step uses its outgoing transfer time, not the packaging cutoff.
-- UNION deduplicates temporal states during expansion, not after enumerating
-- paths. Revisiting a tank at an earlier cutoff preserves its older sources.
create function private.lot_lineage(p_brewery uuid, p_lot uuid)
returns table (occupancy_id uuid, transfer_id uuid)
language sql stable security definer set search_path = '' as $$
  with recursive lineage(occupancy_id, transfer_id, cutoff) as (
    select r.occupancy_id, null::uuid, r.closed_at
    from public.lots l join public.packaging_runs r on r.id = l.packaging_run_id and r.brewery_id = l.brewery_id
    where l.id = p_lot and l.brewery_id = p_brewery and r.closed_at is not null
    union
    select t.from_occupancy_id, t.id, t.at
    from lineage join public.transfers t on t.to_occupancy_id = lineage.occupancy_id
    where t.brewery_id = p_brewery and t.at <= lineage.cutoff
  ) select distinct occupancy_id, transfer_id from lineage;
$$;
revoke all on function private.lot_lineage(uuid,uuid) from public, anon, authenticated;

create function public.trace_lot_sources(p_brewery uuid, p_lot uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists(select 1 from public.lots where id = p_lot and brewery_id = p_brewery) then
    raise exception using errcode = 'MG404', message = 'lot not found';
  end if;
  with lineage as materialized (select * from private.lot_lineage(p_brewery, p_lot)),
  batches as (
    select distinct b.id, b.batch_no, b.brewed_on
    from lineage join public.vessel_occupancies o on o.id = lineage.occupancy_id and o.brewery_id = p_brewery
    join public.batches b on b.id = o.batch_id and b.brewery_id = p_brewery
  ), transfers as (
    select distinct t.id, t.from_occupancy_id, t.to_occupancy_id, t.bbl, t.at,
      source.batch_id as from_batch_id, destination.batch_id as to_batch_id,
      source_vessel.name as from_vessel, destination_vessel.name as to_vessel
    from lineage join public.transfers t on t.id = lineage.transfer_id and t.brewery_id = p_brewery
    join public.vessel_occupancies source on source.id = t.from_occupancy_id and source.brewery_id = p_brewery
    join public.vessel_occupancies destination on destination.id = t.to_occupancy_id and destination.brewery_id = p_brewery
    join public.vessels source_vessel on source_vessel.id = source.vessel_id and source_vessel.brewery_id = p_brewery
    join public.vessels destination_vessel on destination_vessel.id = destination.vessel_id and destination_vessel.brewery_id = p_brewery
  ) select jsonb_build_object(
    'batches', coalesce((select jsonb_agg(to_jsonb(batches) order by batch_no, id) from batches), '[]'::jsonb),
    'transfers', coalesce((select jsonb_agg(to_jsonb(transfers) order by at, id) from transfers), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.trace_lot_sources(uuid,uuid) from public, anon;
grant execute on function public.trace_lot_sources(uuid,uuid) to authenticated;

-- The forward recall lookup uses the same temporal membership walk.
create function public.trace_batch_lots(p_brewery uuid, p_batch uuid)
returns setof public.lots language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists(select 1 from public.batches where id = p_batch and brewery_id = p_brewery) then
    raise exception using errcode = 'MG404', message = 'batch not found';
  end if;
  return query select l.* from public.lots l
  where l.brewery_id = p_brewery and exists (
    select 1 from private.lot_lineage(p_brewery, l.id) lineage
    join public.vessel_occupancies o on o.id = lineage.occupancy_id and o.brewery_id = p_brewery
    where o.batch_id = p_batch
  ) order by l.packaged_on, l.id;
end $$;
revoke all on function public.trace_batch_lots(uuid,uuid) from public, anon;
grant execute on function public.trace_batch_lots(uuid,uuid) to authenticated;

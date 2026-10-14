-- Historical packaging (docs/plans/historical-packaging.md): a historical batch
-- (record_historical_batch, no tank) gets closed packaging runs and lots with
-- actual quantities but no stock movement, so history never sits on hand. A run
-- names its batch through packaging_runs.batch_id when it has no tank; lot trace
-- reaches that batch the same way. Only before books_opened_on.

alter table public.packaging_runs add column batch_id uuid,
  add foreign key (batch_id, brewery_id) references public.batches (id, brewery_id);
-- A started or closed run draws from a tank, or (history only) names its batch.
alter table public.packaging_runs drop constraint packaging_runs_check,
  add constraint packaging_runs_check check
    ((started_at is null and closed_at is null) or occupancy_id is not null or batch_id is not null);
create index packaging_runs_batch_idx on public.packaging_runs (batch_id) where batch_id is not null;

-- Writes one closed run, its outputs and its lot; never an inventory movement,
-- and bbl_drawn stays null so packaging_run_yields reads no loss.
create function public.record_historical_packaging_run(
  p_brewery uuid, p_batch uuid, p_packaged_on date, p_outputs jsonb, p_lot_code text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_batch public.batches; v_opened date; v_run public.packaging_runs; v_lot public.lots; o jsonb;
begin
  v_actor := private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_historical_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'packaged_on', p_packaged_on, 'outputs', p_outputs, 'lot_code', p_lot_code));
  if v_replay is not null then return v_replay; end if;

  if p_lot_code is null or length(trim(p_lot_code)) = 0 then raise exception 'lot code required'; end if;
  if jsonb_typeof(p_outputs) is distinct from 'array' or jsonb_array_length(p_outputs) = 0 then raise exception 'at least one output is required'; end if;
  select books_opened_on into v_opened from public.breweries where id = p_brewery;
  if v_opened is null then raise exception 'set the books opened date before recording history'; end if;
  if p_packaged_on is null or p_packaged_on >= v_opened then raise exception 'historical packaging must be dated before the books opened (%)', v_opened; end if;
  if exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null
      and period_start <= p_packaged_on and period_end >= p_packaged_on)
    then raise exception 'a filed report already covers this date'; end if;

  perform private.lock_cellar_workflow(p_brewery);
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  -- Historical: closed by record_historical_batch, so it never had a tank.
  if v_batch.closed_at is null or exists (select 1 from public.vessel_occupancies where batch_id = p_batch)
    then raise exception 'only a historical batch takes historical packaging'; end if;
  if p_packaged_on < v_batch.brewed_on then raise exception 'packaging cannot be dated before the batch was brewed'; end if;
  if v_batch.intended_brand_id is null then raise exception 'the batch has no brand to package'; end if;
  if exists (select 1 from public.lots where brewery_id = p_brewery and code = p_lot_code)
    then raise exception 'lot code "%" is already used', p_lot_code; end if;

  for o in select * from jsonb_array_elements(p_outputs) loop
    if not exists (select 1 from public.skus s where s.id = (o->>'sku_id')::uuid and s.brewery_id = p_brewery and s.brand_id = v_batch.intended_brand_id)
      then raise exception 'every output must be a SKU of the batch''s brand'; end if;
    if (o->>'qty')::numeric is null or (o->>'qty')::numeric <= 0 then raise exception 'output quantities must be positive'; end if;
  end loop;

  insert into public.packaging_runs (brewery_id, brand_id, batch_id, planned_on, started_at, closed_at, created_by)
  values (p_brewery, v_batch.intended_brand_id, p_batch, p_packaged_on, p_packaged_on, p_packaged_on, v_actor)
  returning * into v_run;
  insert into public.packaging_run_outputs (brewery_id, run_id, sku_id, qty_planned, qty_actual)
    select p_brewery, v_run.id, (e->>'sku_id')::uuid, sum((e->>'qty')::numeric), sum((e->>'qty')::numeric)
    from jsonb_array_elements(p_outputs) e group by (e->>'sku_id')::uuid;
  insert into public.lots (brewery_id, packaging_run_id, brand_id, code, packaged_on)
  values (p_brewery, v_run.id, v_batch.intended_brand_id, p_lot_code, p_packaged_on)
  returning * into v_lot;
  return private.complete_command_request(p_request_id, jsonb_build_object('run', to_jsonb(v_run), 'lot', to_jsonb(v_lot)));
end $$;
revoke all on function public.record_historical_packaging_run(uuid, uuid, date, jsonb, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_historical_packaging_run(uuid, uuid, date, jsonb, text, uuid) to authenticated;

-- The lot's member batches through its tank lineage, or, for a tankless
-- historical run, the batch the run names. Copied from 20261012100300; only the
-- union branch is new.
create or replace function public.trace_lot_sources(p_brewery uuid, p_lot uuid)
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
    union
    select b.id, b.batch_no, b.brewed_on
    from public.lots l join public.packaging_runs r on r.id = l.packaging_run_id and r.brewery_id = l.brewery_id
    join public.batches b on b.id = r.batch_id and b.brewery_id = p_brewery
    where l.id = p_lot and l.brewery_id = p_brewery and r.occupancy_id is null
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

-- Forward recall: lots whose lineage reaches the batch, or whose tankless
-- historical run names it. Copied from 20261012100300; only the `or` is new.
create or replace function public.trace_batch_lots(p_brewery uuid, p_batch uuid)
returns setof public.lots language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists(select 1 from public.batches where id = p_batch and brewery_id = p_brewery) then
    raise exception using errcode = 'MG404', message = 'batch not found';
  end if;
  return query select l.* from public.lots l
  where l.brewery_id = p_brewery and (exists (
    select 1 from private.lot_lineage(p_brewery, l.id) lineage
    join public.vessel_occupancies o on o.id = lineage.occupancy_id and o.brewery_id = p_brewery
    where o.batch_id = p_batch
  ) or exists (
    select 1 from public.packaging_runs r
    where r.id = l.packaging_run_id and r.brewery_id = p_brewery and r.occupancy_id is null and r.batch_id = p_batch
  )) order by l.packaged_on, l.id;
end $$;

-- #619: plans remain history when cancelled; only unstarted work may change dates.
alter table public.batches add column cancelled_at timestamptz;
alter table public.packaging_runs add column cancelled_at timestamptz;
alter table public.batches add constraint cancelled_batch_is_unstarted check
  (cancelled_at is null or (brewed_on is null and closed_at is null));
alter table public.packaging_runs add constraint cancelled_run_is_unstarted check
  (cancelled_at is null or (started_at is null and closed_at is null and bbl_drawn is null));

-- One lock-and-check per plan kind, so cancel and reschedule share one
-- definition of "unstarted". Takes the cellar lock, then the plan row.
create function private.lock_unstarted_batch(p_brewery uuid, p_batch uuid) returns public.batches
language plpgsql security definer set search_path = '' as $$
declare v_row public.batches;
begin
  perform private.lock_cellar_workflow(p_brewery);
  select * into v_row from public.batches where brewery_id = p_brewery and id = p_batch for update;
  if v_row.id is null then raise exception 'batch not found'; end if;
  if v_row.cancelled_at is not null then raise exception 'batch is cancelled'; end if;
  if v_row.brewed_on is not null or v_row.closed_at is not null
    or exists (select 1 from public.vessel_occupancies where brewery_id = p_brewery and batch_id = p_batch)
    then raise exception 'physical work is already recorded; this plan cannot be cancelled or rescheduled'; end if;
  return v_row;
end $$;
revoke all on function private.lock_unstarted_batch(uuid, uuid) from public, anon, authenticated, service_role;

create function private.lock_unstarted_packaging_run(p_brewery uuid, p_run uuid) returns public.packaging_runs
language plpgsql security definer set search_path = '' as $$
declare v_row public.packaging_runs;
begin
  perform private.lock_cellar_workflow(p_brewery);
  select * into v_row from public.packaging_runs where brewery_id = p_brewery and id = p_run for update;
  if v_row.id is null then raise exception 'packaging run not found'; end if;
  if v_row.cancelled_at is not null then raise exception 'packaging run is cancelled'; end if;
  if v_row.started_at is not null or v_row.closed_at is not null or v_row.bbl_drawn is not null
    or exists (select 1 from public.packaging_run_outputs where brewery_id = p_brewery and run_id = p_run and (qty_actual is not null or movement_id is not null))
    or exists (select 1 from public.packaging_run_consumptions where brewery_id = p_brewery and run_id = p_run)
    or exists (select 1 from public.lots where brewery_id = p_brewery and packaging_run_id = p_run)
    then raise exception 'physical work is already recorded; this plan cannot be cancelled or rescheduled'; end if;
  return v_row;
end $$;
revoke all on function private.lock_unstarted_packaging_run(uuid, uuid) from public, anon, authenticated, service_role;

create function public.cancel_batch(p_brewery uuid, p_batch uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.batches;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'cancel_batch', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_batch(p_brewery, p_batch);
  update public.batches set cancelled_at = now() where id = p_batch returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.cancel_batch(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.cancel_batch(uuid, uuid, uuid) to authenticated;

create function public.reschedule_batch(p_brewery uuid, p_batch uuid, p_planned_on date, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.batches;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'reschedule_batch', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'planned_on', p_planned_on));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_batch(p_brewery, p_batch);
  if p_planned_on is null then raise exception 'planned date is required'; end if;
  update public.batches set planned_on = p_planned_on where id = p_batch returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.reschedule_batch(uuid, uuid, date, uuid) from public, anon, service_role;
grant execute on function public.reschedule_batch(uuid, uuid, date, uuid) to authenticated;

create function public.cancel_packaging_run(p_brewery uuid, p_run uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'cancel_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_packaging_run(p_brewery, p_run);
  update public.packaging_runs set cancelled_at = now() where id = p_run returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.cancel_packaging_run(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.cancel_packaging_run(uuid, uuid, uuid) to authenticated;

create function public.reschedule_packaging_run(p_brewery uuid, p_run uuid, p_planned_on date, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'reschedule_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'planned_on', p_planned_on));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_packaging_run(p_brewery, p_run);
  if p_planned_on is null then raise exception 'planned date is required'; end if;
  update public.packaging_runs set planned_on = p_planned_on where id = p_run returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.reschedule_packaging_run(uuid, uuid, date, uuid) from public, anon, service_role;
grant execute on function public.reschedule_packaging_run(uuid, uuid, date, uuid) to authenticated;

create or replace function public.record_brew_day(
  p_brewery uuid, p_batch uuid, p_vessel uuid, p_initial_bbl numeric, p_brewed_on date, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_batch public.batches; v_vessel public.vessels; v_occ public.vessel_occupancies;
  v_start timestamptz; v_tz text;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_brew_day', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'vessel', p_vessel,
      'initial_bbl', p_initial_bbl, 'brewed_on', p_brewed_on));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_vessel from public.vessels where id = p_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.cancelled_at is not null then raise exception 'batch is cancelled'; end if;
  if v_batch.brewed_on is not null then raise exception 'batch % was already brewed on %', v_batch.batch_no, v_batch.brewed_on; end if;

  -- Local midnight of brewed_on, pushed past any occupancy of this vessel that
  -- closed during that same local day (emptied this morning, brewed into this
  -- afternoon).
  select timezone into v_tz from public.breweries where id = p_brewery;
  select greatest(p_brewed_on::timestamp at time zone v_tz, max(o.ended_at)) into v_start
  from public.vessel_occupancies o
  where o.vessel_id = p_vessel
    and o.ended_at >= p_brewed_on::timestamp at time zone v_tz
    and o.ended_at < (p_brewed_on + 1)::timestamp at time zone v_tz;

  -- Exactly the predicate the gist exclusion enforces, so a backdated brew day
  -- that lands inside a *closed* occupancy still gets this readable error
  -- rather than the raw constraint name. `ended_at is null` alone would miss it.
  if exists (
    select 1 from public.vessel_occupancies o
    where o.vessel_id = p_vessel
      and tstzrange(o.started_at, o.ended_at) && tstzrange(v_start, null)
  ) then raise exception 'vessel % is occupied on %; empty it first', v_vessel.name, p_brewed_on; end if;

  update public.batches set brewed_on = p_brewed_on where id = p_batch returning * into v_batch;
  -- #488: the vessel is empty (checked above), so the knockout is its whole content.
  perform private.assert_vessel_fits(v_vessel, p_initial_bbl);
  insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
  values (p_brewery, p_vessel, p_batch, v_start, p_initial_bbl) returning * into v_occ;
  return private.complete_command_request(p_request_id,
    jsonb_build_object('batch', to_jsonb(v_batch), 'occupancy', to_jsonb(v_occ)));
end $$;

create or replace function public.update_packaging_run(
  p_brewery uuid, p_run uuid, p_occupancy uuid, p_outputs jsonb, p_started_at timestamptz, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_run public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'occupancy', p_occupancy,
      'outputs', p_outputs, 'started_at', p_started_at));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.cancelled_at is not null then raise exception 'packaging run is cancelled'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;

  if p_occupancy is not null then
    perform private.assert_open_occupancy(p_brewery, p_occupancy);
    -- The brand trigger fires on this update and has the last word.
    update public.packaging_runs set occupancy_id = p_occupancy where id = p_run returning * into v_run;
  end if;

  -- Translate the check constraint into the sentence a brewer would say. The
  -- constraint still stands behind this for anything that writes directly.
  if p_started_at is not null then
    if v_run.occupancy_id is null then
      raise exception 'pick the tank this run draws from before starting it';
    end if;
    -- Re-check the tank that is actually attached (v_run was re-read above if
    -- one was passed in now): a run may have picked its occupancy days ago and
    -- that occupancy may have been emptied since. Nothing else would catch it
    -- -- the trigger only fires when occupancy_id itself is written, and the
    -- check constraint asks only that the column be non-null.
    perform private.assert_open_occupancy(p_brewery, v_run.occupancy_id);
    update public.packaging_runs set started_at = p_started_at where id = p_run returning * into v_run;
  end if;

  if p_outputs is not null then
    perform private.replace_packaging_run_outputs(p_brewery, p_run, v_run.brand_id, p_outputs);
  end if;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

create or replace function private.batch_completion_calculation(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batch public.batches; v_balance jsonb; v_baseline numeric; v_residual numeric;
begin
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.brewed_on is null then raise exception 'batch has not been brewed'; end if;
  if v_batch.closed_at is not null then raise exception 'batch is already completed'; end if;

  if not exists (select 1 from public.vessel_occupancies o where o.brewery_id = p_brewery and o.batch_id = p_batch)
    then raise exception 'batch has no authoritative occupancy'; end if;
  if exists (
    select 1 from public.packaging_runs r join public.vessel_occupancies o on o.id = r.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and r.closed_at is null and r.cancelled_at is null
  ) then raise exception 'a packaging run is still open for this batch'; end if;

  v_balance := private.batch_volume_balance(p_brewery, p_batch);
  v_baseline := (v_balance->>'baselineBbl')::numeric;
  v_residual := (v_balance->>'residualBbl')::numeric;
  if v_baseline < 0 then raise exception 'batch completion baseline must not be negative'; end if;
  if v_residual < 0 then raise exception 'batch has a negative completion residual; packaged and attributed volume exceed its baseline'; end if;
  return v_balance || jsonb_build_object(
    'batchId', p_batch, 'closedAt', null,
    'thresholdBbl', greatest(0.05::numeric, v_baseline * 0.005::numeric), 'adjustmentId', null);
end $$;

create or replace view public.material_requirements with (security_invoker = true) as
  with req as (
    select b.brewery_id, ri.material_id, sum(ri.per_bbl_qty * b.planned_bbl) as required, min(b.planned_on) as needed_by
    from batches b join recipe_ingredients ri on ri.recipe_version_id = b.recipe_version_id
    where b.brewed_on is null and b.cancelled_at is null group by 1,2
    union all
    select r.brewery_id, bom.material_id, sum(case when pm.base_uom = 'each' then ceil(o.qty_planned * bom.qty_per_unit) else o.qty_planned * bom.qty_per_unit end), min(r.planned_on)
    from packaging_runs r join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_bom bom on bom.format_id = s.format_id
    join materials pm on pm.id = bom.material_id
    where r.closed_at is null and r.cancelled_at is null group by 1,2),
  gap as (
    select req.brewery_id, req.material_id, sum(req.required) as required, min(req.needed_by) as needed_by,
           coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
           sum(req.required) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short
    from req
    left join material_on_hand oh on oh.material_id = req.material_id
    left join material_on_order oo on oo.material_id = req.material_id
    group by 1,2, oh.qty, oo.qty)
  select gap.*, m.name as material_name, m.base_uom, m.purchase_uom, m.purchase_uom_factor,
         ceil(greatest(gap.short, 0) / m.purchase_uom_factor) as purchase_units_short,
         coalesce(c.vendor_id, m.default_vendor_id) as vendor_id, v.name as vendor_name, v.lead_time_days,
         gap.needed_by - v.lead_time_days as buy_by,
         coalesce(gap.needed_by - v.lead_time_days < current_date, false) as out_of_reach,
         c.contract_id, c.qty_available as contract_qty_available, c.unit_cost_cents as contract_unit_cost_cents
  from gap join materials m on m.id = gap.material_id
  left join lateral (
    select cb.contract_id, cb.vendor_id, cb.qty_available, mc.unit_cost_cents
    from contract_balances cb join material_contracts mc on mc.id = cb.contract_id
    where cb.material_id = gap.material_id and cb.qty_available > 0
      and (mc.starts_on is null or mc.starts_on <= current_date) and (mc.ends_on is null or mc.ends_on >= current_date)
    order by mc.ends_on nulls last limit 1) c on true
  left join vendors v on v.id = coalesce(c.vendor_id, m.default_vendor_id);

create or replace view public.packaging_run_requirements with (security_invoker = true) as
  select run_id, brewery_id, material_id, required, on_hand, on_order,
         required - on_hand - on_order as short
  from (
    select r.id as run_id, r.brewery_id, bom.material_id,
           sum(case when pm.base_uom = 'each' then ceil(o.qty_planned * bom.qty_per_unit) else o.qty_planned * bom.qty_per_unit end) as required,
           coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order
    from packaging_runs r
    join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_bom bom on bom.format_id = s.format_id
    join materials pm on pm.id = bom.material_id
    left join material_on_hand oh on oh.material_id = bom.material_id
    left join material_on_order oo on oo.material_id = bom.material_id
    where r.closed_at is null and r.cancelled_at is null
    group by r.id, bom.material_id, oh.qty, oo.qty
  ) req;

-- The old 30-day window approximated cancellation. Active plans now remain demand until cancelled.
create or replace view public.product_volume_requirements with (security_invoker = true) as
  with demand as (
    select r.brewery_id, r.brand_id, sum(o.qty_planned * f.bbl_per_unit) as bbl
    from packaging_runs r
    join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_volumes f on f.id = s.format_id
    where r.closed_at is null and r.cancelled_at is null
    group by 1, 2
  ),
  supply as (
    select brewery_id, brand_id, sum(bbl) as bbl from (
      select b.brewery_id, b.intended_brand_id as brand_id, b.planned_bbl as bbl
      from batches b where b.brewed_on is null and b.cancelled_at is null and b.intended_brand_id is not null
      union all
      select ov.brewery_id, b.intended_brand_id, ov.bbl
      from occupancy_volumes ov join batches b on b.id = ov.batch_id
      where ov.ended_at is null and b.intended_brand_id is not null
    ) parts group by 1, 2
  )
  select br.brewery_id, br.id as brand_id, br.name as brand_name,
         coalesce(d.bbl, 0) as demand_bbl,
         coalesce(p.bbl, 0) as supply_bbl,
         greatest(coalesce(d.bbl, 0) - coalesce(p.bbl, 0), 0) as brew_bbl
  from brands br
  left join demand d on d.brand_id = br.id and d.brewery_id = br.brewery_id
  left join supply p on p.brand_id = br.id and p.brewery_id = br.brewery_id;

create or replace function public.portal_schedule_rows()
returns table (brewery_id uuid, brand_id uuid, brand_name text, planned_week date, listed boolean)
language sql stable security definer set search_path = '' as $$
  select distinct b.brewery_id, b.intended_brand_id, br.name, date_trunc('week', b.planned_on)::date,
         exists (select 1 from public.sku_prices p
                 where p.brewery_id = b.brewery_id and p.brand_name = br.name and p.active
                   and p.sale_channel_id = c.sale_channel_id)
  from public.customers c
  join public.batches b on b.brewery_id = c.brewery_id and b.brewed_on is null and b.cancelled_at is null
    and b.planned_on >= date_trunc('week', current_date)::date
  join public.brands br on br.id = b.intended_brand_id and br.brewery_id = b.brewery_id
  where c.id in (select public.my_customer_ids());
$$;

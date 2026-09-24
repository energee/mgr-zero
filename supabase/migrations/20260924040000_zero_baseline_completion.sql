-- #431: a batch whose whole volume was transferred losslessly into another
-- batch's tank has baseline = initial + in − out + physical = 0. That batch has
-- nothing left to account for (nothing packaged, nothing attributed, zero
-- residual), so completion must close it without an adjustment instead of
-- refusing. Only a negative baseline — more moved out than ever existed — is
-- still an error. Otherwise identical to the 00001_baseline definition.
create or replace function private.batch_completion_calculation(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batch public.batches; v_scope_count bigint; v_initial numeric; v_in numeric; v_out numeric;
  v_physical numeric; v_packaged numeric; v_transfer_loss numeric; v_removals numeric;
  v_baseline numeric; v_attributed numeric; v_residual numeric; v_threshold numeric;
begin
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.brewed_on is null then raise exception 'batch has not been brewed'; end if;
  if v_batch.closed_at is not null then raise exception 'batch is already completed'; end if;

  select count(*), coalesce(sum(o.initial_bbl), 0) into v_scope_count, v_initial
    from public.vessel_occupancies o where o.brewery_id = p_brewery and o.batch_id = p_batch;
  if v_scope_count = 0 then raise exception 'batch has no authoritative occupancy'; end if;
  if exists (
    select 1 from public.packaging_runs r join public.vessel_occupancies o on o.id = r.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and r.closed_at is null
  ) then raise exception 'a packaging run is still open for this batch'; end if;

  select coalesce(sum(t.bbl), 0) into v_in
    from public.transfers t
    join public.vessel_occupancies destination on destination.id = t.to_occupancy_id
    join public.vessel_occupancies source on source.id = t.from_occupancy_id
    where destination.brewery_id = p_brewery and destination.batch_id = p_batch and source.batch_id <> p_batch;
  select coalesce(sum(t.bbl), 0) into v_out
    from public.transfers t
    join public.vessel_occupancies source on source.id = t.from_occupancy_id
    join public.vessel_occupancies destination on destination.id = t.to_occupancy_id
    where source.brewery_id = p_brewery and source.batch_id = p_batch and destination.batch_id <> p_batch;
  select coalesce(sum(a.bbl), 0) into v_physical
    from public.volume_adjustments a join public.vessel_occupancies o on o.id = a.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and a.affects_occupancy
      and a.removal_class is null and a.reason in ('gain','measurement');
  select coalesce(sum(m.bbl), 0) into v_packaged
    from public.packaging_runs r
    join public.vessel_occupancies o on o.id = r.occupancy_id
    join public.packaging_run_outputs output on output.run_id = r.id
    join public.inventory_movements m on m.id = output.movement_id and m.brewery_id = r.brewery_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and r.closed_at is not null
      and m.type = 'production_in' and m.bbl > 0;
  select coalesce(sum(t.loss_bbl), 0) into v_transfer_loss
    from public.transfers t join public.vessel_occupancies o on o.id = t.from_occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch;
  select coalesce(sum(a.bbl), 0) into v_removals
    from public.volume_adjustments a join public.vessel_occupancies o on o.id = a.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and a.removal_class is not null;

  v_baseline := v_initial + v_in - v_out + v_physical;
  if v_baseline < 0 then raise exception 'batch completion baseline must not be negative'; end if;
  v_attributed := v_transfer_loss - v_removals;
  v_residual := v_baseline - v_packaged - v_attributed;
  if v_residual < 0 then raise exception 'batch has a negative completion residual; packaged and attributed volume exceed its baseline'; end if;
  v_threshold := greatest(0.05::numeric, v_baseline * 0.005::numeric);
  return jsonb_build_object(
    'batchId', p_batch, 'closedAt', null, 'baselineBbl', v_baseline, 'packagedBbl', v_packaged,
    'attributedBbl', v_attributed, 'residualBbl', v_residual, 'thresholdBbl', v_threshold,
    'adjustmentId', null);
end $$;

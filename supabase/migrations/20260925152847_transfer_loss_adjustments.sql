-- Cellar transfer loss is a volume_adjustments row (#485, follow-up to #428).
-- Before this, record_cellar_transfer kept it only in transfers.loss_bbl, so it
-- was a second source of cellar removals: batch completion special-cased it,
-- the TTB report read transfers separately (#483), and it could never be
-- reattributed to sample, taproom or destruction. Now:
--   * record_cellar_transfer writes the loss as a generic cellar loss
--     (reason and removal_class 'loss', affects_occupancy) on the source
--     occupancy, and transfers.loss_bbl is dropped;
--   * existing transfers.loss_bbl history is backfilled into
--     volume_adjustments, dated at the transfer;
--   * batch completion and the report read only volume_adjustments, so a
--     transfer loss is counted once;
--   * reattribution (reattribute_loss, get_loss_review, the reclassification
--     graph) accepts any generic loss root, not only a batch's completion
--     loss, so a batch can have more than one reattributable loss.
-- Each function body is copied verbatim from its newest definition and changes
-- only the transfer-loss lines: batch_volume_balance from 20260925113742
-- (#499), record_cellar_transfer from 20260924070000 (#488, #466),
-- generate_compliance_report from 20260925093851 (#533), the rest from
-- 00001_baseline.

insert into public.volume_adjustments (brewery_id, occupancy_id, bbl, reason, removal_class, at, note, created_by, created_at)
select t.brewery_id, t.from_occupancy_id, -t.loss_bbl, 'loss', 'loss', t.at, 'cellar transfer loss', t.created_by, t.at
  from public.transfers t where t.loss_bbl > 0;
-- The loss now reaches the source occupancy through its adjustment row, so the
-- view stops reading transfers.loss_bbl and the column goes: a caller still
-- reading or writing it fails loudly instead of seeing 0.
create or replace view public.occupancy_volumes with (security_invoker = true) as
  select o.id as occupancy_id, o.brewery_id, o.vessel_id, o.batch_id, o.started_at, o.ended_at,
         o.initial_bbl
           + coalesce((select sum(bbl) from public.transfers t where t.to_occupancy_id = o.id), 0)
           - coalesce((select sum(bbl) from public.transfers t where t.from_occupancy_id = o.id), 0)
           + coalesce((select sum(bbl) from public.volume_adjustments a where a.occupancy_id = o.id and a.affects_occupancy), 0)
           - coalesce((select sum(bbl_drawn) from public.packaging_runs r where r.occupancy_id = o.id and r.closed_at is not null), 0)
           as bbl
  from public.vessel_occupancies o;
alter table public.transfers drop column loss_bbl;

-- A reclassification source is any generic loss root; completion roots keep
-- their batch checks in the adjustment loop. Allocations never exceed the root.
create or replace function private.enforce_completion_adjustment_graph() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_adjustment uuid; v_adjustments uuid[] := array[]::uuid[]; v_batch uuid;
  v_reclassification uuid; v_reclassifications uuid[] := array[]::uuid[];
  a public.volume_adjustments; source public.volume_adjustments; reverse_leg public.volume_adjustments; replacement public.volume_adjustments;
  b public.batches; r public.volume_adjustment_reclassifications; n int;
begin
  if tg_table_name = 'volume_adjustments' then
    v_adjustments := array[old.id, new.id];
    v_reclassifications := array[old.reclassification_id, new.reclassification_id];
  elsif tg_table_name = 'batches' then
    v_adjustments := array[
      nullif(to_jsonb(old)->>'completion_adjustment_id', '')::uuid,
      nullif(to_jsonb(new)->>'completion_adjustment_id', '')::uuid
    ];
  elsif tg_table_name = 'vessel_occupancies' then
    select coalesce(array_agg(distinct adjustment.id), array[]::uuid[]) into v_adjustments
      from public.volume_adjustments adjustment where adjustment.occupancy_id in (old.id, new.id);
  elsif tg_table_name = 'volume_adjustment_reclassifications' then
    v_adjustments := array[old.source_adjustment_id, new.source_adjustment_id];
    v_reclassifications := array[old.id, new.id];
  end if;

  foreach v_adjustment in array v_adjustments loop
    if v_adjustment is null then continue; end if;
    select * into a from public.volume_adjustments where id = v_adjustment;
    select count(*) into n from public.batches where completion_adjustment_id = v_adjustment;
    if a.id is null then
      if n <> 0 then raise exception 'invalid batch completion adjustment graph'; end if;
    elsif not a.affects_occupancy or n <> 0 or a.reclassification_id is not null then
      if a.reclassification_id is null then
        if n <> 1 then raise exception 'invalid batch completion adjustment graph'; end if;
        select * into b from public.batches where completion_adjustment_id = v_adjustment;
        if b.id is null or b.closed_at is null or b.brewery_id <> a.brewery_id
          or a.bbl >= 0 or a.reason <> 'loss' or a.removal_class <> 'loss'
          or a.tax_treatment is not null or a.dest_state is not null or a.affects_occupancy
          or not exists (select 1 from public.vessel_occupancies o
            where o.id = a.occupancy_id and o.brewery_id = b.brewery_id and o.batch_id = b.id)
          or coalesce((select sum(x.bbl) from public.volume_adjustment_reclassifications x where x.source_adjustment_id = a.id), 0) > -a.bbl
        then raise exception 'invalid batch completion adjustment graph'; end if;
        select coalesce(array_agg(x.id), array[]::uuid[]) into v_reclassifications
          from (select unnest(v_reclassifications) id union select id from public.volume_adjustment_reclassifications where source_adjustment_id = a.id) x;
      elsif n <> 0 then
        raise exception 'invalid batch completion adjustment graph';
      end if;
    end if;
  end loop;

  foreach v_reclassification in array v_reclassifications loop
    if v_reclassification is null then continue; end if;
    select * into r from public.volume_adjustment_reclassifications where id = v_reclassification;
    select count(*) into n from public.volume_adjustments where reclassification_id = v_reclassification;
    if r.id is null then
      if n <> 0 then raise exception 'invalid loss reclassification graph'; end if;
      continue;
    end if;
    select * into source from public.volume_adjustments where id = r.source_adjustment_id and brewery_id = r.brewery_id;
    select * into reverse_leg from public.volume_adjustments where reclassification_id = r.id and reclassification_leg = 'reverse';
    select * into replacement from public.volume_adjustments where reclassification_id = r.id and reclassification_leg = 'replacement';
    if n <> 2 or source.id is null or reverse_leg.id is null or replacement.id is null
      or source.reclassification_id is not null or source.bbl >= 0
      or source.reason <> 'loss' or source.removal_class <> 'loss' or source.tax_treatment is not null or source.dest_state is not null
      or coalesce((select sum(x.bbl) from public.volume_adjustment_reclassifications x where x.source_adjustment_id = source.id), 0) > -source.bbl
      or reverse_leg.brewery_id <> r.brewery_id or replacement.brewery_id <> r.brewery_id
      or reverse_leg.occupancy_id <> source.occupancy_id or replacement.occupancy_id <> source.occupancy_id
      or reverse_leg.affects_occupancy or replacement.affects_occupancy
      or reverse_leg.bbl <> r.bbl or replacement.bbl <> -r.bbl
      or reverse_leg.reason <> 'loss' or reverse_leg.removal_class is distinct from 'loss'
      or reverse_leg.tax_treatment is not null or reverse_leg.dest_state is not null
      or replacement.reason <> 'loss' or replacement.removal_class <> r.target_class
      or replacement.tax_treatment is distinct from r.tax_treatment or replacement.dest_state is distinct from r.dest_state
    then raise exception 'invalid loss reclassification graph'; end if;
  end loop;

  if tg_table_name = 'batches' then
    foreach v_batch in array array[old.id, new.id] loop
      if v_batch is null then continue; end if;
      select * into b from public.batches where id = v_batch;
      if b.id is not null and b.completion_adjustment_id is not null then
        select * into a from public.volume_adjustments where id = b.completion_adjustment_id;
        if a.id is null or b.closed_at is null or a.brewery_id <> b.brewery_id
          or a.bbl >= 0 or a.reason <> 'loss' or a.removal_class <> 'loss'
          or a.tax_treatment is not null or a.dest_state is not null or a.affects_occupancy
          or not exists (select 1 from public.vessel_occupancies o
            where o.id = a.occupancy_id and o.brewery_id = b.brewery_id and o.batch_id = b.id)
        then raise exception 'invalid batch completion adjustment graph'; end if;
      end if;
    end loop;
  end if;
  return null;
end $$;

-- Any generic loss root is reattributable: a batch's completion loss or a
-- cellar transfer loss.
create or replace function public.reattribute_loss(
  p_brewery uuid, p_adjustment uuid, p_bbl numeric, p_classification public.cellar_removal_class,
  p_destination_state text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_root public.volume_adjustments; v_row public.volume_adjustment_reclassifications;
  v_tax public.tax_treatment; v_remaining numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'reattribute_loss', p_request_id,
    jsonb_build_object('adjustment', p_adjustment, 'bbl', p_bbl, 'classification', p_classification, 'destination_state', p_destination_state));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);
  select adjustment.* into v_root from public.volume_adjustments adjustment
    where adjustment.id = p_adjustment and adjustment.brewery_id = p_brewery
      and adjustment.bbl < 0 and adjustment.reason = 'loss' and adjustment.removal_class = 'loss'
      and adjustment.tax_treatment is null and adjustment.dest_state is null
      and adjustment.reclassification_id is null
    for update of adjustment;
  if v_root.id is null then raise exception 'loss not found'; end if;
  perform 1 from public.volume_adjustment_reclassifications
    where brewery_id = p_brewery and source_adjustment_id = v_root.id order by id for update;

  if p_bbl is null or p_bbl in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_bbl <= 0 or p_bbl <> round(p_bbl, 8) then
    raise exception 'BBL must be positive, finite, and have at most eight fractional digits';
  end if;
  if p_classification is null or p_classification not in ('sample','taproom','destruction') then
    raise exception 'classification must be sample, taproom, or destruction';
  end if;
  if p_classification = 'sample' then
    if p_destination_state is null or p_destination_state !~ '^[A-Z]{2}$' then
      raise exception 'sample destination state must be two uppercase letters';
    end if;
  elsif p_destination_state is not null then
    raise exception 'destination state is only valid for samples';
  end if;
  if p_classification = 'taproom' then
    select tax_treatment into v_tax from public.sale_channels
      where brewery_id = p_brewery and system_code = 'taproom';
    if v_tax is null then raise exception 'Taproom sale channel is required'; end if;
  end if;
  select -v_root.bbl - coalesce(sum(bbl), 0) into v_remaining
    from public.volume_adjustment_reclassifications
    where brewery_id = p_brewery and source_adjustment_id = v_root.id;
  if p_bbl > v_remaining then raise exception 'allocation exceeds the remaining loss'; end if;

  insert into public.volume_adjustment_reclassifications(
    brewery_id, source_adjustment_id, bbl, target_class, tax_treatment, dest_state, created_by
  ) values (p_brewery, v_root.id, p_bbl, p_classification, v_tax, p_destination_state, v_actor)
  returning * into v_row;
  insert into public.volume_adjustments(
    brewery_id, occupancy_id, bbl, reason, removal_class, affects_occupancy,
    reclassification_id, reclassification_leg, created_by
  ) values (
    p_brewery, v_root.occupancy_id, p_bbl, 'loss', 'loss', false, v_row.id, 'reverse', v_actor
  );
  insert into public.volume_adjustments(
    brewery_id, occupancy_id, bbl, reason, removal_class, tax_treatment, dest_state, affects_occupancy,
    reclassification_id, reclassification_leg, created_by
  ) values (
    p_brewery, v_root.occupancy_id, -p_bbl, 'loss', p_classification, v_tax, p_destination_state, false,
    v_row.id, 'replacement', v_actor
  );
  return private.complete_command_request(p_request_id, jsonb_build_object(
    'id', v_row.id, 'adjustment_id', v_root.id, 'bbl', v_row.bbl::text,
    'classification', v_row.target_class, 'destination_state', v_row.dest_state,
    'tax_treatment', v_row.tax_treatment, 'created_at', v_row.created_at));
end $$;

-- Every generic loss root posted in the period. kind says which: the batch's
-- completion loss, or a cellar transfer loss (the only other writer).
create or replace function public.get_loss_review(p_brewery uuid, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales']::public.staff_role[]);
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'adjustment_id', root.id,
    'batch_id', batch.id,
    'batch_no', batch.batch_no,
    'closed_at', batch.closed_at,
    'kind', case when batch.completion_adjustment_id = root.id then 'completion' else 'transfer' end,
    'original_bbl', (-root.bbl)::text,
    'remaining_bbl', (-root.bbl - coalesce(allocated.bbl, 0))::text,
    'allocations', coalesce(allocated.rows, '[]'::jsonb)
  ) order by root.created_at, root.id), '[]'::jsonb) into v_result
  from public.volume_adjustments root
  join public.vessel_occupancies occupancy on occupancy.id = root.occupancy_id and occupancy.brewery_id = root.brewery_id
  join public.batches batch on batch.id = occupancy.batch_id and batch.brewery_id = root.brewery_id
  join public.breweries brewery on brewery.id = root.brewery_id
  left join lateral (
    select sum(r.bbl) bbl, jsonb_agg(jsonb_build_object(
      'id', r.id, 'bbl', r.bbl::text, 'classification', r.target_class,
      'destination_state', r.dest_state, 'tax_treatment', r.tax_treatment,
      'created_at', r.created_at, 'created_by', r.created_by
    ) order by r.created_at, r.id) rows
    from public.volume_adjustment_reclassifications r
    where r.brewery_id = root.brewery_id and r.source_adjustment_id = root.id
  ) allocated on true
  where root.brewery_id = p_brewery
    and root.bbl < 0 and root.reason = 'loss' and root.removal_class = 'loss' and root.reclassification_id is null
    and (root.created_at at time zone brewery.timezone)::date between p_start and p_end;
  return v_result;
end $$;

-- Transfer loss is now a removal row, so it is in v_removals already.
-- batch_completion_calculation reads the balance from here (#499), so it is
-- not redefined.
create or replace function private.batch_volume_balance(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_initial numeric; v_in numeric; v_out numeric;
  v_physical numeric; v_packaged numeric; v_removals numeric;
  v_baseline numeric; v_attributed numeric;
begin
  select coalesce(sum(o.initial_bbl), 0) into v_initial
    from public.vessel_occupancies o where o.brewery_id = p_brewery and o.batch_id = p_batch;
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
  select coalesce(sum(a.bbl), 0) into v_removals
    from public.volume_adjustments a join public.vessel_occupancies o on o.id = a.occupancy_id
    where o.brewery_id = p_brewery and o.batch_id = p_batch and a.removal_class is not null;

  v_baseline := v_initial + v_in - v_out + v_physical;
  v_attributed := -v_removals;
  return jsonb_build_object(
    'baselineBbl', v_baseline, 'packagedBbl', v_packaged, 'attributedBbl', v_attributed,
    'residualBbl', v_baseline - v_packaged - v_attributed);
end $$;

-- The transfer writes its loss as a cellar loss on the source occupancy.
create or replace function public.record_cellar_transfer(
  p_brewery uuid, p_from_occupancy uuid, p_to_vessel uuid, p_volume_bbl numeric, p_loss_bbl numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_vessel public.vessels;
  v_from public.vessel_occupancies; v_to public.vessel_occupancies; v_row public.transfers;
  v_available numeric; v_now timestamptz := now();
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_cellar_transfer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'from_occupancy', p_from_occupancy, 'to_vessel', p_to_vessel,
      'volume_bbl', p_volume_bbl, 'loss_bbl', p_loss_bbl));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_vessel from public.vessels where id = p_to_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_from from public.vessel_occupancies
    where id = p_from_occupancy and brewery_id = p_brewery for update;
  if v_from.id is null then raise exception 'occupancy not found'; end if;
  if v_from.ended_at is not null then raise exception 'occupancy is closed'; end if;
  if v_from.vessel_id = p_to_vessel then raise exception 'a vessel cannot be transferred into itself'; end if;

  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if p_volume_bbl + coalesce(p_loss_bbl, 0) > v_available + c_epsilon then
    raise exception 'only % bbl in that vessel; asked for %', v_available, p_volume_bbl + coalesce(p_loss_bbl, 0);
  end if;

  select * into v_to from public.vessel_occupancies
    where vessel_id = p_to_vessel and brewery_id = p_brewery and ended_at is null for update;
  -- #488: what the target already holds (nothing when empty) plus this volume
  -- must fit it. Checked before an empty target's occupancy is opened.
  perform private.assert_vessel_fits(v_vessel, p_volume_bbl + coalesce(
    (select bbl from public.occupancy_volumes where occupancy_id = v_to.id), 0));
  if v_to.id is null then
    insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
    values (p_brewery, p_to_vessel, v_from.batch_id, v_now, 0) returning * into v_to;
  end if;

  insert into public.transfers (brewery_id, from_occupancy_id, to_occupancy_id, bbl, at, created_by)
  values (p_brewery, v_from.id, v_to.id, p_volume_bbl, v_now, v_actor) returning * into v_row;
  -- The loss is a generic cellar loss on the source, the one ledger the report
  -- and batch completion read, and reattributable from the loss review (#485).
  -- round(3): the precision transfers.loss_bbl stored.
  if round(coalesce(p_loss_bbl, 0), 3) > 0 then
    insert into public.volume_adjustments (brewery_id, occupancy_id, bbl, reason, removal_class, at, note, created_by)
    values (p_brewery, v_from.id, -round(p_loss_bbl, 3), 'loss', 'loss', v_now, 'cellar transfer loss', v_actor);
  end if;

  -- Re-read the view: it now includes the row just written.
  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if v_available <= c_epsilon then
    -- #466: ending the occupancy under a started, unclosed packaging run
    -- strands it -- close_packaging_run refuses an emptied tank and a started
    -- run cannot be cancelled. Refuse the emptying transfer instead (the raise
    -- rolls back the transfer row written above); a partial transfer is fine.
    if exists (
      select 1 from public.packaging_runs r
      where r.brewery_id = p_brewery and r.occupancy_id = v_from.id
        and r.started_at is not null and r.closed_at is null
    ) then
      raise exception 'a started packaging run still draws from this tank; close the run before transferring the heel out';
    end if;
    -- greatest(): a brew day may be dated ahead of today, so the occupancy can
    -- start in the future. tstzrange would reject an ended_at below its start;
    -- an empty range there simply frees the vessel.
    update public.vessel_occupancies set ended_at = greatest(v_from.started_at, v_now)
    where id = v_from.id returning * into v_from;
  end if;

  return private.complete_command_request(p_request_id, jsonb_build_object(
    'transfer', to_jsonb(v_row), 'from_occupancy', to_jsonb(v_from), 'to_occupancy', to_jsonb(v_to)));
end $$;

-- One source for cellar removals again: #483's separate transfers read is gone,
-- the backfilled and new transfer losses are volume_adjustments rows.
create or replace function private.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_cellar_removals jsonb; v_by_state jsonb;
  v_packaged numeric; v_in_process numeric; v_external text[] := '{}';
begin
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  -- one pass over the ledger; every figure is an aggregate of the same rows
  with r as materialized (select * from private.report_movements(p_brewery, p_end)),
  per_class as (
    select c.class,
      coalesce(sum(bbl) filter (where d < p_start), 0) as b,
      coalesce(sum(bbl) filter (where d >= p_start and side = 'in'), 0) as i,
      coalesce(-sum(bbl) filter (where d >= p_start and side = 'out'), 0) as o,
      coalesce(sum(bbl), 0) as e
    from unnest(enum_range(null::public.package_type)) as c(class) left join r on r.class = c.class group by c.class),
  removal_totals as (
    select k, sum(v) v from (
      select case when type in ('sale_removal', 'depletion') then tax_treatment::text else type::text end as k, -sum(bbl) as v
        from r where d >= p_start and side = 'out' and type <> 'adjustment' group by 1
      union all
      select case when a.removal_class = 'taproom' then a.tax_treatment::text else a.removal_class::text end, -sum(a.bbl)
        from public.volume_adjustments a join public.breweries brewery on brewery.id = a.brewery_id
        where a.brewery_id = p_brewery and a.removal_class is not null
          and (a.created_at at time zone brewery.timezone)::date between p_start and p_end
        group by 1
    ) removals where k is not null group by k having sum(v) <> 0),
  -- The lines must add up to: Out as printed, plus the removals that are not
  -- part of Out (cellar removals, transfer loss among them, less ledger adjustments).
  target as (
    select round(sum(round(b + i, 2) - round(b + i - o, 2)), 2) as printed_out,
           round((select coalesce(sum(v), 0) from removal_totals) - sum(o), 2) as not_out
    from per_class),
  -- Largest remainder: every class gets its floor in cents; the cents left over
  -- go one each to the classes with the largest fractions.
  ranked as (
    select k, floor(v * 100) as base, row_number() over (order by v * 100 - floor(v * 100) desc, k) as rn
    from removal_totals),
  leftover as (
    select (select round((printed_out + not_out) * 100) from target) - sum(base) as cents, count(*) as n
    from ranked),
  shares as (
    select floor(cents / n) as each_class, cents - floor(cents / n) * n as extra from leftover where n > 0),
  allocated as (
    select k, round((base + each_class + case when rn <= extra then 1 else 0 end) / 100, 2) as v
    from ranked, shares)
  select
    -- rounded running balance (see header); the identity is checked unrounded below
    (select jsonb_agg(jsonb_build_object('class', class, 'begin', round(b, 2), 'in', round(b + i, 2) - round(b, 2),
      'out', round(b + i, 2) - round(b + i - o, 2), 'end', round(b + i - o, 2)) order by class) from per_class),
    coalesce((select array_agg(class::text || ' does not balance' order by class) from per_class where b + i - o <> e), '{}')
      || coalesce((select array_agg(distinct 'unclassified movement type ' || type::text) from r where d >= p_start and side is null), '{}'),
    (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from allocated where v <> 0),
    (select coalesce(jsonb_object_agg(dest_state, round(v, 2)), '{}'::jsonb) from (
      select dest_state, -sum(bbl) as v from r where d >= p_start and type = 'sale_removal' and tax_treatment = 'taxable' group by 1) t),
    (select coalesce(sum(bbl), 0) from r where d >= p_start and type = 'production_in')
    into v_lines, v_warnings, v_removals, v_by_state, v_packaged;
  select coalesce(jsonb_object_agg(removal_class, bbl), '{}'::jsonb)
    into v_cellar_removals from (
      select removal_class, sum(bbl) bbl from (
        select a.removal_class::text removal_class, -a.bbl bbl
        from public.volume_adjustments a join public.breweries brewery on brewery.id = a.brewery_id
        where a.brewery_id = p_brewery and a.removal_class is not null
          and (a.created_at at time zone brewery.timezone)::date between p_start and p_end
      ) cellar_rows group by removal_class
    ) cellar;
  if coalesce((v_cellar_removals->>'taproom')::numeric, 0) <> 0 then
    v_external := array['taproom'];
  end if;
  select coalesce(sum(bbl), 0) into v_in_process from public.occupancy_volumes where brewery_id = p_brewery and ended_at is null;
  return jsonb_build_object(
    'figures', jsonb_build_object(
      'jurisdiction', p_jurisdiction, 'periodStart', p_start, 'periodEnd', p_end,
      'lines', v_lines, 'removals', v_removals, 'cellarRemovals', v_cellar_removals, 'byState', v_by_state,
      'packaged', round(v_packaged, 2), 'inProcess', round(v_in_process, 2),
      'balances', cardinality(v_warnings) = 0),
    'warnings', to_jsonb(v_warnings) || case when cardinality(v_external) > 0
      then jsonb_build_array('Direct cellar Taproom removals need an approved external filing-line mapping before this period can be filed.')
      else '[]'::jsonb end,
    'externalMappingRequired', to_jsonb(v_external));
end $$;

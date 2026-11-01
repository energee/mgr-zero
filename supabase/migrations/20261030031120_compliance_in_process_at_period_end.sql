-- #1640: reconstruct beer in process at the end of the brewery-local period,
-- not from tanks still open on the day a report is generated or filed.
-- Copied from 20261013100000_file_cellar_taproom_removals.sql; only the
-- in-process calculation and its explicit snapshot date are new.
-- CREATE OR REPLACE preserves the private generator's existing privileges.
create or replace function private.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_cellar_removals jsonb; v_by_state jsonb;
  v_packaged numeric; v_in_process numeric; v_state_transactions jsonb; v_unassigned boolean;
  v_cutoff timestamptz; v_today date; v_as_of date;
begin
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  -- one pass over the ledger; every figure is an aggregate of the same rows
  with r as materialized (select * from private.report_movements(p_brewery, p_end)),
  cellar as materialized (select * from private.report_cellar_removals(p_brewery, p_start, p_end)),
  facts as materialized (select * from private.destination_state_facts(p_brewery, p_start, p_end)),
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
      select case when removal_class = 'taproom' then tax_treatment else removal_class end, -sum(bbl)
        from cellar group by 1
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
    (select coalesce(jsonb_object_agg(cellar_class, bbl), '{}'::jsonb) from (
      select removal_class as cellar_class, -sum(bbl) as bbl from cellar group by 1) c),
    -- gross taxable shipments per state, summed from the same facts as the export
    (select coalesce(jsonb_object_agg(state, round(v, 2)), '{}'::jsonb) from (
      select state, sum(volume_bbl) as v from facts where kind = 'sale_removal' and tax_treatment = 'taxable' group by 1) t),
    (select coalesce(sum(bbl), 0) from r where d >= p_start and type = 'production_in'),
    (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'kind', kind, 'eventDate', event_date,
      'sourceId', source_id, 'originalSourceId', original_source_id, 'volumeBbl', volume_bbl,
      'salesCents', sales_cents, 'sourceStatus', source_status) order by state, event_date, kind, source_id), '[]'::jsonb) from facts),
    exists (select 1 from facts where state = 'Unassigned')
    into v_lines, v_warnings, v_removals, v_cellar_removals, v_by_state, v_packaged, v_state_transactions, v_unassigned;

  select (now() at time zone timezone)::date into v_today
    from public.breweries where id = p_brewery;
  v_as_of := least(p_end, v_today);
  -- Unfinished periods show the balance to date, never a future projection.
  select case when p_end < v_today then (p_end + 1)::timestamp at time zone timezone
    else now() end into v_cutoff from public.breweries where id = p_brewery;
  -- Replay the occupancy ledger, including tanks emptied after this period.
  -- initial_bbl includes every original brew turn, so remove turns dated later.
  -- Corrections remain dated adjustments, not a second knockout contribution.
  -- Packaging draws use the lot's Packaged-on day, even if entered later.
  select coalesce(sum(o.initial_bbl
    - coalesce((select sum(br.initial_bbl) from public.brew_records br
        where br.brewery_id = p_brewery and br.batch_id = o.batch_id
          and br.occupancy_id = o.id and br.corrects_id is null and br.brewed_on > v_as_of), 0)
    + coalesce((select sum(t.bbl) from public.transfers t where t.to_occupancy_id = o.id and t.at < v_cutoff), 0)
    - coalesce((select sum(t.bbl) from public.transfers t where t.from_occupancy_id = o.id and t.at < v_cutoff), 0)
    + coalesce((select sum(a.bbl) from public.volume_adjustments a
        where a.occupancy_id = o.id and a.affects_occupancy and a.at < v_cutoff
          and not exists (select 1 from public.brew_records br
            where br.brewery_id = p_brewery and br.batch_id = o.batch_id
              and br.volume_adjustment_id = a.id and br.brewed_on > v_as_of)), 0)
    - coalesce((select sum(pr.bbl_drawn) from public.packaging_runs pr
        join public.lots l on l.packaging_run_id = pr.id and l.brewery_id = pr.brewery_id
        where pr.occupancy_id = o.id and pr.closed_at is not null and l.packaged_on <= v_as_of), 0)
  ), 0) into v_in_process
  from public.vessel_occupancies o
  where o.brewery_id = p_brewery and o.started_at < v_cutoff
    and (o.ended_at is null or o.ended_at >= v_cutoff);

  return jsonb_build_object(
    'figures', jsonb_build_object(
      'jurisdiction', p_jurisdiction, 'periodStart', p_start, 'periodEnd', p_end,
      'stateTransactions', v_state_transactions,
      'lines', v_lines, 'removals', v_removals, 'cellarRemovals', v_cellar_removals, 'byState', v_by_state,
      'packaged', round(v_packaged, 2), 'inProcess', round(v_in_process, 2),
      'balances', cardinality(v_warnings) = 0)
      || case when p_end < v_today then jsonb_build_object('inProcessAsOf', p_end) else '{}'::jsonb end,
    'warnings', to_jsonb(v_warnings
      || case when v_unassigned then array['Some supporting facts have no recorded destination. Review Unassigned; MGR does not infer a state.'] else '{}' end));
end $$;

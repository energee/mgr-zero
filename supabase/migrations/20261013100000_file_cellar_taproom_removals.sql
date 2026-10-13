-- #816: direct cellar Taproom removals file as taxpaid removals for consumption
-- on premises, under the tax treatment frozen from the Taproom sale channel
-- (the report already counts them on that removals line). The external
-- filing-line mapping gate is dropped: nothing could ever approve it.
-- Copied from: generate_compliance_report 20260928236000_destination_state_facts_on_ledger.sql,
-- file_compliance_report 20261012110000_movement_occurred_on.sql; only the gate is removed.
-- create or replace keeps both functions' existing grants.

create or replace function private.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_cellar_removals jsonb; v_by_state jsonb;
  v_packaged numeric; v_in_process numeric; v_state_transactions jsonb; v_unassigned boolean;
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
  select coalesce(sum(bbl), 0) into v_in_process from public.occupancy_volumes where brewery_id = p_brewery and ended_at is null;
  return jsonb_build_object(
    'figures', jsonb_build_object(
      'jurisdiction', p_jurisdiction, 'periodStart', p_start, 'periodEnd', p_end,
      'stateTransactions', v_state_transactions,
      'lines', v_lines, 'removals', v_removals, 'cellarRemovals', v_cellar_removals, 'byState', v_by_state,
      'packaged', round(v_packaged, 2), 'inProcess', round(v_in_process, 2),
      'balances', cardinality(v_warnings) = 0),
    'warnings', to_jsonb(v_warnings
      || case when v_unassigned then array['Some supporting facts have no recorded destination. Review Unassigned; MGR does not infer a state.'] else '{}' end));
end $$;

create or replace function public.file_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_report jsonb; v_row public.report_filings;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'file_compliance_report', p_request_id,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'start', p_start, 'end', p_end, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_cellar_workflow(p_brewery);
  if p_jurisdiction = 'TTB' and not (
      p_end = (p_start + interval '1 month - 1 day')::date and p_start = date_trunc('month', p_start)::date
      or p_end = (p_start + interval '3 months - 1 day')::date and p_start = date_trunc('quarter', p_start)::date
      or p_end = (p_start + interval '1 year - 1 day')::date and p_start = date_trunc('year', p_start)::date) then
    raise exception 'a TTB filing covers one calendar month, quarter, or year';
  end if;
  v_report := private.generate_compliance_report(p_brewery, p_jurisdiction, p_start, p_end);
  if not (v_report->'figures'->>'balances')::boolean then
    raise exception 'the report does not balance: %', array_to_string(array(select jsonb_array_elements_text(v_report->'warnings')), '; ');
  end if;
  if p_end >= (select (now() at time zone timezone)::date from public.breweries where id = p_brewery) then
    raise exception 'the period has not ended yet; file it once it is over';
  end if;
  begin
    insert into public.report_filings (brewery_id, jurisdiction, period_start, period_end, figures, filed_at, filed_by, note)
      values (p_brewery, p_jurisdiction, p_start, p_end, v_report->'figures', now(), auth.uid(), p_note) returning * into v_row;
  exception when unique_violation or exclusion_violation then
    raise exception 'this period is already filed' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

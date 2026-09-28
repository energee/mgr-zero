-- #626 follow-up: destination-state facts read the same ledger rows as the
-- rest of the report, cellar removals are read once, and taxable shipments by
-- state (byState) come from those facts. Per-state totals are summed from the
-- facts by the caller, so the report no longer returns stateTotals.

-- report_movements gains the row id and the id of the movement it links back
-- to (a return's shipment, a reversal's original, a correction's source).
-- Dates filter on a timestamp range so movements_created_idx applies.
drop function private.report_movements(uuid, date);
create function private.report_movements(p_brewery uuid, p_end date)
returns table (class public.package_type, bbl numeric, type public.movement_type, tax_treatment public.tax_treatment,
  dest_state text, d date, side text, id uuid, original_id uuid)
language sql stable set search_path = '' as $$
  select m.package_type, m.bbl, m.type, m.tax_treatment, m.dest_state, (m.created_at at time zone b.timezone)::date,
    case m.type
      when 'production_in' then 'in' when 'return_in' then 'in' when 'opening_balance' then 'in'
      when 'adjustment' then case when coalesce(original.bbl, m.bbl) > 0 then 'in' else 'out' end
      when 'sale_removal' then 'out' when 'depletion' then 'out' when 'destruction' then 'out'
      when 'loss' then 'out' when 'sample' then 'out' when 'festival_removal' then 'out'
      when 'taproom_transfer' then 'transfer' when 'location_transfer' then 'transfer' when 'repack' then 'transfer'
    end,
    m.id, coalesce(m.source_movement_id, m.compensates_id, m.correction_source_id)
  from public.breweries b
  join public.inventory_movements m on m.brewery_id = b.id
    and m.created_at < ((p_end + 1)::timestamp at time zone b.timezone)
  left join public.inventory_movements original on original.id = m.compensates_id and original.brewery_id = m.brewery_id
  where b.id = p_brewery
$$;
revoke all on function private.report_movements(uuid, date) from public, anon, authenticated;

-- Cellar removals (volume adjustments with a removal class) in the period, in
-- the brewery's local dates. Every report figure that counts them reads here.
create function private.report_cellar_removals(p_brewery uuid, p_start date, p_end date)
returns table (id uuid, removal_class text, tax_treatment text, dest_state text, d date, bbl numeric)
language sql stable set search_path = '' as $$
  select a.id, a.removal_class::text, a.tax_treatment::text, a.dest_state, (a.created_at at time zone b.timezone)::date, a.bbl
  from public.breweries b
  join public.volume_adjustments a on a.brewery_id = b.id
    and a.created_at >= (p_start::timestamp at time zone b.timezone)
    and a.created_at < ((p_end + 1)::timestamp at time zone b.timezone)
  where b.id = p_brewery and a.removal_class is not null
$$;
revoke all on function private.report_cellar_removals(uuid, date, date) from public, anon, authenticated;

-- One supporting fact per movement, cellar removal, or invoice line. Invoice
-- lines take the state their shipment's sale removals share; a line whose
-- removals name more than one state stays Unassigned.
drop function private.destination_state_facts(uuid, date, date);
create function private.destination_state_facts(p_brewery uuid, p_start date, p_end date)
returns table(state text, kind text, event_date date, source_id uuid, original_source_id uuid,
  volume_bbl numeric, sales_cents bigint, source_status text, tax_treatment text)
language sql stable security definer set search_path = '' as $$
  with r as materialized (select * from private.report_movements(p_brewery, p_end)),
  shipped_state as (
    select ref as order_id, sku_id, case when count(distinct dest_state) = 1 then min(dest_state) end as state
    from public.inventory_movements
    where brewery_id = p_brewery and type = 'sale_removal' and ref is not null
    group by ref, sku_id)
  select coalesce(m.dest_state, original.dest_state, 'Unassigned'), m.type::text, m.d, m.id, m.original_id,
    -m.bbl, 0::bigint, 'posted'::text, m.tax_treatment::text
  from r m left join r original on original.id = m.original_id
  where m.d >= p_start
    and (m.dest_state is not null or m.type in ('return_in', 'adjustment') or original.dest_state is not null)
  union all
  select a.dest_state, 'cellar_' || a.removal_class, a.d, a.id, null::uuid, -a.bbl, 0::bigint, 'posted'::text, a.tax_treatment
  from private.report_cellar_removals(p_brewery, p_start, p_end) a
  where a.dest_state is not null
  union all
  select coalesce(destination.state, 'Unassigned'), i.kind::text, i.issued_on,
    line.id, line.credited_invoice_line_id, 0::numeric,
    case when i.qbo_remote_state = 'live' then line.amount_cents::bigint else 0::bigint end,
    i.qbo_remote_state::text, null::text
  from public.invoice_lines line join public.invoices i on i.id = line.invoice_id and i.brewery_id = line.brewery_id
  left join public.invoice_lines original_line on original_line.id = line.credited_invoice_line_id and original_line.brewery_id = line.brewery_id
  left join public.invoices original_invoice on original_invoice.id = original_line.invoice_id and original_invoice.brewery_id = line.brewery_id
  left join public.shipments shipment on shipment.id = coalesce(i.shipment_id, original_invoice.shipment_id) and shipment.brewery_id = i.brewery_id
  left join shipped_state destination on destination.order_id = shipment.order_id and destination.sku_id = line.sku_id
  where i.brewery_id = p_brewery and i.issued_on between p_start and p_end and line.kind = 'sku';
$$;
revoke all on function private.destination_state_facts(uuid,date,date) from public, anon, authenticated;

-- The facts select invoices by brewery and issue date.
create index invoices_brewery_issued_idx on public.invoices (brewery_id, issued_on);

create or replace function private.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_cellar_removals jsonb; v_by_state jsonb;
  v_packaged numeric; v_in_process numeric; v_state_transactions jsonb; v_unassigned boolean; v_external text[] := '{}';
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
  if coalesce((v_cellar_removals->>'taproom')::numeric, 0) <> 0 then
    v_external := array['taproom'];
  end if;
  select coalesce(sum(bbl), 0) into v_in_process from public.occupancy_volumes where brewery_id = p_brewery and ended_at is null;
  return jsonb_build_object(
    'figures', jsonb_build_object(
      'jurisdiction', p_jurisdiction, 'periodStart', p_start, 'periodEnd', p_end,
      'stateTransactions', v_state_transactions,
      'lines', v_lines, 'removals', v_removals, 'cellarRemovals', v_cellar_removals, 'byState', v_by_state,
      'packaged', round(v_packaged, 2), 'inProcess', round(v_in_process, 2),
      'balances', cardinality(v_warnings) = 0),
    'warnings', to_jsonb(v_warnings
      || case when v_unassigned then array['Some supporting facts have no recorded destination. Review Unassigned; MGR does not infer a state.'] else '{}' end
      || case when cardinality(v_external) > 0 then array['Direct cellar Taproom removals need an approved external filing-line mapping before this period can be filed.'] else '{}' end),
    'externalMappingRequired', to_jsonb(v_external));
end $$;

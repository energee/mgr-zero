-- #626: one supporting fact set feeds destination totals and the filed export.
create function private.destination_state_facts(p_brewery uuid, p_start date, p_end date)
returns table(state text, kind text, event_date date, source_id uuid, original_source_id uuid,
  volume_bbl numeric, sales_cents bigint, source_status text)
language sql stable security definer set search_path = '' as $$
  select coalesce(m.dest_state, original.dest_state, 'Unassigned'), m.type::text,
    (m.created_at at time zone b.timezone)::date, m.id, coalesce(m.source_movement_id, m.compensates_id, m.correction_source_id),
    -m.bbl, 0::bigint, 'posted'::text
  from public.inventory_movements m join public.breweries b on b.id = m.brewery_id
  left join public.inventory_movements original on original.id = coalesce(m.source_movement_id, m.compensates_id, m.correction_source_id)
    and original.brewery_id = m.brewery_id
  where m.brewery_id = p_brewery
    and (m.created_at at time zone b.timezone)::date between p_start and p_end
    and (m.dest_state is not null or m.type in ('return_in', 'adjustment') or original.dest_state is not null)
  union all
  select a.dest_state, 'cellar_' || a.removal_class::text, (a.created_at at time zone b.timezone)::date,
    a.id, null::uuid, -a.bbl, 0::bigint, 'posted'::text
  from public.volume_adjustments a join public.breweries b on b.id = a.brewery_id
  where a.brewery_id = p_brewery and a.dest_state is not null and a.removal_class is not null
    and (a.created_at at time zone b.timezone)::date between p_start and p_end
  union all
  select coalesce(destination.state, 'Unassigned'), i.kind::text, i.issued_on,
    line.id, line.credited_invoice_line_id, 0::numeric,
    case when i.qbo_remote_state = 'live' then line.amount_cents::bigint else 0::bigint end,
    i.qbo_remote_state::text
  from public.invoice_lines line join public.invoices i on i.id = line.invoice_id and i.brewery_id = line.brewery_id
  left join public.invoice_lines original_line on original_line.id = line.credited_invoice_line_id and original_line.brewery_id = line.brewery_id
  left join public.invoices original_invoice on original_invoice.id = original_line.invoice_id and original_invoice.brewery_id = line.brewery_id
  left join public.shipments shipment on shipment.id = coalesce(i.shipment_id, original_invoice.shipment_id) and shipment.brewery_id = i.brewery_id
  left join lateral (
    select case when count(distinct movement.dest_state) = 1 then min(movement.dest_state) end as state
    from public.inventory_movements movement
    where movement.brewery_id = i.brewery_id and movement.ref = shipment.order_id
      and movement.sku_id = line.sku_id and movement.type = 'sale_removal'
  ) destination on true
  where i.brewery_id = p_brewery and i.issued_on between p_start and p_end and line.kind = 'sku';
$$;
revoke all on function private.destination_state_facts(uuid,date,date) from public, anon, authenticated;

create or replace function private.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_cellar_removals jsonb; v_by_state jsonb;
  v_packaged numeric; v_in_process numeric; v_state_transactions jsonb; v_state_totals jsonb; v_external text[] := '{}';
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
  with facts as materialized (select * from private.destination_state_facts(p_brewery, p_start, p_end)),
  totals as (
    select state, sum(volume_bbl) volume_bbl,
      coalesce(sum(volume_bbl) filter (where kind not in ('return_in','adjustment')), 0) outward_bbl,
      coalesce(-sum(volume_bbl) filter (where kind = 'return_in'), 0) returned_bbl,
      coalesce(sum(volume_bbl) filter (where kind = 'adjustment'), 0) adjustment_bbl,
      coalesce(sum(sales_cents) filter (where kind = 'invoice'), 0) invoiced_cents,
      coalesce(-sum(sales_cents) filter (where kind = 'credit_memo'), 0) credited_cents,
      sum(sales_cents) sales_cents
    from facts group by state
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'kind', kind, 'eventDate', event_date,
      'sourceId', source_id, 'originalSourceId', original_source_id, 'volumeBbl', volume_bbl,
      'salesCents', sales_cents, 'sourceStatus', source_status) order by state, event_date, kind, source_id), '[]'::jsonb) from facts),
    (select coalesce(jsonb_agg(jsonb_build_object('state', state, 'volumeBbl', volume_bbl,
      'outwardBbl', outward_bbl, 'returnedBbl', returned_bbl, 'adjustmentBbl', adjustment_bbl,
      'invoicedCents', invoiced_cents, 'creditedCents', credited_cents, 'salesCents', sales_cents) order by state), '[]'::jsonb) from totals)
    into v_state_transactions, v_state_totals;
  return jsonb_build_object(
    'figures', jsonb_build_object(
      'jurisdiction', p_jurisdiction, 'periodStart', p_start, 'periodEnd', p_end,
      'stateTransactions', v_state_transactions, 'stateTotals', v_state_totals,
      'lines', v_lines, 'removals', v_removals, 'cellarRemovals', v_cellar_removals, 'byState', v_by_state,
      'packaged', round(v_packaged, 2), 'inProcess', round(v_in_process, 2),
      'balances', cardinality(v_warnings) = 0),
    'warnings', to_jsonb(v_warnings) || case when exists (select 1 from jsonb_array_elements(v_state_totals) t where t->>'state' = 'Unassigned')
      then jsonb_build_array('Some supporting facts have no recorded destination. Review Unassigned; MGR does not infer a state.') else '[]'::jsonb end || case when cardinality(v_external) > 0
      then jsonb_build_array('Direct cellar Taproom removals need an approved external filing-line mapping before this period can be filed.')
      else '[]'::jsonb end,
    'externalMappingRequired', to_jsonb(v_external));
end $$;

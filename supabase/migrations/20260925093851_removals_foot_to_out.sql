-- The removal lines foot to the printed Out (#533). Rounding each removal
-- class on its own (0.005 + 0.005 printed 0.01 + 0.01) could disagree with the
-- Out cells #435 derives from the rounded running balance. Now the printed
-- total is Out as printed plus the rounded part of removals that is not Out
-- (cellar removals, transfer loss, less ledger adjustments), and it is split
-- across removal classes by largest remainder on their unrounded totals.
-- Otherwise identical to 20260924120000 (#435).
create or replace function private.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_cellar_removals jsonb; v_by_state jsonb;
  v_packaged numeric; v_in_process numeric; v_external text[] := '{}'; v_transfer_loss numeric;
begin
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  select coalesce(sum(t.loss_bbl), 0) into v_transfer_loss
    from public.transfers t join public.breweries brewery on brewery.id = t.brewery_id
    where t.brewery_id = p_brewery and (t.at at time zone brewery.timezone)::date between p_start and p_end;
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
      union all
      select 'loss', v_transfer_loss
    ) removals where k is not null group by k having sum(v) <> 0),
  -- cents to print: Out as printed, plus the rounded removals that are not Out
  target as (
    select round(sum(round(b + i, 2) - round(b + i - o, 2)) * 100
      + round((select coalesce(sum(v), 0) from removal_totals) - sum(o), 2) * 100) as cents from per_class),
  -- largest remainder: every class gets its floor, the leftover cents go to the largest fractions
  ranked as (
    select k, floor(v * 100) as base, row_number() over (order by v * 100 - floor(v * 100) desc, k) as rn, count(*) over () as n
    from removal_totals),
  allocated as (
    select k, round((base + floor(units / n) + case when rn <= units - floor(units / n) * n then 1 else 0 end) / 100, 2) as v
    from (select ranked.*, (select cents from target) - sum(base) over () as units from ranked) shares)
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
        union all
        select 'loss', v_transfer_loss where v_transfer_loss <> 0
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

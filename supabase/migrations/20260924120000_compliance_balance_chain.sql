-- Filed months chain (#435): printed cells must foot (begin + in - out = end)
-- and chain (this end = next begin). Round the running balance, never a
-- movement: begin = round(b), end = round(b+i-o), and in/out are differences of
-- the rounded running balance, so each stays within 0.01 of its own total. The
-- balance check stays on unrounded figures. Otherwise identical to
-- 20260923100000 (#428).
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
    from unnest(enum_range(null::public.package_type)) as c(class) left join r on r.class = c.class group by c.class)
  select
    -- rounded running balance (see header); the identity is checked unrounded below
    (select jsonb_agg(jsonb_build_object('class', class, 'begin', round(b, 2), 'in', round(b + i, 2) - round(b, 2),
      'out', round(b + i, 2) - round(b + i - o, 2), 'end', round(b + i - o, 2)) order by class) from per_class),
    coalesce((select array_agg(class::text || ' does not balance' order by class) from per_class where b + i - o <> e), '{}')
      || coalesce((select array_agg(distinct 'unclassified movement type ' || type::text) from r where d >= p_start and side is null), '{}'),
    (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
      select k, sum(v) v from (
        select case when type in ('sale_removal', 'depletion') then tax_treatment::text else type::text end as k, round(-sum(bbl), 2) as v
          from r where d >= p_start and side = 'out' and type <> 'adjustment' group by 1
        union all
        select case when a.removal_class = 'taproom' then a.tax_treatment::text else a.removal_class::text end, -sum(a.bbl)
          from public.volume_adjustments a join public.breweries brewery on brewery.id = a.brewery_id
          where a.brewery_id = p_brewery and a.removal_class is not null
            and (a.created_at at time zone brewery.timezone)::date between p_start and p_end
          group by 1
        union all
        select 'loss', v_transfer_loss
      ) removals where k is not null group by k having sum(v) <> 0) t),
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

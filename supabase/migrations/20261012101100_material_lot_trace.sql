-- Material-lot recall shares effective consumption and the existing temporal blend lineage.
-- Compensation reverses an exact original; losses never entered the finished beer.
create function private.material_trace_consumptions(p_brewery uuid)
returns table (id uuid, material_id uuid, lot_id uuid, qty numeric, at timestamptz,
  batch_id uuid, occupancy_id uuid, run_id uuid, stage text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.material_id, m.lot_id, -m.qty, coalesce(a.at, m.created_at),
    a.batch_id, a.occupancy_id, c.run_id, coalesce(a.stage::text, 'Packaging')
  from public.material_movements m
  left join public.batch_additions a on a.movement_id = m.id and a.brewery_id = m.brewery_id
  left join public.packaging_run_consumptions c on c.movement_id = m.id and c.brewery_id = m.brewery_id
  where m.brewery_id = p_brewery and m.type = 'consumption'
    and not exists (select 1 from public.material_movements reversal
      where reversal.brewery_id = m.brewery_id and reversal.compensates_id = m.id);
$$;
revoke all on function private.material_trace_consumptions(uuid) from public, anon, authenticated;

-- An upstream ingredient must precede its outgoing transfer, not merely packaging.
create function private.lot_ingredients(p_brewery uuid, p_lot uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with run as (
    select r.id, r.closed_at from public.lots l
    join public.packaging_runs r on r.id = l.packaging_run_id and r.brewery_id = l.brewery_id
    where l.brewery_id = p_brewery and l.id = p_lot
  ), member_cutoffs as (
    select o.id, o.batch_id, max(coalesce(t.at, run.closed_at)) as cutoff
    from private.lot_lineage(p_brewery, p_lot) lineage
    join public.vessel_occupancies o on o.id = lineage.occupancy_id and o.brewery_id = p_brewery
    cross join run
    left join public.transfers t on t.id = lineage.transfer_id and t.brewery_id = p_brewery
    group by o.id, o.batch_id
  ), ingredients as (
    select use.material_id, m.name as material, use.lot_id, l.lot_code as code,
      m.base_uom as unit, use.stage as source, sum(use.qty) as qty
    from private.material_trace_consumptions(p_brewery) use
    join public.materials m on m.id = use.material_id and m.brewery_id = p_brewery
    left join public.material_lots l on l.id = use.lot_id and l.brewery_id = p_brewery
    where use.run_id in (select id from run) or exists (
      select 1 from member_cutoffs member where member.batch_id = use.batch_id
        and (use.occupancy_id is null or use.occupancy_id = member.id) and use.at <= member.cutoff
    )
    group by use.material_id, m.name, use.lot_id, l.lot_code, m.base_uom, use.stage
  ) select coalesce(jsonb_agg(to_jsonb(ingredients) order by material, code, source), '[]'::jsonb) from ingredients;
$$;
revoke all on function private.lot_ingredients(uuid,uuid) from public, anon, authenticated;

create function public.trace_lot_ingredients(p_brewery uuid, p_lot uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists (select 1 from public.lots where brewery_id = p_brewery and id = p_lot) then
    raise exception using errcode = 'MG404', message = 'lot not found';
  end if;
  return private.lot_ingredients(p_brewery, p_lot);
end $$;
revoke all on function public.trace_lot_ingredients(uuid,uuid) from public, anon;
grant execute on function public.trace_lot_ingredients(uuid,uuid) to authenticated;

create function public.trace_material_lot(p_brewery uuid, p_material_lot uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists (select 1 from public.material_lots where brewery_id = p_brewery and id = p_material_lot) then
    raise exception using errcode = 'MG404', message = 'material lot not found';
  end if;
  with material_lot as (
    select l.id, l.lot_code as code, m.name as material, m.base_uom as unit,
      v.name as vendor, l.received_on, l.best_by
    from public.material_lots l join public.materials m on m.id = l.material_id and m.brewery_id = l.brewery_id
    left join public.vendors v on v.id = l.vendor_id and v.brewery_id = l.brewery_id
    where l.brewery_id = p_brewery and l.id = p_material_lot
  ), uses as materialized (
    select * from private.material_trace_consumptions(p_brewery) where lot_id = p_material_lot
  ), batches as (
    select distinct b.id, b.batch_no, b.brewed_on, b.closed_at,
      (select v.name from public.vessel_occupancies current_occupancy
        join public.vessels v on v.id = current_occupancy.vessel_id and v.brewery_id = p_brewery
        where current_occupancy.brewery_id = p_brewery and current_occupancy.batch_id = b.id
          and current_occupancy.ended_at is null order by current_occupancy.id limit 1) as in_vessel
    from uses
    left join public.packaging_runs packaging on packaging.id = uses.run_id and packaging.brewery_id = p_brewery
    left join public.vessel_occupancies occupancy on occupancy.id = packaging.occupancy_id and occupancy.brewery_id = p_brewery
    join public.batches b on b.id = coalesce(uses.batch_id, occupancy.batch_id) and b.brewery_id = p_brewery
  ), candidate_lots as (
    -- The forward counterpart owns blend membership; ingredients apply consumption-time cutoffs.
    select l.id from batches cross join lateral public.trace_batch_lots(p_brewery, batches.id) l
    union
    select l.id from uses join public.lots l on l.packaging_run_id = uses.run_id and l.brewery_id = p_brewery
  ), lots as (
    select l.id, l.code, l.packaged_on from candidate_lots candidate
    join public.lots l on l.id = candidate.id and l.brewery_id = p_brewery
    where exists (select 1 from jsonb_array_elements(private.lot_ingredients(p_brewery, l.id)) ingredient
      where ingredient->>'lot_id' = p_material_lot::text)
  ), runs as (
    select distinct r.id, r.run_no, r.closed_at from uses
    join public.packaging_runs r on r.id = uses.run_id and r.brewery_id = p_brewery
  ), order_ids as (
    select distinct movement.ref as id from public.inventory_movements movement
    where movement.brewery_id = p_brewery and movement.type = 'sale_removal'
      and movement.lot_id in (select id from lots) and movement.ref is not null
  ) select jsonb_build_object(
    'lot', (select to_jsonb(material_lot) from material_lot),
    'on_hand', coalesce((select sum(qty) from public.material_movements where brewery_id = p_brewery and lot_id = p_material_lot), 0),
    'used', coalesce((select jsonb_agg(to_jsonb(uses) order by at, id) from uses), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(to_jsonb(batches) order by batch_no, id) from batches), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(runs) order by run_no, id) from runs), '[]'::jsonb),
    'lots', coalesce((select jsonb_agg(to_jsonb(lots) order by packaged_on, id) from lots), '[]'::jsonb),
    'order_ids', coalesce((select jsonb_agg(id order by id) from order_ids), '[]'::jsonb),
    'unlinked_qty', coalesce((select sum(qty) from uses where batch_id is null and run_id is null), 0)
  ) into result;
  return result;
end $$;
revoke all on function public.trace_material_lot(uuid,uuid) from public, anon;
grant execute on function public.trace_material_lot(uuid,uuid) to authenticated;

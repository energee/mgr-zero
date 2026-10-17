-- #869: order shortfall and a brand's default batch package split feed Planning.
alter table public.skus add column batch_share numeric(5,4)
  check (batch_share is null or (batch_share > 0 and batch_share <= 1));
alter table public.breweries add column days_to_package integer not null default 14
  check (days_to_package between 1 and 120);

-- Serialize changes on the brand, not the individual SKU, so concurrent edits
-- cannot each claim the same remaining share. Inactive shares still reserve it.
create function private.check_brand_batch_share() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.batch_share is not null then
    perform 1 from public.brands where id = new.brand_id and brewery_id = new.brewery_id for update;
    if new.batch_share + coalesce((select sum(s.batch_share) from public.skus s
      where s.brand_id = new.brand_id and s.brewery_id = new.brewery_id and s.id <> new.id), 0) > 1 then
      raise exception 'batch package shares for a brand cannot total more than 100%%';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_brand_batch_share() from public, anon, authenticated, service_role;
create trigger skus_brand_batch_share before insert or update of batch_share, brand_id, brewery_id on public.skus
  for each row execute function private.check_brand_batch_share();

drop function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean);
create function public.update_sku(
  p_brewery uuid, p_id uuid, p_active boolean, p_upc text, p_request_id uuid,
  p_keg_pool uuid default null, p_clear_keg_pool boolean default false,
  p_batch_share numeric default null, p_clear_batch_share boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.skus;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'update_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'active', p_active, 'upc', p_upc)
      || case when p_keg_pool is not null or p_clear_keg_pool then jsonb_build_object('keg_pool', p_keg_pool, 'clear_keg_pool', p_clear_keg_pool) else '{}'::jsonb end
      || case when p_batch_share is not null or p_clear_batch_share then jsonb_build_object('batch_share', p_batch_share, 'clear_batch_share', p_clear_batch_share) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if p_active is null then raise exception 'active is required'; end if;
  -- All share editors take the brand lock before a SKU lock, matching the trigger.
  perform 1 from public.brands b join public.skus s on s.brand_id = b.id and s.brewery_id = b.brewery_id
    where s.id = p_id and s.brewery_id = p_brewery for update of b;
  select * into v_row from public.skus where id = p_id and brewery_id = p_brewery for update;
  if v_row.id is null then raise exception 'sku not found'; end if;
  if p_clear_keg_pool and p_keg_pool is not null then raise exception 'choose a keg pool or clear it, not both'; end if;
  if p_clear_batch_share and p_batch_share is not null then raise exception 'choose a batch share or clear it, not both'; end if;
  if p_keg_pool is distinct from v_row.keg_pool_id and p_keg_pool is not null then
    v_row.container_source := private.sku_keg_source(p_brewery, v_row.format_id, p_keg_pool);
    v_row.keg_pool_id := p_keg_pool;
  end if;
  if p_clear_keg_pool then v_row.keg_pool_id := null; v_row.container_source := null; end if;
  begin
    update public.skus set active = p_active, upc = p_upc,
      keg_pool_id = v_row.keg_pool_id, container_source = v_row.container_source,
      batch_share = case when p_clear_batch_share then null else coalesce(p_batch_share, v_row.batch_share) end
      where id = p_id and brewery_id = p_brewery returning * into v_row;
  exception when unique_violation then
    raise exception 'UPC is already assigned to another SKU; use a different UPC or clear it';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean,numeric,boolean) from public, anon, authenticated, service_role;
grant execute on function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean,numeric,boolean) to authenticated;

drop function public.set_brewery_operating_defaults(uuid,integer,uuid);
create function public.set_brewery_operating_defaults(
  p_brewery uuid, p_reading_due_hours integer, p_request_id uuid, p_days_to_package integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'set_brewery_operating_defaults', p_request_id,
    jsonb_build_object('hours', p_reading_due_hours)
      || case when p_days_to_package is not null then jsonb_build_object('days_to_package', p_days_to_package) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  update public.breweries set fermentation_reading_due_hours = p_reading_due_hours,
    days_to_package = coalesce(p_days_to_package, days_to_package) where id = p_brewery;
  return private.complete_command_request(p_request_id, '{"ok":true}');
end $$;
revoke all on function public.set_brewery_operating_defaults(uuid,integer,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.set_brewery_operating_defaults(uuid,integer,uuid,integer) to authenticated;

-- One owner for batch projection, reused by order netting and the material view.
-- The membership predicate also applies when the order reader runs as definer.
create view public.projected_batch_packaging_units with (security_invoker = true) as
  select b.brewery_id, s.id as sku_id,
    floor(b.planned_bbl * s.batch_share / fv.bbl_per_unit) as units,
    coalesce(b.brewed_on, b.planned_on) + br.days_to_package as needed_by
  from public.batches b
  join public.breweries br on br.id = b.brewery_id
  join public.skus s on s.brand_id = b.intended_brand_id and s.brewery_id = b.brewery_id
    and s.active and s.batch_share is not null
  join public.format_volumes fv on fv.id = s.format_id and fv.bbl_per_unit > 0
  where b.cancelled_at is null and b.closed_at is null
    and b.brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))
    and floor(b.planned_bbl * s.batch_share / fv.bbl_per_unit) > 0
    and not exists (
      select 1 from public.packaging_runs r
      left join public.vessel_occupancies o on o.id = r.occupancy_id and o.brewery_id = r.brewery_id
      where r.brewery_id = b.brewery_id and r.cancelled_at is null
        and (r.batch_id = b.id or o.batch_id = b.id));
revoke all on public.projected_batch_packaging_units from public, anon, authenticated, service_role;
grant select on public.projected_batch_packaging_units to authenticated;

-- Brewers cannot read orders. Return only SKU quantities/dates and explicitly
-- scope the definer to the caller's staff breweries; no customer data escapes.
create function public.order_packaging_shortfall_rows()
returns table (brewery_id uuid, sku_id uuid, units numeric, needed_by date)
language sql stable security definer set search_path = '' as $$
  with ord as (
    select al.brewery_id, al.sku_id, sum(al.qty) as qty, min(o.requested_ship_date) as ship_on
    from public.allocations al
    join public.order_lines ol on ol.id = al.ref and ol.brewery_id = al.brewery_id
    join public.orders o on o.id = ol.order_id and o.brewery_id = al.brewery_id
    where al.source = 'order_line' and al.status = 'open'
      and al.brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))
    group by 1, 2
  ), supply as (
    select r.brewery_id, o.sku_id, o.qty_planned as units
    from public.packaging_runs r join public.packaging_run_outputs o on o.run_id = r.id
    where r.closed_at is null and r.cancelled_at is null
    union all
    select b.brewery_id, b.sku_id, b.units from public.projected_batch_packaging_units b
  ), planned as (
    select brewery_id, sku_id, sum(units) as qty from supply group by 1, 2
  )
  select a.brewery_id, a.sku_id, least(-a.qty, ord.qty) - coalesce(p.qty, 0),
    coalesce(ord.ship_on, current_date)
  from public.atp a
  join ord on ord.brewery_id = a.brewery_id and ord.sku_id = a.sku_id
  left join planned p on p.brewery_id = a.brewery_id and p.sku_id = a.sku_id
  where least(-a.qty, ord.qty) > coalesce(p.qty, 0);
$$;
revoke all on function public.order_packaging_shortfall_rows() from public, anon, authenticated, service_role;
grant execute on function public.order_packaging_shortfall_rows() to authenticated;

create or replace view public.material_requirements with (security_invoker = true) as
  with sku_units as (
    select r.brewery_id, o.sku_id, o.qty_planned as units, r.planned_on as needed_by, false as projected
    from public.packaging_runs r join public.packaging_run_outputs o on o.run_id = r.id
    where r.closed_at is null and r.cancelled_at is null
    union all
    select b.brewery_id, b.sku_id, b.units, b.needed_by, true from public.projected_batch_packaging_units b
    union all
    select d.brewery_id, d.sku_id, d.units, d.needed_by, true from public.order_packaging_shortfall_rows() d
  ), req as (
    select b.brewery_id, ri.material_id, sum(ri.per_bbl_qty * b.planned_bbl) as required,
      min(b.planned_on) as needed_by, 0::numeric as projected
    from public.batches b join public.recipe_ingredients ri on ri.recipe_version_id = b.recipe_version_id
    where b.brewed_on is null and b.cancelled_at is null group by 1, 2
    union all
    select q.brewery_id, q.material_id, sum(q.qty), min(q.needed_by), coalesce(sum(q.qty) filter (where q.projected), 0)
    from (
      select u.brewery_id, bom.material_id, u.needed_by, u.projected,
        case when pm.base_uom = 'each' then ceil(u.units * bom.qty_per_unit) else u.units * bom.qty_per_unit end as qty
      from sku_units u
      join public.skus s on s.id = u.sku_id
      join public.format_bom bom on bom.format_id = s.format_id
      join public.materials pm on pm.id = bom.material_id
    ) q group by 1, 2
  ), gap as (
    select req.brewery_id, req.material_id, sum(req.required) as required, min(req.needed_by) as needed_by,
      coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
      sum(req.required) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short,
      sum(req.projected) as projected
    from req
    left join public.material_on_hand oh on oh.material_id = req.material_id
    left join public.material_on_order oo on oo.material_id = req.material_id
    group by 1, 2, oh.qty, oo.qty
  )
  select gap.brewery_id, gap.material_id, gap.required, gap.needed_by, gap.on_hand, gap.on_order, gap.short,
    m.name as material_name, m.base_uom, m.purchase_uom, m.purchase_uom_factor,
    ceil(greatest(gap.short, 0) / m.purchase_uom_factor) as purchase_units_short,
    coalesce(c.vendor_id, m.default_vendor_id) as vendor_id, v.name as vendor_name, v.lead_time_days,
    gap.needed_by - v.lead_time_days as buy_by,
    coalesce(gap.needed_by - v.lead_time_days < current_date, false) as out_of_reach,
    c.contract_id, c.qty_available as contract_qty_available, c.unit_cost_cents as contract_unit_cost_cents,
    gap.projected
  from gap join public.materials m on m.id = gap.material_id
  left join lateral (
    select cb.contract_id, cb.vendor_id, cb.qty_available, mc.unit_cost_cents
    from public.contract_balances cb join public.material_contracts mc on mc.id = cb.contract_id
    where cb.material_id = gap.material_id and cb.qty_available > 0
      and (mc.starts_on is null or mc.starts_on <= current_date) and (mc.ends_on is null or mc.ends_on >= current_date)
    order by mc.ends_on nulls last limit 1
  ) c on true
  left join public.vendors v on v.id = coalesce(c.vendor_id, m.default_vendor_id);

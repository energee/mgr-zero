-- One owner for what a material costs per base unit (docs/plans/material-price.md).
--
-- 20261128100000_material_price.sql wrote the rule inside recipe_version_costs:
-- the last receipt cost, else the typed price divided by the purchase-unit
-- factor. The recipe editor now previews the cost of a sheet that is not saved
-- yet, so it needs the same per-material cost without a recipe copy to read.
--
-- material_unit_costs holds the rule, one row per material:
--   unit_cost_cents  cents per base unit; NULL when the material has neither a
--                    receipt cost nor a typed price.
--   from_receipt     true when that cost is a purchase-order receipt's, false
--                    when it is the typed price (or there is none).
-- recipe_version_costs reads it and keeps its columns, their types and their
-- meaning, so create or replace keeps its grants.
create view public.material_unit_costs with (security_invoker = true) as
  select m.brewery_id, m.id as material_id,
    coalesce(c.unit_cost_cents, m.purchase_unit_cost_cents / m.purchase_uom_factor) as unit_cost_cents,
    c.unit_cost_cents is not null as from_receipt
  from public.materials m
  left join public.material_last_cost c on c.material_id = m.id;

revoke all on public.material_unit_costs from public, anon, authenticated;
grant select on public.material_unit_costs to authenticated;
grant all on public.material_unit_costs to postgres, service_role;

create or replace view public.recipe_version_costs with (security_invoker = true) as
  select ri.recipe_version_id, ri.brewery_id,
    case when bool_and(u.unit_cost_cents is not null)
      then round(sum(ri.per_bbl_qty * u.unit_cost_cents))::bigint end as cost_cents_per_bbl,
    coalesce(array_agg(distinct ri.material_id) filter (where u.unit_cost_cents is null), '{}'::uuid[]) as uncosted_material_ids,
    coalesce(array_agg(distinct ri.material_id) filter (where u.unit_cost_cents is not null and not u.from_receipt), '{}'::uuid[]) as unreceived_material_ids
  from public.recipe_ingredients ri
  join public.material_unit_costs u on u.material_id = ri.material_id
  group by ri.recipe_version_id, ri.brewery_id;

-- Recipe cost divided a material's cost by its purchase factor twice (#448).
-- receive_purchase_order already stores a receipt's unit_cost_cents per base
-- unit (the purchase-unit price / purchase_uom_factor), and recipe quantities
-- are per base unit, so the cost per barrel is per_bbl_qty × that cost.
create or replace view public.recipe_version_costs with (security_invoker = true) as
  select ri.recipe_version_id, ri.brewery_id,
    case when bool_and(c.unit_cost_cents is not null)
      then sum(ri.per_bbl_qty * c.unit_cost_cents::numeric)::integer end as cost_cents_per_bbl,
    coalesce(array_agg(distinct ri.material_id) filter (where c.unit_cost_cents is null), '{}'::uuid[]) as uncosted_material_ids
  from public.recipe_ingredients ri
  left join public.material_last_cost c on c.material_id = ri.material_id
  group by ri.recipe_version_id, ri.brewery_id;

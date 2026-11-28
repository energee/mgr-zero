-- A material's typed price, and recipe cost that reads it (docs/plans/material-price.md).
--
-- recipe_version_costs read only material_last_cost, the cost of a material's
-- last purchase-order receipt. A brewery that has received nothing yet (every
-- brewery on its first day, and one whose history was imported without
-- purchase orders) had no recipe cost at all.
--
-- materials.purchase_unit_cost_cents is the price someone typed for one
-- purchase unit (a bag, a pound), as a purchase order line's price is. A
-- recipe ingredient costs its last receipt cost when the material has ever
-- been received, else the typed price divided by the material's factor. The
-- cost is still derived at read time and never stored, so a price edit or a
-- new receipt changes every recipe cost at once.
--
-- unreceived_material_ids names the ingredients costed from the typed price,
-- so a reader can say which part of a cost no purchase order backs. "No
-- receipt cost" is material_last_cost's rule: a receipt with no price, or one
-- a correction reversed, gives none.
-- uncosted_material_ids keeps its meaning: no cost from either source, and
-- the recipe cost is NULL while any ingredient is in it.
--
-- material_last_cost is unchanged. Finished-goods cost and inventory value
-- read it, and those are what was paid, never a typed price.
alter table public.materials add column purchase_unit_cost_cents integer
  constraint materials_purchase_unit_cost_cents_check check (purchase_unit_cost_cents >= 0);
comment on column public.materials.purchase_unit_cost_cents is
  'Typed price of one purchase unit, in cents. Recipe cost reads it only while the material has no receipt cost.';

-- cost_cents_per_bbl widens from integer to bigint. A typed price can be as
-- large as an integer holds, so a quantity times it can pass integer range,
-- and the cast would then fail every read of the view. A column's type cannot
-- change under create or replace, so the view is dropped and granted again as
-- 20260924180000_receipt_cost_precision.sql granted it. Nothing depends on it.
drop view public.recipe_version_costs;

create view public.recipe_version_costs with (security_invoker = true) as
  select ri.recipe_version_id, ri.brewery_id,
    case when bool_and(x.unit_cost_cents is not null)
      then round(sum(ri.per_bbl_qty * x.unit_cost_cents))::bigint end as cost_cents_per_bbl,
    coalesce(array_agg(distinct ri.material_id) filter (where x.unit_cost_cents is null), '{}'::uuid[]) as uncosted_material_ids,
    coalesce(array_agg(distinct ri.material_id) filter (where c.unit_cost_cents is null and x.unit_cost_cents is not null), '{}'::uuid[]) as unreceived_material_ids
  from public.recipe_ingredients ri
  join public.materials m on m.id = ri.material_id
  left join public.material_last_cost c on c.material_id = ri.material_id
  cross join lateral (select coalesce(c.unit_cost_cents, m.purchase_unit_cost_cents / m.purchase_uom_factor) as unit_cost_cents) x
  group by ri.recipe_version_id, ri.brewery_id;

revoke all on public.recipe_version_costs from public, anon, authenticated;
grant select on public.recipe_version_costs to authenticated;
grant all on public.recipe_version_costs to postgres, service_role;

-- upsert_material takes the price. A new parameter is a new signature, so the
-- old function is dropped and the new one granted as the old one was. It comes
-- last with a default, and an edit that sends none keeps the saved price, as
-- p_pack_name does. The body is 20261111215000_material_pack_in_use.sql's with
-- only the price added.
drop function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,uuid,text);

create function public.upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_extract_potential numeric, p_alpha_acid numeric, p_request_id uuid, p_pack_name text default null,
  p_purchase_unit_cost_cents integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials; v_uses text; v_purchase_uses text;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active,
      'extract_potential', p_extract_potential, 'alpha_acid', p_alpha_acid)
      -- Only a call that sends a pack word adds it, so a call without one keeps the payload it had before pack
      -- words existed (20261110192920) and a retry that spans that migration still replays.
      || case when p_pack_name is null then '{}'::jsonb else jsonb_build_object('pack_name', p_pack_name) end
      -- The price joins the payload the same way, so a retry that spans this migration still replays.
      || case when p_purchase_unit_cost_cents is null then '{}'::jsonb else jsonb_build_object('purchase_unit_cost_cents', p_purchase_unit_cost_cents) end);
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, active, extract_potential, alpha_acid, pack_name, purchase_unit_cost_cents)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true), p_extract_potential, p_alpha_acid, p_pack_name, p_purchase_unit_cost_cents)
    returning * into v_row;
  else
    select * into v_row from public.materials where id = p_material and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'material not found'; end if;
    if (v_row.base_uom, v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, v_row.purchase_uom_factor)) then
      -- One row per use that locks a unit, named as the refusal names it; purchase_units marks the uses
      -- counted in purchase units (the header has the whole table). v_uses lists every use the material
      -- has, v_purchase_uses only those counted in purchase units; each is null when there is none.
      select string_agg(u.what, ', ' order by u.ord), string_agg(u.what, ', ' order by u.ord) filter (where u.purchase_units)
        into v_uses, v_purchase_uses
      from (values
        (1, 'a purchase order',                true,  exists (select 1 from public.purchase_order_lines where brewery_id = p_brewery and material_id = p_material)),
        (2, 'a contract',                      true,  exists (select 1 from public.material_contracts where brewery_id = p_brewery and material_id = p_material)),
        (3, 'a recipe',                        false, exists (select 1 from public.recipe_ingredients where brewery_id = p_brewery and material_id = p_material)),
        (4, 'stock movements',                 false, exists (select 1 from public.material_movements where brewery_id = p_brewery and material_id = p_material)),
        (5, 'a format''s packaging materials', false, exists (select 1 from public.format_bom where brewery_id = p_brewery and material_id = p_material)),
        (6, 'a transfer',                      false, exists (select 1 from public.stock_transfer_lines where brewery_id = p_brewery and material_id = p_material)),
        (7, 'a brew prep pull',                false, exists (select 1 from public.brew_pulls where brewery_id = p_brewery and material_id = p_material))
      ) as u(ord, what, purchase_units, used)
      where u.used;
      if v_row.base_uom is distinct from p_base_uom and v_uses is not null then
        raise exception 'material is in use by %: its base unit cannot change', v_uses;
      end if;
      if (v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_purchase_uom, coalesce(p_purchase_uom_factor, v_row.purchase_uom_factor))
         and v_purchase_uses is not null then
        raise exception 'material is in use by %: its purchase unit and base units per purchase unit cannot change', v_purchase_uses;
      end if;
    end if;
    if not v_row.lot_tracked and p_lot_tracked
       -- per bin: unlotted amounts in different bins must not cancel out
       and exists (select 1 from public.material_movements
                   where brewery_id = p_brewery and material_id = p_material and lot_id is null
                   group by bin_id having sum(qty) <> 0) then
      raise exception 'material has stock without a lot: count it to zero before turning on lot tracking';
    end if;
    update public.materials set name = p_name, category = p_category, base_uom = p_base_uom, purchase_uom = p_purchase_uom,
      purchase_uom_factor = coalesce(p_purchase_uom_factor, purchase_uom_factor), lot_tracked = coalesce(p_lot_tracked, lot_tracked),
      default_vendor_id = p_default_vendor, reorder_point = coalesce(p_reorder_point, reorder_point), active = coalesce(p_active, active),
      extract_potential = coalesce(p_extract_potential, extract_potential),
      alpha_acid = coalesce(p_alpha_acid, alpha_acid),
      pack_name = coalesce(p_pack_name, pack_name),
      purchase_unit_cost_cents = coalesce(p_purchase_unit_cost_cents, purchase_unit_cost_cents)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,uuid,text,integer) to authenticated;

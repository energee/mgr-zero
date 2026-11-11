-- A material in use can take its pack. The units guard (#614) refused any
-- change to base_uom, purchase_uom or purchase_uom_factor once anything
-- referenced the material. That also refused setting a pack (purchase unit lb
-- to each, 55 lb per bag) on a malt that only recipes use, which stores no
-- purchase-unit number anywhere. The guard now locks each unit only by the
-- rows whose meaning depends on it.
--
-- The rule:
--   base_uom             locked by any row in the table below marked "base" or "purchase".
--   purchase_uom, factor locked only by the rows marked "purchase".
-- "Meaning" is the real amount, in base units, and the money a row stands for.
-- A pack reading ("23 bags", "4 x 55 lb + 20 lb") is drawn from a base-unit
-- amount at read time and is not a stored fact, so it may follow the factor.
--
-- Every stored quantity or price of a material, and its unit:
--
--   table.column                                unit      locks     why
--   purchase_order_lines.qty_ordered            purchase  purchase  material_on_order multiplies the open amount by the
--     .unit_cost_cents (per purchase unit)                          current factor, receive_purchase_order converts the count
--                                                                   with it, and a closed order still prints the current unit.
--   material_contracts.qty_committed            purchase  purchase  contract_balances subtracts receipt and open-order counts
--     .unit_cost_cents (per purchase unit)                          in purchase units; the price is copied to order lines.
--   recipe_ingredients.per_bbl_qty              base      base      requirements, cost and gravity read base units only.
--   material_movements.qty                      base      base      on hand is a sum of base units.
--     .unit_cost_cents (per base unit)                              divided by the factor once, when received; never again.
--   format_bom.qty_per_unit                     base      base      packaging plans and repack read base units only.
--   stock_transfer_lines.qty, qty_picked        base      base      a transfer moves base units.
--   brew_pulls.qty                              base      base      new here: a pull for a material nothing else used
--                                                                   could be reread, 5 lb as 5 kg.
--   receipt_lines.qty_expected, qty_counted     purchase  no        the row keeps its own base_uom, purchase_uom,
--     .purchase_unit_cost_cents                                     purchase_uom_factor and price, and always has an order
--                                                                   line, which locks.
--   material_count_lines.qty_expected, _counted base      no        a non-zero count means movements exist, which lock.
--   recipe_water_additions.qty                  own unit  no        its unit column (g, mL, oz) travels with it.
--   batch_additions.confirmed_qty               base      no        always has a movement, which locks; a brew-day
--                                                                   addition also keeps its own unit.
--   packaging_material_actuals.qty_*            base      no        keeps its own unit.
--   packaging_material_records.planned (json)   base      no        keeps each material's unit; comes from format_bom.
--   brew_records.plan_snapshot (json)           base      no        keeps each line's unit and purchaseUomFactor as brewed.
--   materials.reorder_point                     base      no        on the material itself.
--   material_lots                               none      no        holds no quantity.
--
-- Read-time uses of the current factor, and what keeps each one true:
--   material_on_order, packaging_run_requirements.on_order: open order lines x factor. Order lines lock it.
--   material_requirements.purchase_units_short: today's shortfall / factor. It is a suggestion about the
--     future, compared only with a contract's available amount. Contracts lock it.
--   receive_purchase_order, Receive PO preview: count x factor. Order lines lock it.
--   correct_purchase_receipt, Receipt: the factor kept on the receipt line, never the material's.
--   private.brew_plan_snapshot: the factor a planned batch reads for its pull list; a recorded brew keeps its own.
--   Recipe sheet, Prep and Brew day: a base-unit amount split into packs for display and entry.
-- Nothing reads a movement, recipe line, format BOM line, transfer line, count
-- line or pull through the factor to get an amount or a price, so those rows
-- do not lock the purchase unit or the factor.
--
-- The body is 20261110192920_recipe_batch_size.sql's definition with only the
-- guard changed and two variables declared for it. The signature is the same,
-- so create or replace keeps its grants.
create or replace function public.upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_extract_potential numeric, p_alpha_acid numeric, p_request_id uuid, p_pack_name text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials; v_uses text; v_purchase_uses text;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active,
      'extract_potential', p_extract_potential, 'alpha_acid', p_alpha_acid)
      -- Only a call that sends a pack word adds it, so a call without one keeps the payload it had before this
      -- migration and a retry that spans it still replays.
      || case when p_pack_name is null then '{}'::jsonb else jsonb_build_object('pack_name', p_pack_name) end);
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, active, extract_potential, alpha_acid, pack_name)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true), p_extract_potential, p_alpha_acid, p_pack_name)
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
        (1, 'a purchase order',                true,  exists (select 1 from public.purchase_order_lines where material_id = p_material)),
        (2, 'a contract',                      true,  exists (select 1 from public.material_contracts where material_id = p_material)),
        (3, 'a recipe',                        false, exists (select 1 from public.recipe_ingredients where material_id = p_material)),
        (4, 'stock movements',                 false, exists (select 1 from public.material_movements where material_id = p_material)),
        (5, 'a format''s packaging materials', false, exists (select 1 from public.format_bom where material_id = p_material)),
        (6, 'a transfer',                      false, exists (select 1 from public.stock_transfer_lines where material_id = p_material)),
        (7, 'a brew prep pull',                false, exists (select 1 from public.brew_pulls where material_id = p_material))
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
      pack_name = coalesce(p_pack_name, pack_name)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

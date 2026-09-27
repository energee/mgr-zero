-- #614: the units guard refused a change to (base_uom, purchase_uom,
-- purchase_uom_factor) only once material_movements existed. Other rows also
-- store a quantity that readers interpret in the material's current units:
-- recipe_ingredients.per_bbl_qty and format_bom.qty_per_unit (base unit),
-- purchase_order_lines.qty_ordered and material_contracts.qty_committed
-- (purchase unit), and a draft stock_transfer_lines.qty (base unit). A recipe
-- saved before the first receipt read lb as kg and its predicted OG moved from
-- 13.27 to 27.73 °P. Any of those rows now locks the units too.
-- Not checked: recipe_water_additions carries its own unit column; a
-- material_count_lines quantity is non-zero only when movements exist (on hand,
-- or the variance the count posts); material_lots holds no quantity. The body
-- is 20260927020000's definition with only the guard widened; the signature is
-- the same, so create or replace keeps its grants.
create or replace function public.upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_extract_potential numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active,
      'extract_potential', p_extract_potential));
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, active, extract_potential)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true), p_extract_potential)
    returning * into v_row;
  else
    select * into v_row from public.materials where id = p_material and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'material not found'; end if;
    if (v_row.base_uom, v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, v_row.purchase_uom_factor))
       and (exists (select 1 from public.material_movements where material_id = p_material)
         or exists (select 1 from public.recipe_ingredients where material_id = p_material)
         or exists (select 1 from public.format_bom where material_id = p_material)
         or exists (select 1 from public.purchase_order_lines where material_id = p_material)
         or exists (select 1 from public.material_contracts where material_id = p_material)
         or exists (select 1 from public.stock_transfer_lines where material_id = p_material)) then
      raise exception 'material is in use: its units cannot change';
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
      extract_potential = coalesce(p_extract_potential, extract_potential)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

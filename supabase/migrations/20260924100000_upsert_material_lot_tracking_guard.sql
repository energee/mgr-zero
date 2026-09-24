-- #452: turning lot tracking on while unlotted stock is on hand strands that
-- stock — a count shortage cannot find a lot to take it from and
-- enforce_material_lot refuses to consume or move it. upsert_material now
-- refuses the switch until on hand (material_on_hand) equals the lotted on
-- hand (material_lot_on_hand), mirroring the unit lock beside it. Otherwise
-- the baseline definition, unchanged; create or replace keeps its grants.
create or replace function public.upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active));
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, active)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true))
    returning * into v_row;
  else
    select * into v_row from public.materials where id = p_material and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'material not found'; end if;
    if (v_row.base_uom, v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1))
       and exists (select 1 from public.material_movements where material_id = p_material) then
      raise exception 'material is in use: its units cannot change';
    end if;
    if not v_row.lot_tracked and p_lot_tracked
       and coalesce((select qty from public.material_on_hand where brewery_id = p_brewery and material_id = p_material), 0)
           <> coalesce((select sum(qty) from public.material_lot_on_hand where brewery_id = p_brewery and material_id = p_material), 0) then
      raise exception 'material has stock without a lot: count it to zero before turning on lot tracking';
    end if;
    update public.materials set name = p_name, category = p_category, base_uom = p_base_uom, purchase_uom = p_purchase_uom,
      purchase_uom_factor = coalesce(p_purchase_uom_factor, 1), lot_tracked = coalesce(p_lot_tracked, lot_tracked),
      default_vendor_id = p_default_vendor, reorder_point = coalesce(p_reorder_point, reorder_point), active = coalesce(p_active, active)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

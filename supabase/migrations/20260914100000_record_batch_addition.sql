-- record_batch_addition (issue #278, Cellar addition): a post-knockout dry
-- hop, fruit or adjunct against an open occupancy. One RPC appends the
-- batch_additions row (stage, occupancy) and the material consumption
-- movement it points at, so loss accounting stays anchored to the batch.
-- The lot is required when the material is lot-tracked (the movement
-- trigger enforces it; this raises the friendlier message first).
-- ponytail: the bin is derived — the bin holding the most of that material
-- (and lot) at any location — rather than picked on the sheet; add p_bin when
-- a brewery keeps the same hop in two cold rooms and cares which one drains.
create function public.record_batch_addition(
  p_brewery uuid, p_occupancy uuid, p_material uuid, p_stage public.ingredient_stage,
  p_lot uuid, p_qty numeric, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_occ public.vessel_occupancies; v_mat public.materials;
  v_bin record; v_movement uuid; v_row public.batch_additions;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_batch_addition', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'occupancy', p_occupancy, 'material', p_material,
      'stage', p_stage, 'lot', p_lot, 'qty', p_qty, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'quantity must be positive'; end if;
  if p_qty <> round(p_qty, 4) then raise exception 'material quantities require at most four decimals'; end if;

  perform private.lock_cellar_workflow(p_brewery);
  perform private.assert_open_occupancy(p_brewery, p_occupancy);
  select * into v_occ from public.vessel_occupancies where id = p_occupancy and brewery_id = p_brewery;

  select * into v_mat from public.materials where id = p_material and brewery_id = p_brewery;
  if v_mat.id is null then raise exception 'material not found'; end if;
  if v_mat.lot_tracked and p_lot is null then raise exception 'choose a lot: % is lot-tracked', v_mat.name; end if;
  if not v_mat.lot_tracked and p_lot is not null then raise exception '% is not lot-tracked', v_mat.name; end if;

  -- The bin with the most of this material (and lot) on hand; refuse to drain
  -- more than it holds so a typo never drives a bin negative.
  select m.location_id, m.bin_id, sum(m.qty) as qty into v_bin
  from public.material_movements m
  where m.brewery_id = p_brewery and m.material_id = p_material and (p_lot is null or m.lot_id = p_lot)
  group by m.location_id, m.bin_id order by sum(m.qty) desc limit 1;
  if v_bin.bin_id is null or v_bin.qty < p_qty then
    raise exception 'only % % of % on hand', coalesce(v_bin.qty, 0), v_mat.base_uom, v_mat.name;
  end if;

  insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, note, created_by)
  values (p_brewery, p_material, v_bin.location_id, v_bin.bin_id, p_lot, -p_qty, 'consumption', p_note, v_actor)
  returning id into v_movement;
  insert into public.batch_additions (brewery_id, batch_id, occupancy_id, stage, movement_id)
  values (p_brewery, v_occ.batch_id, p_occupancy, p_stage, v_movement) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.record_batch_addition(uuid,uuid,uuid,public.ingredient_stage,uuid,numeric,text,uuid) from public, anon, authenticated;
grant execute on function public.record_batch_addition(uuid,uuid,uuid,public.ingredient_stage,uuid,numeric,text,uuid) to authenticated;

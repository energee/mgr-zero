-- record_batch_addition takes the material ledger lock before its stock check.
-- It serialized only on the per-brewery cellar advisory lock, while bin moves,
-- transfer receives and material counts check stock under the
-- material_movements table lock. The two locks never conflict, so an addition
-- and one of those writers could both pass their checks against the same bin
-- and drive it negative. Body otherwise unchanged from
-- 20260914100000_record_batch_addition.sql; create or replace keeps its grants.

create or replace function public.record_batch_addition(
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
  -- The stock check below must see every other material writer's drain; they
  -- all check under this table lock, which the cellar advisory lock does not block.
  lock table public.material_movements in share row exclusive mode;
  perform private.assert_open_occupancy(p_brewery, p_occupancy);
  select * into v_occ from public.vessel_occupancies where id = p_occupancy and brewery_id = p_brewery;

  select * into v_mat from public.materials where id = p_material and brewery_id = p_brewery;
  if v_mat.id is null then raise exception 'material not found'; end if;
  -- enforce_material_lot on the movement also refuses this; the message here is the one the sheet shows.
  if v_mat.lot_tracked and p_lot is null then raise exception 'choose a lot: % is lot-tracked', v_mat.name; end if;

  -- The bin with the most of this material (and lot) on hand; refuse to drain
  -- more than it holds so a typo never drives a bin negative.
  select location_id, bin_id, qty into v_bin from public.material_lot_bin_on_hand
  where brewery_id = p_brewery and material_id = p_material and (p_lot is null or lot_id = p_lot)
  order by qty desc limit 1;
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

-- #613: a repack keeps the finished-goods lot. record_repack wrote both legs
-- with lot_id null, so the broken case stayed in lot_on_hand and the ship
-- picker (bin_move_stock) while the four-packs lost their lot and fell out of
-- trace_lot. It now takes an optional p_lot, the same way a bin move or a
-- shipment names its source: the parent is checked and deducted from that
-- lot, and the child leg carries it. The stock check is assert_bin_stock
-- (20260924090000), so a null lot counts only lot-less stock and a bin holding
-- lotted stock asks for the lot.
-- The impl body copies 20260926010000_packaging_bom_fefo.sql and the wrapper
-- copies 00001_baseline.sql; only the lot parameter, the stock check, and the
-- two inserts changed.

drop function public.record_repack(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid);
drop function private.record_repack_impl(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid);

create function private.record_repack_impl(
  p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric,
  p_child_sku uuid, p_child_qty numeric, p_lot uuid, p_actor uuid
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_ref uuid := private.new_uuid();
  v_parent public.skus; v_child public.skus;
  v_component numeric; v_expected numeric; v_net numeric;
  v_lot_tracked text; v_bom record;
begin
  if p_parent_qty <= 0 then raise exception 'parentQty must be positive'; end if;
  -- Composite FKs on inventory_movements already pin location/bin/sku to this
  -- brewery; these lookups are scoped too so the error is a sentence, not 23503.
  select * into v_parent from public.skus where id = p_parent_sku and brewery_id = p_brewery;
  select * into v_child  from public.skus where id = p_child_sku  and brewery_id = p_brewery;
  if v_parent.id is null or v_child.id is null then raise exception 'sku not found'; end if;
  if v_parent.brand_id <> v_child.brand_id then raise exception 'a repack stays inside one brand'; end if;

  select c.qty into v_component from public.format_components c
   where c.brewery_id = p_brewery and c.parent_format_id = v_parent.format_id and c.child_format_id = v_child.format_id;
  if v_component is null then
    raise exception 'format % is not a component of format %: composition is one level deep',
      v_child.format_id, v_parent.format_id;
  end if;

  v_expected := p_parent_qty * v_component;
  if p_child_qty <> v_expected then
    raise exception 'childQty % does not match parentQty % x % per unit: expected %, and only that ratio is volume-neutral',
      p_child_qty, p_parent_qty, v_component, v_expected;
  end if;

  -- A lot-tracked material needs a lot chosen for it, and a repack has nowhere
  -- to say which one; enforce_material_lot would otherwise fail the call with a
  -- bare uuid. Refuse up front, by name, before a single row is written.
  -- ponytail: take an optional per-material lot pick on the input and pass it
  -- through to material_movements.lot_id when someone lot-tracks packaging.
  select m.name into v_lot_tracked
  from public.format_bom bom join public.materials m on m.id = bom.material_id
  where bom.brewery_id = p_brewery and bom.format_id = v_parent.format_id and m.lot_tracked
  order by m.name limit 1;
  if v_lot_tracked is not null then
    raise exception 'repack cannot post BOM for lot-tracked material "%" yet; mark it untracked or remove it from the format''s BOM', v_lot_tracked;
  end if;

  -- The bin cannot go short in the chosen lot (a null lot is the lot-less
  -- stock; lotted stock in the bin asks for its lot).
  -- ponytail: global ledger lock, matching all stock writers; shared stock-key locks at higher throughput.
  lock table public.inventory_movements in share row exclusive mode;
  perform private.assert_bin_stock(p_brewery,
    (select id from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery),
    p_parent_sku, null, null, null, p_lot, false, p_parent_qty);

  -- Both legs carry the source lot, so the four-packs stay in its trace.
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
  -- created_by is the actor assert_staff verified in the public wrapper, not
  -- auth.uid() read again here: the wrapper is the one place identity is proven.
  values (p_brewery, p_parent_sku, p_location, p_bin, p_lot, -p_parent_qty, 'repack', v_ref, p_actor),
         (p_brewery, p_child_sku,  p_location, p_bin, p_lot,  p_child_qty,  'repack', v_ref, p_actor);

  -- The trigger froze bbl on each row from format_volumes; if the pair does not
  -- cancel the repack invented or destroyed beer, so the whole call rolls back.
  -- Filtered on the on-hand index columns too: `ref` alone has no index, and
  -- the two rows just written are exactly this brewery/bin/sku pair.
  select coalesce(sum(m.bbl), 0) into v_net from public.inventory_movements m
   where m.brewery_id = p_brewery and m.location_id = p_location and m.bin_id = p_bin
     and m.sku_id in (p_parent_sku, p_child_sku) and m.ref = v_ref and m.type = 'repack';
  if abs(v_net) >= 0.000001 then
    raise exception 'repack is not volume-neutral: % bbl left over', v_net;
  end if;

  -- The packaging that came off, in whole units for a counted material: what
  -- is consumed rounds up, as close_packaging_run draws it (#436), and what
  -- goes back on the shelf rounds down, so neither books part of a carrier.
  -- A consumed line has to be on the shelf; take the material ledger lock
  -- (as close and move_stock_bin do) so two writers cannot both pass (#588).
  lock table public.material_movements in share row exclusive mode;
  for v_bom in
    select bom.material_id, bom.on_break = 'consumed' as consumed,
           case when m.base_uom <> 'each' then bom.qty_per_unit * p_parent_qty
                when bom.on_break = 'consumed' then ceil(bom.qty_per_unit * p_parent_qty)
                else floor(bom.qty_per_unit * p_parent_qty) end as qty
    from public.format_bom bom join public.materials m on m.id = bom.material_id
    where bom.brewery_id = p_brewery and bom.format_id = v_parent.format_id
  loop
    continue when v_bom.qty = 0;
    if v_bom.consumed then
      perform private.assert_bin_stock(p_brewery, p_bin, null, v_bom.material_id, null, null, null, false, v_bom.qty);
    end if;
    insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, note, created_by)
    values (p_brewery, v_bom.material_id, p_location, p_bin,
            case when v_bom.consumed then -v_bom.qty else v_bom.qty end,
            case when v_bom.consumed then 'consumption' else 'return_to_stock' end::public.material_movement_type,
            'repack ' || v_ref, p_actor);
  end loop;

  return jsonb_build_object('ref', v_ref, 'parent_qty', p_parent_qty, 'child_qty', p_child_qty);
end $$;

create function public.record_repack(
  p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric,
  p_child_sku uuid, p_child_qty numeric, p_request_id uuid, p_lot uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_actor uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_repack', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'bin', p_bin, 'parent_sku', p_parent_sku,
                       'parent_qty', p_parent_qty, 'child_sku', p_child_sku, 'child_qty', p_child_qty, 'lot', p_lot));
  if v_replay is not null then return v_replay; end if;
  v_result := private.record_repack_impl(p_brewery, p_location, p_bin, p_parent_sku, p_parent_qty, p_child_sku, p_child_qty, p_lot, v_actor);
  return private.complete_command_request(p_request_id, v_result);
end $$;

revoke all on function private.record_repack_impl(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,uuid) from public;
revoke all on function public.record_repack(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_repack(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,uuid) to authenticated, service_role;

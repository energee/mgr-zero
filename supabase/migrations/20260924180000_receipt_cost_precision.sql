-- A receipt's cost per base unit keeps sub-cent precision (#495).
-- receive_purchase_order stored round(purchase-unit cost / purchase_uom_factor)
-- as a whole-cent int, so $10/lb hops counted in grams (2.2046¢/g) became 2¢/g,
-- 9% low in every recipe cost and price-group suggestion, and anything under
-- 0.5¢ per base unit became free. recipe_version_costs (since #448/#494)
-- multiplies per_bbl_qty by this per-base-unit cost and rounds the barrel total
-- once, so the stored cost is the one place precision was lost.
--
-- Fix: widen material_movements.unit_cost_cents to unconstrained numeric and
-- store the division unrounded. Unconstrained rather than a fixed scale such
-- as numeric(14,4): any fixed scale repeats the bug one magnitude down (a
-- $1/gal adjunct counted in ml is 0.0264¢/ml). Keeping the per-purchase-unit
-- cost and dividing in the view would also work, but the movement row does not
-- carry the factor it was received under, and the factor can change later.
-- The column stays in cents (the name holds); only receipts write it.
--
-- No backfill: existing receipt rows keep their rounded values. The movement
-- does not store the purchase-unit cost it came from (receipt_lines point at
-- the PO line, whose price may since have been edited, and the material's
-- factor may have changed), so the lost fraction cannot be recovered. The
-- next receipt of each material supersedes its last cost.
--
-- material_last_cost reads the column and recipe_version_costs reads that
-- view, so both are dropped and recreated unchanged (security_invoker, grants).

drop view public.recipe_version_costs;
drop view public.material_last_cost;

alter table public.material_movements alter column unit_cost_cents type numeric;

create view public.material_last_cost with (security_invoker = true) as
  select distinct on (brewery_id, material_id) brewery_id, material_id, unit_cost_cents, created_at
  from public.material_movements where type = 'receipt' and unit_cost_cents is not null
  order by brewery_id, material_id, created_at desc;

create view public.recipe_version_costs with (security_invoker = true) as
  select ri.recipe_version_id, ri.brewery_id,
    case when bool_and(c.unit_cost_cents is not null)
      then sum(ri.per_bbl_qty * c.unit_cost_cents::numeric)::integer end as cost_cents_per_bbl,
    coalesce(array_agg(distinct ri.material_id) filter (where c.unit_cost_cents is null), '{}'::uuid[]) as uncosted_material_ids
  from public.recipe_ingredients ri
  left join public.material_last_cost c on c.material_id = ri.material_id
  group by ri.recipe_version_id, ri.brewery_id;

revoke all on public.material_last_cost, public.recipe_version_costs from public, anon, authenticated;
grant select on public.material_last_cost, public.recipe_version_costs to authenticated;
grant all on public.material_last_cost, public.recipe_version_costs to postgres, service_role;

create or replace function public.receive_purchase_order(
  p_brewery uuid, p_po uuid, p_location uuid, p_bin uuid, p_received_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_po public.purchase_orders; v_receipt_id uuid; l jsonb;
  v_line public.purchase_order_lines; v_mat public.materials; v_counted numeric; v_expected numeric;
  v_lot uuid; v_movement uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'receive_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'location', p_location, 'bin', p_bin, 'received_on', p_received_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_po := private.lock_purchase_order(p_brewery, p_po, array['sent','partially_received']::public.po_status[]);
  if jsonb_array_length(p_lines) = 0 then raise exception 'a receipt needs at least one counted line'; end if;
  insert into public.receipts (brewery_id, po_id, received_on, received_by)
  values (p_brewery, p_po, coalesce(p_received_on, current_date), v_actor) returning id into v_receipt_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.purchase_order_lines where id = (l->>'po_line_id')::uuid and po_id = p_po;
    if v_line.id is null then raise exception 'line % is not on this purchase order', l->>'po_line_id'; end if;
    select * into v_mat from public.materials where id = v_line.material_id;
    v_counted := (l->>'qty_counted')::numeric;
    select qty_open into v_expected from public.po_open_balances where po_line_id = v_line.id;
    v_lot := null; v_movement := null;
    if v_mat.lot_tracked then
      if nullif(trim(l->>'lot_code'), '') is null then raise exception '% is lot-tracked: a lot code is required', v_mat.name; end if;
      insert into public.material_lots (brewery_id, material_id, lot_code, vendor_id, received_on, best_by)
      values (p_brewery, v_mat.id, trim(l->>'lot_code'), v_po.vendor_id, coalesce(p_received_on, current_date), (l->>'best_by')::date)
      -- ponytail: exact (trimmed) lot-code match; case/punctuation normalization needs a generated column carrying the unique
      on conflict (material_id, lot_code) do update set best_by = coalesce(excluded.best_by, public.material_lots.best_by)
      returning id into v_lot;
    end if;
    if v_counted > 0 then
      -- Cost per base unit, unrounded (#495): the purchase-unit price over the factor.
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, unit_cost_cents, created_by)
      values (p_brewery, v_mat.id, p_location, p_bin, v_lot, v_counted * v_mat.purchase_uom_factor, 'receipt',
              v_line.unit_cost_cents / v_mat.purchase_uom_factor, v_actor)
      returning id into v_movement;
    end if;
    insert into public.receipt_lines (brewery_id, receipt_id, po_line_id, qty_expected, qty_counted, lot_id, movement_id)
    values (p_brewery, v_receipt_id, v_line.id, v_expected, v_counted, v_lot, v_movement);
  end loop;
  select * into v_po from public.purchase_orders where id = p_po;
  return private.complete_command_request(p_request_id, jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po, 'status', v_po.status));
end $$;

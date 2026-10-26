create or replace function private.assert_bin_stock(p_brewery uuid, p_bin uuid,
  p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size public.keg_size,
  p_lot uuid, p_any_lot boolean, p_qty numeric)
 returns void
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_available numeric;
begin
  v_available := private.bin_stock_on_hand(p_brewery, p_bin, p_sku, p_material, p_keg_pool, p_keg_size, p_lot, p_any_lot);
  if p_qty <= v_available then return; end if;
  if p_lot is null and not p_any_lot and (
       (p_sku is not null and exists(select 1 from public.inventory_movements
          where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_bin and lot_id is not null))
    or (p_material is not null and exists(select 1 from public.material_movements
          where brewery_id = p_brewery and material_id = p_material and bin_id = p_bin and lot_id is not null)))
    then raise exception 'Choose the recorded lot for this removal.'; end if;
  raise exception 'Not enough stock in the selected bin and lot: % on hand. Reduce the quantity or choose another source.',
    pg_catalog.trim_scale(v_available);
end $function$;

create or replace function public.record_keg_event(p_brewery uuid, p_pool uuid, p_keg_size keg_size, p_qty integer, p_reason keg_event_reason, p_location uuid, p_bin uuid, p_customer uuid, p_note text, p_request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_replay jsonb; v_row public.keg_events; v_active boolean; v_on_hand int; v_held int;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_keg_event', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'pool', p_pool, 'keg_size', p_keg_size, 'qty', p_qty, 'reason', p_reason,
                       'location', p_location, 'bin', p_bin, 'customer', p_customer, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  -- The bin and customer checks below read a total then insert; take the keg
  -- ledger lock (as every keg writer does) so two cannot both pass on the same kegs.
  lock table public.keg_events in share row exclusive mode;
  if p_qty <= 0 then raise exception 'qty must be positive'; end if;
  if p_reason in ('transferred_in','transferred_out') then raise exception 'transfers are recorded by stock transfers and bin moves'; end if;
  if p_reason in ('shipped','returned') and p_customer is null then raise exception 'customer is required for % kegs', p_reason; end if;
  -- found is a fleet correction at the bin; a keg found at a customer is a
  -- shipped event, so the customer balance is never moved by found.
  if p_reason in ('acquired','retired','found') and p_customer is not null then raise exception '% kegs carry no customer', p_reason; end if;
  select active into v_active from public.keg_pools where id = p_pool and brewery_id = p_brewery;
  if v_active is null then raise exception 'keg pool not found'; end if;
  if not v_active then raise exception 'keg pool is out of service'; end if;
  if not exists (select 1 from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery) then
    raise exception 'bin is not in that location';
  end if;
  if p_reason in ('retired','shipped') or (p_reason = 'lost' and p_customer is null) then
    select coalesce(sum(qty), 0) into v_on_hand from public.keg_bin_on_hand
      where pool_id = p_pool and keg_size = p_keg_size and bin_id = p_bin;
    if v_on_hand < p_qty then raise exception 'Not enough kegs in that bin: % on hand. Check the quantity and source bin.', v_on_hand; end if;
  end if;
  if p_reason in ('returned','lost') and p_customer is not null then
    select coalesce(sum(qty), 0) into v_held from public.keg_customer_balances
      where brewery_id = p_brewery and customer_id = p_customer and pool_id = p_pool and keg_size = p_keg_size;
    if v_held < p_qty then raise exception 'Not enough kegs at that customer: customer holds %. Check the quantity and customer.', v_held; end if;
  end if;
  insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, customer_id, note, created_by)
  values (p_brewery, p_pool, p_keg_size, p_location, p_bin, p_qty, p_reason, p_customer, p_note, auth.uid()) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

create or replace function public.upsert_price_group(p_brewery uuid, p_id uuid, p_name text, p_position int, p_cost_ceiling_cents int, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_replay jsonb; v_row public.price_groups; v_constraint_name text;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_price_group', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'position', p_position, 'cost_ceiling_cents', p_cost_ceiling_cents));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.price_groups (brewery_id, name, position, cost_ceiling_cents) values (p_brewery, p_name, p_position, p_cost_ceiling_cents) returning * into v_row;
    else
      update public.price_groups set name = p_name, position = p_position, cost_ceiling_cents = p_cost_ceiling_cents where id = p_id and brewery_id = p_brewery returning * into v_row;
      if not found then raise exception 'price group not found' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'price_groups_brewery_id_name_key' then
      raise exception 'Another price group already uses that name.' using errcode = 'P0001';
    elsif v_constraint_name = 'price_groups_brewery_id_position_key' then
      raise exception 'Another price group already uses position %.', p_position using errcode = 'P0001';
    end if;
    raise;
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

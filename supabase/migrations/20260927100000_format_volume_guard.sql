-- #632: upsert_format overwrote bbl_per_unit, units_per_case and ounces with no
-- in-use check. The inventory ledger freezes barrels when a movement posts, but
-- planned packaging outputs, open-order barrel estimates, repack's
-- volume-neutrality check and poured-ounce math read these fields at read time,
-- so an edit reinterpreted quantities already recorded against the format.
-- A format in use now keeps them; a rename or other edit still saves.
-- "In use" is the set private.guard_format_basis (#470) already locks: a SKU
-- (order lines, packaging runs, stock and taps all reach a format through one),
-- a format component as parent or child, a format BOM, and for pours a POS item
-- mapping, menu line, catalog ownership or sale expectation.
-- Not checked: channel_prices holds money per unit, not a quantity; private
-- square_publication_events is a history log beside pos_catalog_ownership.
-- A basis change is left to that trigger, so it keeps its own message.
-- The body is the baseline definition with only the guard added; the signature
-- is the same, so create or replace keeps its grants.
create or replace function public.upsert_format(
  p_brewery uuid, p_id uuid, p_name text, p_basis public.format_basis, p_package_type public.package_type,
  p_keg_size public.keg_size, p_units_per_case int, p_bbl_per_unit numeric, p_request_id uuid,
  p_brand uuid default null, p_ounces numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'basis', p_basis, 'package_type', p_package_type,
                       'keg_size', p_keg_size, 'units_per_case', p_units_per_case, 'bbl_per_unit', p_bbl_per_unit)
      || case when p_basis = 'poured' or p_brand is not null or p_ounces is not null
           then jsonb_build_object('brand', p_brand, 'ounces', p_ounces) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if p_id is null then
    insert into public.formats (brewery_id, name, basis, package_type, keg_size, units_per_case, bbl_per_unit, brand_id, ounces)
    values (p_brewery, p_name, p_basis, p_package_type, p_keg_size, p_units_per_case, p_bbl_per_unit, p_brand, p_ounces) returning * into v_row;
  else
    select * into v_row from public.formats where id = p_id and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'format not found'; end if;
    if v_row.basis = p_basis
       and (v_row.bbl_per_unit, v_row.units_per_case, v_row.ounces) is distinct from (p_bbl_per_unit, p_units_per_case, p_ounces)
       and (exists (select 1 from public.skus where format_id = p_id)
         or exists (select 1 from public.format_components where parent_format_id = p_id or child_format_id = p_id)
         or exists (select 1 from public.format_bom where format_id = p_id)
         or exists (select 1 from public.pos_item_mappings where format_id = p_id)
         or exists (select 1 from public.pos_menu_lines where format_id = p_id)
         or exists (select 1 from public.pos_catalog_ownership where format_id = p_id)
         or exists (select 1 from public.pos_sale_expectations where format_id = p_id)) then
      raise exception 'format is in use: its bbl per unit, units per case and ounces cannot change';
    end if;
    update public.formats set name = p_name, basis = p_basis, package_type = p_package_type, keg_size = p_keg_size,
      units_per_case = p_units_per_case, bbl_per_unit = p_bbl_per_unit, brand_id = p_brand, ounces = p_ounces
    where id = p_id returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

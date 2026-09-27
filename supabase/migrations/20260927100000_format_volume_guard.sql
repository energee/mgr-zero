-- #632: upsert_format overwrote bbl_per_unit, units_per_case and ounces with no
-- in-use check. The inventory ledger freezes barrels when a movement posts, but
-- planned packaging outputs, open-order barrel estimates, repack's
-- volume-neutrality check and poured-ounce math read these fields at read time,
-- so an edit reinterpreted quantities already recorded against the format.
-- A format in use now keeps them; a rename or other edit still saves.
-- "In use" was an inline list in private.guard_format_basis (#470). It moves
-- into two predicates so the basis lock and this volume lock read one list:
-- used as packaged is a SKU (order lines, packaging runs, stock and taps all
-- reach a format through one), a format component as parent or child, or a
-- format BOM; used as poured is a POS item mapping, menu line, catalog
-- ownership or sale expectation.
-- Not checked: channel_prices holds money per unit, not a quantity; private
-- square_publication_events is a history log beside pos_catalog_ownership.
-- A basis change is left to that trigger, so it keeps its own message.
-- upsert_format's body is the baseline definition with only the guard added;
-- the signature is the same, so create or replace keeps its grants.
create function private.format_used_as_packaged(p_format uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.skus where format_id = p_format)
    or exists (select 1 from public.format_components where parent_format_id = p_format or child_format_id = p_format)
    or exists (select 1 from public.format_bom where format_id = p_format)
$$;

create function private.format_used_as_poured(p_format uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.pos_item_mappings where format_id = p_format)
    or exists (select 1 from public.pos_menu_lines where format_id = p_format)
    or exists (select 1 from public.pos_catalog_ownership where format_id = p_format)
    or exists (select 1 from public.pos_sale_expectations where format_id = p_format)
$$;

revoke all on function private.format_used_as_packaged(uuid) from public, anon, authenticated, service_role;
revoke all on function private.format_used_as_poured(uuid) from public, anon, authenticated, service_role;

create or replace function private.guard_format_basis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.basis = 'poured' and old.basis <> new.basis and private.format_used_as_packaged(old.id) then
    raise exception 'a format in use by a SKU, component or BOM must stay packaged';
  end if;
  if new.basis = 'packaged' and old.basis <> new.basis and private.format_used_as_poured(old.id) then
    raise exception 'a format in use by a POS mapping, menu or sale must stay poured';
  end if;
  return new;
end $$;

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
       and (private.format_used_as_packaged(p_id) or private.format_used_as_poured(p_id)) then
      raise exception 'format is in use: its bbl per unit, units per case and ounces cannot change';
    end if;
    update public.formats set name = p_name, basis = p_basis, package_type = p_package_type, keg_size = p_keg_size,
      units_per_case = p_units_per_case, bbl_per_unit = p_bbl_per_unit, brand_id = p_brand, ounces = p_ounces
    where id = p_id returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

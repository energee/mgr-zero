-- Pallet fit (owner decision 2026-11-18): formats.pallet_fit is how many of a
-- package fill one pallet unit, a layer or a pallet, whichever way the brewery
-- loads. It is advisory: order screens show how full each unit is, and nothing
-- is enforced. Blank means no fit line for that package.
--
-- Only Admin sets it. upsert_format takes p_pallet_fit (null keeps it) and
-- p_clear_pallet_fit; either one asks for the Admin role on top of the
-- command's Admin/Sales check, so Sales still edits a format's other fields.
-- The keys join the request payload only when set, so earlier requests keep
-- their hash.
--
-- Buyers cannot read formats (#793), so portal_sku_price_rows now returns the
-- SKU's package facts and pallet fit beside its price. Only its return columns
-- change; the view over it is rebuilt to carry them.
--
-- Redefined functions start from their latest definition and keep all of it:
--   upsert_format         20260927110000_price_group_pours.sql
--   portal_sku_price_rows 20261009100000_portal_hide_internal_columns.sql

alter table public.formats add column pallet_fit integer check (pallet_fit > 0),
  add constraint formats_pallet_fit_packaged check (basis = 'packaged' or pallet_fit is null);

drop function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric);

create function public.upsert_format(
  p_brewery uuid, p_id uuid, p_name text, p_basis public.format_basis, p_package_type public.package_type,
  p_keg_size public.keg_size, p_units_per_case int, p_bbl_per_unit numeric, p_request_id uuid,
  p_price_group uuid default null, p_ounces numeric default null,
  p_pallet_fit int default null, p_clear_pallet_fit boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  -- Setting or clearing the pallet fit is Admin's alone.
  if p_pallet_fit is not null or p_clear_pallet_fit then
    perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'basis', p_basis, 'package_type', p_package_type,
                       'keg_size', p_keg_size, 'units_per_case', p_units_per_case, 'bbl_per_unit', p_bbl_per_unit)
      || case when p_basis = 'poured' or p_price_group is not null or p_ounces is not null
           then jsonb_build_object('price_group', p_price_group, 'ounces', p_ounces) else '{}'::jsonb end
      || case when p_pallet_fit is not null or p_clear_pallet_fit
           then jsonb_build_object('pallet_fit', p_pallet_fit, 'clear_pallet_fit', p_clear_pallet_fit) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if p_clear_pallet_fit and p_pallet_fit is not null then raise exception 'choose a pallet fit or clear it, not both'; end if;
  if p_id is null then
    insert into public.formats (brewery_id, name, basis, package_type, keg_size, units_per_case, bbl_per_unit, ounces, price_group_id, pallet_fit)
    values (p_brewery, p_name, p_basis, p_package_type, p_keg_size, p_units_per_case, p_bbl_per_unit, p_ounces, p_price_group, p_pallet_fit) returning * into v_row;
  else
    select * into v_row from public.formats where id = p_id and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'format not found'; end if;
    -- A pour's prices, menu lines and Square variations are filed under its group.
    if v_row.basis = 'poured' and p_basis = 'poured' and v_row.price_group_id is distinct from p_price_group then
      raise exception 'a pour cannot move to another price group';
    end if;
    -- #632's in-use volume lock (20260927100000), kept through this redefinition.
    if v_row.basis = p_basis
       and (v_row.bbl_per_unit, v_row.units_per_case, v_row.ounces) is distinct from (p_bbl_per_unit, p_units_per_case, p_ounces)
       and (private.format_used_as_packaged(p_id) or private.format_used_as_poured(p_id)) then
      raise exception 'format is in use: its bbl per unit, units per case and ounces cannot change';
    end if;
    update public.formats set name = p_name, basis = p_basis, package_type = p_package_type, keg_size = p_keg_size,
      units_per_case = p_units_per_case, bbl_per_unit = p_bbl_per_unit, ounces = p_ounces, price_group_id = p_price_group,
      pallet_fit = case when p_clear_pallet_fit then null else coalesce(p_pallet_fit, v_row.pallet_fit) end
    where id = p_id returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric, int, boolean) from public, anon, authenticated, service_role;
grant execute on function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric, int, boolean) to authenticated;

-- security-definer: justified — no customer SELECT on skus or formats (#788,
-- #793); returns only portal columns for my_customer_ids(). The package facts
-- and pallet fit are what order screens group lines by.
drop view public.portal_sku_prices;
drop function public.portal_sku_price_rows();
create function public.portal_sku_price_rows()
returns table (brewery_id uuid, sale_channel_id uuid, sku_id uuid, sku_name text, brand_name text, unit_price_cents integer,
  package_type public.package_type, keg_size public.keg_size, units_per_case integer, pallet_fit integer)
language sql stable security definer set search_path = '' as $$
  select p.brewery_id, p.sale_channel_id, p.sku_id, p.sku_name, p.brand_name, p.unit_price_cents,
    f.package_type, f.keg_size, f.units_per_case, f.pallet_fit
  from public.sku_prices p
  join public.skus s on s.id = p.sku_id and s.brewery_id = p.brewery_id
  join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
  where p.active
    and p.sale_channel_id in (select c.sale_channel_id from public.customers c
                              where c.id in (select public.my_customer_ids()));
$$;
comment on function public.portal_sku_price_rows() is
  'portal price projection; never add qbo mapping or keg pool columns';
revoke all on function public.portal_sku_price_rows() from public, anon;
grant execute on function public.portal_sku_price_rows() to authenticated;
create view public.portal_sku_prices with (security_invoker = true) as
  select * from public.portal_sku_price_rows();
grant select on public.portal_sku_prices to authenticated;

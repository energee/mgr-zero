-- Fit when mixed (owner decision 2026-11-20): formats.pallet_fit_mixed is how
-- many of a keg fill a tier that another keg size shares. Eight half kegs fill
-- a tier only in the tight single-size pattern; next to sixtels a tier holds
-- about six. The portal's pallet line and "Fill the pallet" count a shared
-- tier with it (lib/mgr/pallet-fit.ts). Blank reads as the pallet fit. It is
-- advisory, like pallet_fit: nothing is enforced.
--
-- Only Admin sets it. upsert_format takes p_pallet_fit_mixed: null keeps it, 0
-- clears it. The key joins the request payload only when set, so earlier
-- requests keep their hash. portal_sku_price_rows returns it beside pallet_fit;
-- only its return columns change, and the view over it is rebuilt.
--
-- Redefined functions start from their latest definition and keep all of it:
--   upsert_format         20261119150100_format_pallet_fit.sql
--   portal_sku_price_rows 20261119150200_portal_brand_alias.sql

-- Ships on pallets (owner decision 2026-11-20): a sale channel whose orders do
-- not ship on pallets, such as retail or direct to consumer, turns pallet advice
-- off for its portal buyers. portal_sku_price_rows then returns no pallet fit
-- for that channel, so the portal shows no pallet fit, pallet line or "Fill the
-- pallet". Staff order pages are not affected.
alter table public.sale_channels add column pallets boolean not null default true;

-- packaging_lb is what the package adds to the beer's weight (a keg shell, or
-- cans and cardboard); the portal adds the beer from the format's barrels.
alter table public.formats add column pallet_fit_mixed integer check (pallet_fit_mixed > 0),
  add column packaging_lb numeric not null default 0 check (packaging_lb >= 0),
  -- height_in is how tall one keg stands, or one case sits in a layer; blank adds no height.
  add column height_in numeric check (height_in > 0),
  add constraint formats_pallet_fit_mixed_packaged check (basis = 'packaged' or pallet_fit_mixed is null);

drop function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric, int, boolean);

create function public.upsert_format(
  p_brewery uuid, p_id uuid, p_name text, p_basis public.format_basis, p_package_type public.package_type,
  p_keg_size public.keg_size, p_units_per_case int, p_bbl_per_unit numeric, p_request_id uuid,
  p_price_group uuid default null, p_ounces numeric default null,
  p_pallet_fit int default null, p_clear_pallet_fit boolean default false, p_pallet_fit_mixed int default null,
  p_packaging_lb numeric default null, p_height_in numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  -- Setting or clearing either pallet fit, the packaging weight or the height is Admin's alone.
  if p_pallet_fit is not null or p_clear_pallet_fit or p_pallet_fit_mixed is not null or p_packaging_lb is not null or p_height_in is not null then
    perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'basis', p_basis, 'package_type', p_package_type,
                       'keg_size', p_keg_size, 'units_per_case', p_units_per_case, 'bbl_per_unit', p_bbl_per_unit)
      || case when p_basis = 'poured' or p_price_group is not null or p_ounces is not null
           then jsonb_build_object('price_group', p_price_group, 'ounces', p_ounces) else '{}'::jsonb end
      || case when p_pallet_fit is not null or p_clear_pallet_fit
           then jsonb_build_object('pallet_fit', p_pallet_fit, 'clear_pallet_fit', p_clear_pallet_fit) else '{}'::jsonb end
      || case when p_pallet_fit_mixed is not null
           then jsonb_build_object('pallet_fit_mixed', p_pallet_fit_mixed) else '{}'::jsonb end
      || case when p_packaging_lb is not null
           then jsonb_build_object('packaging_lb', p_packaging_lb) else '{}'::jsonb end
      || case when p_height_in is not null
           then jsonb_build_object('height_in', p_height_in) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if p_clear_pallet_fit and p_pallet_fit is not null then raise exception 'choose a pallet fit or clear it, not both'; end if;
  if p_pallet_fit_mixed < 0 then raise exception 'fit when mixed cannot be negative' using errcode = '22023'; end if;
  if p_height_in < 0 then raise exception 'height cannot be negative' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.formats (brewery_id, name, basis, package_type, keg_size, units_per_case, bbl_per_unit, ounces, price_group_id, pallet_fit, pallet_fit_mixed, packaging_lb, height_in)
    values (p_brewery, p_name, p_basis, p_package_type, p_keg_size, p_units_per_case, p_bbl_per_unit, p_ounces, p_price_group, p_pallet_fit, nullif(p_pallet_fit_mixed, 0), coalesce(p_packaging_lb, 0), nullif(p_height_in, 0)) returning * into v_row;
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
      -- A format changed to a pour keeps no pallet fit: only a packaged one may carry it.
      pallet_fit = case when p_clear_pallet_fit or p_basis = 'poured' then null else coalesce(p_pallet_fit, v_row.pallet_fit) end,
      pallet_fit_mixed = case when p_basis = 'poured' then null else nullif(coalesce(p_pallet_fit_mixed, v_row.pallet_fit_mixed), 0) end,
      packaging_lb = coalesce(p_packaging_lb, v_row.packaging_lb),
      height_in = nullif(coalesce(p_height_in, v_row.height_in), 0)
    where id = p_id returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric, int, boolean, int, numeric, numeric) from public, anon, authenticated, service_role;
grant execute on function public.upsert_format(uuid, uuid, text, public.format_basis, public.package_type, public.keg_size, int, numeric, uuid, uuid, numeric, int, boolean, int, numeric, numeric) to authenticated;

-- security-definer: justified — no customer SELECT on skus, brands or formats
-- (#788, #793); returns only portal columns for my_customer_ids().
drop view public.portal_sku_prices;
drop function public.portal_sku_price_rows();
create function public.portal_sku_price_rows()
returns table (brewery_id uuid, sale_channel_id uuid, sku_id uuid, sku_name text, brand_name text, unit_price_cents integer,
  package_type public.package_type, keg_size public.keg_size, units_per_case integer, pallet_fit integer,
  brand_alias text, format_name text, pallet_fit_mixed integer, bbl_per_unit numeric, packaging_lb numeric, height_in numeric)
language sql stable security definer set search_path = '' as $$
  select p.brewery_id, p.sale_channel_id, p.sku_id, p.sku_name, p.brand_name, p.unit_price_cents,
    f.package_type, f.keg_size, f.units_per_case, case when sc.pallets then f.pallet_fit end, b.alias, f.name,
    case when sc.pallets then f.pallet_fit_mixed end, fv.bbl_per_unit, f.packaging_lb, f.height_in
  from public.sku_prices p
  join public.skus s on s.id = p.sku_id and s.brewery_id = p.brewery_id
  join public.brands b on b.id = s.brand_id and b.brewery_id = s.brewery_id
  join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
  -- format_volumes, not formats: a format built from other packages has its barrels only there.
  join public.format_volumes fv on fv.id = f.id
  join public.sale_channels sc on sc.id = p.sale_channel_id and sc.brewery_id = p.brewery_id
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

-- Pallet rules (owner decision 2026-11-20): how the brewery stacks a pallet,
-- edited in Settings and read by the portal's pallet line and "Fill the
-- pallet" (lib/mgr/pallet-fit.ts). maxLb is the most a pallet carries;
-- maxHeightIn is the tallest a loaded pallet stands from the floor and
-- palletHeightIn the empty pallet's own height, so the difference is the room
-- for layers, each as tall as its format's height_in; kegLayers lists the ways
-- one keg layer loads, each a count per keg size
-- ({"half_bbl":6,"sixth_bbl":6}). A pallet carries at most two keg layers.
-- Advisory, like pallet_fit: nothing is enforced.
alter table public.breweries add column pallet_rules jsonb not null
  default '{"maxLb":2500,"maxHeightIn":60,"palletHeightIn":5.5,"kegLayers":[]}'
  check (jsonb_typeof(pallet_rules) = 'object' and jsonb_typeof(pallet_rules->'kegLayers') = 'array');

create function public.set_pallet_rules(p_brewery uuid, p_rules jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'set_pallet_rules', p_request_id, jsonb_build_object('rules', p_rules));
  if v_replay is not null then return v_replay; end if;
  update public.breweries set pallet_rules = p_rules where id = p_brewery;
  return private.complete_command_request(p_request_id, '{"ok":true}');
end $$;
revoke all on function public.set_pallet_rules(uuid, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_pallet_rules(uuid, jsonb, uuid) to authenticated;

-- The portal reads the rules for the caller's own customer.
-- security-definer: justified — no customer SELECT on breweries; returns one
-- advisory column for a customer in my_customer_ids().
create function public.portal_pallet_rules(p_customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select b.pallet_rules from public.customers c join public.breweries b on b.id = c.brewery_id
  where c.id = p_customer and c.id in (select public.my_customer_ids());
$$;
revoke all on function public.portal_pallet_rules(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_pallet_rules(uuid) to authenticated;

-- upsert_sale_channel takes p_pallets: omitted, a new channel ships on pallets
-- and an edit keeps its setting. The key joins the request payload only when
-- set, so earlier requests keep their hash. Copied from
-- 20261117190000_channel_one_way_keg_fee.sql; only p_pallets is new.
drop function public.upsert_sale_channel(uuid, uuid, text, public.tax_treatment, uuid, int);
create function public.upsert_sale_channel(
  p_brewery uuid, p_id uuid, p_name text, p_tax_treatment public.tax_treatment, p_request_id uuid,
  p_one_way_keg_fee_cents int default null, p_pallets boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb;
  v_row public.sale_channels;
  v_name text := private.js_btrim(p_name);
  v_constraint text;
  v_existing_name text;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_sale_channel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'tax_treatment', p_tax_treatment,
      'one_way_keg_fee_cents', p_one_way_keg_fee_cents)
      || case when p_pallets is not null then jsonb_build_object('pallets', p_pallets) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'Enter a channel name.'; end if;
  begin
    if p_id is null then
      insert into public.sale_channels (brewery_id, name, tax_treatment, one_way_keg_fee_cents, pallets)
        values (p_brewery, v_name, p_tax_treatment, coalesce(p_one_way_keg_fee_cents, 0), coalesce(p_pallets, true)) returning * into v_row;
    else
      select * into v_row from public.sale_channels where id = p_id and brewery_id = p_brewery;
      if not found then raise exception 'sale channel not found'; end if;
      update public.sale_channels set name = v_name, tax_treatment = p_tax_treatment,
          one_way_keg_fee_cents = coalesce(p_one_way_keg_fee_cents, one_way_keg_fee_cents),
          pallets = coalesce(p_pallets, pallets)
        where id = p_id and brewery_id = p_brewery returning * into v_row;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'sale_channels_brewery_name_normalized_uidx' then raise; end if;
    select private.js_btrim(name) into v_existing_name from public.sale_channels
      where brewery_id = p_brewery and lower(private.js_btrim(name)) = lower(v_name)
        and id is distinct from p_id;
    -- A concurrent delete may remove the winner after the index rejected us.
    raise exception 'A channel named % already exists.', coalesce(v_existing_name, v_name)
      using errcode = 'MGC01';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_sale_channel(uuid, uuid, text, public.tax_treatment, uuid, int, boolean) from public, anon, authenticated, service_role;
grant execute on function public.upsert_sale_channel(uuid, uuid, text, public.tax_treatment, uuid, int, boolean) to authenticated;

-- Copied from 20261117190000_channel_one_way_keg_fee.sql; only pallets is new.
create or replace function public.list_sale_channels(p_brewery uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales','warehouse']::public.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'tax_treatment', c.tax_treatment, 'system_code', c.system_code,
      'one_way_keg_fee_cents', c.one_way_keg_fee_cents, 'pallets', c.pallets,
      'in_use', exists (select 1 from public.inventory_movements r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.customers r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.orders r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.channel_prices r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.pos_menus r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
    ) order by c.name), '[]'::jsonb)
    from public.sale_channels c where c.brewery_id = p_brewery);
end $$;

-- #809: SKU pool selection configures deposits; source is derived, never chosen separately.
create function private.sku_keg_source(p_brewery uuid, p_format uuid, p_pool uuid)
returns public.keg_container_source language plpgsql set search_path = '' as $$
declare v_pool public.keg_pools; v_format public.formats;
begin
  if p_pool is null then return null; end if;
  select * into v_pool from public.keg_pools where id = p_pool and brewery_id = p_brewery for share;
  if v_pool.id is null then raise exception 'keg pool not found'; end if;
  if not v_pool.active then raise exception 'keg pool is out of service'; end if;
  select * into v_format from public.formats where id = p_format and brewery_id = p_brewery;
  if v_format.package_type is distinct from 'keg' or v_format.keg_size is null then
    raise exception 'a keg pool needs a keg format with a keg size';
  end if;
  return case v_pool.kind when 'pay_per_fill' then 'per_fill_rental'::public.keg_container_source else 'owned_fleet'::public.keg_container_source end;
end $$;
revoke all on function private.sku_keg_source(uuid,uuid,uuid) from public, anon, authenticated, service_role;
drop function public.create_sku(uuid,uuid,uuid,text,text,uuid);
drop function public.update_sku(uuid,uuid,boolean,text,uuid);
create function create_sku(
  p_brewery uuid, p_brand uuid, p_format uuid, p_name text, p_upc text, p_request_id uuid, p_keg_pool uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.skus; v_brand public.brands; v_format public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'create_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'brand', p_brand, 'format', p_format, 'name', p_name, 'upc', p_upc, 'keg_pool', p_keg_pool));
  if v_replay is not null then return v_replay; end if;
  select * into v_brand from public.brands where id = p_brand and brewery_id = p_brewery;
  select * into v_format from public.formats where id = p_format and brewery_id = p_brewery;
  if v_brand.id is null then raise exception 'brand not found'; end if;
  if v_format.id is null then raise exception 'format not found'; end if;
  if v_format.basis <> 'packaged' then raise exception 'a sku needs a packaged format; a poured format is never stock'; end if;
  if (select bbl_per_unit from public.format_volumes where id = p_format) is null then raise exception 'format has no volume yet: type bbl_per_unit or add components'; end if;
  insert into public.skus (brewery_id, brand_id, format_id, name, upc, keg_pool_id, container_source)
    values (p_brewery, p_brand, p_format, coalesce(nullif(trim(p_name), ''), v_brand.name || ' · ' || v_format.name), p_upc, p_keg_pool, private.sku_keg_source(p_brewery, p_format, p_keg_pool)) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- SKU identity is immutable here: deactivation never rewrites its history.
create function update_sku(
  p_brewery uuid, p_id uuid, p_active boolean, p_upc text, p_request_id uuid, p_keg_pool uuid default null, p_clear_keg_pool boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.skus;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'update_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'active', p_active, 'upc', p_upc, 'keg_pool', p_keg_pool, 'clear_keg_pool', p_clear_keg_pool));
  if v_replay is not null then return v_replay; end if;
  if p_active is null then raise exception 'active is required'; end if;
  select * into v_row from public.skus where id = p_id and brewery_id = p_brewery for update;
  if v_row.id is null then raise exception 'sku not found'; end if;
  if p_clear_keg_pool and p_keg_pool is not null then raise exception 'choose a keg pool or clear it, not both'; end if;
  -- Keeping an existing pool does not relink it when the fleet retires later.
  if p_keg_pool is distinct from v_row.keg_pool_id and p_keg_pool is not null then
    v_row.container_source := private.sku_keg_source(p_brewery, v_row.format_id, p_keg_pool);
    v_row.keg_pool_id := p_keg_pool;
  end if;
  if p_clear_keg_pool then v_row.keg_pool_id := null; v_row.container_source := null; end if;
  begin
    update public.skus set active = p_active, upc = p_upc,
      keg_pool_id = v_row.keg_pool_id, container_source = v_row.container_source
      where id = p_id and brewery_id = p_brewery returning * into v_row;
  exception when unique_violation then
    raise exception 'UPC is already assigned to another SKU; use a different UPC or clear it';
  end;
  if v_row.id is null then raise exception 'sku not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;


revoke all on function public.create_sku(uuid,uuid,uuid,text,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.create_sku(uuid,uuid,uuid,text,text,uuid,uuid) to authenticated;
grant execute on function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean) to authenticated;

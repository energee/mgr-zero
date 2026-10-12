-- CSV references accept existing UUIDs or exact names without changing raw replay identity.
create function private.import_ref(p_field text, p_value text, p_ids uuid[]) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  -- UUID cells retain their original path; the called write RPC enforces tenant references.
  if p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return p_value::uuid; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception '%: no match for "%"', p_field, p_value; end if;
  if array_length(p_ids, 1) > 1 then raise exception '%: "%" matches % records; use the ID', p_field, p_value, array_length(p_ids, 1); end if;
  return p_ids[1];
end $$;
revoke all on function private.import_ref(text, text, uuid[]) from public, anon, authenticated, service_role;

create or replace function public.import_csv_row(p_brewery uuid, p_request_id uuid, p_row_n integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_manifest jsonb; v_kind text; v_raw_row jsonb; v_row jsonb;
  v_required_field record; v_cell record; v_required text[]; v_allowed text[];
  v_id uuid; v_brand uuid; v_result jsonb; v_replay jsonb; v_request uuid;
  v_channel uuid; v_customer uuid; v_group uuid; v_format uuid; v_sku uuid; v_location uuid; v_bin uuid;
  -- Match JavaScript trim for reference boundaries, after claiming the unchanged raw row.
  v_reference_space constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  select result into v_manifest from private.command_requests
    where actor_id = auth.uid() and request_id = p_request_id and brewery_id = p_brewery and command_name = 'import_csv';
  if v_manifest is null then raise exception 'import manifest not found'; end if;
  if p_row_n is null or p_row_n < 0 or p_row_n >= jsonb_array_length(v_manifest->'rows') or p_row_n >= 5000 then raise exception 'invalid import row index'; end if;
  v_kind := v_manifest->>'kind'; v_raw_row := v_manifest->'rows'->p_row_n;
  v_request := private.import_request_id(p_request_id, p_row_n::text);
  v_replay := private.claim_command_request(p_brewery, 'import_csv_row', v_request, jsonb_build_object('parent', p_request_id, 'row_n', p_row_n, 'kind', v_kind, 'row', v_raw_row));
  if v_replay is not null then return v_replay; end if;
  -- Only this inner subtransaction catches row failures: any new brand/style,
  -- child ledger entry, and SKU are rolled back together. Siblings live in other calls.
  begin
    v_required := case v_kind
      when 'customers' then array['name','type','state','saleChannelId']
      when 'ship_tos' then array['customerId','label','address1','city','state','zip']
      when 'products_skus' then array['product','formatId']
      when 'channel_prices' then array['saleChannelId','priceGroupId','formatId','unitPriceCents']
      when 'opening_balances' then array['skuId','locationId','binId','qty'] end;
    if v_required is null then raise exception 'invalid import kind'; end if;
    v_allowed := v_required || case v_kind
      when 'customers' then array['licenseNumber','paymentTerms']
      when 'ship_tos' then array['address2']
      when 'products_skus' then array['sku_name','style','abv','upc']
      when 'opening_balances' then array['note'] else array[]::text[] end;
    for v_required_field in select unnest(v_required) as name loop
      if nullif(btrim(v_raw_row->>v_required_field.name), '') is null then raise exception '% is required', v_required_field.name; end if;
    end loop;
    for v_cell in select key, btrim(value) as value from jsonb_each_text(v_raw_row) loop
      if not v_cell.key = any(v_allowed) then raise exception 'unknown CSV field %', v_cell.key; end if;
      if v_cell.value = '' then continue; end if;
      if v_cell.key = 'state' and v_cell.value !~ '^[A-Z]{2}$' then raise exception 'state must be two uppercase letters'; end if;
      if v_cell.key in ('qty','abv','unitPriceCents') then
        if v_cell.value !~ '^[+-]?[0-9]+(\.[0-9]+)?$' then raise exception '% must be a decimal', v_cell.key; end if;
        if v_cell.key = 'qty' and v_cell.value::numeric <= 0 then raise exception 'qty must be positive'; end if;
        if v_cell.key = 'unitPriceCents' and (v_cell.value !~ '^[0-9]+$' or v_cell.value::numeric > 2147483647) then raise exception 'unitPriceCents must be whole cents (0–2147483647)'; end if;
      end if;
    end loop;
    -- Normalize a separate write row; replay above always uses the untouched manifest row.
    select jsonb_object_agg(key, nullif(case when key like '%Id'
      then btrim(value, v_reference_space) else btrim(value) end, '')) into v_row from jsonb_each_text(v_raw_row);
    v_id := private.import_request_id(v_request, 'write');
    -- Resolve references inside this brewery, then reuse each kind's existing write RPC.
    case v_kind
      when 'customers' then
        v_channel := private.import_ref('saleChannelId', v_row->>'saleChannelId', array(select id from public.sale_channels where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'saleChannelId')));
        v_result := public.upsert_customer(p_brewery, null, v_row->>'name', (v_row->>'type')::public.customer_type, v_row->>'state', v_channel, v_row->>'licenseNumber', v_row->>'paymentTerms', null, v_id);
      when 'ship_tos' then
        v_customer := private.import_ref('customerId', v_row->>'customerId', array(select id from public.customers where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'customerId')));
        v_result := public.upsert_ship_to(p_brewery, null, v_customer, v_row->>'label', v_row->>'address1', v_row->>'address2', v_row->>'city', v_row->>'state', v_row->>'zip', v_id);
      when 'products_skus' then
        v_format := private.import_ref('formatId', v_row->>'formatId', array(select id from public.formats where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'formatId') and basis = 'packaged'));
        -- Existing brands are reused without replacing their metadata. An
        -- advisory lock serializes same-name creation across simultaneous rows.
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_brewery::text || ':' || (v_row->>'product'), 0));
        select id into v_brand from public.brands where brewery_id = p_brewery and name = v_row->>'product';
        if v_brand is null then
          v_result := public.upsert_brand(p_brewery, null, v_row->>'product', v_row->>'style', (v_row->>'abv')::numeric, null, null, null, null, private.import_request_id(v_request, 'brand'));
          v_brand := (v_result->>'id')::uuid;
        end if;
        v_result := public.create_sku(p_brewery, v_brand, v_format, v_row->>'sku_name', v_row->>'upc', v_id);
      when 'channel_prices' then
        -- Resolve the group before formats: pour names can repeat across groups.
        v_channel := private.import_ref('saleChannelId', v_row->>'saleChannelId', array(select id from public.sale_channels where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'saleChannelId')));
        v_group := private.import_ref('priceGroupId', v_row->>'priceGroupId', array(select id from public.price_groups where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'priceGroupId')));
        v_format := private.import_ref('formatId', v_row->>'formatId', array(select id from public.formats where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'formatId') and (basis = 'packaged' or price_group_id = v_group)));
        v_result := public.set_channel_price(p_brewery, v_channel, v_group, v_format, (v_row->>'unitPriceCents')::integer, v_id);
      when 'opening_balances' then
        -- Resolve the location before its bin; bin names are local to a location.
        v_sku := private.import_ref('skuId', v_row->>'skuId', array(select id from public.skus where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'skuId')));
        v_location := private.import_ref('locationId', v_row->>'locationId', array(select id from public.locations where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'locationId')));
        v_bin := private.import_ref('binId', v_row->>'binId', array(select id from public.bins where brewery_id = p_brewery and lower(btrim(name, v_reference_space)) = lower(v_row->>'binId') and location_id = v_location));
        v_result := public.record_inventory_movement(p_brewery, v_sku, v_location, v_bin, (v_row->>'qty')::numeric, 'opening_balance', null, null, v_row->>'note', v_id);
    end case;
    v_result := jsonb_build_object('status', 'committed', 'result', v_result);
  -- Nested tenant-reference refusals are row failures too. Actor/admin and
  -- manifest checks above remain outside this catch and deny the whole call.
  exception when sqlstate 'P0001' or insufficient_privilege or integrity_constraint_violation or data_exception then
    v_result := jsonb_build_object('status', 'blocked', 'error', SQLERRM);
  end;
  -- Failed rows also have durable results. Corrected input starts a new batch
  -- containing ONLY blocked rows; transport retries always use the old manifest.
  return private.complete_command_request(v_request, v_result);
end $$;

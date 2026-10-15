-- Customer country and alias (docs/plans/lolev-orders.md, task 1).
-- Every customer and ship-to has a country, an ISO 3166-1 alpha-2 code,
-- default US. A US one keeps its required state; any other country has none.
-- Street, city and zip are optional, so an export customer can be entered
-- before its address is known. A customer has one optional staff-only alias,
-- like brands.alias (20261014100500_brand_alias.sql). Customers already have
-- no portal policy (20261012100800), and portal_customer_rows projects only
-- id, brewery, name and channel, so the alias never reaches a buyer.

alter table public.customers
  add column alias text check (alias is null or length(trim(alias)) > 0),
  add column country text not null default 'US' check (country ~ '^[A-Z]{2}$');
alter table public.customers alter column state drop not null;
-- Replaces the baseline's inline check, which Postgres named customers_state_check.
alter table public.customers drop constraint customers_state_check;
alter table public.customers add constraint customers_state_by_country
  check ((country = 'US') = (state is not null and state ~ '^[A-Z]{2}$'));

alter table public.ship_tos
  add column country text not null default 'US' check (country ~ '^[A-Z]{2}$'),
  alter column address1 drop not null, alter column city drop not null,
  alter column zip drop not null, alter column state drop not null;
alter table public.ship_tos drop constraint ship_tos_state_check;
alter table public.ship_tos add constraint ship_tos_state_by_country
  check ((country = 'US') = (state is not null and state ~ '^[A-Z]{2}$'));

-- upsert_customer and upsert_ship_to replace every field, so they take the
-- country (and the customer its alias) like the rest. The trailing defaults
-- keep every positional caller valid. A new key joins the claim payload only
-- when it differs from its default, so requests completed before this keep
-- their hash and replay.
-- Copied from: 20260926000000_customer_payment_terms.sql; only alias/country is new.
drop function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid);
create function public.upsert_customer(
  p_brewery uuid, p_id uuid, p_name text, p_type public.customer_type, p_state text,
  p_sale_channel uuid, p_license_no text, p_payment_terms text, p_tax_treatment public.tax_treatment, p_request_id uuid,
  p_alias text default null, p_country text default 'US'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.customers; v_terms text := nullif(btrim(p_payment_terms), ''); v_payload jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'type', p_type, 'state', p_state, 'sale_channel', p_sale_channel, 'license_no', p_license_no, 'payment_terms', p_payment_terms, 'tax_treatment', p_tax_treatment);
  if p_alias is not null then v_payload := v_payload || jsonb_build_object('alias', p_alias); end if;
  if p_country is distinct from 'US' then v_payload := v_payload || jsonb_build_object('country', p_country); end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_customer', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  if p_sale_channel is null then raise exception 'customer needs a sale channel' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.customers (brewery_id, name, type, state, sale_channel_id, license_no, payment_terms, tax_treatment, alias, country)
      values (p_brewery, p_name, p_type, p_state, p_sale_channel, p_license_no, coalesce(v_terms, 'net30'), p_tax_treatment, p_alias, p_country) returning * into v_row;
  else
    update public.customers set name = p_name, type = p_type, state = p_state, sale_channel_id = p_sale_channel,
      license_no = p_license_no, payment_terms = coalesce(v_terms, payment_terms), tax_treatment = p_tax_treatment,
      alias = p_alias, country = p_country
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'customer not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text) to authenticated;

-- Copied from: 00001_baseline.sql; only country is new.
drop function public.upsert_ship_to(uuid, uuid, uuid, text, text, text, text, text, text, uuid, boolean);
create function public.upsert_ship_to(
  p_brewery uuid, p_id uuid, p_customer uuid, p_label text, p_address1 text, p_address2 text,
  p_city text, p_state text, p_zip text, p_request_id uuid, p_is_default boolean default null,
  p_country text default 'US'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.ship_tos; v_payload jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery', p_brewery, 'id', p_id, 'customer', p_customer, 'label', p_label, 'address1', p_address1, 'address2', p_address2, 'city', p_city, 'state', p_state, 'zip', p_zip, 'is_default', p_is_default);
  if p_country is distinct from 'US' then v_payload := v_payload || jsonb_build_object('country', p_country); end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_ship_to', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  -- Serialize all address edits for this customer, including default switches.
  perform 1 from public.customers where id = p_customer and brewery_id = p_brewery for update;
  if not found then raise exception 'customer not found'; end if;
  if p_id is not null and not exists (
    select 1 from public.ship_tos where id = p_id and brewery_id = p_brewery and customer_id = p_customer
  ) then raise exception 'ship-to not found for this customer'; end if;
  if p_is_default is true then
    update public.ship_tos set is_default = false
      where brewery_id = p_brewery and customer_id = p_customer and is_default and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.ship_tos (brewery_id, customer_id, label, address1, address2, city, state, zip, is_default, country)
      values (p_brewery, p_customer, p_label, p_address1, p_address2, p_city, p_state, p_zip, coalesce(p_is_default, false), p_country) returning * into v_row;
  else
    update public.ship_tos set label = p_label, address1 = p_address1,
      address2 = p_address2, city = p_city, state = p_state, zip = p_zip, is_default = coalesce(p_is_default, is_default),
      country = p_country
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'ship-to not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_ship_to(uuid, uuid, uuid, text, text, text, text, text, text, uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_ship_to(uuid, uuid, uuid, text, text, text, text, text, text, uuid, boolean, text) to authenticated;

-- A CSV customer may name a country and an alias, a ship-to a country. The
-- state is required only when the country is US, which is the default when
-- the column is absent or blank; street, city and zip are optional outside
-- the US. Everything else is as before.
-- Copied from: 20261012100700_import_resolve_names.sql; only country/alias is new.
create or replace function public.import_csv_row(p_brewery uuid, p_request_id uuid, p_row_n integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_manifest jsonb; v_kind text; v_raw_row jsonb; v_row jsonb;
  v_required_field record; v_cell record; v_required text[]; v_allowed text[];
  v_id uuid; v_brand uuid; v_result jsonb; v_replay jsonb; v_request uuid;
  v_channel uuid; v_customer uuid; v_group uuid; v_format uuid; v_sku uuid; v_location uuid; v_bin uuid;
  v_us boolean;
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
    v_us := coalesce(nullif(btrim(v_raw_row->>'country'), ''), 'US') = 'US';
    v_required := case v_kind
      when 'customers' then array['name','type','saleChannelId'] || case when v_us then array['state'] else array[]::text[] end
      when 'ship_tos' then array['customerId','label'] || case when v_us then array['address1','city','state','zip'] else array[]::text[] end
      when 'products_skus' then array['product','formatId']
      when 'channel_prices' then array['saleChannelId','priceGroupId','formatId','unitPriceCents']
      when 'opening_balances' then array['skuId','locationId','binId','qty'] end;
    if v_required is null then raise exception 'invalid import kind'; end if;
    v_allowed := v_required || case v_kind
      when 'customers' then array['state','licenseNumber','paymentTerms','country','alias']
      when 'ship_tos' then array['address1','city','state','zip','address2','country']
      when 'products_skus' then array['sku_name','style','abv','upc']
      when 'opening_balances' then array['note'] else array[]::text[] end;
    for v_required_field in select unnest(v_required) as name loop
      if nullif(btrim(v_raw_row->>v_required_field.name), '') is null then raise exception '% is required', v_required_field.name; end if;
    end loop;
    for v_cell in select key, btrim(value) as value from jsonb_each_text(v_raw_row) loop
      if not v_cell.key = any(v_allowed) then raise exception 'unknown CSV field %', v_cell.key; end if;
      if v_cell.value = '' then continue; end if;
      if v_cell.key = 'state' and v_cell.value !~ '^[A-Z]{2}$' then raise exception 'state must be two uppercase letters'; end if;
      if v_cell.key = 'country' and v_cell.value !~ '^[A-Z]{2}$' then raise exception 'country must be two uppercase letters'; end if;
      if v_cell.key in ('qty','abv','unitPriceCents') then
        if v_cell.value !~ '^[+-]?[0-9]+(\.[0-9]+)?$' then raise exception '% must be a decimal', v_cell.key; end if;
        if v_cell.key = 'qty' and v_cell.value::numeric <= 0 then raise exception 'qty must be positive'; end if;
        if v_cell.key = 'unitPriceCents' and (v_cell.value !~ '^[0-9]+$' or v_cell.value::numeric > 2147483647) then raise exception 'unitPriceCents must be whole cents (0–2147483647)'; end if;
      end if;
    end loop;
    -- Normalize a separate write row; replay above always uses the untouched manifest row.
    select jsonb_object_agg(key, nullif(case when key like '%Id'
      then private.js_btrim(value) else btrim(value) end, '')) into v_row from jsonb_each_text(v_raw_row);
    v_id := private.import_request_id(v_request, 'write');
    -- Resolve references inside this brewery, then reuse each kind's existing write RPC.
    case v_kind
      when 'customers' then
        v_channel := private.import_ref('saleChannelId', v_row->>'saleChannelId', p_brewery, 'sale_channels');
        v_result := public.upsert_customer(p_brewery, null, v_row->>'name', (v_row->>'type')::public.customer_type, v_row->>'state', v_channel, v_row->>'licenseNumber', v_row->>'paymentTerms', null, v_id,
          v_row->>'alias', coalesce(v_row->>'country', 'US'));
      when 'ship_tos' then
        v_customer := private.import_ref('customerId', v_row->>'customerId', p_brewery, 'customers');
        v_result := public.upsert_ship_to(p_brewery, null, v_customer, v_row->>'label', v_row->>'address1', v_row->>'address2', v_row->>'city', v_row->>'state', v_row->>'zip', v_id,
          null, coalesce(v_row->>'country', 'US'));
      when 'products_skus' then
        v_format := private.import_ref('formatId', v_row->>'formatId', p_brewery, 'formats', $s$basis = 'packaged'$s$);
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
        v_channel := private.import_ref('saleChannelId', v_row->>'saleChannelId', p_brewery, 'sale_channels');
        v_group := private.import_ref('priceGroupId', v_row->>'priceGroupId', p_brewery, 'price_groups');
        v_format := private.import_ref('formatId', v_row->>'formatId', p_brewery, 'formats', $s$basis = 'packaged' or price_group_id = $3$s$, v_group);
        v_result := public.set_channel_price(p_brewery, v_channel, v_group, v_format, (v_row->>'unitPriceCents')::integer, v_id);
      when 'opening_balances' then
        -- Resolve the location before its bin; bin names are local to a location.
        v_sku := private.import_ref('skuId', v_row->>'skuId', p_brewery, 'skus');
        v_location := private.import_ref('locationId', v_row->>'locationId', p_brewery, 'locations');
        v_bin := private.import_ref('binId', v_row->>'binId', p_brewery, 'bins', 'location_id = $3', v_location);
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

-- The QuickBooks invoice's BillAddr names the ship-to's country (Country).
-- A foreign ship-to has no state, street, city or zip, and jsonb_strip_nulls
-- already drops each null key, so CountrySubDivisionCode is left out for it.
-- A pending push replays its frozen body, so this changes only new pushes.
-- Copied from: 20261015120000_null_safe_role_guards.sql; only the address country is new.
CREATE OR REPLACE FUNCTION public.start_qbo_push(p_brewery uuid, p_invoice uuid, p_new_attempt_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv public.invoices; v_conn public.qbo_connections; v_customer public.customers;
  v_push public.qbo_pushes; v_previous public.qbo_pushes; v_ship public.ship_tos;
  v_replay jsonb; v_result jsonb; v_lines jsonb; v_snapshot_lines jsonb;
  v_body jsonb; v_address jsonb; v_email text; v_key uuid; v_reason text;
  v_invalid int; v_unmapped int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if p_new_attempt_reason is not null and p_new_attempt_reason not in ('corrected','remote_deleted') then raise exception 'invalid QuickBooks attempt reason'; end if;

  v_replay:=private.claim_command_request(p_brewery,'push_invoice_to_qbo',p_request_id,
    jsonb_strip_nulls(jsonb_build_object('invoiceId',p_invoice,'newAttemptReason',p_new_attempt_reason)));
  if v_replay is not null then
    select * into v_push from public.qbo_pushes
      where id=nullif(v_replay->>'pushId','')::uuid and brewery_id=p_brewery and invoice_id=p_invoice for update;
    if found and v_push.status<>'pending' then
      return jsonb_strip_nulls(jsonb_build_object('pushId',v_push.id,'status',v_push.status,
        'remoteId',v_push.qbo_entity_id,'error',v_push.error,'alreadyFinished',true));
    end if;
  end if;

  select * into v_conn from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if not found then raise exception 'QuickBooks connection required'; end if;
  select * into v_inv from public.invoices where id=p_invoice and brewery_id=p_brewery for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.written_off_at is not null then raise exception 'written-off invoice cannot be pushed'; end if;
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_push from public.qbo_pushes where invoice_id=p_invoice and status='pending' order by created_at desc,id desc limit 1;
  if found then
    if v_push.connection_id<>v_conn.id or v_push.realm_id<>v_conn.realm_id then
      raise exception 'QuickBooks connection changed; pending push remains frozen and cannot be retargeted' using errcode='MG409';
    end if;
    v_result:=jsonb_build_object('pushId',v_push.id,'providerRequestId',v_push.provider_request_id,
      'finishRequestId',v_push.finish_request_id,'requestBody',v_push.request_body,'entityType',v_push.entity_type,
      'realmId',v_push.realm_id,'connectionId',v_push.connection_id,'status',v_push.status);
    return private.complete_command_request(p_request_id,v_result);
  end if;

  select * into v_previous from public.qbo_pushes where invoice_id=p_invoice order by created_at desc,id desc limit 1;
  if p_new_attempt_reason='corrected' and (v_previous.id is null or v_previous.status<>'push_failed') then
    raise exception 'a corrected QuickBooks attempt requires a definitive rejected push';
  elsif p_new_attempt_reason='remote_deleted' and (v_inv.qbo_invoice_id is null or v_inv.qbo_remote_state<>'deleted') then
    raise exception 'deleted QuickBooks document recreation is not available';
  elsif p_new_attempt_reason is null and v_previous.status='push_failed' then
    raise exception 'choose corrected after fixing the QuickBooks mapping';
  elsif p_new_attempt_reason is null and v_inv.qbo_invoice_id is not null then
    v_result:=jsonb_build_object('status','pushed','remoteId',v_inv.qbo_invoice_id,'alreadyPushed',true);
    return private.complete_command_request(p_request_id,v_result);
  end if;

  select * into v_customer from public.customers where id=v_inv.customer_id and brewery_id=p_brewery;
  if nullif(v_customer.qbo_customer_id,'') is null or v_customer.qbo_realm_id is distinct from v_conn.realm_id then
    raise exception 'QuickBooks customer mapping required';
  end if;
  select st.* into v_ship from public.shipments sh
    join public.orders o on o.id=sh.order_id and o.brewery_id=sh.brewery_id
    join public.ship_tos st on st.id=o.ship_to_id and st.brewery_id=o.brewery_id
    where sh.id=v_inv.shipment_id and sh.brewery_id=p_brewery;
  if not found then
    select * into v_ship from public.ship_tos where customer_id=v_inv.customer_id and brewery_id=p_brewery and is_default limit 1;
  end if;
  if v_ship.id is not null then
    v_address:=jsonb_strip_nulls(jsonb_build_object('Line1',v_ship.address1,'Line2',v_ship.address2,
      'City',v_ship.city,'CountrySubDivisionCode',v_ship.state,'PostalCode',v_ship.zip,'Country',v_ship.country));
  end if;
  select min(u.email::text) into v_email from public.customer_users cu join auth.users u on u.id=cu.user_id
    where cu.customer_id=v_inv.customer_id;

  select count(*) filter(where
      (v_inv.kind='invoice' and (il.kind not in ('sku','keg_deposit') or il.qty<=0 or il.unit_price_cents<0 or il.amount_cents<0))
      or (v_inv.kind='credit_memo' and (il.kind not in ('sku','keg_deposit_refund') or il.qty>=0 or il.unit_price_cents<0 or il.amount_cents>=0))),
    count(*) filter(where
      (il.kind='sku' and (s.qbo_item_id is null or s.qbo_realm_id is distinct from v_conn.realm_id))
      or (il.kind in ('keg_deposit','keg_deposit_refund') and v_conn.qbo_deposit_item_id is null))
    into v_invalid,v_unmapped
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;
  if not exists(select 1 from public.invoice_lines where invoice_id=p_invoice and brewery_id=p_brewery) then raise exception 'invoice lines required'; end if;
  if v_invalid>0 then raise exception 'QuickBooks does not support this invoice line shape'; end if;
  if v_unmapped>0 then
    if exists(select 1 from public.invoice_lines where invoice_id=p_invoice and kind in ('keg_deposit','keg_deposit_refund')) and v_conn.qbo_deposit_item_id is null
      then raise exception 'QuickBooks deposit item mapping required'; end if;
    raise exception 'QuickBooks item mapping required';
  end if;

  select jsonb_agg(jsonb_build_object(
      'Amount',round((case when v_inv.kind='credit_memo' then -il.amount_cents else il.amount_cents end)::numeric/100,2),
      'Description',il.description,
      'DetailType','SalesItemLineDetail',
      'SalesItemLineDetail',jsonb_build_object(
        'ItemRef',jsonb_build_object('value',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id else s.qbo_item_id end),
        'Qty',case when v_inv.kind='credit_memo' then -il.qty else il.qty end,
        'UnitPrice',round(il.unit_price_cents::numeric/100,2))) order by il.id),
    jsonb_agg(jsonb_build_object('id',il.id,'kind',il.kind,'skuId',il.sku_id,'qty',il.qty,
      'unitPriceCents',il.unit_price_cents,'amountCents',il.amount_cents,
      'qboItemId',case when il.kind in ('keg_deposit','keg_deposit_refund') then v_conn.qbo_deposit_item_id else s.qbo_item_id end) order by il.id)
    into v_lines,v_snapshot_lines
  from public.invoice_lines il left join public.skus s on s.id=il.sku_id and s.brewery_id=il.brewery_id
  where il.invoice_id=p_invoice and il.brewery_id=p_brewery;

  v_body:=jsonb_strip_nulls(jsonb_build_object(
    'CustomerRef',jsonb_build_object('value',v_customer.qbo_customer_id),
    'DocNumber',v_inv.invoice_no::text,'TxnDate',v_inv.issued_on,
    'DueDate',case when v_inv.kind='invoice' then v_inv.due_on end,
    'AllowOnlineACHPayment',case when v_inv.kind='invoice' then v_conn.allow_online_ach_payment end,
    'AllowOnlineCreditCardPayment',case when v_inv.kind='invoice' then v_conn.allow_online_credit_card_payment end,
    'BillAddr',v_address,'BillEmail',case when v_email is null then null else jsonb_build_object('Address',v_email) end,
    'Line',v_lines));
  v_reason:=coalesce(p_new_attempt_reason,'initial');
  v_key:=case when v_previous.id is null and p_new_attempt_reason is null then v_inv.qbo_idempotency_key else private.new_uuid() end;
  if v_key is distinct from v_inv.qbo_idempotency_key then update public.invoices set qbo_idempotency_key=v_key where id=p_invoice; end if;
  insert into public.qbo_pushes(brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
    request_body,local_snapshot,attempt_reason,supersedes_push_id)
  values(p_brewery,p_invoice,v_conn.id,v_conn.realm_id,case when v_inv.kind='credit_memo' then 'CreditMemo' else 'Invoice' end,
    v_key,v_body::text,jsonb_build_object('invoice',jsonb_build_object('id',v_inv.id,'kind',v_inv.kind,'invoiceNo',v_inv.invoice_no,
      'issuedOn',v_inv.issued_on,'dueOn',v_inv.due_on,'customerId',v_inv.customer_id,'qboCustomerId',v_customer.qbo_customer_id,
      'address',v_address,'email',v_email),'lines',v_snapshot_lines),v_reason,v_previous.id)
  returning * into v_push;
  update public.invoices set qbo_sync_status='pending',qbo_sync_error=null where id=p_invoice;
  v_result:=jsonb_build_object('pushId',v_push.id,'providerRequestId',v_push.provider_request_id,
    'finishRequestId',v_push.finish_request_id,'requestBody',v_push.request_body,'entityType',v_push.entity_type,
    'realmId',v_push.realm_id,'connectionId',v_push.connection_id,'status',v_push.status);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

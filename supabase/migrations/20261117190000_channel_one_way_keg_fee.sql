-- The one-way keg fee moves from the brewery to the sale channel, and is set
-- when a line is added rather than at submit.
-- A one-way keg is a keg format whose SKU has no container source. A wholesale
-- order line for one takes its order's channel fee when the line is inserted,
-- drafts included, and keeps it: a later channel fee change never reprices it.
-- ship_order_impl and confirm_delivery still bill order_lines.one_way_fee_cents.

alter table public.sale_channels add column one_way_keg_fee_cents int not null default 0
  check (one_way_keg_fee_cents >= 0);
comment on column public.sale_channels.one_way_keg_fee_cents is
  'Fee per one-way keg on this channel''s wholesale orders; 0 bills none.';

-- Only export orders ship one-way kegs; the taproom builds the fee into its price.
update public.sale_channels c set one_way_keg_fee_cents = b.one_way_keg_fee_cents
  from public.breweries b where b.id = c.brewery_id and c.tax_treatment = 'export';

-- Every order_lines insert (create, draft edit, adjust, historical import)
-- passes through here, so no writer can skip the fee. An adjust that upserts an
-- existing line keeps that line's fee: on conflict updates only named columns.
create function private.set_line_one_way_fee() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.one_way_fee_cents := (
    select nullif(c.one_way_keg_fee_cents, 0)
    from public.orders o
    join public.sale_channels c on c.id = o.sale_channel_id and c.brewery_id = o.brewery_id
    join public.skus s on s.id = new.sku_id and s.brewery_id = o.brewery_id
    join public.formats f on f.id = s.format_id and f.brewery_id = o.brewery_id
    where o.id = new.order_id and o.kind = 'wholesale'
      and f.package_type = 'keg' and s.container_source is null);
  return new;
end $$;
revoke all on function private.set_line_one_way_fee() from public, anon, authenticated, service_role;
create trigger order_lines_one_way_fee before insert on public.order_lines
  for each row execute function private.set_line_one_way_fee();

-- Fill in lines that have no fee yet: open orders not yet submitted, and shipped
-- history (the Lolev import inserted shipped orders directly). Issued invoices
-- are left alone. A fee already captured at submit, zero included, stays.
update public.order_lines ol set one_way_fee_cents = nullif(c.one_way_keg_fee_cents, 0)
  from public.orders o, public.sale_channels c, public.skus s, public.formats f
 where o.id = ol.order_id and o.brewery_id = ol.brewery_id and o.kind = 'wholesale'
   and c.id = o.sale_channel_id and c.brewery_id = o.brewery_id
   and s.id = ol.sku_id and s.brewery_id = ol.brewery_id
   and f.id = s.format_id and f.brewery_id = s.brewery_id
   and f.package_type = 'keg' and s.container_source is null
   and ol.one_way_fee_cents is null
   and (o.status = 'shipped' or (o.status <> 'cancelled' and not ol.one_way_fee_captured));

-- Copied from 20261030002000_ledger_compliance_integrity.sql; the fee capture
-- moved to the insert trigger above, so only the deposit lines remain.
create or replace function private.ensure_order_deposit_lines(o public.orders) returns void
language plpgsql set search_path = '' as $$
declare r record;
begin
  if o.kind <> 'wholesale' then return; end if;
  for r in
    select ol.id as line_id, ol.qty_ordered, f.package_type, f.keg_size, k.id as pool_id, k.name, k.deposit_cents
    from public.order_lines ol
    join public.skus s on s.id = ol.sku_id and s.brewery_id = o.brewery_id
    join public.formats f on f.id = s.format_id and f.brewery_id = o.brewery_id
    left join public.keg_pools k on k.id = s.keg_pool_id and k.brewery_id = o.brewery_id
    where ol.order_id = o.id and s.container_source in ('owned_fleet','per_fill_rental')
      and not exists (select 1 from public.order_deposit_lines d where d.order_line_id = ol.id)
  loop
    if r.package_type is distinct from 'keg' or r.keg_size is null or r.pool_id is null then
      raise exception 'returnable keg deposit is not configured';
    end if;
    if r.deposit_cents > 0 then
      insert into public.order_deposit_lines (brewery_id, order_id, order_line_id, keg_pool_id, keg_size, description, qty_ordered, unit_price_cents)
      values (o.brewery_id, o.id, r.line_id, r.pool_id, r.keg_size, r.name || ' deposit', r.qty_ordered, r.deposit_cents);
    end if;
  end loop;
end $$;

-- The trigger sets the fee once, at insert, so the capture flag has no reader.
alter table public.order_lines drop column one_way_fee_captured;

-- Copied from 20261016130000_one_way_fee_at_submit.sql; only the fee source
-- (the customer's channel, not the brewery) is new.
CREATE OR REPLACE FUNCTION private.portal_quote_snapshot(p_brewery uuid, p_customer uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_customer public.customers; v_ship public.ship_tos; v_source public.locations;
  v_lines jsonb; v_deposits jsonb; v_subtotal bigint; v_deposit bigint; v_fees jsonb; v_fee bigint;
begin
  perform private.assert_order_lines(p_lines);
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where jsonb_typeof(e)<>'object' or not (e ?& array['sku_id','qty'])
      or (select count(*) from jsonb_object_keys(e))<>2
      or jsonb_typeof(e->'sku_id')<>'string' or jsonb_typeof(e->'qty')<>'number'
      or (e->>'qty')::numeric<=0 or (e->>'qty')::numeric<>trunc((e->>'qty')::numeric)
  ) then raise exception 'quote lines require a SKU and positive whole quantity'; end if;
  if (select count(distinct (e->>'sku_id')::uuid) from jsonb_array_elements(p_lines) e)<>jsonb_array_length(p_lines) then
    raise exception 'duplicate quote line';
  end if;
  select * into v_customer from public.customers where id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'customer not found'; end if;
  select * into v_ship from public.ship_tos where id=p_ship_to and customer_id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'ship-to not found'; end if;
  select l.* into v_source from public.breweries b join public.locations l
    on l.id=b.portal_fulfillment_location_id and l.brewery_id=b.id
    where b.id=p_brewery and 'warehouse' = any(l.uses);
  if not found then raise exception 'portal fulfillment source is not configured'; end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), resolved as (
    select r.sku_id,r.qty,p.sku_name,p.brand_name,p.unit_price_cents,
      (r.qty*p.unit_price_cents)::bigint amount_cents,s.qbo_item_id,s.qbo_realm_id,
      k.id pool_id,k.name pool_name,f.keg_size,k.deposit_cents
    from requested r
    join public.sku_prices p on p.brewery_id=p_brewery and p.sale_channel_id=v_customer.sale_channel_id
      and p.sku_id=r.sku_id and p.active
    join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    left join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
  )
  select jsonb_agg(jsonb_build_object(
      'skuId',sku_id,'name',sku_name,'product',brand_name,'qty',qty,
      'unitPriceCents',unit_price_cents,'amountCents',amount_cents,
      'qboItemId',qbo_item_id,'qboRealmId',qbo_realm_id,
      'depositPoolId',pool_id,'depositName',pool_name,'kegSize',keg_size,
      'depositUnitPriceCents',case when deposit_cents>0 then deposit_cents end) order by sku_id),
    coalesce(sum(amount_cents),0)
  into v_lines,v_subtotal from resolved;
  if coalesce(jsonb_array_length(v_lines),0)<>jsonb_array_length(p_lines) then
    raise exception 'sku is not active and priced for this customer';
  end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), deposits as (
    select k.id pool_id,k.name,k.deposit_cents,f.keg_size,sum(r.qty)::int qty
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
    where k.deposit_cents>0 group by k.id,k.name,k.deposit_cents,f.keg_size
  )
  select coalesce(jsonb_agg(jsonb_build_object('poolId',pool_id,'name',name,'kegSize',keg_size,
      'qty',qty,'unitPriceCents',deposit_cents,'amountCents',qty*deposit_cents) order by pool_id),'[]'),
    coalesce(sum(qty*deposit_cents),0)
  into v_deposits,v_deposit from deposits;

  -- One-way kegs (a keg SKU with no container source) carry the customer's channel fee, as the line insert stamps it.
  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), fees as (
    select s.id,s.name,r.qty,c.one_way_keg_fee_cents fee
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id and f.brewery_id=p_brewery
    join public.sale_channels c on c.id=v_customer.sale_channel_id and c.brewery_id=p_brewery
    where f.package_type='keg' and s.container_source is null and c.one_way_keg_fee_cents>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'qty',qty,'unitPriceCents',fee,'amountCents',(qty*fee)::bigint) order by id),'[]'),
    coalesce(sum(qty*fee),0)::bigint
  into v_fees,v_fee from fees;

  return jsonb_build_object(
    'input',jsonb_build_object('shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines),
    'customer',jsonb_build_object('id',v_customer.id,'name',v_customer.name,'qboCustomerId',v_customer.qbo_customer_id,'qboRealmId',v_customer.qbo_realm_id),
    'source',jsonb_build_object('id',v_source.id,'name',v_source.name,'address',v_source.address),
    'destination',jsonb_build_object('id',v_ship.id,'label',v_ship.label,'address1',v_ship.address1,'address2',v_ship.address2,'city',v_ship.city,'state',v_ship.state,'zip',v_ship.zip),
    'lines',v_lines,'deposits',v_deposits,'subtotalCents',v_subtotal,
    'depositCents',v_deposit,'oneWayFees',v_fees,'oneWayFeeCents',v_fee,'amountBeforeTaxCents',v_subtotal+v_deposit+v_fee
  );
end $function$;

-- Copied from 20261024203451_sale_channel_name_uniqueness.sql; only the
-- optional fee is new. Omitted, a new channel gets 0 and an edit keeps its fee.
drop function public.upsert_sale_channel(uuid, uuid, text, public.tax_treatment, uuid);
create function public.upsert_sale_channel(
  p_brewery uuid, p_id uuid, p_name text, p_tax_treatment public.tax_treatment, p_request_id uuid,
  p_one_way_keg_fee_cents int default null
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
      'one_way_keg_fee_cents', p_one_way_keg_fee_cents));
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'Enter a channel name.'; end if;
  begin
    if p_id is null then
      insert into public.sale_channels (brewery_id, name, tax_treatment, one_way_keg_fee_cents)
        values (p_brewery, v_name, p_tax_treatment, coalesce(p_one_way_keg_fee_cents, 0)) returning * into v_row;
    else
      select * into v_row from public.sale_channels where id = p_id and brewery_id = p_brewery;
      if not found then raise exception 'sale channel not found'; end if;
      update public.sale_channels set name = v_name, tax_treatment = p_tax_treatment,
          one_way_keg_fee_cents = coalesce(p_one_way_keg_fee_cents, one_way_keg_fee_cents)
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
revoke all on function public.upsert_sale_channel(uuid, uuid, text, public.tax_treatment, uuid, int) from public, anon, authenticated, service_role;
grant execute on function public.upsert_sale_channel(uuid, uuid, text, public.tax_treatment, uuid, int) to authenticated;

-- Copied from 20261023170000_sale_channel_delete_rules.sql; only the fee is new.
create or replace function public.list_sale_channels(p_brewery uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales','warehouse']::public.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'tax_treatment', c.tax_treatment, 'system_code', c.system_code,
      'one_way_keg_fee_cents', c.one_way_keg_fee_cents,
      'in_use', exists (select 1 from public.inventory_movements r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.customers r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.orders r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.channel_prices r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
        or exists (select 1 from public.pos_menus r where r.sale_channel_id = c.id and r.brewery_id = c.brewery_id)
    ) order by c.name), '[]'::jsonb)
    from public.sale_channels c where c.brewery_id = p_brewery);
end $$;

-- The brewery-wide fee is replaced by the channel fee.
drop function public.set_one_way_keg_fee(uuid, int, uuid);
alter table public.breweries drop column one_way_keg_fee_cents;

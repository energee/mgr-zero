SET local check_function_bodies = off;

DROP VIEW "public"."invoice_totals";

DROP FUNCTION "public"."read_integration_tokens"(uuid, text, uuid, uuid);

CREATE TABLE "private"."portal_order_quotes" (
  "actor_id"           uuid                     NOT NULL,
  "brewery_id"         uuid                     NOT NULL,
  "customer_id"        uuid                     NOT NULL,
  "request_id"         uuid                     NOT NULL,
  "snapshot"           jsonb                    NOT NULL,
  "result"             jsonb                    NOT NULL,
  "connection_id"      uuid,
  "tax_status"         text                     NOT NULL DEFAULT 'pending'::text,
  "tax_cents"          integer,
  "submitted_order_id" uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"         timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  CONSTRAINT "portal_order_quotes_actor_id_request_id_key" UNIQUE (actor_id, request_id),
  CONSTRAINT "portal_order_quotes_tax_cents_check" CHECK ((tax_cents >= 0)),
  CONSTRAINT "portal_order_quotes_tax_status_check" CHECK ((tax_status = ANY (ARRAY['pending'::text, 'calculated'::text]))),
  "id"                 uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "portal_order_quotes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."portal_order_quotes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."qbo_connection_events" (
  "brewery_id"    uuid                     NOT NULL,
  "connection_id" uuid,
  "kind"          text                     NOT NULL,
  "detail"        text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "qbo_connection_events_kind_check"
    CHECK ((kind = ANY (ARRAY['connected'::text, 'disconnected'::text, 'remote_revocation_unresolved'::text, 'oauth_recovery_required'::text]))),
  "id"            uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "qbo_connection_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."qbo_connection_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."qbo_invoice_sync_batches" (
  "actor_id"      uuid                     NOT NULL,
  "request_id"    uuid                     NOT NULL,
  "brewery_id"    uuid                     NOT NULL,
  "connection_id" uuid                     NOT NULL,
  "realm_id"      text                     NOT NULL,
  "targets"       jsonb                    NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "qbo_invoice_sync_batches_pkey" PRIMARY KEY (actor_id, request_id),
  CONSTRAINT "qbo_invoice_sync_batches_targets_check" CHECK ((jsonb_typeof(targets) = 'array'::text))
);

CREATE TABLE "private"."qbo_oauth_intents" (
  "brewery_id"       uuid                     NOT NULL,
  "actor_id"         uuid                     NOT NULL,
  "state_hash"       text                     NOT NULL,
  "redirect_uri"     text                     NOT NULL,
  "provider_intent"  text                     NOT NULL,
  "requested_scopes" text[]                   NOT NULL,
  "expires_at"       timestamp with time zone NOT NULL,
  "consumed_at"      timestamp with time zone,
  "exchange_state"   text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "qbo_oauth_intents_exchange_state_check" CHECK ((exchange_state = ANY (ARRAY['pending'::text, 'exchanging'::text, 'completed'::text, 'recovery_required'::text]))),
  CONSTRAINT "qbo_oauth_intents_provider_intent_check" CHECK ((provider_intent = ANY (ARRAY['connect'::text, 'reconnect'::text]))),
  CONSTRAINT "qbo_oauth_intents_requested_scopes_check"
    CHECK
    (((requested_scopes = ARRAY['com.intuit.quickbooks.accounting'::text]) OR (requested_scopes = ARRAY['com.intuit.quickbooks.accounting'::text,
    'indirect-tax.tax-calculation.quickbooks'::text]))),
  CONSTRAINT "qbo_oauth_intents_state_hash_key" UNIQUE (state_hash),
  "id"               uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "qbo_oauth_intents_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."qbo_oauth_intents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."order_deposit_lines" (
  "brewery_id"       uuid            NOT NULL,
  "order_id"         uuid            NOT NULL,
  "order_line_id"    uuid            NOT NULL,
  "keg_pool_id"      uuid            NOT NULL,
  "keg_size"         public.keg_size NOT NULL,
  "description"      text            NOT NULL,
  "qty_ordered"      numeric(12,2)   NOT NULL,
  "unit_price_cents" integer         NOT NULL,
  CONSTRAINT "order_deposit_lines_order_line_id_key" UNIQUE (order_line_id),
  CONSTRAINT "order_deposit_lines_qty_ordered_check" CHECK ((qty_ordered > (0)::numeric)),
  CONSTRAINT "order_deposit_lines_unit_price_cents_check" CHECK ((unit_price_cents >= 0)),
  "id"               uuid            NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "order_deposit_lines_id_brewery_id_key" UNIQUE (id, brewery_id),
  CONSTRAINT "order_deposit_lines_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."order_deposit_lines"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."qbo_pushes" (
  "brewery_id"          uuid                     NOT NULL,
  "invoice_id"          uuid                     NOT NULL,
  "connection_id"       uuid                     NOT NULL,
  "realm_id"            text                     NOT NULL,
  "entity_type"         text                     NOT NULL,
  "provider_request_id" uuid                     NOT NULL,
  "request_body"        text                     NOT NULL,
  "local_snapshot"      jsonb                    NOT NULL,
  "attempt_reason"      text                     NOT NULL,
  "supersedes_push_id"  uuid,
  "status"              public.qbo_sync_status   NOT NULL DEFAULT 'pending'::public.qbo_sync_status,
  "qbo_entity_id"       text,
  "response"            jsonb,
  "error"               text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at"         timestamp with time zone,
  CONSTRAINT "qbo_pushes_attempt_reason_check" CHECK ((attempt_reason = ANY (ARRAY['initial'::text, 'corrected'::text, 'remote_deleted'::text]))),
  CONSTRAINT "qbo_pushes_entity_type_check" CHECK ((entity_type = ANY (ARRAY['Invoice'::text, 'CreditMemo'::text]))),
  CONSTRAINT "qbo_pushes_provider_request_id_key" UNIQUE (provider_request_id),
  "id"                  uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "qbo_pushes_id_brewery_id_key" UNIQUE (id, brewery_id),
  CONSTRAINT "qbo_pushes_pkey" PRIMARY KEY (id),
  "finish_request_id"   uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "qbo_pushes_finish_request_id_key" UNIQUE (finish_request_id)
);

ALTER TABLE "public"."qbo_pushes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."integration_tokens"
  ADD COLUMN "credential_version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."customers"
  ADD COLUMN "qbo_realm_id" text;

ALTER TABLE "public"."invoices"
  ADD COLUMN "qbo_sync_token" text;

ALTER TABLE "public"."invoices"
  ADD COLUMN "qbo_cash_collected_cents" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "qbo_sync_generation" bigint NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "qbo_accountant_drift" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."invoices"
  ADD COLUMN "written_off_at" timestamp WITH time zone;

ALTER TABLE "public"."invoices"
  ADD COLUMN "written_off_by" uuid;

ALTER TABLE "public"."invoices"
  ADD COLUMN "written_off_reason" text;

ALTER TABLE "public"."locations"
  ADD COLUMN "address" text;

ALTER TABLE "public"."order_deposit_lines"
  ADD COLUMN "amount_cents" integer GENERATED ALWAYS AS ((round((qty_ordered * (unit_price_cents)::numeric)))::integer) STORED;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "realm_label" text;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "state" text NOT NULL DEFAULT 'connected'::text;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "refresh_hard_expires_at" timestamp WITH time zone;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "remote_revocation_state" text NOT NULL DEFAULT 'not_requested'::text;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "last_error" text;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "qbo_deposit_item_id" text;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "allow_online_ach_payment" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "allow_online_credit_card_payment" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "granted_scopes" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "public"."qbo_connections"
  ADD COLUMN "credential_version" bigint NOT NULL DEFAULT 0;

ALTER TABLE "public"."skus"
  ADD COLUMN "qbo_realm_id" text;

CREATE TYPE "public"."qbo_remote_state" AS ENUM (
  'live',
  'voided',
  'deleted'
);

ALTER TABLE "public"."invoices"
  ADD COLUMN "qbo_remote_state" public.qbo_remote_state NOT NULL DEFAULT 'live'::public.qbo_remote_state;

CREATE OR REPLACE FUNCTION private.adjust_order_lines_impl (
  p_order  uuid,
  p_lines  jsonb,
  p_reason text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare o public.orders; l record; v_line uuid; v_before jsonb; v_existing boolean;
begin
  perform private.assert_order_lines(p_lines);
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  if o.kind = 'wholesale' then
    -- Freeze every mutable catalog row used by this replacement before any
    -- order mutation. A concurrent config edit either finishes first and is
    -- reviewed here, or waits until the adjusted order has its deposit rows.
    perform 1 from public.skus s
      where s.brewery_id=o.brewery_id
        and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
      order by s.id for update;
    perform 1 from public.formats f
      where f.brewery_id=o.brewery_id and f.id in (
        select s.format_id from public.skus s where s.brewery_id=o.brewery_id
          and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
      ) order by f.id for update;
    perform 1 from public.channel_prices cp
      where cp.brewery_id=o.brewery_id and cp.sale_channel_id=o.sale_channel_id
        and (cp.price_group_id,cp.format_id) in (
          select b.price_group_id,s.format_id from public.skus s
          join public.brands b on b.id=s.brand_id and b.brewery_id=s.brewery_id
          where s.brewery_id=o.brewery_id
            and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
        )
      order by cp.price_group_id,cp.format_id for update;
    perform 1 from public.keg_pools k
      where k.brewery_id=o.brewery_id and k.id in (
        select s.keg_pool_id from public.skus s where s.brewery_id=o.brewery_id
          and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
      ) order by k.id for update;
    if exists (
      select 1 from jsonb_array_elements(p_lines) e
      join public.skus s on s.id=(e->>'sku_id')::uuid and s.brewery_id=o.brewery_id
      join public.formats f on f.id=s.format_id and f.brewery_id=o.brewery_id
      left join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=o.brewery_id
      where s.container_source in ('owned_fleet','per_fill_rental')
        and (f.package_type is distinct from 'keg' or f.keg_size is null
          or k.id is null)
    ) then
      raise exception 'returnable keg deposit is not configured';
    end if;
  end if;
  select jsonb_object_agg(ol.sku_id, ol.qty_ordered) into v_before
  from public.order_lines ol where ol.order_id = p_order;
  -- Drop lines (and their open allocations) not present in the new set.
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order
                and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e));
  delete from public.order_lines where order_id = p_order
    and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e);
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    select exists (
      select 1 from public.order_lines where order_id=p_order and sku_id=l.sku_id
    ) into v_existing;
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then private.order_line_price(o.brewery_id, o.sale_channel_id, l.sku_id) else 0 end)
    on conflict (order_id, sku_id) do update set qty_ordered = excluded.qty_ordered
    returning id into v_line;
    update public.allocations set qty = l.qty
      where source = 'order_line' and ref = v_line and status = 'open';
    insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
    select o.brewery_id, l.sku_id, l.qty, 'order_line', v_line, 'open'
    where not exists (select 1 from public.allocations where source = 'order_line' and ref = v_line and status = 'open');
    if v_existing then
      -- Retaining an order-line identity retains the charge it was reviewed
      -- with; only its quantity follows the line adjustment.
      update public.order_deposit_lines set qty_ordered=l.qty where order_line_id=v_line;
    elsif o.kind = 'wholesale' then
      insert into public.order_deposit_lines(
        brewery_id,order_id,order_line_id,keg_pool_id,keg_size,description,qty_ordered,unit_price_cents
      )
      select o.brewery_id,p_order,v_line,k.id,f.keg_size,k.name||' deposit',l.qty,k.deposit_cents
      from public.skus s
      join public.formats f on f.id=s.format_id and f.brewery_id=o.brewery_id
      join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=o.brewery_id
      where s.id=l.sku_id and s.brewery_id=o.brewery_id
        and s.container_source in ('owned_fleet','per_fill_rental')
        and f.package_type='keg' and f.keg_size is not null and k.deposit_cents>0;
    end if;
  end loop;
  update public.orders set needs_restock = needs_restock or (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'lines_adjusted',
          jsonb_build_object('before', v_before, 'lines', p_lines, 'reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $function$;

CREATE OR REPLACE FUNCTION private.confirm_delivery_impl (
  p_delivery  uuid,
  p_signed_by text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare d public.deliveries; sh public.shipments; o public.orders; v_invoice uuid;
begin
  select * into d from public.deliveries where id = p_delivery for update;
  if not found then raise exception 'delivery not found'; end if;
  if d.delivered_at is not null then raise exception 'already delivered'; end if;
  if not exists (select 1 from public.routes where id = d.route_id and departed_at is not null) then raise exception 'route has not departed'; end if;
  update public.deliveries set delivered_at = now(), signed_by = nullif(trim(p_signed_by), '') where id = p_delivery;
  -- a transfer stop is only stamped: receive_stock_transfer moves the stock, and nothing is invoiced
  if d.stock_transfer_id is not null then return jsonb_build_object('delivery_id', p_delivery, 'invoice_id', null); end if;
  select * into sh from public.shipments where id = d.shipment_id;
  select * into o from public.orders where id = sh.order_id;
  select id into v_invoice from public.invoices where shipment_id = sh.id and kind = 'invoice' limit 1;
  if v_invoice is null and sh.invoice_timing = 'on_delivery' and o.kind = 'wholesale'
     and exists (select 1 from public.order_lines ol where ol.order_id = o.id and coalesce(ol.qty_shipped, 0) > 0) then
    insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on)
    values (o.brewery_id, 'invoice', o.customer_id, sh.id, current_date) returning id into v_invoice;
    insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description)
    select o.brewery_id, v_invoice, 'sku', ol.sku_id, ol.qty_shipped, ol.unit_price_cents, s.name
    from public.order_lines ol join public.skus s on s.id = ol.sku_id
    where ol.order_id = o.id and coalesce(ol.qty_shipped, 0) > 0;
    insert into public.invoice_lines (brewery_id, invoice_id, kind, order_line_id, keg_pool_id, keg_size, qty, unit_price_cents, description)
    select o.brewery_id,v_invoice,'keg_deposit',odl.order_line_id,odl.keg_pool_id,odl.keg_size,ol.qty_shipped,odl.unit_price_cents,odl.description
    from public.order_deposit_lines odl join public.order_lines ol on ol.id=odl.order_line_id and ol.order_id=odl.order_id
    where odl.order_id=o.id and coalesce(ol.qty_shipped,0)>0;
  end if;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, o.id, auth.uid(), 'delivered', jsonb_build_object('delivery_id', p_delivery, 'signed_by', p_signed_by, 'invoice_id', v_invoice));
  return jsonb_build_object('delivery_id', p_delivery, 'invoice_id', v_invoice);
end $function$;

CREATE OR REPLACE FUNCTION private.portal_quote_snapshot (
  p_brewery   uuid,
  p_customer  uuid,
  p_ship_to   uuid,
  p_requested date,
  p_po        text,
  p_note      text,
  p_lines     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_customer public.customers; v_ship public.ship_tos; v_source public.locations;
  v_lines jsonb; v_deposits jsonb; v_subtotal bigint; v_deposit bigint;
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
    where b.id=p_brewery and l.kind='warehouse';
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

  return jsonb_build_object(
    'input',jsonb_build_object('shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines),
    'customer',jsonb_build_object('id',v_customer.id,'name',v_customer.name,'qboCustomerId',v_customer.qbo_customer_id,'qboRealmId',v_customer.qbo_realm_id),
    'source',jsonb_build_object('id',v_source.id,'name',v_source.name,'address',v_source.address),
    'destination',jsonb_build_object('id',v_ship.id,'label',v_ship.label,'address1',v_ship.address1,'address2',v_ship.address2,'city',v_ship.city,'state',v_ship.state,'zip',v_ship.zip),
    'lines',v_lines,'deposits',v_deposits,'subtotalCents',v_subtotal,
    'depositCents',v_deposit,'amountBeforeTaxCents',v_subtotal+v_deposit
  );
end $function$;

CREATE OR REPLACE FUNCTION private.purge_qbo_identity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if old.realm_id is distinct from new.realm_id then
  update public.customers set qbo_customer_id=null,qbo_realm_id=null where brewery_id=old.brewery_id;
  update public.skus set qbo_item_id=null,qbo_realm_id=null where brewery_id=old.brewery_id;
  update public.invoices set qbo_invoice_id=null,qbo_sync_status='pending',qbo_sync_error=null,qbo_sync_token=null,qbo_remote_state='live',qbo_tax_cents=null,qbo_total_cents=null,qbo_balance_cents=null,qbo_cash_collected_cents=0,qbo_accountant_drift=false where brewery_id=old.brewery_id;
 end if; return new;
end $function$;

CREATE OR REPLACE FUNCTION private.ship_order_impl (
  p_order          uuid,
  p_ship           jsonb,
  p_carrier        text,
  p_tracking       text,
  p_invoice_timing text  DEFAULT 'now'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  o public.orders; sp record; v_state text; v_invoice uuid; v_shipment uuid;
  v_channel uuid; v_tax public.tax_treatment; v_sources jsonb; src record; v_line public.order_lines; v_available numeric;
begin
  o := private.lock_order(p_order, array['picked']::public.order_status[]);
  if o.needs_restock then raise exception 'order is waiting for restock'; end if;
  -- ponytail: serialize ledger consumers globally; use shared per-stock-key
  -- locks in every writer if warehouse write throughput outgrows this lock.
  lock table public.inventory_movements in share row exclusive mode;
  if jsonb_typeof(p_ship) is distinct from 'array' then raise exception 'ship list must cover every order line exactly once'; end if;
  if jsonb_array_length(p_ship) <> (select count(*) from public.order_lines where order_id = p_order)
     or (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_ship) e) <> jsonb_array_length(p_ship)
     or exists (select 1 from jsonb_array_elements(p_ship) e where not exists
       (select 1 from public.order_lines where id = (e->>'line_id')::uuid and order_id = p_order)) then
    raise exception 'ship list must cover every order line exactly once';
  end if;
  insert into public.shipments (brewery_id, order_id, carrier, tracking, invoice_timing, created_by)
  values (o.brewery_id, p_order, p_carrier, p_tracking, coalesce(p_invoice_timing, 'now'), auth.uid()) returning id into v_shipment;
  if o.kind = 'wholesale' then
    select state into v_state from public.ship_tos where id = o.ship_to_id;
    -- One lookup for the whole shipment: the channel a wholesale ship removes
    -- under, and the tax treatment frozen onto every movement it writes
    -- (customer override -> channel default, §16.3).
    -- orders.sale_channel_id is not null and FK-backed, so no null guard here.
    select o.sale_channel_id, coalesce(c.tax_treatment, sc.tax_treatment)
      into v_channel, v_tax
      from public.sale_channels sc
      left join public.customers c on c.id = o.customer_id
     where sc.id = o.sale_channel_id;
    -- Empty-invoice guard: only create invoice if at least one line ships qty > 0;
    -- on_delivery defers the invoice to confirm_delivery
    if coalesce(p_invoice_timing, 'now') = 'now'
       and exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then
    insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on)
    values (o.brewery_id, 'invoice', o.customer_id, v_shipment, current_date)
    returning id into v_invoice;
    end if;
  end if;
  for sp in select (e->>'line_id')::uuid as line_id, (e->>'qty_shipped')::numeric as qty, e->'sources' as sources from jsonb_array_elements(p_ship) e loop
    select * into v_line from public.order_lines where id = sp.line_id and order_id = p_order;
    if sp.qty is null or sp.qty::text in ('NaN','Infinity','-Infinity') or sp.qty < 0 or sp.qty <> round(sp.qty, 2)
       or sp.qty > least(v_line.qty_ordered, coalesce(v_line.qty_picked, 0)) then raise exception 'invalid shipped quantity'; end if;
    -- Old callers can only consume actual untracked first-bin stock.
    v_sources := coalesce(sp.sources, case when sp.qty = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'bin_id', private.first_bin(o.from_location_id), 'lot_id', null, 'qty', sp.qty,
      'to_bin_id', case when o.kind = 'taproom_transfer' then private.first_bin(o.to_location_id) end)) end);
    if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'sources must be an array'; end if;
    if (sp.qty = 0 and jsonb_array_length(v_sources) <> 0)
       or coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e), 0) <> sp.qty
       or (select count(distinct jsonb_build_array((e->>'bin_id')::uuid, (e->>'lot_id')::uuid)) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources)
    then raise exception 'distinct sources must sum to shipped quantity'; end if;
    for src in select (e->>'bin_id')::uuid bin_id, (e->>'lot_id')::uuid lot_id, (e->>'to_bin_id')::uuid to_bin_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
      if src.qty is null or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <= 0 or src.qty <> round(src.qty, 2) then raise exception 'invalid source quantity'; end if;
      if not exists (select 1 from public.bins where id = src.bin_id and location_id = o.from_location_id and brewery_id = o.brewery_id) then raise exception 'invalid source bin'; end if;
      if o.kind = 'taproom_transfer' and not exists (select 1 from public.bins where id = src.to_bin_id and location_id = o.to_location_id and brewery_id = o.brewery_id) then raise exception 'choose a destination bin'; end if;
      if o.kind = 'wholesale' and src.to_bin_id is not null then raise exception 'wholesale source has no destination bin'; end if;
      select coalesce(sum(qty), 0) into v_available from public.inventory_movements
        where brewery_id = o.brewery_id and sku_id = v_line.sku_id and bin_id = src.bin_id and lot_id is not distinct from src.lot_id;
      if v_available < src.qty then raise exception 'insufficient selected bin/lot stock; choose recorded sources'; end if;
    end loop;
    update public.order_lines set qty_shipped = sp.qty where id = sp.line_id and order_id = p_order;
    if sp.qty > 0 then
      if o.kind = 'wholesale' then
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, ref, created_by)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric,
          'sale_removal', v_channel, v_tax, v_state, p_order, auth.uid() from jsonb_array_elements(v_sources) e;
        if v_invoice is not null then
          insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description)
          select o.brewery_id, v_invoice, 'sku', ol.sku_id, sp.qty, ol.unit_price_cents, s.name
          from public.order_lines ol join public.skus s on s.id = ol.sku_id where ol.id = sp.line_id;
          insert into public.invoice_lines (brewery_id, invoice_id, kind, order_line_id, keg_pool_id, keg_size, qty, unit_price_cents, description)
          select o.brewery_id,v_invoice,'keg_deposit',d.order_line_id,d.keg_pool_id,d.keg_size,sp.qty,d.unit_price_cents,d.description
          from public.order_deposit_lines d where d.order_id=p_order and d.order_line_id=sp.line_id;
        end if;
      else
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
        select o.brewery_id, v_line.sku_id, o.from_location_id, (e->>'bin_id')::uuid, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'taproom_transfer'::public.movement_type, p_order, auth.uid() from jsonb_array_elements(v_sources) e
        union all
        select o.brewery_id, v_line.sku_id, o.to_location_id, (e->>'to_bin_id')::uuid, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'taproom_transfer'::public.movement_type, p_order, auth.uid() from jsonb_array_elements(v_sources) e;
      end if;
      update public.allocations set status = 'fulfilled'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    else
      update public.allocations set status = 'released'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    end if;
  end loop;
  -- anything picked but held back is staged on the floor: put it back
  update public.orders
     set status = 'shipped', shipped_at = now(),
         needs_restock = exists (
           select 1 from jsonb_array_elements(p_ship) e
           join public.order_lines ol on ol.id = (e->>'line_id')::uuid
           where (e->>'qty_shipped')::numeric < coalesce(ol.qty_picked, ol.qty_ordered))
   where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'shipped',
          jsonb_build_object('ship', p_ship, 'carrier', p_carrier, 'invoice_id', v_invoice));
  return jsonb_build_object('order_id', p_order, 'invoice_id', v_invoice);
end $function$;

CREATE OR REPLACE FUNCTION public.begin_qbo_disconnect (
  p_brewery    uuid,
  p_connection uuid,
  p_actor      uuid,
  p_request_id uuid
)
  RETURNS TABLE (
    refresh_token text,
    replay_result jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_token text; v_version bigint; v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState','unresolved');
begin
 if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and role='admin') then raise exception 'permission denied'; end if;
 v_replay:=private.claim_command_request_for(p_actor,p_brewery,'disconnect_qbo',p_request_id,jsonb_build_object('connectionId',p_connection));
 if v_replay is not null then return query select null::text,v_replay; return; end if;
 update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
 where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
 delete from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
 returning t.refresh_token,t.credential_version into v_token,v_version;
 update public.qbo_connections q set state='disconnected',remote_revocation_state='unresolved',
   credential_version=greatest(q.credential_version,coalesce(v_version,q.credential_version))+1,
   updated_at=now()
 where q.brewery_id=p_brewery and q.id=p_connection and q.state='connected';
 if not found then raise exception 'connection not available'; end if;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(p_brewery,p_connection,'disconnected');
 perform private.complete_command_request_for(p_actor,p_request_id,v_result);
 return query select v_token,null::jsonb;
end $function$;

CREATE OR REPLACE FUNCTION public.begin_qbo_invoice_sync (
  p_brewery    uuid,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid; v_request private.command_requests; v_conn public.qbo_connections;
  v_targets jsonb; v_payload_hash bytea:=extensions.digest('{}'::jsonb::text,'sha256');
begin
  v_actor:=private.assert_staff(p_brewery,array['admin','sales']::public.staff_role[]);
  select * into v_request from private.command_requests
    where actor_id=v_actor and request_id=p_request_id for update;
  if found then
    if v_request.brewery_id is distinct from p_brewery or v_request.command_name<>'sync_qbo_payments'
       or v_request.payload_hash<>v_payload_hash then
      raise exception 'request id was already used with a different payload' using errcode='MG409';
    end if;
    if v_request.result is not null then return jsonb_build_object('replayResult',v_request.result); end if;
    select connection_id,realm_id,targets into v_conn.id,v_conn.realm_id,v_targets
      from private.qbo_invoice_sync_batches where actor_id=v_actor and request_id=p_request_id;
    if not found then raise exception 'QuickBooks sync request is incomplete' using errcode='MG409'; end if;
    perform 1 from public.qbo_connections where brewery_id=p_brewery and id=v_conn.id
      and realm_id=v_conn.realm_id and state='connected' for share;
    if not found then raise exception 'QuickBooks connection changed' using errcode='MG409'; end if;
    return jsonb_build_object('actorId',v_actor,'connectionId',v_conn.id,'realmId',v_conn.realm_id,'targets',v_targets);
  end if;

  select * into v_conn from public.qbo_connections
    where brewery_id=p_brewery and state='connected' for share;
  if not found then raise exception 'QuickBooks connection required'; end if;
  insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash)
    values(v_actor,p_brewery,p_request_id,'sync_qbo_payments',v_payload_hash)
    on conflict(actor_id,request_id) do nothing;
  if not found then
    select * into v_request from private.command_requests
      where actor_id=v_actor and request_id=p_request_id for update;
    if v_request.brewery_id is distinct from p_brewery or v_request.command_name<>'sync_qbo_payments'
       or v_request.payload_hash<>v_payload_hash then
      raise exception 'request id was already used with a different payload' using errcode='MG409';
    end if;
    if v_request.result is not null then return jsonb_build_object('replayResult',v_request.result); end if;
    select connection_id,realm_id,targets into v_conn.id,v_conn.realm_id,v_targets
      from private.qbo_invoice_sync_batches where actor_id=v_actor and request_id=p_request_id;
    if not found then raise exception 'QuickBooks sync request is incomplete' using errcode='MG409'; end if;
    perform 1 from public.qbo_connections where brewery_id=p_brewery and id=v_conn.id
      and realm_id=v_conn.realm_id and state='connected' for share;
    if not found then raise exception 'QuickBooks connection changed' using errcode='MG409'; end if;
    return jsonb_build_object('actorId',v_actor,'connectionId',v_conn.id,'realmId',v_conn.realm_id,'targets',v_targets);
  end if;
  update public.invoices i set qbo_sync_generation=i.qbo_sync_generation+1
  where i.brewery_id=p_brewery and i.kind='invoice' and i.qbo_sync_status='pushed'
    and i.qbo_invoice_id is not null and exists(
      select 1 from public.qbo_pushes qp where qp.invoice_id=i.id and qp.brewery_id=p_brewery
        and qp.connection_id=v_conn.id and qp.realm_id=v_conn.realm_id and qp.status='pushed'
        and qp.qbo_entity_id=i.qbo_invoice_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'invoiceId',i.id,'remoteId',i.qbo_invoice_id,'pushId',p.id,
      'generation',i.qbo_sync_generation,'requestBody',p.request_body,'pushedResponse',p.response) order by i.id),'[]'::jsonb)
    into v_targets
  from public.invoices i
  join lateral (
    select qp.* from public.qbo_pushes qp
    where qp.invoice_id=i.id and qp.brewery_id=p_brewery and qp.connection_id=v_conn.id
      and qp.realm_id=v_conn.realm_id and qp.status='pushed' and qp.qbo_entity_id=i.qbo_invoice_id
    order by qp.finished_at desc nulls last,qp.created_at desc,qp.id desc limit 1
  ) p on true
  where i.brewery_id=p_brewery and i.kind='invoice' and i.qbo_sync_status='pushed'
    and i.qbo_invoice_id is not null;
  insert into private.qbo_invoice_sync_batches(actor_id,request_id,brewery_id,connection_id,realm_id,targets)
    values(v_actor,p_request_id,p_brewery,v_conn.id,v_conn.realm_id,v_targets);
  return jsonb_build_object('actorId',v_actor,'connectionId',v_conn.id,'realmId',v_conn.realm_id,'targets',v_targets);
end $function$;

CREATE OR REPLACE FUNCTION public.begin_qbo_oauth (
  p_brewery          uuid,
  p_redirect_uri     text,
  p_state_hash       text,
  p_provider_intent  text,
  p_request_id       uuid,
  p_requested_scopes text[] DEFAULT ARRAY['com.intuit.quickbooks.accounting'::text]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_id uuid;
begin
  if public.staff_role(p_brewery) <> 'admin' then raise exception 'permission denied'; end if;
  if p_requested_scopes<>array['com.intuit.quickbooks.accounting']::text[]
    and p_requested_scopes<>array['com.intuit.quickbooks.accounting','indirect-tax.tax-calculation.quickbooks']::text[] then
    raise exception 'oauth scopes invalid';
  end if;
  perform 1 from public.breweries where id=p_brewery for update;
  v_replay := private.claim_command_request(p_brewery, 'begin_qbo_oauth', p_request_id,
    jsonb_build_object('redirectUri',p_redirect_uri,'stateHash',p_state_hash,'providerIntent',p_provider_intent,'requestedScopes',p_requested_scopes));
  if v_replay is not null then return v_replay; end if;
  update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
  where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
  insert into private.qbo_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at)
  values(p_brewery,(select auth.uid()),p_state_hash,p_redirect_uri,p_provider_intent,p_requested_scopes,now()+interval '10 minutes') returning id into v_id;
  v_replay := jsonb_build_object('intentId',v_id);
  perform private.complete_command_request(p_request_id,v_replay); return v_replay;
end $function$;

CREATE OR REPLACE FUNCTION public.cas_integration_tokens (
  p_brewery          uuid,
  p_provider         text,
  p_connection       uuid,
  p_actor            uuid,
  p_expected_version bigint,
  p_access_token     text,
  p_refresh_token    text,
  p_received_at      timestamp with time zone,
  p_access_seconds   integer,
  p_refresh_seconds  integer,
  p_hard_seconds     integer
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 with changed as (
  update private.integration_tokens t set access_token=p_access_token,refresh_token=p_refresh_token,credential_version=credential_version+1,updated_at=now()
  where t.brewery_id=p_brewery and t.provider=p_provider and t.connection_id=p_connection and t.credential_version=p_expected_version
  and exists(select 1 from public.brewery_users u where u.brewery_id=p_brewery and u.user_id=p_actor and u.role in ('admin','sales'))
  and exists(select 1 from public.qbo_connections q where p_provider='qbo' and q.brewery_id=p_brewery and q.id=p_connection and q.state='connected') returning t.credential_version
 ), expiry as (
  update public.qbo_connections q set access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),
    refresh_expires_at=case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,
    refresh_hard_expires_at=case when p_hard_seconds is null then q.refresh_hard_expires_at else p_received_at+make_interval(secs=>p_hard_seconds) end,
    credential_version=changed.credential_version,updated_at=now() from changed
    where q.brewery_id=p_brewery and q.id=p_connection
 ) select coalesce((select true from changed),false)
$function$;

CREATE OR REPLACE FUNCTION public.cas_portal_qbo_payment_tokens (
  p_brewery           uuid,
  p_customer          uuid,
  p_invoice           uuid,
  p_actor             uuid,
  p_connection        uuid,
  p_realm_id          text,
  p_remote_invoice_id text,
  p_granted_scopes    text[],
  p_expected_version  bigint,
  p_access_token      text,
  p_refresh_token     text,
  p_received_at       timestamp with time zone,
  p_access_seconds    integer,
  p_refresh_seconds   integer,
  p_hard_seconds      integer
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with changed as (
    update private.integration_tokens t set access_token=p_access_token,refresh_token=p_refresh_token,
      credential_version=credential_version+1,updated_at=now()
    where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
      and t.credential_version=p_expected_version and exists(
        select 1 from public.invoices i join public.qbo_connections c on c.brewery_id=i.brewery_id
        where i.id=p_invoice and i.brewery_id=p_brewery and i.customer_id=p_customer and i.kind='invoice'
          and i.qbo_invoice_id=p_remote_invoice_id and i.qbo_sync_status='pushed' and i.qbo_remote_state='live'
          and i.written_off_at is null and i.qbo_balance_cents>0
          and c.id=p_connection and c.realm_id=p_realm_id and c.credential_version=p_expected_version
          and c.granted_scopes=p_granted_scopes and 'com.intuit.quickbooks.accounting'=any(c.granted_scopes)
          and c.state='connected' and (c.allow_online_ach_payment or c.allow_online_credit_card_payment)
          and exists(select 1 from public.customer_users u where u.customer_id=p_customer and u.user_id=p_actor)
          and exists(select 1 from public.qbo_pushes p where p.invoice_id=i.id and p.brewery_id=i.brewery_id
            and p.connection_id=c.id and p.realm_id=c.realm_id and p.entity_type='Invoice'
            and p.status='pushed' and p.qbo_entity_id=i.qbo_invoice_id)
      ) returning t.credential_version
  ), expiry as (
    update public.qbo_connections c set access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),
      refresh_expires_at=case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,
      refresh_hard_expires_at=case when p_hard_seconds is null then c.refresh_hard_expires_at else p_received_at+make_interval(secs=>p_hard_seconds) end,
      credential_version=changed.credential_version,updated_at=now() from changed
    where c.brewery_id=p_brewery and c.id=p_connection
  ) select coalesce((select true from changed),false)
$function$;

CREATE OR REPLACE FUNCTION public.claim_qbo_oauth (
  p_state_hash   text,
  p_actor        uuid,
  p_brewery      uuid,
  p_redirect_uri text
)
  RETURNS TABLE (
    intent_id        uuid,
    brewery_id       uuid,
    provider_intent  text,
    requested_scopes text[]
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 return query update private.qbo_oauth_intents i set consumed_at=now(),exchange_state='exchanging'
 where i.state_hash=p_state_hash and i.actor_id=p_actor and i.brewery_id=p_brewery and i.redirect_uri=p_redirect_uri
   and i.consumed_at is null and i.exchange_state='pending' and i.expires_at>=now()
   and exists(select 1 from public.brewery_users u where u.brewery_id=i.brewery_id and u.user_id=p_actor and u.role='admin')
 returning i.id,i.brewery_id,i.provider_intent,i.requested_scopes;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_qbo_invoice_sync (
  p_brewery      uuid,
  p_actor        uuid,
  p_request_id   uuid,
  p_connection   uuid,
  p_realm        text,
  p_observations jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_batch private.qbo_invoice_sync_batches; v_request private.command_requests;
  v_target jsonb; v_observation jsonb; v_inv public.invoices; v_push public.qbo_pushes;
  v_state text; v_drift boolean; v_paid boolean; v_cash int;
  v_synced int:=0; v_paid_count int:=0; v_voided int:=0; v_deleted int:=0; v_drifted int:=0; v_result jsonb;
begin
  if p_actor is null or not exists(select 1 from public.brewery_users
      where brewery_id=p_brewery and user_id=p_actor and role in ('admin','sales')) then
    raise insufficient_privilege using message='permission denied';
  end if;
  perform 1 from public.qbo_connections where brewery_id=p_brewery and id=p_connection
    and realm_id=p_realm and state='connected' for share;
  if not found then raise exception 'QuickBooks connection changed' using errcode='MG409'; end if;
  select * into v_request from private.command_requests
    where actor_id=p_actor and request_id=p_request_id for update;
  if not found or v_request.brewery_id is distinct from p_brewery or v_request.command_name<>'sync_qbo_payments'
    then raise exception 'QuickBooks sync request changed' using errcode='MG409'; end if;
  if v_request.result is not null then return v_request.result; end if;
  select * into v_batch from private.qbo_invoice_sync_batches
    where actor_id=p_actor and request_id=p_request_id for update;
  if not found or v_batch.brewery_id<>p_brewery or v_batch.connection_id<>p_connection or v_batch.realm_id<>p_realm
    then raise exception 'QuickBooks sync request changed' using errcode='MG409'; end if;
  if jsonb_typeof(p_observations)<>'array'
     or jsonb_array_length(p_observations)<>jsonb_array_length(v_batch.targets)
     or exists(select 1 from jsonb_array_elements(p_observations) o
       where (select count(*) from jsonb_array_elements(v_batch.targets) t
         where t->>'invoiceId'=o->>'invoiceId' and t->>'remoteId'=o->>'remoteId')<>1)
     or exists(select 1 from jsonb_array_elements(v_batch.targets) t
       where (select count(*) from jsonb_array_elements(p_observations) o
         where o->>'invoiceId'=t->>'invoiceId' and o->>'remoteId'=t->>'remoteId')<>1)
    then raise exception 'QuickBooks sync observations changed' using errcode='MG409'; end if;

  -- Lock all targets in deterministic order before applying any observation.
  perform 1 from public.invoices i join jsonb_array_elements(v_batch.targets) t
    on i.id=(t->>'invoiceId')::uuid and i.brewery_id=p_brewery order by i.id for update of i;
  for v_target in select value from jsonb_array_elements(v_batch.targets) order by value->>'invoiceId' loop
    select value into v_observation from jsonb_array_elements(p_observations)
      where value->>'invoiceId'=v_target->>'invoiceId' and value->>'remoteId'=v_target->>'remoteId';
    select * into v_inv from public.invoices where id=(v_target->>'invoiceId')::uuid and brewery_id=p_brewery;
    select * into v_push from public.qbo_pushes where id=(v_target->>'pushId')::uuid and brewery_id=p_brewery
      and invoice_id=v_inv.id and connection_id=p_connection and realm_id=p_realm and status='pushed'
      and qbo_entity_id=v_target->>'remoteId';
    if v_inv.id is null or v_push.id is null or v_inv.qbo_invoice_id is distinct from v_target->>'remoteId'
       or v_inv.qbo_sync_generation is distinct from (v_target->>'generation')::bigint then
      raise exception 'QuickBooks invoice identity changed' using errcode='MG409';
    end if;
    v_state:=v_observation->>'remoteState';
    if v_state not in ('live','voided','deleted') then raise exception 'invalid QuickBooks invoice state'; end if;
    v_drift:=false;
    if v_state='live' then
      v_drift:=not (v_observation->>'contentMatches')::boolean
        or (v_push.response ? 'TotalAmt' and round((v_push.response->>'TotalAmt')::numeric*100)::int
          is distinct from (v_observation->>'totalCents')::int)
        or (v_push.response ? 'TotalTax' and round((v_push.response->>'TotalTax')::numeric*100)::int
          is distinct from (v_observation->>'taxCents')::int);
    end if;
    v_cash:=(v_observation->>'cashCollectedCents')::int;
    if v_cash<0 or v_cash>coalesce((v_observation->>'totalCents')::int,0) then
      raise exception 'invalid QuickBooks cash evidence';
    end if;
    v_paid:=v_state='live' and v_cash>0
      and (v_observation->>'balanceCents')::int=0 and (v_observation->>'totalCents')::int>0;
    update public.invoices set qbo_remote_state=v_state::public.qbo_remote_state,
      qbo_sync_token=v_observation->>'syncToken',
      qbo_tax_cents=case when v_observation->'taxCents'='null'::jsonb then null else (v_observation->>'taxCents')::int end,
      qbo_total_cents=case when v_observation->'totalCents'='null'::jsonb then null else (v_observation->>'totalCents')::int end,
      qbo_balance_cents=case when v_observation->'balanceCents'='null'::jsonb then null else (v_observation->>'balanceCents')::int end,
      qbo_cash_collected_cents=case when v_state='live' then v_cash else qbo_cash_collected_cents end,
      qbo_accountant_drift=v_drift,
      paid_at=case when v_paid then coalesce(paid_at,nullif(v_observation->>'paidAt','')::timestamptz,now())
        when v_state='live' then null else paid_at end
      where id=v_inv.id and brewery_id=p_brewery;
    v_synced:=v_synced+1;
    v_paid_count:=v_paid_count+v_paid::int;
    v_voided:=v_voided+(v_state='voided')::int;
    v_deleted:=v_deleted+(v_state='deleted')::int;
    v_drifted:=v_drifted+v_drift::int;
  end loop;
  v_result:=jsonb_build_object('synced',v_synced,'paid',v_paid_count,'voided',v_voided,'deleted',v_deleted,'drifted',v_drifted);
  perform private.complete_command_request_for(p_actor,p_request_id,v_result);
  delete from private.qbo_invoice_sync_batches where actor_id=p_actor and request_id=p_request_id;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_qbo_oauth (
  p_intent          uuid,
  p_actor           uuid,
  p_realm_id        text,
  p_realm_label     text,
  p_access_token    text,
  p_refresh_token   text,
  p_received_at     timestamp with time zone,
  p_access_seconds  integer,
  p_refresh_seconds integer,
  p_hard_seconds    integer,
  p_granted_scopes  text[]                   DEFAULT NULL::text[]
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare i private.qbo_oauth_intents; v_id uuid:=private.new_uuid(); v_version bigint; v_scopes text[];
begin
 select * into i from private.qbo_oauth_intents where id=p_intent for update;
 if i.id is null or i.actor_id<>p_actor or i.exchange_state<>'exchanging' or not exists(select 1 from public.brewery_users u where u.brewery_id=i.brewery_id and u.user_id=p_actor and u.role='admin') then raise exception 'oauth state invalid'; end if;
 if p_granted_scopes is not null and not p_granted_scopes<@i.requested_scopes then raise exception 'oauth scopes invalid'; end if;
 v_scopes:=coalesce(p_granted_scopes,i.requested_scopes);
 perform 1 from private.integration_tokens where brewery_id=i.brewery_id and provider='qbo' for update;
 insert into public.qbo_connections(id,brewery_id,realm_id,realm_label,state,access_expires_at,refresh_expires_at,refresh_hard_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
 values(v_id,i.brewery_id,p_realm_id,p_realm_label,'connected',p_received_at+make_interval(secs=>p_access_seconds),case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,case when p_hard_seconds is null then null else p_received_at+make_interval(secs=>p_hard_seconds) end,'not_requested',null,1,p_actor,now(),v_scopes)
 on conflict(brewery_id) do update set id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.id else excluded.id end,realm_id=excluded.realm_id,realm_label=excluded.realm_label,state='connected',access_expires_at=excluded.access_expires_at,refresh_expires_at=excluded.refresh_expires_at,refresh_hard_expires_at=excluded.refresh_hard_expires_at,remote_revocation_state='not_requested',last_error=null,
   qbo_deposit_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_deposit_item_id end,
   granted_scopes=excluded.granted_scopes,credential_version=qbo_connections.credential_version+1,connected_by=p_actor,updated_at=now()
 returning id,credential_version into v_id,v_version;
 insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
 values(i.brewery_id,'qbo',v_id,p_access_token,p_refresh_token,v_version)
 on conflict(brewery_id,provider) do update set connection_id=excluded.connection_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
 update private.qbo_oauth_intents set exchange_state='completed' where id=i.id;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(i.brewery_id,v_id,'connected'); return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_portal_qbo_payment (
  p_brewery           uuid,
  p_customer          uuid,
  p_invoice           uuid,
  p_actor             uuid,
  p_connection        uuid,
  p_realm_id          text,
  p_remote_invoice_id text,
  p_expected_version  bigint,
  p_granted_scopes    text[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists(
    select 1 from public.invoices i join public.qbo_connections c on c.brewery_id=i.brewery_id
      join private.integration_tokens t on t.brewery_id=i.brewery_id and t.provider='qbo' and t.connection_id=c.id
    where i.id=p_invoice and i.brewery_id=p_brewery and i.customer_id=p_customer and i.kind='invoice'
      and i.qbo_invoice_id=p_remote_invoice_id and i.qbo_sync_status='pushed' and i.qbo_remote_state='live'
      and i.written_off_at is null and i.qbo_balance_cents>0
      and c.id=p_connection and c.realm_id=p_realm_id and c.credential_version=p_expected_version
      and t.credential_version=p_expected_version and c.granted_scopes=p_granted_scopes
      and 'com.intuit.quickbooks.accounting'=any(c.granted_scopes)
      and c.state='connected' and (c.allow_online_ach_payment or c.allow_online_credit_card_payment)
      and exists(select 1 from public.customer_users u where u.customer_id=p_customer and u.user_id=p_actor)
      and exists(select 1 from public.qbo_pushes p where p.invoice_id=i.id and p.brewery_id=i.brewery_id
        and p.connection_id=c.id and p.realm_id=c.realm_id and p.entity_type='Invoice'
        and p.status='pushed' and p.qbo_entity_id=i.qbo_invoice_id)
  )
$function$;

CREATE OR REPLACE FUNCTION public.fail_qbo_oauth (
  p_intent uuid,
  p_actor  uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 with changed as (
  update private.qbo_oauth_intents set exchange_state='recovery_required'
  where id=p_intent and actor_id=p_actor and exchange_state='exchanging' returning brewery_id
 ), event as (
  insert into private.qbo_connection_events(brewery_id,kind,detail)
  select brewery_id,'oauth_recovery_required','OAuth completion did not finish; reconnect required' from changed
 ) select coalesce((select true from changed),false)
$function$;

CREATE OR REPLACE FUNCTION public.finish_portal_quote_tax (
  p_brewery    uuid,
  p_customer   uuid,
  p_quote      uuid,
  p_actor      uuid,
  p_connection uuid,
  p_tax_cents  integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare q private.portal_order_quotes; v_result jsonb;
begin
  if p_tax_cents<0 then raise exception 'invalid tax amount'; end if;
  select * into q from private.portal_order_quotes where id=p_quote and actor_id=p_actor
    and brewery_id=p_brewery and customer_id=p_customer and connection_id=p_connection for update;
  if not found or q.expires_at<=now() or not exists(select 1 from public.customer_users u where u.customer_id=p_customer and u.user_id=p_actor)
    or not exists(select 1 from public.qbo_connections c where c.id=p_connection and c.brewery_id=p_brewery and c.state='connected') then
    raise exception 'quote tax reconciliation is unavailable';
  end if;
  if q.tax_status='calculated' then
    if q.tax_cents<>p_tax_cents then raise exception 'quote tax result changed' using errcode='MG409'; end if;
    return q.result;
  end if;
  v_result:=(q.result-'taxReady')||jsonb_build_object('taxStatus','calculated','taxCents',p_tax_cents,
    'totalCents',(q.result->>'amountBeforeTaxCents')::bigint+p_tax_cents);
  update private.portal_order_quotes set tax_status='calculated',tax_cents=p_tax_cents,result=v_result where id=p_quote;
  update private.command_requests set result=v_result where actor_id=p_actor and request_id=q.request_id;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.finish_qbo_disconnect (
  p_brewery    uuid,
  p_connection uuid,
  p_actor      uuid,
  p_request_id uuid,
  p_revoked    boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState',case when p_revoked then 'confirmed' else 'unresolved' end);
begin
 update public.qbo_connections q set remote_revocation_state=case when p_revoked then 'confirmed' else 'unresolved' end,last_error=case when p_revoked then null else 'Remote revocation could not be confirmed' end,updated_at=now()
 where q.brewery_id=p_brewery and q.id=p_connection and q.state='disconnected' and exists(select 1 from public.brewery_users u where u.brewery_id=p_brewery and u.user_id=p_actor and u.role='admin');
 if not found then raise exception 'disconnect reconciliation is not available'; end if;
 if not p_revoked then insert into private.qbo_connection_events(brewery_id,connection_id,kind,detail) values(p_brewery,p_connection,'remote_revocation_unresolved','Remote revocation could not be confirmed'); end if;
 return private.complete_command_request_for(p_actor,p_request_id,v_result);
end
$function$;

CREATE OR REPLACE FUNCTION public.finish_qbo_push (
  p_brewery       uuid,
  p_push          uuid,
  p_actor         uuid,
  p_status        text,
  p_qbo_entity_id text,
  p_error         text,
  p_response      jsonb,
  p_request_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_push public.qbo_pushes; v_replay jsonb; v_result jsonb;
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and role in ('admin','sales'))
    then raise insufficient_privilege using message='permission denied'; end if;
  select * into v_push from public.qbo_pushes where id=p_push and brewery_id=p_brewery for update;
  if not found then raise exception 'QuickBooks push not found'; end if;
  perform 1 from public.qbo_connections
    where brewery_id=p_brewery and id=v_push.connection_id and realm_id=v_push.realm_id and state='connected'
    for share;
  if not found then raise exception 'QuickBooks connection changed; pending push remains frozen and cannot be finalized by another connection' using errcode='MG409'; end if;
  if p_request_id<>v_push.finish_request_id then raise exception 'invalid QuickBooks finish identity' using errcode='MG409'; end if;
  if p_status not in ('pushed','push_failed') then raise exception 'invalid QuickBooks push result'; end if;
  if p_status='pushed' and nullif(btrim(p_qbo_entity_id),'') is null then raise exception 'QuickBooks entity id required'; end if;
  v_replay:=private.claim_command_request_for(p_actor,p_brewery,'finish_qbo_push',p_request_id,
    jsonb_build_object('pushId',p_push,'status',p_status,'remoteId',p_qbo_entity_id,'error',p_error,'response',p_response));
  if v_replay is not null then return v_replay; end if;
  if v_push.status<>'pending' then raise exception 'QuickBooks push is already finished' using errcode='MG409'; end if;
  update public.qbo_pushes set status=p_status::public.qbo_sync_status,qbo_entity_id=p_qbo_entity_id,
    response=p_response,error=left(p_error,500),finished_at=now() where id=p_push;
  if p_status='pushed' then
    update public.invoices set qbo_invoice_id=p_qbo_entity_id,qbo_sync_status='pushed',qbo_sync_error=null,
      qbo_sync_token=p_response->>'SyncToken',qbo_remote_state='live',qbo_accountant_drift=false,
      qbo_tax_cents=case when p_response ? 'TotalTax' then round((p_response->>'TotalTax')::numeric*100)::int end,
      qbo_total_cents=case when p_response ? 'TotalAmt' then round((p_response->>'TotalAmt')::numeric*100)::int end,
      qbo_balance_cents=case when p_response ? 'Balance' then round((p_response->>'Balance')::numeric*100)::int end
      where id=v_push.invoice_id and brewery_id=p_brewery;
  else
    update public.invoices set qbo_sync_status='push_failed',qbo_sync_error=left(p_error,500)
      where id=v_push.invoice_id and brewery_id=p_brewery;
  end if;
  v_result:=jsonb_build_object('pushId',p_push,'status',p_status,'remoteId',p_qbo_entity_id);
  return private.complete_command_request_for(p_actor,p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.portal_quote_order (
  p_brewery    uuid,
  p_customer   uuid,
  p_ship_to    uuid,
  p_requested  date,
  p_po         text,
  p_note       text,
  p_lines      jsonb,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid; v_replay jsonb; v_snapshot jsonb; v_result jsonb;
  v_quote uuid:=private.new_uuid(); v_connection uuid; v_realm text; v_deposit_item text;
  v_public_lines jsonb; v_tax_lines jsonb; v_public_deposits jsonb;
begin
  v_actor:=private.assert_customer(p_brewery,p_customer);
  v_replay:=private.claim_command_request(p_brewery,'portal_quote_order',p_request_id,
    jsonb_build_object('brewery',p_brewery,'customer',p_customer,'shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  v_snapshot:=private.portal_quote_snapshot(p_brewery,p_customer,p_ship_to,p_requested,p_po,p_note,p_lines);
  select coalesce(jsonb_agg(x-array['qboItemId','qboRealmId','depositPoolId','depositName','kegSize','depositUnitPriceCents']),'[]') into v_public_lines
    from jsonb_array_elements(v_snapshot->'lines') x;
  select coalesce(jsonb_agg(x-array['poolId']),'[]') into v_public_deposits
    from jsonb_array_elements(v_snapshot->'deposits') x;
  select c.id,c.realm_id,c.qbo_deposit_item_id into v_connection,v_realm,v_deposit_item
  from public.qbo_connections c
  where c.brewery_id=p_brewery and c.state='connected'
    and 'com.intuit.quickbooks.accounting'=any(c.granted_scopes)
    and 'indirect-tax.tax-calculation.quickbooks'=any(c.granted_scopes)
    and c.realm_id=v_snapshot#>>'{customer,qboRealmId}'
    and nullif(v_snapshot#>>'{customer,qboCustomerId}','') is not null
    and nullif(v_snapshot#>>'{source,address}','') is not null
    and not exists(select 1 from jsonb_array_elements(v_snapshot->'lines') x
      where nullif(x->>'qboItemId','') is null or x->>'qboRealmId'<>c.realm_id)
    and ((v_snapshot->>'depositCents')::bigint=0 or nullif(c.qbo_deposit_item_id,'') is not null)
    and exists(select 1 from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=c.id);
  if v_connection is not null then
    select coalesce(jsonb_agg(jsonb_build_object('itemId',x->>'qboItemId','qty',(x->>'qty')::numeric,
      'unitPriceCents',(x->>'unitPriceCents')::int)),'[]') into v_tax_lines
      from jsonb_array_elements(v_snapshot->'lines') x;
    if (v_snapshot->>'depositCents')::bigint>0 then
      v_tax_lines:=v_tax_lines||jsonb_build_array(jsonb_build_object(
        'itemId',v_deposit_item,'qty',1,'unitPriceCents',(v_snapshot->>'depositCents')::int));
    end if;
    v_snapshot:=v_snapshot||jsonb_build_object('taxInput',jsonb_build_object(
      'transactionDate',coalesce(p_requested,current_date),'customerId',v_snapshot#>>'{customer,qboCustomerId}',
      'sourceAddress',v_snapshot#>>'{source,address}',
      'destinationAddress',concat_ws(', ',v_snapshot#>>'{destination,address1}',v_snapshot#>>'{destination,address2}',v_snapshot#>>'{destination,city}',v_snapshot#>>'{destination,state}',v_snapshot#>>'{destination,zip}'),
      'lines',v_tax_lines));
  end if;
  v_result:=jsonb_build_object('quoteId',v_quote,'expiresAt',now()+interval '10 minutes','taxStatus','pending',
    'source',v_snapshot->'source','destination',v_snapshot->'destination','lines',v_public_lines,'deposits',v_public_deposits,
    'subtotalCents',(v_snapshot->>'subtotalCents')::bigint,'depositCents',(v_snapshot->>'depositCents')::bigint,
    'amountBeforeTaxCents',(v_snapshot->>'amountBeforeTaxCents')::bigint,'taxReady',v_connection is not null);
  insert into private.portal_order_quotes(id,actor_id,brewery_id,customer_id,request_id,snapshot,result,connection_id)
    values(v_quote,v_actor,p_brewery,p_customer,p_request_id,v_snapshot,v_result,v_connection);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.portal_submit_quote (
  p_brewery    uuid,
  p_customer   uuid,
  p_quote      uuid,
  p_order      uuid,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid; v_replay jsonb; v_row private.portal_order_quotes; v_current jsonb; v_result jsonb; v_order uuid;
begin
  v_actor:=private.assert_customer(p_brewery,p_customer);
  v_replay:=private.claim_command_request(p_brewery,'portal_submit_quote',p_request_id,
    jsonb_build_object('brewery',p_brewery,'customer',p_customer,'quoteId',p_quote,'orderId',p_order));
  if v_replay is not null then return v_replay; end if;
  select * into v_row from private.portal_order_quotes where id=p_quote and actor_id=v_actor
    and brewery_id=p_brewery and customer_id=p_customer for update;
  if not found then raise exception 'quote not found'; end if;
  if v_row.submitted_order_id is not null then raise exception 'quote was already submitted' using errcode='MG409'; end if;
  if v_row.expires_at<=now() then raise exception 'quote expired; review the order again' using errcode='MG409'; end if;
  -- Lock every mutable row that contributed to the quote. Ordinary writers
  -- acquire these same row locks when updating, so the comparison and order
  -- line writes below observe one serialized state at READ COMMITTED.
  perform 1 from public.customers where id=p_customer and brewery_id=p_brewery for update;
  perform 1 from public.ship_tos where id=(v_row.snapshot#>>'{input,shipToId}')::uuid and brewery_id=p_brewery for update;
  perform 1 from public.breweries where id=p_brewery for update;
  perform 1 from public.locations where id=(v_row.snapshot#>>'{source,id}')::uuid and brewery_id=p_brewery for update;
  perform 1 from public.skus s where s.id in (
    select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
  ) order by s.id for update;
  perform 1 from public.brands b where b.id in (
    select s.brand_id from public.skus s where s.id in (
      select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
    )
  ) order by b.id for update;
  perform 1 from public.formats f where f.id in (
    select s.format_id from public.skus s where s.id in (
      select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
    )
  ) order by f.id for update;
  perform 1 from public.channel_prices cp
  join public.brands b on b.price_group_id=cp.price_group_id and b.brewery_id=cp.brewery_id
  join public.skus s on s.brand_id=b.id and s.format_id=cp.format_id and s.brewery_id=cp.brewery_id
  where cp.brewery_id=p_brewery
    and cp.sale_channel_id=(select sale_channel_id from public.customers where id=p_customer)
    and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e)
  order by cp.sale_channel_id,cp.price_group_id,cp.format_id for update of cp;
  perform 1 from public.keg_pools k where k.id in (
    select (e->>'depositPoolId')::uuid from jsonb_array_elements(v_row.snapshot->'lines') e
    where e->>'depositPoolId' is not null
  ) order by k.id for update;
  v_current:=private.portal_quote_snapshot(p_brewery,p_customer,
    (v_row.snapshot#>>'{input,shipToId}')::uuid,(v_row.snapshot#>>'{input,requestedShipDate}')::date,
    v_row.snapshot#>>'{input,poNumber}',v_row.snapshot#>>'{input,note}',v_row.snapshot#>'{input,lines}');
  if (v_current-'taxInput')<>(v_row.snapshot-'taxInput') then
    raise exception 'order details changed; review the current quote again' using errcode='MG409';
  end if;
  if p_order is null then
    v_result:=private.create_order_impl(p_brewery,'wholesale',p_customer,
      (v_row.snapshot#>>'{input,shipToId}')::uuid,(v_row.snapshot#>>'{source,id}')::uuid,null,
      (v_row.snapshot#>>'{input,requestedShipDate}')::date,v_row.snapshot#>>'{input,poNumber}',v_row.snapshot#>>'{input,note}',v_row.snapshot#>'{input,lines}');
    v_order:=(v_result->>'order_id')::uuid;
  else
    perform 1 from public.orders where id=p_order and brewery_id=p_brewery and customer_id=p_customer and status='draft' for update;
    if not found then raise exception 'order not found'; end if;
    v_result:=private.update_draft_order_impl(p_order,(v_row.snapshot#>>'{input,shipToId}')::uuid,
      (v_row.snapshot#>>'{input,requestedShipDate}')::date,v_row.snapshot#>>'{input,poNumber}',v_row.snapshot#>>'{input,note}',v_row.snapshot#>'{input,lines}');
    v_order:=p_order;
  end if;
  delete from public.order_deposit_lines where order_id=v_order;
  insert into public.order_deposit_lines(
    brewery_id,order_id,order_line_id,keg_pool_id,keg_size,description,qty_ordered,unit_price_cents
  )
  select p_brewery,v_order,ol.id,(e->>'depositPoolId')::uuid,(e->>'kegSize')::public.keg_size,
    coalesce(nullif(e->>'depositName',''),'Keg')||' deposit',(e->>'qty')::numeric,(e->>'depositUnitPriceCents')::int
  from jsonb_array_elements(v_row.snapshot->'lines') e
  join public.order_lines ol on ol.order_id=v_order and ol.sku_id=(e->>'skuId')::uuid
  where e->>'depositPoolId' is not null and (e->>'depositUnitPriceCents')::int>0;
  v_result:=private.submit_order_impl(v_order);
  update private.portal_order_quotes set submitted_order_id=v_order where id=p_quote;
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.read_integration_tokens (
  p_brewery    uuid,
  p_provider   text,
  p_connection uuid,
  p_actor      uuid
)
  RETURNS TABLE (
    access_token            text,
    refresh_token           text,
    credential_version      bigint,
    access_expires_at       timestamp with time zone,
    refresh_expires_at      timestamp with time zone,
    refresh_hard_expires_at timestamp with time zone
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select t.access_token, t.refresh_token, t.credential_version,
    q.access_expires_at,q.refresh_expires_at,q.refresh_hard_expires_at
  from private.integration_tokens t
  left join public.qbo_connections q
    on p_provider='qbo' and q.brewery_id=t.brewery_id and q.id=t.connection_id
  where t.brewery_id = p_brewery
    and t.provider = p_provider
    and t.connection_id = p_connection
    and exists (
      select 1 from public.brewery_users u
      where u.brewery_id = p_brewery
        and u.user_id = p_actor
        and u.role in ('admin', 'sales')
    )
    and (
      (p_provider = 'qbo' and exists (
        select 1 from public.qbo_connections q
        where q.brewery_id = p_brewery and q.id = p_connection and q.state = 'connected'
      ))
      or
      (p_provider = 'square' and exists (
        select 1 from public.pos_connections p
        where p.brewery_id = p_brewery
          and p.provider = p_provider
          and p.id = p_connection
      ))
    );
$function$;

CREATE OR REPLACE FUNCTION public.read_portal_qbo_payment (
  p_brewery  uuid,
  p_customer uuid,
  p_invoice  uuid,
  p_actor    uuid
)
  RETURNS TABLE (
    connection_id           uuid,
    realm_id                text,
    remote_invoice_id       text,
    access_token            text,
    refresh_token           text,
    credential_version      bigint,
    granted_scopes          text[],
    access_expires_at       timestamp with time zone,
    refresh_expires_at      timestamp with time zone,
    refresh_hard_expires_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select c.id,c.realm_id,i.qbo_invoice_id,t.access_token,t.refresh_token,t.credential_version,
    c.granted_scopes,c.access_expires_at,c.refresh_expires_at,c.refresh_hard_expires_at
  from public.invoices i
  join public.qbo_connections c on c.brewery_id=i.brewery_id and c.state='connected'
  join private.integration_tokens t on t.brewery_id=i.brewery_id and t.provider='qbo' and t.connection_id=c.id
  where i.id=p_invoice and i.brewery_id=p_brewery and i.customer_id=p_customer and i.kind='invoice'
    and i.qbo_invoice_id is not null and i.qbo_sync_status='pushed' and i.qbo_remote_state='live' and i.written_off_at is null
    and i.qbo_balance_cents>0
    and c.credential_version=t.credential_version
    and (c.allow_online_ach_payment or c.allow_online_credit_card_payment)
    and 'com.intuit.quickbooks.accounting'=any(c.granted_scopes)
    and exists(select 1 from public.customer_users u where u.customer_id=p_customer and u.user_id=p_actor)
    and exists(select 1 from public.qbo_pushes p where p.invoice_id=i.id and p.brewery_id=i.brewery_id
      and p.connection_id=c.id and p.realm_id=c.realm_id and p.entity_type='Invoice'
      and p.status='pushed' and p.qbo_entity_id=i.qbo_invoice_id)
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.read_portal_quote_tax (
  p_brewery  uuid,
  p_customer uuid,
  p_quote    uuid,
  p_actor    uuid
)
  RETURNS TABLE (
    connection_id uuid,
    access_token  text,
    tax_input     jsonb
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select q.connection_id,t.access_token,q.snapshot->'taxInput'
  from private.portal_order_quotes q
  join public.qbo_connections c on c.id=q.connection_id and c.brewery_id=q.brewery_id and c.state='connected'
  join private.integration_tokens t on t.brewery_id=q.brewery_id and t.provider='qbo' and t.connection_id=c.id
  where q.id=p_quote and q.actor_id=p_actor and q.brewery_id=p_brewery and q.customer_id=p_customer
    and q.tax_status='pending' and q.expires_at>now() and q.snapshot ? 'taxInput'
    and 'com.intuit.quickbooks.accounting'=any(c.granted_scopes)
    and 'indirect-tax.tax-calculation.quickbooks'=any(c.granted_scopes)
    and exists(select 1 from public.customer_users u where u.customer_id=p_customer and u.user_id=p_actor)
$function$;

CREATE OR REPLACE FUNCTION public.set_qbo_customer_mapping (
  p_brewery         uuid,
  p_customer        uuid,
  p_qbo_customer_id text,
  p_request_id      uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_realm text; v_result jsonb;
begin
  if public.staff_role(p_brewery) not in ('admin','sales') then raise insufficient_privilege using message='permission denied'; end if;
  select realm_id into v_realm from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if v_realm is null then raise exception 'QuickBooks connection required'; end if;
  if nullif(btrim(p_qbo_customer_id),'') is null then raise exception 'QuickBooks customer mapping required'; end if;
  if not exists(select 1 from public.customers where id=p_customer and brewery_id=p_brewery) then raise exception 'customer not found'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_customer_mapping',p_request_id,
    jsonb_build_object('customerId',p_customer,'qboCustomerId',p_qbo_customer_id));
  if v_replay is not null then return v_replay; end if;
  update public.customers set qbo_customer_id=btrim(p_qbo_customer_id),qbo_realm_id=v_realm
    where id=p_customer and brewery_id=p_brewery;
  v_result:=jsonb_build_object('customerId',p_customer,'qboCustomerId',btrim(p_qbo_customer_id),'realmId',v_realm);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_deposit_mapping (
  p_brewery     uuid,
  p_qbo_item_id text,
  p_request_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_result jsonb;
begin
  if public.staff_role(p_brewery) <> 'admin' then raise insufficient_privilege using message='permission denied'; end if;
  if nullif(btrim(p_qbo_item_id),'') is null then raise exception 'QuickBooks deposit item mapping required'; end if;
  perform 1 from public.qbo_connections where brewery_id=p_brewery and state='connected' for update;
  if not found then raise exception 'QuickBooks connection required'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_deposit_mapping',p_request_id,
    jsonb_build_object('qboItemId',p_qbo_item_id));
  if v_replay is not null then return v_replay; end if;
  update public.qbo_connections set qbo_deposit_item_id=btrim(p_qbo_item_id),updated_at=now() where brewery_id=p_brewery;
  v_result:=jsonb_build_object('qboItemId',btrim(p_qbo_item_id));
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_item_mapping (
  p_brewery     uuid,
  p_sku         uuid,
  p_qbo_item_id text,
  p_request_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_realm text; v_result jsonb;
begin
  if public.staff_role(p_brewery) not in ('admin','sales') then raise insufficient_privilege using message='permission denied'; end if;
  select realm_id into v_realm from public.qbo_connections where brewery_id=p_brewery and state='connected' for share;
  if v_realm is null then raise exception 'QuickBooks connection required'; end if;
  if nullif(btrim(p_qbo_item_id),'') is null then raise exception 'QuickBooks item mapping required'; end if;
  if not exists(select 1 from public.skus where id=p_sku and brewery_id=p_brewery) then raise exception 'SKU not found'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_item_mapping',p_request_id,
    jsonb_build_object('skuId',p_sku,'qboItemId',p_qbo_item_id));
  if v_replay is not null then return v_replay; end if;
  update public.skus set qbo_item_id=btrim(p_qbo_item_id),qbo_realm_id=v_realm where id=p_sku and brewery_id=p_brewery;
  v_result:=jsonb_build_object('skuId',p_sku,'qboItemId',btrim(p_qbo_item_id),'realmId',v_realm);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_qbo_push_defaults (
  p_brewery    uuid,
  p_allow_ach  boolean,
  p_allow_card boolean,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_result jsonb;
begin
  if public.staff_role(p_brewery) <> 'admin' then raise insufficient_privilege using message='permission denied'; end if;
  v_replay:=private.claim_command_request(p_brewery,'set_qbo_push_defaults',p_request_id,
    jsonb_build_object('allowAch',p_allow_ach,'allowCard',p_allow_card));
  if v_replay is not null then return v_replay; end if;
  update public.qbo_connections set allow_online_ach_payment=p_allow_ach,
    allow_online_credit_card_payment=p_allow_card,updated_at=now()
    where brewery_id=p_brewery and state='connected';
  if not found then raise exception 'QuickBooks connection required'; end if;
  v_result:=jsonb_build_object('allowAch',p_allow_ach,'allowCard',p_allow_card);
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.start_qbo_push (
  p_brewery            uuid,
  p_invoice            uuid,
  p_new_attempt_reason text,
  p_request_id         uuid
)
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
  if public.staff_role(p_brewery) not in ('admin','sales') then raise insufficient_privilege using message='permission denied'; end if;
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
      'City',v_ship.city,'CountrySubDivisionCode',v_ship.state,'PostalCode',v_ship.zip));
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

CREATE OR REPLACE FUNCTION public.store_integration_tokens (
  p_brewery       uuid,
  p_provider      text,
  p_connection    uuid,
  p_actor         uuid,
  p_access_token  text,
  p_refresh_token text
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with authorized as (
    select true
    where exists (
      select 1 from public.brewery_users u
      where u.brewery_id = p_brewery
        and u.user_id = p_actor
        and u.role in ('admin', 'sales')
    )
    and (
      (p_provider = 'qbo' and exists (
        select 1 from public.qbo_connections q
        where q.brewery_id = p_brewery and q.id = p_connection and q.state = 'connected'
      ))
      or
      (p_provider = 'square' and exists (
        select 1 from public.pos_connections p
        where p.brewery_id = p_brewery
          and p.provider = p_provider
          and p.id = p_connection
      ))
    )
  ),
  written as (
    insert into private.integration_tokens as t (
      brewery_id, provider, connection_id, access_token, refresh_token
    )
    select p_brewery, p_provider, p_connection, p_access_token, p_refresh_token
    from authorized
    on conflict (brewery_id, provider) do update
      set connection_id = excluded.connection_id,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          credential_version = t.credential_version + 1,
          updated_at = now()
    returning credential_version
  ),
  qbo_version as (
    update public.qbo_connections q set credential_version=w.credential_version
    from written w where p_provider='qbo' and q.brewery_id=p_brewery and q.id=p_connection
    returning true
  )
  select coalesce((select true from written), false);
$function$;

CREATE OR REPLACE FUNCTION public.write_off_invoice (
  p_brewery    uuid,
  p_invoice    uuid,
  p_reason     text,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid; v_inv public.invoices; v_replay jsonb; v_result jsonb;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))>500 then raise exception 'write-off reason must be 1 to 500 characters'; end if;
  v_replay:=private.claim_command_request(p_brewery,'write_off_invoice',p_request_id,
    jsonb_build_object('invoiceId',p_invoice,'reason',btrim(p_reason)));
  if v_replay is not null then return v_replay; end if;
  select * into v_inv from public.invoices where id=p_invoice and brewery_id=p_brewery for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind<>'invoice' or v_inv.qbo_remote_state not in ('voided','deleted') or v_inv.written_off_at is not null then
    raise exception 'only an unwritten-off QuickBooks voided or deleted invoice can be written off';
  end if;
  update public.invoices set written_off_at=now(),written_off_by=v_actor,written_off_reason=btrim(p_reason)
    where id=p_invoice and brewery_id=p_brewery;
  v_result:=jsonb_build_object('invoiceId',p_invoice,'status','written_off','reason',btrim(p_reason));
  return private.complete_command_request(p_request_id,v_result);
end $function$;

ALTER TABLE "private"."portal_order_quotes"
  ADD CONSTRAINT "portal_order_quotes_actor_id_request_id_fkey" FOREIGN KEY (actor_id, request_id) REFERENCES private.command_requests(actor_id, request_id) ON DELETE CASCADE;

ALTER TABLE "private"."portal_order_quotes"
  ADD CONSTRAINT "portal_order_quotes_brewery_id_fkey" FOREIGN KEY (brewery_id) REFERENCES public.breweries(id);

ALTER TABLE "private"."portal_order_quotes"
  ADD CONSTRAINT "portal_order_quotes_customer_id_brewery_id_fkey" FOREIGN KEY (customer_id, brewery_id) REFERENCES public.customers(id, brewery_id);

ALTER TABLE "private"."portal_order_quotes"
  ADD CONSTRAINT "portal_order_quotes_submitted_order_id_brewery_id_fkey" FOREIGN KEY (submitted_order_id, brewery_id) REFERENCES public.orders(id, brewery_id);

ALTER TABLE "private"."qbo_connection_events"
  ADD CONSTRAINT "qbo_connection_events_brewery_id_fkey" FOREIGN KEY (brewery_id) REFERENCES public.breweries(id);

ALTER TABLE "private"."qbo_invoice_sync_batches"
  ADD CONSTRAINT "qbo_invoice_sync_batches_actor_id_request_id_fkey" FOREIGN KEY (actor_id, request_id) REFERENCES private.command_requests(actor_id, request_id) ON DELETE CASCADE;

ALTER TABLE "private"."qbo_oauth_intents"
  ADD CONSTRAINT "qbo_oauth_intents_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);

ALTER TABLE "private"."qbo_oauth_intents"
  ADD CONSTRAINT "qbo_oauth_intents_brewery_id_fkey" FOREIGN KEY (brewery_id) REFERENCES public.breweries(id);

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_check1" CHECK (((written_off_at IS NULL) = (written_off_reason IS NULL)));

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_check" CHECK (((written_off_at IS NULL) = (written_off_by IS NULL)));

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_qbo_cash_collected_cents_check" CHECK ((qbo_cash_collected_cents >= 0));

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_written_off_by_fkey" FOREIGN KEY (written_off_by) REFERENCES auth.users(id);

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_written_off_reason_check" CHECK (((written_off_reason IS NULL) OR ((length(written_off_reason) >= 1) AND (length(written_off_reason) <= 500))));

ALTER TABLE "public"."order_deposit_lines"
  ADD CONSTRAINT "order_deposit_lines_brewery_id_fkey" FOREIGN KEY (brewery_id) REFERENCES public.breweries(id);

ALTER TABLE "public"."order_deposit_lines"
  ADD CONSTRAINT "order_deposit_lines_keg_pool_id_brewery_id_fkey" FOREIGN KEY (keg_pool_id, brewery_id) REFERENCES public.keg_pools(id, brewery_id);

ALTER TABLE "public"."order_deposit_lines"
  ADD CONSTRAINT "order_deposit_lines_order_id_brewery_id_fkey" FOREIGN KEY (order_id, brewery_id) REFERENCES public.orders(id, brewery_id) ON DELETE CASCADE;

ALTER TABLE "public"."order_deposit_lines"
  ADD CONSTRAINT "order_deposit_lines_order_line_id_brewery_id_fkey" FOREIGN KEY (order_line_id, brewery_id) REFERENCES public.order_lines(id, brewery_id) ON DELETE CASCADE;

ALTER TABLE "public"."qbo_connections"
  ADD CONSTRAINT "qbo_connections_remote_revocation_state_check" CHECK ((remote_revocation_state = ANY (ARRAY['not_requested'::text, 'confirmed'::text, 'unresolved'::text])));

ALTER TABLE "public"."qbo_connections"
  ADD CONSTRAINT "qbo_connections_state_check" CHECK ((state = ANY (ARRAY['connected'::text, 'disconnected'::text, 'recovery_required'::text])));

ALTER TABLE "public"."qbo_pushes"
  ADD CONSTRAINT "qbo_pushes_brewery_id_fkey" FOREIGN KEY (brewery_id) REFERENCES public.breweries(id);

ALTER TABLE "public"."qbo_pushes"
  ADD CONSTRAINT "qbo_pushes_invoice_id_brewery_id_fkey" FOREIGN KEY (invoice_id, brewery_id) REFERENCES public.invoices(id, brewery_id);

CREATE VIEW "public"."invoice_totals" WITH (security_invoker=true) AS  SELECT i.id AS invoice_id,
    i.brewery_id,
    i.customer_id,
    i.kind,
    i.qbo_sync_status,
    i.paid_at,
    (COALESCE(sum(l.amount_cents), (0)::bigint))::integer AS subtotal_cents,
    i.qbo_tax_cents,
    i.qbo_total_cents,
    i.qbo_balance_cents,
        CASE
            WHEN ((i.kind = 'invoice'::public.invoice_kind) AND (i.qbo_remote_state = 'live'::public.qbo_remote_state) AND (i.written_off_at IS NULL)) THEN i.qbo_cash_collected_cents
            ELSE 0
        END AS collected_cents
   FROM (public.invoices i
     LEFT JOIN public.invoice_lines l ON ((l.invoice_id = i.id)))
  GROUP BY i.id;

CREATE INDEX qbo_connection_events_brewery_idx ON private.qbo_connection_events USING btree (brewery_id, created_at DESC);

CREATE INDEX order_deposit_lines_brewery_idx ON public.order_deposit_lines USING btree (brewery_id);

CREATE INDEX order_deposit_lines_order_idx ON public.order_deposit_lines USING btree (order_id);

CREATE UNIQUE INDEX qbo_connections_current_realm_uidx ON public.qbo_connections USING btree (realm_id)
  WHERE (state <> 'disconnected'::text);

CREATE INDEX qbo_pushes_brewery_invoice_idx ON public.qbo_pushes USING btree (brewery_id, invoice_id, created_at DESC);

CREATE UNIQUE INDEX qbo_pushes_one_pending_idx ON public.qbo_pushes USING btree (invoice_id)
  WHERE (status = 'pending'::public.qbo_sync_status);

CREATE TRIGGER qbo_connections_identity_purge_mappings
  AFTER UPDATE OF id, realm_id ON public.qbo_connections
  FOR EACH ROW
  EXECUTE FUNCTION private.purge_qbo_identity();

CREATE POLICY "customer_read" ON "public"."order_deposit_lines"
  FOR SELECT
  TO PUBLIC
  USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.customer_id IN ( SELECT public.my_customer_ids() AS my_customer_ids)))));

CREATE POLICY "staff_read" ON "public"."order_deposit_lines"
  FOR SELECT
  TO PUBLIC
  USING (public.is_staff_of(brewery_id));

CREATE POLICY "integration_operator_read" ON "public"."qbo_pushes"
  FOR SELECT
  TO PUBLIC
  USING ((public.staff_role(brewery_id) = ANY (ARRAY['admin'::public.staff_role, 'sales'::public.staff_role])));

REVOKE ALL ON FUNCTION "private"."portal_quote_snapshot"(uuid, uuid, uuid, date, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."portal_quote_snapshot"(uuid, uuid, uuid, date, text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."purge_qbo_identity"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."purge_qbo_identity"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."begin_qbo_disconnect"(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."begin_qbo_disconnect"(uuid, uuid, uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."begin_qbo_invoice_sync"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."begin_qbo_invoice_sync"(uuid, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."begin_qbo_oauth"(uuid, text, text, text, uuid, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."begin_qbo_oauth"(uuid, text, text, text, uuid, text[]) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cas_integration_tokens"(uuid, text, uuid, uuid, bigint, text, text, timestamp WITH time zone, integer, integer, integer) FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."cas_integration_tokens"(uuid, text, uuid, uuid, bigint, text, text, timestamp WITH time zone, integer, integer, integer)
  TO "postgres", "service_role";

REVOKE ALL
  ON FUNCTION "public"."cas_portal_qbo_payment_tokens"(uuid, uuid, uuid, uuid, uuid, text, text, text[], bigint, text, text, timestamp WITH time zone, integer, integer, integer)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."cas_portal_qbo_payment_tokens"(uuid, uuid, uuid, uuid, uuid, text, text, text[], bigint, text, text, timestamp WITH time zone, integer, integer, integer)
  TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."claim_qbo_oauth"(text, uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."claim_qbo_oauth"(text, uuid, uuid, text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."complete_qbo_invoice_sync"(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."complete_qbo_invoice_sync"(uuid, uuid, uuid, uuid, text, jsonb) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."complete_qbo_oauth"(uuid, uuid, text, text, text, text, timestamp WITH time zone, integer, integer, integer, text[]) FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."complete_qbo_oauth"(uuid, uuid, text, text, text, text, timestamp WITH time zone, integer, integer, integer, text[])
  TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."confirm_portal_qbo_payment"(uuid, uuid, uuid, uuid, uuid, text, text, bigint, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."confirm_portal_qbo_payment"(uuid, uuid, uuid, uuid, uuid, text, text, bigint, text[]) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."fail_qbo_oauth"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."fail_qbo_oauth"(uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."finish_portal_quote_tax"(uuid, uuid, uuid, uuid, uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."finish_portal_quote_tax"(uuid, uuid, uuid, uuid, uuid, integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."finish_qbo_disconnect"(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."finish_qbo_disconnect"(uuid, uuid, uuid, uuid, boolean) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."finish_qbo_push"(uuid, uuid, uuid, text, text, text, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."finish_qbo_push"(uuid, uuid, uuid, text, text, text, jsonb, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."portal_quote_order"(uuid, uuid, uuid, date, text, text, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."portal_quote_order"(uuid, uuid, uuid, date, text, text, jsonb, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."portal_submit_quote"(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."portal_submit_quote"(uuid, uuid, uuid, uuid, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."read_integration_tokens"(uuid, text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."read_integration_tokens"(uuid, text, uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."read_portal_qbo_payment"(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."read_portal_qbo_payment"(uuid, uuid, uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."read_portal_quote_tax"(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."read_portal_quote_tax"(uuid, uuid, uuid, uuid) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_qbo_customer_mapping"(uuid, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_qbo_customer_mapping"(uuid, uuid, text, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_qbo_deposit_mapping"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_qbo_deposit_mapping"(uuid, text, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_qbo_item_mapping"(uuid, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_qbo_item_mapping"(uuid, uuid, text, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_qbo_push_defaults"(uuid, boolean, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_qbo_push_defaults"(uuid, boolean, boolean, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."start_qbo_push"(uuid, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."start_qbo_push"(uuid, uuid, text, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."write_off_invoice"(uuid, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."write_off_invoice"(uuid, uuid, text, uuid) TO "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."portal_order_quotes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."qbo_connection_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."qbo_invoice_sync_batches" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."qbo_oauth_intents" TO "postgres";

GRANT SELECT ON TABLE "public"."order_deposit_lines" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_deposit_lines" TO "postgres", "service_role";

GRANT SELECT ON TABLE "public"."qbo_pushes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."qbo_pushes" TO "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."qbo_pushes" TO "service_role";

GRANT USAGE ON TYPE "public"."qbo_remote_state" TO "postgres";

GRANT SELECT ON TABLE "public"."invoice_totals" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_totals" TO "postgres", "service_role";

ALTER TABLE "public"."qbo_pushes"
  ADD CONSTRAINT "qbo_pushes_supersedes_push_id_fkey" FOREIGN KEY (supersedes_push_id) REFERENCES public.qbo_pushes(id);

-- ---------------------------------------------------------------- Square lifecycle and explicit provider identity
CREATE TABLE private.square_oauth_intents (
  id uuid PRIMARY KEY DEFAULT private.new_uuid(),
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  state_hash text NOT NULL UNIQUE,
  redirect_uri text NOT NULL,
  provider_intent text NOT NULL CHECK (provider_intent IN ('connect','reconnect')),
  requested_scopes text[] NOT NULL CHECK (requested_scopes = ARRAY['ITEMS_READ','ITEMS_WRITE','MERCHANT_PROFILE_READ','ORDERS_READ']::text[]),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  exchange_state text NOT NULL DEFAULT 'pending' CHECK (exchange_state IN ('pending','exchanging','completed','recovery_required')),
  cleanup_state text NOT NULL DEFAULT 'not_required' CHECK (cleanup_state IN ('not_required','pending','confirmed','unresolved')),
  cleanup_merchant_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.square_oauth_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.square_oauth_intents FROM public,anon,authenticated,service_role;

ALTER TABLE public.pos_connections RENAME COLUMN expires_at TO access_expires_at;
ALTER TABLE public.pos_connections
  ADD COLUMN merchant_label text,
  ADD COLUMN state text NOT NULL DEFAULT 'connected' CHECK (state IN ('connected','disconnected','recovery_required')),
  ADD COLUMN refresh_expires_at timestamptz,
  ADD COLUMN refresh_hard_expires_at timestamptz,
  ADD COLUMN remote_revocation_state text NOT NULL DEFAULT 'not_requested' CHECK (remote_revocation_state IN ('not_requested','pending','confirmed','unresolved')),
  ADD COLUMN last_error text,
  ADD COLUMN credential_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN catalog_sync_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN granted_scopes text[] NOT NULL DEFAULT '{}'::text[];
CREATE UNIQUE INDEX pos_connections_current_merchant_idx ON public.pos_connections(merchant_id)
  WHERE state='connected' AND merchant_id IS NOT NULL;

ALTER TABLE public.pos_locations ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE public.pos_locations
  ADD COLUMN external_name text,
  ADD COLUMN external_status text,
  ADD COLUMN available boolean NOT NULL DEFAULT true,
  ADD COLUMN last_seen_at timestamptz;
CREATE UNIQUE INDEX pos_locations_one_local_idx ON public.pos_locations(connection_id,location_id)
  WHERE location_id IS NOT NULL;

ALTER TABLE public.pos_item_mappings ADD COLUMN external_variation_id text NOT NULL DEFAULT '';
ALTER TABLE public.pos_item_mappings DROP CONSTRAINT pos_item_mappings_pkey;
ALTER TABLE public.pos_item_mappings ADD PRIMARY KEY(connection_id,external_item_id,external_variation_id);
ALTER TABLE public.pos_sales ADD COLUMN external_variation_id text NOT NULL DEFAULT '';

CREATE TABLE public.pos_catalog_variations (
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  external_item_id text NOT NULL CHECK (length(btrim(external_item_id))>0),
  external_variation_id text NOT NULL CHECK (length(btrim(external_variation_id))>0),
  external_item_name text,
  external_variation_name text,
  source_version bigint NOT NULL CHECK (source_version>=0),
  available boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(connection_id,external_item_id,external_variation_id),
  UNIQUE(connection_id,external_item_id,external_variation_id,brewery_id),
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id)
);
CREATE INDEX pos_catalog_variations_brewery_idx ON public.pos_catalog_variations(brewery_id);
ALTER TABLE public.pos_catalog_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON public.pos_catalog_variations FOR SELECT
  USING (public.staff_role(brewery_id) IN ('admin','warehouse'));
GRANT SELECT ON public.pos_catalog_variations TO authenticated;
GRANT ALL ON public.pos_catalog_variations TO service_role;

CREATE TABLE private.square_catalog_syncs (
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  merchant_id text NOT NULL,
  credential_version bigint NOT NULL,
  catalog_generation bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id),
  FOREIGN KEY(actor_id,request_id) REFERENCES private.command_requests(actor_id,request_id) ON DELETE CASCADE,
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id)
);
ALTER TABLE private.square_catalog_syncs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.square_catalog_syncs FROM public,anon,authenticated,service_role;

CREATE TABLE private.square_disconnects (
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  credential_version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id),
  FOREIGN KEY(actor_id,request_id) REFERENCES private.command_requests(actor_id,request_id) ON DELETE CASCADE,
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id)
);
ALTER TABLE private.square_disconnects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.square_disconnects FROM public,anon,authenticated,service_role;

DROP VIEW public.pos_unmapped_items;
CREATE VIEW public.pos_unmapped_items WITH (security_invoker=true) AS
  SELECT DISTINCT s.brewery_id,s.connection_id,s.external_item_id,s.external_variation_id
  FROM public.pos_sales s
  LEFT JOIN public.pos_item_mappings m ON m.connection_id=s.connection_id
    AND m.external_item_id=s.external_item_id AND m.external_variation_id=s.external_variation_id
  WHERE m.connection_id IS NULL AND s.external_item_id IS NOT NULL;
GRANT SELECT ON public.pos_unmapped_items TO authenticated;

CREATE OR REPLACE FUNCTION private.reconcile_pos_sale(p_brewery uuid,p_sale uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.pos_sales; m public.pos_item_mappings; f public.formats; v_location uuid; v_brand uuid; v_ounces numeric; v_format uuid;
BEGIN
  SELECT * INTO s FROM public.pos_sales WHERE id=p_sale AND brewery_id=p_brewery FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.pos_sale_expectations WHERE sale_id=p_sale AND brewery_id=p_brewery) THEN RETURN true; END IF;
  SELECT location_id INTO v_location FROM public.pos_locations WHERE connection_id=s.connection_id
    AND external_location_id=s.external_location_id AND brewery_id=p_brewery FOR SHARE;
  IF v_location IS NULL THEN RETURN false; END IF;
  SELECT * INTO m FROM public.pos_item_mappings WHERE connection_id=s.connection_id
    AND external_item_id=s.external_item_id AND external_variation_id=s.external_variation_id AND brewery_id=p_brewery FOR SHARE;
  IF NOT FOUND OR m.ignored THEN RETURN false; END IF;
  IF m.format_id IS NOT NULL THEN
    SELECT * INTO f FROM public.formats WHERE id=m.format_id AND brewery_id=p_brewery FOR SHARE;
    IF f.basis<>'poured' THEN RAISE EXCEPTION 'map a brand-owned poured format'; END IF;
    v_brand:=f.brand_id; v_format:=f.id; v_ounces:=f.ounces;
  ELSE
    SELECT brand_id,format_id INTO v_brand,v_format FROM public.skus WHERE id=m.sku_id AND brewery_id=p_brewery FOR SHARE;
    PERFORM 1 FROM public.formats WHERE id=v_format AND brewery_id=p_brewery FOR SHARE;
    PERFORM 1 FROM public.format_components c JOIN public.formats child ON child.id=c.child_format_id AND child.brewery_id=c.brewery_id
      WHERE c.parent_format_id=v_format AND c.brewery_id=p_brewery ORDER BY child.id FOR SHARE OF child;
    SELECT bbl_per_unit*3968 INTO v_ounces FROM public.format_volumes WHERE id=v_format AND brewery_id=p_brewery;
  END IF;
  IF v_ounces IS NULL OR v_ounces<=0 OR v_ounces::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'serving volume is unavailable'; END IF;
  INSERT INTO public.pos_sale_expectations(sale_id,brewery_id,location_id,brand_id,format_id,sku_id,serving_ounces,expected_bbl)
  VALUES(p_sale,p_brewery,v_location,v_brand,v_format,m.sku_id,v_ounces,s.qty*v_ounces/3968);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.reconcile_pos_sale(uuid,uuid) FROM public,anon,authenticated,service_role;

CREATE FUNCTION public.begin_square_oauth(p_brewery uuid,p_redirect_uri text,p_state_hash text,p_provider_intent text,p_request_id uuid,p_requested_scopes text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE replay jsonb; intent uuid;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin']::public.staff_role[]);
  IF p_requested_scopes<>ARRAY['ITEMS_READ','ITEMS_WRITE','MERCHANT_PROFILE_READ','ORDERS_READ']::text[] THEN RAISE EXCEPTION 'oauth scopes invalid'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=p_brewery FOR UPDATE;
  replay:=private.claim_command_request(p_brewery,'connect_square',p_request_id,jsonb_build_object('redirectUri',p_redirect_uri,'stateHash',p_state_hash,'providerIntent',p_provider_intent,'requestedScopes',p_requested_scopes));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections WHERE brewery_id=p_brewery AND provider='square' AND remote_revocation_state='pending')
    OR EXISTS(SELECT 1 FROM private.square_oauth_intents WHERE brewery_id=p_brewery AND cleanup_state='pending') THEN
    RAISE EXCEPTION 'Square authorization cleanup is still pending' USING errcode='MG409'; END IF;
  UPDATE private.square_oauth_intents SET consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
    WHERE brewery_id=p_brewery AND exchange_state IN ('pending','exchanging');
  INSERT INTO private.square_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at)
    VALUES(p_brewery,auth.uid(),p_state_hash,p_redirect_uri,p_provider_intent,p_requested_scopes,now()+interval '10 minutes') RETURNING id INTO intent;
  replay:=jsonb_build_object('intentId',intent);
  PERFORM private.complete_command_request(p_request_id,replay);
  RETURN replay;
END $$;

CREATE FUNCTION public.claim_square_oauth(p_state_hash text,p_actor uuid,p_brewery uuid,p_redirect_uri text)
RETURNS TABLE(intent_id uuid,brewery_id uuid,provider_intent text,requested_scopes text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN QUERY UPDATE private.square_oauth_intents i SET consumed_at=now(),exchange_state='exchanging'
    WHERE i.state_hash=p_state_hash AND i.actor_id=p_actor AND i.brewery_id=p_brewery AND i.redirect_uri=p_redirect_uri
      AND i.consumed_at IS NULL AND i.exchange_state='pending' AND i.expires_at>=now()
      AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=i.brewery_id AND u.user_id=p_actor AND u.role='admin')
      AND NOT EXISTS(SELECT 1 FROM public.pos_connections c WHERE c.brewery_id=i.brewery_id AND c.provider='square' AND c.remote_revocation_state='pending')
      AND NOT EXISTS(SELECT 1 FROM private.square_oauth_intents cleanup WHERE cleanup.brewery_id=i.brewery_id AND cleanup.cleanup_state='pending')
    RETURNING i.id,i.brewery_id,i.provider_intent,i.requested_scopes;
END $$;

CREATE FUNCTION public.fail_square_oauth(p_intent uuid,p_actor uuid,p_cleanup_state text,p_merchant_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.square_oauth_intents;
BEGIN
  IF p_cleanup_state NOT IN ('not_required','pending','confirmed','unresolved') THEN
    RAISE EXCEPTION 'Square cleanup state invalid'; END IF;
  IF (p_cleanup_state='not_required' AND p_merchant_id IS NOT NULL)
    OR (p_cleanup_state<>'not_required' AND (p_merchant_id IS NULL OR btrim(p_merchant_id)='')) THEN
    RAISE EXCEPTION 'Square cleanup merchant invalid'; END IF;
  SELECT brewery_id INTO i.brewery_id FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.breweries WHERE id=i.brewery_id FOR UPDATE;
  SELECT * INTO i FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor FOR UPDATE;
  IF p_cleanup_state='not_required' THEN
    UPDATE private.square_oauth_intents SET exchange_state='recovery_required',cleanup_state='not_required'
      WHERE id=p_intent AND actor_id=p_actor AND exchange_state='exchanging';
    RETURN FOUND;
  END IF;
  IF p_cleanup_state='pending' THEN
    IF NOT (i.exchange_state='exchanging' OR (i.exchange_state='recovery_required' AND i.cleanup_state='not_required')) THEN
      RETURN i.exchange_state='recovery_required' AND i.cleanup_state='pending' AND i.cleanup_merchant_id=p_merchant_id; END IF;
    UPDATE private.square_oauth_intents SET exchange_state='recovery_required',cleanup_state='pending',cleanup_merchant_id=p_merchant_id
      WHERE id=p_intent;
    RETURN true;
  END IF;
  IF i.exchange_state='recovery_required' AND i.cleanup_state='pending' AND i.cleanup_merchant_id=p_merchant_id THEN
    UPDATE private.square_oauth_intents SET cleanup_state=p_cleanup_state WHERE id=p_intent;
    RETURN true;
  END IF;
  IF p_cleanup_state='unresolved' AND (i.exchange_state='exchanging'
      OR (i.exchange_state='recovery_required' AND i.cleanup_state='not_required')) THEN
    UPDATE private.square_oauth_intents SET exchange_state='recovery_required',cleanup_state='unresolved',cleanup_merchant_id=p_merchant_id
      WHERE id=p_intent;
    RETURN true;
  END IF;
  RETURN i.exchange_state='recovery_required' AND i.cleanup_state=p_cleanup_state AND i.cleanup_merchant_id=p_merchant_id;
END
$$;

CREATE FUNCTION public.complete_square_oauth(p_intent uuid,p_actor uuid,p_merchant_id text,p_merchant_label text,
  p_access_token text,p_refresh_token text,p_access_expires_at timestamptz,p_granted_scopes text[],p_locations jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.square_oauth_intents; c public.pos_connections; v_id uuid:=private.new_uuid(); v_version bigint;
  v_sync_result jsonb:=jsonb_build_object('synced',false,'superseded',true,'errorCode','connection_changed');
BEGIN
  SELECT brewery_id INTO i.brewery_id FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'oauth state invalid'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=i.brewery_id FOR UPDATE;
  SELECT * INTO i FROM private.square_oauth_intents WHERE id=p_intent FOR UPDATE;
  IF i.id IS NULL OR i.actor_id<>p_actor OR i.exchange_state<>'exchanging'
    OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=i.brewery_id AND u.user_id=p_actor AND u.role='admin') THEN
    RAISE EXCEPTION 'oauth state invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections current_connection WHERE current_connection.provider='square'
      AND current_connection.remote_revocation_state='pending'
      AND (current_connection.brewery_id=i.brewery_id OR current_connection.merchant_id=p_merchant_id))
    OR EXISTS(SELECT 1 FROM private.square_oauth_intents pending WHERE pending.id<>i.id AND pending.cleanup_state='pending'
      AND (pending.brewery_id=i.brewery_id OR pending.cleanup_merchant_id=p_merchant_id)) THEN
    RAISE EXCEPTION 'Square authorization cleanup is still pending' USING errcode='MG409';
  END IF;
  IF p_merchant_id IS NULL OR btrim(p_merchant_id)='' OR p_access_token IS NULL OR p_refresh_token IS NULL
    OR p_granted_scopes IS NULL OR NOT p_granted_scopes<@i.requested_scopes OR jsonb_typeof(p_locations)<>'array' THEN
    RAISE EXCEPTION 'oauth response invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections x WHERE x.merchant_id=p_merchant_id AND x.brewery_id<>i.brewery_id AND x.state='connected') THEN
    RAISE EXCEPTION 'Square seller is already connected to another brewery' USING errcode='MG409';
  END IF;
  SELECT current_connection.id,current_connection.merchant_id INTO c.id,c.merchant_id
    FROM public.pos_connections current_connection WHERE current_connection.brewery_id=i.brewery_id
      AND current_connection.provider='square';
  IF c.id IS NOT NULL THEN
    PERFORM 1 FROM private.command_requests request
      JOIN private.square_catalog_syncs sync ON sync.actor_id=request.actor_id AND sync.request_id=request.request_id
      WHERE sync.connection_id=c.id AND request.result IS NULL
      ORDER BY request.actor_id,request.request_id FOR UPDATE OF request;
    UPDATE private.command_requests request SET result=v_sync_result
      FROM private.square_catalog_syncs sync
      WHERE sync.actor_id=request.actor_id AND sync.request_id=request.request_id
        AND sync.connection_id=c.id AND request.result IS NULL;
  END IF;
  SELECT * INTO c FROM public.pos_connections WHERE brewery_id=i.brewery_id AND provider='square' FOR UPDATE;
  IF c.id IS NOT NULL AND c.merchant_id IS DISTINCT FROM p_merchant_id THEN
    IF EXISTS(SELECT 1 FROM public.pos_sales WHERE connection_id=c.id)
      OR EXISTS(SELECT 1 FROM public.pos_sales_coverage WHERE connection_id=c.id) THEN
      RAISE EXCEPTION 'Square seller cannot be replaced while retained sales history exists' USING errcode='MG409';
    END IF;
    EXECUTE $cleanup$UPDATE private.square_publications SET status='superseded',error_code='connection_changed',
      result=jsonb_build_object('published',false,'superseded',true,'errorCode','connection_changed'),finished_at=now()
      WHERE connection_id=$1 AND status IN ('needs_snapshot','prepared')$cleanup$ USING c.id;
    EXECUTE $cleanup$UPDATE private.square_menu_publications SET status='superseded',
      result=jsonb_build_object('published',false,'superseded',true,'errorCode','connection_changed'),finished_at=now()
      WHERE connection_id=$1 AND status='publishing'$cleanup$ USING c.id;
    EXECUTE 'DELETE FROM public.pos_catalog_ownership WHERE connection_id=$1' USING c.id;
    EXECUTE 'DELETE FROM public.pos_catalog_items WHERE connection_id=$1' USING c.id;
    DELETE FROM public.pos_menus WHERE connection_id=c.id;
    DELETE FROM public.pos_item_mappings WHERE connection_id=c.id;
    DELETE FROM public.pos_catalog_variations WHERE connection_id=c.id;
    DELETE FROM public.pos_locations WHERE connection_id=c.id;
  END IF;
  IF c.id IS NOT NULL THEN
    UPDATE private.command_requests request SET result=v_sync_result
      FROM private.square_catalog_syncs sync
      WHERE sync.actor_id=request.actor_id AND sync.request_id=request.request_id
        AND sync.connection_id=c.id AND request.result IS NULL;
  END IF;
  INSERT INTO public.pos_connections(id,brewery_id,provider,merchant_id,merchant_label,state,access_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
    VALUES(v_id,i.brewery_id,'square',p_merchant_id,p_merchant_label,'connected',p_access_expires_at,'not_requested',null,1,p_actor,now(),p_granted_scopes)
  ON CONFLICT(brewery_id,provider) DO UPDATE SET merchant_id=excluded.merchant_id,merchant_label=excluded.merchant_label,state='connected',
    access_expires_at=excluded.access_expires_at,remote_revocation_state='not_requested',last_error=null,
    credential_version=pos_connections.credential_version+1,
    catalog_sync_generation=CASE WHEN pos_connections.merchant_id IS DISTINCT FROM excluded.merchant_id THEN 0 ELSE pos_connections.catalog_sync_generation END,
    connected_by=p_actor,updated_at=now(),granted_scopes=excluded.granted_scopes
  RETURNING id,credential_version INTO v_id,v_version;
  INSERT INTO private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    VALUES(i.brewery_id,'square',v_id,p_access_token,p_refresh_token,v_version)
  ON CONFLICT(brewery_id,provider) DO UPDATE SET connection_id=excluded.connection_id,access_token=excluded.access_token,
    refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
  INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
    SELECT i.brewery_id,v_id,x.id,x.name,x.status,true,now()
    FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text)
    WHERE x.id IS NOT NULL AND btrim(x.id)<>''
  ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
    external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
  UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=v_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text) WHERE x.id=l.external_location_id);
  UPDATE private.square_oauth_intents SET exchange_state='completed' WHERE id=i.id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cas_integration_tokens(p_brewery uuid,p_provider text,p_connection uuid,p_actor uuid,
  p_expected_version bigint,p_access_token text,p_refresh_token text,p_received_at timestamptz,p_access_seconds integer,p_refresh_seconds integer,p_hard_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_version bigint;
BEGIN
  IF p_provider='square' THEN
    PERFORM 1 FROM public.pos_connections p WHERE p.brewery_id=p_brewery AND p.id=p_connection
      AND p.state='connected' AND p.credential_version=p_expected_version FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  UPDATE private.integration_tokens t SET access_token=p_access_token,refresh_token=p_refresh_token,
    credential_version=credential_version+1,updated_at=now()
  WHERE t.brewery_id=p_brewery AND t.provider=p_provider AND t.connection_id=p_connection AND t.credential_version=p_expected_version
    AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
      AND ((p_provider='square' AND u.role IN ('admin','warehouse')) OR (p_provider='qbo' AND u.role IN ('admin','sales'))))
    AND ((p_provider='qbo' AND EXISTS(SELECT 1 FROM public.qbo_connections q WHERE q.brewery_id=p_brewery AND q.id=p_connection AND q.state='connected'))
      OR (p_provider='square' AND EXISTS(SELECT 1 FROM public.pos_connections p WHERE p.brewery_id=p_brewery AND p.id=p_connection AND p.state='connected')))
  RETURNING credential_version INTO v_version;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_provider='qbo' THEN
    UPDATE public.qbo_connections SET access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),
      refresh_expires_at=CASE WHEN p_refresh_seconds IS NULL THEN null ELSE p_received_at+make_interval(secs=>p_refresh_seconds) END,
      refresh_hard_expires_at=CASE WHEN p_hard_seconds IS NULL THEN refresh_hard_expires_at ELSE p_received_at+make_interval(secs=>p_hard_seconds) END,
      credential_version=v_version,updated_at=now() WHERE brewery_id=p_brewery AND id=p_connection;
  ELSE
    UPDATE public.pos_connections SET access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),credential_version=v_version,updated_at=now()
      WHERE brewery_id=p_brewery AND id=p_connection AND provider='square';
    PERFORM private.supersede_square_publications(p_connection);
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.read_integration_tokens(p_brewery uuid,p_provider text,p_connection uuid,p_actor uuid)
RETURNS TABLE(access_token text,refresh_token text,credential_version bigint,access_expires_at timestamptz,refresh_expires_at timestamptz,refresh_hard_expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT t.access_token,t.refresh_token,t.credential_version,coalesce(q.access_expires_at,p.access_expires_at),q.refresh_expires_at,q.refresh_hard_expires_at
  FROM private.integration_tokens t
  LEFT JOIN public.qbo_connections q ON p_provider='qbo' AND q.brewery_id=t.brewery_id AND q.id=t.connection_id
  LEFT JOIN public.pos_connections p ON p_provider='square' AND p.brewery_id=t.brewery_id AND p.id=t.connection_id
  WHERE t.brewery_id=p_brewery AND t.provider=p_provider AND t.connection_id=p_connection
    AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND u.role IN ('admin','sales'))
    AND ((p_provider='qbo' AND q.state='connected') OR (p_provider='square' AND p.state='connected'))
$$;

CREATE FUNCTION public.begin_square_catalog_sync(p_brewery uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; request private.command_requests; connection public.pos_connections; attempt private.square_catalog_syncs;
  token_version bigint; payload_hash bytea:=extensions.digest('{}'::jsonb::text,'sha256');
BEGIN
  actor:=private.assert_staff(p_brewery,ARRAY['admin']::public.staff_role[]);
  SELECT * INTO request FROM private.command_requests WHERE actor_id=actor AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'sync_square_catalog' OR request.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'request id was already used with a different payload' USING errcode='MG409';
    END IF;
    IF request.result IS NOT NULL THEN RETURN jsonb_build_object('replayResult',request.result); END IF;
    SELECT * INTO attempt FROM private.square_catalog_syncs WHERE actor_id=actor AND request_id=p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square catalog sync request is incomplete' USING errcode='MG409'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.brewery_id=p_brewery AND c.id=attempt.connection_id AND c.merchant_id=attempt.merchant_id AND c.state='connected'
        AND c.credential_version=attempt.credential_version AND c.catalog_sync_generation<attempt.catalog_generation
        AND t.credential_version=attempt.credential_version
        AND NOT EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
          WHERE newer.connection_id=attempt.connection_id AND newer.catalog_generation>attempt.catalog_generation)) THEN
      RAISE EXCEPTION 'Square connection changed' USING errcode='MG409';
    END IF;
    RETURN jsonb_build_object('actorId',actor,'connectionId',attempt.connection_id,'merchantId',attempt.merchant_id,
      'credentialVersion',attempt.credential_version,'catalogGeneration',attempt.catalog_generation,'requestId',p_request_id);
  END IF;

  SELECT * INTO connection FROM public.pos_connections c
    WHERE c.brewery_id=p_brewery AND c.provider='square' AND c.state='connected' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection required'; END IF;
  SELECT credential_version INTO token_version FROM private.integration_tokens t
    WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=connection.id FOR SHARE;
  IF NOT FOUND OR token_version<>connection.credential_version THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  INSERT INTO private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash)
    VALUES(actor,p_brewery,p_request_id,'sync_square_catalog',payload_hash) ON CONFLICT(actor_id,request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO request FROM private.command_requests WHERE actor_id=actor AND request_id=p_request_id FOR UPDATE;
    IF request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'sync_square_catalog' OR request.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'request id was already used with a different payload' USING errcode='MG409';
    END IF;
    IF request.result IS NOT NULL THEN RETURN jsonb_build_object('replayResult',request.result); END IF;
    SELECT * INTO attempt FROM private.square_catalog_syncs WHERE actor_id=actor AND request_id=p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square catalog sync request is incomplete' USING errcode='MG409'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.brewery_id=p_brewery AND c.id=attempt.connection_id AND c.merchant_id=attempt.merchant_id AND c.state='connected'
        AND c.credential_version=attempt.credential_version AND c.catalog_sync_generation<attempt.catalog_generation
        AND t.credential_version=attempt.credential_version
        AND NOT EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
          WHERE newer.connection_id=attempt.connection_id AND newer.catalog_generation>attempt.catalog_generation)) THEN
      RAISE EXCEPTION 'Square connection changed' USING errcode='MG409';
    END IF;
    RETURN jsonb_build_object('actorId',actor,'connectionId',attempt.connection_id,'merchantId',attempt.merchant_id,
      'credentialVersion',attempt.credential_version,'catalogGeneration',attempt.catalog_generation,'requestId',p_request_id);
  END IF;
  SELECT greatest(connection.catalog_sync_generation,coalesce(max(a.catalog_generation),connection.catalog_sync_generation))+1
    INTO connection.catalog_sync_generation FROM private.square_catalog_syncs a WHERE a.connection_id=connection.id;
  INSERT INTO private.square_catalog_syncs(actor_id,request_id,brewery_id,connection_id,merchant_id,credential_version,catalog_generation)
    VALUES(actor,p_request_id,p_brewery,connection.id,connection.merchant_id,connection.credential_version,connection.catalog_sync_generation)
    RETURNING * INTO attempt;
  RETURN jsonb_build_object('actorId',actor,'connectionId',attempt.connection_id,'merchantId',attempt.merchant_id,
    'credentialVersion',attempt.credential_version,'catalogGeneration',attempt.catalog_generation,'requestId',p_request_id);
END $$;

CREATE FUNCTION public.advance_square_catalog_sync(p_brewery uuid,p_connection uuid,p_actor uuid,p_request_id uuid,
  p_expected_version bigint,p_next_version bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE private.square_catalog_syncs a SET credential_version=p_next_version
    WHERE a.brewery_id=p_brewery AND a.connection_id=p_connection AND a.actor_id=p_actor AND a.request_id=p_request_id
      AND a.credential_version=p_expected_version AND p_next_version>p_expected_version
      AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND u.role='admin')
      AND EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
        ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
        WHERE c.brewery_id=p_brewery AND c.id=p_connection AND c.merchant_id=a.merchant_id AND c.state='connected'
          AND c.credential_version=p_next_version AND c.catalog_sync_generation<a.catalog_generation
          AND t.credential_version=p_next_version
          AND NOT EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
            WHERE newer.connection_id=a.connection_id AND newer.catalog_generation>a.catalog_generation));
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE FUNCTION public.mark_square_authorization_failed(p_brewery uuid,p_connection uuid,p_actor uuid,p_expected_version bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.pos_connections c SET state='recovery_required',last_error='Square authorization expired or was revoked',updated_at=now()
    WHERE c.brewery_id=p_brewery AND c.id=p_connection AND c.provider='square' AND c.state='connected'
      AND c.credential_version=p_expected_version
      AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
        AND u.role IN ('admin','warehouse'))
      AND EXISTS(SELECT 1 FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square'
        AND t.connection_id=p_connection AND t.credential_version=p_expected_version);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 THEN PERFORM private.supersede_square_publications(p_connection); END IF;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.record_square_catalog_snapshot(p_brewery uuid,p_connection uuid,p_actor uuid,p_expected_version bigint,
  p_request_id uuid,p_locations jsonb,p_variations jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request private.command_requests; attempt private.square_catalog_syncs; connection public.pos_connections;
  token_version bigint; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND u.role='admin') THEN
    RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF jsonb_typeof(p_locations)<>'array' OR jsonb_typeof(p_variations)<>'array' THEN RAISE EXCEPTION 'Square snapshot invalid'; END IF;
  SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'sync_square_catalog'
    OR request.payload_hash<>extensions.digest('{}'::jsonb::text,'sha256') THEN
    RAISE EXCEPTION 'Square catalog sync request is invalid' USING errcode='MG409';
  END IF;
  IF request.result IS NOT NULL THEN RETURN request.result; END IF;
  SELECT * INTO attempt FROM private.square_catalog_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR attempt.brewery_id<>p_brewery OR attempt.connection_id<>p_connection OR attempt.credential_version<>p_expected_version THEN
    RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  SELECT * INTO connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery AND c.id=p_connection FOR UPDATE;
  SELECT credential_version INTO token_version FROM private.integration_tokens t
    WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection FOR UPDATE;
  IF connection.id IS NULL OR connection.provider<>'square' OR connection.state<>'connected'
    OR connection.merchant_id<>attempt.merchant_id OR connection.credential_version<>p_expected_version
    OR connection.catalog_sync_generation>=attempt.catalog_generation OR token_version IS DISTINCT FROM p_expected_version
    OR EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
      WHERE newer.connection_id=attempt.connection_id AND newer.catalog_generation>attempt.catalog_generation) THEN
    RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
    SELECT p_brewery,p_connection,x.id,x.name,x.status,true,now() FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text)
    WHERE x.id IS NOT NULL AND btrim(x.id)<>''
  ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
    external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
  UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=p_connection
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text) WHERE x.id=l.external_location_id);
  INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,external_item_name,
    external_variation_name,source_version,available,last_seen_at)
    SELECT p_brewery,p_connection,x."itemId",x."variationId",x."itemName",x."variationName",x.version,x.available,now()
    FROM jsonb_to_recordset(p_variations) AS x("itemId" text,"itemName" text,"variationId" text,"variationName" text,version bigint,available boolean)
    WHERE x."itemId" IS NOT NULL AND btrim(x."itemId")<>'' AND x."variationId" IS NOT NULL AND btrim(x."variationId")<>'' AND x.version>=0 AND x.available IS NOT NULL
  ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET external_item_name=excluded.external_item_name,
    external_variation_name=excluded.external_variation_name,source_version=excluded.source_version,available=excluded.available,last_seen_at=excluded.last_seen_at
    WHERE public.pos_catalog_variations.source_version<=excluded.source_version;
  UPDATE public.pos_catalog_variations v SET available=false,last_seen_at=now() WHERE v.connection_id=p_connection
    AND v.last_seen_at<attempt.created_at
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_variations) AS x("itemId" text,"variationId" text) WHERE x."itemId"=v.external_item_id AND x."variationId"=v.external_variation_id);
  UPDATE public.pos_connections SET catalog_sync_generation=attempt.catalog_generation,updated_at=now()
    WHERE id=p_connection AND brewery_id=p_brewery AND catalog_sync_generation<attempt.catalog_generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM private.supersede_square_publications(p_connection);
  result:=jsonb_build_object('locations',(SELECT count(*) FROM public.pos_locations WHERE connection_id=p_connection AND available),
    'variations',(SELECT count(*) FROM public.pos_catalog_variations WHERE connection_id=p_connection AND available));
  RETURN private.complete_command_request_for(p_actor,p_request_id,result);
END $$;

CREATE FUNCTION public.set_pos_location_mapping(p_brewery uuid,p_external_location text,p_location uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid; old_location uuid; replay jsonb; result jsonb; menu_cleared boolean:=false;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin']::public.staff_role[]);
  replay:=private.claim_command_request(p_brewery,'set_pos_location_mapping',p_request_id,jsonb_build_object('posLocationId',p_external_location,'mgrLocationId',p_location));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  SELECT id INTO c FROM public.pos_connections WHERE brewery_id=p_brewery AND provider='square' AND state='connected' FOR UPDATE;
  IF c IS NULL OR NOT EXISTS(SELECT 1 FROM public.locations WHERE id=p_location AND brewery_id=p_brewery) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT location_id INTO old_location FROM public.pos_locations WHERE connection_id=c AND external_location_id=p_external_location AND brewery_id=p_brewery FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square location not found'; END IF;
  IF old_location IS DISTINCT FROM p_location AND old_location IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.pos_sales_coverage WHERE connection_id=c AND external_location_id=p_external_location AND location_id=old_location) THEN
    RAISE EXCEPTION 'Square location mapping has observed history and cannot be changed in place' USING errcode='MG409';
  END IF;
  IF old_location IS DISTINCT FROM p_location THEN
    DELETE FROM public.pos_menus WHERE connection_id=c AND external_location_id=p_external_location;
    menu_cleared:=FOUND;
  END IF;
  BEGIN
    UPDATE public.pos_locations SET location_id=p_location WHERE connection_id=c AND external_location_id=p_external_location;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'MGR location is already claimed by another Square location' USING errcode='MG409'; END;
  UPDATE public.pos_sales_coverage SET location_id=p_location
    WHERE connection_id=c AND external_location_id=p_external_location AND location_id IS NULL;
  PERFORM private.reconcile_pos_sale(p_brewery,s.id) FROM public.pos_sales s LEFT JOIN public.pos_sale_expectations e ON e.sale_id=s.id
    WHERE s.connection_id=c AND s.external_location_id=p_external_location AND e.sale_id IS NULL;
  result:=jsonb_build_object('mapped',true,'menuCleared',menu_cleared);
  RETURN private.complete_command_request(p_request_id,result);
END $$;

CREATE FUNCTION public.set_pos_item_mapping(p_brewery uuid,p_external_item text,p_external_variation text,p_sku uuid,p_format uuid,p_ignored boolean,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid; replay jsonb; result jsonb; item_name text;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  replay:=private.claim_command_request(p_brewery,'set_pos_item_mapping',p_request_id,jsonb_build_object('externalItemId',p_external_item,'externalVariationId',p_external_variation,'skuId',p_sku,'formatId',p_format,'ignored',p_ignored));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF (p_ignored AND num_nonnulls(p_sku,p_format)<>0) OR (NOT p_ignored AND num_nonnulls(p_sku,p_format)<>1) THEN RAISE EXCEPTION 'mapping target invalid'; END IF;
  SELECT id INTO c FROM public.pos_connections WHERE brewery_id=p_brewery AND provider='square' AND state='connected' FOR UPDATE;
  SELECT external_item_name INTO item_name FROM public.pos_catalog_variations WHERE brewery_id=p_brewery AND connection_id=c
    AND external_item_id=p_external_item AND external_variation_id=p_external_variation AND (available OR EXISTS(
      SELECT 1 FROM public.pos_item_mappings m WHERE m.connection_id=c AND m.external_item_id=p_external_item AND m.external_variation_id=p_external_variation)
      OR EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.connection_id=c AND s.external_variation_id=p_external_variation)) FOR SHARE;
  IF c IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Square variation is unavailable'; END IF;
  IF p_sku IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.skus WHERE id=p_sku AND brewery_id=p_brewery) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF p_format IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.formats WHERE id=p_format AND brewery_id=p_brewery AND basis='poured' AND brand_id IS NOT NULL) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  INSERT INTO public.pos_item_mappings(brewery_id,connection_id,external_item_id,external_variation_id,external_item_name,sku_id,format_id,ignored)
    VALUES(p_brewery,c,p_external_item,p_external_variation,item_name,p_sku,p_format,p_ignored)
  ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET external_item_name=excluded.external_item_name,
    sku_id=excluded.sku_id,format_id=excluded.format_id,ignored=excluded.ignored;
  PERFORM private.reconcile_pos_sale(p_brewery,s.id) FROM public.pos_sales s LEFT JOIN public.pos_sale_expectations e ON e.sale_id=s.id
    WHERE s.connection_id=c AND s.external_variation_id=p_external_variation
      AND (s.external_item_id=p_external_item OR s.external_item_id IS NULL) AND e.sale_id IS NULL;
  result:=jsonb_build_object('mapped',NOT p_ignored,'ignored',p_ignored);
  RETURN private.complete_command_request(p_request_id,result);
END $$;

CREATE FUNCTION public.begin_square_disconnect(p_brewery uuid,p_connection uuid,p_actor uuid,p_request_id uuid)
RETURNS TABLE(access_token text,replay_result jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request private.command_requests; connection public.pos_connections; token text; token_version bigint; next_version bigint;
  payload_hash bytea:=extensions.digest(jsonb_build_object('connectionId',p_connection)::text,'sha256');
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND role='admin') THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=p_brewery FOR UPDATE;
  INSERT INTO private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash)
    VALUES(p_actor,p_brewery,p_request_id,'disconnect_square',payload_hash) ON CONFLICT(actor_id,request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
    IF request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'disconnect_square' OR request.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'request id was already used with a different payload' USING errcode='MG409'; END IF;
    IF request.result IS NOT NULL THEN RETURN QUERY SELECT null::text,request.result; RETURN; END IF;
    RAISE EXCEPTION 'Square disconnect is still being reconciled' USING errcode='MG409';
  END IF;
  UPDATE private.square_oauth_intents SET consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
    WHERE brewery_id=p_brewery AND exchange_state IN ('pending','exchanging');
  SELECT * INTO connection FROM public.pos_connections WHERE brewery_id=p_brewery AND id=p_connection AND state='connected' FOR UPDATE;
  IF NOT FOUND OR connection.remote_revocation_state='pending' THEN RAISE EXCEPTION 'connection not available'; END IF;
  DELETE FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection
    RETURNING t.access_token,t.credential_version INTO token,token_version;
  IF token IS NULL THEN RAISE EXCEPTION 'connection credential not available'; END IF;
  next_version:=greatest(connection.credential_version,token_version)+1;
  UPDATE public.pos_connections SET state='recovery_required',remote_revocation_state='pending',
    last_error='Square authorization revocation is pending',credential_version=next_version,updated_at=now()
    WHERE brewery_id=p_brewery AND id=p_connection AND state='connected';
  IF NOT FOUND THEN RAISE EXCEPTION 'connection not available'; END IF;
  INSERT INTO private.square_disconnects(actor_id,request_id,brewery_id,connection_id,credential_version)
    VALUES(p_actor,p_request_id,p_brewery,p_connection,next_version);
  RETURN QUERY SELECT token,null::jsonb;
END $$;

CREATE FUNCTION public.finish_square_disconnect(p_brewery uuid,p_connection uuid,p_actor uuid,p_request_id uuid,p_revoked boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request private.command_requests; attempt private.square_disconnects;
  payload_hash bytea:=extensions.digest(jsonb_build_object('connectionId',p_connection)::text,'sha256');
  result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState',CASE WHEN p_revoked THEN 'confirmed' ELSE 'unresolved' END);
BEGIN
  PERFORM 1 FROM public.breweries WHERE id=p_brewery FOR UPDATE;
  SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'disconnect_square' OR request.payload_hash<>payload_hash THEN
    RAISE EXCEPTION 'disconnect reconciliation is not available' USING errcode='MG409'; END IF;
  IF request.result IS NOT NULL THEN RETURN request.result; END IF;
  SELECT * INTO attempt FROM private.square_disconnects WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR attempt.brewery_id<>p_brewery OR attempt.connection_id<>p_connection THEN
    RAISE EXCEPTION 'disconnect reconciliation is not available' USING errcode='MG409'; END IF;
  UPDATE public.pos_connections SET state=CASE WHEN p_revoked THEN 'disconnected' ELSE 'recovery_required' END,
    remote_revocation_state=CASE WHEN p_revoked THEN 'confirmed' ELSE 'unresolved' END,
    last_error=CASE WHEN p_revoked THEN null ELSE 'Remote revocation could not be confirmed' END,updated_at=now()
    WHERE brewery_id=p_brewery AND id=p_connection AND state='recovery_required' AND remote_revocation_state='pending'
      AND credential_version=attempt.credential_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'disconnect reconciliation is not available' USING errcode='MG409'; END IF;
  RETURN private.complete_command_request_for(p_actor,p_request_id,result);
END $$;

REVOKE ALL ON FUNCTION public.begin_square_oauth(uuid,text,text,text,uuid,text[]),public.begin_square_catalog_sync(uuid,uuid),
  public.claim_square_oauth(text,uuid,uuid,text),
  public.fail_square_oauth(uuid,uuid,text,text),public.complete_square_oauth(uuid,uuid,text,text,text,text,timestamptz,text[],jsonb),
  public.advance_square_catalog_sync(uuid,uuid,uuid,uuid,bigint,bigint),public.mark_square_authorization_failed(uuid,uuid,uuid,bigint),
  public.record_square_catalog_snapshot(uuid,uuid,uuid,bigint,uuid,jsonb,jsonb),
  public.set_pos_location_mapping(uuid,text,uuid,uuid),public.set_pos_item_mapping(uuid,text,text,uuid,uuid,boolean,uuid),
  public.begin_square_disconnect(uuid,uuid,uuid,uuid),public.finish_square_disconnect(uuid,uuid,uuid,uuid,boolean) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_square_oauth(uuid,text,text,text,uuid,text[]),public.begin_square_catalog_sync(uuid,uuid),
  public.set_pos_location_mapping(uuid,text,uuid,uuid),
  public.set_pos_item_mapping(uuid,text,text,uuid,uuid,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_square_oauth(text,uuid,uuid,text),public.fail_square_oauth(uuid,uuid,text,text),
  public.complete_square_oauth(uuid,uuid,text,text,text,text,timestamptz,text[],jsonb),
  public.advance_square_catalog_sync(uuid,uuid,uuid,uuid,bigint,bigint),public.mark_square_authorization_failed(uuid,uuid,uuid,bigint),
  public.record_square_catalog_snapshot(uuid,uuid,uuid,bigint,uuid,jsonb,jsonb),
  public.begin_square_disconnect(uuid,uuid,uuid,uuid),public.finish_square_disconnect(uuid,uuid,uuid,uuid,boolean) TO postgres,service_role;
SET local check_function_bodies = off;

DROP FUNCTION "private"."claim_command_request"(uuid, text, uuid, jsonb);

DROP FUNCTION "public"."record_inventory_movement"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, uuid);

CREATE TABLE "private"."chat_conversations" (
  "actor_id"   uuid                     NOT NULL,
  "brewery_id" uuid                     NOT NULL,
  "title"      text                     NOT NULL DEFAULT 'New conversation'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chat_conversations_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 120))),
  "id"         uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "chat_conversations_id_brewery_id_key" UNIQUE (id, brewery_id),
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."chat_conversations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."chat_messages" (
  "conversation_id" uuid                     NOT NULL,
  "brewery_id"      uuid                     NOT NULL,
  "actor_id"        uuid                     NOT NULL,
  "role"            text                     NOT NULL,
  "content"         text,
  "result"          jsonb,
  "request_id"      uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chat_messages_check1" CHECK (((role = 'result'::text) = (content IS NULL))),
  CONSTRAINT "chat_messages_check" CHECK (((role = 'result'::text) = (result IS NOT NULL))),
  CONSTRAINT "chat_messages_content_check" CHECK (((content IS NULL) OR ((length(btrim(content)) >= 1) AND (length(btrim(content)) <= 4000)))),
  CONSTRAINT "chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'result'::text]))),
  "id"              uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."chat_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."command_previews" (
  "actor_id"        uuid                     NOT NULL,
  "brewery_id"      uuid                     NOT NULL,
  "command_name"    text                     NOT NULL,
  "rpc_name"        text                     NOT NULL,
  "canonical_input" jsonb                    NOT NULL,
  "effects"         jsonb                    NOT NULL,
  "warnings"        jsonb                    NOT NULL,
  "version"         jsonb                    NOT NULL,
  "conversation_id" uuid                     NOT NULL,
  "expires_at"      timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "command_previews_effects_check" CHECK ((jsonb_typeof(effects) = 'array'::text)),
  CONSTRAINT "command_previews_warnings_check" CHECK ((jsonb_typeof(warnings) = 'array'::text)),
  "token"           uuid                     NOT NULL DEFAULT private.new_uuid(),
  CONSTRAINT "command_previews_pkey" PRIMARY KEY (token),
  CONSTRAINT "command_previews_token_actor_id_brewery_id_rpc_name_convers_key" UNIQUE (token, actor_id, brewery_id, rpc_name, conversation_id)
);

ALTER TABLE "private"."command_previews"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."command_requests"
  ADD COLUMN "origin" text NOT NULL DEFAULT 'ui'::text;

ALTER TABLE "private"."command_requests"
  ADD COLUMN "conversation_id" uuid;

ALTER TABLE "private"."command_requests"
  ADD COLUMN "preview_token" uuid;

CREATE OR REPLACE FUNCTION private.assert_chat_conversation (
  p_brewery      uuid,
  p_conversation uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid := private.assert_chat_member(p_brewery);
begin
  if not exists(select 1 from private.chat_conversations where id=p_conversation and brewery_id=p_brewery and actor_id=v_actor)
    then raise exception 'permission denied' using errcode='42501'; end if;
  return v_actor;
end $function$;

CREATE OR REPLACE FUNCTION private.assert_chat_member (
  p_brewery uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return private.assert_staff(p_brewery,array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]);
end $function$;

CREATE OR REPLACE FUNCTION private.assert_open_occupancy (
  p_brewery   uuid,
  p_occupancy uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_ended timestamptz; v_found boolean;
begin
  if p_occupancy is null then return; end if;
  select true, o.ended_at into v_found, v_ended from public.vessel_occupancies o
  where o.id = p_occupancy and o.brewery_id = p_brewery for update;
  if v_found is null then raise exception 'occupancy not found'; end if;
  if v_ended is not null then raise exception 'occupancy is closed'; end if;
end $function$;

CREATE OR REPLACE FUNCTION private.claim_command_request (
  p_brewery      uuid,
  p_command      text,
  p_request_id   uuid,
  p_payload      jsonb,
  p_origin       text  DEFAULT 'ui'::text,
  p_conversation uuid  DEFAULT NULL::uuid,
  p_preview      uuid  DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid := auth.uid(); v_request private.command_requests;
begin
  if v_actor is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_request_scope(p_brewery);
  insert into private.command_requests (actor_id, brewery_id, request_id, command_name, origin, conversation_id, preview_token, payload_hash)
  values (v_actor, p_brewery, p_request_id, p_command, p_origin, p_conversation, p_preview, extensions.digest(p_payload::text, 'sha256'))
  on conflict (actor_id, request_id) do nothing;
  if found then return null; end if;
  select * into v_request from private.command_requests
    where actor_id = v_actor and request_id = p_request_id for update;
  if v_request.brewery_id is distinct from p_brewery or v_request.command_name <> p_command
     or v_request.origin <> p_origin or v_request.conversation_id is distinct from p_conversation
     or v_request.preview_token is distinct from p_preview
     or v_request.payload_hash <> extensions.digest(p_payload::text, 'sha256') then
    -- Application SQLSTATE (class MG): every unique index raises 23505, so the
    -- replay mismatch gets its own code for the HTTP layer to map to 409.
    raise exception 'request id was already used with a different payload' using errcode = 'MG409';
  end if;
  if v_request.result is null then raise exception 'request is incomplete'; end if;
  return v_request.result;
end $function$;

CREATE OR REPLACE FUNCTION private.inventory_movement_proposal (
  p_brewery      uuid,
  p_sku          uuid,
  p_location     uuid,
  p_bin          uuid,
  p_qty          numeric,
  p_type         public.movement_type,
  p_sale_channel uuid,
  p_dest_state   text,
  p_note         text,
  p_lot          uuid,
  p_lock         boolean              DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_meta jsonb; v_lot jsonb; v_channel jsonb; v_stock_qty numeric; v_stock_bbl numeric;
  v_brand uuid; v_format uuid;
  v_movement_count bigint; v_movement_ids jsonb; v_components jsonb; v_registration jsonb;
  v_effects jsonb; v_warnings jsonb := '[]'::jsonb; v_version jsonb;
begin
  if p_type not in ('opening_balance','production_in','adjustment','depletion','return_in','destruction','loss','sample','festival_removal')
    then raise exception 'movement type is not supported in chat'; end if;
  if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty=0 or p_qty<>round(p_qty,2)
    then raise exception 'invalid movement quantity'; end if;

  if (p_type in ('opening_balance','production_in','return_in') and p_qty<0)
     or (p_type in ('depletion','destruction','loss','sample','festival_removal') and p_qty>0)
    then raise exception 'movement quantity has the wrong sign for its type'; end if;
  if (p_type='depletion') is distinct from (p_sale_channel is not null)
    then raise exception 'depletion requires a sale channel and other movements cannot carry one'; end if;
  if (p_type in ('sample','festival_removal')) is distinct from (p_dest_state is not null)
    or (p_dest_state is not null and p_dest_state !~ '^[A-Z]{2}$')
    then raise exception 'sample and festival removals require a two-letter destination state'; end if;

  if p_lock then
    select brand_id,format_id into v_brand,v_format from public.skus
      where id=p_sku and brewery_id=p_brewery for share;
    perform 1 from public.brands where id=v_brand and brewery_id=p_brewery for share;
    -- The parent row conflicts with complete component replacement, including
    -- inserting a child where no component row existed at preview time.
    perform 1 from public.formats where id=v_format and brewery_id=p_brewery for share;
    perform 1 from public.format_components where brewery_id=p_brewery
      and parent_format_id=v_format order by child_format_id for share;
    perform 1 from public.formats where brewery_id=p_brewery and id in (
      select child_format_id from public.format_components
      where brewery_id=p_brewery and parent_format_id=v_format
    ) order by id for share;
    perform 1 from public.locations where id=p_location and brewery_id=p_brewery for share;
    perform 1 from public.bins where id=p_bin and location_id=p_location and brewery_id=p_brewery for share;
  end if;
  -- Each statement gets a fresh READ COMMITTED snapshot. Build displayed
  -- metadata only after every relevant row lock has completed.
  select jsonb_build_object(
    'skuId',s.id,'skuName',s.name,'skuActive',s.active,
    'brandId',br.id,'brandName',br.name,'formatId',f.id,'formatName',f.name,
    'packageType',f.package_type,'bblPerUnit',fv.bbl_per_unit,
    'locationId',l.id,'locationName',l.name,'locationKind',l.kind,'binId',b.id,'binName',b.name
  ) into v_meta
  from public.skus s
  join public.brands br on br.id=s.brand_id and br.brewery_id=s.brewery_id
  join public.formats f on f.id=s.format_id and f.brewery_id=s.brewery_id
  join public.format_volumes fv on fv.id=f.id and fv.brewery_id=f.brewery_id
  join public.locations l on l.id=p_location and l.brewery_id=s.brewery_id
  join public.bins b on b.id=p_bin and b.location_id=l.id and b.brewery_id=l.brewery_id
  where s.id=p_sku and s.brewery_id=p_brewery;
  if v_meta is null then raise exception 'invalid movement selection'; end if;
  if not (v_meta->>'skuActive')::boolean then raise exception 'inactive SKU cannot receive a new movement'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',child.id,'name',child.name,'qty',fc.qty,
    'bblPerUnit',child.bbl_per_unit) order by child.id),'[]'::jsonb) into v_components
  from public.format_components fc join public.formats child
    on child.id=fc.child_format_id and child.brewery_id=fc.brewery_id
  where fc.brewery_id=p_brewery and fc.parent_format_id=(v_meta->>'formatId')::uuid;

  if p_lot is not null then
    if p_lock then perform 1 from public.lots where id=p_lot and brewery_id=p_brewery for share; end if;
    select to_jsonb(lot) into v_lot from public.lots lot where id=p_lot and brewery_id=p_brewery;
    if not found or not exists(select 1 from public.inventory_movements
      where brewery_id=p_brewery and sku_id=p_sku and lot_id=p_lot)
      then raise exception 'lot does not belong to SKU'; end if;
  end if;

  if p_sale_channel is not null then
    if p_lock then perform 1 from public.sale_channels where id=p_sale_channel and brewery_id=p_brewery for share; end if;
    select jsonb_build_object('id',id,'name',name,'taxTreatment',tax_treatment)
      into v_channel from public.sale_channels where id=p_sale_channel and brewery_id=p_brewery;
    if not found then raise exception 'invalid sale channel'; end if;
  end if;

  select count(*),coalesce(sum(qty),0),coalesce(sum(bbl),0),coalesce(jsonb_agg(id order by id),'[]'::jsonb)
    into v_movement_count,v_stock_qty,v_stock_bbl,v_movement_ids
  from public.inventory_movements where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location
    and bin_id=p_bin and lot_id is not distinct from p_lot;
  if p_qty<0 and -p_qty>v_stock_qty then
    if p_lot is null and exists(select 1 from public.inventory_movements
      where brewery_id=p_brewery and sku_id=p_sku and location_id=p_location and bin_id=p_bin and lot_id is not null)
      then raise exception 'choose the recorded lot for this removal'; end if;
    raise exception 'insufficient selected bin and lot stock';
  end if;

  if p_dest_state is not null then
    if p_lock then perform 1 from public.state_registrations where brewery_id=p_brewery
      and brand_id=(v_meta->>'brandId')::uuid and state=p_dest_state for share; end if;
    select to_jsonb(r) into v_registration from (
      select id,state,registration_no,approved_on,expires_on from public.state_registrations
      where brewery_id=p_brewery and brand_id=(v_meta->>'brandId')::uuid and state=p_dest_state
    ) r;
    if v_registration is null or (v_registration->>'approved_on')::date>current_date
       or (v_registration->>'expires_on')::date<current_date then
      v_warnings:=jsonb_build_array((v_meta->>'brandName')||' is not registered in '||p_dest_state);
    end if;
  end if;

  v_version:=jsonb_build_object(
    'sku',jsonb_build_object('id',v_meta->>'skuId','name',v_meta->>'skuName','active',(v_meta->>'skuActive')::boolean),
    'brand',jsonb_build_object('id',v_meta->>'brandId','name',v_meta->>'brandName'),
    'format',jsonb_build_object('id',v_meta->>'formatId','name',v_meta->>'formatName',
      'packageType',v_meta->>'packageType','bblPerUnit',(v_meta->>'bblPerUnit')::numeric,'components',v_components),
    'location',jsonb_build_object('id',v_meta->>'locationId','name',v_meta->>'locationName','kind',v_meta->>'locationKind'),
    'bin',jsonb_build_object('id',v_meta->>'binId','name',v_meta->>'binName'),
    'lot',case when p_lot is null then null else jsonb_build_object('id',v_lot->>'id','code',v_lot->>'code','packagedOn',v_lot->>'packaged_on','bestBy',v_lot->>'best_by') end,
    'channel',v_channel,
    'registration',v_registration,
    'proposal',jsonb_build_object('qty',p_qty,'type',p_type,'destState',p_dest_state,'note',p_note),
    'stock',jsonb_build_object('movementCount',v_movement_count,'movementIds',v_movement_ids,'qty',v_stock_qty,'bbl',v_stock_bbl));
  v_effects:=jsonb_build_array(jsonb_build_object(
    'label',(v_meta->>'skuName')||' · '||(v_meta->>'locationName')||' · '||(v_meta->>'binName'),
    'qty',p_qty::text,'bbl',round(p_qty*(v_meta->>'bblPerUnit')::numeric,8)::text,
    'stockBeforeQty',v_stock_qty::text,'stockAfterQty',(v_stock_qty+p_qty)::text,
    'stockBeforeBbl',v_stock_bbl::text,'stockAfterBbl',round(v_stock_bbl+p_qty*(v_meta->>'bblPerUnit')::numeric,8)::text,
    'type',p_type,'taxTreatment',v_channel->>'taxTreatment','destinationState',p_dest_state,
    'correction',case when p_type in ('adjustment','loss') then 'reverse_inventory_movement' else null end));
  return jsonb_build_object('effects',v_effects,'warnings',v_warnings,'version',v_version);
end $function$;

CREATE OR REPLACE FUNCTION public.append_chat_message (
  p_brewery      uuid,
  p_conversation uuid,
  p_role         text,
  p_content      text,
  p_request_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid := private.assert_chat_conversation(p_brewery,p_conversation); v_replay jsonb; v_row private.chat_messages;
begin
  if p_role not in ('user','assistant') or p_content is null or length(btrim(p_content)) not between 1 and 4000
    then raise exception 'invalid chat message'; end if;
  v_replay := private.claim_command_request(p_brewery,'append_chat_message',p_request_id,
    jsonb_build_object('conversation',p_conversation,'role',p_role,'content',p_content));
  if v_replay is not null then return v_replay; end if;
  insert into private.chat_messages(conversation_id,brewery_id,actor_id,role,content,request_id)
    values(p_conversation,p_brewery,v_actor,p_role,btrim(p_content),p_request_id) returning * into v_row;
  update private.chat_conversations set updated_at=now() where id=p_conversation and brewery_id=p_brewery and actor_id=v_actor;
  return private.complete_command_request(p_request_id,to_jsonb(v_row));
end $function$;

CREATE OR REPLACE FUNCTION public.create_chat_conversation (
  p_brewery    uuid,
  p_title      text,
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid := private.assert_chat_member(p_brewery); v_replay jsonb; v_row private.chat_conversations;
begin
  if p_title is not null and length(btrim(p_title)) not between 1 and 120 then raise exception 'invalid conversation title'; end if;
  v_replay := private.claim_command_request(p_brewery,'create_chat_conversation',p_request_id,jsonb_build_object('title',p_title));
  if v_replay is not null then return v_replay; end if;
  insert into private.chat_conversations(actor_id,brewery_id,title)
    values(v_actor,p_brewery,coalesce(btrim(p_title),'New conversation')) returning * into v_row;
  return private.complete_command_request(p_request_id,to_jsonb(v_row));
end $function$;

CREATE OR REPLACE FUNCTION public.get_chat_history (
  p_brewery      uuid,
  p_conversation uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid := private.assert_chat_conversation(p_brewery,p_conversation); v_conversation jsonb;
begin
  select jsonb_build_object('id',id,'title',title,'created_at',created_at,'updated_at',updated_at)
    into v_conversation from private.chat_conversations
    where id=p_conversation and brewery_id=p_brewery and actor_id=v_actor;
  return jsonb_build_object('conversation',v_conversation,'messages',coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'role',role,'content',content,'result',result,'request_id',request_id,'created_at',created_at)
      order by created_at,id) from private.chat_messages
    where conversation_id=p_conversation and brewery_id=p_brewery and actor_id=v_actor),'[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.list_chat_conversations (
  p_brewery uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid := private.assert_chat_member(p_brewery);
begin
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc,c.id)
    from (select id,title,created_at,updated_at from private.chat_conversations
      where brewery_id=p_brewery and actor_id=v_actor order by updated_at desc,id limit 50) c),'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.preview_inventory_movement (
  p_brewery      uuid,
  p_sku          uuid,
  p_location     uuid,
  p_bin          uuid,
  p_qty          numeric,
  p_type         public.movement_type,
  p_sale_channel uuid,
  p_dest_state   text,
  p_note         text,
  p_lot          uuid,
  p_conversation uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_actor uuid; v_token uuid := private.new_uuid(); v_input jsonb; v_proposal jsonb;
begin
  v_actor := private.assert_staff(p_brewery,array['admin','warehouse']::public.staff_role[]);
  perform private.assert_chat_conversation(p_brewery,p_conversation);
  v_proposal:=private.inventory_movement_proposal(p_brewery,p_sku,p_location,p_bin,p_qty,p_type,
    p_sale_channel,p_dest_state,p_note,p_lot);
  v_input := jsonb_build_object('brewery',p_brewery,'sku',p_sku,'location',p_location,'bin',p_bin,'qty',p_qty,
    'type',p_type,'sale_channel',p_sale_channel,'dest_state',p_dest_state,'note',p_note,'lot',p_lot);
  insert into private.command_previews(token,actor_id,brewery_id,command_name,rpc_name,canonical_input,effects,warnings,version,conversation_id)
    values(v_token,v_actor,p_brewery,'record_movement','record_inventory_movement',v_input,
      v_proposal->'effects',v_proposal->'warnings',v_proposal->'version',p_conversation);
  return v_proposal||jsonb_build_object('previewToken',v_token);
end $function$;

CREATE OR REPLACE FUNCTION public.record_inventory_movement (
  p_brewery       uuid,
  p_sku           uuid,
  p_location      uuid,
  p_bin           uuid,
  p_qty           numeric,
  p_type          public.movement_type,
  p_sale_channel  uuid,
  p_dest_state    text,
  p_note          text,
  p_request_id    uuid,
  p_lot           uuid                 DEFAULT NULL::uuid,
  p_origin        text                 DEFAULT 'ui'::text,
  p_conversation  uuid                 DEFAULT NULL::uuid,
  p_preview_token uuid                 DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_row public.inventory_movements; v_tax public.tax_treatment; v_actor uuid; v_input jsonb;
  v_preview private.command_previews; v_current jsonb;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  if (p_origin='chat') is distinct from (p_conversation is not null and p_preview_token is not null)
    then raise exception 'chat preview token required'; end if;
  if p_origin not in ('ui','chat') then raise exception 'invalid command origin'; end if;
  if p_origin='chat' and p_type not in ('opening_balance','production_in','adjustment','depletion','return_in','destruction','loss','sample','festival_removal')
    then raise exception 'movement type is not supported in chat'; end if;
  v_input := jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'location', p_location, 'bin', p_bin, 'qty', p_qty, 'type', p_type, 'sale_channel', p_sale_channel, 'dest_state', p_dest_state, 'note', p_note, 'lot', p_lot);
  v_replay := private.claim_command_request(p_brewery, 'record_inventory_movement', p_request_id, v_input,
    p_origin,p_conversation,p_preview_token);
  if v_replay is not null then return v_replay; end if;

  if not exists (select 1 from public.skus where id = p_sku and brewery_id = p_brewery and active) then
    raise exception 'inactive SKU cannot receive a new movement';
  end if;
  if (p_type in ('sample','festival_removal','sale_removal')
      and (p_dest_state is null or p_dest_state !~ '^[A-Z]{2}$'))
     or (p_type not in ('sample','festival_removal','sale_removal') and p_dest_state is not null) then
    raise exception 'classified removals require a two-letter uppercase destination state';
  end if;

  if p_origin='chat' then
    select * into v_preview from private.command_previews
      where token=p_preview_token and actor_id=v_actor and brewery_id=p_brewery
        and command_name='record_movement' and rpc_name='record_inventory_movement'
        and canonical_input=v_input and conversation_id=p_conversation;
    if not found then raise exception 'invalid preview token'; end if;
    if v_preview.expires_at<=now() then raise exception 'expired preview token'; end if;
    -- ponytail: serializes inventory writers; upgrade to shared per-stock
    -- locks across every writer if throughput requires.
    lock table public.inventory_movements in share row exclusive mode;
    v_current:=private.inventory_movement_proposal(p_brewery,p_sku,p_location,p_bin,p_qty,p_type,
      p_sale_channel,p_dest_state,p_note,p_lot,true);
    if v_current->'version' is distinct from v_preview.version
       or v_current->'effects' is distinct from v_preview.effects
       or v_current->'warnings' is distinct from v_preview.warnings then
      raise exception 'preview changed; preview again' using errcode='MG409';
    end if;
    v_tax:=(v_current->'effects'->0->>'taxTreatment')::public.tax_treatment;
  else
    if p_qty is null or p_qty::text in ('NaN','Infinity','-Infinity') or p_qty = 0 or p_qty <> round(p_qty,2) then raise exception 'invalid movement quantity'; end if;
    if p_qty < 0 then
    -- ponytail: global ledger lock; shared stock-key locks across every writer at higher throughput.
      lock table public.inventory_movements in share row exclusive mode;
      if p_lot is null and exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_bin and lot_id is not null)
         and -p_qty > (select coalesce(sum(qty),0) from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_bin and lot_id is null) then raise exception 'choose the recorded lot for this removal'; end if;
    end if;
    if p_lot is not null then
      if not exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and lot_id = p_lot) then raise exception 'lot does not belong to SKU'; end if;
      if p_qty < 0 then
        if -p_qty > (select coalesce(sum(qty),0) from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_bin and lot_id = p_lot) then raise exception 'insufficient selected lot stock'; end if;
      end if;
    end if;
    -- A staff-entered movement has no customer, so the channel default is the
    -- resolved treatment; the composite FK below rejects another brewery's channel.
    if p_sale_channel is not null then
      select tax_treatment into v_tax from public.sale_channels
       where id = p_sale_channel and brewery_id = p_brewery;
    end if;
  end if;
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, note, created_by)
    values (p_brewery, p_sku, p_location, p_bin, p_lot, p_qty, p_type, p_sale_channel, v_tax, p_dest_state, p_note, auth.uid()) returning * into v_row;
  if p_origin='chat' then
    insert into private.chat_messages(conversation_id,brewery_id,actor_id,role,result,request_id)
      values(p_conversation,p_brewery,v_actor,'result',to_jsonb(v_row),p_request_id);
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

CREATE OR REPLACE FUNCTION public.upsert_state_registration (
  p_brewery         uuid,
  p_brand           uuid,
  p_state           text,
  p_registration_no text,
  p_approved_on     date,
  p_expires_on      date,
  p_request_id      uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_replay jsonb; v_row public.state_registrations;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_state_registration', p_request_id,
    jsonb_build_object('brand', p_brand, 'state', p_state, 'registration_no', p_registration_no, 'approved_on', p_approved_on, 'expires_on', p_expires_on));
  if v_replay is not null then return v_replay; end if;
  -- Composer previews lock the same parent row so an absent registration
  -- cannot appear between their warning snapshot and commit.
  perform 1 from public.brands where id=p_brand and brewery_id=p_brewery for update;
  if not found then raise exception 'brand not found'; end if;
  -- the composite FK pins the brand to this brewery, and the conflict key is the brand, so the row hit is this brewery's
  insert into public.state_registrations (brewery_id, brand_id, state, registration_no, approved_on, expires_on)
    values (p_brewery, p_brand, p_state, p_registration_no, p_approved_on, p_expires_on)
    on conflict (brand_id, state) do update
      set registration_no = excluded.registration_no, approved_on = excluded.approved_on, expires_on = excluded.expires_on
    returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;

ALTER TABLE "private"."chat_conversations"
  ADD CONSTRAINT "chat_conversations_brewery_id_fkey" FOREIGN KEY (brewery_id) REFERENCES public.breweries(id);

ALTER TABLE "private"."command_requests"
  ADD CONSTRAINT "command_requests_check1" CHECK (((origin = 'chat'::text) = ((conversation_id IS NOT NULL) AND (preview_token IS NOT NULL))));

ALTER TABLE "private"."command_requests"
  ADD CONSTRAINT "command_requests_origin_check" CHECK ((origin = ANY (ARRAY['ui'::text, 'chat'::text])));

CREATE UNIQUE INDEX chat_messages_request_idx ON private.chat_messages USING btree (actor_id, request_id)
  WHERE (request_id IS NOT NULL);

CREATE INDEX command_previews_expiry_idx ON private.command_previews USING btree (expires_at);

REVOKE ALL ON FUNCTION "private"."assert_chat_conversation"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assert_chat_conversation"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."assert_chat_member"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assert_chat_member"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."claim_command_request"(uuid, text, uuid, jsonb, text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."claim_command_request"(uuid, text, uuid, jsonb, text, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."inventory_movement_proposal"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."inventory_movement_proposal"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."append_chat_message"(uuid, uuid, text, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."append_chat_message"(uuid, uuid, text, text, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_chat_conversation"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_chat_conversation"(uuid, text, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."get_chat_history"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_chat_history"(uuid, uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."list_chat_conversations"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_chat_conversations"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."preview_inventory_movement"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."preview_inventory_movement"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, uuid)
  TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."record_inventory_movement"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, uuid, text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION "public"."record_inventory_movement"(uuid, uuid, uuid, uuid, numeric, public.movement_type, uuid, text, text, uuid, uuid, text, uuid, uuid)
  TO "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."chat_conversations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."chat_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."command_previews" TO "postgres";

ALTER TABLE "private"."chat_messages"
  ADD CONSTRAINT "chat_messages_conversation_id_brewery_id_fkey" FOREIGN KEY (conversation_id, brewery_id) REFERENCES private.chat_conversations(id, brewery_id);

ALTER TABLE "private"."command_previews"
  ADD CONSTRAINT "command_previews_conversation_id_brewery_id_fkey" FOREIGN KEY (conversation_id, brewery_id) REFERENCES private.chat_conversations(id, brewery_id);

CREATE INDEX chat_messages_conversation_idx ON private.chat_messages USING btree (conversation_id, created_at, id);

ALTER TABLE "private"."command_requests"
  ADD CONSTRAINT "command_requests_preview_token_actor_id_brewery_id_command_fkey" FOREIGN KEY (preview_token, actor_id, brewery_id, command_name, conversation_id)
    REFERENCES private.command_previews(token, actor_id, brewery_id, rpc_name, conversation_id) DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------- Square durable sales facts and resumable UPDATED_AT windows
ALTER TABLE public.pos_connections ADD COLUMN sales_synced_through timestamptz;

ALTER TABLE public.pos_sales DROP CONSTRAINT pos_sales_connection_id_external_order_id_external_line_id_key;
ALTER TABLE public.pos_sales DROP CONSTRAINT pos_sales_qty_check;
ALTER TABLE public.pos_sales DROP CONSTRAINT pos_sales_source_version_check;
ALTER TABLE public.pos_sales ALTER COLUMN source_version DROP DEFAULT;
ALTER TABLE public.pos_sales ALTER COLUMN source_version TYPE bigint USING source_version::bigint;
ALTER TABLE public.pos_sales ALTER COLUMN source_version SET DEFAULT 1;
ALTER TABLE public.pos_sales ALTER COLUMN external_variation_id DROP NOT NULL;
ALTER TABLE public.pos_sales ALTER COLUMN qty DROP NOT NULL;
ALTER TABLE public.pos_sales ALTER COLUMN qty TYPE numeric;
ALTER TABLE public.pos_sales ALTER COLUMN gross_cents TYPE bigint;
ALTER TABLE public.pos_sales
  ADD COLUMN merchant_id text,
  ADD COLUMN fact_kind text NOT NULL DEFAULT 'sale' CHECK (fact_kind IN ('sale','return')),
  ADD COLUMN fact_status text NOT NULL DEFAULT 'accepted' CHECK (fact_status IN ('accepted','removed','unsupported')),
  ADD COLUMN source_quantity text,
  ADD COLUMN source_order_updated_at timestamptz,
  ADD COLUMN catalog_version bigint,
  ADD COLUMN quantity_unit jsonb,
  ADD COLUMN source_order_id text,
  ADD COLUMN source_line_id text,
  ADD COLUMN unsupported_reason text,
  ADD COLUMN source_hash text,
  ADD CONSTRAINT pos_sales_fact_shape CHECK (
    (fact_status='accepted' AND qty>0 AND qty::text NOT IN ('NaN','Infinity','-Infinity') AND unsupported_reason IS NULL)
    OR (fact_status='removed' AND qty IS NULL AND unsupported_reason IS NULL)
    OR (fact_status='unsupported' AND qty IS NULL AND length(btrim(unsupported_reason))>0)
  ),
  ADD CONSTRAINT pos_sales_return_source CHECK (
    fact_kind='sale' OR fact_status<>'accepted' OR (source_order_id IS NOT NULL AND source_line_id IS NOT NULL)
  ),
  ADD CONSTRAINT pos_sales_revision_key UNIQUE(connection_id,external_order_id,fact_kind,external_line_id,source_version);

UPDATE public.pos_sales s SET merchant_id=c.merchant_id,source_quantity=s.qty::text,
  source_order_updated_at=s.ingested_at,source_hash=encode(extensions.digest(to_jsonb(s)::text,'sha256'),'hex')
FROM public.pos_connections c WHERE c.id=s.connection_id;

ALTER TABLE public.pos_sale_expectations DROP CONSTRAINT pos_sale_expectations_expected_bbl_check;
ALTER TABLE public.pos_sale_expectations ADD CONSTRAINT pos_sale_expectations_expected_bbl_check
  CHECK (expected_bbl<>0 AND expected_bbl::text NOT IN ('NaN','Infinity','-Infinity'));
ALTER TABLE public.pos_sales_coverage ALTER COLUMN location_id DROP NOT NULL;

CREATE TABLE private.square_order_snapshots (
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  merchant_id text NOT NULL,
  external_order_id text NOT NULL,
  source_version bigint NOT NULL,
  snapshot_hash text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(connection_id,external_order_id,source_version),
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id)
);
ALTER TABLE private.square_order_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.square_order_snapshots FROM public,anon,authenticated,service_role;

CREATE VIEW private.pos_current_sales AS
WITH ranked AS (
  SELECT s.*,coalesce((SELECT max(o.source_version) FROM private.square_order_snapshots o
    WHERE o.connection_id=s.connection_id AND o.external_order_id=s.external_order_id),
    max(s.source_version) OVER (PARTITION BY s.connection_id,s.external_order_id)) AS order_version,row_number() OVER (
    PARTITION BY connection_id,external_order_id,fact_kind,external_line_id
    ORDER BY source_version DESC,id DESC
  ) AS revision_rank
  FROM public.pos_sales s
), current_facts AS (
  SELECT * FROM ranked WHERE revision_rank=1 AND source_version=order_version
)
SELECT f.*,
  f.fact_status='accepted' AND (
    f.fact_kind='sale' OR (
      EXISTS (
        SELECT 1 FROM current_facts source
        WHERE source.connection_id=f.connection_id AND source.external_order_id=f.source_order_id
          AND source.fact_kind='sale' AND source.external_line_id=f.source_line_id
          AND source.fact_status='accepted' AND source.external_variation_id=f.external_variation_id
      )
      AND (SELECT coalesce(sum(r.qty),0) FROM current_facts r
        WHERE r.connection_id=f.connection_id AND r.fact_kind='return' AND r.fact_status='accepted'
          AND r.source_order_id=f.source_order_id AND r.source_line_id=f.source_line_id)
        <= (SELECT source.qty FROM current_facts source
          WHERE source.connection_id=f.connection_id AND source.external_order_id=f.source_order_id
            AND source.fact_kind='sale' AND source.external_line_id=f.source_line_id
            AND source.fact_status='accepted' AND source.external_variation_id=f.external_variation_id)
    )
  ) AS contributes
FROM current_facts f;
REVOKE ALL ON private.pos_current_sales FROM public,anon,authenticated,service_role;

CREATE FUNCTION public.pos_order_versions()
RETURNS TABLE(brewery_id uuid,connection_id uuid,external_order_id text,source_version bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT o.brewery_id,o.connection_id,o.external_order_id,max(o.source_version)
  FROM private.square_order_snapshots o
  WHERE public.staff_role(o.brewery_id) IN ('admin','warehouse')
  GROUP BY o.brewery_id,o.connection_id,o.external_order_id
$$;
REVOKE ALL ON FUNCTION public.pos_order_versions() FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pos_order_versions() TO authenticated;

ALTER TABLE public.pos_catalog_variations
  ADD CONSTRAINT pos_catalog_variations_connection_variation_key UNIQUE(connection_id,external_variation_id);

DROP VIEW public.pos_unmapped_items;
CREATE VIEW public.pos_unmapped_items WITH (security_invoker=true) AS
  WITH order_versions AS (SELECT * FROM public.pos_order_versions()), ranked AS (
    SELECT s.*,coalesce((SELECT o.source_version FROM order_versions o
      WHERE o.connection_id=s.connection_id AND o.external_order_id=s.external_order_id),
      max(s.source_version) OVER (PARTITION BY s.connection_id,s.external_order_id)) AS order_version,row_number() OVER (
      PARTITION BY connection_id,external_order_id,fact_kind,external_line_id
      ORDER BY source_version DESC,id DESC
    ) revision_rank
    FROM public.pos_sales s
  )
  SELECT DISTINCT s.brewery_id,s.connection_id,coalesce(s.external_item_id,c.external_item_id) external_item_id,s.external_variation_id
  FROM ranked s
  LEFT JOIN public.pos_catalog_variations c ON c.connection_id=s.connection_id
    AND c.external_variation_id=s.external_variation_id
  LEFT JOIN public.pos_item_mappings m ON m.connection_id=s.connection_id
    AND m.external_item_id=coalesce(s.external_item_id,c.external_item_id)
    AND m.external_variation_id=s.external_variation_id
  WHERE s.revision_rank=1 AND s.source_version=s.order_version AND s.fact_status<>'removed'
    AND m.connection_id IS NULL AND s.external_variation_id IS NOT NULL;
GRANT SELECT ON public.pos_unmapped_items TO authenticated;

CREATE OR REPLACE FUNCTION private.reconcile_pos_sale(p_brewery uuid,p_sale uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.pos_sales; m public.pos_item_mappings; f public.formats; v_location uuid; v_brand uuid; v_ounces numeric; v_format uuid;
BEGIN
  SELECT * INTO s FROM public.pos_sales WHERE id=p_sale AND brewery_id=p_brewery FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found'; END IF;
  IF s.fact_status<>'accepted' OR s.qty IS NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.pos_sale_expectations WHERE sale_id=p_sale AND brewery_id=p_brewery) THEN RETURN true; END IF;
  SELECT location_id INTO v_location FROM public.pos_locations WHERE connection_id=s.connection_id
    AND external_location_id=s.external_location_id AND brewery_id=p_brewery FOR SHARE;
  IF v_location IS NULL THEN RETURN false; END IF;
  SELECT * INTO m FROM public.pos_item_mappings WHERE connection_id=s.connection_id
    AND external_item_id=coalesce(s.external_item_id,(SELECT c.external_item_id FROM public.pos_catalog_variations c
      WHERE c.connection_id=s.connection_id AND c.external_variation_id=s.external_variation_id))
    AND external_variation_id=s.external_variation_id AND brewery_id=p_brewery FOR SHARE;
  IF NOT FOUND OR m.ignored THEN RETURN false; END IF;
  IF m.format_id IS NOT NULL THEN
    SELECT * INTO f FROM public.formats WHERE id=m.format_id AND brewery_id=p_brewery FOR SHARE;
    IF f.basis<>'poured' THEN RAISE EXCEPTION 'map a brand-owned poured format'; END IF;
    v_brand:=f.brand_id; v_format:=f.id; v_ounces:=f.ounces;
  ELSE
    SELECT brand_id,format_id INTO v_brand,v_format FROM public.skus WHERE id=m.sku_id AND brewery_id=p_brewery FOR SHARE;
    PERFORM 1 FROM public.formats WHERE id=v_format AND brewery_id=p_brewery FOR SHARE;
    PERFORM 1 FROM public.format_components c JOIN public.formats child ON child.id=c.child_format_id AND child.brewery_id=c.brewery_id
      WHERE c.parent_format_id=v_format AND c.brewery_id=p_brewery ORDER BY child.id FOR SHARE OF child;
    SELECT bbl_per_unit*3968 INTO v_ounces FROM public.format_volumes WHERE id=v_format AND brewery_id=p_brewery;
  END IF;
  IF v_ounces IS NULL OR v_ounces<=0 OR v_ounces::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'serving volume is unavailable'; END IF;
  INSERT INTO public.pos_sale_expectations(sale_id,brewery_id,location_id,brand_id,format_id,sku_id,serving_ounces,expected_bbl)
  VALUES(p_sale,p_brewery,v_location,v_brand,v_format,m.sku_id,v_ounces,
    CASE s.fact_kind WHEN 'return' THEN -1 ELSE 1 END*s.qty*v_ounces/3968);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.reconcile_pos_sale(uuid,uuid) FROM public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.taproom_pos_allocations(p_brewery uuid,p_location uuid,p_starts_at timestamptz,p_ends_at timestamptz)
RETURNS TABLE(sale_id uuid,brand_id uuid,expected_bbl numeric,excluded_bbl numeric,unattributed_bbl numeric,split boolean,ignored boolean,unmapped boolean)
LANGUAGE sql STABLE SET search_path='' AS $$
  WITH facts AS (
    SELECT s.id,e.brand_id,e.expected_bbl,e.sku_id,coalesce(m.ignored,false) ignored,s.sold_at,s.fact_status,s.contributes
    FROM private.pos_current_sales s
    LEFT JOIN public.pos_sale_expectations e ON e.sale_id=s.id AND e.brewery_id=p_brewery AND s.contributes
    LEFT JOIN public.pos_locations loc ON loc.connection_id=s.connection_id AND loc.external_location_id=s.external_location_id AND loc.brewery_id=p_brewery
    LEFT JOIN public.pos_catalog_variations c ON c.connection_id=s.connection_id AND c.external_variation_id=s.external_variation_id
    LEFT JOIN public.pos_item_mappings m ON m.connection_id=s.connection_id AND m.external_item_id=coalesce(s.external_item_id,c.external_item_id)
      AND m.external_variation_id=s.external_variation_id AND m.brewery_id=p_brewery
    WHERE s.brewery_id=p_brewery AND s.fact_status<>'removed' AND s.sold_at>p_starts_at AND s.sold_at<=p_ends_at
      AND coalesce(e.location_id,loc.location_id)=p_location
  )
  SELECT f.id,f.brand_id,
    f.expected_bbl*CASE WHEN coalesce(t.n,0)=0 THEN 1 ELSE (t.n-t.excluded)::numeric/t.n END,
    f.expected_bbl*CASE WHEN coalesce(t.n,0)=0 THEN 0 ELSE t.excluded::numeric/t.n END,
    CASE WHEN coalesce(t.n,0)=0 AND f.sku_id IS NULL THEN f.expected_bbl ELSE 0 END,
    coalesce(t.n,0)>1,f.ignored,f.brand_id IS NULL AND NOT f.ignored
  FROM facts f LEFT JOIN LATERAL (
    SELECT count(*) n,count(*) FILTER(WHERE i.not_in_inventory) excluded FROM public.tap_intervals i
    JOIN public.skus s ON s.id=i.sku_id AND s.brewery_id=p_brewery
    WHERE i.brewery_id=p_brewery AND i.location_id=p_location AND s.brand_id=f.brand_id
      AND i.opened_at<=f.sold_at AND (i.closed_at IS NULL OR f.sold_at<i.closed_at)
  ) t ON f.sku_id IS NULL
$$;
REVOKE ALL ON FUNCTION private.taproom_pos_allocations(uuid,uuid,timestamptz,timestamptz) FROM public,anon,authenticated,service_role;

CREATE TABLE private.square_sales_syncs (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  merchant_id text NOT NULL,
  credential_version bigint NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  coverage_starts_at timestamptz NOT NULL,
  external_location_ids text[] NOT NULL DEFAULT '{}',
  locations_captured boolean NOT NULL DEFAULT false,
  location_offset integer NOT NULL DEFAULT 0,
  cursor text,
  seen_cursors text[] NOT NULL DEFAULT '{}',
  pages integer NOT NULL DEFAULT 0,
  accepted_facts integer NOT NULL DEFAULT 0,
  unsupported_facts integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id),
  FOREIGN KEY(actor_id,request_id) REFERENCES private.command_requests(actor_id,request_id) ON DELETE CASCADE,
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id),
  CHECK(ends_at>starts_at AND coverage_starts_at<=ends_at AND location_offset>=0)
);
ALTER TABLE private.square_sales_syncs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.square_sales_syncs FROM public,anon,authenticated,service_role;

CREATE FUNCTION public.begin_square_sales_sync(p_brewery uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_attempt private.square_sales_syncs; v_connection public.pos_connections;
  v_replay jsonb; v_end timestamptz:=clock_timestamp(); v_epoch timestamptz:='1970-01-01T00:00:00Z';
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin']::public.staff_role[]);
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=v_actor AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_attempt.brewery_id<>p_brewery THEN RAISE EXCEPTION 'Square sales sync request changed' USING errcode='MG409'; END IF;
    IF v_attempt.status='completed' THEN RETURN jsonb_build_object('replayResult',v_attempt.result); END IF;
    PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=v_attempt.connection_id AND c.brewery_id=p_brewery AND c.provider='square' AND c.state='connected'
        AND c.merchant_id=v_attempt.merchant_id AND c.credential_version=v_attempt.credential_version
        AND t.credential_version=v_attempt.credential_version FOR SHARE OF c,t;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  ELSE
    v_replay:=private.claim_command_request(p_brewery,'sync_square_sales',p_request_id,'{}'::jsonb);
    IF v_replay IS NOT NULL THEN RETURN jsonb_build_object('replayResult',v_replay); END IF;
    SELECT * INTO v_connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery AND c.provider='square' AND c.state='connected' FOR UPDATE;
    IF NOT FOUND OR v_connection.merchant_id IS NULL THEN RAISE EXCEPTION 'Square connection required'; END IF;
    PERFORM 1 FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square'
      AND t.connection_id=v_connection.id AND t.credential_version=v_connection.credential_version FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
    INSERT INTO private.square_sales_syncs(actor_id,request_id,brewery_id,connection_id,merchant_id,credential_version,
      starts_at,ends_at,coverage_starts_at)
    VALUES(v_actor,p_request_id,p_brewery,v_connection.id,v_connection.merchant_id,v_connection.credential_version,
      greatest(v_epoch,coalesce(v_connection.sales_synced_through-interval '72 hours',v_epoch)),v_end,
      coalesce(v_connection.sales_synced_through,v_epoch)) RETURNING * INTO v_attempt;
  END IF;
  RETURN jsonb_build_object('actorId',v_attempt.actor_id,'requestId',v_attempt.request_id,'connectionId',v_attempt.connection_id,
    'merchantId',v_attempt.merchant_id,'credentialVersion',v_attempt.credential_version,'startsAt',v_attempt.starts_at,
    'endsAt',v_attempt.ends_at,'locationsCaptured',v_attempt.locations_captured,'locationIds',v_attempt.external_location_ids,
    'locationOffset',v_attempt.location_offset,'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $$;

CREATE FUNCTION public.advance_square_sales_sync(p_brewery uuid,p_connection uuid,p_actor uuid,p_request_id uuid,
  p_expected_version bigint,p_next_version bigint) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE private.square_sales_syncs a SET credential_version=p_next_version
  WHERE a.actor_id=p_actor AND a.request_id=p_request_id AND a.brewery_id=p_brewery AND a.connection_id=p_connection
    AND a.credential_version=p_expected_version AND a.status='in_progress'
    AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND u.role='admin')
    AND EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.credential_version=p_next_version
        AND t.credential_version=p_next_version)
  RETURNING true
$$;

CREATE FUNCTION public.record_square_sales_locations(p_brewery uuid,p_connection uuid,p_actor uuid,p_request_id uuid,
  p_expected_version bigint,p_locations jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt private.square_sales_syncs; v_ids text[];
BEGIN
  IF jsonb_typeof(p_locations)<>'array' THEN RAISE EXCEPTION 'Square locations invalid'; END IF;
  SELECT coalesce(array_agg(x.id ORDER BY x.id),'{}') INTO v_ids
    FROM jsonb_to_recordset(p_locations) x(id text,name text,status text)
    WHERE nullif(btrim(x.id),'') IS NOT NULL AND nullif(btrim(x.name),'') IS NOT NULL AND nullif(btrim(x.status),'') IS NOT NULL;
  IF cardinality(v_ids)<>jsonb_array_length(p_locations) OR cardinality(v_ids)<>cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) THEN
    RAISE EXCEPTION 'Square locations invalid';
  END IF;
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.brewery_id<>p_brewery OR v_attempt.connection_id<>p_connection
    OR v_attempt.credential_version<>p_expected_version OR v_attempt.status<>'in_progress'
    OR NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND role='admin')
    OR NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
        AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version)
  THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
      AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version FOR SHARE OF c,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  IF v_attempt.locations_captured THEN
    IF v_attempt.external_location_ids<>v_ids THEN RAISE EXCEPTION 'Square location snapshot changed' USING errcode='MG409'; END IF;
  ELSE
    INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
      SELECT p_brewery,p_connection,x.id,x.name,x.status,true,now() FROM jsonb_to_recordset(p_locations) x(id text,name text,status text)
    ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
      external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
    UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=p_connection
      AND NOT(l.external_location_id=ANY(v_ids));
    UPDATE private.square_sales_syncs SET external_location_ids=v_ids,locations_captured=true
      WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  END IF;
  RETURN jsonb_build_object('locationIds',v_attempt.external_location_ids,'locationOffset',v_attempt.location_offset,
    'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $$;

CREATE FUNCTION public.record_square_sales_page(p_brewery uuid,p_connection uuid,p_actor uuid,p_request_id uuid,
  p_expected_version bigint,p_location_ids text[],p_cursor text,p_next_cursor text,p_orders jsonb,p_facts jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt private.square_sales_syncs; v_expected_locations text[]; v_order jsonb; v_fact jsonb; v_previous record;
  v_order_id text; v_line_id text; v_kind text; v_status text; v_reason text; v_source_order text; v_source_line text;
  v_version bigint; v_qty numeric; v_source_qty numeric; v_returned numeric; v_sale_id uuid; v_hash text; v_snapshot_hash text;
  v_inserted integer:=0; v_accepted integer:=0; v_unsupported integer:=0; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_orders)<>'array' OR jsonb_typeof(p_facts)<>'array' THEN RAISE EXCEPTION 'Square sales page invalid'; END IF;
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.brewery_id<>p_brewery OR v_attempt.connection_id<>p_connection
    OR v_attempt.credential_version<>p_expected_version OR v_attempt.status<>'in_progress' OR NOT v_attempt.locations_captured
    OR v_attempt.cursor IS DISTINCT FROM p_cursor
    OR NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND role='admin')
    OR NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
        AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version)
  THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection::text,0));
  PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
      AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version FOR SHARE OF c,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  v_expected_locations:=v_attempt.external_location_ids[v_attempt.location_offset+1:v_attempt.location_offset+10];
  IF p_location_ids IS DISTINCT FROM v_expected_locations THEN RAISE EXCEPTION 'Square sales location page changed' USING errcode='MG409'; END IF;
  IF p_next_cursor IS NOT NULL AND (p_next_cursor IS NOT DISTINCT FROM p_cursor OR p_next_cursor=ANY(v_attempt.seen_cursors)) THEN
    RAISE EXCEPTION 'Square sales cursor repeated';
  END IF;

  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
  LOOP
    v_order_id:=nullif(btrim(v_order->>'externalOrderId'),''); v_version:=(v_order->>'sourceVersion')::bigint;
    IF v_order_id IS NULL OR v_version<0 OR NOT((v_order->>'externalLocationId')=ANY(p_location_ids)) THEN
      RAISE EXCEPTION 'Square order snapshot invalid';
    END IF;
    v_snapshot_hash:=encode(extensions.digest(jsonb_build_object(
      'externalOrderId',v_order_id,'sourceVersion',v_version,'externalLocationId',v_order->>'externalLocationId',
      'soldAt',v_order->>'soldAt','orderUpdatedAt',v_order->>'orderUpdatedAt','facts',coalesce((
        SELECT jsonb_agg(jsonb_build_object('factKind',f->>'factKind','externalLineId',f->>'externalLineId',
          'sourceHash',f->>'sourceHash') ORDER BY f->>'factKind',f->>'externalLineId')
        FROM jsonb_array_elements(p_facts) f WHERE f->>'externalOrderId'=v_order_id
          AND (f->>'sourceVersion')::bigint=v_version
      ),'[]'::jsonb))::text,'sha256'),'hex');
    INSERT INTO private.square_order_snapshots(brewery_id,connection_id,merchant_id,external_order_id,source_version,snapshot_hash)
    VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_version,v_snapshot_hash)
    ON CONFLICT(connection_id,external_order_id,source_version) DO NOTHING;
    IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM private.square_order_snapshots s WHERE s.connection_id=p_connection
      AND s.external_order_id=v_order_id AND s.source_version=v_version AND s.snapshot_hash=v_snapshot_hash) THEN
      RAISE EXCEPTION 'Square order changed within one source version' USING errcode='MG409';
    END IF;
  END LOOP;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) WITH ORDINALITY rows(value,n)
    ORDER BY (value->>'factKind'='return'),n
  LOOP
    v_order_id:=nullif(btrim(v_fact->>'externalOrderId'),''); v_line_id:=nullif(btrim(v_fact->>'externalLineId'),'');
    v_kind:=v_fact->>'factKind'; v_status:=v_fact->>'factStatus'; v_reason:=nullif(v_fact->>'unsupportedReason','');
    v_version:=(v_fact->>'sourceVersion')::bigint; v_qty:=CASE WHEN v_fact->>'qty' IS NULL THEN null ELSE (v_fact->>'qty')::numeric END;
    v_source_order:=nullif(v_fact->>'sourceOrderId',''); v_source_line:=nullif(v_fact->>'sourceLineId',''); v_hash:=v_fact->>'sourceHash';
    IF v_order_id IS NULL OR v_line_id IS NULL OR v_kind NOT IN ('sale','return') OR v_status NOT IN ('accepted','unsupported')
      OR v_version<0 OR nullif(v_hash,'') IS NULL OR NOT((v_fact->>'externalLocationId')=ANY(p_location_ids))
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) o WHERE o->>'externalOrderId'=v_order_id
        AND (o->>'sourceVersion')::bigint=v_version AND o->>'externalLocationId'=v_fact->>'externalLocationId')
    THEN RAISE EXCEPTION 'Square sales fact invalid'; END IF;
    IF v_status='accepted' AND (v_qty IS NULL OR v_qty<=0 OR v_qty::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Square sales quantity invalid';
    END IF;
    IF v_kind='return' AND v_status='accepted' THEN
      SELECT s.qty INTO v_source_qty FROM private.pos_current_sales s
        WHERE s.connection_id=p_connection AND s.external_order_id=v_source_order AND s.fact_kind='sale'
          AND s.external_line_id=v_source_line AND s.fact_status='accepted'
          AND s.external_variation_id=v_fact->>'externalVariationId';
      SELECT coalesce(sum(r.qty),0) INTO v_returned FROM private.pos_current_sales r
        WHERE r.connection_id=p_connection AND r.fact_kind='return' AND r.fact_status='accepted'
          AND r.source_order_id=v_source_order AND r.source_line_id=v_source_line
          AND NOT(r.external_order_id=v_order_id AND r.external_line_id=v_line_id);
      IF v_source_qty IS NULL THEN v_status:='unsupported'; v_reason:='return_source_not_found'; v_qty:=null;
      ELSIF v_returned+v_qty>v_source_qty THEN v_status:='unsupported'; v_reason:='return_quantity_exceeds_source'; v_qty:=null;
      END IF;
    END IF;
    INSERT INTO public.pos_sales(brewery_id,connection_id,merchant_id,external_order_id,external_line_id,source_version,
      fact_kind,fact_status,source_quantity,qty,gross_cents,external_item_id,external_variation_id,external_location_id,
      sold_at,source_order_updated_at,catalog_version,quantity_unit,source_order_id,source_line_id,unsupported_reason,source_hash)
    VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_line_id,v_version,v_kind,v_status,
      v_fact->>'sourceQuantity',v_qty,CASE WHEN v_fact->>'grossCents' IS NULL THEN null ELSE (v_fact->>'grossCents')::bigint END,
      (SELECT c.external_item_id FROM public.pos_catalog_variations c WHERE c.connection_id=p_connection
        AND c.external_variation_id=v_fact->>'externalVariationId'),nullif(v_fact->>'externalVariationId',''),
      v_fact->>'externalLocationId',(v_fact->>'soldAt')::timestamptz,(v_fact->>'orderUpdatedAt')::timestamptz,
      CASE WHEN v_fact->>'catalogVersion' IS NULL THEN null ELSE (v_fact->>'catalogVersion')::bigint END,
      v_fact->'quantityUnit',v_source_order,v_source_line,v_reason,v_hash)
    ON CONFLICT(connection_id,external_order_id,fact_kind,external_line_id,source_version) DO NOTHING
    RETURNING id INTO v_sale_id;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted=0 THEN
      SELECT id INTO v_sale_id FROM public.pos_sales WHERE connection_id=p_connection AND external_order_id=v_order_id
        AND fact_kind=v_kind AND external_line_id=v_line_id AND source_version=v_version AND source_hash=v_hash;
      IF NOT FOUND THEN RAISE EXCEPTION 'Square fact changed within one source version' USING errcode='MG409'; END IF;
    ELSE
      IF v_status='accepted' THEN v_accepted:=v_accepted+1; ELSE v_unsupported:=v_unsupported+1; END IF;
    END IF;
    PERFORM private.reconcile_pos_sale(p_brewery,v_sale_id);
  END LOOP;

  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
  LOOP
    v_order_id:=v_order->>'externalOrderId'; v_version:=(v_order->>'sourceVersion')::bigint;
    FOR v_previous IN SELECT DISTINCT ON (s.fact_kind,s.external_line_id) s.* FROM public.pos_sales s
      WHERE s.connection_id=p_connection AND s.external_order_id=v_order_id AND s.source_version<v_version
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_facts) f WHERE f->>'externalOrderId'=v_order_id
          AND f->>'factKind'=s.fact_kind AND f->>'externalLineId'=s.external_line_id)
      ORDER BY s.fact_kind,s.external_line_id,s.source_version DESC,s.id DESC
    LOOP
      v_hash:=encode(extensions.digest(concat_ws('|',p_connection,v_order_id,v_previous.fact_kind,
        v_previous.external_line_id,v_version,'removed'),'sha256'),'hex');
      INSERT INTO public.pos_sales(brewery_id,connection_id,merchant_id,external_order_id,external_line_id,source_version,
        fact_kind,fact_status,external_item_id,external_variation_id,external_location_id,sold_at,source_order_updated_at,
        catalog_version,source_order_id,source_line_id,source_hash)
      VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_previous.external_line_id,v_version,
        v_previous.fact_kind,'removed',v_previous.external_item_id,v_previous.external_variation_id,v_order->>'externalLocationId',
        (v_order->>'soldAt')::timestamptz,(v_order->>'orderUpdatedAt')::timestamptz,v_previous.catalog_version,
        v_previous.source_order_id,v_previous.source_line_id,v_hash)
      ON CONFLICT(connection_id,external_order_id,fact_kind,external_line_id,source_version) DO NOTHING;
      IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.connection_id=p_connection
        AND s.external_order_id=v_order_id AND s.fact_kind=v_previous.fact_kind
        AND s.external_line_id=v_previous.external_line_id AND s.source_version=v_version
        AND s.fact_status='removed' AND s.source_hash=v_hash) THEN
        RAISE EXCEPTION 'Square fact changed within one source version' USING errcode='MG409';
      END IF;
    END LOOP;
  END LOOP;

  UPDATE private.square_sales_syncs SET pages=pages+1,accepted_facts=accepted_facts+v_accepted,
    unsupported_facts=unsupported_facts+v_unsupported,cursor=p_next_cursor,
    seen_cursors=CASE WHEN p_next_cursor IS NULL THEN seen_cursors ELSE array_append(seen_cursors,p_next_cursor) END
    WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  IF p_next_cursor IS NULL AND v_attempt.location_offset+10<cardinality(v_attempt.external_location_ids) THEN
    UPDATE private.square_sales_syncs SET location_offset=location_offset+10
      WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  ELSIF p_next_cursor IS NULL THEN
    INSERT INTO public.pos_sales_coverage(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,complete)
      SELECT p_brewery,p_connection,l.external_location_id,l.location_id,v_attempt.coverage_starts_at,v_attempt.ends_at,true
      FROM public.pos_locations l WHERE l.connection_id=p_connection AND l.external_location_id=ANY(v_attempt.external_location_ids)
      ;
    UPDATE public.pos_connections SET sales_synced_through=greatest(coalesce(sales_synced_through,v_attempt.ends_at),v_attempt.ends_at),updated_at=now()
      WHERE id=p_connection AND brewery_id=p_brewery AND credential_version=p_expected_version;
    v_result:=jsonb_build_object('complete',true,'acceptedFacts',v_attempt.accepted_facts,'unsupportedFacts',v_attempt.unsupported_facts,
      'pages',v_attempt.pages,'locations',cardinality(v_attempt.external_location_ids),'startsAt',v_attempt.starts_at,'endsAt',v_attempt.ends_at);
    UPDATE private.square_sales_syncs SET status='completed',result=v_result WHERE actor_id=p_actor AND request_id=p_request_id;
    PERFORM private.complete_command_request_for(p_actor,p_request_id,v_result);
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('complete',false,'locationIds',v_attempt.external_location_ids,
    'locationOffset',v_attempt.location_offset,'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $$;

REVOKE ALL ON FUNCTION public.begin_square_sales_sync(uuid,uuid),
  public.advance_square_sales_sync(uuid,uuid,uuid,uuid,bigint,bigint),
  public.record_square_sales_locations(uuid,uuid,uuid,uuid,bigint,jsonb),
  public.record_square_sales_page(uuid,uuid,uuid,uuid,bigint,text[],text,text,jsonb,jsonb)
  FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_square_sales_sync(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_square_sales_sync(uuid,uuid,uuid,uuid,bigint,bigint),
  public.record_square_sales_locations(uuid,uuid,uuid,uuid,bigint,jsonb),
  public.record_square_sales_page(uuid,uuid,uuid,uuid,bigint,text[],text,text,jsonb,jsonb)
  TO postgres,service_role;

-- ---------------------------------------------------------------- Square-derived menus and narrow website read
CREATE TABLE public.pos_menus (
  id uuid PRIMARY KEY DEFAULT private.new_uuid(),
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  external_location_id text NOT NULL CHECK (length(btrim(external_location_id))>0),
  location_id uuid NOT NULL,
  bin_id uuid NOT NULL,
  sale_channel_id uuid NOT NULL,
  public_id uuid NOT NULL DEFAULT private.new_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,brewery_id),
  UNIQUE(connection_id,external_location_id),
  FOREIGN KEY(connection_id,external_location_id) REFERENCES public.pos_locations(connection_id,external_location_id),
  FOREIGN KEY(location_id,brewery_id) REFERENCES public.locations(id,brewery_id),
  FOREIGN KEY(bin_id,location_id,brewery_id) REFERENCES public.bins(id,location_id,brewery_id) ON DELETE CASCADE,
  FOREIGN KEY(sale_channel_id,brewery_id) REFERENCES public.sale_channels(id,brewery_id)
);
CREATE INDEX pos_menus_brewery_idx ON public.pos_menus(brewery_id,location_id);
ALTER TABLE public.pos_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON public.pos_menus FOR SELECT
  TO authenticated USING (public.staff_role(brewery_id) IN ('admin','warehouse'));
REVOKE ALL ON TABLE public.pos_menus FROM public,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.pos_menus TO authenticated,service_role;

CREATE TABLE public.pos_menu_lines (
  menu_id uuid NOT NULL,
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  format_id uuid NOT NULL,
  price_override_cents integer CHECK (price_override_cents>=0),
  website_published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(menu_id,format_id),
  FOREIGN KEY(menu_id,brewery_id) REFERENCES public.pos_menus(id,brewery_id) ON DELETE CASCADE,
  FOREIGN KEY(format_id,brewery_id) REFERENCES public.formats(id,brewery_id)
);
CREATE INDEX pos_menu_lines_brewery_idx ON public.pos_menu_lines(brewery_id,menu_id);
ALTER TABLE public.pos_menu_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON public.pos_menu_lines FOR SELECT
  TO authenticated USING (public.staff_role(brewery_id) IN ('admin','warehouse'));
REVOKE ALL ON TABLE public.pos_menu_lines FROM public,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.pos_menu_lines TO authenticated,service_role;

CREATE FUNCTION private.pos_menu_snapshot(p_menu uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH menu AS (
    SELECT m.* FROM public.pos_menus m
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id
      AND c.provider='square' AND c.state='connected'
    JOIN public.pos_locations pl ON pl.connection_id=m.connection_id
      AND pl.external_location_id=m.external_location_id AND pl.brewery_id=m.brewery_id
      AND pl.location_id=m.location_id AND pl.available
    WHERE m.id=p_menu
  ),
  source_rows AS (
    SELECT s.brand_id,s.id sku_id,s.name sku_name,f.name format_name,sum(im.qty) qty
    FROM menu m
    JOIN public.skus s ON s.brewery_id=m.brewery_id AND s.active
    JOIN public.formats f ON f.id=s.format_id AND f.brewery_id=s.brewery_id
      AND f.basis='packaged' AND f.package_type='keg'
    JOIN public.inventory_movements im ON im.brewery_id=s.brewery_id AND im.sku_id=s.id
      AND im.location_id=m.location_id AND im.bin_id=m.bin_id
    GROUP BY s.brand_id,s.id,s.name,f.name
    HAVING sum(im.qty)>0
  ),
  poured AS (
    SELECT f.id format_id,f.brand_id,f.name format_name,f.ounces,b.name brand_name,
      l.price_override_cents,l.website_published_at,
      coalesce(l.price_override_cents,cp.unit_price_cents) price_cents,
      CASE WHEN l.price_override_cents IS NOT NULL THEN 'override'
        WHEN cp.unit_price_cents IS NOT NULL THEN 'format' ELSE 'none' END price_source,
      EXISTS(SELECT 1 FROM source_rows sr WHERE sr.brand_id=f.brand_id) available,
      EXISTS(SELECT 1 FROM public.skus s JOIN public.formats sf ON sf.id=s.format_id AND sf.brewery_id=s.brewery_id
        WHERE s.brewery_id=f.brewery_id AND s.brand_id=f.brand_id AND s.active
          AND sf.basis='packaged' AND sf.package_type='keg') has_active_keg,
      coalesce((SELECT jsonb_agg(jsonb_build_object('skuId',sr.sku_id,'name',sr.sku_name,'format',sr.format_name,'qty',sr.qty)
        ORDER BY sr.sku_name,sr.sku_id) FROM source_rows sr WHERE sr.brand_id=f.brand_id),'[]'::jsonb) sources
    FROM menu m
    JOIN public.formats f ON f.brewery_id=m.brewery_id AND f.basis='poured'
    JOIN public.brands b ON b.id=f.brand_id AND b.brewery_id=f.brewery_id
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=m.brewery_id AND cp.sale_channel_id=m.sale_channel_id
      AND cp.price_group_id=b.price_group_id AND cp.format_id=f.id
    LEFT JOIN public.pos_menu_lines l ON l.menu_id=m.id AND l.format_id=f.id AND l.brewery_id=m.brewery_id
  ),
  external_rows AS (
    SELECT v.external_item_id,v.external_variation_id,v.external_item_name,v.external_variation_name,v.available,
      CASE WHEN map.ignored THEN 'ignored' WHEN map.connection_id IS NULL THEN 'queued' ELSE 'mapped' END disposition
    FROM menu m
    JOIN public.pos_catalog_variations v ON v.connection_id=m.connection_id AND v.brewery_id=m.brewery_id
    LEFT JOIN public.pos_item_mappings map ON map.connection_id=v.connection_id
      AND map.external_item_id=v.external_item_id AND map.external_variation_id=v.external_variation_id
    WHERE map.connection_id IS NULL OR map.ignored
  )
  SELECT jsonb_build_object(
    'publicId',m.public_id,
    'location',jsonb_build_object('id',m.location_id,'name',loc.name,'posLocationId',m.external_location_id),
    'bin',jsonb_build_object('id',m.bin_id,'name',bin.name),
    'channel',jsonb_build_object('id',m.sale_channel_id,'name',ch.name),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'brandId',p.brand_id,'formatId',p.format_id,'brand',p.brand_name,'format',p.format_name,'ounces',p.ounces,
      'priceCents',p.price_cents,'priceOverrideCents',p.price_override_cents,'priceSource',p.price_source,
      'available',true,'websitePublished',p.website_published_at IS NOT NULL,'sources',p.sources)
      ORDER BY p.brand_name,p.format_name,p.format_id) FROM poured p WHERE p.available),'[]'::jsonb),
    'excluded',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'brandId',p.brand_id,'formatId',p.format_id,'brand',p.brand_name,'format',p.format_name,'ounces',p.ounces,
      'priceCents',p.price_cents,'priceOverrideCents',p.price_override_cents,'priceSource',p.price_source,
      'available',false,'websitePublished',p.website_published_at IS NOT NULL,'sources',p.sources,
      'reason',CASE WHEN p.has_active_keg THEN 'out_of_stock' ELSE 'no_active_keg' END)
      ORDER BY p.brand_name,p.format_name,p.format_id) FROM poured p WHERE NOT p.available),'[]'::jsonb),
    'externalItems',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'externalItemId',e.external_item_id,'externalVariationId',e.external_variation_id,
      'itemName',e.external_item_name,'variationName',e.external_variation_name,
      'available',e.available,'disposition',e.disposition)
      ORDER BY e.external_item_name,e.external_variation_name,e.external_item_id,e.external_variation_id) FROM external_rows e),'[]'::jsonb)
  ) FROM menu m
  JOIN public.locations loc ON loc.id=m.location_id AND loc.brewery_id=m.brewery_id
  JOIN public.bins bin ON bin.id=m.bin_id AND bin.brewery_id=m.brewery_id
  JOIN public.sale_channels ch ON ch.id=m.sale_channel_id AND ch.brewery_id=m.brewery_id;
$$;
REVOKE ALL ON FUNCTION private.pos_menu_snapshot(uuid) FROM public,anon,authenticated,service_role;

CREATE FUNCTION public.configure_pos_menu(p_brewery uuid,p_external_location text,p_bin uuid,p_sale_channel uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_replay jsonb; v_location uuid; v_connection uuid; v_menu public.pos_menus; v_result jsonb;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'configure_pos_menu',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'binId',p_bin,'saleChannelId',p_sale_channel));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT pl.location_id,pl.connection_id INTO v_location,v_connection
    FROM public.pos_locations pl JOIN public.pos_connections c ON c.id=pl.connection_id AND c.brewery_id=pl.brewery_id
    WHERE pl.brewery_id=p_brewery AND pl.external_location_id=p_external_location AND pl.available
      AND pl.location_id IS NOT NULL AND c.provider='square' AND c.state='connected' FOR UPDATE OF pl;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.bins b WHERE b.id=p_bin AND b.brewery_id=p_brewery AND b.location_id=v_location)
    OR NOT EXISTS(SELECT 1 FROM public.sale_channels c WHERE c.id=p_sale_channel AND c.brewery_id=p_brewery)
  THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  INSERT INTO public.pos_menus(brewery_id,connection_id,external_location_id,location_id,bin_id,sale_channel_id)
    VALUES(p_brewery,v_connection,p_external_location,v_location,p_bin,p_sale_channel)
    ON CONFLICT(connection_id,external_location_id) DO UPDATE SET location_id=excluded.location_id,
      bin_id=excluded.bin_id,sale_channel_id=excluded.sale_channel_id,updated_at=now()
    RETURNING * INTO v_menu;
  v_result:=jsonb_build_object('configured',true,'menuId',v_menu.id,'publicId',v_menu.public_id);
  RETURN private.complete_command_request_for(v_actor,p_request_id,v_result);
END $$;

CREATE FUNCTION public.set_pos_price_override(p_brewery uuid,p_external_location text,p_format uuid,p_unit_price_cents integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_replay jsonb; v_menu public.pos_menus; v_result jsonb;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'set_pos_price_override',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'formatId',p_format,'unitPriceCents',p_unit_price_cents));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_unit_price_cents<0 THEN RAISE EXCEPTION 'price must be zero or more'; END IF;
  SELECT m.* INTO v_menu FROM public.pos_menus m JOIN public.pos_locations pl ON pl.connection_id=m.connection_id
    AND pl.external_location_id=m.external_location_id AND pl.location_id=m.location_id AND pl.brewery_id=m.brewery_id
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id AND c.state='connected'
    WHERE m.brewery_id=p_brewery AND m.external_location_id=p_external_location FOR UPDATE OF m;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.formats f WHERE f.id=p_format AND f.brewery_id=p_brewery AND f.basis='poured')
  THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  INSERT INTO public.pos_menu_lines(menu_id,brewery_id,format_id,price_override_cents)
    VALUES(v_menu.id,p_brewery,p_format,p_unit_price_cents)
    ON CONFLICT(menu_id,format_id) DO UPDATE SET price_override_cents=excluded.price_override_cents,updated_at=now();
  DELETE FROM public.pos_menu_lines WHERE menu_id=v_menu.id AND format_id=p_format
    AND price_override_cents IS NULL AND website_published_at IS NULL;
  v_result:=jsonb_build_object('saved',true,'unitPriceCents',p_unit_price_cents);
  RETURN private.complete_command_request_for(v_actor,p_request_id,v_result);
END $$;

CREATE FUNCTION public.set_pos_website_publication(p_brewery uuid,p_external_location text,p_format uuid,p_published boolean,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_replay jsonb; v_menu public.pos_menus; v_result jsonb; v_price integer;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'set_pos_website_publication',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'formatId',p_format,'published',p_published));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT m.* INTO v_menu FROM public.pos_menus m JOIN public.pos_locations pl ON pl.connection_id=m.connection_id
    AND pl.external_location_id=m.external_location_id AND pl.location_id=m.location_id AND pl.brewery_id=m.brewery_id
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id AND c.state='connected'
    WHERE m.brewery_id=p_brewery AND m.external_location_id=p_external_location FOR UPDATE OF m;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.formats f WHERE f.id=p_format AND f.brewery_id=p_brewery AND f.basis='poured')
  THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT coalesce(l.price_override_cents,cp.unit_price_cents) INTO v_price
    FROM public.formats f JOIN public.brands b ON b.id=f.brand_id AND b.brewery_id=f.brewery_id
    LEFT JOIN public.pos_menu_lines l ON l.menu_id=v_menu.id AND l.format_id=f.id
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=f.brewery_id AND cp.sale_channel_id=v_menu.sale_channel_id
      AND cp.price_group_id=b.price_group_id AND cp.format_id=f.id
    WHERE f.id=p_format AND f.brewery_id=p_brewery;
  IF p_published AND (v_price IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.skus s JOIN public.formats sf ON sf.id=s.format_id AND sf.brewery_id=s.brewery_id
    JOIN public.inventory_movements im ON im.sku_id=s.id AND im.brewery_id=s.brewery_id
      AND im.location_id=v_menu.location_id AND im.bin_id=v_menu.bin_id
    WHERE s.brewery_id=p_brewery AND s.brand_id=(SELECT brand_id FROM public.formats WHERE id=p_format)
      AND s.active AND sf.basis='packaged' AND sf.package_type='keg'
    GROUP BY s.id HAVING sum(im.qty)>0))
  THEN RAISE EXCEPTION 'Only a priced format with stock in the selected bin can publish'; END IF;
  INSERT INTO public.pos_menu_lines(menu_id,brewery_id,format_id,website_published_at)
    VALUES(v_menu.id,p_brewery,p_format,CASE WHEN p_published THEN now() END)
    ON CONFLICT(menu_id,format_id) DO UPDATE SET website_published_at=excluded.website_published_at,updated_at=now();
  DELETE FROM public.pos_menu_lines WHERE menu_id=v_menu.id AND format_id=p_format
    AND price_override_cents IS NULL AND website_published_at IS NULL;
  v_result:=jsonb_build_object('saved',true,'published',p_published);
  RETURN private.complete_command_request_for(v_actor,p_request_id,v_result);
END $$;

CREATE FUNCTION public.get_pos_menu(p_brewery uuid,p_external_location text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_menu uuid;
BEGIN
  PERFORM private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  SELECT m.id INTO v_menu FROM public.pos_menus m WHERE m.brewery_id=p_brewery AND m.external_location_id=p_external_location;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu is not configured'; END IF;
  RETURN private.pos_menu_snapshot(v_menu);
END $$;

CREATE FUNCTION public.get_pos_menu_item(p_brewery uuid,p_external_location text,p_format uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_snapshot jsonb; v_item jsonb;
BEGIN
  v_snapshot:=public.get_pos_menu(p_brewery,p_external_location);
  SELECT value INTO v_item FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded'))
    WHERE value->>'formatId'=p_format::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
  RETURN v_item;
END $$;

CREATE FUNCTION public.get_published_pos_menu(p_public_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH menu AS (
    SELECT m.* FROM public.pos_menus m
    JOIN public.pos_connections c ON c.id=m.connection_id AND c.brewery_id=m.brewery_id
      AND c.provider='square' AND c.state='connected'
    JOIN public.pos_locations pl ON pl.connection_id=m.connection_id AND pl.external_location_id=m.external_location_id
      AND pl.brewery_id=m.brewery_id AND pl.location_id=m.location_id AND pl.available
    WHERE m.public_id=p_public_id
  ),
  published AS (
    SELECT b.name brand,f.name format,f.ounces,coalesce(l.price_override_cents,cp.unit_price_cents) price_cents
    FROM menu m JOIN public.pos_menu_lines l ON l.menu_id=m.id AND l.brewery_id=m.brewery_id AND l.website_published_at IS NOT NULL
    JOIN public.formats f ON f.id=l.format_id AND f.brewery_id=l.brewery_id AND f.basis='poured'
    JOIN public.brands b ON b.id=f.brand_id AND b.brewery_id=f.brewery_id
    LEFT JOIN public.channel_prices cp ON cp.brewery_id=m.brewery_id AND cp.sale_channel_id=m.sale_channel_id
      AND cp.price_group_id=b.price_group_id AND cp.format_id=f.id
    WHERE coalesce(l.price_override_cents,cp.unit_price_cents) IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.skus s JOIN public.formats sf ON sf.id=s.format_id AND sf.brewery_id=s.brewery_id
      JOIN public.inventory_movements im ON im.sku_id=s.id AND im.brewery_id=s.brewery_id
        AND im.location_id=m.location_id AND im.bin_id=m.bin_id
      WHERE s.brewery_id=m.brewery_id AND s.brand_id=f.brand_id AND s.active
        AND sf.basis='packaged' AND sf.package_type='keg'
      GROUP BY s.id HAVING sum(im.qty)>0)
  )
  SELECT jsonb_build_object('location',loc.name,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('brand',p.brand,'format',p.format,'ounces',p.ounces,
      'priceCents',p.price_cents,'available',true) ORDER BY p.brand,p.format) FROM published p),'[]'::jsonb))
  FROM menu m JOIN public.locations loc ON loc.id=m.location_id AND loc.brewery_id=m.brewery_id;
$$;

REVOKE ALL ON FUNCTION public.configure_pos_menu(uuid,text,uuid,uuid,uuid),
  public.set_pos_price_override(uuid,text,uuid,integer,uuid),
  public.set_pos_website_publication(uuid,text,uuid,boolean,uuid),
  public.get_pos_menu(uuid,text),public.get_pos_menu_item(uuid,text,uuid),public.get_published_pos_menu(uuid)
  FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configure_pos_menu(uuid,text,uuid,uuid,uuid),
  public.set_pos_price_override(uuid,text,uuid,integer,uuid),
  public.set_pos_website_publication(uuid,text,uuid,boolean,uuid),
  public.get_pos_menu(uuid,text),public.get_pos_menu_item(uuid,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_pos_menu(uuid) TO service_role;

-- ---------------------------------------------------------------- Durable Square catalog publication
CREATE TABLE public.pos_catalog_items (
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  catalog_group text NOT NULL CHECK(catalog_group='poured'),
  external_item_id text NOT NULL CHECK(length(btrim(external_item_id))>0),
  ownership text NOT NULL CHECK(ownership IN ('mgr','adopted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY(connection_id,brand_id,catalog_group),
  UNIQUE(connection_id,external_item_id),
  UNIQUE(connection_id,brand_id,catalog_group,external_item_id,brewery_id),
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id),
  FOREIGN KEY(brand_id,brewery_id) REFERENCES public.brands(id,brewery_id)
);
CREATE INDEX pos_catalog_items_brewery_idx ON public.pos_catalog_items(brewery_id,connection_id);
ALTER TABLE public.pos_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON public.pos_catalog_items FOR SELECT TO authenticated
  USING(public.staff_role(brewery_id) IN ('admin','warehouse'));
REVOKE ALL ON TABLE public.pos_catalog_items FROM public,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.pos_catalog_items TO authenticated,service_role;

CREATE TABLE public.pos_catalog_ownership (
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  catalog_group text NOT NULL CHECK(catalog_group='poured'),
  format_id uuid NOT NULL,
  external_item_id text NOT NULL CHECK(length(btrim(external_item_id))>0),
  external_variation_id text NOT NULL CHECK(length(btrim(external_variation_id))>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY(connection_id,format_id),
  UNIQUE(connection_id,external_variation_id),
  FOREIGN KEY(connection_id,brand_id,catalog_group,external_item_id,brewery_id)
    REFERENCES public.pos_catalog_items(connection_id,brand_id,catalog_group,external_item_id,brewery_id),
  FOREIGN KEY(format_id,brewery_id) REFERENCES public.formats(id,brewery_id)
);
CREATE INDEX pos_catalog_ownership_brewery_idx ON public.pos_catalog_ownership(brewery_id,connection_id);
ALTER TABLE public.pos_catalog_ownership ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON public.pos_catalog_ownership FOR SELECT TO authenticated
  USING(public.staff_role(brewery_id) IN ('admin','warehouse'));
REVOKE ALL ON TABLE public.pos_catalog_ownership FROM public,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.pos_catalog_ownership TO authenticated,service_role;

CREATE TABLE private.square_menu_publications (
  id uuid PRIMARY KEY DEFAULT private.new_uuid(),
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  credential_version bigint NOT NULL,
  catalog_generation bigint NOT NULL,
  external_location_id text NOT NULL,
  retry_conflict boolean NOT NULL,
  manifest jsonb NOT NULL,
  status text NOT NULL DEFAULT 'publishing' CHECK(status IN ('publishing','succeeded','rejected','superseded')),
  error_code text CHECK(error_code IN ('version_mismatch','provider_rejected','provider_missing','provider_invalid')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(actor_id,request_id),
  FOREIGN KEY(actor_id,request_id) REFERENCES private.command_requests(actor_id,request_id) ON DELETE CASCADE,
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id)
);
CREATE UNIQUE INDEX square_menu_publications_one_active_idx
  ON private.square_menu_publications(connection_id,external_location_id) WHERE status='publishing';
ALTER TABLE private.square_menu_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.square_menu_publications FROM public,anon,authenticated,service_role;

CREATE TABLE private.square_publications (
  id uuid PRIMARY KEY DEFAULT private.new_uuid(),
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  menu_publication_id uuid REFERENCES private.square_menu_publications(id),
  request_id uuid NOT NULL,
  command_name text NOT NULL CHECK(command_name IN ('publish_pos_menu','publish_pos_item')),
  credential_version bigint NOT NULL,
  catalog_generation bigint NOT NULL,
  external_location_id text NOT NULL,
  brand_id uuid NOT NULL,
  catalog_group text NOT NULL CHECK(catalog_group='poured'),
  ownership_intent text NOT NULL CHECK(ownership_intent IN ('mgr','adopted')),
  external_item_id text,
  adopt_variation_id text,
  source_snapshot jsonb NOT NULL,
  provider_key uuid NOT NULL UNIQUE DEFAULT private.new_uuid(),
  request_body text,
  expected_item_version bigint,
  expected_variation_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'needs_snapshot' CHECK(status IN ('needs_snapshot','prepared','succeeded','rejected','superseded')),
  error_code text CHECK(error_code IN ('version_mismatch','provider_rejected','provider_missing','provider_invalid','credential_changed','catalog_changed','connection_changed','menu_rejected','role_changed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(actor_id,request_id),
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id),
  FOREIGN KEY(brand_id,brewery_id) REFERENCES public.brands(id,brewery_id)
);
CREATE INDEX square_publications_brewery_idx ON private.square_publications(brewery_id,connection_id,brand_id);
CREATE UNIQUE INDEX square_publications_one_active_item_idx ON private.square_publications(connection_id,brand_id,catalog_group)
  WHERE status IN ('needs_snapshot','prepared');
ALTER TABLE private.square_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.square_publications FROM public,anon,authenticated,service_role;

CREATE TABLE private.square_publication_events (
  id uuid PRIMARY KEY DEFAULT private.new_uuid(),
  publication_id uuid NOT NULL REFERENCES private.square_publications(id),
  brewery_id uuid NOT NULL REFERENCES public.breweries(id),
  connection_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  catalog_group text NOT NULL CHECK(catalog_group='poured'),
  format_id uuid NOT NULL,
  external_item_id text NOT NULL,
  external_variation_id text NOT NULL,
  ownership text NOT NULL CHECK(ownership IN ('mgr','adopted')),
  present boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(connection_id,brewery_id) REFERENCES public.pos_connections(id,brewery_id),
  FOREIGN KEY(brand_id,brewery_id) REFERENCES public.brands(id,brewery_id),
  FOREIGN KEY(format_id,brewery_id) REFERENCES public.formats(id,brewery_id)
);
CREATE INDEX square_publication_events_brewery_idx ON private.square_publication_events(brewery_id,connection_id,brand_id);
ALTER TABLE private.square_publication_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.square_publication_events FROM public,anon,authenticated,service_role;

CREATE FUNCTION private.square_menu_publication_manifest(p_snapshot jsonb,p_connection uuid,p_candidates jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_snapshot jsonb:=p_snapshot; v_manifest jsonb:='[]'::jsonb; v_brand uuid; v_brand_name text;
  v_external_item text; v_ownership text; v_variations jsonb;
BEGIN
  FOR v_brand IN
    SELECT value::uuid FROM jsonb_array_elements_text(p_candidates) x(value) ORDER BY value::uuid
  LOOP
    v_external_item:=null; v_ownership:='mgr';
    SELECT i.external_item_id,i.ownership INTO v_external_item,v_ownership
      FROM public.pos_catalog_items i WHERE i.connection_id=p_connection
        AND i.brand_id=v_brand AND i.catalog_group='poured';
    IF NOT FOUND THEN v_external_item:=null; v_ownership:='mgr'; END IF;
    SELECT b.name INTO v_brand_name FROM public.brands b WHERE b.id=v_brand;
    WITH source_rows AS (
      SELECT e->>'formatId' format_id,e->>'format' format_name,
        CASE WHEN e->>'priceCents' IS NULL THEN null ELSE (e->>'priceCents')::integer END price_cents,
        coalesce((e->>'available')::boolean,false) AND e->>'priceCents' IS NOT NULL present
      FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) e
      WHERE e->>'brandId'=v_brand::text
      UNION ALL
      SELECT o.format_id::text,f.name,null::integer,false
      FROM public.pos_catalog_ownership o JOIN public.formats f ON f.id=o.format_id AND f.brewery_id=o.brewery_id
      WHERE o.connection_id=p_connection AND o.brand_id=v_brand AND o.catalog_group='poured'
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) e
          WHERE e->>'formatId'=o.format_id::text)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('formatId',s.format_id,'format',s.format_name,
      'priceCents',s.price_cents,'present',s.present,'externalVariationId',o.external_variation_id)
      ORDER BY s.format_name,s.format_id),'[]'::jsonb) INTO v_variations
    FROM source_rows s LEFT JOIN public.pos_catalog_ownership o ON o.connection_id=p_connection
      AND o.brand_id=v_brand AND o.catalog_group='poured' AND o.format_id=s.format_id::uuid
      AND o.external_item_id=v_external_item;
    v_manifest:=v_manifest||jsonb_build_array(jsonb_build_object('brandId',v_brand,'requestId',private.new_uuid(),
      'source',jsonb_build_object('brandId',v_brand,'brand',v_brand_name,'catalogGroup','poured',
        'locationId',v_snapshot#>>'{location,posLocationId}','ownership',v_ownership,
        'externalItemId',v_external_item,'variations',v_variations)));
  END LOOP;
  RETURN v_manifest;
END $$;
REVOKE ALL ON FUNCTION private.square_menu_publication_manifest(jsonb,uuid,jsonb) FROM public,anon,authenticated,service_role;

CREATE FUNCTION private.square_menu_publication_state(p_publication uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('menuAttemptId',p.id,'connectionId',p.connection_id,
    'credentialVersion',p.credential_version,'catalogGeneration',p.catalog_generation,'status',p.status,
    'manifest',coalesce((SELECT jsonb_agg(jsonb_build_object('brandId',e->>'brandId','requestId',e->>'requestId') ORDER BY ord)
      FROM jsonb_array_elements(p.manifest) WITH ORDINALITY x(e,ord)),'[]'::jsonb),
    'errorCode',p.error_code,'result',p.result)
  FROM private.square_menu_publications p WHERE p.id=p_publication;
$$;
REVOKE ALL ON FUNCTION private.square_menu_publication_state(uuid) FROM public,anon,authenticated,service_role;

CREATE FUNCTION private.square_publication_state(p_publication uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('attemptId',p.id,'connectionId',p.connection_id,'credentialVersion',p.credential_version,
    'catalogGeneration',p.catalog_generation,'status',p.status,'providerKey',p.provider_key,
    'source',p.source_snapshot,'errorCode',p.error_code,'result',p.result)
  FROM private.square_publications p WHERE p.id=p_publication;
$$;
REVOKE ALL ON FUNCTION private.square_publication_state(uuid) FROM public,anon,authenticated,service_role;

CREATE FUNCTION private.supersede_square_publications(p_connection uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_connection public.pos_connections; v_attempt private.square_publications;
  v_menu private.square_menu_publications; v_token_version bigint; v_code text; v_result jsonb;
BEGIN
  SELECT * INTO v_connection FROM public.pos_connections WHERE id=p_connection FOR SHARE;
  SELECT credential_version INTO v_token_version FROM private.integration_tokens
    WHERE provider='square' AND connection_id=p_connection FOR SHARE;
  FOR v_attempt IN SELECT * FROM private.square_publications p WHERE p.connection_id=p_connection
    AND p.status IN ('needs_snapshot','prepared') AND (
      v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS DISTINCT FROM v_connection.credential_version
      OR p.credential_version<>v_connection.credential_version OR p.catalog_generation<>v_connection.catalog_sync_generation
      OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p.brewery_id AND u.user_id=p.actor_id
        AND u.role IN ('admin','warehouse')))
    FOR UPDATE
  LOOP
    v_code:=CASE WHEN NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=v_attempt.brewery_id
        AND u.user_id=v_attempt.actor_id AND u.role IN ('admin','warehouse')) THEN 'role_changed'
      WHEN v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS NULL THEN 'connection_changed'
      WHEN v_attempt.credential_version<>v_connection.credential_version OR v_token_version<>v_connection.credential_version THEN 'credential_changed'
      ELSE 'catalog_changed' END;
    v_result:=jsonb_build_object('published',false,'superseded',true,'errorCode',v_code);
    UPDATE private.square_publications SET status='superseded',error_code=v_code,result=v_result,finished_at=now()
      WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  END LOOP;
  FOR v_menu IN SELECT * FROM private.square_menu_publications p WHERE p.connection_id=p_connection
    AND p.status='publishing' AND (
      v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS DISTINCT FROM v_connection.credential_version
      OR p.credential_version<>v_connection.credential_version OR p.catalog_generation<>v_connection.catalog_sync_generation
      OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p.brewery_id AND u.user_id=p.actor_id
        AND u.role IN ('admin','warehouse')))
    FOR UPDATE
  LOOP
    v_code:=CASE WHEN NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=v_menu.brewery_id
        AND u.user_id=v_menu.actor_id AND u.role IN ('admin','warehouse')) THEN 'role_changed'
      WHEN v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS NULL THEN 'connection_changed'
      WHEN v_menu.credential_version<>v_connection.credential_version OR v_token_version<>v_connection.credential_version THEN 'credential_changed'
      ELSE 'catalog_changed' END;
    v_result:=jsonb_build_object('published',false,'superseded',true,'errorCode',v_code);
    UPDATE private.square_menu_publications SET status='superseded',result=v_result,finished_at=now() WHERE id=v_menu.id;
    PERFORM private.complete_command_request_for(v_menu.actor_id,v_menu.request_id,private.square_menu_publication_state(v_menu.id));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.supersede_square_publications(uuid) FROM public,anon,authenticated,service_role;

CREATE FUNCTION public.begin_square_menu_publication(
  p_brewery uuid,p_external_location text,p_retry_conflict boolean,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_replay jsonb; v_connection public.pos_connections; v_menu public.pos_menus;
  v_attempt private.square_menu_publications; v_manifest jsonb; v_snapshot jsonb; v_candidates jsonb;
  v_result jsonb; v_entry jsonb; v_brand uuid;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  IF nullif(btrim(p_external_location),'') IS NULL OR p_retry_conflict IS NULL THEN
    RAISE EXCEPTION 'Square menu publication request is invalid'; END IF;
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,'publish_pos_menu',p_request_id,
    jsonb_build_object('posLocationId',p_external_location,'retryConflict',p_retry_conflict));
  IF v_replay IS NOT NULL THEN
    SELECT * INTO v_attempt FROM private.square_menu_publications
      WHERE id=(v_replay->>'menuAttemptId')::uuid AND brewery_id=p_brewery;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square menu publication request is invalid' USING errcode='MG409'; END IF;
    PERFORM private.supersede_square_publications(v_attempt.connection_id);
    RETURN private.square_menu_publication_state(v_attempt.id);
  END IF;
  SELECT c.* INTO v_connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery
    AND c.provider='square' AND c.state='connected' FOR SHARE;
  SELECT m.* INTO v_menu FROM public.pos_menus m WHERE m.brewery_id=p_brewery
    AND m.external_location_id=p_external_location AND m.connection_id=v_connection.id FOR SHARE;
  IF v_connection.id IS NULL OR v_menu.id IS NULL THEN RAISE EXCEPTION 'Square menu is unavailable'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'square-menu-publish:'||v_connection.id::text||':'||p_external_location,0));
  PERFORM private.supersede_square_publications(v_connection.id);
  IF EXISTS(SELECT 1 FROM private.square_catalog_syncs s JOIN private.command_requests r
    ON r.actor_id=s.actor_id AND r.request_id=s.request_id
    WHERE s.connection_id=v_connection.id AND s.merchant_id=v_connection.merchant_id
      AND s.catalog_generation>v_connection.catalog_sync_generation
      AND r.result IS NULL) THEN
    RAISE EXCEPTION 'Square catalog sync is still in progress' USING errcode='MG409'; END IF;
  IF EXISTS(SELECT 1 FROM private.square_menu_publications p WHERE p.connection_id=v_connection.id
    AND p.external_location_id=p_external_location AND p.status='publishing') THEN
    RAISE EXCEPTION 'Another Square menu publication is still unresolved' USING errcode='MG409'; END IF;
  v_snapshot:=private.pos_menu_snapshot(v_menu.id);
  SELECT coalesce(jsonb_agg(brand_id ORDER BY brand_id),'[]'::jsonb) INTO v_candidates FROM (
      SELECT DISTINCT (e->>'brandId')::uuid brand_id
      FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) e
      WHERE coalesce((e->>'available')::boolean,false) AND e->>'priceCents' IS NOT NULL
      UNION
      SELECT i.brand_id FROM public.pos_catalog_items i
      WHERE i.connection_id=v_connection.id AND i.catalog_group='poured'
    ) brands;
  FOR v_brand IN SELECT value::uuid FROM jsonb_array_elements_text(v_candidates) x(value) ORDER BY value::uuid
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'square-publish:'||v_connection.id::text||':'||v_brand::text||':poured',0));
  END LOOP;
  v_manifest:=private.square_menu_publication_manifest(v_snapshot,v_connection.id,v_candidates);
  INSERT INTO private.square_menu_publications(brewery_id,connection_id,actor_id,request_id,
    credential_version,catalog_generation,external_location_id,retry_conflict,manifest)
  VALUES(p_brewery,v_connection.id,v_actor,p_request_id,v_connection.credential_version,
    v_connection.catalog_sync_generation,p_external_location,p_retry_conflict,v_manifest) RETURNING * INTO v_attempt;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_manifest)
  LOOP
    PERFORM public.begin_square_publication(p_brewery,p_external_location,(v_entry->>'brandId')::uuid,
      null,null,p_retry_conflict,'publish_pos_menu',(v_entry->>'requestId')::uuid,v_attempt.id);
  END LOOP;
  v_result:=private.square_menu_publication_state(v_attempt.id);
  PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.finish_square_menu_publication(p_brewery uuid,p_publication uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt private.square_menu_publications; v_child private.square_publications;
  v_result jsonb; v_items jsonb; v_error text; v_partial boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.role IN ('admin','warehouse')) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_menu_publications
    WHERE id=p_publication AND brewery_id=p_brewery AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_menu_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.manifest) e JOIN private.square_publications p
    ON p.actor_id=v_attempt.actor_id AND p.request_id=(e->>'requestId')::uuid
      AND p.menu_publication_id=v_attempt.id WHERE p.status='rejected') THEN
    SELECT p.error_code INTO v_error FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
      JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
        AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id
      WHERE p.status='rejected' ORDER BY x.ord LIMIT 1;
    FOR v_child IN
      UPDATE private.square_publications SET status='superseded',error_code='menu_rejected',
        result=jsonb_build_object('published',false,'superseded',true,'errorCode','menu_rejected'),finished_at=now()
      WHERE menu_publication_id=v_attempt.id AND status IN ('needs_snapshot','prepared') RETURNING *
    LOOP
      PERFORM private.complete_command_request_for(v_child.actor_id,v_child.request_id,
        private.square_publication_state(v_child.id));
    END LOOP;
    SELECT coalesce(jsonb_agg(jsonb_build_object('brandId',x.e->>'brandId','requestId',x.e->>'requestId',
      'status',coalesce(p.status,'not_attempted'),'result',p.result) ORDER BY x.ord),'[]'::jsonb),
      coalesce(bool_or(p.status='succeeded'),false) INTO v_items,v_partial
    FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
    LEFT JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
      AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id;
    v_result:=jsonb_build_object('published',false,'rejected',true,'partial',v_partial,
      'errorCode',v_error,'items',v_items);
    UPDATE private.square_menu_publications SET status='rejected',error_code=v_error,result=v_result,finished_at=now()
      WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,
      private.square_menu_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.manifest) e WHERE NOT EXISTS(
    SELECT 1 FROM private.square_publications p WHERE p.actor_id=v_attempt.actor_id
      AND p.request_id=(e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id AND p.status='succeeded'))
  THEN RAISE EXCEPTION 'Square menu publication is incomplete' USING errcode='MG409'; END IF;
  SELECT coalesce(jsonb_agg(p.result ORDER BY x.ord),'[]'::jsonb) INTO v_items
    FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
    JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
      AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id;
  v_result:=jsonb_build_object('published',true,'items',v_items);
  UPDATE private.square_menu_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_menu_publication_state(v_attempt.id));
  RETURN v_result;
END $$;

CREATE FUNCTION public.begin_square_publication(
  p_brewery uuid,p_external_location text,p_brand uuid,p_adopt_item text,p_adopt_variation text,
  p_retry_conflict boolean,p_command text,p_request_id uuid,p_menu_publication uuid DEFAULT null
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_replay jsonb; v_connection public.pos_connections; v_menu public.pos_menus;
  v_parent public.pos_catalog_items; v_attempt private.square_publications; v_snapshot jsonb; v_variations jsonb;
  v_ownership text; v_result jsonb; v_previous private.square_publications; v_external_item text; v_brand_name text;
  v_menu_attempt private.square_menu_publications; v_manifest_entry jsonb;
BEGIN
  v_actor:=private.assert_staff(p_brewery,ARRAY['admin','warehouse']::public.staff_role[]);
  IF p_command NOT IN ('publish_pos_menu','publish_pos_item') OR p_retry_conflict IS NULL
    OR (p_command='publish_pos_menu')<>(p_menu_publication IS NOT NULL)
    OR (p_adopt_item IS NULL)<>(p_adopt_variation IS NULL) OR p_brand IS NULL
    OR nullif(btrim(p_external_location),'') IS NULL THEN RAISE EXCEPTION 'Square publication request is invalid'; END IF;
  v_replay:=private.claim_command_request_for(v_actor,p_brewery,p_command,p_request_id,
    jsonb_strip_nulls(jsonb_build_object('posLocationId',p_external_location,'brandId',p_brand,
      'adoptItemId',p_adopt_item,'adoptVariationId',p_adopt_variation,'retryConflict',p_retry_conflict,
      'menuPublicationId',p_menu_publication)));
  IF v_replay IS NOT NULL THEN
    SELECT * INTO v_attempt FROM private.square_publications WHERE id=(v_replay->>'attemptId')::uuid AND brewery_id=p_brewery;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square publication request is invalid' USING errcode='MG409'; END IF;
    RETURN private.square_publication_state(v_attempt.id);
  END IF;
  SELECT c.* INTO v_connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery
    AND c.provider='square' AND c.state='connected' FOR SHARE;
  SELECT m.* INTO v_menu FROM public.pos_menus m WHERE m.brewery_id=p_brewery
    AND m.external_location_id=p_external_location AND m.connection_id=v_connection.id FOR SHARE;
  IF v_connection.id IS NULL OR v_menu.id IS NULL THEN RAISE EXCEPTION 'Square menu is unavailable'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('square-publish:'||v_connection.id::text||':'||p_brand::text||':poured',0));
  PERFORM private.supersede_square_publications(v_connection.id);
  IF EXISTS(SELECT 1 FROM private.square_catalog_syncs s JOIN private.command_requests r
    ON r.actor_id=s.actor_id AND r.request_id=s.request_id
    WHERE s.connection_id=v_connection.id AND s.merchant_id=v_connection.merchant_id
      AND s.catalog_generation>v_connection.catalog_sync_generation
      AND r.result IS NULL) THEN
    RAISE EXCEPTION 'Square catalog sync is still in progress' USING errcode='MG409'; END IF;
  IF p_menu_publication IS NOT NULL THEN
    SELECT * INTO v_menu_attempt FROM private.square_menu_publications p
      WHERE p.id=p_menu_publication AND p.brewery_id=p_brewery AND p.connection_id=v_connection.id
        AND p.actor_id=v_actor AND p.external_location_id=p_external_location AND p.status='publishing'
        AND p.credential_version=v_connection.credential_version
        AND p.catalog_generation=v_connection.catalog_sync_generation FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square menu publication was superseded' USING errcode='MG409'; END IF;
    SELECT e INTO v_manifest_entry FROM jsonb_array_elements(v_menu_attempt.manifest) e
      WHERE e->>'brandId'=p_brand::text AND e->>'requestId'=p_request_id::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'Square menu publication request is invalid' USING errcode='MG409'; END IF;
  END IF;
  SELECT * INTO v_attempt FROM private.square_publications p WHERE p.connection_id=v_connection.id
    AND p.brand_id=p_brand AND p.catalog_group='poured' AND p.status IN ('needs_snapshot','prepared') FOR UPDATE;
  IF FOUND THEN
    IF v_attempt.external_location_id IS DISTINCT FROM p_external_location
      OR v_attempt.menu_publication_id IS DISTINCT FROM p_menu_publication
      OR p_adopt_item IS NOT NULL AND (p_adopt_item IS DISTINCT FROM v_attempt.external_item_id
      OR p_adopt_variation IS DISTINCT FROM v_attempt.adopt_variation_id)
    THEN RAISE EXCEPTION 'Another Square publication is still unresolved' USING errcode='MG409'; END IF;
    v_result:=private.square_publication_state(v_attempt.id);
    PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
    RETURN v_result;
  END IF;
  IF p_menu_publication IS NOT NULL THEN
    v_snapshot:=v_manifest_entry->'source';
    v_ownership:=v_snapshot->>'ownership'; v_external_item:=v_snapshot->>'externalItemId';
    v_brand_name:=v_snapshot->>'brand'; v_variations:=v_snapshot->'variations';
  ELSE
    SELECT * INTO v_parent FROM public.pos_catalog_items i WHERE i.connection_id=v_connection.id
      AND i.brand_id=p_brand AND i.catalog_group='poured' FOR SHARE;
    IF p_adopt_item IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.pos_catalog_variations v
        JOIN public.pos_item_mappings m ON m.connection_id=v.connection_id AND m.external_item_id=v.external_item_id
          AND m.external_variation_id=v.external_variation_id AND NOT m.ignored AND m.format_id IS NOT NULL
        JOIN public.formats f ON f.id=m.format_id AND f.brewery_id=m.brewery_id AND f.brand_id=p_brand AND f.basis='poured'
        WHERE v.brewery_id=p_brewery AND v.connection_id=v_connection.id AND v.external_item_id=p_adopt_item
          AND v.external_variation_id=p_adopt_variation AND v.available)
      THEN RAISE EXCEPTION 'Square adoption must select one observed mapped brand variation'; END IF;
      IF v_parent.connection_id IS NOT NULL THEN
        IF v_parent.external_item_id<>p_adopt_item THEN
          RAISE EXCEPTION 'MGR already owns a different Square item for this brand' USING errcode='MG409'; END IF;
        IF EXISTS(SELECT 1 FROM public.pos_item_mappings m
          JOIN public.pos_catalog_ownership o ON o.connection_id=m.connection_id AND o.format_id=m.format_id
            AND o.brand_id=p_brand AND o.catalog_group='poured' AND o.external_item_id=p_adopt_item
          WHERE m.connection_id=v_connection.id AND m.external_item_id=p_adopt_item
            AND m.external_variation_id=p_adopt_variation AND NOT m.ignored
            AND o.external_variation_id<>p_adopt_variation)
        THEN RAISE EXCEPTION 'MGR already owns a different Square variation for this format' USING errcode='MG409'; END IF;
        v_ownership:=v_parent.ownership; v_external_item:=v_parent.external_item_id;
      ELSE
        IF EXISTS(SELECT 1 FROM public.pos_catalog_items i WHERE i.connection_id=v_connection.id AND i.external_item_id=p_adopt_item)
        THEN RAISE EXCEPTION 'Square adoption must select one observed mapped brand variation'; END IF;
        v_ownership:='adopted'; v_external_item:=p_adopt_item;
      END IF;
    ELSIF v_parent.connection_id IS NOT NULL THEN
      v_ownership:=v_parent.ownership; v_external_item:=v_parent.external_item_id;
    ELSE v_ownership:='mgr';
    END IF;
    v_snapshot:=private.pos_menu_snapshot(v_menu.id);
    SELECT b.name INTO v_brand_name FROM public.brands b WHERE b.id=p_brand AND b.brewery_id=p_brewery;
    SELECT jsonb_agg(jsonb_build_object('formatId',x.value->>'formatId','format',x.value->>'format',
        'priceCents',CASE WHEN x.value->>'priceCents' IS NULL THEN null ELSE (x.value->>'priceCents')::integer END,
        'present',coalesce((x.value->>'available')::boolean,false) AND x.value->>'priceCents' IS NOT NULL,
        'externalVariationId',coalesce(o.external_variation_id,CASE WHEN p_adopt_variation IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.pos_item_mappings m WHERE m.connection_id=v_connection.id
            AND m.external_item_id=p_adopt_item AND m.external_variation_id=p_adopt_variation
            AND m.format_id=(x.value->>'formatId')::uuid AND NOT m.ignored) THEN p_adopt_variation END))
        ORDER BY x.value->>'format',x.value->>'formatId') INTO v_variations
    FROM jsonb_array_elements((v_snapshot->'items')||(v_snapshot->'excluded')) x(value)
    LEFT JOIN public.pos_catalog_ownership o ON o.connection_id=v_connection.id AND o.format_id=(x.value->>'formatId')::uuid
      AND o.brand_id=p_brand AND o.catalog_group='poured' AND o.external_item_id=v_external_item
    WHERE x.value->>'brandId'=p_brand::text;
  END IF;
  IF v_brand_name IS NULL OR (v_external_item IS NULL AND (jsonb_array_length(coalesce(v_variations,'[]'::jsonb))=0
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_variations) e WHERE coalesce((e->>'present')::boolean,false))))
  THEN RAISE EXCEPTION 'Only a brand with a priced available format can create a Square item'; END IF;
  SELECT * INTO v_previous FROM private.square_publications p WHERE p.connection_id=v_connection.id
    AND p.brand_id=p_brand AND p.catalog_group='poured' ORDER BY p.created_at DESC,p.id DESC LIMIT 1;
  IF v_previous.status='rejected' AND v_previous.error_code='version_mismatch' AND NOT p_retry_conflict THEN
    RAISE EXCEPTION 'Square changed this item; retry requires current version confirmation' USING errcode='MG409'; END IF;
  INSERT INTO private.square_publications(brewery_id,connection_id,actor_id,menu_publication_id,request_id,command_name,
    credential_version,catalog_generation,external_location_id,brand_id,catalog_group,ownership_intent,
    external_item_id,adopt_variation_id,source_snapshot)
  VALUES(p_brewery,v_connection.id,v_actor,p_menu_publication,p_request_id,p_command,v_connection.credential_version,
    v_connection.catalog_sync_generation,p_external_location,p_brand,'poured',v_ownership,v_external_item,p_adopt_variation,
    CASE WHEN p_menu_publication IS NULL THEN jsonb_build_object('brandId',p_brand,'brand',v_brand_name,
      'catalogGroup','poured','locationId',p_external_location,'ownership',v_ownership,
      'externalItemId',v_external_item,'variations',v_variations) ELSE v_snapshot END) RETURNING * INTO v_attempt;
  v_result:=private.square_publication_state(v_attempt.id);
  PERFORM private.complete_command_request_for(v_actor,p_request_id,v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.lease_square_publication(p_brewery uuid,p_publication uuid,p_actor uuid)
RETURNS TABLE(access_token text,request_body text,superseded boolean,refresh_token text,
  access_expires_at timestamptz,merchant_id text,credential_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt private.square_publications;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.role IN ('admin','warehouse')) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication AND p.brewery_id=p_brewery;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT p.* INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN
    RETURN QUERY SELECT null::text,null::text,true,null::text,null::timestamptz,null::text,null::bigint;
    RETURN;
  END IF;
  RETURN QUERY SELECT t.access_token,p.request_body,false,t.refresh_token,c.access_expires_at,c.merchant_id,c.credential_version
  FROM private.square_publications p
  JOIN public.pos_connections c ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.provider='square'
    AND c.state='connected' AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
  JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
    AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
  WHERE p.id=p_publication AND p.status IN ('needs_snapshot','prepared') AND (
    (p.external_item_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.pos_catalog_items i
      WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id AND i.catalog_group=p.catalog_group))
    OR EXISTS(SELECT 1 FROM public.pos_catalog_items i WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id
      AND i.catalog_group=p.catalog_group AND i.external_item_id=p.external_item_id AND i.ownership=p.ownership_intent)
    OR (p.ownership_intent='adopted' AND p.adopt_variation_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.pos_catalog_variations v JOIN public.pos_item_mappings m
        ON m.connection_id=v.connection_id AND m.external_item_id=v.external_item_id
          AND m.external_variation_id=v.external_variation_id AND NOT m.ignored
      JOIN public.formats f ON f.id=m.format_id AND f.brewery_id=m.brewery_id AND f.brand_id=p.brand_id
      WHERE v.connection_id=p.connection_id AND v.external_item_id=p.external_item_id
        AND v.external_variation_id=p.adopt_variation_id AND v.available)));
END $$;

CREATE FUNCTION public.prepare_square_publication(p_brewery uuid,p_publication uuid,p_actor uuid,p_request_body text,
  p_item_version bigint,p_variation_versions jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt private.square_publications; v_body jsonb; v_object jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.role IN ('admin','warehouse')) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN RETURN false; END IF;
  SELECT p.* INTO v_attempt FROM private.square_publications p JOIN public.pos_connections c
    ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.state='connected'
      AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
    JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
      AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
    WHERE p.id=p_publication AND p.brewery_id=p_brewery FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF v_attempt.status='prepared' THEN RETURN v_attempt.request_body=p_request_body; END IF;
  IF v_attempt.status<>'needs_snapshot' THEN RAISE EXCEPTION 'Square publication is already finished' USING errcode='MG409'; END IF;
  BEGIN v_body:=p_request_body::jsonb; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Square publication body is invalid'; END;
  v_object:=v_body->'object';
  IF v_body->>'idempotency_key'<>v_attempt.provider_key::text OR jsonb_typeof(v_object)<>'object'
    OR jsonb_typeof(p_variation_versions)<>'object'
    OR jsonb_typeof(p_variation_versions->'versions')<>'object'
    OR jsonb_typeof(p_variation_versions->'changed')<>'array'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_variation_versions->'changed') e WHERE jsonb_typeof(e)<>'string')
    OR p_request_body LIKE '%"sold_out"%' OR p_request_body LIKE '%"sold_out_valid_until"%'
    OR p_request_body LIKE '%access_token%' THEN RAISE EXCEPTION 'Square publication body is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    IF v_object->>'type'<>'ITEM' OR left(v_object->>'id',1)<>'#' OR p_item_version IS NOT NULL
      THEN RAISE EXCEPTION 'Square create publication is invalid'; END IF;
  ELSIF p_item_version IS NULL OR v_object->>'id'<>v_attempt.external_item_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
      WHERE e->>'externalVariationId'=v_object->>'id')
  THEN RAISE EXCEPTION 'Square update publication is invalid'; END IF;
  UPDATE private.square_publications SET request_body=p_request_body,expected_item_version=p_item_version,
    expected_variation_versions=coalesce(p_variation_versions,'{}'::jsonb),status='prepared' WHERE id=v_attempt.id;
  RETURN true;
END $$;

CREATE FUNCTION public.finish_square_publication(p_brewery uuid,p_publication uuid,p_actor uuid,p_error_code text,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_attempt private.square_publications; v_result jsonb; v_object jsonb; v_maps jsonb; v_source_variation jsonb;
  v_item text; v_variation text; v_item_version bigint; v_variation_version bigint; v_present boolean; v_format uuid;
  v_expected_versions jsonb; v_changed_variations jsonb; v_request_variation jsonb; v_response_variation jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.role IN ('admin','warehouse')) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'square-publish:'||v_attempt.connection_id::text||':'||v_attempt.brand_id::text||':'||v_attempt.catalog_group,0));
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=v_attempt.connection_id AND c.brewery_id=p_brewery AND c.state='connected'
      AND c.credential_version=v_attempt.credential_version AND c.catalog_sync_generation=v_attempt.catalog_generation
      AND t.credential_version=v_attempt.credential_version)
  THEN RAISE EXCEPTION 'Square publication was superseded' USING errcode='MG409'; END IF;
  IF p_error_code IS NOT NULL THEN
    IF p_error_code NOT IN ('version_mismatch','provider_rejected','provider_missing','provider_invalid') OR p_response IS NOT NULL
      OR (v_attempt.status='needs_snapshot' AND p_error_code NOT IN ('provider_missing','provider_invalid'))
    THEN RAISE EXCEPTION 'Square publication result is invalid'; END IF;
    v_result:=jsonb_build_object('published',false,'conflict',p_error_code='version_mismatch','errorCode',p_error_code);
    UPDATE private.square_publications SET status='rejected',error_code=p_error_code,result=v_result,finished_at=now() WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF v_attempt.status<>'prepared' THEN RAISE EXCEPTION 'Square publication was not prepared' USING errcode='MG409'; END IF;
  v_object:=p_response->'catalogObject'; v_maps:=p_response->'idMappings';
  v_expected_versions:=v_attempt.expected_variation_versions->'versions';
  v_changed_variations:=v_attempt.expected_variation_versions->'changed';
  IF jsonb_typeof(v_object)<>'object' OR jsonb_typeof(v_maps)<>'array' THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    SELECT e->>'object_id' INTO v_item FROM jsonb_array_elements(v_maps) e
      WHERE e->>'client_object_id'=(v_attempt.request_body::jsonb#>>'{object,id}');
  ELSE v_item:=v_attempt.external_item_id; END IF;
  IF v_object->>'type'='ITEM' THEN
    IF v_object->>'id'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=(v_object->>'version')::bigint;
    IF v_attempt.expected_item_version IS NOT NULL AND v_item_version<=v_attempt.expected_item_version
      THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
  ELSIF v_object->>'type'='ITEM_VARIATION' THEN
    IF v_object#>>'{item_variation_data,item_id}'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=v_attempt.expected_item_version;
  ELSE RAISE EXCEPTION 'Square publication response type is invalid'; END IF;
  IF nullif(btrim(v_item),'') IS NULL OR v_item_version IS NULL OR v_item_version<0
    THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  v_present:=EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
    WHERE coalesce((e->>'present')::boolean,false));
  INSERT INTO public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership,retired_at)
  VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_item,v_attempt.ownership_intent,
    CASE WHEN v_present THEN null ELSE now() END)
  ON CONFLICT(connection_id,brand_id,catalog_group) DO UPDATE SET external_item_id=excluded.external_item_id,
    ownership=excluded.ownership,retired_at=excluded.retired_at,updated_at=now();
  FOR v_source_variation IN SELECT value FROM jsonb_array_elements(v_attempt.source_snapshot->'variations')
  LOOP
    v_format:=(v_source_variation->>'formatId')::uuid;
    v_variation:=v_source_variation->>'externalVariationId';
    IF v_variation IS NULL AND coalesce((v_source_variation->>'present')::boolean,false) THEN
      SELECT e->>'object_id' INTO v_variation FROM jsonb_array_elements(v_maps) e
        WHERE e->>'client_object_id'='#mgr-variation-'||(v_source_variation->>'formatId');
    END IF;
    IF v_variation IS NULL THEN CONTINUE; END IF;
    IF v_object->>'type'='ITEM' THEN
      SELECT e,(e->>'version')::bigint INTO v_response_variation,v_variation_version
        FROM jsonb_array_elements(v_object#>'{item_data,variations}') e
        WHERE e->>'id'=v_variation;
      SELECT e INTO v_request_variation FROM jsonb_array_elements(v_attempt.request_body::jsonb#>'{object,item_data,variations}') e
        WHERE e->>'id'=v_variation;
    ELSIF v_object->>'id'=v_variation THEN
      v_response_variation:=v_object; v_variation_version:=(v_object->>'version')::bigint;
      v_request_variation:=v_attempt.request_body::jsonb->'object';
    ELSE CONTINUE;
    END IF;
    IF v_variation_version IS NULL OR v_variation_version<0 OR
      ((v_expected_versions ? v_variation) AND
        (v_variation_version<(v_expected_versions->>v_variation)::bigint
          OR (v_changed_variations ? v_variation) AND v_variation_version=(v_expected_versions->>v_variation)::bigint
          OR v_request_variation IS NULL OR NOT (v_response_variation @> (v_request_variation-'version'))))
    THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
    INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,
      external_item_name,external_variation_name,source_version,available,last_seen_at)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_variation,v_attempt.source_snapshot->>'brand',
      v_source_variation->>'format',v_variation_version,true,now())
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,external_variation_name=excluded.external_variation_name,
      source_version=excluded.source_version,available=true,last_seen_at=excluded.last_seen_at;
    INSERT INTO public.pos_item_mappings(brewery_id,connection_id,external_item_id,external_item_name,
      external_variation_id,format_id,sku_id,ignored)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_attempt.source_snapshot->>'brand',v_variation,v_format,null,false)
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,format_id=excluded.format_id,sku_id=null,ignored=false;
    INSERT INTO public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,
      external_item_id,external_variation_id,retired_at)
    VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,v_item,v_variation,
      CASE WHEN coalesce((v_source_variation->>'present')::boolean,false) THEN null ELSE now() END)
    ON CONFLICT(connection_id,format_id) DO UPDATE SET external_item_id=excluded.external_item_id,
      external_variation_id=excluded.external_variation_id,retired_at=excluded.retired_at,updated_at=now();
    INSERT INTO private.square_publication_events(publication_id,brewery_id,connection_id,brand_id,catalog_group,
      format_id,external_item_id,external_variation_id,ownership,present)
    VALUES(v_attempt.id,p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,
      v_item,v_variation,v_attempt.ownership_intent,coalesce((v_source_variation->>'present')::boolean,false));
  END LOOP;
  v_result:=jsonb_build_object('published',v_present,'retired',NOT v_present,'externalItemId',v_item,
    'ownership',v_attempt.ownership_intent,'variations',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'formatId',o.format_id,'externalVariationId',o.external_variation_id,'retired',o.retired_at IS NOT NULL)
      ORDER BY o.format_id),'[]'::jsonb) FROM public.pos_catalog_ownership o WHERE o.connection_id=v_attempt.connection_id
        AND o.brand_id=v_attempt.brand_id AND o.catalog_group=v_attempt.catalog_group));
  UPDATE private.square_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR no_data_found THEN
  RAISE EXCEPTION 'Square publication response is invalid';
END $$;

REVOKE ALL ON FUNCTION public.begin_square_menu_publication(uuid,text,boolean,uuid),
  public.finish_square_menu_publication(uuid,uuid,uuid),
  public.begin_square_publication(uuid,text,uuid,text,text,boolean,text,uuid,uuid),
  public.lease_square_publication(uuid,uuid,uuid),public.prepare_square_publication(uuid,uuid,uuid,text,bigint,jsonb),
  public.finish_square_publication(uuid,uuid,uuid,text,jsonb) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_square_menu_publication(uuid,text,boolean,uuid),
  public.begin_square_publication(uuid,text,uuid,text,text,boolean,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lease_square_publication(uuid,uuid,uuid),
  public.prepare_square_publication(uuid,uuid,uuid,text,bigint,jsonb),
  public.finish_square_publication(uuid,uuid,uuid,text,jsonb),
  public.finish_square_menu_publication(uuid,uuid,uuid) TO postgres,service_role;

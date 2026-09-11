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

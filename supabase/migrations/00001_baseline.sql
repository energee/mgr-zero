-- 00001_baseline.sql — the complete MGR schema for all ten slices.
-- Design: .agents/superpowers/specs/2026-08-31-mgr-schema-design.md
-- Decisions: .agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md
-- Domain units: .agents/superpowers/specs/brewing-domain.md (bbl, °F, °Plato, cents)
--
-- Conventions (see §0 of the design doc):
--   * every tenant table has brewery_id, unique (id, brewery_id), RLS
--   * every cross-table reference is a composite (x_id, brewery_id) FK
--   * ledgers are append-only (update/delete revoked); corrections are reversals
--   * derived values are triggers or views, never client-supplied
--   * every function sets search_path = '' and schema-qualifies what it touches
-- Pre-deploy this file is edited in place; never add a second migration.

create extension if not exists btree_gist;
-- `private` is deliberately absent from supabase/config.toml's API schemas.
-- It holds server-only integration credentials; public connection tables hold
-- only metadata safe for staff queries.
create schema private;


-- ---------------------------------------------------------------- enums
create type staff_role as enum ('admin','sales','warehouse','brewer');
create type customer_type as enum ('distributor','retailer','brewery','other');
create type package_type as enum ('keg','can','bottle');
create type keg_size as enum ('half_bbl','quarter_bbl','sixth_bbl','fifty_l','thirty_l','twenty_l');
create type keg_container_source as enum ('owned_fleet','per_fill_rental','one_way_material');
create type location_kind as enum ('warehouse','taproom');
create type movement_type as enum
  ('opening_balance','production_in','adjustment','sale_removal','taproom_transfer',
   'depletion','return_in','destruction','loss','sample','festival_removal');
create type sale_channel as enum ('wholesale','taproom','dtc','export');
create type allocation_source as enum ('order_line','taproom_standing');
create type allocation_status as enum ('open','fulfilled','released');
create type order_kind as enum ('wholesale','taproom_transfer');
create type order_status as enum ('draft','submitted','confirmed','picked','shipped','cancelled');
create type invoice_kind as enum ('invoice','credit_memo');
create type invoice_line_kind as enum ('sku','keg_deposit','keg_deposit_refund','adjustment');
create type qbo_sync_status as enum ('pending','pushed','push_failed');
create type material_category as enum ('malt','hop','yeast','adjunct','chemical','packaging','other');
create type uom as enum ('lb','kg','oz','g','each','l','gal','ml');
create type material_movement_type as enum
  ('opening_balance','receipt','consumption','return_to_stock','loss','adjustment','count_adjustment');
create type po_status as enum ('draft','sent','partially_received','received','cancelled');
create type ingredient_stage as enum ('mash','boil','whirlpool','fermentation','dry_hop','packaging','other');
create type vessel_kind as enum ('fermenter','brite','barrel','kettle','other');
create type volume_adjustment_reason as enum ('loss','dump','gain','measurement');
create type keg_pool_kind as enum ('owned','leased','pay_per_fill');
create type keg_event_reason as enum ('acquired','retired','shipped','returned','lost','found');
create type approval_kind as enum ('cola','formula');

-- ---------------------------------------------------------------- core
create table breweries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ttb_registry_no text,
  pa_license_no text,
  timezone text not null default 'America/New_York',
  settings jsonb not null default '{}',
  fermentation_reading_due_hours int not null default 24 check (fermentation_reading_due_hours between 1 and 168),
  created_at timestamptz not null default now()
);

create table brewery_users (
  brewery_id uuid not null references breweries(id),
  user_id uuid not null references auth.users(id),
  role staff_role not null,
  created_at timestamptz not null default now(),
  primary key (brewery_id, user_id)
);

-- Access helpers (security definer so RLS policies can call them cheaply).
create function my_brewery_ids() returns setof uuid
language sql stable security definer set search_path = '' as
$$ select brewery_id from public.brewery_users where user_id = auth.uid() $$;

create function is_staff_of(b uuid) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists(select 1 from public.brewery_users where user_id = auth.uid() and brewery_id = b) $$;

create function staff_role(b uuid) returns staff_role
language sql stable security definer set search_path = '' as
$$ select role from public.brewery_users where user_id = auth.uid() and brewery_id = b $$;

-- Per-brewery document numbers (orders, invoices, POs, batches, runs).
create table brewery_counters (
  brewery_id uuid not null references breweries(id),
  key text not null,
  next bigint not null default 1,
  primary key (brewery_id, key),
  check (key in ('batch', 'run', 'po', 'order', 'invoice'))   -- the committed document kinds
);
-- Internal only: no Data API role may execute this (see the grants section).
-- Reached solely through the set_doc_no trigger below, which runs as the
-- owner so it can advance the owning brewery's counter and no other.
create function next_no(b uuid, k text) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.brewery_counters (brewery_id, key, next) values (b, k, 2)
  on conflict (brewery_id, key) do update set next = brewery_counters.next + 1
  returning next - 1
$$;
-- before insert trigger: set_doc_no('<column>', '<counter key>')
create function set_doc_no() returns trigger language plpgsql security definer set search_path = '' as $$
declare col text := tg_argv[0]; k text := tg_argv[1]; cur bigint;
begin
  execute format('select ($1).%I', col) into cur using new;
  if cur is null then
    new := jsonb_populate_record(new, jsonb_build_object(col, public.next_no(new.brewery_id, k)));
  end if;
  return new;
end $$;

create table customers (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  type customer_type not null default 'retailer',
  license_no text,
  state text not null check (state ~ '^[A-Z]{2}$'),   -- home state
  price_list_id uuid,                                  -- FK added after price_lists
  qbo_customer_id text,
  payment_terms text not null default 'net30',
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name)
);

create table customer_users (
  customer_id uuid not null references customers(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

create function my_customer_ids() returns setof uuid
language sql stable security definer set search_path = '' as
$$ select customer_id from public.customer_users where user_id = auth.uid() $$;

create table ship_tos (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  customer_id uuid not null,
  label text not null,
  address1 text not null, address2 text, city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),   -- drives dest_state on removals
  zip text not null,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (id, customer_id, brewery_id),                -- lets orders pin a ship-to to its customer
  foreign key (customer_id, brewery_id) references customers (id, brewery_id)
);
create index ship_tos_customer_idx on ship_tos (customer_id);

-- ---------------------------------------------------------------- materials (definitions)
create table vendors (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  contact_name text, email text, phone text, address text,
  payment_terms text not null default 'net30',
  qbo_vendor_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name)
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  category material_category not null,
  base_uom uom not null,
  purchase_uom uom not null,
  purchase_uom_factor numeric(14,6) not null default 1 check (purchase_uom_factor > 0), -- base units per purchase unit
  lot_tracked boolean not null default false,
  default_vendor_id uuid,
  lead_time_days int,
  reorder_point numeric(14,4),                          -- base uom
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  foreign key (default_vendor_id, brewery_id) references vendors (id, brewery_id)
);

create table material_lots (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  material_id uuid not null,
  lot_code text not null,
  vendor_id uuid,
  received_on date,
  best_by date,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (id, material_id, brewery_id),                -- a movement's lot must belong to its material
  unique (material_id, lot_code),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (vendor_id, brewery_id) references vendors (id, brewery_id)
);

-- ---------------------------------------------------------------- catalog
create table products (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  style text,
  abv numeric(4,2),
  ttb_tax_class text not null default 'beer',
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name)
);

create table keg_pools (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  kind keg_pool_kind not null,
  vendor_id uuid,
  per_fill_cents int check (per_fill_cents >= 0),
  deposit_cents int not null default 0 check (deposit_cents >= 0),
  contract_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  foreign key (vendor_id, brewery_id) references vendors (id, brewery_id),
  check ((kind = 'owned') = (vendor_id is null)),
  check (kind <> 'pay_per_fill' or per_fill_cents is not null)
);

create table skus (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  product_id uuid not null,
  name text not null,                    -- "1/2 bbl keg", "16oz 4-pack"
  package_type package_type not null,
  units_per_case int,
  bbl_per_unit numeric(12,8) not null check (bbl_per_unit > 0),   -- exact fraction; basis of all TTB math
  upc text,
  keg_size keg_size,
  container_source keg_container_source,
  keg_pool_id uuid,
  qbo_item_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (product_id, name),
  foreign key (product_id, brewery_id) references products (id, brewery_id),
  foreign key (keg_pool_id, brewery_id) references keg_pools (id, brewery_id),
  -- keg fields are only meaningful on kegs; kegs may leave them unset (slice 5 fills them in)
  check (package_type = 'keg' or (keg_size is null and container_source is null)),
  check ((coalesce(container_source in ('owned_fleet','per_fill_rental'), false)) = (keg_pool_id is not null))
);
create index skus_brewery_idx on skus (brewery_id, product_id);
create unique index skus_upc_uidx on skus (brewery_id, upc) where upc is not null;

create table price_lists (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  unique (id, brewery_id),
  unique (brewery_id, name)
);

create table price_list_items (
  price_list_id uuid not null,
  sku_id uuid not null,
  brewery_id uuid not null references breweries(id),
  unit_price_cents int not null check (unit_price_cents >= 0),
  srp_cents int check (srp_cents >= 0),                -- suggested retail
  primary key (price_list_id, sku_id),
  foreign key (price_list_id, brewery_id) references price_lists (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);
alter table customers add constraint customers_price_list_fk
  foreign key (price_list_id, brewery_id) references price_lists (id, brewery_id);

-- Packaging BOM: materials consumed per single SKU unit (incl. one-way kegs).
create table sku_bom (
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null,
  material_id uuid not null,
  qty_per_unit numeric(14,6) not null check (qty_per_unit > 0),   -- material base uom
  primary key (sku_id, material_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id)
);
create index sku_bom_material_idx on sku_bom (material_id);

-- ---------------------------------------------------------------- FG ledger
create table locations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  kind location_kind not null,
  unique (id, brewery_id),
  unique (brewery_id, name)
);

-- The portal's shipping source is selected by an administrator, never by a
-- customer request or an arbitrary warehouse lookup.
alter table breweries add column portal_fulfillment_location_id uuid;
alter table breweries add foreign key (portal_fulfillment_location_id, id)
  references locations (id, brewery_id);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null,
  location_id uuid not null,
  qty numeric(12,2) not null check (qty <> 0),   -- signed units
  bbl numeric(14,8) not null,                    -- qty * bbl_per_unit, frozen at write time (trigger)
  type movement_type not null,
  channel sale_channel,
  dest_state text,
  lot_id uuid,                                   -- FK to lots added below
  ref uuid,                                      -- order_id / pos_sale id / run id
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  -- removals must be negative and classified; inflows positive.
  constraint removal_shape check (
    case type
      when 'sale_removal'     then qty < 0 and channel is not null and dest_state is not null
      when 'depletion'        then qty < 0 and channel = 'taproom' and dest_state is null
      when 'destruction'      then qty < 0 and channel is null and dest_state is null
      when 'loss'             then qty < 0 and channel is null and dest_state is null
      when 'sample'           then qty < 0 and dest_state is not null
      when 'festival_removal' then qty < 0 and dest_state is not null
      when 'opening_balance'  then qty > 0 and channel is null and dest_state is null
      when 'production_in'    then qty > 0 and channel is null and dest_state is null
      when 'return_in'        then qty > 0 and channel is null and dest_state is null
      when 'adjustment'       then channel is null and dest_state is null
      when 'taproom_transfer' then channel is null and dest_state is null
      else true
    end)
);
create index movements_onhand_idx on inventory_movements (brewery_id, sku_id, location_id);
create index movements_created_idx on inventory_movements (brewery_id, created_at);
create index movements_lot_idx on inventory_movements (lot_id) where lot_id is not null;

create function enforce_bbl_integrity() returns trigger language plpgsql set search_path = '' as $$
begin
  select (new.qty * s.bbl_per_unit) into new.bbl from public.skus s where s.id = new.sku_id;
  return new;
end $$;
create trigger inventory_movements_bbl_trigger before insert on inventory_movements
  for each row execute function enforce_bbl_integrity();

create table allocations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null,
  qty numeric(12,2) not null check (qty > 0),
  source allocation_source not null,
  ref uuid not null,               -- order_line_id or location_id (validated by trigger)
  status allocation_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);
create index allocations_open_idx on allocations (brewery_id, sku_id) where status = 'open';
create index allocations_ref_idx on allocations (ref);

create table taproom_pars (
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  sku_id uuid not null,
  par_qty numeric(12,2) not null check (par_qty >= 0),
  primary key (location_id, sku_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);

-- ---------------------------------------------------------------- recipes (immutable versions)
create table recipes (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  product_id uuid,
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  foreign key (product_id, brewery_id) references products (id, brewery_id)
);

create table recipe_versions (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  recipe_id uuid not null,
  version int not null,
  target_og_plato numeric(5,2), target_fg_plato numeric(5,2),   -- °Plato (brewing-domain.md)
  target_abv numeric(4,2), target_ibu numeric(5,1),
  boil_minutes int,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (recipe_id, version),
  foreign key (recipe_id, brewery_id) references recipes (id, brewery_id)
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  recipe_version_id uuid not null,
  material_id uuid not null,
  per_bbl_qty numeric(14,6) not null check (per_bbl_qty > 0),   -- base uom per bbl; scaled at brew time
  stage ingredient_stage not null,
  timing_minutes int,
  sort int not null default 0,
  unique (id, brewery_id),
  foreign key (recipe_version_id, brewery_id) references recipe_versions (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id)
);
create index recipe_ingredients_version_idx on recipe_ingredients (recipe_version_id);
create index recipe_ingredients_material_idx on recipe_ingredients (material_id);

-- ---------------------------------------------------------------- production
create table vessels (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  kind vessel_kind not null,
  capacity_bbl numeric(10,3) not null check (capacity_bbl > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name)
  -- no status column: contents are derived from open vessel_occupancies
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  batch_no bigint,                                     -- trigger
  product_id uuid not null,
  recipe_version_id uuid,
  planned_on date not null,
  planned_bbl numeric(10,3) not null check (planned_bbl > 0),
  brewed_on date,
  closed_at timestamptz,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, batch_no),
  foreign key (product_id, brewery_id) references products (id, brewery_id),
  foreign key (recipe_version_id, brewery_id) references recipe_versions (id, brewery_id)
);
create index batches_planned_idx on batches (brewery_id, planned_on);
create index batches_product_idx on batches (product_id);
create trigger batches_no before insert on batches for each row execute function set_doc_no('batch_no','batch');

create table vessel_occupancies (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  vessel_id uuid not null,
  batch_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  initial_bbl numeric(10,3) not null default 0 check (initial_bbl >= 0),   -- 0 when filled by transfer
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (vessel_id, brewery_id) references vessels (id, brewery_id),
  foreign key (batch_id, brewery_id) references batches (id, brewery_id),
  -- one occupancy per vessel at a time; blends are transfers into the surviving occupancy
  exclude using gist (vessel_id with =, tstzrange(started_at, ended_at) with &&)
);
create index occupancies_batch_idx on vessel_occupancies (batch_id);
create index occupancies_open_idx on vessel_occupancies (brewery_id) where ended_at is null;

create table transfers (   -- ledger
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  from_occupancy_id uuid not null,
  to_occupancy_id uuid not null check (to_occupancy_id <> from_occupancy_id),
  bbl numeric(10,3) not null check (bbl > 0),
  loss_bbl numeric(10,3) not null default 0 check (loss_bbl >= 0),
  at timestamptz not null default now(),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (from_occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id),
  foreign key (to_occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id)
);
create index transfers_from_idx on transfers (from_occupancy_id);
create index transfers_to_idx on transfers (to_occupancy_id);

create table volume_adjustments (   -- ledger: cellar losses/dumps/gains
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  occupancy_id uuid not null,
  bbl numeric(10,3) not null check (bbl <> 0),
  reason volume_adjustment_reason not null,
  at timestamptz not null default now(),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id)
);
create index volume_adjustments_occ_idx on volume_adjustments (occupancy_id);

create table fermentation_readings (   -- manual entry only; °F and °Plato per brewing-domain.md
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  occupancy_id uuid not null,
  at timestamptz not null default now(),
  temp_f numeric(5,1), ph numeric(4,2), gravity_plato numeric(5,2),
  note text,
  created_by uuid not null references auth.users(id),
  foreign key (occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id)
);
create index readings_occ_idx on fermentation_readings (occupancy_id, at);

-- ---------------------------------------------------------------- materials ledger
create table material_movements (   -- ledger
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  material_id uuid not null,
  lot_id uuid,                                         -- required iff materials.lot_tracked (trigger)
  qty numeric(14,4) not null check (qty <> 0),         -- base uom, signed
  type material_movement_type not null,
  unit_cost_cents int check (unit_cost_cents >= 0),    -- receipts
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (lot_id, material_id, brewery_id) references material_lots (id, material_id, brewery_id),
  constraint material_sign check (
    case type
      when 'receipt'         then qty > 0
      when 'opening_balance' then qty > 0
      when 'return_to_stock' then qty > 0
      when 'consumption'     then qty < 0
      when 'loss'            then qty < 0
      else true
    end)
);
create index material_movements_material_idx on material_movements (brewery_id, material_id);
create index material_movements_lot_idx on material_movements (brewery_id, material_id, lot_id) where lot_id is not null;
create index material_movements_created_idx on material_movements (brewery_id, created_at);

create function enforce_material_lot() returns trigger language plpgsql set search_path = '' as $$
declare tracked boolean;
begin
  select lot_tracked into tracked from public.materials where id = new.material_id;
  if tracked and new.type <> 'opening_balance' and new.lot_id is null then
    raise exception 'material % is lot-tracked: lot_id is required for %', new.material_id, new.type
      using errcode = 'check_violation';
  end if;
  if not tracked and new.lot_id is not null then
    raise exception 'material % is not lot-tracked: lot_id must be null', new.material_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger material_movements_lot_trigger before insert on material_movements
  for each row execute function enforce_material_lot();

create table batch_additions (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  batch_id uuid not null,
  occupancy_id uuid,
  recipe_ingredient_id uuid,
  stage ingredient_stage not null,
  at timestamptz not null default now(),
  movement_id uuid not null unique,                    -- the consumption movement
  unique (id, brewery_id),
  foreign key (batch_id, brewery_id) references batches (id, brewery_id),
  foreign key (occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id),
  foreign key (recipe_ingredient_id, brewery_id) references recipe_ingredients (id, brewery_id),
  foreign key (movement_id, brewery_id) references material_movements (id, brewery_id)
);
create index batch_additions_batch_idx on batch_additions (batch_id);

create function enforce_consumption_movement() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.material_movements where id = new.movement_id and type = 'consumption') then
    raise exception 'batch_additions.movement_id must reference a consumption movement' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger batch_additions_movement_trigger before insert or update on batch_additions
  for each row execute function enforce_consumption_movement();

-- ---------------------------------------------------------------- packaging + lots
create table packaging_runs (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  run_no bigint,                                       -- trigger
  occupancy_id uuid not null,                          -- exactly one source occupancy
  planned_on date not null,
  started_at timestamptz,
  closed_at timestamptz,
  bbl_drawn numeric(10,3) check (bbl_drawn >= 0),      -- recorded at close
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, run_no),
  foreign key (occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id)
);
create index packaging_runs_planned_idx on packaging_runs (brewery_id, planned_on);
create index packaging_runs_occ_idx on packaging_runs (occupancy_id);
create trigger packaging_runs_no before insert on packaging_runs for each row execute function set_doc_no('run_no','run');

create table lots (   -- 1:1 with packaging runs
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  packaging_run_id uuid not null unique,
  product_id uuid not null,
  code text not null,
  packaged_on date not null,
  best_by date,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, code),
  foreign key (packaging_run_id, brewery_id) references packaging_runs (id, brewery_id),
  foreign key (product_id, brewery_id) references products (id, brewery_id)
);
alter table inventory_movements add constraint inventory_movements_lot_fk
  foreign key (lot_id, brewery_id) references lots (id, brewery_id);

create table packaging_run_outputs (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  run_id uuid not null,
  sku_id uuid not null,
  qty_planned numeric(12,2) not null default 0 check (qty_planned >= 0),
  qty_actual numeric(12,2) check (qty_actual >= 0),
  movement_id uuid unique,                             -- production_in, set at close
  unique (run_id, sku_id),
  foreign key (run_id, brewery_id) references packaging_runs (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (movement_id, brewery_id) references inventory_movements (id, brewery_id)
);

create table packaging_run_consumptions (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  run_id uuid not null,
  movement_id uuid not null unique,                    -- consumption / return_to_stock / loss
  foreign key (run_id, brewery_id) references packaging_runs (id, brewery_id),
  foreign key (movement_id, brewery_id) references material_movements (id, brewery_id)
);
create index packaging_run_consumptions_run_idx on packaging_run_consumptions (run_id);

-- ---------------------------------------------------------------- purchasing
create table material_contracts (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  vendor_id uuid not null,
  material_id uuid not null,
  contract_no text,
  qty_committed numeric(14,4) not null check (qty_committed > 0),   -- purchase uom
  unit_cost_cents int check (unit_cost_cents >= 0),
  starts_on date, ends_on date,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (vendor_id, brewery_id) references vendors (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id)
);
create index material_contracts_material_idx on material_contracts (material_id);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  po_no bigint,                                        -- trigger
  vendor_id uuid not null,
  status po_status not null default 'draft',
  ordered_on date, expected_on date,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, po_no),
  foreign key (vendor_id, brewery_id) references vendors (id, brewery_id)
);
create index purchase_orders_status_idx on purchase_orders (brewery_id, status, expected_on);
create trigger purchase_orders_no before insert on purchase_orders for each row execute function set_doc_no('po_no','po');

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  po_id uuid not null,
  material_id uuid not null,
  qty_ordered numeric(14,4) not null check (qty_ordered > 0),     -- purchase uom
  unit_cost_cents int check (unit_cost_cents >= 0),
  contract_id uuid,
  unique (id, brewery_id),
  foreign key (po_id, brewery_id) references purchase_orders (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (contract_id, brewery_id) references material_contracts (id, brewery_id)
);
create index po_lines_po_idx on purchase_order_lines (po_id);
create index po_lines_material_idx on purchase_order_lines (material_id);
create index po_lines_contract_idx on purchase_order_lines (contract_id) where contract_id is not null;

create table receipts (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  po_id uuid not null,
  received_on date not null default current_date,
  received_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (po_id, brewery_id) references purchase_orders (id, brewery_id)
);
create index receipts_po_idx on receipts (po_id);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  receipt_id uuid not null,
  po_line_id uuid not null,
  qty_expected numeric(14,4) not null check (qty_expected >= 0),
  qty_counted numeric(14,4) not null check (qty_counted >= 0),     -- only this posts to the ledger
  variance numeric(14,4) generated always as (qty_counted - qty_expected) stored,
  lot_id uuid,
  movement_id uuid unique,
  foreign key (receipt_id, brewery_id) references receipts (id, brewery_id),
  foreign key (po_line_id, brewery_id) references purchase_order_lines (id, brewery_id),
  foreign key (lot_id, brewery_id) references material_lots (id, brewery_id),
  foreign key (movement_id, brewery_id) references material_movements (id, brewery_id)
);
create index receipt_lines_po_line_idx on receipt_lines (po_line_id);

-- Derive PO received / partially_received from counted receipts.
create function update_po_status() returns trigger language plpgsql set search_path = '' as $$
declare po uuid; complete boolean;
begin
  select po_id into po from public.purchase_order_lines where id = new.po_line_id;
  select bool_and(coalesce(r.counted, 0) >= l.qty_ordered) into complete
    from public.purchase_order_lines l
    left join (select po_line_id, sum(qty_counted) counted from public.receipt_lines group by 1) r on r.po_line_id = l.id
    where l.po_id = po;
  update public.purchase_orders
    set status = case when complete then 'received' else 'partially_received' end::public.po_status
    where id = po and status in ('draft','sent','partially_received');
  return null;
end $$;
create trigger receipt_lines_po_status after insert on receipt_lines
  for each row execute function update_po_status();

create table material_counts (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  counted_on date not null default current_date,
  counted_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id)
);

create table material_count_lines (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  count_id uuid not null,
  material_id uuid not null,
  lot_id uuid,
  qty_expected numeric(14,4) not null,                 -- on-hand snapshot at count time
  qty_counted numeric(14,4) not null check (qty_counted >= 0),
  movement_id uuid unique,                             -- count_adjustment; null when no variance
  foreign key (count_id, brewery_id) references material_counts (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (lot_id, material_id, brewery_id) references material_lots (id, material_id, brewery_id),
  foreign key (movement_id, brewery_id) references material_movements (id, brewery_id)
);
create index material_count_lines_count_idx on material_count_lines (count_id);
create index material_count_lines_material_idx on material_count_lines (material_id);

-- ---------------------------------------------------------------- orders, shipments, invoices
create table orders (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  order_no bigint,                                     -- trigger
  kind order_kind not null default 'wholesale',
  status order_status not null default 'draft',
  customer_id uuid,
  ship_to_id uuid,
  from_location_id uuid not null,                      -- where removals post
  to_location_id uuid,                                 -- taproom transfers
  price_list_id uuid,                                  -- list used for line snapshots
  requested_ship_date date,
  po_number text,
  note text,
  needs_restock boolean not null default false,
  created_by uuid not null references auth.users(id),
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, order_no),
  foreign key (customer_id, brewery_id) references customers (id, brewery_id),
  foreign key (ship_to_id, customer_id, brewery_id) references ship_tos (id, customer_id, brewery_id),
  foreign key (from_location_id, brewery_id) references locations (id, brewery_id),
  foreign key (to_location_id, brewery_id) references locations (id, brewery_id),
  foreign key (price_list_id, brewery_id) references price_lists (id, brewery_id),
  check (case kind
    when 'wholesale'        then customer_id is not null and ship_to_id is not null and to_location_id is null
    when 'taproom_transfer' then to_location_id is not null and customer_id is null and ship_to_id is null
    end)
);
create index orders_status_idx on orders (brewery_id, status, requested_ship_date);
create index orders_customer_idx on orders (customer_id, created_at desc);
create trigger orders_no before insert on orders for each row execute function set_doc_no('order_no','order');

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  order_id uuid not null,
  sku_id uuid not null,
  qty_ordered numeric(12,2) not null check (qty_ordered > 0),
  qty_picked numeric(12,2) check (qty_picked >= 0),
  qty_shipped numeric(12,2) check (qty_shipped >= 0 and qty_shipped <= qty_ordered),
  unit_price_cents int not null check (unit_price_cents >= 0),   -- snapshot at order time
  short_reason text,
  unique (id, brewery_id),
  unique (order_id, sku_id),
  foreign key (order_id, brewery_id) references orders (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);
create index order_lines_sku_idx on order_lines (sku_id);

-- Append-only per-order change log (spec 1B decision 3). Written inside the
-- same plpgsql command functions that make each change; payload is the
-- minimal diff, e.g. {"sku": "...", "qty": [24, 18], "reason": "..."}.
create table order_events (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  order_id uuid not null,
  actor uuid not null references auth.users(id),
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (order_id, brewery_id) references orders (id, brewery_id)
);
create index order_events_order_idx on order_events (order_id, created_at);

-- allocations.ref is polymorphic; enforce that it points at a same-brewery row.
create function validate_allocation_ref() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source = 'order_line' then
    if not exists (select 1 from public.order_lines where id = new.ref and brewery_id = new.brewery_id) then
      raise exception 'allocation ref % is not an order_line of this brewery', new.ref using errcode = 'foreign_key_violation';
    end if;
  elsif not exists (select 1 from public.locations where id = new.ref and brewery_id = new.brewery_id) then
    raise exception 'allocation ref % is not a location of this brewery', new.ref using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
create trigger allocations_ref_trigger before insert or update on allocations
  for each row execute function validate_allocation_ref();

create table shipments (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  order_id uuid not null unique,                       -- one shipment per order; remainder is cancelled
  shipped_at timestamptz not null default now(),
  carrier text, tracking text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (order_id, brewery_id) references orders (id, brewery_id)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  invoice_no bigint,                                   -- trigger
  kind invoice_kind not null default 'invoice',
  customer_id uuid not null,
  shipment_id uuid unique,                             -- null for credit memos
  issued_on date not null default current_date,
  due_on date,
  qbo_invoice_id text,
  qbo_sync_status qbo_sync_status not null default 'pending',
  qbo_sync_error text,
  qbo_idempotency_key uuid not null default gen_random_uuid() unique,
  qbo_tax_cents int, qbo_total_cents int, qbo_balance_cents int,   -- written by the sync job only
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, invoice_no),
  foreign key (customer_id, brewery_id) references customers (id, brewery_id),
  foreign key (shipment_id, brewery_id) references shipments (id, brewery_id)
);
create index invoices_customer_idx on invoices (customer_id, issued_on desc);
create index invoices_unsynced_idx on invoices (brewery_id, qbo_sync_status) where qbo_sync_status <> 'pushed';
create trigger invoices_no before insert on invoices for each row execute function set_doc_no('invoice_no','invoice');

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  invoice_id uuid not null,
  kind invoice_line_kind not null default 'sku',
  sku_id uuid,
  order_line_id uuid,
  keg_pool_id uuid,
  keg_size keg_size,
  description text not null,
  qty numeric(12,2) not null check (qty <> 0),
  unit_price_cents int not null,
  amount_cents int generated always as (round(qty * unit_price_cents)::int) stored,
  credited_invoice_line_id uuid,   -- set on a credit-memo line: the original invoice line it credits
  unique (id, brewery_id),
  foreign key (invoice_id, brewery_id) references invoices (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (order_line_id, brewery_id) references order_lines (id, brewery_id),
  foreign key (keg_pool_id, brewery_id) references keg_pools (id, brewery_id),
  foreign key (credited_invoice_line_id, brewery_id) references invoice_lines (id, brewery_id),
  check (case kind
    when 'sku'                then sku_id is not null
    when 'keg_deposit'        then keg_pool_id is not null and keg_size is not null and qty > 0
    when 'keg_deposit_refund' then keg_pool_id is not null and keg_size is not null and qty < 0
    else true end)
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);
create index invoice_lines_keg_pool_idx on invoice_lines (keg_pool_id) where keg_pool_id is not null;
create index invoice_lines_credited_line_idx on invoice_lines (credited_invoice_line_id) where credited_invoice_line_id is not null;

-- ---------------------------------------------------------------- kegs (count ledger)
create table keg_events (   -- ledger
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  pool_id uuid not null,
  keg_size keg_size not null,
  qty int not null check (qty > 0),
  reason keg_event_reason not null,
  customer_id uuid,
  shipment_id uuid,
  at timestamptz not null default now(),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (pool_id, brewery_id) references keg_pools (id, brewery_id),
  foreign key (customer_id, brewery_id) references customers (id, brewery_id),
  foreign key (shipment_id, brewery_id) references shipments (id, brewery_id),
  check (case reason
    when 'shipped'  then customer_id is not null
    when 'returned' then customer_id is not null
    when 'acquired' then customer_id is null
    when 'retired'  then customer_id is null
    else true end)
);
create index keg_events_pool_idx on keg_events (brewery_id, pool_id, keg_size);
create index keg_events_customer_idx on keg_events (customer_id) where customer_id is not null;
create index keg_events_shipment_idx on keg_events (shipment_id) where shipment_id is not null;

-- ---------------------------------------------------------------- integrations
create table qbo_connections (
  id uuid not null default gen_random_uuid(),
  brewery_id uuid primary key references breweries(id),
  realm_id text not null,
  access_expires_at timestamptz, refresh_expires_at timestamptz,
  connected_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id)
);

create table pos_connections (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  provider text not null default 'square' check (provider = 'square'),
  merchant_id text,
  expires_at timestamptz,
  connected_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, provider)
);

-- A token is bound to exactly one current public connection identity. The
-- lifecycle triggers below erase it when that identity is removed or replaced.
create table private.integration_tokens (
  brewery_id uuid not null references public.breweries(id),
  provider text not null check (provider in ('qbo', 'square')),
  connection_id uuid not null,
  access_token text not null,
  refresh_token text not null,
  updated_at timestamptz not null default now(),
  primary key (brewery_id, provider)
);
alter table private.integration_tokens enable row level security;
revoke all on schema private from public, anon, authenticated, service_role;
revoke all privileges on table private.integration_tokens from public, anon, authenticated, service_role;

-- These one-statement service-only functions recheck current membership and
-- the concrete public connection identity before touching credentials. Passing
-- the RLS-validated actor from the TypeScript boundary closes role-revocation
-- races between its metadata lookup and service-role escalation.
create function public.store_integration_tokens(
  p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid,
  p_access_token text, p_refresh_token text
) returns boolean
language sql security definer set search_path = '' as $$
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
        where q.brewery_id = p_brewery and q.id = p_connection
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
          updated_at = now()
    returning true
  )
  select coalesce((select true from written), false);
$$;

create function public.read_integration_tokens(
  p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid
) returns table (access_token text, refresh_token text)
language sql security definer set search_path = '' as $$
  select t.access_token, t.refresh_token
  from private.integration_tokens t
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
        where q.brewery_id = p_brewery and q.id = p_connection
      ))
      or
      (p_provider = 'square' and exists (
        select 1 from public.pos_connections p
        where p.brewery_id = p_brewery
          and p.provider = p_provider
          and p.id = p_connection
      ))
    );
$$;

-- A reconnect replaces the concrete external connection. Delete purges always;
-- guarded updates purge only on an actual identity or tenant-key change, so a
-- no-op metadata update cannot discard still-current credentials.
create function private.purge_integration_tokens() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.integration_tokens
  where brewery_id = old.brewery_id and provider = tg_argv[0];
  return old;
end;
$$;
revoke execute on function private.purge_integration_tokens() from public, anon, authenticated, service_role;

create trigger qbo_connections_delete_purge_tokens
after delete on qbo_connections
for each row execute function private.purge_integration_tokens('qbo');

create trigger qbo_connections_identity_purge_tokens
after update of brewery_id, id, realm_id on qbo_connections
for each row
when (
  old.brewery_id is distinct from new.brewery_id
  or old.id is distinct from new.id
  or old.realm_id is distinct from new.realm_id
)
execute function private.purge_integration_tokens('qbo');

create trigger pos_connections_delete_purge_tokens
after delete on pos_connections
for each row execute function private.purge_integration_tokens('square');

create trigger pos_connections_identity_purge_tokens
after update of brewery_id, id, provider, merchant_id on pos_connections
for each row
when (
  old.brewery_id is distinct from new.brewery_id
  or old.id is distinct from new.id
  or old.provider is distinct from new.provider
  or old.merchant_id is distinct from new.merchant_id
)
execute function private.purge_integration_tokens('square');

create table pos_locations (
  brewery_id uuid not null references breweries(id),
  connection_id uuid not null,
  external_location_id text not null,
  location_id uuid not null,
  primary key (connection_id, external_location_id),
  foreign key (connection_id, brewery_id) references pos_connections (id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id)
);

create table pos_item_mappings (
  brewery_id uuid not null references breweries(id),
  connection_id uuid not null,
  external_item_id text not null,
  external_item_name text,
  sku_id uuid not null,
  qty_per_sale numeric(12,6) not null check (qty_per_sale > 0),   -- SKU units per one sold (pint of a 1/2 bbl = 1/124)
  primary key (connection_id, external_item_id),
  foreign key (connection_id, brewery_id) references pos_connections (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);

create table pos_sales (   -- raw external facts; update only movement_id, no delete
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  connection_id uuid not null,
  external_order_id text,
  external_line_id text not null,
  external_item_id text,
  external_location_id text,
  sold_at timestamptz not null,
  qty numeric(12,4) not null,
  gross_cents int,
  ingested_at timestamptz not null default now(),
  movement_id uuid unique,                             -- the depletion this line posted
  unique (connection_id, external_line_id),
  foreign key (connection_id, brewery_id) references pos_connections (id, brewery_id),
  foreign key (movement_id, brewery_id) references inventory_movements (id, brewery_id)
);
create index pos_sales_sold_idx on pos_sales (brewery_id, sold_at);
create index pos_sales_unposted_idx on pos_sales (brewery_id) where movement_id is null;

-- ---------------------------------------------------------------- compliance
create table product_approvals (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  product_id uuid not null,
  kind approval_kind not null,
  ttb_id text not null,
  approved_on date, expires_on date,
  note text,
  unique (product_id, kind, ttb_id),
  foreign key (product_id, brewery_id) references products (id, brewery_id)
);

create table state_registrations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  product_id uuid not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  registration_no text,
  approved_on date, expires_on date,
  unique (product_id, state),
  foreign key (product_id, brewery_id) references products (id, brewery_id)
);

create table brewery_state_licenses (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  state text not null check (state ~ '^[A-Z]{2}$'),
  kind text not null,                                  -- 'supplier', 'dtc', ...
  license_no text,
  expires_on date,
  note text,
  unique (brewery_id, state, kind)
);

create table report_filings (   -- the snapshot that was actually filed; the ledger stays recomputable
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  jurisdiction text not null check (jurisdiction ~ '^[A-Z-]+$'),   -- 'TTB', 'US-PA', 'US-OH'
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  figures jsonb not null,
  filed_at timestamptz,
  filed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique (brewery_id, jurisdiction, period_start, period_end)
);

-- ---------------------------------------------------------------- deliveries
create table routes (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text,
  delivery_date date not null,
  driver_user_id uuid references auth.users(id),
  vehicle text,
  departed_at timestamptz, returned_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id)
);
create index routes_date_idx on routes (brewery_id, delivery_date);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  route_id uuid not null,
  shipment_id uuid not null unique,
  stop_no int not null,
  delivered_at timestamptz,
  signed_by text,
  note text,
  unique (route_id, stop_no),
  foreign key (route_id, brewery_id) references routes (id, brewery_id),
  foreign key (shipment_id, brewery_id) references shipments (id, brewery_id)
);

-- ---------------------------------------------------------------- views (derived truth)
create view on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, sum(qty) as qty
  from inventory_movements group by 1,2,3;

create view atp with (security_invoker = true) as
  select o.brewery_id, o.sku_id,
         sum(o.qty) - coalesce((select sum(a.qty) from allocations a
             where a.status = 'open' and a.brewery_id = o.brewery_id and a.sku_id = o.sku_id), 0) as qty
  from on_hand o group by o.brewery_id, o.sku_id;

create view lot_on_hand with (security_invoker = true) as
  select brewery_id, lot_id, sku_id, location_id, sum(qty) as qty
  from inventory_movements where lot_id is not null group by 1,2,3,4;

create view taproom_replenishment with (security_invoker = true) as
  select p.brewery_id, p.location_id, p.sku_id, p.par_qty,
         coalesce(o.qty, 0) as on_hand_qty,
         greatest(p.par_qty - coalesce(o.qty, 0), 0) as suggested_qty
  from taproom_pars p
  left join on_hand o on o.location_id = p.location_id and o.sku_id = p.sku_id;

create view invoice_totals with (security_invoker = true) as
  select i.id as invoice_id, i.brewery_id, i.customer_id, i.kind, i.qbo_sync_status, i.paid_at,
         coalesce(sum(l.amount_cents), 0)::int as subtotal_cents,
         i.qbo_tax_cents, i.qbo_total_cents, i.qbo_balance_cents
  from invoices i left join invoice_lines l on l.invoice_id = i.id
  group by i.id;

create view keg_deposit_balances with (security_invoker = true) as
  select i.brewery_id, i.customer_id, l.keg_pool_id, l.keg_size,
         sum(l.qty)::int as kegs_on_deposit, sum(l.amount_cents)::int as deposit_cents
  from invoice_lines l join invoices i on i.id = l.invoice_id
  where l.kind in ('keg_deposit','keg_deposit_refund')
  group by 1,2,3,4;

create view pos_unmapped_items with (security_invoker = true) as
  select distinct s.brewery_id, s.connection_id, s.external_item_id
  from pos_sales s
  left join pos_item_mappings m on m.connection_id = s.connection_id and m.external_item_id = s.external_item_id
  where m.sku_id is null and s.external_item_id is not null;

create view material_on_hand with (security_invoker = true) as
  select brewery_id, material_id, sum(qty) as qty from material_movements group by 1,2;

create view material_lot_on_hand with (security_invoker = true) as
  select m.brewery_id, m.material_id, m.lot_id, l.received_on, sum(m.qty) as qty
  from material_movements m join material_lots l on l.id = m.lot_id
  group by 1,2,3,4;

create view material_on_order with (security_invoker = true) as
  select l.brewery_id, l.material_id,
         sum((l.qty_ordered - coalesce(r.counted, 0)) * m.purchase_uom_factor) as qty   -- base uom
  from purchase_order_lines l
  join purchase_orders po on po.id = l.po_id and po.status in ('sent','partially_received')
  join materials m on m.id = l.material_id
  left join (select po_line_id, sum(qty_counted) counted from receipt_lines group by 1) r on r.po_line_id = l.id
  group by 1,2;

create view material_last_cost with (security_invoker = true) as
  select distinct on (brewery_id, material_id) brewery_id, material_id, unit_cost_cents, created_at
  from material_movements where type = 'receipt' and unit_cost_cents is not null
  order by brewery_id, material_id, created_at desc;

create view contract_balances with (security_invoker = true) as
  select c.id as contract_id, c.brewery_id, c.material_id, c.qty_committed,
         c.qty_committed - coalesce(sum(l.qty_ordered), 0) as qty_remaining
  from material_contracts c left join purchase_order_lines l on l.contract_id = c.id
  group by c.id;

create view material_requirements with (security_invoker = true) as
  with req as (
    select b.brewery_id, ri.material_id, sum(ri.per_bbl_qty * b.planned_bbl) as required
    from batches b join recipe_ingredients ri on ri.recipe_version_id = b.recipe_version_id
    where b.brewed_on is null group by 1,2
    union all
    select r.brewery_id, bom.material_id, sum(o.qty_planned * bom.qty_per_unit)
    from packaging_runs r join packaging_run_outputs o on o.run_id = r.id
    join sku_bom bom on bom.sku_id = o.sku_id
    where r.closed_at is null group by 1,2)
  select req.brewery_id, req.material_id, sum(req.required) as required,
         coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
         sum(req.required) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short
  from req
  left join material_on_hand oh on oh.material_id = req.material_id
  left join material_on_order oo on oo.material_id = req.material_id
  group by 1,2, oh.qty, oo.qty;

create view recipe_version_costs with (security_invoker = true) as
  select ri.recipe_version_id, ri.brewery_id,
         sum(ri.per_bbl_qty * c.unit_cost_cents / m.purchase_uom_factor)::int as cost_cents_per_bbl
  from recipe_ingredients ri
  join materials m on m.id = ri.material_id
  left join material_last_cost c on c.material_id = ri.material_id
  group by 1,2;

create view occupancy_volumes with (security_invoker = true) as
  select o.id as occupancy_id, o.brewery_id, o.vessel_id, o.batch_id, o.started_at, o.ended_at,
         o.initial_bbl
           + coalesce((select sum(bbl) from transfers t where t.to_occupancy_id = o.id), 0)
           - coalesce((select sum(bbl + loss_bbl) from transfers t where t.from_occupancy_id = o.id), 0)
           + coalesce((select sum(bbl) from volume_adjustments a where a.occupancy_id = o.id), 0)
           - coalesce((select sum(bbl_drawn) from packaging_runs r where r.occupancy_id = o.id and r.closed_at is not null), 0)
           as bbl
  from vessel_occupancies o;

create view vessel_contents with (security_invoker = true) as
  select v.id as vessel_id, v.brewery_id, v.name, v.kind, v.capacity_bbl,
         ov.occupancy_id, ov.batch_id, ov.bbl
  from vessels v
  left join occupancy_volumes ov on ov.vessel_id = v.id and ov.ended_at is null;

create view packaging_run_requirements with (security_invoker = true) as
  select r.id as run_id, r.brewery_id, bom.material_id,
         sum(o.qty_planned * bom.qty_per_unit) as required,
         coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
         sum(o.qty_planned * bom.qty_per_unit) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short
  from packaging_runs r
  join packaging_run_outputs o on o.run_id = r.id
  join sku_bom bom on bom.sku_id = o.sku_id
  left join material_on_hand oh on oh.material_id = bom.material_id
  left join material_on_order oo on oo.material_id = bom.material_id
  where r.closed_at is null
  group by r.id, bom.material_id, oh.qty, oo.qty;

create view packaging_run_yields with (security_invoker = true) as
  select r.id as run_id, r.brewery_id, r.bbl_drawn,
         coalesce(sum(o.qty_actual * s.bbl_per_unit), 0) as bbl_packaged,
         r.bbl_drawn - coalesce(sum(o.qty_actual * s.bbl_per_unit), 0) as loss_bbl
  from packaging_runs r
  left join packaging_run_outputs o on o.run_id = r.id
  left join skus s on s.id = o.sku_id
  where r.closed_at is not null
  group by r.id;

create view keg_fleet_totals with (security_invoker = true) as
  select brewery_id, pool_id, keg_size,
         sum(case reason when 'acquired' then qty when 'found' then qty
                         when 'retired' then -qty when 'lost' then -qty else 0 end)::int as qty
  from keg_events group by 1,2,3;

create view keg_customer_balances with (security_invoker = true) as
  select brewery_id, customer_id, pool_id, keg_size,
         sum(case reason when 'shipped' then qty when 'returned' then -qty when 'lost' then -qty else 0 end)::int as qty
  from keg_events where customer_id is not null group by 1,2,3,4;

create view keg_loss_rates with (security_invoker = true) as
  select brewery_id, pool_id,
         sum(qty) filter (where reason = 'lost') as lost,
         sum(qty) filter (where reason = 'shipped') as shipped,
         sum(qty) filter (where reason = 'lost')::numeric / nullif(sum(qty) filter (where reason = 'shipped'), 0) as loss_rate
  from keg_events where at >= now() - interval '12 months' group by 1,2;

create view route_loads with (security_invoker = true) as
  select d.route_id, d.brewery_id, d.stop_no, d.shipment_id, o.id as order_id, o.customer_id,
         l.sku_id, coalesce(l.qty_shipped, l.qty_ordered) as qty
  from deliveries d
  join shipments s on s.id = d.shipment_id
  join orders o on o.id = s.order_id
  join order_lines l on l.order_id = o.id;

-- ---------------------------------------------------------------- command RPC boundary
-- Write policies admit only these exact PostgREST RPC paths, paired with the
-- same staff-role sets as lib/commands/registry.ts. Direct table mutations
-- therefore fail RLS even when the caller holds the table privilege needed by
-- a security-invoker RPC.
create function is_authorized_staff_rpc(
  p_brewery uuid, p_rpc text, p_roles public.staff_role[]
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select current_setting('request.path', true) = '/rpc/' || p_rpc
    and public.staff_role(p_brewery) = any(p_roles);
$$;

create function require_authorized_staff_rpc(
  p_brewery uuid, p_rpc text, p_roles public.staff_role[]
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not coalesce(public.is_authorized_staff_rpc(p_brewery, p_rpc, p_roles), false) then
    raise exception 'permission denied for %', p_rpc using errcode = '42501';
  end if;
end $$;

create function create_product(
  p_brewery uuid, p_name text, p_style text, p_abv numeric
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_product public.products;
begin
  insert into public.products (brewery_id, name, style, abv)
  values (p_brewery, p_name, p_style, p_abv)
  returning * into v_product;
  return to_jsonb(v_product);
end $$;

create function create_sku(
  p_brewery uuid, p_product uuid, p_name text, p_package_type public.package_type,
  p_units_per_case int, p_bbl_per_unit numeric
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_sku public.skus;
begin
  insert into public.skus (
    brewery_id, product_id, name, package_type, units_per_case, bbl_per_unit
  ) values (
    p_brewery, p_product, p_name, p_package_type, p_units_per_case, p_bbl_per_unit
  )
  returning * into v_sku;
  return to_jsonb(v_sku);
end $$;

create function create_location(
  p_brewery uuid, p_name text, p_kind public.location_kind
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_location public.locations;
begin
  insert into public.locations (brewery_id, name, kind)
  values (p_brewery, p_name, p_kind)
  returning * into v_location;
  return to_jsonb(v_location);
end $$;

create function upsert_customer(
  p_id uuid, p_brewery uuid, p_name text, p_type public.customer_type, p_state text,
  p_price_list uuid, p_license_no text, p_payment_terms text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_customer public.customers;
begin
  insert into public.customers as c (
    id, brewery_id, name, type, state, price_list_id, license_no, payment_terms
  ) values (
    coalesce(p_id, gen_random_uuid()), p_brewery, p_name, p_type, p_state,
    p_price_list, p_license_no, coalesce(p_payment_terms, 'net30')
  )
  on conflict (id) do update set
    brewery_id = excluded.brewery_id,
    name = excluded.name,
    type = excluded.type,
    state = excluded.state,
    price_list_id = excluded.price_list_id,
    license_no = excluded.license_no,
    payment_terms = coalesce(p_payment_terms, c.payment_terms)
  returning * into v_customer;
  return to_jsonb(v_customer);
end $$;

create function upsert_ship_to(
  p_id uuid, p_brewery uuid, p_customer uuid, p_label text, p_address1 text,
  p_address2 text, p_city text, p_state text, p_zip text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_ship_to public.ship_tos;
begin
  insert into public.ship_tos as s (
    id, brewery_id, customer_id, label, address1, address2, city, state, zip
  ) values (
    coalesce(p_id, gen_random_uuid()), p_brewery, p_customer, p_label,
    p_address1, p_address2, p_city, p_state, p_zip
  )
  on conflict (id) do update set
    brewery_id = excluded.brewery_id,
    customer_id = excluded.customer_id,
    label = excluded.label,
    address1 = excluded.address1,
    address2 = excluded.address2,
    city = excluded.city,
    state = excluded.state,
    zip = excluded.zip
  returning * into v_ship_to;
  return to_jsonb(v_ship_to);
end $$;

create function upsert_price_list(
  p_id uuid, p_brewery uuid, p_name text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_price_list public.price_lists;
begin
  insert into public.price_lists as p (id, brewery_id, name)
  values (coalesce(p_id, gen_random_uuid()), p_brewery, p_name)
  on conflict (id) do update set
    brewery_id = excluded.brewery_id,
    name = excluded.name
  returning * into v_price_list;
  return to_jsonb(v_price_list);
end $$;

create function set_price(
  p_brewery uuid, p_price_list uuid, p_sku uuid, p_unit_price_cents int
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_price public.price_list_items;
begin
  insert into public.price_list_items (
    brewery_id, price_list_id, sku_id, unit_price_cents
  ) values (
    p_brewery, p_price_list, p_sku, p_unit_price_cents
  )
  on conflict (price_list_id, sku_id) do update set
    brewery_id = excluded.brewery_id,
    unit_price_cents = excluded.unit_price_cents
  returning * into v_price;
  return to_jsonb(v_price);
end $$;

create function record_movement(
  p_brewery uuid, p_sku uuid, p_location uuid, p_qty numeric,
  p_type public.movement_type, p_channel public.sale_channel,
  p_dest_state text, p_note text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_movement public.inventory_movements;
begin
  insert into public.inventory_movements (
    brewery_id, sku_id, location_id, qty, type, channel, dest_state, note, created_by
  ) values (
    p_brewery, p_sku, p_location, p_qty, p_type, p_channel, p_dest_state, p_note, auth.uid()
  )
  returning * into v_movement;
  return to_jsonb(v_movement);
end $$;

create function set_taproom_par(
  p_brewery uuid, p_location uuid, p_sku uuid, p_par_qty numeric
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_par public.taproom_pars;
begin
  insert into public.taproom_pars (
    brewery_id, location_id, sku_id, par_qty
  ) values (
    p_brewery, p_location, p_sku, p_par_qty
  )
  on conflict (location_id, sku_id) do update set
    brewery_id = excluded.brewery_id,
    par_qty = excluded.par_qty
  returning * into v_par;
  return to_jsonb(v_par);
end $$;

-- ------------------------------------------------- order lifecycle commands
-- One function per transition (iron rule 5). Invoker-rights: RLS does
-- tenancy; each starts by locking the order row. p_lines is a full
-- replacement: [{"sku_id": uuid, "qty": n}].

-- Resolves the unit price for a sku from a price list; raises if missing.
create function order_line_price(p_brewery uuid, p_price_list uuid, p_sku uuid) returns int
language plpgsql stable set search_path = '' as $$
declare v int;
begin

  select unit_price_cents into v from public.price_list_items
    where brewery_id = p_brewery and price_list_id = p_price_list and sku_id = p_sku;
  if v is null then raise exception 'no price for sku % on price list', p_sku; end if;
  return v;
end $$;
-- Admin-only configuration for the one warehouse customer portal orders ship
-- from. The composite FK above prevents cross-brewery sources; this command
-- additionally rejects a same-brewery location that is not a warehouse.
create function set_portal_fulfillment_source(p_brewery uuid, p_location uuid) returns jsonb
language plpgsql set search_path = '' as $$
begin
  perform public.require_authorized_staff_rpc(
    p_brewery, 'set_portal_fulfillment_source', array['admin']::public.staff_role[]
  );
  if not exists (
    select 1 from public.locations
    where id = p_location and brewery_id = p_brewery and kind = 'warehouse'
  ) then
    raise exception 'portal fulfillment source must be a brewery warehouse';
  end if;
  update public.breweries set portal_fulfillment_location_id = p_location where id = p_brewery;
  return jsonb_build_object('brewery_id', p_brewery, 'location_id', p_location);
end $$;

-- Customer portal mutations are deliberately separate from staff lifecycle
-- RPCs. They accept only customer-editable fields and derive all identities,
-- workflow state, fulfillment source, and price snapshots from the caller.
create function portal_create_order(
  p_ship_to uuid, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_customer uuid; v_brewery uuid; v_price_list uuid; v_source uuid;
  v_order uuid; v_price int; l record;
begin
  if current_setting('request.path', true) <> '/rpc/portal_create_order' then
    raise exception 'permission denied for portal_create_order' using errcode = '42501';
  end if;
  select st.customer_id, st.brewery_id, c.price_list_id, b.portal_fulfillment_location_id
    into v_customer, v_brewery, v_price_list, v_source
    from public.ship_tos st
    join public.customers c on c.id = st.customer_id and c.brewery_id = st.brewery_id
    join public.breweries b on b.id = st.brewery_id
    where st.id = p_ship_to and st.customer_id in (select public.my_customer_ids());
  if v_customer is null then raise exception 'ship-to not found'; end if;
  if v_price_list is null then raise exception 'customer has no price list'; end if;
  if v_source is null or not exists (
    select 1 from public.locations
    where id = v_source and brewery_id = v_brewery and kind = 'warehouse'
  ) then raise exception 'portal fulfillment source is not configured'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'order requires at least one line';
  end if;
  insert into public.orders (brewery_id, kind, status, customer_id, ship_to_id, from_location_id,
                             price_list_id, po_number, note, created_by)
  values (v_brewery, 'wholesale', 'draft', v_customer, p_ship_to, v_source,
          v_price_list, p_po, p_note, auth.uid())
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_lines) e loop
    select pli.unit_price_cents into v_price from public.price_list_items pli
      join public.skus s on s.id = pli.sku_id and s.brewery_id = pli.brewery_id
      where pli.brewery_id = v_brewery and pli.price_list_id = v_price_list
        and pli.sku_id = l.sku_id and s.active;
    if v_price is null then raise exception 'sku is not active and priced for this customer'; end if;
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
      values (v_brewery, v_order, l.sku_id, l.qty, v_price);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
    values (v_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;

create function portal_update_draft_order(
  p_order uuid, p_ship_to uuid, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; v_ship_to uuid; v_price_list uuid; v_source uuid;
  v_price int; l record;
begin
  if current_setting('request.path', true) <> '/rpc/portal_update_draft_order' then
    raise exception 'permission denied for portal_update_draft_order' using errcode = '42501';
  end if;
  select * into o from public.orders
    where id = p_order and customer_id in (select public.my_customer_ids()) for update;
  if not found or o.status <> 'draft' then raise exception 'order not found'; end if;
  v_ship_to := coalesce(p_ship_to, o.ship_to_id);
  if not exists (
    select 1 from public.ship_tos
    where id = v_ship_to and customer_id = o.customer_id and brewery_id = o.brewery_id
  ) then raise exception 'ship-to not found'; end if;
  select c.price_list_id, b.portal_fulfillment_location_id into v_price_list, v_source
    from public.customers c join public.breweries b on b.id = c.brewery_id
    where c.id = o.customer_id and c.brewery_id = o.brewery_id;
  if v_price_list is null then raise exception 'customer has no price list'; end if;
  if v_source is null or not exists (
    select 1 from public.locations
    where id = v_source and brewery_id = o.brewery_id and kind = 'warehouse'
  ) then raise exception 'portal fulfillment source is not configured'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'order requires at least one line';
  end if;
  -- Omitted (null) PO/note keep their current values; send '' to clear.
  update public.orders set ship_to_id = v_ship_to, from_location_id = v_source,
    price_list_id = v_price_list, po_number = coalesce(p_po, po_number),
    note = coalesce(p_note, note) where id = p_order;
  delete from public.order_lines where order_id = p_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty
    from jsonb_array_elements(p_lines) e loop
    select pli.unit_price_cents into v_price from public.price_list_items pli
      join public.skus s on s.id = pli.sku_id and s.brewery_id = pli.brewery_id
      where pli.brewery_id = o.brewery_id and pli.price_list_id = v_price_list
        and pli.sku_id = l.sku_id and s.active;
    if v_price is null then raise exception 'sku is not active and priced for this customer'; end if;
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
      values (o.brewery_id, p_order, l.sku_id, l.qty, v_price);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
    values (o.brewery_id, p_order, auth.uid(), 'updated', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', p_order);
end $$;

create function portal_submit_order(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  if current_setting('request.path', true) <> '/rpc/portal_submit_order' then
    raise exception 'permission denied for portal_submit_order' using errcode = '42501';
  end if;
  select * into o from public.orders
    where id = p_order and customer_id in (select public.my_customer_ids()) for update;
  if not found or o.status <> 'draft' then raise exception 'order not found'; end if;
  update public.orders set status = 'submitted' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
    values (o.brewery_id, p_order, auth.uid(), 'submitted');
  return jsonb_build_object('order_id', p_order);
end $$;

create function create_order(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_order uuid; v_pl uuid; l record;
begin
  if not coalesce(
    public.is_authorized_staff_rpc(p_brewery, 'create_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(p_brewery, 'create_replenishment_order', array['admin','sales']::public.staff_role[]),
    false
  ) then
    raise exception 'permission denied for create_order' using errcode = '42501';
  end if;
  if p_kind = 'wholesale' then
    select price_list_id into v_pl from public.customers where id = p_customer and brewery_id = p_brewery;
    if v_pl is null then raise exception 'customer has no price list'; end if;
  end if;
  insert into public.orders (brewery_id, kind, customer_id, ship_to_id, from_location_id, to_location_id,
                             price_list_id, requested_ship_date, po_number, note, created_by)
  values (p_brewery, p_kind, p_customer, p_ship_to, p_from_location, p_to_location,
          v_pl, p_requested, p_po, p_note, auth.uid())
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (p_brewery, v_order, l.sku_id, l.qty,
            case when p_kind = 'wholesale' then public.order_line_price(p_brewery, v_pl, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;

-- Shared guard: lock the order, check status, return the row.
create function lock_order(p_order uuid, p_allowed public.order_status[]) returns public.orders
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if not (o.status = any(p_allowed)) then raise exception 'order is %', o.status; end if;
  return o;
end $$;

create function update_draft_order(
  p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l record;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.orders where id = p_order),
    'update_draft_order', array['admin','sales']::public.staff_role[]
  );
  o := public.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set ship_to_id = coalesce(p_ship_to, ship_to_id),
    requested_ship_date = coalesce(p_requested, requested_ship_date),
    po_number = coalesce(p_po, po_number), note = coalesce(p_note, note)
    where id = p_order;
  delete from public.order_lines where order_id = p_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then public.order_line_price(o.brewery_id, o.price_list_id, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'updated', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', p_order);
end $$;

create function submit_order(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  if not coalesce(
    public.is_authorized_staff_rpc((select brewery_id from public.orders where id = p_order), 'submit_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc((select brewery_id from public.orders where id = p_order), 'create_replenishment_order', array['admin','sales']::public.staff_role[]),
    false
  ) then
    raise exception 'permission denied for submit_order' using errcode = '42501';
  end if;
  o := public.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set status = 'submitted' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'submitted');
  -- chat: the submitted_order occurrence commits with the state change
  perform public.record_submitted_order_occurrence(p_order);
  return jsonb_build_object('order_id', p_order);
end $$;

create function confirm_order(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; w jsonb;
begin
  if not coalesce(
    public.is_authorized_staff_rpc((select brewery_id from public.orders where id = p_order), 'confirm_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc((select brewery_id from public.orders where id = p_order), 'create_replenishment_order', array['admin','sales']::public.staff_role[]),
    false
  ) then
    raise exception 'permission denied for confirm_order' using errcode = '42501';
  end if;
  o := public.lock_order(p_order, array['submitted']::public.order_status[]);
  insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
  select o.brewery_id, sku_id, qty_ordered, 'order_line', id, 'open'
  from public.order_lines where order_id = p_order;
  update public.orders set status = 'confirmed' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'confirmed');
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', a.sku_id, 'atp', a.qty)), '[]') into w
  from public.atp a join public.order_lines ol on ol.sku_id = a.sku_id and ol.order_id = p_order
  where a.brewery_id = o.brewery_id and a.qty < 0;
  return jsonb_build_object('order_id', p_order, 'warnings', w);
end $$;

create function adjust_order_lines(p_order uuid, p_lines jsonb, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; l record; v_line uuid; v_before jsonb;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.orders where id = p_order),
    'adjust_order_lines', array['admin','sales']::public.staff_role[]
  );
  o := public.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
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
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then public.order_line_price(o.brewery_id, o.price_list_id, l.sku_id) else 0 end)
    on conflict (order_id, sku_id) do update set qty_ordered = excluded.qty_ordered
    returning id into v_line;
    update public.allocations set qty = l.qty
      where source = 'order_line' and ref = v_line and status = 'open';
    insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
    select o.brewery_id, l.sku_id, l.qty, 'order_line', v_line, 'open'
    where not exists (select 1 from public.allocations where source = 'order_line' and ref = v_line and status = 'open');
  end loop;
  update public.orders set needs_restock = needs_restock or (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'lines_adjusted',
          jsonb_build_object('before', v_before, 'lines', p_lines, 'reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $$;

create function cancel_order(p_order uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.orders where id = p_order),
    'cancel_order', array['admin','sales']::public.staff_role[]
  );
  o := public.lock_order(p_order, array['draft','submitted','confirmed','picked']::public.order_status[]);
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order);
  update public.orders set status = 'cancelled', needs_restock = (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'cancelled', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $$;

create function record_pick(p_order uuid, p_picks jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; pk record;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.orders where id = p_order),
    'record_pick', array['admin','warehouse']::public.staff_role[]
  );
  o := public.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty_picked')::numeric as qty from jsonb_array_elements(p_picks) e loop
    update public.order_lines set qty_picked = pk.qty where id = pk.line_id and order_id = p_order;
  end loop;
  update public.orders set status = 'picked', needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'picked', jsonb_build_object('picks', p_picks));
  return jsonb_build_object('order_id', p_order);
end $$;

create function ship_order(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; sp record; v_state text; v_invoice uuid; v_shipment uuid;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.orders where id = p_order),
    'ship_order', array['admin','warehouse']::public.staff_role[]
  );
  o := public.lock_order(p_order, array['picked']::public.order_status[]);
  -- Full-coverage guard: ensure p_ship covers every order line. Runs after the
  -- lock so the line set can't change between the check and the lock (TOCTOU).
  if exists (
    select 1 from public.order_lines ol
    where ol.order_id = p_order
    and not exists (
      select 1 from jsonb_array_elements(p_ship) e
      where (e->>'line_id')::uuid = ol.id
    )
  ) then
    raise exception 'ship list must cover every order line';
  end if;
  insert into public.shipments (brewery_id, order_id, carrier, tracking, created_by)
  values (o.brewery_id, p_order, p_carrier, p_tracking, auth.uid()) returning id into v_shipment;
  if o.kind = 'wholesale' then
    select state into v_state from public.ship_tos where id = o.ship_to_id;
    -- Empty-invoice guard: only create invoice if at least one line ships qty > 0
    if exists (select 1 from jsonb_array_elements(p_ship) e where (e->>'qty_shipped')::numeric > 0) then
    insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on)
    values (o.brewery_id, 'invoice', o.customer_id, v_shipment, current_date)
    returning id into v_invoice;
    end if;
  end if;
  for sp in select (e->>'line_id')::uuid as line_id, (e->>'qty_shipped')::numeric as qty from jsonb_array_elements(p_ship) e loop
    update public.order_lines set qty_shipped = sp.qty where id = sp.line_id and order_id = p_order;
    if sp.qty > 0 then
      if o.kind = 'wholesale' then
        insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, channel, dest_state, ref, created_by)
        select o.brewery_id, ol.sku_id, o.from_location_id, -sp.qty, 'sale_removal', 'wholesale', v_state, p_order, auth.uid()
        from public.order_lines ol where ol.id = sp.line_id;
        insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description)
        select o.brewery_id, v_invoice, 'sku', ol.sku_id, sp.qty, ol.unit_price_cents, s.name
        from public.order_lines ol join public.skus s on s.id = ol.sku_id where ol.id = sp.line_id;
      else
        insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, ref, created_by)
        select o.brewery_id, ol.sku_id, o.from_location_id, -sp.qty, 'taproom_transfer', p_order, auth.uid()
        from public.order_lines ol where ol.id = sp.line_id;
        insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, ref, created_by)
        select o.brewery_id, ol.sku_id, o.to_location_id, sp.qty, 'taproom_transfer', p_order, auth.uid()
        from public.order_lines ol where ol.id = sp.line_id;
      end if;
      update public.allocations set status = 'fulfilled'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    else
      update public.allocations set status = 'released'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    end if;
  end loop;
  update public.orders set status = 'shipped', shipped_at = now(), needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'shipped',
          jsonb_build_object('ship', p_ship, 'carrier', p_carrier, 'invoice_id', v_invoice));
  return jsonb_build_object('order_id', p_order, 'invoice_id', v_invoice);
end $$;

create function create_credit_memo(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_cm uuid; v_order uuid; cl record; v_orig_qty numeric; v_already_credited numeric;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.invoices where id = p_invoice),
    'create_credit_memo', array['admin','sales']::public.staff_role[]
  );
  select * into v_inv from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'can only credit an invoice'; end if;
  insert into public.invoices (brewery_id, kind, customer_id, issued_on)
  values (v_inv.brewery_id, 'credit_memo', v_inv.customer_id, current_date)
  returning id into v_cm;
  for cl in select (e->>'invoice_line_id')::uuid as line_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    select qty into v_orig_qty from public.invoice_lines where id = cl.line_id and invoice_id = p_invoice;
    if v_orig_qty is null then raise exception 'invoice line % not found on invoice', cl.line_id; end if;
    -- Over-credit guard: qty already credited against this invoice line across
    -- all prior credit memos, plus this request, must not exceed the original.
    select coalesce(sum(-il.qty), 0) into v_already_credited
      from public.invoice_lines il where il.credited_invoice_line_id = cl.line_id;
    if cl.qty > (v_orig_qty - v_already_credited) then
      raise exception 'credit exceeds remaining creditable qty for line %', cl.line_id;
    end if;
    insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description, credited_invoice_line_id)
    select v_inv.brewery_id, v_cm, 'sku', il.sku_id, -cl.qty, il.unit_price_cents, il.description, il.id
    from public.invoice_lines il where il.id = cl.line_id and il.invoice_id = p_invoice;
    insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, note, created_by)
    select v_inv.brewery_id, il.sku_id, p_location, cl.qty, 'return_in', p_reason, auth.uid()
    from public.invoice_lines il where il.id = cl.line_id and il.invoice_id = p_invoice;
  end loop;
  -- Append to the originating order's event log, if this invoice came from a
  -- shipment (credit memos on a manually-issued invoice have none).
  select s.order_id into v_order from public.shipments s where s.id = v_inv.shipment_id;
  if v_order is not null then
    insert into public.order_events (brewery_id, order_id, actor, event, payload)
    values (v_inv.brewery_id, v_order, auth.uid(), 'credit_memo',
            jsonb_build_object('invoice_id', p_invoice, 'credit_memo_id', v_cm, 'lines', p_lines, 'reason', p_reason));
  end if;
  return jsonb_build_object('invoice_id', v_cm);
end $$;

-- One open standing taproom allocation per (sku, location): upsert by qty>0,
-- release by qty<=0. One plpgsql function per iron rule 5 (find-then-write).
create function set_standing_allocation(p_location uuid, p_sku uuid, p_qty numeric) returns jsonb
language plpgsql set search_path = '' as $$
declare v_brewery uuid; v_alloc uuid; v_status public.allocation_status;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.locations where id = p_location),
    'set_standing_allocation', array['admin','sales']::public.staff_role[]
  );
  select brewery_id into v_brewery from public.locations where id = p_location;
  if v_brewery is null then raise exception 'location not found'; end if;
  select id into v_alloc from public.allocations
    where source = 'taproom_standing' and ref = p_location and sku_id = p_sku and status = 'open';
  if p_qty <= 0 then
    if v_alloc is not null then
      update public.allocations set status = 'released' where id = v_alloc;
      v_status := 'released';
    end if;
  elsif v_alloc is not null then
    update public.allocations set qty = p_qty where id = v_alloc;
    v_status := 'open';
  else
    insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
    values (v_brewery, p_sku, p_qty, 'taproom_standing', p_location, 'open')
    returning id into v_alloc;
    v_status := 'open';
  end if;
  return jsonb_build_object('allocation_id', v_alloc, 'status', v_status);
end $$;

create function create_replenishment_order(p_from uuid, p_to uuid, p_lines jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_brewery uuid; v jsonb;
begin
  perform public.require_authorized_staff_rpc(
    (select brewery_id from public.locations where id = p_to),
    'create_replenishment_order', array['admin','sales']::public.staff_role[]
  );
  select brewery_id into v_brewery from public.locations where id = p_to;
  if v_brewery is null then raise exception 'location not found'; end if;
  v := public.create_order(v_brewery, 'taproom_transfer', null, null, p_from, p_to, null, null, null, p_lines);
  perform public.submit_order((v->>'order_id')::uuid);
  perform public.confirm_order((v->>'order_id')::uuid);
  return v;
end $$;
-- ------------------------------------------------------- chat notifications
create table chat_installations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  external_installation_id text not null,
  external_enterprise_id text,
  display_label text not null,
  state text not null check (state in ('pending','active','disabled','needs_reauthorization','disconnected')),
  oauth_intent_hash text,
  oauth_redirect_uri text,
  oauth_expires_at timestamptz,
  oauth_consumed_at timestamptz,
  oauth_reconciled_at timestamptz,
  oauth_intent_kind text check (oauth_intent_kind in ('install','reauthorize')),
  granted_capabilities jsonb not null default '{}',
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_timezone text,
  installer_user_id uuid not null references auth.users(id),
  token_store_key text not null unique, -- encrypted Chat SDK state reference, never credential material
  installed_at timestamptz,
  disabled_at timestamptz,
  disconnected_at timestamptz,
  last_health_checked_at timestamptz,
  last_healthy_at timestamptz,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (id, brewery_id, provider)
);
create unique index chat_installations_brewery_provider_live_key
  on chat_installations (brewery_id, provider) where state <> 'disconnected';
create unique index chat_installations_provider_external_active_key
  on chat_installations (provider, external_installation_id) where state = 'active';
create index chat_installations_brewery_health_idx
  on chat_installations (brewery_id, state, last_health_checked_at desc);
create index chat_installations_installer_user_idx on chat_installations (installer_user_id);

create table chat_user_links (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  installation_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  external_user_id text not null,
  user_id uuid references auth.users(id), -- null only while a link proof is pending
  state text not null check (state in ('pending','active','disabled','unlinked')),
  check ((state = 'pending') = (user_id is null)),
  proof_hash text,
  proof_issued_at timestamptz,
  proof_expires_at timestamptz,
  proof_consumed_at timestamptz,
  linked_at timestamptz,
  disabled_at timestamptz,
  unlinked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (installation_id, external_user_id),
  foreign key (installation_id, brewery_id, provider) references chat_installations(id, brewery_id, provider)
);
create unique index chat_user_links_installation_user_active_key
  on chat_user_links (installation_id, user_id) where state = 'active';
create index chat_user_links_installation_brewery_provider_idx
  on chat_user_links (installation_id, brewery_id, provider);
create index chat_user_links_user_brewery_idx on chat_user_links (user_id, brewery_id);
create index chat_user_links_brewery_idx on chat_user_links (brewery_id);

create table notification_destinations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  installation_id uuid not null,
  kind text not null check (kind in ('personal','private_channel')),
  external_destination_id text not null,
  user_id uuid references auth.users(id),
  privacy_class text not null check (privacy_class in ('direct','private_internal')),
  capabilities jsonb not null default '{}',
  state text not null default 'active' check (state in ('active','blocked')),
  blocked_reason text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (id, brewery_id, user_id),
  unique (installation_id, external_destination_id),
  check (
    (kind = 'personal' and user_id is not null and privacy_class = 'direct')
    or
    (kind = 'private_channel' and user_id is null and privacy_class = 'private_internal')
  ),
  check (blocked_reason is null or state = 'blocked'),
  foreign key (installation_id, brewery_id) references chat_installations(id, brewery_id)
);
create unique index notification_destinations_active_shared_installation_key
  on notification_destinations (installation_id) where kind = 'private_channel' and state = 'active';
create index notification_destinations_brewery_idx on notification_destinations (brewery_id);
create index notification_destinations_installation_brewery_idx
  on notification_destinations (installation_id, brewery_id);
create index notification_destinations_user_brewery_idx
  on notification_destinations (user_id, brewery_id);

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  user_id uuid not null references auth.users(id),
  reason text not null check (reason in ('submitted_order','pick_due','delivery_next','fermentation_reading_overdue','operations_digest')),
  enabled boolean not null default true,
  personal_destination_id uuid,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_timezone text,
  use_brewery_timezone boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, user_id, reason),
  foreign key (personal_destination_id, brewery_id, user_id)
    references notification_destinations(id, brewery_id, user_id)
);
create index notification_preferences_brewery_idx on notification_preferences (brewery_id);
create index notification_preferences_user_brewery_idx on notification_preferences (user_id, brewery_id);
create index notification_preferences_personal_destination_brewery_user_idx
  on notification_preferences (personal_destination_id, brewery_id, user_id);

create table notification_occurrences (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  reason text not null check (reason in ('submitted_order','pick_due','delivery_next','fermentation_reading_overdue','operations_digest')),
  subject_type text not null,
  subject_id text not null,
  source_version text not null,
  occurred_at timestamptz not null,
  owner_query text not null check (owner_query in ('orders','picks','deliveries','fermentation','digest')),
  due_at timestamptz,
  urgency text not null check (urgency in ('normal','attention')),
  payload jsonb not null,
  semantic_key text not null,
  state text not null default 'active' check (state in ('active','resolved','suppressed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, semantic_key)
);
create index notification_occurrences_active_due_idx
  on notification_occurrences (brewery_id, due_at) where state = 'active';

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  occurrence_id uuid not null,
  destination_id uuid not null,
  installation_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  semantic_key text not null,
  state text not null default 'queued' check (state in ('queued','leased','retrying','sent','updated','suppressed','terminal')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_conversation_id text,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, semantic_key),
  foreign key (occurrence_id, brewery_id) references notification_occurrences(id, brewery_id),
  foreign key (destination_id, brewery_id) references notification_destinations(id, brewery_id),
  foreign key (installation_id, brewery_id, provider) references chat_installations(id, brewery_id, provider)
);
create index notification_deliveries_occurrence_brewery_idx
  on notification_deliveries (occurrence_id, brewery_id);
create index notification_deliveries_destination_brewery_idx
  on notification_deliveries (destination_id, brewery_id);
create index notification_deliveries_installation_brewery_provider_idx
  on notification_deliveries (installation_id, brewery_id, provider);
create index notification_deliveries_dispatch_idx
  on notification_deliveries (next_attempt_at) where state in ('queued','retrying');

create table chat_callback_receipts (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  installation_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  callback_id text not null,
  callback_kind text not null,
  external_user_id text, -- provider user who triggered it (routing claim; resolved at processing time)
  disposition text not null check (disposition in ('pending','processing','processed','ignored','failed')),
  payload_hash text not null,
  error_code text,
  received_at timestamptz not null,
  processing_at timestamptz,
  completed_at timestamptz,
  unique (id, brewery_id),
  unique (installation_id, callback_id),
  foreign key (installation_id, brewery_id, provider) references chat_installations(id, brewery_id, provider)
);
create index chat_callback_receipts_brewery_idx on chat_callback_receipts (brewery_id);
create index chat_callback_receipts_installation_brewery_provider_idx
  on chat_callback_receipts (installation_id, brewery_id, provider);
create index chat_callback_receipts_pending_idx
  on chat_callback_receipts (received_at) where disposition = 'pending';

create table chat_action_intents (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  installation_id uuid not null,
  user_id uuid not null references auth.users(id),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  action_origin_hash text not null,
  command_name text not null,
  input_hash text not null,
  subject_type text not null,
  subject_id text not null,
  subject_version text not null,
  request_id uuid not null unique,
  preview_token_hash text not null,
  allowed_action text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  first_result_reference text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (installation_id, brewery_id, provider) references chat_installations(id, brewery_id, provider)
);
create index chat_action_intents_brewery_idx on chat_action_intents (brewery_id);
create index chat_action_intents_installation_brewery_provider_idx
  on chat_action_intents (installation_id, brewery_id, provider);
create index chat_action_intents_user_idx on chat_action_intents (user_id);
create index chat_action_intents_expiry_idx on chat_action_intents (expires_at) where consumed_at is null;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  -- Staff read their tenant's registered query surface. Writes are explicitly
  -- limited below to the exact RPC path and command roles that own them.
  foreach t in array array[
    'customers','ship_tos','vendors','materials','material_lots','products','keg_pools','skus',
    'price_lists','price_list_items','sku_bom','locations','allocations','taproom_pars',
    'recipes','recipe_versions','recipe_ingredients','vessels','batches','vessel_occupancies',
    'fermentation_readings','batch_additions','packaging_runs','lots','packaging_run_outputs',
    'packaging_run_consumptions','material_contracts','purchase_orders','purchase_order_lines',
    'receipts','receipt_lines','material_counts','material_count_lines','orders','order_lines',
    'shipments','invoices','invoice_lines','pos_locations','pos_item_mappings','pos_sales',
    'product_approvals','state_registrations','brewery_state_licenses','report_filings',
    'routes','deliveries']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_read on %I for select using (public.is_staff_of(brewery_id))', t);
  end loop;
  -- Append-only ledgers retain staff reads. Only the inventory command paths
  -- below may append inventory movements; the other ledgers have no staff DML.
  foreach t in array array['inventory_movements','material_movements','keg_events','transfers','volume_adjustments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_read on %I for select using (public.is_staff_of(brewery_id))', t);
    execute format('revoke update, delete on %I from authenticated, anon', t);
  end loop;
  -- order_events is append-only but has custom staff + customer policies below.
  execute format('alter table %I enable row level security', 'order_events');
  execute format('revoke update, delete on %I from authenticated, anon', 'order_events');
  -- Integration operators can inspect non-secret connection health; private
  -- credential storage is never covered by this public-table policy.
  foreach t in array array['qbo_connections','pos_connections']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy integration_operator_read on %I for select using (public.staff_role(brewery_id) in (''admin'', ''sales''))', t);
  end loop;
end $$;

alter table breweries enable row level security;
alter table brewery_users enable row level security;
alter table customer_users enable row level security;
alter table brewery_counters enable row level security;   -- no policies: only via next_no()

create policy staff_read on breweries for select using (is_staff_of(id));
-- Portal RPCs are security invokers, so customers may read only their
-- brewery's configured source while the mutation itself stays RLS-constrained.
create policy customer_read_portal_config on breweries for select
  using (id in (select c.brewery_id from public.customers c where c.id in (select public.my_customer_ids())));
create policy breweries_set_portal_fulfillment_source on breweries for update
  using (public.is_authorized_staff_rpc(id, 'set_portal_fulfillment_source', array['admin']::public.staff_role[]))
  with check (public.is_authorized_staff_rpc(id, 'set_portal_fulfillment_source', array['admin']::public.staff_role[]));
create policy member_read on brewery_users for select using (user_id = auth.uid() or is_staff_of(brewery_id));
create policy self_read on customer_users for select using (user_id = auth.uid());

-- Portal customers
create policy customer_read_own on customers for select using (id in (select my_customer_ids()));
create policy customer_own on ship_tos for select using (customer_id in (select my_customer_ids()));
create policy customer_read on products for select
  using (brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy customer_read on skus for select
  using (active and brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy customer_own_prices on price_list_items for select
  using (price_list_id in (select c.price_list_id from customers c where c.id in (select my_customer_ids())));
create policy customer_read_portal_source on locations for select
  using (
    id in (
      select b.portal_fulfillment_location_id from public.breweries b
      where b.id = locations.brewery_id
    )
  );
create policy customer_read on orders for select using (customer_id in (select my_customer_ids()));
create policy customer_read on order_lines for select
  using (order_id in (select id from public.orders where customer_id in (select public.my_customer_ids())));
-- Raw customer DML remains denied: these predicates are true only inside the
-- named portal RPC request and only for the caller's own wholesale order.
create policy orders_portal_create on orders for insert
  with check (
    current_setting('request.path', true) = '/rpc/portal_create_order'
    and customer_id in (select public.my_customer_ids())
    and kind = 'wholesale' and status = 'draft' and created_by = auth.uid()
  );
create policy orders_portal_update on orders for update
  using (
    current_setting('request.path', true) in ('/rpc/portal_update_draft_order', '/rpc/portal_submit_order')
    and customer_id in (select public.my_customer_ids())
  )
  with check (
    current_setting('request.path', true) in ('/rpc/portal_update_draft_order', '/rpc/portal_submit_order')
    and customer_id in (select public.my_customer_ids()) and kind = 'wholesale'
  );
create policy order_lines_portal_insert on order_lines for insert
  with check (
    current_setting('request.path', true) in ('/rpc/portal_create_order', '/rpc/portal_update_draft_order')
    and order_id in (select id from public.orders where customer_id in (select public.my_customer_ids()) and status = 'draft')
  );
create policy order_lines_portal_delete on order_lines for delete
  using (
    current_setting('request.path', true) = '/rpc/portal_update_draft_order'
    and order_id in (select id from public.orders where customer_id in (select public.my_customer_ids()) and status = 'draft')
  );
create policy customer_read on shipments for select
  using (order_id in (select id from orders where customer_id in (select my_customer_ids())));
create policy customer_read on invoices for select using (customer_id in (select my_customer_ids()));
create policy customer_read on invoice_lines for select
  using (invoice_id in (select id from invoices where customer_id in (select my_customer_ids())));
create policy customer_read on deliveries for select
  using (shipment_id in (select s.id from shipments s join orders o on o.id = s.order_id where o.customer_id in (select my_customer_ids())));
create policy staff_read on order_events for select using (public.is_staff_of(brewery_id));
create policy customer_read on order_events for select
  using (order_id in (select id from orders where customer_id in (select my_customer_ids())));
create policy order_events_portal_insert on order_events for insert
  with check (
    current_setting('request.path', true) in ('/rpc/portal_create_order', '/rpc/portal_update_draft_order', '/rpc/portal_submit_order')
    and actor = auth.uid()
    and order_id in (select id from public.orders where customer_id in (select public.my_customer_ids()))
  );

-- Staff command writes: every predicate requires both the exact RPC request
-- path and the registered staff role. A matching table privilege alone cannot
-- authorize a raw /rest/v1/<table> mutation.
create policy products_create_product on products for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'create_product', array['admin','sales']::public.staff_role[]));
create policy skus_create_sku on skus for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'create_sku', array['admin','sales']::public.staff_role[]));
create policy locations_create_location on locations for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'create_location', array['admin']::public.staff_role[]));

create policy customers_upsert_insert on customers for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'upsert_customer', array['admin','sales']::public.staff_role[]));
create policy customers_upsert_update on customers for update
  using (public.is_authorized_staff_rpc(brewery_id, 'upsert_customer', array['admin','sales']::public.staff_role[]))
  with check (public.is_authorized_staff_rpc(brewery_id, 'upsert_customer', array['admin','sales']::public.staff_role[]));
create policy ship_tos_upsert_insert on ship_tos for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'upsert_ship_to', array['admin','sales']::public.staff_role[]));
create policy ship_tos_upsert_update on ship_tos for update
  using (public.is_authorized_staff_rpc(brewery_id, 'upsert_ship_to', array['admin','sales']::public.staff_role[]))
  with check (public.is_authorized_staff_rpc(brewery_id, 'upsert_ship_to', array['admin','sales']::public.staff_role[]));
create policy price_lists_upsert_insert on price_lists for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'upsert_price_list', array['admin','sales']::public.staff_role[]));
create policy price_lists_upsert_update on price_lists for update
  using (public.is_authorized_staff_rpc(brewery_id, 'upsert_price_list', array['admin','sales']::public.staff_role[]))
  with check (public.is_authorized_staff_rpc(brewery_id, 'upsert_price_list', array['admin','sales']::public.staff_role[]));
create policy price_list_items_set_price_insert on price_list_items for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'set_price', array['admin','sales']::public.staff_role[]));
create policy price_list_items_set_price_update on price_list_items for update
  using (public.is_authorized_staff_rpc(brewery_id, 'set_price', array['admin','sales']::public.staff_role[]))
  with check (public.is_authorized_staff_rpc(brewery_id, 'set_price', array['admin','sales']::public.staff_role[]));

create policy inventory_movements_command_insert on inventory_movements for insert
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'record_movement', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_credit_memo', array['admin','sales']::public.staff_role[])
  );
create policy taproom_pars_set_insert on taproom_pars for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'set_taproom_par', array['admin','sales']::public.staff_role[]));
create policy taproom_pars_set_update on taproom_pars for update
  using (public.is_authorized_staff_rpc(brewery_id, 'set_taproom_par', array['admin','sales']::public.staff_role[]))
  with check (public.is_authorized_staff_rpc(brewery_id, 'set_taproom_par', array['admin','sales']::public.staff_role[]));

create policy allocations_command_insert on allocations for insert
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'confirm_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'set_standing_allocation', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_replenishment_order', array['admin','sales']::public.staff_role[])
  );
create policy allocations_command_update on allocations for update
  using (
    public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'cancel_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'set_standing_allocation', array['admin','sales']::public.staff_role[])
  )
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'cancel_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'set_standing_allocation', array['admin','sales']::public.staff_role[])
  );

create policy orders_command_insert on orders for insert
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'create_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_replenishment_order', array['admin','sales']::public.staff_role[])
  );
create policy orders_command_update on orders for update
  using (
    public.is_authorized_staff_rpc(brewery_id, 'update_draft_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'submit_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'confirm_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'cancel_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'record_pick', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_replenishment_order', array['admin','sales']::public.staff_role[])
  )
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'update_draft_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'submit_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'confirm_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'cancel_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'record_pick', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_replenishment_order', array['admin','sales']::public.staff_role[])
  );
create policy order_lines_command_insert on order_lines for insert
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'create_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'update_draft_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_replenishment_order', array['admin','sales']::public.staff_role[])
  );
create policy order_lines_command_update on order_lines for update
  using (
    public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'record_pick', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
  )
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'record_pick', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
  );
create policy order_lines_command_delete on order_lines for delete
  using (
    public.is_authorized_staff_rpc(brewery_id, 'update_draft_order', array['admin','sales']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
  );

create policy shipments_ship_order on shipments for insert
  with check (public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[]));
create policy invoices_command_insert on invoices for insert
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_credit_memo', array['admin','sales']::public.staff_role[])
  );
create policy invoice_lines_command_insert on invoice_lines for insert
  with check (
    public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
    or public.is_authorized_staff_rpc(brewery_id, 'create_credit_memo', array['admin','sales']::public.staff_role[])
  );
create policy order_events_command_insert on order_events for insert
  with check (
    actor = auth.uid()
    and (
      public.is_authorized_staff_rpc(brewery_id, 'create_order', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'update_draft_order', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'submit_order', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'confirm_order', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'adjust_order_lines', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'cancel_order', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'record_pick', array['admin','warehouse']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'ship_order', array['admin','warehouse']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'create_credit_memo', array['admin','sales']::public.staff_role[])
      or public.is_authorized_staff_rpc(brewery_id, 'create_replenishment_order', array['admin','sales']::public.staff_role[])
    )
  );

-- Chat configuration is read-only to ordinary clients. Registered operations
-- own all mutations; installation reads expose health columns only.
alter table chat_installations enable row level security;
alter table chat_user_links enable row level security;
alter table notification_destinations enable row level security;
alter table notification_preferences enable row level security;
alter table notification_occurrences enable row level security;
alter table notification_deliveries enable row level security;
alter table chat_callback_receipts enable row level security;
alter table chat_action_intents enable row level security;

create policy chat_installations_admin_read on chat_installations for select to authenticated
  using ((select staff_role(brewery_id)) = 'admin');
create policy chat_user_links_self_read on chat_user_links for select to authenticated
  using (
    user_id = (select auth.uid())
    and state = 'active'
    and (select is_staff_of(brewery_id))
  );
create policy notification_destinations_admin_shared_read on notification_destinations for select to authenticated
  using (kind = 'private_channel' and (select staff_role(brewery_id)) = 'admin');
create policy notification_destinations_personal_read on notification_destinations for select to authenticated
  using (
    kind = 'personal'
    and user_id = (select auth.uid())
    and (select is_staff_of(brewery_id))
    and exists (
      select 1
      from chat_user_links l
      where l.brewery_id = notification_destinations.brewery_id
        and l.user_id = (select auth.uid())
        and l.state = 'active'
    )
  );
create policy notification_preferences_self_read on notification_preferences for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select is_staff_of(brewery_id))
    and exists (
      select 1
      from chat_user_links l
      where l.brewery_id = notification_preferences.brewery_id
        and l.user_id = (select auth.uid())
        and l.state = 'active'
    )
  );

revoke all on chat_installations, chat_user_links, notification_destinations, notification_preferences,
  notification_occurrences, notification_deliveries, chat_callback_receipts, chat_action_intents
  from anon, authenticated;
grant select (id, brewery_id, provider, display_label, state, installed_at, disabled_at, disconnected_at,
  last_health_checked_at, last_healthy_at, last_failure_code, created_at, updated_at)
  on chat_installations to authenticated;
grant select on chat_user_links, notification_destinations, notification_preferences to authenticated;

-- ---------------------------------------------------------------- chat installation lifecycle
-- Security definer RPCs: the only writers to chat_installations. Every
-- user-facing one pins the row's brewery and requires a current admin.
-- coalesce() matters: staff_role() is null for non-members and for the
-- service role, and `null <> 'admin'` would silently pass an `if`.
create function assert_chat_admin(b uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.staff_role(b)::text, '') <> 'admin' then
    raise exception 'permission denied: brewery admin required' using errcode = '42501';
  end if;
end $$;

-- Single-use OAuth intent: sha256(state), exact redirect URI, ten-minute expiry.
-- A pending row is reused so a cancelled OAuth never leaves duplicates.
create function begin_chat_installation(p_brewery uuid, p_provider text, p_redirect_uri text, p_state_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations; v_id uuid; v_exp timestamptz := now() + interval '10 minutes';
begin
  perform public.assert_chat_admin(p_brewery);
  select * into r from public.chat_installations
    where brewery_id = p_brewery and provider = p_provider and state <> 'disconnected' for update;
  if found and r.state <> 'pending' then
    raise exception 'installation already exists; reauthorize instead';
  end if;
  if found then
    update public.chat_installations
      set oauth_intent_hash = p_state_hash, oauth_intent_kind = 'install', oauth_redirect_uri = p_redirect_uri,
          oauth_expires_at = v_exp, oauth_consumed_at = null, installer_user_id = auth.uid(), updated_at = now()
      where id = r.id returning id into v_id;
  else
    v_id := gen_random_uuid();
    insert into public.chat_installations
      (id, brewery_id, provider, external_installation_id, display_label, state, oauth_intent_hash, oauth_intent_kind,
       oauth_redirect_uri, oauth_expires_at, installer_user_id, token_store_key)
    values (v_id, p_brewery, p_provider, 'pending:' || v_id, 'Pending', 'pending', p_state_hash, 'install',
            p_redirect_uri, v_exp, auth.uid(), 'pending:' || v_id);
  end if;
  return jsonb_build_object('installation_id', v_id, 'expires_at', v_exp);
end $$;

create function begin_chat_reauthorization(p_installation uuid, p_redirect_uri text, p_state_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations; v_exp timestamptz := now() + interval '10 minutes';
begin
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  perform public.assert_chat_admin(r.brewery_id);
  if r.state not in ('active', 'disabled', 'needs_reauthorization') then
    raise exception 'installation cannot be reauthorized from state %', r.state;
  end if;
  update public.chat_installations
    set oauth_intent_hash = p_state_hash, oauth_intent_kind = 'reauthorize', oauth_redirect_uri = p_redirect_uri,
        oauth_expires_at = v_exp, oauth_consumed_at = null, installer_user_id = auth.uid(), updated_at = now()
    where id = r.id;
  return jsonb_build_object('installation_id', r.id, 'expires_at', v_exp);
end $$;

-- Callback lookup before any token exchange. Null for forged state and for
-- callers who are no longer an admin of the owning brewery.
create function find_chat_oauth_intent(p_state_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  select * into r from public.chat_installations where oauth_intent_hash = p_state_hash;
  if not found or coalesce(public.staff_role(r.brewery_id)::text, '') <> 'admin' then return null; end if;
  return jsonb_build_object(
    'installation_id', r.id, 'brewery_id', r.brewery_id, 'state', r.state, 'kind', r.oauth_intent_kind,
    'redirect_uri', r.oauth_redirect_uri, 'expires_at', r.oauth_expires_at, 'consumed_at', r.oauth_consumed_at,
    'external_installation_id', r.external_installation_id);
end $$;

-- Consumes the intent and activates the mapping. Replaying a consumed intent
-- for the same workspace is a no-op success; anything else fails closed.
create function activate_chat_installation(
  p_installation uuid, p_state_hash text, p_redirect_uri text, p_external_installation_id text,
  p_external_enterprise_id text, p_display_label text, p_token_store_key text, p_granted_capabilities jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  perform public.assert_chat_admin(r.brewery_id);
  if r.oauth_intent_hash is distinct from p_state_hash then raise exception 'oauth state mismatch'; end if;
  if r.oauth_consumed_at is not null then
    if r.state = 'active' and r.external_installation_id = p_external_installation_id then
      return jsonb_build_object('installation_id', r.id, 'replayed', true);
    end if;
    raise exception 'oauth state already used';
  end if;
  if r.oauth_expires_at < now() then raise exception 'oauth state expired'; end if;
  if r.oauth_redirect_uri is distinct from p_redirect_uri then raise exception 'oauth redirect mismatch'; end if;
  if r.oauth_intent_kind = 'reauthorize' and r.external_installation_id <> p_external_installation_id then
    raise exception 'reauthorization returned a different workspace';
  end if;
  if exists (select 1 from public.chat_installations
             where provider = r.provider and external_installation_id = p_external_installation_id
               and state = 'active' and id <> r.id) then
    raise exception 'workspace is already connected to another brewery';
  end if;
  update public.chat_installations
    set state = 'active', external_installation_id = p_external_installation_id,
        external_enterprise_id = p_external_enterprise_id, display_label = p_display_label,
        token_store_key = p_token_store_key, granted_capabilities = coalesce(p_granted_capabilities, '{}'),
        oauth_consumed_at = now(), installed_at = coalesce(installed_at, now()), disabled_at = null,
        last_failure_code = null, last_healthy_at = now(), last_health_checked_at = now(), updated_at = now()
    where id = r.id;
  return jsonb_build_object('installation_id', r.id, 'replayed', false);
end $$;

-- Health path (jobs run as service_role; admins may also call it).
create function mark_chat_installation_reauthorization(p_installation uuid, p_failure_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  if auth.role() is distinct from 'service_role' then perform public.assert_chat_admin(r.brewery_id); end if;
  if r.state in ('active', 'needs_reauthorization') then
    update public.chat_installations
      set state = 'needs_reauthorization', last_failure_code = p_failure_code,
          last_health_checked_at = now(), updated_at = now()
      where id = r.id;
  end if;
end $$;

create function disable_chat_installation(p_installation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  perform public.assert_chat_admin(r.brewery_id);
  if r.state not in ('active', 'needs_reauthorization') then
    raise exception 'installation cannot be disabled from state %', r.state;
  end if;
  update public.chat_installations set state = 'disabled', disabled_at = now(), updated_at = now() where id = r.id;
end $$;

-- Disable first, then invalidate everything that could still route a send or
-- an action; provider credential deletion happens afterwards in app code.
create function disconnect_chat_installation(p_installation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  perform public.assert_chat_admin(r.brewery_id);
  if r.state = 'disconnected' then
    return jsonb_build_object('installation_id', r.id, 'external_installation_id', r.external_installation_id);
  end if;
  update public.chat_installations
    set state = 'disconnected', disabled_at = coalesce(disabled_at, now()), disconnected_at = now(),
        oauth_intent_hash = null, oauth_intent_kind = null, oauth_redirect_uri = null,
        oauth_expires_at = null, oauth_reconciled_at = null, updated_at = now()
    where id = r.id;
  update public.notification_destinations
    set state = 'blocked', blocked_reason = 'installation_disconnected', updated_at = now()
    where installation_id = r.id and state = 'active';
  update public.chat_user_links
    set state = 'unlinked', unlinked_at = now(), updated_at = now()
    where installation_id = r.id and state <> 'unlinked';
  update public.chat_action_intents
    set expires_at = least(expires_at, now())
    where installation_id = r.id and consumed_at is null;
  return jsonb_build_object('installation_id', r.id, 'external_installation_id', r.external_installation_id);
end $$;

-- Records the outcome of provider credential cleanup after a partial install
-- or a disconnect. Reconciler jobs run as service_role.
create function reconcile_chat_installation(p_installation uuid, p_credential_deleted boolean, p_failure_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  if auth.role() is distinct from 'service_role' then perform public.assert_chat_admin(r.brewery_id); end if;
  update public.chat_installations
    set oauth_reconciled_at = case when p_credential_deleted then now() else null end,
        last_failure_code = p_failure_code, updated_at = now()
    where id = r.id;
end $$;

revoke execute on function assert_chat_admin(uuid),
  begin_chat_installation(uuid, text, text, text), begin_chat_reauthorization(uuid, text, text),
  find_chat_oauth_intent(text),
  activate_chat_installation(uuid, text, text, text, text, text, text, jsonb),
  mark_chat_installation_reauthorization(uuid, text), disable_chat_installation(uuid),
  disconnect_chat_installation(uuid), reconcile_chat_installation(uuid, boolean, text)
  from public, anon;
grant execute on function
  begin_chat_installation(uuid, text, text, text), begin_chat_reauthorization(uuid, text, text),
  find_chat_oauth_intent(text),
  activate_chat_installation(uuid, text, text, text, text, text, text, jsonb),
  mark_chat_installation_reauthorization(uuid, text), disable_chat_installation(uuid),
  disconnect_chat_installation(uuid), reconcile_chat_installation(uuid, boolean, text)
  to authenticated;
grant execute on function mark_chat_installation_reauthorization(uuid, text), reconcile_chat_installation(uuid, boolean, text)
  to service_role;

-- ---------------------------------------------------------------- chat staff linking
-- Issued by the App Home handler (service role, no user): one pending row per
-- (installation, external user) holding only sha256(proof) for ten minutes.
create function issue_chat_link_proof(p_installation uuid, p_external_user_id text, p_proof_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; l public.chat_user_links; v_id uuid; v_exp timestamptz := now() + interval '10 minutes';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into i from public.chat_installations where id = p_installation;
  if not found then raise exception 'installation not found'; end if;
  if i.state <> 'active' then raise exception 'installation is not active'; end if;
  select * into l from public.chat_user_links
    where installation_id = p_installation and external_user_id = p_external_user_id for update;
  if found and l.state = 'active' then raise exception 'external user already linked'; end if;
  if found then
    update public.chat_user_links
      set state = 'pending', user_id = null, proof_hash = p_proof_hash, proof_issued_at = now(), proof_expires_at = v_exp,
          proof_consumed_at = null, linked_at = null, disabled_at = null, unlinked_at = null, updated_at = now()
      where id = l.id returning id into v_id;
  else
    insert into public.chat_user_links
      (brewery_id, installation_id, provider, external_user_id, state, proof_hash, proof_issued_at, proof_expires_at)
    values (i.brewery_id, i.id, i.provider, p_external_user_id, 'pending', p_proof_hash, now(), v_exp)
    returning id into v_id;
  end if;
  return jsonb_build_object('link_id', v_id, 'expires_at', v_exp);
end $$;

-- Consumed by the authenticated staff member who opened the link. Membership
-- is checked here against the installation's brewery, never against Slack
-- profile data. Customers have no brewery_users row and are rejected.
create function consume_chat_link_proof(p_proof_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.chat_user_links; v_state text;
begin
  select * into l from public.chat_user_links where proof_hash = p_proof_hash and state = 'pending' for update;
  if not found or l.proof_consumed_at is not null or l.proof_expires_at < now() then
    raise exception 'link proof invalid or expired';
  end if;
  select state into v_state from public.chat_installations where id = l.installation_id;
  if v_state <> 'active' then raise exception 'installation is not active'; end if;
  if not public.is_staff_of(l.brewery_id) then
    raise exception 'not a member of this brewery' using errcode = '42501';
  end if;
  if exists (select 1 from public.chat_user_links
             where installation_id = l.installation_id and user_id = auth.uid() and state = 'active') then
    raise exception 'you are already linked in this workspace';
  end if;
  update public.chat_user_links
    set user_id = auth.uid(), state = 'active', linked_at = now(), proof_consumed_at = now(), proof_hash = null, updated_at = now()
    where id = l.id;
  return jsonb_build_object('link_id', l.id, 'installation_id', l.installation_id, 'brewery_id', l.brewery_id);
end $$;

create function unlink_chat_user(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.chat_user_links;
begin
  select * into l from public.chat_user_links where id = p_link for update;
  if not found then raise exception 'link not found'; end if;
  if l.user_id is distinct from auth.uid() and coalesce(public.staff_role(l.brewery_id)::text, '') <> 'admin' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if l.state <> 'unlinked' then
    update public.chat_user_links
      set state = 'unlinked', unlinked_at = now(), proof_hash = null, updated_at = now()
      where id = l.id;
  end if;
end $$;

-- Every provider callback re-resolves the actor from server state: active
-- installation, active link, and current membership/role. Returns no token.
create function resolve_chat_actor(p_provider text, p_external_installation_id text, p_external_user_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select i.id as installation_id, i.brewery_id, l.user_id, bu.role into r
    from public.chat_installations i
    join public.chat_user_links l on l.installation_id = i.id and l.external_user_id = p_external_user_id and l.state = 'active'
    join public.brewery_users bu on bu.brewery_id = i.brewery_id and bu.user_id = l.user_id
    where i.provider = p_provider and i.external_installation_id = p_external_installation_id and i.state = 'active';
  if not found then return null; end if;
  return jsonb_build_object('installation_id', r.installation_id, 'brewery_id', r.brewery_id,
    'external_user_id', p_external_user_id, 'user_id', r.user_id, 'role', r.role);
end $$;

revoke execute on function issue_chat_link_proof(uuid, text, text), consume_chat_link_proof(text),
  unlink_chat_user(uuid), resolve_chat_actor(text, text, text)
  from public, anon, authenticated;
grant execute on function consume_chat_link_proof(text), unlink_chat_user(uuid) to authenticated;
grant execute on function issue_chat_link_proof(uuid, text, text), resolve_chat_actor(text, text, text) to service_role;

-- ---------------------------------------------------------------- Today reasons (shared projection)
-- The four due rules are defined once here and read two ways: get_today_items
-- (RLS-bound, role-filtered, for MGR Today and App Home) and
-- scan_chat_today_candidates (service_role only, one brewery, for occurrence
-- generation). due_at is brewery-local; the readers apply p_now so tests and
-- jobs can evaluate "due" at any instant. source_version is a non-secret
-- stale token over the columns that define the row.
-- `private` (server-only; no Data API role holds usage) is created at the top
-- of this file. The view is reached only through the definer readers below.
create view private.today_candidates with (security_invoker = true) as
  select o.brewery_id, 'submitted_order'::text as reason, 'order'::text as subject_type, o.id::text as subject_id,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)) as source_version,
         'ORD-' || lpad(o.order_no::text, 4, '0') as safe_label,
         'submitted' || coalesce(' · ships ' || to_char(o.requested_ship_date, 'Dy FMMM/FMDD'), '') as detail,
         (o.requested_ship_date::timestamp at time zone b.timezone) as due_at,
         '/orders/' || o.id as href,
         array['admin','sales']::text[] as recipient_roles,
         null::uuid as assigned_user_id
    from orders o join breweries b on b.id = o.brewery_id
    where o.status = 'submitted'
  union all
  select o.brewery_id, 'pick_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.requested_ship_date, o.needs_restock)),
         'ORD-' || lpad(o.order_no::text, 4, '0'),
         'pick due' || coalesce(' · ships ' || to_char(o.requested_ship_date, 'Dy FMMM/FMDD'), ''),
         (o.requested_ship_date::timestamp at time zone b.timezone),
         '/orders/' || o.id,
         array['admin','warehouse']::text[],
         null::uuid
    from orders o join breweries b on b.id = o.brewery_id
    where o.status = 'confirmed' and o.requested_ship_date is not null
  union all
  -- only the lowest undelivered stop of an open route is "next"
  select r.brewery_id, 'delivery_next', 'delivery', d.id::text,
         md5(concat_ws('|', r.driver_user_id, r.delivery_date, d.stop_no, d.delivered_at, r.returned_at)),
         coalesce(r.name, 'Route') || ' · stop ' || d.stop_no,
         'next stop',
         (r.delivery_date::timestamp at time zone b.timezone),
         '/work/deliveries/' || d.id,
         array['admin','warehouse']::text[],
         r.driver_user_id
    from deliveries d
    join routes r on r.id = d.route_id
    join breweries b on b.id = r.brewery_id
    where d.delivered_at is null and r.returned_at is null
      and d.stop_no = (select min(d2.stop_no) from deliveries d2 where d2.route_id = d.route_id and d2.delivered_at is null)
  union all
  -- overdue when the latest reading (or occupancy start when none) plus the
  -- brewery cadence has passed; never synthesizes a reading
  select vo.brewery_id, 'fermentation_reading_overdue', 'occupancy', vo.id::text,
         md5(concat_ws('|', last.at, vo.started_at, b.fermentation_reading_due_hours)),
         v.name,
         'reading due',
         coalesce(last.at, vo.started_at) + make_interval(hours => b.fermentation_reading_due_hours),
         '/beer/cellar/' || vo.id || '/reading',
         array['admin','brewer']::text[],
         null::uuid
    from vessel_occupancies vo
    join vessels v on v.id = vo.vessel_id
    join breweries b on b.id = vo.brewery_id
    left join lateral (select max(fr.at) as at from fermentation_readings fr where fr.occupancy_id = vo.id) last on true
    where vo.ended_at is null;
grant select on private.today_candidates to service_role;

-- ponytail: delivery_next and fermentation_reading_overdue join this list when
-- their MGR pages/commands ship (slice 4 cellar reading, slice 10 delivery stop).
create function today_live_reasons() returns text[]
language sql immutable set search_path = '' as $$ select array['submitted_order','pick_due'] $$;

create function get_today_items(p_brewery uuid, p_now timestamptz default now())
returns setof private.today_candidates
language sql stable security definer set search_path = '' as $$
  -- definer only to reach the private view; visibility is re-derived from the
  -- caller's own brewery_users row below, never widened.
  select c.*
    from private.today_candidates c
    join public.brewery_users bu on bu.brewery_id = c.brewery_id and bu.user_id = auth.uid()
    where c.brewery_id = p_brewery
      and c.reason = any (public.today_live_reasons())
      and (c.reason = 'submitted_order' or c.due_at <= p_now)
      and (bu.role = 'admin'
           or (bu.role::text = any (c.recipient_roles) and (c.assigned_user_id is null or c.assigned_user_id = auth.uid())))
    order by c.due_at nulls last, c.safe_label
$$;

create function scan_chat_today_candidates(p_brewery_id uuid, p_now timestamptz)
returns setof private.today_candidates
language sql stable security definer set search_path = '' as $$
  select c.*
    from private.today_candidates c
    where c.brewery_id = p_brewery_id
      and c.reason = any (public.today_live_reasons())
      and (c.reason = 'submitted_order' or c.due_at <= p_now)
$$;

revoke execute on function today_live_reasons(), get_today_items(uuid, timestamptz), scan_chat_today_candidates(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function today_live_reasons(), get_today_items(uuid, timestamptz) to authenticated, service_role;
grant execute on function scan_chat_today_candidates(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------- notification occurrences, deliveries, leases
-- Quiet hours: p_now when outside the window, else the first instant after the
-- window ends in local time. Windows may cross midnight; `at time zone`
-- handles DST so 03:00 means local 03:00 on either side of a transition.
create function chat_quiet_release(p_now timestamptz, p_start time, p_end time, p_tz text) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare v_local timestamp; v_t time; v_d date;
begin
  if p_start is null or p_end is null or p_start = p_end then return p_now; end if;
  v_local := p_now at time zone p_tz; v_t := v_local::time; v_d := v_local::date;
  if p_start < p_end then
    return case when v_t >= p_start and v_t < p_end then (v_d + p_end) at time zone p_tz else p_now end;
  end if;
  if v_t >= p_start then return ((v_d + 1) + p_end) at time zone p_tz; end if;
  if v_t < p_end then return (v_d + p_end) at time zone p_tz; end if;
  return p_now;
end $$;

-- Upserts active occurrences from the gated Today candidates. Semantic key:
-- reason:subject:source_version, so a repeated scan or a retry can never
-- duplicate one and a state change (new version) yields a new occurrence.
create function chat_upsert_occurrences(p_brewery uuid, p_now timestamptz, p_subject_id text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.notification_occurrences
    (brewery_id, reason, subject_type, subject_id, source_version, occurred_at, owner_query, due_at, urgency, payload, semantic_key)
  select c.brewery_id, c.reason, c.subject_type, c.subject_id, c.source_version, p_now,
         case c.reason when 'submitted_order' then 'orders' when 'pick_due' then 'picks'
                       when 'delivery_next' then 'deliveries' else 'fermentation' end,
         c.due_at,
         case when c.reason in ('submitted_order', 'fermentation_reading_overdue') then 'attention' else 'normal' end,
         jsonb_build_object('safe_label', c.safe_label, 'detail', c.detail, 'href', c.href,
                            'recipient_roles', to_jsonb(c.recipient_roles), 'assigned_user_id', c.assigned_user_id, 'due_at', c.due_at),
         c.reason || ':' || c.subject_id || ':' || c.source_version
    from public.scan_chat_today_candidates(p_brewery, p_now) c
    where p_subject_id is null or c.subject_id = p_subject_id
  on conflict (brewery_id, semantic_key) do update
    set state = 'active', resolved_at = null, updated_at = now()
    where notification_occurrences.state <> 'active';
  get diagnostics n = row_count;
  return n;
end $$;

-- One personal delivery per (occurrence, linked recipient destination):
-- role or assignment must match (admins always), the link and destination
-- must be active, the reason must not be muted, and the first attempt waits
-- for quiet hours (personal override when set, else the installation's).
create function chat_fanout_deliveries(p_brewery uuid, p_now timestamptz, p_occurrence uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.notification_deliveries
    (brewery_id, occurrence_id, destination_id, installation_id, provider, semantic_key, next_attempt_at)
  select o.brewery_id, o.id, d.id, i.id, i.provider, o.semantic_key || ':' || d.id,
         public.chat_quiet_release(p_now,
           coalesce(p.quiet_hours_start, i.quiet_hours_start),
           case when p.quiet_hours_start is not null then p.quiet_hours_end else i.quiet_hours_end end,
           case when p.quiet_hours_start is not null then coalesce(p.quiet_hours_timezone, b.timezone) else coalesce(i.quiet_hours_timezone, b.timezone) end)
    from public.notification_occurrences o
    join public.breweries b on b.id = o.brewery_id
    join public.chat_installations i on i.brewery_id = o.brewery_id and i.state = 'active'
    join public.brewery_users bu on bu.brewery_id = o.brewery_id
      and (bu.role = 'admin' or o.payload->'recipient_roles' ? bu.role::text)
      and ((o.payload->>'assigned_user_id') is null or (o.payload->>'assigned_user_id')::uuid = bu.user_id)
    join public.chat_user_links l on l.installation_id = i.id and l.user_id = bu.user_id and l.state = 'active'
    join public.notification_destinations d on d.installation_id = i.id and d.user_id = bu.user_id
      and d.kind = 'personal' and d.state = 'active'
    left join public.notification_preferences p on p.brewery_id = o.brewery_id and p.user_id = bu.user_id and p.reason = o.reason
    where o.brewery_id = p_brewery and o.state = 'active' and o.reason <> 'operations_digest'
      and (p_occurrence is null or o.id = p_occurrence)
      and coalesce(p.enabled, true)
  on conflict (brewery_id, semantic_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Called inside submit_order so the occurrence and its deliveries commit with
-- the order. Callable by whoever could submit: staff, or the order's customer.
create function record_submitted_order_occurrence(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if not found then return; end if;
  if auth.role() is distinct from 'service_role' and not public.is_staff_of(o.brewery_id)
     and not coalesce(o.customer_id in (select public.my_customer_ids()), false) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform public.chat_upsert_occurrences(o.brewery_id, now(), p_order::text);
  perform public.chat_fanout_deliveries(o.brewery_id, now(),
    (select id from public.notification_occurrences
      where brewery_id = o.brewery_id and reason = 'submitted_order' and subject_id = p_order::text and state = 'active'
      order by created_at desc limit 1));
end $$;

-- Scheduled catch-up scan for one brewery: upsert current occurrences,
-- resolve stale ones (suppress their queued deliveries, flag sent ones for a
-- resolved update), create the 08:00/12:00 digest occurrences for every
-- window already open today (missed windows recover), then fan out. Never
-- posts a message.
create function scan_chat_notification_occurrences(p_brewery uuid, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.breweries; v_up int; v_res int; v_del int; v_dig int := 0; n int;
        v_local timestamp; v_date date; v_t time; w record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into b from public.breweries where id = p_brewery;
  if not found then return jsonb_build_object('upserted', 0, 'resolved', 0, 'deliveries', 0, 'digests', 0); end if;

  v_up := public.chat_upsert_occurrences(p_brewery, p_now, null);

  with current as (
    select c.reason || ':' || c.subject_id || ':' || c.source_version as k
      from public.scan_chat_today_candidates(p_brewery, p_now) c
  ), stale as (
    update public.notification_occurrences o
      set state = 'resolved', resolved_at = p_now, updated_at = now()
      where o.brewery_id = p_brewery and o.state = 'active' and o.reason <> 'operations_digest'
        and o.semantic_key not in (select k from current)
      returning o.id
  )
  select count(*) into v_res from stale;

  v_local := p_now at time zone b.timezone; v_date := v_local::date; v_t := v_local::time;
  update public.notification_occurrences
    set state = 'resolved', resolved_at = p_now, updated_at = now()
    where brewery_id = p_brewery and reason = 'operations_digest' and state = 'active'
      and (due_at at time zone b.timezone)::date < v_date;
  for w in select * from (values ('morning', time '08:00'), ('midday', time '12:00')) as t(name, starts) loop
    if v_t >= w.starts then
      insert into public.notification_occurrences
        (brewery_id, reason, subject_type, subject_id, source_version, occurred_at, owner_query, due_at, urgency, payload, semantic_key)
      select p_brewery, 'operations_digest', 'digest', d.id::text, w.name, p_now, 'digest',
             (v_date + w.starts) at time zone b.timezone, 'normal',
             jsonb_build_object('window', w.name, 'local_date', v_date),
             'operations_digest:' || d.id || ':' || v_date || ':' || w.name
        from public.notification_destinations d
        join public.chat_installations i on i.id = d.installation_id and i.state = 'active'
        where d.brewery_id = p_brewery and d.kind = 'private_channel' and d.state = 'active'
      on conflict (brewery_id, semantic_key) do nothing;
      get diagnostics n = row_count;
      v_dig := v_dig + n;
    end if;
  end loop;
  insert into public.notification_deliveries
    (brewery_id, occurrence_id, destination_id, installation_id, provider, semantic_key, next_attempt_at)
  select o.brewery_id, o.id, d.id, i.id, i.provider, o.semantic_key || ':' || d.id, o.due_at
    from public.notification_occurrences o
    join public.notification_destinations d on d.id = o.subject_id::uuid and d.state = 'active'
    join public.chat_installations i on i.id = d.installation_id and i.state = 'active'
    where o.brewery_id = p_brewery and o.reason = 'operations_digest' and o.state = 'active'
  on conflict (brewery_id, semantic_key) do nothing;

  update public.notification_deliveries dl
    set state = 'suppressed', resolved_at = p_now, lease_expires_at = null, updated_at = now()
    from public.notification_occurrences o
    where dl.occurrence_id = o.id and o.brewery_id = p_brewery and o.state = 'resolved'
      and dl.state in ('queued', 'retrying', 'leased') and dl.provider_message_id is null;
  -- sent messages get one resolved update: re-queue them keeping the message id
  update public.notification_deliveries dl
    set state = 'queued', next_attempt_at = p_now, resolved_at = p_now, updated_at = now()
    from public.notification_occurrences o
    where dl.occurrence_id = o.id and o.brewery_id = p_brewery and o.state = 'resolved'
      and dl.state in ('sent', 'updated') and dl.resolved_at is null;

  v_del := public.chat_fanout_deliveries(p_brewery, p_now, null);
  return jsonb_build_object('upserted', v_up, 'resolved', v_res, 'deliveries', v_del, 'digests', v_dig);
end $$;

-- Bounded lease: recovers expired leases, then takes up to 100 due rows with
-- skip locked. Returns routing ids only; the lease expiry is the outcome token.
create function lease_chat_deliveries(p_limit int, p_lease_seconds int, p_now timestamptz)
returns table (id uuid, occurrence_id uuid, destination_id uuid, installation_id uuid, provider text, lease_expires_at timestamptz, attempt_count int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  update public.notification_deliveries d
    set state = 'retrying', lease_expires_at = null, updated_at = now()
    where d.state = 'leased' and d.lease_expires_at < p_now;
  return query
    with picked as (
      select d.id from public.notification_deliveries d
        where d.state in ('queued', 'retrying') and d.next_attempt_at <= p_now
        order by d.next_attempt_at
        limit least(greatest(coalesce(p_limit, 1), 1), 100)
        for update skip locked
    )
    update public.notification_deliveries d
      set state = 'leased', lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
          attempt_count = d.attempt_count + 1, updated_at = now()
      from picked where d.id = picked.id
      returning d.id, d.occurrence_id, d.destination_id, d.installation_id, d.provider, d.lease_expires_at, d.attempt_count;
end $$;

create function chat_take_lease(p_delivery uuid, p_lease timestamptz) returns public.notification_deliveries
language plpgsql set search_path = '' as $$
declare d public.notification_deliveries;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into d from public.notification_deliveries where id = p_delivery for update;
  if not found or d.state <> 'leased' or d.lease_expires_at is distinct from p_lease then
    raise exception 'delivery lease mismatch';
  end if;
  return d;
end $$;

create function complete_chat_delivery(p_delivery uuid, p_lease timestamptz, p_conversation_id text, p_message_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.notification_deliveries;
begin
  d := public.chat_take_lease(p_delivery, p_lease);
  update public.notification_deliveries
    set state = case when d.provider_message_id is null then 'sent' else 'updated' end,
        provider_conversation_id = p_conversation_id, provider_message_id = p_message_id,
        sent_at = coalesce(sent_at, now()), lease_expires_at = null, last_error_code = null, updated_at = now()
    where id = d.id;
end $$;

create function retry_chat_delivery(p_delivery uuid, p_lease timestamptz, p_next_attempt_at timestamptz, p_error_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.notification_deliveries;
begin
  d := public.chat_take_lease(p_delivery, p_lease);
  update public.notification_deliveries
    set state = 'retrying', next_attempt_at = p_next_attempt_at, last_error_code = p_error_code,
        lease_expires_at = null, updated_at = now()
    where id = d.id;
end $$;

create function suppress_chat_delivery(p_delivery uuid, p_lease timestamptz, p_state text, p_error_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.notification_deliveries;
begin
  if p_state not in ('suppressed', 'terminal') then raise exception 'invalid delivery outcome %', p_state; end if;
  d := public.chat_take_lease(p_delivery, p_lease);
  update public.notification_deliveries
    set state = p_state, last_error_code = p_error_code, resolved_at = coalesce(resolved_at, now()),
        lease_expires_at = null, updated_at = now()
    where id = d.id;
end $$;

-- Integration-owned settings (never touch MGR due state).
create function set_notification_preference(p_brewery uuid, p_reason text, p_enabled boolean, p_quiet_start time, p_quiet_end time, p_quiet_tz text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff_of(p_brewery) then raise exception 'permission denied' using errcode = '42501'; end if;
  if (p_quiet_start is null) <> (p_quiet_end is null) then raise exception 'quiet hours need both a start and an end'; end if;
  insert into public.notification_preferences (brewery_id, user_id, reason, enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone)
  values (p_brewery, auth.uid(), p_reason, p_enabled, p_quiet_start, p_quiet_end, p_quiet_tz)
  on conflict (brewery_id, user_id, reason) do update
    set enabled = excluded.enabled, quiet_hours_start = excluded.quiet_hours_start, quiet_hours_end = excluded.quiet_hours_end,
        quiet_hours_timezone = excluded.quiet_hours_timezone, updated_at = now();
end $$;

-- One active private operations channel per installation; replacing it blocks
-- the previous destination so no further digest routes there.
create function set_notification_destination(p_installation uuid, p_external_destination_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; v_id uuid;
begin
  select * into i from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  perform public.assert_chat_admin(i.brewery_id);
  update public.notification_destinations
    set state = 'blocked', blocked_reason = 'replaced', updated_at = now()
    where installation_id = i.id and kind = 'private_channel' and state = 'active'
      and external_destination_id <> p_external_destination_id;
  insert into public.notification_destinations (brewery_id, installation_id, kind, external_destination_id, privacy_class)
  values (i.brewery_id, i.id, 'private_channel', p_external_destination_id, 'private_internal')
  on conflict (installation_id, external_destination_id) do update
    set state = 'active', blocked_reason = null, updated_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create function set_brewery_quiet_hours(p_installation uuid, p_start time, p_end time) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations;
begin
  select * into i from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  perform public.assert_chat_admin(i.brewery_id);
  if (p_start is null) <> (p_end is null) then raise exception 'quiet hours need both a start and an end'; end if;
  update public.chat_installations
    set quiet_hours_start = p_start, quiet_hours_end = p_end,
        quiet_hours_timezone = (select timezone from public.breweries where id = i.brewery_id), updated_at = now()
    where id = i.id;
end $$;

revoke execute on function chat_quiet_release(timestamptz, time, time, text),
  chat_upsert_occurrences(uuid, timestamptz, text), chat_fanout_deliveries(uuid, timestamptz, uuid),
  record_submitted_order_occurrence(uuid), scan_chat_notification_occurrences(uuid, timestamptz),
  lease_chat_deliveries(int, int, timestamptz), chat_take_lease(uuid, timestamptz),
  complete_chat_delivery(uuid, timestamptz, text, text), retry_chat_delivery(uuid, timestamptz, timestamptz, text),
  suppress_chat_delivery(uuid, timestamptz, text, text),
  set_notification_preference(uuid, text, boolean, time, time, text), set_notification_destination(uuid, text),
  set_brewery_quiet_hours(uuid, time, time)
  from public, anon, authenticated;
grant execute on function record_submitted_order_occurrence(uuid),
  set_notification_preference(uuid, text, boolean, time, time, text), set_notification_destination(uuid, text),
  set_brewery_quiet_hours(uuid, time, time)
  to authenticated;
grant execute on function chat_quiet_release(timestamptz, time, time, text),
  scan_chat_notification_occurrences(uuid, timestamptz), lease_chat_deliveries(int, int, timestamptz),
  complete_chat_delivery(uuid, timestamptz, text, text), retry_chat_delivery(uuid, timestamptz, timestamptz, text),
  suppress_chat_delivery(uuid, timestamptz, text, text), record_submitted_order_occurrence(uuid)
  to service_role;

-- Durable provider callback receipt (App Home opens, later actions). Recorded
-- only after transport authenticity was verified; deduped by the provider's
-- event id. Returns null when the workspace has no active installation.
create function record_chat_callback_receipt(
  p_provider text, p_external_installation_id text, p_callback_id text, p_callback_kind text,
  p_external_user_id text, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into i from public.chat_installations
    where provider = p_provider and external_installation_id = p_external_installation_id and state = 'active';
  if not found then return null; end if;
  insert into public.chat_callback_receipts
    (brewery_id, installation_id, provider, callback_id, callback_kind, external_user_id, disposition, payload_hash, received_at)
  values (i.brewery_id, i.id, i.provider, p_callback_id, p_callback_kind, p_external_user_id, 'pending', p_payload_hash, now())
  on conflict (installation_id, callback_id) do nothing
  returning id into v_id;
  return jsonb_build_object('receipt_id', v_id, 'installation_id', i.id, 'brewery_id', i.brewery_id, 'duplicate', v_id is null);
end $$;
revoke execute on function record_chat_callback_receipt(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function record_chat_callback_receipt(text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------- chat worker reads/claims (service_role only)
create function chat_assert_job() returns void language plpgsql stable set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
end $$;

create function list_chat_scan_targets() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select public.chat_assert_job();
  select distinct brewery_id from public.chat_installations where state = 'active';
$$;

-- Claims pending callback receipts (recovering ones stuck in processing).
create function claim_chat_callback_receipts(p_limit int, p_now timestamptz)
returns table (id uuid, brewery_id uuid, installation_id uuid, external_installation_id text, external_user_id text, callback_kind text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.chat_assert_job();
  update public.chat_callback_receipts r set disposition = 'pending', processing_at = null
    where r.disposition = 'processing' and r.processing_at < p_now - interval '5 minutes';
  return query
    with picked as (
      select r.id from public.chat_callback_receipts r
        where r.disposition = 'pending' order by r.received_at
        limit least(greatest(coalesce(p_limit, 1), 1), 100)
        for update skip locked
    )
    update public.chat_callback_receipts r
      set disposition = 'processing', processing_at = p_now
      from picked, public.chat_installations i
      where r.id = picked.id and i.id = r.installation_id
      returning r.id, r.brewery_id, r.installation_id, i.external_installation_id, r.external_user_id, r.callback_kind;
end $$;

create function complete_chat_callback_receipt(p_receipt uuid, p_disposition text, p_error_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chat_assert_job();
  if p_disposition not in ('processed', 'ignored', 'failed') then raise exception 'invalid disposition %', p_disposition; end if;
  update public.chat_callback_receipts
    set disposition = p_disposition, error_code = p_error_code, completed_at = now()
    where id = p_receipt;
end $$;

-- Active occurrences visible to one linked external user (role/assignment
-- filtered, same rule as get_today_items). Null when not actively linked.
create function get_chat_home_items(p_installation uuid, p_external_user_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  perform public.chat_assert_job();
  select i.brewery_id, l.user_id, bu.role into r
    from public.chat_installations i
    join public.chat_user_links l on l.installation_id = i.id and l.external_user_id = p_external_user_id and l.state = 'active'
    join public.brewery_users bu on bu.brewery_id = i.brewery_id and bu.user_id = l.user_id
    where i.id = p_installation and i.state = 'active';
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'reason', o.reason, 'state', o.state, 'subject_type', o.subject_type,
      'subject_id', o.subject_id, 'urgency', o.urgency, 'due_at', o.due_at, 'payload', o.payload, 'semantic_key', o.semantic_key)
      order by o.due_at nulls last, o.created_at)
    from public.notification_occurrences o
    where o.brewery_id = r.brewery_id and o.state = 'active' and o.reason <> 'operations_digest'
      and (r.role = 'admin' or o.payload->'recipient_roles' ? r.role::text)
      and ((o.payload->>'assigned_user_id') is null or (o.payload->>'assigned_user_id')::uuid = r.user_id)
  ), '[]'::jsonb);
end $$;

-- Everything the worker must re-check before touching the provider, in one read.
create function get_chat_delivery_context(p_delivery uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.chat_assert_job();
  select jsonb_build_object(
    'delivery', jsonb_build_object('id', d.id, 'state', d.state, 'attempt_count', d.attempt_count,
      'provider_conversation_id', d.provider_conversation_id, 'provider_message_id', d.provider_message_id,
      'resolved_at', d.resolved_at, 'semantic_key', d.semantic_key),
    'occurrence', jsonb_build_object('id', o.id, 'reason', o.reason, 'state', o.state, 'subject_type', o.subject_type,
      'subject_id', o.subject_id, 'urgency', o.urgency, 'due_at', o.due_at, 'payload', o.payload, 'semantic_key', o.semantic_key),
    'destination', jsonb_build_object('id', dest.id, 'kind', dest.kind, 'external_destination_id', dest.external_destination_id,
      'state', dest.state, 'user_id', dest.user_id),
    'installation', jsonb_build_object('id', i.id, 'state', i.state, 'external_installation_id', i.external_installation_id,
      'provider', i.provider, 'brewery_id', i.brewery_id),
    'link_active', exists (select 1 from public.chat_user_links l
      where l.installation_id = i.id and l.user_id = dest.user_id and l.state = 'active'),
    'preference_enabled', coalesce((select p.enabled from public.notification_preferences p
      where p.brewery_id = d.brewery_id and p.user_id = dest.user_id and p.reason = o.reason), true),
    'counts', case when o.reason = 'operations_digest' then
      (select coalesce(jsonb_object_agg(x.reason, x.n), '{}'::jsonb)
         from (select reason, count(*) as n from public.notification_occurrences
                 where brewery_id = d.brewery_id and state = 'active' and reason <> 'operations_digest' group by reason) x)
      else null end)
  from public.notification_deliveries d
  join public.notification_occurrences o on o.id = d.occurrence_id
  join public.notification_destinations dest on dest.id = d.destination_id
  join public.chat_installations i on i.id = d.installation_id
  where d.id = p_delivery;
$$;

create function block_notification_destination(p_destination uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chat_assert_job();
  update public.notification_destinations
    set state = 'blocked', blocked_reason = p_reason, updated_at = now()
    where id = p_destination and state = 'active';
end $$;

revoke execute on function chat_assert_job(), list_chat_scan_targets(), claim_chat_callback_receipts(int, timestamptz),
  complete_chat_callback_receipt(uuid, text, text), get_chat_home_items(uuid, text), get_chat_delivery_context(uuid),
  block_notification_destination(uuid, text)
  from public, anon, authenticated;
grant execute on function list_chat_scan_targets(), claim_chat_callback_receipts(int, timestamptz),
  complete_chat_callback_receipt(uuid, text, text), get_chat_home_items(uuid, text), get_chat_delivery_context(uuid),
  block_notification_destination(uuid, text)
  to service_role;
-- ---------------------------------------------------------------- immutability grants
revoke update, delete on recipe_versions, recipe_ingredients from authenticated, anon;
revoke update, delete on pos_sales from authenticated, anon;
grant update (movement_id) on pos_sales to authenticated;
-- The existing staff insert policies are effective only with these bounded DML grants.
grant select, insert on material_movements, keg_events to authenticated;

-- Availability badge tiers for portal customers: coarse tiers only, never raw
-- quantities (spec 1B decision 7). security definer on purpose — customers
-- cannot read the ledger; the where-clause pins the caller to their own account.
create function portal_availability(p_customer uuid) returns table (sku_id uuid, badge text)
language sql stable security definer set search_path = '' as $$
  select a.sku_id, case when a.qty <= 0 then 'out' when a.qty < 20 then 'low' else 'in' end
  from public.atp a
  join public.customers c on c.brewery_id = a.brewery_id
  where c.id = p_customer and c.id in (select public.my_customer_ids());
$$;
-- ponytail: fixed low-stock threshold, per-brewery setting when someone asks

-- ---------------------------------------------------------------- definer functions: never callable by anon
-- These bypass RLS; only logged-in users (and policies evaluated as them) may run them.
revoke execute on function my_brewery_ids(), my_customer_ids(), is_staff_of(uuid), staff_role(uuid), portal_availability(uuid)
  from public, anon;
grant execute on function my_brewery_ids(), my_customer_ids(), is_staff_of(uuid), staff_role(uuid), portal_availability(uuid)
  to authenticated;
-- Document counters advance only inside the owner-run set_doc_no trigger.
revoke execute on function next_no(uuid, text), set_doc_no() from public, anon, authenticated;

-- Token RPCs are a server-only escape hatch. The service-role grant appears
-- with the explicit ACL catalog below; no browser role ever receives EXECUTE.
revoke execute on function public.store_integration_tokens(uuid, text, uuid, uuid, text, text),
  public.read_integration_tokens(uuid, text, uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- explicit Data API ACLs
-- RLS decides which rows a signed-in caller may see. These ACLs separately
-- define which public objects the Data API can reach: no anonymous MGR surface,
-- read-only authenticated query access plus the DML each invoker RPC needs, and
-- server-only service-role administration.
revoke all on schema public from public, anon, authenticated, service_role;
revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema public from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated, service_role;
-- `supabase_admin` is a reserved platform role. Its bootstrap defaults are
-- owned by `auto_expose_new_tables = false`; migrations must not escalate into
-- that role to alter them.

grant usage on schema public to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant insert on allocations, customers, inventory_movements, invoice_lines, invoices, locations, order_events,
  order_lines, orders, price_list_items, price_lists, products, ship_tos, shipments, skus, taproom_pars
  to authenticated;
grant update on allocations, breweries, customers, order_lines, orders, price_list_items, price_lists, ship_tos, taproom_pars
  to authenticated;
grant delete on order_lines to authenticated;

grant select on all tables in schema public to service_role;
do $$
declare t text;
begin
  for t in select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' loop
    execute format('grant insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select, update on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- Pin the service-only credential RPCs even though service_role also receives
-- the catalogued public function surface above.
grant execute on function public.store_integration_tokens(uuid, text, uuid, uuid, text, text),
  public.read_integration_tokens(uuid, text, uuid, uuid)
  to service_role;

-- Every authenticated EXECUTE grant is either a Data API RPC, an RLS
-- predicate helper, or a direct invoker-call dependency of an RPC.
grant execute on function
  my_brewery_ids(),
  is_staff_of(uuid),
  staff_role(uuid),
  my_customer_ids(),
  is_authorized_staff_rpc(uuid, text, public.staff_role[]),
  require_authorized_staff_rpc(uuid, text, public.staff_role[]),
  create_product(uuid, text, text, numeric),
  create_sku(uuid, uuid, text, public.package_type, integer, numeric),
  create_location(uuid, text, public.location_kind),
  upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text),
  upsert_ship_to(uuid, uuid, uuid, text, text, text, text, text, text),
  upsert_price_list(uuid, uuid, text),
  set_price(uuid, uuid, uuid, integer),
  record_movement(uuid, uuid, uuid, numeric, public.movement_type, public.sale_channel, text, text),
  set_taproom_par(uuid, uuid, uuid, numeric),
  order_line_price(uuid, uuid, uuid),
  set_portal_fulfillment_source(uuid, uuid),
  portal_create_order(uuid, text, text, jsonb),
  portal_update_draft_order(uuid, uuid, text, text, jsonb),
  portal_submit_order(uuid),
  create_order(uuid, public.order_kind, uuid, uuid, uuid, uuid, date, text, text, jsonb),
  lock_order(uuid, public.order_status[]),
  update_draft_order(uuid, uuid, date, text, text, jsonb),
  submit_order(uuid),
  confirm_order(uuid),
  adjust_order_lines(uuid, jsonb, text),
  cancel_order(uuid, text),
  record_pick(uuid, jsonb),
  ship_order(uuid, jsonb, text, text),
  create_credit_memo(uuid, jsonb, uuid, text),
  set_standing_allocation(uuid, uuid, numeric),
  create_replenishment_order(uuid, uuid, jsonb),
  portal_availability(uuid)
  to authenticated;

-- ---------------------------------------------------------------- chat Data API ACLs
-- Re-applied after the blanket revoke above. Chat configuration stays
-- read-bounded: installations expose health columns only; occurrences,
-- deliveries, callback receipts and action intents are server-only.
revoke all on chat_installations, chat_user_links, notification_destinations, notification_preferences,
  notification_occurrences, notification_deliveries, chat_callback_receipts, chat_action_intents
  from authenticated;
grant select (id, brewery_id, provider, display_label, state, installed_at, disabled_at, disconnected_at,
  last_health_checked_at, last_healthy_at, last_failure_code, created_at, updated_at)
  on chat_installations to authenticated;
grant select on chat_user_links, notification_destinations, notification_preferences to authenticated;
grant execute on function
  begin_chat_installation(uuid, text, text, text),
  begin_chat_reauthorization(uuid, text, text),
  find_chat_oauth_intent(text),
  activate_chat_installation(uuid, text, text, text, text, text, text, jsonb),
  mark_chat_installation_reauthorization(uuid, text),
  disable_chat_installation(uuid),
  disconnect_chat_installation(uuid),
  reconcile_chat_installation(uuid, boolean, text),
  consume_chat_link_proof(text),
  unlink_chat_user(uuid),
  today_live_reasons(),
  get_today_items(uuid, timestamptz),
  record_submitted_order_occurrence(uuid),
  set_notification_preference(uuid, text, boolean, time, time, text),
  set_notification_destination(uuid, text),
  set_brewery_quiet_hours(uuid, time, time)
  to authenticated;

-- ---------------------------------------------------------------- private Chat SDK state
drop role if exists mgr_chat_sdk;
create role mgr_chat_sdk nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

-- The migration executor temporarily joins the group to transfer table ownership.
grant mgr_chat_sdk to postgres;

create schema chat_sdk;
revoke all on schema chat_sdk from public;
grant create on schema chat_sdk to mgr_chat_sdk;
grant usage on schema chat_sdk to mgr_chat_sdk;

create table chat_sdk.chat_state_subscriptions (
  key_prefix text not null,
  thread_id text not null,
  created_at timestamptz not null default now(),
  primary key (key_prefix, thread_id)
);

create table chat_sdk.chat_state_locks (
  key_prefix text not null,
  thread_id text not null,
  token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (key_prefix, thread_id)
);
create index chat_state_locks_expires_idx on chat_sdk.chat_state_locks (expires_at);

create table chat_sdk.chat_state_cache (
  key_prefix text not null,
  cache_key text not null,
  value text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (key_prefix, cache_key)
);
create index chat_state_cache_expires_idx on chat_sdk.chat_state_cache (expires_at);

create table chat_sdk.chat_state_lists (
  key_prefix text not null,
  list_key text not null,
  seq bigserial not null,
  value text not null,
  expires_at timestamptz,
  primary key (key_prefix, list_key, seq)
);
create index chat_state_lists_expires_idx on chat_sdk.chat_state_lists (expires_at);

create table chat_sdk.chat_state_queues (
  key_prefix text not null,
  thread_id text not null,
  seq bigserial not null,
  value text not null,
  expires_at timestamptz not null,
  primary key (key_prefix, thread_id, seq)
);
create index chat_state_queues_expires_idx on chat_sdk.chat_state_queues (expires_at);

-- The adapter idempotently creates these indexes at connection time, which
-- PostgreSQL permits only for the table owner.
alter table chat_sdk.chat_state_subscriptions owner to mgr_chat_sdk;
alter table chat_sdk.chat_state_locks owner to mgr_chat_sdk;
alter table chat_sdk.chat_state_cache owner to mgr_chat_sdk;
alter table chat_sdk.chat_state_lists owner to mgr_chat_sdk;
alter table chat_sdk.chat_state_queues owner to mgr_chat_sdk;

revoke mgr_chat_sdk from postgres;

grant select, insert, update, delete on all tables in schema chat_sdk to mgr_chat_sdk;
grant usage, select on all sequences in schema chat_sdk to mgr_chat_sdk;
alter default privileges in schema chat_sdk
  grant select, insert, update, delete on tables to mgr_chat_sdk;
alter default privileges in schema chat_sdk
  grant usage, select on sequences to mgr_chat_sdk;

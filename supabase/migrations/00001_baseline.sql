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

create schema if not exists extensions;
create schema if not exists private;

-- New objects stay private until the explicit grants at the end of this file.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension btree_gist set schema extensions;
alter extension pgcrypto set schema extensions;

-- UUID generation is an implementation detail of privileged writes, not Data API surface.
create function private.new_uuid() returns uuid
language sql volatile set search_path = '' as $$
  select extensions.gen_random_uuid()
$$;

-- ---------------------------------------------------------------- enums
create type staff_role as enum ('admin','sales','warehouse','brewer');
create type customer_type as enum ('distributor','retailer','brewery','other');
create type package_type as enum ('keg','can','bottle');
create type format_basis as enum ('packaged','poured');
create type keg_size as enum ('half_bbl','quarter_bbl','sixth_bbl','fifty_l','thirty_l','twenty_l');
create type keg_container_source as enum ('owned_fleet','per_fill_rental','one_way_material');
create type location_kind as enum ('warehouse','taproom','storage');
create type movement_type as enum
  ('opening_balance','production_in','adjustment','sale_removal','taproom_transfer',
   'depletion','return_in','destruction','loss','sample','festival_removal','location_transfer','repack');
-- TTB removal tax treatment (§16.3). `taxable` is a taxpaid removal; the rest
-- are the removals-without-payment-of-tax vocabulary. A sale channel carries a
-- default, a customer may override it, and the resolved value is frozen onto
-- the movement so a filed month is never restated by a later edit.
create type tax_treatment as enum ('taxable','export','vessel_supplies','research','transfer_in_bond');
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
  ('opening_balance','receipt','consumption','return_to_stock','loss','adjustment','count_adjustment','transfer_out','transfer_in');
create type po_status as enum ('draft','sent','partially_received','received','cancelled');
create type ingredient_stage as enum ('mash','boil','whirlpool','fermentation','dry_hop','packaging','other');
create type vessel_kind as enum ('fermenter','brite','barrel','kettle','other');
create type volume_adjustment_reason as enum ('loss','dump','gain','measurement');
create type keg_pool_kind as enum ('owned','leased','pay_per_fill');
create type keg_event_reason as enum ('acquired','retired','shipped','returned','lost','found','transferred_out','transferred_in');
create type stock_transfer_status as enum ('draft','submitted','picked','in_transit','received','cancelled');
create type approval_kind as enum ('cola','formula');

-- ---------------------------------------------------------------- core
create table breweries (
  id uuid primary key default private.new_uuid(),
  name text not null,
  ttb_registry_no text,
  pa_license_no text,
  timezone text not null default 'America/New_York',
  settings jsonb not null default '{}',
  fermentation_reading_due_hours int not null default 24 check (fermentation_reading_due_hours between 1 and 168),
  -- the number the portal prints when online payment is unavailable (Program 10 task 4)
  customer_phone text,
  gravity_unit text not null default 'plato' check (gravity_unit in ('plato','sg')),
  created_at timestamptz not null default now()
);
comment on column breweries.settings is 'staff-only; never store secrets here';
comment on column breweries.gravity_unit is
  'display only: how this brewery reads and types gravity by default. Gravity is STORED in degrees Plato everywhere (fermentation_readings.gravity_plato, recipe predictions); this never changes a stored number. A member may override it on brewery_users.gravity_unit.';

create table brewery_users (
  brewery_id uuid not null references breweries(id),
  user_id uuid not null references auth.users(id),
  role staff_role not null,
  gravity_unit text check (gravity_unit in ('plato','sg')),
  created_at timestamptz not null default now(),
  primary key (brewery_id, user_id)
);
comment on column brewery_users.gravity_unit is
  'display only, and null means "use the brewery default" (breweries.gravity_unit). Storage stays degrees Plato regardless.';

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
  check (key in ('batch', 'run', 'po', 'order', 'invoice', 'transfer'))   -- the committed document kinds
);
create function private.next_no(b uuid, k text) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.brewery_counters (brewery_id, key, next) values (b, k, 2)
  on conflict (brewery_id, key) do update set next = brewery_counters.next + 1
  returning next - 1
$$;
-- Trigger-only document numbering remains private so application roles cannot consume numbers.
create function private.set_doc_no() returns trigger language plpgsql security definer set search_path = '' as $$
declare col text := tg_argv[0]; k text := tg_argv[1]; cur bigint;
begin
  execute format('select ($1).%I', col) into cur using new;
  if cur is null then
    new := jsonb_populate_record(new, jsonb_build_object(col, private.next_no(new.brewery_id, k)));
  end if;
  return new;
end $$;

create table customers (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  type customer_type not null default 'retailer',
  license_no text,
  state text not null check (state ~ '^[A-Z]{2}$'),   -- home state
  sale_channel_id uuid not null,                       -- FK added after sale_channels
  qbo_customer_id text,
  payment_terms text not null default 'net30',
  -- null = inherit the sale channel's default tax treatment (§16.3).
  tax_treatment tax_treatment,
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  customer_id uuid not null,
  label text not null,
  address1 text not null, address2 text, city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),   -- drives dest_state on removals
  zip text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (id, customer_id, brewery_id),                -- lets orders pin a ship-to to its customer
  foreign key (customer_id, brewery_id) references customers (id, brewery_id)
);
create index ship_tos_customer_idx on ship_tos (customer_id);
create unique index ship_tos_one_default on ship_tos (brewery_id, customer_id) where is_default;

-- ---------------------------------------------------------------- materials (definitions)
create table vendors (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  contact_name text, email text, phone text, address text,
  payment_terms text not null default 'net30',
  lead_time_days int check (lead_time_days >= 0),      -- per vendor, not per material (spec 2026-09-07 §3): the only dates that can check it are keyed by the PO's vendor
  qbo_vendor_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name)
);

create table materials (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  category material_category not null,
  base_uom uom not null,
  purchase_uom uom not null,
  purchase_uom_factor numeric(14,6) not null default 1 check (purchase_uom_factor > 0), -- base units per purchase unit
  lot_tracked boolean not null default false,
  default_vendor_id uuid,                              -- Planning drafts to the active contract's vendor, else this one, else "no vendor"
  reorder_point numeric(14,4),                          -- base uom
  extract_potential numeric,                             -- SG-style potential, e.g. 1.037 = 37 PPG (lib/recipe-gravity.ts)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  foreign key (default_vendor_id, brewery_id) references vendors (id, brewery_id)
);

create table material_lots (
  id uuid primary key default private.new_uuid(),
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
-- The brewery's own style list (Brand screen: a picker; typing a new one
-- offers Add and the brand save creates it). No separate styles screen.
create table styles (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  unique (id, brewery_id),
  unique (brewery_id, name)
);

-- A row of the price grid (specs/2026-09-07-mgr-pricing-grid-naming.md): the
-- brands that sit on it all price alike, cell by cell, in channel_prices below.
create table price_groups (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  position int not null,
  cost_ceiling_cents int check (cost_ceiling_cents >= 0),   -- suggests a group once costing exists (#189 D7); never assigns
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  unique (brewery_id, position)
);
create index price_groups_brewery_idx on price_groups (brewery_id, position);

-- A brand is the sellable identity (§16.1); a batch is a production instance.
-- description, category and hops are optional facts drawn on the Brand screen.
-- price_group_id is the row of the price grid this beer sits on
-- (specs/2026-09-07-mgr-pricing-grid-naming.md); null means unpriced everywhere.
create table brands (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  style_id uuid,
  abv numeric(4,2),
  ttb_tax_class text not null default 'beer',
  description text,
  category text,
  price_group_id uuid,
  hops text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  foreign key (style_id, brewery_id) references styles (id, brewery_id),
  foreign key (price_group_id, brewery_id) references price_groups (id, brewery_id)
);

-- The sellable shape (§16.2): the only place bbl_per_unit is typed. packaged
-- holds stock (what a bin holds, what a SKU is); poured never does, it is a
-- ratio back to the keg it is drawn from. Atomic formats carry a volume;
-- composed ones derive it from format_components (§16.2a).
create table formats (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  basis format_basis not null,
  package_type package_type,                -- container; null for poured
  keg_size keg_size,
  units_per_case int check (units_per_case > 0),
  bbl_per_unit numeric(12,8) check (bbl_per_unit > 0),   -- atomic packaged only
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  check (basis = 'packaged' or (bbl_per_unit is null and package_type is null and keg_size is null and units_per_case is null)),
  check (package_type = 'keg' or keg_size is null)
);
create index formats_brewery_idx on formats (brewery_id, basis);

-- Formats compose one level (§16.2a): a case is six four-packs. Only atomic
-- formats carry a typed volume; a composed one derives it (format_volumes).
create table format_components (
  brewery_id uuid not null references breweries(id),
  parent_format_id uuid not null,
  child_format_id uuid not null,
  qty numeric(12,6) not null check (qty > 0),
  primary key (parent_format_id, child_format_id),
  foreign key (parent_format_id, brewery_id) references formats (id, brewery_id),
  foreign key (child_format_id, brewery_id) references formats (id, brewery_id),
  check (parent_format_id <> child_format_id)
);
create index format_components_brewery_idx on format_components (brewery_id, parent_format_id);

-- bbl_per_unit for every format: typed on an atomic one, summed from the
-- children of a composed one. Null means the format cannot yet hold stock.
create view format_volumes with (security_invoker = true) as
  select f.id, f.brewery_id, f.name, f.basis,
         coalesce(f.bbl_per_unit,
                  (select sum(c.qty * cf.bbl_per_unit) from format_components c join formats cf on cf.id = c.child_format_id
                    where c.parent_format_id = f.id)) as bbl_per_unit,
         exists (select 1 from format_components c where c.parent_format_id = f.id) as composed
  from formats f;

create table keg_pools (
  id uuid primary key default private.new_uuid(),
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

-- A SKU is exactly one brand × one packaged format (§16.2): the stable id
-- inventory, orders, pricing and provider mappings hang off. Package facts and
-- bbl_per_unit live on the format. ponytail: name is stored, filled by
-- create_sku from brand and format; a rename of either does not rewrite it.
create table skus (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  brand_id uuid not null,
  format_id uuid not null,
  name text not null,
  upc text,
  container_source keg_container_source,
  keg_pool_id uuid,
  qbo_item_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brand_id, format_id),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id),
  foreign key (format_id, brewery_id) references formats (id, brewery_id),
  foreign key (keg_pool_id, brewery_id) references keg_pools (id, brewery_id),
  check ((coalesce(container_source in ('owned_fleet','per_fill_rental'), false)) = (keg_pool_id is not null))
);
create index skus_brewery_idx on skus (brewery_id, brand_id);
create unique index skus_upc_uidx on skus (brewery_id, upc) where upc is not null;

-- Packaging BOM: materials consumed per single SKU unit (incl. one-way kegs).
-- Packaging BOM belongs to the format, not the SKU (§16.12): a case tray is
-- the same for every brand packed in that case. on_break says what happens
-- to the material when a composed unit is broken open (§16.10).
create type format_material_disposition as enum ('consumed','return_to_stock');
create table format_bom (
  brewery_id uuid not null references breweries(id),
  format_id uuid not null,
  material_id uuid not null,
  qty_per_unit numeric(14,6) not null check (qty_per_unit > 0),   -- material base uom
  on_break format_material_disposition not null default 'consumed',
  primary key (format_id, material_id),
  foreign key (format_id, brewery_id) references formats (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id)
);
create index format_bom_material_idx on format_bom (material_id);

-- ---------------------------------------------------------------- FG ledger
create table locations (
  id uuid primary key default private.new_uuid(),
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

-- Physical subdivisions of a location (spec 2026-09-06 Decision 1; §16.6). Every
-- location is seeded with three inside create_location and can never drop below
-- one (delete_bin). Ledger rows reach a bin through (bin_id, location_id,
-- brewery_id) so a bin can only ever be filed under its own location.
create table bins (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (location_id, name),
  unique (id, location_id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id)
);
create index bins_brewery_idx on bins (brewery_id, location_id);

-- Sale channels (§16.3, docs/plans/sale-channels-customizable.md): a per-brewery
-- lookup modelled on `locations`, replacing the old `sale_channel` enum so a
-- brewery names its own channels. `tax_treatment` is the channel default; a
-- customer may override it. Movements reference a channel with `on delete
-- restrict`, so "removable only if unused" is enforced by Postgres.
create table sale_channels (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  tax_treatment tax_treatment not null default 'taxable',
  unique (id, brewery_id),
  unique (brewery_id, name)
);
create index sale_channels_brewery_idx on sale_channels (brewery_id);

-- Every brewery is born with the four defaults. A trigger rather than a
-- creation path because rows arrive from seed scripts, onboarding and every
-- test fixture; one trigger covers all of them.
create function private.seed_sale_channels() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sale_channels (brewery_id, name, tax_treatment) values
    (new.id, 'Wholesale', 'taxable'),
    (new.id, 'Taproom',   'taxable'),
    (new.id, 'DTC',       'taxable'),
    (new.id, 'Export',    'export');
  return new;
end $$;

create trigger seed_sale_channels_on_brewery
  after insert on breweries for each row execute function private.seed_sale_channels();

-- Deferred from customers above: the channel must belong to the customer's
-- brewery, structurally, and cannot be deleted while a customer sits on it.
-- (Customers are created before channels in this file; the seed trigger above
-- guarantees every brewery has a Wholesale row before any customer exists.)
alter table customers add constraint customers_sale_channel_fk
  foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict;

-- The price grid (specs/2026-09-07-mgr-pricing-grid-naming.md): one cell per
-- sale channel × price group × format. A SKU's price on a channel is the cell at
-- its brand's group and its format; no other table prices anything.
create table channel_prices (
  brewery_id uuid not null references breweries(id),
  sale_channel_id uuid not null,
  price_group_id uuid not null,
  format_id uuid not null,
  unit_price_cents int not null check (unit_price_cents >= 0),
  primary key (sale_channel_id, price_group_id, format_id),
  foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict,
  foreign key (price_group_id, brewery_id) references price_groups (id, brewery_id) on delete restrict,
  foreign key (format_id, brewery_id) references formats (id, brewery_id) on delete restrict
);
create index channel_prices_brewery_idx on channel_prices (brewery_id, sale_channel_id);

create view sku_prices with (security_invoker = true) as
  select s.brewery_id, cp.sale_channel_id, s.id as sku_id, s.name as sku_name, b.name as brand_name, s.active, cp.unit_price_cents
  from skus s
  join brands b on b.id = s.brand_id
  join channel_prices cp on cp.brewery_id = s.brewery_id and cp.price_group_id = b.price_group_id and cp.format_id = s.format_id;

create table inventory_movements (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null,
  location_id uuid not null,
  bin_id uuid not null,
  qty numeric(12,2) not null check (qty <> 0),   -- signed units
  bbl numeric(14,8) not null,                    -- qty * bbl_per_unit, frozen at write time (trigger)
  type movement_type not null,
  sale_channel_id uuid,
  -- resolved at write time (customer override -> channel default) and frozen.
  tax_treatment tax_treatment,
  dest_state text,
  lot_id uuid,                                   -- FK to lots added below
  source_movement_id uuid,                       -- exact shipped return / damaged-return provenance
  ref uuid,                                      -- order_id / pos_sale id / run id
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (source_movement_id, brewery_id) references inventory_movements (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  -- the bin must be one of this location's bins, structurally (spec 2026-09-06 Decision 1)
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id),
  -- the channel must belong to this movement's brewery, structurally; restrict
  -- so a referenced channel cannot be deleted out from under the ledger.
  foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict,
  -- removals must be negative and classified; inflows positive.
  constraint removal_shape check (
    case type
      when 'sale_removal' then qty < 0 and sale_channel_id is not null and dest_state is not null and tax_treatment is not null
      when 'depletion'    then qty < 0 and sale_channel_id is not null and dest_state is null and tax_treatment is not null
      when 'destruction'      then qty < 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'loss'             then qty < 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'sample'           then qty < 0 and dest_state is not null
      when 'festival_removal' then qty < 0 and dest_state is not null
      when 'opening_balance'  then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'production_in'    then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'return_in'        then qty > 0 and sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'adjustment'       then sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'taproom_transfer' then sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'location_transfer' then sale_channel_id is null and dest_state is null and tax_treatment is null
      when 'repack'           then sale_channel_id is null and dest_state is null and tax_treatment is null
      else true
    end)
);
create index movements_onhand_idx on inventory_movements (brewery_id, sku_id, location_id, bin_id);
create index movements_source_idx on inventory_movements (brewery_id, source_movement_id) where source_movement_id is not null;
create index movements_created_idx on inventory_movements (brewery_id, created_at);
create index movements_lot_idx on inventory_movements (lot_id) where lot_id is not null;

create function enforce_bbl_integrity() returns trigger language plpgsql set search_path = '' as $$
declare original public.inventory_movements; returned_qty numeric; returned_bbl numeric;
begin
  if new.source_movement_id is not null then
    select * into original from public.inventory_movements where id = new.source_movement_id and brewery_id = new.brewery_id;
    if original.id is null or original.sku_id <> new.sku_id or original.lot_id is distinct from new.lot_id
       or not ((new.type = 'return_in' and original.type = 'sale_removal' and new.qty > 0 and new.qty <= -original.qty)
            or (new.type = 'loss' and original.type = 'return_in' and new.qty = -original.qty and new.ref = original.ref)) then
      raise exception 'invalid movement compensation source';
    end if;
    -- The original volume is a frozen fact, even after a format is edited.
    if new.type = 'return_in' then
      select coalesce(sum(qty),0), coalesce(sum(bbl),0) into returned_qty, returned_bbl from public.inventory_movements
        where brewery_id = new.brewery_id and source_movement_id = original.id and type = 'return_in';
      if returned_qty + new.qty > -original.qty then raise exception 'return exceeds original shipment'; end if;
      new.bbl := round(original.bbl * (returned_qty + new.qty) / original.qty, 8) - returned_bbl;
    else
      new.bbl := -original.bbl;
    end if;
    return new;
  end if;
  select (new.qty * f.bbl_per_unit) into new.bbl
    from public.skus s join public.format_volumes f on f.id = s.format_id where s.id = new.sku_id;
  if new.bbl is null then raise exception 'format has no bbl_per_unit'; end if;
  return new;
end $$;
create trigger inventory_movements_bbl_trigger before insert on inventory_movements
  for each row execute function enforce_bbl_integrity();

create table allocations (
  id uuid primary key default private.new_uuid(),
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
-- One open standing taproom allocation per (location, sku).
create unique index allocations_standing_open_uidx on allocations (ref, sku_id)
  where source = 'taproom_standing' and status = 'open';

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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  brand_id uuid,
  name text not null,
  note text,
  -- Optional pre-fill for the brand a batch packages into (#189 D6). Never a
  -- commitment: on delete set null so a group can go away without blocking.
  default_price_group_id uuid,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, name),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id),
  foreign key (default_price_group_id, brewery_id) references price_groups (id, brewery_id) on delete set null
);

create table recipe_versions (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  recipe_id uuid not null,
  version int not null,
  target_ibu numeric(5,1),                               -- °Plato/ABV targets dropped: lib/recipe-gravity.ts predicts OG/FG/ABV from the assumptions below
  mash_temp_f numeric, brewhouse_efficiency numeric, yeast_attenuation numeric, -- efficiency/attenuation are fractions (0.75), not percents; recipeGravity's inputs
  boil_minutes int,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (recipe_id, version),
  foreign key (recipe_id, brewery_id) references recipes (id, brewery_id)
);

create table recipe_ingredients (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  recipe_version_id uuid not null,
  material_id uuid not null,
  per_bbl_qty numeric(14,6) not null check (per_bbl_qty > 0),   -- base uom per bbl; scaled at brew time
  stage ingredient_stage not null,
  timing_minutes int,
  sort int not null default 0,
  extract_snapshot numeric,                              -- materials.extract_potential at recipe-version save time (lib/recipe-gravity.ts)
  unique (id, brewery_id),
  foreign key (recipe_version_id, brewery_id) references recipe_versions (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id)
);
create index recipe_ingredients_version_idx on recipe_ingredients (recipe_version_id);
create index recipe_ingredients_material_idx on recipe_ingredients (material_id);

-- ---------------------------------------------------------------- production
create table vessels (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  batch_no bigint,                                     -- trigger
  intended_brand_id uuid,                              -- intent, not a commitment (§16.9): identity is required at packaging
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
  foreign key (intended_brand_id, brewery_id) references brands (id, brewery_id),
  foreign key (recipe_version_id, brewery_id) references recipe_versions (id, brewery_id)
);
create index batches_planned_idx on batches (brewery_id, planned_on);
create index batches_brand_idx on batches (brewery_id, intended_brand_id);
create trigger batches_no before insert on batches for each row execute function private.set_doc_no('batch_no','batch');

create table vessel_occupancies (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  material_id uuid not null,
  location_id uuid not null,                           -- materials are per site (spec 2026-09-06 Decision 2)
  bin_id uuid not null,
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
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id),
  constraint material_sign check (
    case type
      when 'receipt'         then qty > 0
      when 'opening_balance' then qty > 0
      when 'return_to_stock' then qty > 0
      when 'consumption'     then qty < 0
      when 'loss'            then qty < 0
      when 'transfer_out'    then qty < 0
      when 'transfer_in'     then qty > 0
      else true
    end)
);
create index material_movements_material_idx on material_movements (brewery_id, material_id);
create index material_movements_lot_idx on material_movements (brewery_id, material_id, lot_id) where lot_id is not null;
create index material_movements_created_idx on material_movements (brewery_id, created_at);
create index material_movements_onhand_idx on material_movements (brewery_id, material_id, location_id, bin_id);

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
  id uuid primary key default private.new_uuid(),
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
-- A run is planned against a brand ("600 cans of Stout on Friday") days before
-- anyone knows which tank it comes out of, so brand_id is required and
-- occupancy_id is not. The check is the promotion gate: a run may sit
-- brand-only for as long as it likes, but the moment it starts (or closes) it
-- must name the tank it drew from, because bbl_drawn is subtracted from that
-- occupancy in occupancy_volumes.
create table packaging_runs (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  run_no bigint,                                       -- trigger
  brand_id uuid not null,                              -- what is being packaged, known first
  occupancy_id uuid,                                   -- the one source occupancy, once picked
  planned_on date not null,
  started_at timestamptz,
  closed_at timestamptz,
  bbl_drawn numeric(10,3) check (bbl_drawn >= 0),      -- recorded at close
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, run_no),
  check ((started_at is null and closed_at is null) or occupancy_id is not null),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id),
  foreign key (occupancy_id, brewery_id) references vessel_occupancies (id, brewery_id)
);
create index packaging_runs_planned_idx on packaging_runs (brewery_id, planned_on);
create index packaging_runs_occ_idx on packaging_runs (occupancy_id);
create index packaging_runs_brand_idx on packaging_runs (brewery_id, brand_id);
create trigger packaging_runs_no before insert on packaging_runs for each row execute function private.set_doc_no('run_no','run');

-- Picking the tank is where brand identity is checked, not written. A batch
-- that already intends a brand may only be packaged as that brand; a batch
-- with no intended brand is fair game, and stays unbranded -- promoting the
-- run's brand onto the batch would silently decide something the brewer did
-- not. The occupancy must also be this brewery's: the composite FK above
-- catches that too, but a trigger reading across tenants deserves its own say.
create function enforce_packaging_run_brand() returns trigger language plpgsql set search_path = '' as $$
declare v_brewery uuid; v_intended uuid;
begin
  if new.occupancy_id is null then return new; end if;
  select o.brewery_id, b.intended_brand_id into v_brewery, v_intended
  from public.vessel_occupancies o join public.batches b on b.id = o.batch_id
  where o.id = new.occupancy_id;
  if v_brewery is null or v_brewery <> new.brewery_id then
    raise exception 'occupancy not found';
  end if;
  if v_intended is not null and v_intended <> new.brand_id then
    raise exception 'packaging run brand does not match the tank''s batch brand';
  end if;
  return new;
end $$;
create trigger packaging_runs_brand before insert or update of occupancy_id on packaging_runs
  for each row execute function enforce_packaging_run_brand();

create table lots (   -- 1:1 with packaging runs
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  packaging_run_id uuid not null unique,
  brand_id uuid not null,
  code text not null,
  packaged_on date not null,
  best_by date,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, code),
  foreign key (packaging_run_id, brewery_id) references packaging_runs (id, brewery_id),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id)
);
alter table inventory_movements add constraint inventory_movements_lot_fk
  foreign key (lot_id, brewery_id) references lots (id, brewery_id);

create table packaging_run_outputs (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  run_id uuid not null,
  movement_id uuid not null unique,                    -- consumption / return_to_stock / loss
  foreign key (run_id, brewery_id) references packaging_runs (id, brewery_id),
  foreign key (movement_id, brewery_id) references material_movements (id, brewery_id)
);
create index packaging_run_consumptions_run_idx on packaging_run_consumptions (run_id);

-- ---------------------------------------------------------------- purchasing
create table material_contracts (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  po_no bigint,                                        -- trigger
  vendor_id uuid not null,
  status po_status not null default 'draft',
  ordered_on date, expected_on date,
  -- How the PO left the building (spec 2026-09-07 §1): a property of the send,
  -- never a fork in status. mailto/external are attestations ("Marked sent by …");
  -- 'direct' (MGR sends the mail) is not a legal value until a provider is approved.
  sent_via text check (sent_via in ('mailto','external')),
  sent_by uuid references auth.users(id),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, po_no),
  check (status <> 'draft' or sent_via is null),                              -- a draft was never sent
  check (status not in ('sent','partially_received','received') or sent_via is not null),  -- a sent PO says how
  foreign key (vendor_id, brewery_id) references vendors (id, brewery_id)
);
create index purchase_orders_status_idx on purchase_orders (brewery_id, status, expected_on);
create trigger purchase_orders_no before insert on purchase_orders for each row execute function private.set_doc_no('po_no','po');

create table purchase_order_lines (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  po_id uuid not null,
  material_id uuid not null,
  qty_ordered numeric(14,4) not null check (qty_ordered > 0),     -- purchase uom
  unit_cost_cents int check (unit_cost_cents >= 0),
  contract_id uuid,
  -- The lot the vendor named at order time (a contracted hop lot, a crop year).
  -- Advisory: it creates no material_lots row. Receiving prefills from it, and
  -- what the receiver reads off the package is what creates the lot.
  expected_lot_code text,
  unique (id, brewery_id),
  foreign key (po_id, brewery_id) references purchase_orders (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (contract_id, brewery_id) references material_contracts (id, brewery_id)
);
create index po_lines_po_idx on purchase_order_lines (po_id);
create index po_lines_material_idx on purchase_order_lines (material_id);
create index po_lines_contract_idx on purchase_order_lines (contract_id) where contract_id is not null;

create table receipts (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
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

-- What a PO line still owes (spec 2026-09-07 §2): derived from counted
-- receipts, never stored, and the one place that derivation lives — PO status,
-- material on order and contract drawdown all read it. Purchase uom.
create view po_open_balances with (security_invoker = true) as
  select l.brewery_id, l.po_id, l.id as po_line_id, l.material_id, l.contract_id, l.qty_ordered,
         coalesce(r.counted, 0) as qty_received,
         greatest(l.qty_ordered - coalesce(r.counted, 0), 0) as qty_open
  from purchase_order_lines l
  left join lateral (select sum(qty_counted) counted from receipt_lines rl where rl.po_line_id = l.id) r on true;

-- Derive PO received / partially_received from counted receipts. A PO with no
-- lines derives NULL (bool_and over zero rows), not partially_received: the
-- trigger then leaves the status alone (spec 2026-09-07 §2).
create function private.po_receipt_status(p_po uuid) returns public.po_status
language sql stable set search_path = '' as $$
  select case bool_and(qty_open = 0)
           when true then 'received'::public.po_status
           when false then 'partially_received'::public.po_status
         end
  from public.po_open_balances where po_id = p_po
$$;

create function update_po_status() returns trigger language plpgsql set search_path = '' as $$
declare po uuid; v_status public.po_status;
begin
  select po_id into po from public.purchase_order_lines where id = new.po_line_id;
  v_status := private.po_receipt_status(po);
  if v_status is null then return null; end if;
  update public.purchase_orders set status = v_status
    where id = po and status in ('draft','sent','partially_received');
  return null;
end $$;
create trigger receipt_lines_po_status after insert on receipt_lines
  for each row execute function update_po_status();

-- A count is taken at one bin: on-hand is compared and adjusted there.
create table material_counts (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  bin_id uuid not null,
  counted_on date not null default current_date,
  counted_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id)
);

create table material_count_lines (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  count_id uuid not null,
  material_id uuid not null,
  lot_id uuid,
  qty_expected numeric(14,4) not null,                 -- on-hand snapshot at count time (the lot's share when lot_id is set)
  qty_counted numeric(14,4) not null check (qty_counted >= 0),
  movement_id uuid unique,                             -- count_adjustment; null when no variance. A variance split across lots is one line per lot.
  foreign key (count_id, brewery_id) references material_counts (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (lot_id, material_id, brewery_id) references material_lots (id, material_id, brewery_id),
  foreign key (movement_id, brewery_id) references material_movements (id, brewery_id)
);
create index material_count_lines_count_idx on material_count_lines (count_id);
create index material_count_lines_material_idx on material_count_lines (material_id);

-- ---------------------------------------------------------------- orders, shipments, invoices
create table orders (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  order_no bigint,                                     -- trigger
  kind order_kind not null default 'wholesale',
  status order_status not null default 'draft',
  customer_id uuid,
  ship_to_id uuid,
  from_location_id uuid not null,                      -- where removals post
  to_location_id uuid,                                 -- taproom transfers
  sale_channel_id uuid not null,                       -- copied from the customer at creation; removals post to it
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
  foreign key (sale_channel_id, brewery_id) references sale_channels (id, brewery_id) on delete restrict,
  check (case kind
    when 'wholesale'        then customer_id is not null and ship_to_id is not null and to_location_id is null
    when 'taproom_transfer' then to_location_id is not null and customer_id is null and ship_to_id is null
    end)
);
create index orders_status_idx on orders (brewery_id, status, requested_ship_date);
create index orders_customer_idx on orders (customer_id, created_at desc);
create trigger orders_no before insert on orders for each row execute function private.set_doc_no('order_no','order');

create table order_lines (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  order_id uuid not null unique,                       -- one shipment per order; remainder is cancelled
  shipped_at timestamptz not null default now(),
  carrier text, tracking text,
  -- 'now' invoices at ship; 'on_delivery' waits for confirm_delivery
  invoice_timing text not null default 'now' check (invoice_timing in ('now','on_delivery')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (order_id, brewery_id) references orders (id, brewery_id)
);

create table invoices (
  id uuid primary key default private.new_uuid(),
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
  qbo_idempotency_key uuid not null default private.new_uuid() unique,
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
create trigger invoices_no before insert on invoices for each row execute function private.set_doc_no('invoice_no','invoice');

-- A buyer's question about one invoice (Program 10 task 8). Nothing on the
-- invoice changes; the row is what a sales Today row points at, and
-- answered_at is what clears that row. The reply itself happens off-system.
create table invoice_questions (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  invoice_id uuid not null,
  customer_id uuid not null,
  body text not null check (length(body) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references auth.users(id),
  foreign key (invoice_id, brewery_id) references invoices (id, brewery_id),
  foreign key (customer_id, brewery_id) references customers (id, brewery_id)
);
create index invoice_questions_open_idx on invoice_questions (brewery_id, answered_at, created_at);
create index invoice_questions_invoice_idx on invoice_questions (invoice_id);

create table invoice_lines (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  pool_id uuid not null,
  keg_size keg_size not null,
  location_id uuid not null,   -- for shipped: where they left from; for returned: where they came back into
  bin_id uuid not null,
  qty int not null check (qty > 0),
  reason keg_event_reason not null,
  customer_id uuid,
  shipment_id uuid,
  at timestamptz not null default now(),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (pool_id, brewery_id) references keg_pools (id, brewery_id),
  foreign key (location_id, brewery_id) references locations (id, brewery_id),
  foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id),
  foreign key (customer_id, brewery_id) references customers (id, brewery_id),
  foreign key (shipment_id, brewery_id) references shipments (id, brewery_id),
  check (case reason
    when 'shipped'  then customer_id is not null
    when 'returned' then customer_id is not null
    when 'acquired' then customer_id is null
    when 'retired'  then customer_id is null
    else true end)
);
create index keg_events_pool_idx on keg_events (brewery_id, pool_id, keg_size, location_id, bin_id);
create index keg_events_customer_idx on keg_events (customer_id) where customer_id is not null;
create index keg_events_shipment_idx on keg_events (shipment_id) where shipment_id is not null;

-- Stock transfers: an internal move of stuff between two locations (spec
-- 2026-09-06 Decision 3), never a third order kind. Lines are polymorphic in
-- the database: exactly one of sku / material / keg pool. receive_stock_transfer
-- posts paired, volume-neutral ledger rows. A move inside one location is
-- move_stock_bin and writes no document (Decision 5).
create table stock_transfers (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  transfer_no bigint,                                  -- trigger
  status stock_transfer_status not null default 'draft',
  from_location_id uuid not null,
  to_location_id uuid not null,
  requested_date date,
  note text,
  created_by uuid not null references auth.users(id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, transfer_no),
  foreign key (from_location_id, brewery_id) references locations (id, brewery_id),
  foreign key (to_location_id, brewery_id) references locations (id, brewery_id),
  check (to_location_id <> from_location_id)
);
create index stock_transfers_brewery_idx on stock_transfers (brewery_id, status, created_at);
create trigger stock_transfers_no before insert on stock_transfers
  for each row execute function private.set_doc_no('transfer_no','transfer');

create table stock_transfer_lines (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  transfer_id uuid not null,
  sku_id uuid,
  material_id uuid,
  keg_pool_id uuid,
  keg_size keg_size,
  qty numeric(14,4) not null check (qty > 0),
  qty_picked numeric(14,4) check (qty_picked >= 0),
  from_bin_id uuid not null,
  to_bin_id uuid not null,
  note text,
  unique (id, brewery_id),
  foreign key (transfer_id, brewery_id) references stock_transfers (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (keg_pool_id, brewery_id) references keg_pools (id, brewery_id),
  foreign key (from_bin_id, brewery_id) references bins (id, brewery_id),
  foreign key (to_bin_id, brewery_id) references bins (id, brewery_id),
  check (num_nonnulls(sku_id, material_id, keg_pool_id) = 1),
  check ((keg_pool_id is null) = (keg_size is null)),
  check (keg_pool_id is null or (qty = trunc(qty) and (qty_picked is null or qty_picked = trunc(qty_picked))))
);
create index stock_transfer_lines_transfer_idx on stock_transfer_lines (brewery_id, transfer_id);

-- Bins live on the line and locations on the header, so the invariant "the
-- from-bin belongs to the source location, the to-bin to the destination" is
-- a trigger joining the header, not an application if.
create function private.stock_transfer_line_bins() returns trigger language plpgsql set search_path = '' as $$
declare loc_from uuid; loc_to uuid;
begin
  select from_location_id, to_location_id into loc_from, loc_to
    from public.stock_transfers where id = new.transfer_id;
  if not exists (select 1 from public.bins where id = new.from_bin_id and location_id = loc_from) then
    raise exception 'from_bin does not belong to the source location';
  end if;
  if not exists (select 1 from public.bins where id = new.to_bin_id and location_id = loc_to) then
    raise exception 'to_bin does not belong to the destination location';
  end if;
  return new;
end $$;
create trigger stock_transfer_lines_bins before insert or update on stock_transfer_lines
  for each row execute function private.stock_transfer_line_bins();

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
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
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
create table brand_approvals (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  brand_id uuid not null,
  kind approval_kind not null,
  ttb_id text not null,
  approved_on date, expires_on date,
  note text,
  unique (brand_id, kind, ttb_id),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id)
);

create table state_registrations (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  brand_id uuid not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  registration_no text,
  approved_on date, expires_on date,
  unique (brand_id, state),
  foreign key (brand_id, brewery_id) references brands (id, brewery_id)
);

create table brewery_state_licenses (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  state text not null check (state ~ '^[A-Z]{2}$'),
  kind text not null,                                  -- 'supplier', 'dtc', ...
  license_no text,
  expires_on date,
  note text,
  unique (brewery_id, state, kind)
);

create table report_filings (   -- the snapshot that was actually filed; the ledger stays recomputable
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  jurisdiction text not null check (jurisdiction ~ '^[A-Z-]+$'),   -- 'TTB', 'US-PA', 'US-OH'
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  figures jsonb not null,
  filed_at timestamptz,
  filed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique (brewery_id, jurisdiction, period_start, period_end),
  -- one filing covers a stretch of days: a second period overlapping it is a second filing of the same beer
  exclude using gist (brewery_id with =, jurisdiction with =, daterange(period_start, period_end, '[]') with &&)
);

-- ---------------------------------------------------------------- deliveries
create table routes (
  id uuid primary key default private.new_uuid(),
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
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  route_id uuid not null,
  -- a stop delivers a customer shipment or a stock transfer, never both
  -- (locations spec Decision 4); each document sits on at most one route
  shipment_id uuid unique,
  stock_transfer_id uuid unique,
  stop_no int not null,
  delivered_at timestamptz,
  signed_by text,
  note text,
  unique (route_id, stop_no),
  foreign key (route_id, brewery_id) references routes (id, brewery_id),
  foreign key (shipment_id, brewery_id) references shipments (id, brewery_id),
  foreign key (stock_transfer_id, brewery_id) references stock_transfers (id, brewery_id),
  check (num_nonnulls(shipment_id, stock_transfer_id) = 1)
);

-- ---------------------------------------------------------------- views (derived truth)
-- Customer-safe brewery projection. security definer so it can read
-- breweries without a customer SELECT policy on the base table; the
-- where-clause pins the caller to their own account (same pattern as
-- portal_availability). The wrapping view is security_invoker.
-- security-definer: justified — no customer SELECT on breweries; returns
-- only portal columns for my_customer_ids().
create function portal_brewery_rows()
returns table (
  id uuid,
  name text,
  timezone text,
  customer_phone text,
  portal_fulfillment_location_id uuid
)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.timezone, b.customer_phone, b.portal_fulfillment_location_id
  from public.breweries b
  where b.id in (
    select c.brewery_id from public.customers c
    where c.id in (select public.my_customer_ids())
  );
$$;

create view portal_brewery with (security_invoker = true) as
  select id, name, timezone, customer_phone, portal_fulfillment_location_id
  from public.portal_brewery_rows();
comment on function portal_brewery_rows() is
  'portal brewery projection; never add staff-only columns';

create view on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, sum(qty) as qty
  from inventory_movements group by 1,2,3;

create view atp with (security_invoker = true) as
  -- Reservations can precede the first receipt/production movement. Include
  -- those SKUs with zero on hand; ATP remains global across all locations.
  select s.brewery_id, s.id as sku_id, coalesce(o.qty, 0) - coalesce(a.qty, 0) as qty
  from skus s
  left join (select brewery_id, sku_id, sum(qty) as qty from on_hand group by brewery_id, sku_id) o
    on o.brewery_id = s.brewery_id and o.sku_id = s.id
  left join (select brewery_id, sku_id, sum(qty) as qty from allocations where status = 'open' group by brewery_id, sku_id) a
    on a.brewery_id = s.brewery_id and a.sku_id = s.id
  where o.sku_id is not null or a.sku_id is not null;

-- Bin grain, beside on_hand rather than replacing it: atp and taproom_replenishment
-- keep their location-grain join. Spec 2026-09-06 Decision 2.
create view bin_on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, bin_id, sum(qty) as qty
  from inventory_movements group by 1,2,3,4;

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

create view material_bin_on_hand with (security_invoker = true) as
  select brewery_id, material_id, location_id, bin_id, sum(qty) as qty
  from material_movements group by 1,2,3,4;

create view material_lot_on_hand with (security_invoker = true) as
  select m.brewery_id, m.material_id, m.lot_id, l.received_on, sum(m.qty) as qty
  from material_movements m join material_lots l on l.id = m.lot_id
  group by 1,2,3,4;

create view material_on_order with (security_invoker = true) as
  select b.brewery_id, b.material_id, sum(b.qty_open * m.purchase_uom_factor) as qty   -- base uom
  from po_open_balances b
  join purchase_orders po on po.id = b.po_id and po.status in ('sent','partially_received')
  join materials m on m.id = b.material_id
  group by 1,2;

create view material_last_cost with (security_invoker = true) as
  select distinct on (brewery_id, material_id) brewery_id, material_id, unit_cost_cents, created_at
  from material_movements where type = 'receipt' and unit_cost_cents is not null
  order by brewery_id, material_id, created_at desc;

-- A contract is drawn down many times a year (spec 2026-09-07 §4): received is
-- what accounting reconciles against, on order is what is placed but not yet
-- arrived, and available (committed less both) is the only number a buyer
-- decides against. Drafts and cancelled POs hold nothing. Purchase uom.
create view contract_balances with (security_invoker = true) as
  select contract_id, brewery_id, vendor_id, material_id, qty_committed, qty_received, qty_on_order,
         qty_committed - qty_received - qty_on_order as qty_available
  from (
    select c.id as contract_id, c.brewery_id, c.vendor_id, c.material_id, c.qty_committed,
           coalesce(sum(b.qty_received), 0) as qty_received,
           coalesce(sum(case when po.status in ('sent','partially_received') then b.qty_open else 0 end), 0) as qty_on_order
    from material_contracts c
    left join po_open_balances b on b.contract_id = c.id
    left join purchase_orders po on po.id = b.po_id
    group by c.id, c.brewery_id, c.vendor_id, c.material_id, c.qty_committed) x;

-- Observed lead time per vendor (spec 2026-09-07 §3): the last receipt stops the
-- vendor's clock, the first receipt is what unblocks production; late is
-- arrival against the promise (expected_on). Rolling last 10 received POs per
-- vendor, tagged by transport because an external send is an attestation.
create view vendor_lead_times with (security_invoker = true) as
  with per_po as (
    select po.brewery_id, po.vendor_id, po.sent_via,
           max(r.received_on) - po.ordered_on as lead_days,
           min(r.received_on) - po.ordered_on as first_lead_days,
           max(r.received_on) - po.expected_on as late_days,
           row_number() over (partition by po.vendor_id order by po.ordered_on desc, po.id) as recency
    from purchase_orders po join receipts r on r.po_id = po.id
    where po.status = 'received' and po.ordered_on is not null
    group by po.id)
  select brewery_id, vendor_id, sent_via, count(*)::int as n,
         round(avg(lead_days), 1) as avg_lead_days,
         round(avg(first_lead_days), 1) as avg_first_lead_days,
         round(avg(late_days), 1) as avg_late_days
  from per_po where recency <= 10
  group by 1, 2, 3;

-- Material gaps for Planning (spec 2026-09-07 §5). Demand is what committed
-- consumers will draw: unbrewed batches through their recipe, open packaging
-- runs through the format BOM. Supply nets on hand and open POs so a gap is
-- never ordered twice. Summed per material first, resolved to a vendor second
-- (§3): the contract with commitment still available, else the material's
-- default vendor, else no vendor and the row cannot draft. Buy-by is needed-by
-- less the vendor's typed lead time; a gap past it is out of reach and the
-- drafting RPC leaves it out. Base uom; purchase_units_short is the gap
-- rounded up to whole purchase units.
create view material_requirements with (security_invoker = true) as
  with req as (
    select b.brewery_id, ri.material_id, sum(ri.per_bbl_qty * b.planned_bbl) as required, min(b.planned_on) as needed_by
    from batches b join recipe_ingredients ri on ri.recipe_version_id = b.recipe_version_id
    where b.brewed_on is null group by 1,2
    union all
    select r.brewery_id, bom.material_id, sum(o.qty_planned * bom.qty_per_unit), min(r.planned_on)
    from packaging_runs r join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_bom bom on bom.format_id = s.format_id
    where r.closed_at is null group by 1,2),
  gap as (
    select req.brewery_id, req.material_id, sum(req.required) as required, min(req.needed_by) as needed_by,
           coalesce(oh.qty, 0) as on_hand, coalesce(oo.qty, 0) as on_order,
           sum(req.required) - coalesce(oh.qty, 0) - coalesce(oo.qty, 0) as short
    from req
    left join material_on_hand oh on oh.material_id = req.material_id
    left join material_on_order oo on oo.material_id = req.material_id
    group by 1,2, oh.qty, oo.qty)
  select gap.*, m.name as material_name, m.base_uom, m.purchase_uom, m.purchase_uom_factor,
         ceil(greatest(gap.short, 0) / m.purchase_uom_factor) as purchase_units_short,
         coalesce(c.vendor_id, m.default_vendor_id) as vendor_id, v.name as vendor_name, v.lead_time_days,
         gap.needed_by - v.lead_time_days as buy_by,
         coalesce(gap.needed_by - v.lead_time_days < current_date, false) as out_of_reach,
         c.contract_id, c.qty_available as contract_qty_available, c.unit_cost_cents as contract_unit_cost_cents
  from gap join materials m on m.id = gap.material_id
  left join lateral (
    select cb.contract_id, cb.vendor_id, cb.qty_available, mc.unit_cost_cents
    from contract_balances cb join material_contracts mc on mc.id = cb.contract_id
    where cb.material_id = gap.material_id and cb.qty_available > 0
      and (mc.starts_on is null or mc.starts_on <= current_date) and (mc.ends_on is null or mc.ends_on >= current_date)
    order by mc.ends_on nulls last limit 1) c on true
  left join vendors v on v.id = coalesce(c.vendor_id, m.default_vendor_id);

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
  join skus s on s.id = o.sku_id
  join format_bom bom on bom.format_id = s.format_id
  left join material_on_hand oh on oh.material_id = bom.material_id
  left join material_on_order oo on oo.material_id = bom.material_id
  where r.closed_at is null
  group by r.id, bom.material_id, oh.qty, oo.qty;

-- What the brewhouse still owes each brand. Demand is every open packaging
-- run's planned units converted to barrels; supply is beer already committed
-- to that brand -- batches scheduled but not yet brewed, plus what is sitting
-- in open occupancies, counted through the batch's intended brand. brew_bbl is
-- the shortfall, floored at zero: a surplus is not a negative brew.
-- ponytail: the 30-day horizon stands in for a cancel state. Runs have no
-- cancelled status yet, so an abandoned plan would inflate demand forever;
-- dropping runs planned more than 30 days ago is the cheap approximation.
-- Replace the date window with `and r.status <> 'cancelled'` when runs get one.
create view product_volume_requirements with (security_invoker = true) as
  with demand as (
    select r.brewery_id, r.brand_id, sum(o.qty_planned * f.bbl_per_unit) as bbl
    from packaging_runs r
    join packaging_run_outputs o on o.run_id = r.id
    join skus s on s.id = o.sku_id
    join format_volumes f on f.id = s.format_id
    where r.closed_at is null and r.planned_on >= current_date - 30
    group by 1, 2
  ),
  supply as (
    select brewery_id, brand_id, sum(bbl) as bbl from (
      select b.brewery_id, b.intended_brand_id as brand_id, b.planned_bbl as bbl
      from batches b where b.brewed_on is null and b.intended_brand_id is not null
      union all
      select ov.brewery_id, b.intended_brand_id, ov.bbl
      from occupancy_volumes ov join batches b on b.id = ov.batch_id
      where ov.ended_at is null and b.intended_brand_id is not null
    ) parts group by 1, 2
  )
  select br.brewery_id, br.id as brand_id, br.name as brand_name,
         coalesce(d.bbl, 0) as demand_bbl,
         coalesce(p.bbl, 0) as supply_bbl,
         greatest(coalesce(d.bbl, 0) - coalesce(p.bbl, 0), 0) as brew_bbl
  from brands br
  left join demand d on d.brand_id = br.id and d.brewery_id = br.brewery_id
  left join supply p on p.brand_id = br.id and p.brewery_id = br.brewery_id;

create view packaging_run_yields with (security_invoker = true) as
  select r.id as run_id, r.brewery_id, r.bbl_drawn,
         coalesce(sum(m.bbl), 0) as bbl_packaged,
         r.bbl_drawn - coalesce(sum(m.bbl), 0) as loss_bbl
  from packaging_runs r
  left join packaging_run_outputs o on o.run_id = r.id
  left join inventory_movements m on m.id = o.movement_id and m.brewery_id = r.brewery_id
  where r.closed_at is not null
  group by r.id;

-- transferred_in/out move kegs between bins and net to zero across the pair, so
-- keg_fleet_totals (no location) ignores them and stays the fleet.
create view keg_bin_totals with (security_invoker = true) as
  select brewery_id, pool_id, keg_size, location_id, bin_id,
         sum(case reason when 'acquired' then qty when 'found' then qty when 'transferred_in' then qty
                         when 'retired' then -qty when 'lost' then -qty when 'transferred_out' then -qty else 0 end)::int as qty
  from keg_events group by 1,2,3,4,5;

-- What a bin physically holds: shipped kegs have left it, returned ones are
-- back. record_keg_event refuses to take out more than this.
create view keg_bin_on_hand with (security_invoker = true) as
  select brewery_id, pool_id, keg_size, location_id, bin_id,
         sum(case reason when 'acquired' then qty when 'found' then qty when 'transferred_in' then qty when 'returned' then qty
                         when 'retired' then -qty when 'lost' then -qty when 'transferred_out' then -qty when 'shipped' then -qty else 0 end)::int as qty
  from keg_events group by 1,2,3,4,5;

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

-- ------------------------------------------------- order lifecycle commands
-- One function per transition (iron rule 5). Invoker-rights: RLS does
-- tenancy; each starts by locking the order row. p_lines is a full
-- replacement: [{"sku_id": uuid, "qty": n}].

-- Resolves the unit price for an *active* sku on a sale channel; raises
-- otherwise. Shared by every order create/update path so an inactive or
-- unpriced sku is rejected at the RPC boundary, not only in the TS layer.
create function private.order_line_price(p_brewery uuid, p_sale_channel uuid, p_sku uuid) returns int
language plpgsql stable set search_path = '' as $$
declare v int;
begin
  select p.unit_price_cents into v from public.sku_prices p
  where p.brewery_id = p_brewery and p.sale_channel_id = p_sale_channel and p.sku_id = p_sku and p.active;
  if v is null then raise exception 'sku % is not active and priced for this customer', p_sku; end if;
  return v;
end $$;

-- Every order write replaces its lines wholesale, so an empty list would leave
-- a lineless draft that later transitions still process.
create function private.assert_order_lines(p_lines jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'order requires at least one line';
  end if;
end $$;
-- Order-driven movements have no bin on the order (a later phase may add one),
-- so they post to the location's alphabetically first bin ('Cold' for a fresh
-- location). Name, not created_at: the seeded trio shares one transaction
-- timestamp. The brewery names the bin it wants order stock to land in so it
-- sorts first.
create function private.first_bin(p_location uuid) returns uuid
language sql stable set search_path = '' as $$
  select id from public.bins where location_id = p_location order by name limit 1
$$;

create function private.create_order_impl(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_order uuid; v_channel uuid; l record;
begin
  perform private.assert_order_lines(p_lines);
  if p_kind = 'wholesale' then
    select sale_channel_id into v_channel from public.customers where id = p_customer and brewery_id = p_brewery;
    if v_channel is null then raise exception 'customer not found'; end if;
  else
    -- a transfer has no customer: the channel named Taproom, else the first by name
    select id into v_channel from public.sale_channels where brewery_id = p_brewery order by (name = 'Taproom') desc, name limit 1;
  end if;
  insert into public.orders (brewery_id, kind, customer_id, ship_to_id, from_location_id, to_location_id,
                             sale_channel_id, requested_ship_date, po_number, note, created_by)
  values (p_brewery, p_kind, p_customer, p_ship_to, p_from_location, p_to_location,
          v_channel, p_requested, p_po, p_note, auth.uid())
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (p_brewery, v_order, l.sku_id, l.qty,
            case when p_kind = 'wholesale' then private.order_line_price(p_brewery, v_channel, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;

-- Shared guard: lock the order, check status, return the row.
create function private.lock_order(p_order uuid, p_allowed public.order_status[]) returns public.orders
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if not (o.status = any(p_allowed)) then raise exception 'order is %', o.status; end if;
  return o;
end $$;

create function private.update_draft_order_impl(
  p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l record;
begin
  perform private.assert_order_lines(p_lines);
  o := private.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set ship_to_id = coalesce(p_ship_to, ship_to_id),
    requested_ship_date = coalesce(p_requested, requested_ship_date),
    po_number = coalesce(p_po, po_number), note = coalesce(p_note, note)
    where id = p_order;
  delete from public.order_lines where order_id = p_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then private.order_line_price(o.brewery_id, o.sale_channel_id, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'updated', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', p_order);
end $$;

create function private.submit_order_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  o := private.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set status = 'submitted' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'submitted');
  -- chat: the submitted_order occurrence commits with the state change
  perform public.record_submitted_order_occurrence(p_order);
  return jsonb_build_object('order_id', p_order);
end $$;

create function private.confirm_order_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; w jsonb;
begin
  o := private.lock_order(p_order, array['submitted']::public.order_status[]);
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

create function private.adjust_order_lines_impl(p_order uuid, p_lines jsonb, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; l record; v_line uuid; v_before jsonb;
begin
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
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
            case when o.kind = 'wholesale' then private.order_line_price(o.brewery_id, o.sale_channel_id, l.sku_id) else 0 end)
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

create function private.cancel_order_impl(p_order uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  o := private.lock_order(p_order, array['draft','submitted','confirmed','picked']::public.order_status[]);
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order);
  update public.orders set status = 'cancelled', needs_restock = (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'cancelled', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $$;

create function private.record_pick_impl(p_order uuid, p_picks jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; pk record;
begin
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty_picked')::numeric as qty from jsonb_array_elements(p_picks) e loop
    update public.order_lines set qty_picked = pk.qty where id = pk.line_id and order_id = p_order;
  end loop;
  update public.orders set status = 'picked', needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'picked', jsonb_build_object('picks', p_picks));
  return jsonb_build_object('order_id', p_order);
end $$;

create function private.ship_order_impl(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text, p_invoice_timing text default 'now') returns jsonb
language plpgsql set search_path = '' as $$
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
end $$;

create function private.create_credit_memo_impl(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_cm uuid; v_order uuid; cl record; v_orig_qty numeric; v_already_credited numeric; v_sources jsonb; src record; v_original public.inventory_movements; v_sku uuid;
begin
  -- for update: concurrent memos against one invoice serialize here, so the
  -- over-credit guard below always sees the other memo's lines.
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'can only credit an invoice'; end if;
  insert into public.invoices (brewery_id, kind, customer_id, issued_on)
  values (v_inv.brewery_id, 'credit_memo', v_inv.customer_id, current_date)
  returning id into v_cm;
  select order_id into v_order from public.shipments where id = v_inv.shipment_id;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'credit lines required'; end if;
  if (select count(distinct (e->>'invoice_line_id')::uuid) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then raise exception 'duplicate credit line'; end if;
  for cl in select (e->>'invoice_line_id')::uuid as line_id, (e->>'qty')::numeric as qty, e->'sources' as sources from jsonb_array_elements(p_lines) e loop
    if cl.qty is null or cl.qty::text in ('NaN','Infinity','-Infinity') or cl.qty <= 0 or cl.qty <> round(cl.qty, 2) then raise exception 'invalid return quantity'; end if;
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
    select sku_id into v_sku from public.invoice_lines where id = cl.line_id and invoice_id = p_invoice;
    v_sources := cl.sources;
    if v_sources is null and v_order is not null then
      -- A legacy caller may return one untracked shipment source; no guessed lot.
      select * into v_original from public.inventory_movements where brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal';
      if v_original.id is null or v_original.lot_id is not null or
         (select count(*) from public.inventory_movements where brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal') <> 1 then
        raise exception 'choose original shipped sources for this return';
      end if;
      v_sources := jsonb_build_array(jsonb_build_object('movement_id', v_original.id, 'bin_id', private.first_bin(p_location), 'qty', cl.qty));
    end if;
    if v_sources is null and v_order is null then
      insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, note, created_by)
      values (v_inv.brewery_id, v_sku, p_location, private.first_bin(p_location), cl.qty, 'return_in', v_cm, p_reason, auth.uid());
    else
      if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'return sources must be an array'; end if;
      if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e),0) <> cl.qty
         or (select count(distinct (e->>'movement_id')::uuid) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources) then raise exception 'distinct return sources must sum to returned quantity'; end if;
      for src in select (e->>'movement_id')::uuid movement_id, (e->>'bin_id')::uuid bin_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
        if src.qty is null or src.qty <= 0 or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <> round(src.qty,2) then raise exception 'invalid return source quantity'; end if;
        select * into v_original from public.inventory_movements where id = src.movement_id and brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal';
        if v_original.id is null then raise exception 'source was not shipped on this invoice'; end if;
        if not exists (select 1 from public.bins where id = src.bin_id and location_id = p_location and brewery_id = v_inv.brewery_id) then raise exception 'invalid return destination bin'; end if;
        if src.qty > -v_original.qty - (select coalesce(sum(qty),0) from public.inventory_movements where brewery_id = v_inv.brewery_id and source_movement_id = v_original.id and type = 'return_in') then raise exception 'return exceeds remaining shipped source quantity'; end if;
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, source_movement_id, qty, type, ref, note, created_by)
        values (v_inv.brewery_id, v_sku, p_location, src.bin_id, v_original.lot_id, v_original.id, src.qty, 'return_in', v_cm, p_reason, auth.uid());
      end loop;
    end if;
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
-- release by qty<=0. One plpgsql function per iron rule 5.
create function private.set_standing_allocation_impl(p_location uuid, p_sku uuid, p_qty numeric) returns jsonb
language plpgsql set search_path = '' as $$
declare v_brewery uuid; v_alloc uuid; v_status public.allocation_status;
begin
  select brewery_id into v_brewery from public.locations where id = p_location;
  if v_brewery is null then raise exception 'location not found'; end if;
  if p_qty <= 0 then
    update public.allocations set status = 'released'
      where source = 'taproom_standing' and ref = p_location and sku_id = p_sku and status = 'open'
      returning id into v_alloc;
    if v_alloc is not null then v_status := 'released'; end if;
  else
    -- allocations_standing_open_uidx arbitrates concurrent sets for one (location, sku).
    insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
    values (v_brewery, p_sku, p_qty, 'taproom_standing', p_location, 'open')
    on conflict (ref, sku_id) where source = 'taproom_standing' and status = 'open'
      do update set qty = excluded.qty
    returning id into v_alloc;
    v_status := 'open';
  end if;
  return jsonb_build_object('allocation_id', v_alloc, 'status', v_status);
end $$;

create function private.create_replenishment_order_impl(p_from uuid, p_to uuid, p_lines jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_brewery uuid; v jsonb;
begin
  select brewery_id into v_brewery from public.locations where id = p_to;
  if v_brewery is null then raise exception 'location not found'; end if;
  v := private.create_order_impl(v_brewery, 'taproom_transfer', null, null, p_from, p_to, null, null, null, p_lines);
  perform private.submit_order_impl((v->>'order_id')::uuid);
  perform private.confirm_order_impl((v->>'order_id')::uuid);
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
create unique index chat_installations_provider_external_live_key
  on chat_installations (provider, external_installation_id) where state <> 'disconnected';
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
  reason text not null check (reason in ('submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question','operations_digest')),
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
  reason text not null check (reason in ('submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question','operations_digest')),
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
  result jsonb,
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
  integration_input jsonb not null default '{}',
  external_user_id text,
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


-- ---------------------------------------------------------------- command boundary
-- The request ledger is private because it contains actor identities and replay payloads.
create table private.command_requests (
  actor_id uuid not null,
  brewery_id uuid,
  request_id uuid not null,
  command_name text not null,
  payload_hash bytea not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id),
  check ((brewery_id is null) = (command_name = 'provision_brewery'))
);

create function private.assert_staff(p_brewery uuid, p_roles public.staff_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.brewery_users
    where brewery_id = p_brewery and user_id = v_actor and role = any(p_roles)
  ) then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_actor;
end $$;

create function private.assert_customer(p_brewery uuid, p_customer uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.customer_users cu
    join public.customers c on c.id = cu.customer_id
    where cu.user_id = v_actor and cu.customer_id = p_customer and c.brewery_id = p_brewery
  ) then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_actor;
end $$;

create function private.claim_command_request(
  p_brewery uuid, p_command text, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_request private.command_requests;
begin
  if v_actor is null then raise exception 'permission denied' using errcode = '42501'; end if;
  insert into private.command_requests (actor_id, brewery_id, request_id, command_name, payload_hash)
  values (v_actor, p_brewery, p_request_id, p_command, extensions.digest(p_payload::text, 'sha256'))
  on conflict (actor_id, request_id) do nothing;
  if found then return null; end if;
  select * into v_request from private.command_requests
    where actor_id = v_actor and request_id = p_request_id for update;
  if v_request.brewery_id is distinct from p_brewery or v_request.command_name <> p_command
     or v_request.payload_hash <> extensions.digest(p_payload::text, 'sha256') then
    -- Application SQLSTATE (class MG): every unique index raises 23505, so the
    -- replay mismatch gets its own code for the HTTP layer to map to 409.
    raise exception 'request id was already used with a different payload' using errcode = 'MG409';
  end if;
  if v_request.result is null then raise exception 'request is incomplete'; end if;
  return v_request.result;
end $$;

create function private.complete_command_request(p_request_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update private.command_requests set result = p_result
    where actor_id = auth.uid() and request_id = p_request_id;
  if not found then raise exception 'command request not claimed'; end if;
  return p_result;
end $$;

-- Service-role jobs pass the verified actor; auth.uid() is null for service_role.
create function private.claim_command_request_for(
  p_actor uuid, p_brewery uuid, p_command text, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request private.command_requests;
begin
  if p_actor is null then raise exception 'permission denied' using errcode = '42501'; end if;
  insert into private.command_requests (actor_id, brewery_id, request_id, command_name, payload_hash)
  values (p_actor, p_brewery, p_request_id, p_command, extensions.digest(p_payload::text, 'sha256'))
  on conflict (actor_id, request_id) do nothing;
  if found then return null; end if;
  select * into v_request from private.command_requests
    where actor_id = p_actor and request_id = p_request_id for update;
  if v_request.brewery_id <> p_brewery or v_request.command_name <> p_command
     or v_request.payload_hash <> extensions.digest(p_payload::text, 'sha256') then
    raise exception 'request id was already used with a different payload' using errcode = 'MG409';
  end if;
  if v_request.result is null then raise exception 'request is incomplete'; end if;
  return v_request.result;
end $$;

create function private.complete_command_request_for(p_actor uuid, p_request_id uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update private.command_requests set result = p_result
    where actor_id = p_actor and request_id = p_request_id;
  if not found then raise exception 'command request not claimed'; end if;
  return p_result;
end $$;
revoke all on function private.claim_command_request_for(uuid, uuid, text, uuid, jsonb),
  private.complete_command_request_for(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
-- Bootstrap is authenticated but deliberately has no tenant identity yet.
create function provision_brewery(p_name text, p_timezone text, p_ttb text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_result jsonb; v_id uuid;
begin
  if v_actor is null then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'brewery name is required'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    then raise exception 'invalid timezone'; end if;
  v_result := private.claim_command_request(null, 'provision_brewery', p_request_id,
    jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone, 'ttb', nullif(btrim(p_ttb), '')));
  if v_result is not null then return (v_result #>> '{}')::uuid; end if;
  insert into public.breweries(name, timezone, ttb_registry_no)
    values (btrim(p_name), p_timezone, nullif(btrim(p_ttb), '')) returning id into v_id;
  insert into public.brewery_users(brewery_id, user_id, role) values (v_id, v_actor, 'admin');
  perform private.complete_command_request(p_request_id, to_jsonb(v_id));
  return v_id;
end $$;

-- Invitations span Auth and membership transactions. The Auth trigger binds the
-- identity inside Auth's transaction, so even losing its HTTP response is safe.
create table private.invite_requests (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  actor_id uuid not null,
  email text not null unique,
  role public.staff_role,
  customer_id uuid,
  kind text not null check (kind in ('staff','customer')),
  auth_user_id uuid references auth.users(id),
  state text not null default 'pending_auth' check (state in ('pending_auth','pending_membership','complete','failed')),
  request_id uuid not null unique,
  auth_token uuid not null default private.new_uuid(),
  last_error text,
  created_at timestamptz not null default now(),
  foreign key (customer_id, brewery_id) references public.customers(id, brewery_id),
  check ((kind = 'staff' and role is not null and customer_id is null)
      or (kind = 'customer' and role is null and customer_id is not null))
);
alter table private.invite_requests enable row level security;
create index invite_requests_brewery_idx on private.invite_requests(brewery_id);

create function claim_invite_request(p_brewery uuid, p_email text, p_kind text,
  p_role public.staff_role, p_customer uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row private.invite_requests; v_email text := lower(btrim(p_email));
begin
  if p_kind is null or p_kind not in ('staff','customer') or
    (p_kind = 'staff' and (p_role is null or p_customer is not null)) or
    (p_kind = 'customer' and (p_role is not null or p_customer is null)) or
    v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'invalid invitation'; end if;
  perform private.assert_staff(p_brewery, case when p_kind = 'staff' then array['admin']::public.staff_role[] else array['admin','sales']::public.staff_role[] end);
  if p_kind = 'customer' and not exists (select 1 from public.customers where id = p_customer and brewery_id = p_brewery) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery,
    case when p_kind = 'staff' then 'invite_staff' else 'invite_customer_user' end, p_request_id,
    jsonb_build_object('email', v_email, 'role', p_role, 'customer', p_customer));
  if v_replay is null then
    if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email already has an account' using errcode = 'MG409'; end if;
    begin
      insert into private.invite_requests(brewery_id, actor_id, email, role, customer_id, kind, request_id)
      values(p_brewery, auth.uid(), v_email, p_role, p_customer, p_kind, p_request_id) returning * into v_row;
    exception when unique_violation then raise exception 'invitation already requested' using errcode = 'MG409'; end;
    perform private.complete_command_request(p_request_id, jsonb_build_object('inviteId', v_row.id));
  else
    select * into v_row from private.invite_requests where id = (v_replay->>'inviteId')::uuid and actor_id = auth.uid();
  end if;
  return jsonb_build_object('id', v_row.id, 'email', v_row.email, 'authToken', v_row.auth_token,
    'userId', v_row.auth_user_id, 'state', v_row.state);
end $$;

-- invited_at is Auth-owned, unlike editable user metadata. A signup or metadata
-- update cannot claim access. GoTrue sets invited_at after INSERT in the same tx.
create function private.bind_invited_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.invited_at is not null and (tg_op = 'INSERT' or old.invited_at is null) then
    update private.invite_requests set auth_user_id = new.id, state = 'pending_membership', last_error = null
      where auth_token::text = new.raw_user_meta_data->>'mgr_invite_token'
        and email = lower(new.email) and auth_user_id is null and state in ('pending_auth','failed');
  end if;
  return new;
end $$;
create trigger bind_invited_auth_user after insert or update of invited_at on auth.users
for each row execute function private.bind_invited_auth_user();

create function complete_invite_membership(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests;
begin
  select * into v_row from private.invite_requests where request_id = p_request_id and actor_id = auth.uid() for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_row.brewery_id, case when v_row.kind = 'staff' then array['admin']::public.staff_role[] else array['admin','sales']::public.staff_role[] end);
  if v_row.state = 'complete' then return jsonb_build_object('userId', v_row.auth_user_id); end if;
  if v_row.auth_user_id is null then raise exception 'invitation is awaiting Auth'; end if;
  if v_row.kind = 'staff' then
    insert into public.brewery_users(brewery_id,user_id,role) values(v_row.brewery_id,v_row.auth_user_id,v_row.role);
  else
    insert into public.customer_users(customer_id,user_id) values(v_row.customer_id,v_row.auth_user_id);
  end if;
  update private.invite_requests set state = 'complete', last_error = null where id = v_row.id;
  return jsonb_build_object('userId', v_row.auth_user_id);
exception when unique_violation then raise exception 'membership already exists' using errcode = 'MG409';
end $$;

create function record_invite_failure(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests;
begin
  select * into v_row from private.invite_requests where request_id = p_request_id and actor_id = auth.uid() for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_row.brewery_id, case when v_row.kind = 'staff' then array['admin']::public.staff_role[] else array['admin','sales']::public.staff_role[] end);
  update private.invite_requests set last_error = 'Invitation interrupted; retry this request',
    state = case when auth_user_id is null then 'failed' else 'pending_membership' end
    where id = v_row.id and state <> 'complete';
end $$;

create function upsert_format(
  p_brewery uuid, p_id uuid, p_name text, p_basis public.format_basis, p_package_type public.package_type,
  p_keg_size public.keg_size, p_units_per_case int, p_bbl_per_unit numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'basis', p_basis, 'package_type', p_package_type,
                       'keg_size', p_keg_size, 'units_per_case', p_units_per_case, 'bbl_per_unit', p_bbl_per_unit));
  if v_replay is not null then return v_replay; end if;
  if p_id is null then
    insert into public.formats (brewery_id, name, basis, package_type, keg_size, units_per_case, bbl_per_unit)
    values (p_brewery, p_name, p_basis, p_package_type, p_keg_size, p_units_per_case, p_bbl_per_unit) returning * into v_row;
  else
    update public.formats set name = p_name, basis = p_basis, package_type = p_package_type, keg_size = p_keg_size,
      units_per_case = p_units_per_case, bbl_per_unit = p_bbl_per_unit
    where id = p_id and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'format not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- One RPC replaces a composed format's children. One level only: children
-- must be atomic packaged formats (typed volume, no components of their own),
-- and the parent carries no typed volume, so the derived one is the only one.
create function replace_format_components(p_brewery uuid, p_format uuid, p_components jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_parent public.formats; c record; v_child public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'replace_format_components', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'format', p_format, 'components', p_components));
  if v_replay is not null then return v_replay; end if;
  select * into v_parent from public.formats where id = p_format and brewery_id = p_brewery for update;
  if v_parent.id is null then raise exception 'format not found'; end if;
  if v_parent.basis <> 'packaged' then raise exception 'only a packaged format composes'; end if;
  if v_parent.bbl_per_unit is not null then raise exception 'a composed format derives its volume: clear bbl_per_unit first'; end if;
  if exists (select 1 from public.format_components where child_format_id = p_format) then
    raise exception 'one level only: this format is already a component of another';
  end if;
  delete from public.format_components where parent_format_id = p_format;
  for c in select (e->>'child_format_id')::uuid as child, (e->>'qty')::numeric as qty from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) e loop
    select * into v_child from public.formats where id = c.child and brewery_id = p_brewery;
    if v_child.id is null then raise exception 'child format not found'; end if;
    if v_child.id = p_format then raise exception 'a format cannot contain itself (cycle)'; end if;
    if v_child.basis <> 'packaged' or v_child.bbl_per_unit is null
       or exists (select 1 from public.format_components where parent_format_id = v_child.id) then
      raise exception 'one level only: children must be atomic packaged formats (a cycle or a composed child is refused)';
    end if;
    insert into public.format_components (brewery_id, parent_format_id, child_format_id, qty) values (p_brewery, p_format, c.child, c.qty);
  end loop;
  return private.complete_command_request(p_request_id,
    (select to_jsonb(v) from public.format_volumes v where v.id = p_format));
end $$;

-- upsert_brand: name, optional style (found or created in the brewery's own
-- styles list), ABV, and the optional Brand-screen facts.
create function upsert_brand(
  p_brewery uuid, p_id uuid, p_name text, p_style text, p_abv numeric,
  p_description text, p_category text, p_price_group uuid, p_hops text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brands; v_style uuid;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'style', p_style, 'abv', p_abv,
                       'description', p_description, 'category', p_category, 'price_group', p_price_group, 'hops', p_hops));
  if v_replay is not null then return v_replay; end if;
  if nullif(trim(p_style), '') is not null then
    insert into public.styles (brewery_id, name) values (p_brewery, trim(p_style))
      on conflict (brewery_id, name) do update set name = excluded.name returning id into v_style;
  end if;
  if p_id is null then
    insert into public.brands (brewery_id, name, style_id, abv, description, category, price_group_id, hops)
    values (p_brewery, p_name, v_style, p_abv, p_description, p_category, p_price_group, p_hops) returning * into v_row;
  else
    update public.brands set name = p_name, style_id = v_style, abv = p_abv, description = p_description,
      category = p_category, price_group_id = p_price_group, hops = p_hops
    where id = p_id and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'brand not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Match ECMAScript String.trim at every UPC write boundary, including Unicode
-- WhiteSpace/LineTerminator characters. Internal barcode characters are retained.
create function private.normalize_upc(p_upc text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(p_upc, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
$$;

-- create_sku: one brand × one packaged format. The display name is filled
-- from both unless given.
create function create_sku(
  p_brewery uuid, p_brand uuid, p_format uuid, p_name text, p_upc text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.skus; v_brand public.brands; v_format public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'create_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'brand', p_brand, 'format', p_format, 'name', p_name, 'upc', p_upc));
  if v_replay is not null then return v_replay; end if;
  select * into v_brand from public.brands where id = p_brand and brewery_id = p_brewery;
  select * into v_format from public.formats where id = p_format and brewery_id = p_brewery;
  if v_brand.id is null then raise exception 'brand not found'; end if;
  if v_format.id is null then raise exception 'format not found'; end if;
  if v_format.basis <> 'packaged' then raise exception 'a sku needs a packaged format; a poured format is never stock'; end if;
  if (select bbl_per_unit from public.format_volumes where id = p_format) is null then raise exception 'format has no volume yet: type bbl_per_unit or add components'; end if;
  insert into public.skus (brewery_id, brand_id, format_id, name, upc)
    values (p_brewery, p_brand, p_format, coalesce(nullif(trim(p_name), ''), v_brand.name || ' · ' || v_format.name), p_upc) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- SKU identity is immutable here: deactivation never rewrites its history.
create function update_sku(
  p_brewery uuid, p_id uuid, p_active boolean, p_upc text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.skus;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'update_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'active', p_active, 'upc', p_upc));
  if v_replay is not null then return v_replay; end if;
  if p_active is null then raise exception 'active is required'; end if;
  begin
    update public.skus set active = p_active, upc = p_upc
      where id = p_id and brewery_id = p_brewery returning * into v_row;
  exception when unique_violation then
    raise exception 'UPC is already assigned to another SKU; use a different UPC or clear it';
  end;
  if v_row.id is null then raise exception 'sku not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Edit one location's facts. A kind change is allowed; history stays on
-- the movements (no rewrite). unique (brewery_id, name) still holds.
create function update_location(
  p_brewery uuid, p_id uuid, p_name text, p_kind public.location_kind, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.locations;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_location', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'kind', p_kind));
  if v_replay is not null then return v_replay; end if;
  update public.locations set name = p_name, kind = p_kind where id = p_id and brewery_id = p_brewery returning * into v_row;
  if v_row.id is null then raise exception 'location not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Invoice questions (Program 10 task 8): the buyer writes, sales marks answered.
create function raise_invoice_question(p_brewery uuid, p_invoice uuid, p_body text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_customer uuid; v_actor uuid; v_row public.invoice_questions;
begin
  select customer_id into v_customer from public.invoices where id = p_invoice and brewery_id = p_brewery;
  -- a missing invoice and someone else's answer the same way, so a buyer cannot
  -- learn which ids are real
  if v_customer is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_actor := private.assert_customer(p_brewery, v_customer);
  v_replay := private.claim_command_request(p_brewery, 'raise_invoice_question', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'invoice', p_invoice, 'body', p_body));
  if v_replay is not null then return v_replay; end if;
  insert into public.invoice_questions (brewery_id, invoice_id, customer_id, body, created_by)
    values (p_brewery, p_invoice, v_customer, p_body, v_actor) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function resolve_invoice_question(p_brewery uuid, p_question uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_actor uuid; v_row public.invoice_questions;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'resolve_invoice_question', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'question', p_question));
  if v_replay is not null then return v_replay; end if;
  update public.invoice_questions set answered_at = coalesce(answered_at, now()), answered_by = coalesce(answered_by, v_actor)
    where id = p_question and brewery_id = p_brewery returning * into v_row;
  if v_row.id is null then raise exception 'question not found' using errcode = 'P0001'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Team (Program 10 task 5). Roster with emails: definer only to reach
-- auth.users; the caller must be staff of the brewery, and only that
-- brewery's rows return. Role change and revoke are single-row writes that
-- keep at least one admin; a revoke ends the membership and leaves the Auth
-- user alone (re-invite is the compensation).
create function list_team_members(p_brewery uuid)
returns table (user_id uuid, email text, role public.staff_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select bu.user_id, u.email::text, bu.role, bu.created_at
    from public.brewery_users bu
    join auth.users u on u.id = bu.user_id
    where bu.brewery_id = p_brewery
      and exists (select 1 from public.brewery_users me where me.brewery_id = p_brewery and me.user_id = auth.uid()
                    and me.role = any (array['admin','sales','warehouse']::public.staff_role[]))
    order by bu.role, u.email;
$$;

create function private.assert_not_last_admin(p_brewery uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_user and role = 'admin')
     and (select count(*) from public.brewery_users where brewery_id = p_brewery and role = 'admin') = 1 then
    raise exception 'keep at least one admin' using errcode = 'P0001';
  end if;
end $$;

create function update_staff_role(p_brewery uuid, p_user uuid, p_role public.staff_role, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brewery_users;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_staff_role', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'user', p_user, 'role', p_role));
  if v_replay is not null then return v_replay; end if;
  if p_role <> 'admin' then perform private.assert_not_last_admin(p_brewery, p_user); end if;
  update public.brewery_users set role = p_role where brewery_id = p_brewery and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'member not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function revoke_staff(p_brewery uuid, p_user uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_actor uuid; v_row public.brewery_users;
begin
  v_actor := private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'revoke_staff', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'user', p_user));
  if v_replay is not null then return v_replay; end if;
  if p_user = v_actor then raise exception 'you cannot remove yourself' using errcode = 'P0001'; end if;
  perform private.assert_not_last_admin(p_brewery, p_user);
  delete from public.brewery_users where brewery_id = p_brewery and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'member not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Brewery basics from Settings: one mutable row, admin only. The timezone
-- must name a zone Postgres knows, so a typo never breaks every due date.
create function update_brewery(
  p_brewery uuid, p_name text, p_timezone text, p_ttb_registry_no text, p_pa_license_no text,
  p_customer_phone text, p_reading_due_hours int, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.breweries;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_brewery', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'timezone', p_timezone, 'ttb', p_ttb_registry_no,
      'pa', p_pa_license_no, 'phone', p_customer_phone, 'hours', p_reading_due_hours));
  if v_replay is not null then return v_replay; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone using errcode = 'P0001';
  end if;
  update public.breweries set name = p_name, timezone = p_timezone, ttb_registry_no = p_ttb_registry_no,
    pa_license_no = p_pa_license_no, customer_phone = p_customer_phone, fermentation_reading_due_hours = p_reading_due_hours
    where id = p_brewery returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function create_location(
  p_brewery uuid, p_name text, p_kind public.location_kind, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.locations;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_location', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'kind', p_kind));
  if v_replay is not null then return v_replay; end if;
  insert into public.locations (brewery_id, name, kind) values (p_brewery, p_name, p_kind) returning * into v_row;
  -- A location always has at least one bin; the trio is a starting point the
  -- brewery renames or trims (never to zero: delete_bin refuses the last one).
  insert into public.bins (brewery_id, location_id, name)
    values (p_brewery, v_row.id, 'Walk-in'), (p_brewery, v_row.id, 'Cold'), (p_brewery, v_row.id, 'Dry');
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function create_bin(
  p_brewery uuid, p_location uuid, p_name text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  insert into public.bins (brewery_id, location_id, name) values (p_brewery, p_location, p_name) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function update_bin(
  p_brewery uuid, p_bin uuid, p_name text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'bin', p_bin, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  update public.bins set name = p_name where id = p_bin and brewery_id = p_brewery returning * into v_row;
  if not found then raise exception 'bin not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Two guards, both under a row lock on the location so concurrent deletes
-- cannot empty it between them: a location keeps at least one bin, and a bin
-- that has ever recorded stock is never removed. The ledgers are append-only
-- and reference the bin, so "move the stock out first" cannot make it
-- deletable — a net-zero balance still leaves rows behind. Rename it instead.
create function delete_bin(
  p_brewery uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins; v_used boolean;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'bin', p_bin));
  if v_replay is not null then return v_replay; end if;
  select b.* into v_row from public.bins b where b.id = p_bin and b.brewery_id = p_brewery;
  if not found then raise exception 'bin not found'; end if;
  perform 1 from public.locations where id = v_row.location_id for update;
  if (select count(*) from public.bins where location_id = v_row.location_id) <= 1 then
    raise exception 'a location keeps at least one bin; rename it instead';
  end if;
  v_used := exists (select 1 from public.inventory_movements where bin_id = p_bin)
         or exists (select 1 from public.material_movements  where bin_id = p_bin)
         or exists (select 1 from public.keg_events          where bin_id = p_bin);
  if v_used then
    raise exception 'bin has recorded stock and cannot be removed; rename it instead';
  end if;
  delete from public.bins where id = p_bin;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Sale channels are brewery-owned rows; no name is load-bearing (an order
-- carries its own channel, so shipping no longer looks one up by name).
create function upsert_sale_channel(
  p_brewery uuid, p_id uuid, p_name text, p_tax_treatment public.tax_treatment, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.sale_channels;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_sale_channel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'tax_treatment', p_tax_treatment));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.sale_channels (brewery_id, name, tax_treatment)
        values (p_brewery, p_name, p_tax_treatment) returning * into v_row;
    else
      select * into v_row from public.sale_channels where id = p_id and brewery_id = p_brewery;
      if not found then raise exception 'sale channel not found'; end if;
      update public.sale_channels set name = p_name, tax_treatment = p_tax_treatment
        where id = p_id and brewery_id = p_brewery returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'a channel with that name already exists' using errcode = 'P0001';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- A channel in use is held by a foreign key with on delete restrict — from
-- inventory_movements, customers, orders and channel_prices — which raises
-- 23503; the command turns that into 'channel is in use'.
create function delete_sale_channel(
  p_brewery uuid, p_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.sale_channels;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_sale_channel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_row from public.sale_channels where id = p_id and brewery_id = p_brewery;
  if not found then raise exception 'sale channel not found'; end if;
  delete from public.sale_channels where id = p_id and brewery_id = p_brewery;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- ---------------------------------------------------------------- display preferences
-- Gravity unit is a *display* choice: every gravity in this database is stored
-- in degrees Plato and stays that way. The brewery default sits on breweries;
-- a member may override it for themselves on their own brewery_users row, and
-- null there means "follow the brewery". Both setters are ordinary
-- request-ledgered commands so a retried save cannot double-apply.
create function set_brewery_gravity_unit(
  p_brewery uuid, p_unit text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_unit text;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_brewery_gravity_unit', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'unit', p_unit));
  if v_replay is not null then return v_replay; end if;
  update public.breweries set gravity_unit = p_unit where id = p_brewery returning gravity_unit into v_unit;
  return private.complete_command_request(p_request_id, jsonb_build_object('unit', v_unit));
end $$;

-- p_unit null clears the personal override, dropping the caller back to the
-- brewery default. Any staff role may set their own; it reaches no one else's
-- row because the update is keyed on auth.uid().
create function set_my_gravity_unit(
  p_brewery uuid, p_unit text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_rows int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_my_gravity_unit', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'unit', p_unit));
  if v_replay is not null then return v_replay; end if;
  update public.brewery_users set gravity_unit = p_unit
    where brewery_id = p_brewery and user_id = auth.uid();
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'membership not found'; end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('unit', p_unit));
end $$;

-- p_tax_treatment is the customer's override of its sale channel's default
-- (§16.3): null means inherit, and every write sets it, so clearing an
-- override is passing null rather than a second command.
create function upsert_customer(
  p_brewery uuid, p_id uuid, p_name text, p_type public.customer_type, p_state text,
  p_sale_channel uuid, p_license_no text, p_payment_terms text, p_tax_treatment public.tax_treatment, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.customers;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_customer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'type', p_type, 'state', p_state, 'sale_channel', p_sale_channel, 'license_no', p_license_no, 'payment_terms', p_payment_terms, 'tax_treatment', p_tax_treatment));
  if v_replay is not null then return v_replay; end if;
  if p_sale_channel is null then raise exception 'customer needs a sale channel' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.customers (brewery_id, name, type, state, sale_channel_id, license_no, payment_terms, tax_treatment)
      values (p_brewery, p_name, p_type, p_state, p_sale_channel, p_license_no, coalesce(p_payment_terms, 'net30'), p_tax_treatment) returning * into v_row;
  else
    update public.customers set name = p_name, type = p_type, state = p_state, sale_channel_id = p_sale_channel,
      license_no = p_license_no, payment_terms = coalesce(p_payment_terms, payment_terms), tax_treatment = p_tax_treatment
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'customer not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function upsert_ship_to(
  p_brewery uuid, p_id uuid, p_customer uuid, p_label text, p_address1 text, p_address2 text,
  p_city text, p_state text, p_zip text, p_request_id uuid, p_is_default boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.ship_tos;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_ship_to', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'customer', p_customer, 'label', p_label, 'address1', p_address1, 'address2', p_address2, 'city', p_city, 'state', p_state, 'zip', p_zip, 'is_default', p_is_default));
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
    insert into public.ship_tos (brewery_id, customer_id, label, address1, address2, city, state, zip, is_default)
      values (p_brewery, p_customer, p_label, p_address1, p_address2, p_city, p_state, p_zip, coalesce(p_is_default, false)) returning * into v_row;
  else
    update public.ship_tos set label = p_label, address1 = p_address1,
      address2 = p_address2, city = p_city, state = p_state, zip = p_zip, is_default = coalesce(p_is_default, is_default)
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'ship-to not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function upsert_price_group(p_brewery uuid, p_id uuid, p_name text, p_position int, p_cost_ceiling_cents int, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.price_groups;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_price_group', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'position', p_position, 'cost_ceiling_cents', p_cost_ceiling_cents));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.price_groups (brewery_id, name, position, cost_ceiling_cents) values (p_brewery, p_name, p_position, p_cost_ceiling_cents) returning * into v_row;
    else
      update public.price_groups set name = p_name, position = p_position, cost_ceiling_cents = p_cost_ceiling_cents where id = p_id and brewery_id = p_brewery returning * into v_row;
      if not found then raise exception 'price group not found' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'a price group with that name or position already exists' using errcode = 'P0001';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function delete_price_group(p_brewery uuid, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_price_group', p_request_id, jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  delete from public.price_groups where id = p_id and brewery_id = p_brewery;   -- 23503 when a brand or cell references it
  if not found then raise exception 'price group not found' using errcode = 'P0001'; end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id, 'deleted', true));
end $$;

-- One cell of the price grid: what a format costs on a channel for a group.
create function set_channel_price(
  p_brewery uuid, p_sale_channel uuid, p_price_group uuid, p_format uuid, p_unit_price_cents int, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.channel_prices;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_channel_price', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sale_channel', p_sale_channel, 'price_group', p_price_group, 'format', p_format, 'unit_price_cents', p_unit_price_cents));
  if v_replay is not null then return v_replay; end if;
  insert into public.channel_prices (brewery_id, sale_channel_id, price_group_id, format_id, unit_price_cents)
    values (p_brewery, p_sale_channel, p_price_group, p_format, p_unit_price_cents)
    on conflict (sale_channel_id, price_group_id, format_id) do update
      set unit_price_cents = excluded.unit_price_cents
      where public.channel_prices.brewery_id = excluded.brewery_id
    returning * into v_row;
  -- The unique key excludes brewery_id, so the conflict target can match another
  -- brewery's cell before any FK is checked: the where-guard skips that update
  -- and the not-found below turns the silent no-op into a refusal
  -- (tests/data-api-boundary.test.ts).
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Empty a cell: every SKU of that group is unpriced on that channel again.
create function clear_channel_price(p_brewery uuid, p_sale_channel uuid, p_price_group uuid, p_format uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_n int;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'clear_channel_price', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sale_channel', p_sale_channel, 'price_group', p_price_group, 'format', p_format));
  if v_replay is not null then return v_replay; end if;
  delete from public.channel_prices where brewery_id = p_brewery and sale_channel_id = p_sale_channel and price_group_id = p_price_group and format_id = p_format;
  get diagnostics v_n = row_count;
  return private.complete_command_request(p_request_id, jsonb_build_object('cleared', v_n > 0));
end $$;

-- One RPC replaces a format's packaging bill of materials (§16.12).
create function replace_format_bom(p_brewery uuid, p_format uuid, p_lines jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; l record;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'replace_format_bom', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'format', p_format, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.formats where id = p_format and brewery_id = p_brewery for update;
  if not found then raise exception 'format not found'; end if;
  delete from public.format_bom where format_id = p_format;
  for l in select (e->>'material_id')::uuid as material_id, (e->>'qty_per_unit')::numeric as qty,
                  coalesce(e->>'on_break', 'consumed')::public.format_material_disposition as on_break
           from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e loop
    insert into public.format_bom (brewery_id, format_id, material_id, qty_per_unit, on_break) values (p_brewery, p_format, l.material_id, l.qty, l.on_break);
  end loop;
  return private.complete_command_request(p_request_id, jsonb_build_object('format_id', p_format,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('material_id', material_id, 'qty_per_unit', qty_per_unit, 'on_break', on_break)), '[]'::jsonb) from public.format_bom where format_id = p_format)));
end $$;

create function record_inventory_movement(
  p_brewery uuid, p_sku uuid, p_location uuid, p_bin uuid, p_qty numeric, p_type public.movement_type,
  p_sale_channel uuid, p_dest_state text, p_note text, p_request_id uuid, p_lot uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.inventory_movements; v_tax public.tax_treatment;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_inventory_movement', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'location', p_location, 'bin', p_bin, 'qty', p_qty, 'type', p_type, 'sale_channel', p_sale_channel, 'dest_state', p_dest_state, 'note', p_note, 'lot', p_lot));
  if v_replay is not null then return v_replay; end if;
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
      -- ponytail: global ledger lock; shared key locks across all writers when needed.
      lock table public.inventory_movements in share row exclusive mode;
      if -p_qty > (select coalesce(sum(qty),0) from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_bin and lot_id = p_lot) then raise exception 'insufficient selected lot stock'; end if;
    end if;
  end if;
  -- A staff-entered movement has no customer, so the channel default is the
  -- resolved treatment; the composite FK below rejects another brewery's channel.
  if p_sale_channel is not null then
    select tax_treatment into v_tax from public.sale_channels
     where id = p_sale_channel and brewery_id = p_brewery;
  end if;
  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, sale_channel_id, tax_treatment, dest_state, note, created_by)
    values (p_brewery, p_sku, p_location, p_bin, p_lot, p_qty, p_type, p_sale_channel, v_tax, p_dest_state, p_note, auth.uid()) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- The manifest binds the entire batch before any row commits. Its result holds
-- the immutable input so direct row calls cannot substitute data or identities.
create function begin_csv_import(p_brewery uuid, p_kind text, p_rows jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_input jsonb := jsonb_build_object('kind', p_kind, 'rows', p_rows);
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  if p_kind is null or p_kind not in ('customers','ship_tos','products_skus','channel_prices','opening_balances') then raise exception 'invalid import kind'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) not between 1 and 5000 then raise exception 'import requires 1–5000 rows'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) <> 'object') then raise exception 'rows must be objects'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r, jsonb_each(r) f where jsonb_typeof(f.value) <> 'string') then raise exception 'CSV fields must be strings'; end if;
  v_replay := private.claim_command_request(p_brewery, 'import_csv', p_request_id, v_input);
  if v_replay is null then perform private.complete_command_request(p_request_id, v_input); end if;
  return jsonb_build_object('rows', jsonb_array_length(p_rows));
end $$;

-- Domain-separated SHA256 UUIDv8s, derived here, never trusted from callers.
create function private.import_request_id(p_parent uuid, p_part text) returns uuid
language sql immutable set search_path = '' as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-8'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select encode(extensions.digest('mgr-import:'||p_parent::text||':'||p_part, 'sha256'), 'hex') h) s
$$;

create function import_csv_row(p_brewery uuid, p_request_id uuid, p_row_n integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_manifest jsonb; k text; r jsonb; f record; v_required text[]; v_allowed text[];
  v_id uuid; v_brand uuid; v_result jsonb; v_replay jsonb; v_request uuid;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  select result into v_manifest from private.command_requests
    where actor_id = auth.uid() and request_id = p_request_id and brewery_id = p_brewery and command_name = 'import_csv';
  if v_manifest is null then raise exception 'import manifest not found'; end if;
  if p_row_n is null or p_row_n < 0 or p_row_n >= jsonb_array_length(v_manifest->'rows') or p_row_n >= 5000 then raise exception 'invalid import row index'; end if;
  k := v_manifest->>'kind'; r := v_manifest->'rows'->p_row_n;
  v_request := private.import_request_id(p_request_id, p_row_n::text);
  v_replay := private.claim_command_request(p_brewery, 'import_csv_row', v_request, jsonb_build_object('parent', p_request_id, 'row_n', p_row_n, 'kind', k, 'row', r));
  if v_replay is not null then return v_replay; end if;
  -- Only this inner subtransaction catches row failures: any new brand/style,
  -- child ledger entry, and SKU are rolled back together. Siblings live in other calls.
  begin
    v_required := case k
      when 'customers' then array['name','type','state','saleChannelId']
      when 'ship_tos' then array['customerId','label','address1','city','state','zip']
      when 'products_skus' then array['product','formatId']
      when 'channel_prices' then array['saleChannelId','priceGroupId','formatId','unitPriceCents']
      when 'opening_balances' then array['skuId','locationId','binId','qty'] end;
    if v_required is null then raise exception 'invalid import kind'; end if;
    v_allowed := v_required || case k
      when 'customers' then array['licenseNumber','paymentTerms']
      when 'ship_tos' then array['address2']
      when 'products_skus' then array['sku_name','style','abv','upc']
      when 'opening_balances' then array['note'] else array[]::text[] end;
    for f in select unnest(v_required) as name loop
      if nullif(btrim(r->>f.name), '') is null then raise exception '% is required', f.name; end if;
    end loop;
    for f in select key, btrim(value) as value from jsonb_each_text(r) loop
      if not f.key = any(v_allowed) then raise exception 'unknown CSV field %', f.key; end if;
      if f.value = '' then continue; end if;
      if f.key like '%Id' and f.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception '% must be a UUID', f.key; end if;
      if f.key = 'state' and f.value !~ '^[A-Z]{2}$' then raise exception 'state must be two uppercase letters'; end if;
      if f.key in ('qty','abv','unitPriceCents') then
        if f.value !~ '^[+-]?[0-9]+(\.[0-9]+)?$' then raise exception '% must be a decimal', f.key; end if;
        if f.key = 'qty' and f.value::numeric <= 0 then raise exception 'qty must be positive'; end if;
        if f.key = 'unitPriceCents' and (f.value !~ '^[0-9]+$' or f.value::numeric > 2147483647) then raise exception 'unitPriceCents must be whole cents (0–2147483647)'; end if;
      end if;
    end loop;
    select jsonb_object_agg(key, nullif(btrim(value), '')) into r from jsonb_each_text(r);
    v_id := private.import_request_id(v_request, 'write');
    case k
      when 'customers' then
        v_result := public.upsert_customer(p_brewery, null, r->>'name', (r->>'type')::public.customer_type, r->>'state', (r->>'saleChannelId')::uuid, r->>'licenseNumber', r->>'paymentTerms', null, v_id);
      when 'ship_tos' then
        v_result := public.upsert_ship_to(p_brewery, null, (r->>'customerId')::uuid, r->>'label', r->>'address1', r->>'address2', r->>'city', r->>'state', r->>'zip', v_id);
      when 'products_skus' then
        -- Existing brands are reused without replacing their metadata. An
        -- advisory lock serializes same-name creation across simultaneous rows.
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_brewery::text || ':' || (r->>'product'), 0));
        select id into v_brand from public.brands where brewery_id = p_brewery and name = r->>'product';
        if v_brand is null then
          v_result := public.upsert_brand(p_brewery, null, r->>'product', r->>'style', (r->>'abv')::numeric, null, null, null, null, private.import_request_id(v_request, 'brand'));
          v_brand := (v_result->>'id')::uuid;
        end if;
        v_result := public.create_sku(p_brewery, v_brand, (r->>'formatId')::uuid, r->>'sku_name', r->>'upc', v_id);
      when 'channel_prices' then
        v_result := public.set_channel_price(p_brewery, (r->>'saleChannelId')::uuid, (r->>'priceGroupId')::uuid, (r->>'formatId')::uuid, (r->>'unitPriceCents')::integer, v_id);
      when 'opening_balances' then
        v_result := public.record_inventory_movement(p_brewery, (r->>'skuId')::uuid, (r->>'locationId')::uuid, (r->>'binId')::uuid, (r->>'qty')::numeric, 'opening_balance', null, null, r->>'note', v_id);
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

create function set_taproom_par(
  p_brewery uuid, p_location uuid, p_sku uuid, p_par_qty numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.taproom_pars;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists (
    select 1
    from public.locations l
    join public.skus s on s.brewery_id = l.brewery_id
    where l.id = p_location and s.id = p_sku and l.brewery_id = p_brewery
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery, 'set_taproom_par', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'sku', p_sku, 'par_qty', p_par_qty));
  if v_replay is not null then return v_replay; end if;
  insert into public.taproom_pars (brewery_id, location_id, sku_id, par_qty)
    values (p_brewery, p_location, p_sku, p_par_qty)
    on conflict (location_id, sku_id) do update
      set par_qty = excluded.par_qty
      where public.taproom_pars.brewery_id = excluded.brewery_id
    returning * into v_row;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
create function private.assert_order_staff(p_order uuid, p_roles public.staff_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_brewery uuid;
begin
  select o.brewery_id into v_brewery
  from public.orders o
  where o.id = p_order
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.role = any(p_roles)
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_brewery;
end $$;

create function private.assert_invoice_staff(p_invoice uuid, p_roles public.staff_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_brewery uuid;
begin
  select i.brewery_id into v_brewery
  from public.invoices i
  where i.id = p_invoice
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = i.brewery_id
        and bu.user_id = auth.uid()
        and bu.role = any(p_roles)
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_brewery;
end $$;

create function create_order(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text,
  p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_location_brewery uuid;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  select brewery_id into v_location_brewery from public.locations where id = p_from_location;
  if v_location_brewery is null or v_location_brewery <> p_brewery then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery, 'create_order', p_request_id,
    jsonb_build_object('brewery',p_brewery,'kind',p_kind,'customer',p_customer,'ship_to',p_ship_to,'from',p_from_location,'to',p_to_location,'requested',p_requested,'po',p_po,'note',p_note,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  v_result := private.create_order_impl(p_brewery,p_kind,p_customer,p_ship_to,p_from_location,p_to_location,p_requested,p_po,p_note,p_lines);
  return private.complete_command_request(p_request_id,v_result);
end $$;

create function portal_create_order(
  p_brewery uuid, p_customer uuid, p_ship_to uuid, p_po text, p_note text,
  p_lines jsonb, p_request_id uuid, p_requested date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_from_location uuid;
begin
  perform private.assert_customer(p_brewery, p_customer);
  v_replay := private.claim_command_request(p_brewery, 'portal_create_order', p_request_id,
    jsonb_build_object('brewery',p_brewery,'customer',p_customer,'ship_to',p_ship_to,'po',p_po,'note',p_note,'lines',p_lines,'requested',p_requested));
  if v_replay is not null then return v_replay; end if;
  -- Customers supply only ship-to, PO, note, and lines; everything else is
  -- derived here (audit P1.4). Validate the customer-editable inputs first.
  if not exists (
    select 1 from public.ship_tos where id = p_ship_to and customer_id = p_customer and brewery_id = p_brewery
  ) then raise exception 'ship-to not found'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'order requires at least one line';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where not exists (
      select 1 from public.customers c
      join public.sku_prices p on p.brewery_id = c.brewery_id and p.sale_channel_id = c.sale_channel_id
        and p.sku_id = (e->>'sku_id')::uuid and p.active
      where c.id = p_customer
    )
  ) then raise exception 'sku is not active and priced for this customer'; end if;
  -- The admin-configured source only (audit P1.4): no first-warehouse inference.
  select portal_fulfillment_location_id into v_from_location from public.breweries where id = p_brewery;
  if v_from_location is null then raise exception 'portal fulfillment source is not configured'; end if;
  v_result := private.create_order_impl(
    p_brewery,'wholesale',p_customer,p_ship_to,v_from_location,null,p_requested,p_po,p_note,p_lines
  );
  return private.complete_command_request(p_request_id,v_result);
end $$;

-- Admin-only configuration for the one warehouse customer portal orders ship
-- from. The composite FK on breweries prevents cross-brewery sources; this
-- additionally rejects a same-brewery location that is not a warehouse.
create function set_portal_fulfillment_source(p_brewery uuid, p_location uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_portal_fulfillment_source', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location));
  if v_replay is not null then return v_replay; end if;
  if not exists (
    select 1 from public.locations where id = p_location and brewery_id = p_brewery and kind = 'warehouse'
  ) then
    raise exception 'portal fulfillment source must be a brewery warehouse';
  end if;
  update public.breweries set portal_fulfillment_location_id = p_location where id = p_brewery;
  return private.complete_command_request(p_request_id, jsonb_build_object('brewery_id', p_brewery, 'location_id', p_location));
end $$;

create function update_draft_order(
  p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb, p_request_id uuid, p_clear_requested boolean default false, p_expected_brewery uuid default null, p_expected_customer uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  select o.brewery_id into v_brewery
  from public.orders o
  where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    and (
      exists (
        select 1 from public.brewery_users bu
        where bu.brewery_id = o.brewery_id
          and bu.user_id = auth.uid()
          and bu.role = any(array['admin','sales']::public.staff_role[])
      )
      or exists (
        select 1 from public.customer_users cu
        where cu.customer_id = o.customer_id and cu.user_id = auth.uid()
      )
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'update_draft_order',p_request_id,jsonb_build_object('order',p_order,'ship_to',p_ship_to,'requested',p_requested,'po',p_po,'note',p_note,'lines',p_lines,'clear_requested',p_clear_requested,'expected_brewery',p_expected_brewery,'expected_customer',p_expected_customer));
  if v_replay is not null then return v_replay; end if;
  -- Keep the shared claim-before-order-lock ordering. The first scope check
  -- rejects a wrong active account without claiming; this locked check prevents
  -- target scope changing between that read and the transactional write.
  perform 1 from public.orders o where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    for update of o;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  v_result := private.update_draft_order_impl(p_order,p_ship_to,p_requested,p_po,p_note,p_lines);
  if p_clear_requested then update public.orders set requested_ship_date = null where id = p_order; end if;
  return private.complete_command_request(p_request_id,v_result);
end $$;

create function submit_order(p_order uuid, p_request_id uuid, p_expected_brewery uuid default null, p_expected_customer uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb; v_is_staff boolean;
begin
  select o.brewery_id,
    exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.role = any(array['admin','sales']::public.staff_role[])
    )
    into v_brewery, v_is_staff
  from public.orders o
  where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    and (
      exists (
        select 1 from public.brewery_users bu
        where bu.brewery_id = o.brewery_id
          and bu.user_id = auth.uid()
          and bu.role = any(array['admin','sales']::public.staff_role[])
      )
      or exists (
        select 1 from public.customer_users cu
        where cu.customer_id = o.customer_id and cu.user_id = auth.uid()
      )
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'submit_order',p_request_id,jsonb_build_object('order',p_order,'expected_brewery',p_expected_brewery,'expected_customer',p_expected_customer));
  if v_replay is not null then return v_replay; end if;
  -- Keep the shared claim-before-order-lock ordering. The first scope check
  -- rejects a wrong active account without claiming; this locked check prevents
  -- target scope changing between that read and the transactional write.
  perform 1 from public.orders o where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    for update of o;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  if not v_is_staff and not exists (
    select 1 from public.orders where id=p_order and status='draft'
  ) then
    raise exception 'order not found';
  end if;
  v_result := private.submit_order_impl(p_order); return private.complete_command_request(p_request_id,v_result);
end $$;

create function confirm_order(p_order uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'confirm_order',p_request_id,jsonb_build_object('order',p_order));
  if v_replay is not null then return v_replay; end if;
  v_result := private.confirm_order_impl(p_order); return private.complete_command_request(p_request_id,v_result);
end $$;

create function adjust_order_lines(p_order uuid,p_lines jsonb,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'adjust_order_lines',p_request_id,jsonb_build_object('order',p_order,'lines',p_lines,'reason',p_reason));
  if v_replay is not null then return v_replay; end if;
  v_result := private.adjust_order_lines_impl(p_order,p_lines,p_reason); return private.complete_command_request(p_request_id,v_result);
end $$;

create function cancel_order(p_order uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'cancel_order',p_request_id,jsonb_build_object('order',p_order,'reason',p_reason));
  if v_replay is not null then return v_replay; end if;
  v_result := private.cancel_order_impl(p_order,p_reason); return private.complete_command_request(p_request_id,v_result);
end $$;

-- Put back: staged beer after an adjust-after-pick or cancel-when-picked was
-- re-shelved. Clears the flag and records it; the ledger never moved.
create function private.confirm_restock_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.needs_restock is not true then raise exception 'order is not waiting for restock'; end if;
  update public.orders set needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'restocked', '{}'::jsonb);
  return jsonb_build_object('order_id', p_order);
end $$;

create function confirm_restock(p_order uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'confirm_restock',p_request_id,jsonb_build_object('order',p_order));
  if v_replay is not null then return v_replay; end if;
  v_result := private.confirm_restock_impl(p_order); return private.complete_command_request(p_request_id,v_result);
end $$;

-- Short pick: one line counted below ordered. adjust_down makes the count the
-- order (allocation shrinks, ATP recovers); keep_owed records the count and
-- leaves the remainder owed, so the order stays on pick_due.
create function private.resolve_short_pick_impl(p_order uuid, p_line uuid, p_qty numeric, p_reason text, p_resolution text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l public.order_lines;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason is required'; end if;
  if p_qty < 0 then raise exception 'qty_picked cannot be negative'; end if;
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  select * into l from public.order_lines where id = p_line and order_id = p_order for update;
  if not found then raise exception 'order line not found'; end if;
  if p_qty >= l.qty_ordered then raise exception 'line is not short'; end if;
  if p_resolution = 'adjust_down' then
    if p_qty = 0 then raise exception 'adjust the order lines to drop a line entirely'; end if;
    update public.order_lines set qty_ordered = p_qty, qty_picked = p_qty, short_reason = p_reason where id = p_line;
    update public.allocations set qty = p_qty where source = 'order_line' and ref = p_line and status = 'open';
  elsif p_resolution = 'keep_owed' then
    update public.order_lines set qty_picked = p_qty, short_reason = p_reason where id = p_line;
  else
    raise exception 'unknown resolution';
  end if;
  update public.orders set status = 'picked' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'short_pick',
          jsonb_build_object('line_id', p_line, 'qty_picked', p_qty, 'reason', p_reason, 'resolution', p_resolution));
  return jsonb_build_object('order_id', p_order);
end $$;

create function resolve_short_pick(p_order uuid,p_line uuid,p_qty_picked numeric,p_reason text,p_resolution text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'resolve_short_pick',p_request_id,
    jsonb_build_object('order',p_order,'line',p_line,'qty_picked',p_qty_picked,'reason',p_reason,'resolution',p_resolution));
  if v_replay is not null then return v_replay; end if;
  v_result := private.resolve_short_pick_impl(p_order,p_line,p_qty_picked,p_reason,p_resolution); return private.complete_command_request(p_request_id,v_result);
end $$;

-- Confirm delivery: the stop is signed; an on_delivery shipment gets its
-- invoice now, at the shipped quantities and order prices. Never moves stock.
create function private.confirm_delivery_impl(p_delivery uuid, p_signed_by text) returns jsonb
language plpgsql set search_path = '' as $$
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
  end if;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, o.id, auth.uid(), 'delivered', jsonb_build_object('delivery_id', p_delivery, 'signed_by', p_signed_by, 'invoice_id', v_invoice));
  return jsonb_build_object('delivery_id', p_delivery, 'invoice_id', v_invoice);
end $$;

create function confirm_delivery(p_delivery uuid,p_signed_by text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_route_runner((select route_id from public.deliveries where id = p_delivery));
  v_replay := private.claim_command_request(v_brewery,'confirm_delivery',p_request_id,jsonb_build_object('delivery',p_delivery,'signed_by',p_signed_by));
  if v_replay is not null then return v_replay; end if;
  v_result := private.confirm_delivery_impl(p_delivery,p_signed_by); return private.complete_command_request(p_request_id,v_result);
end $$;

-- ---------------------------------------------------------------- delivery routes (Program 8)
-- One RPC writes the route header and replaces its stops. A stop is a shipped
-- customer shipment or a picked stock transfer; a document sits on at most one
-- route (unique columns) and cannot be moved off an open route it is already
-- on except by re-saving that route. Delivered stops must be kept. The driver
-- is a warehouse or admin member; who may depart, confirm and return is that
-- driver or an admin.
create function private.save_route_impl(
  p_brewery uuid, p_id uuid, p_name text, p_delivery_date date, p_driver uuid, p_vehicle text, p_note text, p_stops jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_id uuid := p_id; r public.routes; s jsonb; v_ship uuid; v_tr uuid; v_doc uuid; v_route uuid; v_seen uuid[] := '{}'; v_no int; v_seen_no int[] := '{}';
begin
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then raise exception 'a route needs at least one stop'; end if;
  if p_driver is not null and not exists (
    select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_driver and role in ('admin','warehouse')
  ) then raise exception 'driver must be a warehouse or admin member'; end if;
  if v_id is null then
    insert into public.routes (brewery_id, name, delivery_date, driver_user_id, vehicle, note)
    values (p_brewery, nullif(trim(p_name), ''), p_delivery_date, p_driver, nullif(trim(p_vehicle), ''), nullif(trim(p_note), ''))
    returning id into v_id;
  else
    select * into r from public.routes where id = v_id and brewery_id = p_brewery for update;
    if not found then raise exception 'route not found'; end if;
    -- ponytail: a departed route is frozen, so a refused stop blocks the return until it is delivered; a per-stop
    -- "leave for a later route" verb on the run page is the upgrade path
    if r.departed_at is not null then raise exception 'route has departed'; end if;
    update public.routes set name = nullif(trim(p_name), ''), delivery_date = p_delivery_date, driver_user_id = p_driver,
      vehicle = nullif(trim(p_vehicle), ''), note = nullif(trim(p_note), '') where id = v_id;
  end if;
  for s in select * from jsonb_array_elements(p_stops) loop
    v_ship := (s->>'shipment_id')::uuid; v_tr := (s->>'stock_transfer_id')::uuid; v_doc := coalesce(v_ship, v_tr);
    if num_nonnulls(v_ship, v_tr) <> 1 then raise exception 'a stop is one shipment or one stock transfer'; end if;
    if v_doc = any(v_seen) then raise exception 'the same document is listed twice'; end if;
    v_seen := v_seen || v_doc;
    v_no := (s->>'stop_no')::int;
    if v_no is null or v_no < 1 then raise exception 'stop number must be positive'; end if;
    if v_no = any(v_seen_no) then raise exception 'stop number % is used twice', v_no; end if;
    v_seen_no := v_seen_no || v_no;
    -- the brewery check comes first so a foreign id learns nothing about where it sits
    if v_ship is not null and not exists (select 1 from public.shipments where id = v_ship and brewery_id = p_brewery) then raise exception 'shipment not found'; end if;
    if v_tr is not null and not exists (
      select 1 from public.stock_transfers where id = v_tr and brewery_id = p_brewery and status in ('picked','in_transit')
    ) then raise exception 'transfer must be picked before it can be delivered'; end if;
    select d.route_id into v_route from public.deliveries d where d.brewery_id = p_brewery and coalesce(d.shipment_id, d.stock_transfer_id) = v_doc;
    if v_route is not null and v_route <> v_id then raise exception 'document is already on route %', v_route; end if;
  end loop;
  -- delivered stops stay; replace the rest
  if exists (
    select 1 from public.deliveries d where d.route_id = v_id and d.delivered_at is not null
      and not (coalesce(d.shipment_id, d.stock_transfer_id) = any(v_seen))
  ) then raise exception 'a delivered stop cannot be removed'; end if;
  -- kept stops keep their id: Today rows, chat subjects and open Confirm pages point at it
  delete from public.deliveries where route_id = v_id and delivered_at is null and not (coalesce(shipment_id, stock_transfer_id) = any(v_seen));
  -- two passes so renumbering never collides with a kept stop
  update public.deliveries set stop_no = -stop_no where route_id = v_id;
  for s in select * from jsonb_array_elements(p_stops) loop
    v_ship := (s->>'shipment_id')::uuid; v_tr := (s->>'stock_transfer_id')::uuid;
    update public.deliveries set stop_no = (s->>'stop_no')::int where route_id = v_id and coalesce(shipment_id, stock_transfer_id) = coalesce(v_ship, v_tr);
    if not found then
      insert into public.deliveries (brewery_id, route_id, shipment_id, stock_transfer_id, stop_no)
      values (p_brewery, v_id, v_ship, v_tr, (s->>'stop_no')::int);
    end if;
  end loop;
  return jsonb_build_object('routeId', v_id);
end $$;

-- The assigned driver or an admin runs a route; other warehouse members may
-- plan it but never depart, confirm or return it. Returns the brewery.
create function private.assert_route_runner(p_route uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r public.routes;
begin
  select * into r from public.routes where id = p_route;
  if r.id is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(r.brewery_id, array['admin','warehouse']::public.staff_role[]);
  if r.driver_user_id is distinct from auth.uid() and public.staff_role(r.brewery_id) <> 'admin' then
    raise exception 'only the assigned driver or an admin may run this route' using errcode = '42501';
  end if;
  return r.brewery_id;
end $$;

create function depart_route(p_route uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; r public.routes; v_tr uuid;
begin
  v_brewery := private.assert_route_runner(p_route);
  v_replay := private.claim_command_request(v_brewery, 'depart_route', p_request_id, jsonb_build_object('route', p_route));
  if v_replay is not null then return v_replay; end if;
  select * into r from public.routes where id = p_route for update;
  if r.departed_at is not null then raise exception 'route has already departed'; end if;
  if not exists (select 1 from public.deliveries where route_id = p_route) then raise exception 'a route needs at least one stop'; end if;
  update public.routes set departed_at = now() where id = p_route returning * into r;
  -- the truck now carries the transfer stops; the transition rule stays with lock_transfer
  for v_tr in select stock_transfer_id from public.deliveries where route_id = p_route and stock_transfer_id is not null loop
    perform private.lock_transfer(v_tr, array['picked','in_transit']::public.stock_transfer_status[]);
    update public.stock_transfers set status = 'in_transit' where id = v_tr;
  end loop;
  return private.complete_command_request(p_request_id, jsonb_build_object('routeId', p_route, 'departed_at', r.departed_at));
end $$;

create function return_route(p_route uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; r public.routes;
begin
  v_brewery := private.assert_route_runner(p_route);
  v_replay := private.claim_command_request(v_brewery, 'return_route', p_request_id, jsonb_build_object('route', p_route));
  if v_replay is not null then return v_replay; end if;
  select * into r from public.routes where id = p_route for update;
  if r.returned_at is not null then raise exception 'route has already returned'; end if;
  if r.departed_at is null then raise exception 'route has not departed'; end if;
  if exists (select 1 from public.deliveries where route_id = p_route and delivered_at is null) then
    raise exception 'every stop must be delivered before the route returns';
  end if;
  update public.routes set returned_at = now() where id = p_route returning * into r;
  return private.complete_command_request(p_request_id, jsonb_build_object('routeId', p_route, 'returned_at', r.returned_at));
end $$;

-- ---------------------------------------------------------------- compliance registry (Program 9)
-- Three upserts on the registry tables. An approval's TTB id is itself
-- editable, so approvals edit by id and a second row with a taken
-- (brand, kind, ttb_id) is MG409; registrations and licenses key on what the
-- user types (brand + state, state + kind), so insert-or-update is the whole
-- edit path.
create function upsert_brand_approval(
  p_brewery uuid, p_id uuid, p_brand uuid, p_kind public.approval_kind, p_ttb_id text, p_approved_on date, p_expires_on date, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brand_approvals;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand_approval', p_request_id,
    jsonb_build_object('id', p_id, 'brand', p_brand, 'kind', p_kind, 'ttb_id', p_ttb_id, 'approved_on', p_approved_on, 'expires_on', p_expires_on, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.brand_approvals (brewery_id, brand_id, kind, ttb_id, approved_on, expires_on, note)
        values (p_brewery, p_brand, p_kind, p_ttb_id, p_approved_on, p_expires_on, p_note) returning * into v_row;
    else
      update public.brand_approvals set brand_id = p_brand, kind = p_kind, ttb_id = p_ttb_id, approved_on = p_approved_on, expires_on = p_expires_on, note = p_note
        where id = p_id and brewery_id = p_brewery returning * into v_row;
      if not found then raise exception 'approval not found'; end if;
    end if;
  exception when unique_violation then
    raise exception 'that approval is already recorded for this brand' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function upsert_state_registration(
  p_brewery uuid, p_brand uuid, p_state text, p_registration_no text, p_approved_on date, p_expires_on date, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.state_registrations;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_state_registration', p_request_id,
    jsonb_build_object('brand', p_brand, 'state', p_state, 'registration_no', p_registration_no, 'approved_on', p_approved_on, 'expires_on', p_expires_on));
  if v_replay is not null then return v_replay; end if;
  -- the composite FK pins the brand to this brewery, and the conflict key is the brand, so the row hit is this brewery's
  insert into public.state_registrations (brewery_id, brand_id, state, registration_no, approved_on, expires_on)
    values (p_brewery, p_brand, p_state, p_registration_no, p_approved_on, p_expires_on)
    on conflict (brand_id, state) do update
      set registration_no = excluded.registration_no, approved_on = excluded.approved_on, expires_on = excluded.expires_on
    returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function upsert_brewery_state_license(
  p_brewery uuid, p_state text, p_kind text, p_license_no text, p_expires_on date, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brewery_state_licenses;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brewery_state_license', p_request_id,
    jsonb_build_object('state', p_state, 'kind', p_kind, 'license_no', p_license_no, 'expires_on', p_expires_on, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  -- kind is free text on the unique key: normalize it so "Brewery " and "brewery" are one license
  insert into public.brewery_state_licenses (brewery_id, state, kind, license_no, expires_on, note)
    values (p_brewery, p_state, lower(trim(p_kind)), p_license_no, p_expires_on, p_note)
    on conflict (brewery_id, state, kind) do update
      set license_no = excluded.license_no, expires_on = excluded.expires_on, note = excluded.note
    returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- ---------------------------------------------------------------- compliance report (Program 9)
-- The period report is a read over the movement ledger, never a stored figure
-- (brewing-domain "TTB & compliance"): per package class, begin + in − out =
-- end, all in bbl, from movements dated by when the beer moved in the
-- brewery's own timezone. Removals are keyed by the tax treatment frozen on
-- each movement, so a channel edited later cannot move a past month. The
-- identity is checked on the unrounded sums and every package_type gets a
-- line, so zeros are 0.00, never absent. Transfers and repacks stay inside a
-- class and sit on neither side; a type this classifier does not know has no
-- side, breaks the identity, and is named in warnings: an unhandled class
-- fails loudly. The cellar is the one exemption (beer leaves it by packaging),
-- reported as one in-process figure.
create function private.report_movements(p_brewery uuid, p_end date)
returns table (class public.package_type, bbl numeric, type public.movement_type, tax_treatment public.tax_treatment, dest_state text, d date, side text)
language sql stable set search_path = '' as $$
  select f.package_type, m.bbl, m.type, m.tax_treatment, m.dest_state, (m.created_at at time zone b.timezone)::date,
    case m.type
      when 'production_in' then 'in' when 'return_in' then 'in' when 'opening_balance' then 'in'
      when 'adjustment' then case when m.bbl > 0 then 'in' else 'out' end
      when 'sale_removal' then 'out' when 'depletion' then 'out' when 'destruction' then 'out'
      when 'loss' then 'out' when 'sample' then 'out' when 'festival_removal' then 'out'
      when 'taproom_transfer' then 'transfer' when 'location_transfer' then 'transfer' when 'repack' then 'transfer'
    end
  from public.inventory_movements m
  join public.breweries b on b.id = m.brewery_id
  join public.skus s on s.id = m.sku_id join public.formats f on f.id = s.format_id
  where m.brewery_id = p_brewery and (m.created_at at time zone b.timezone)::date <= p_end
$$;

-- ponytail: inProcess is the tanks now, not at period end; replaying transfers
-- and adjustments to a date is the upgrade when a filed month needs it.
create function generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lines jsonb; v_warnings text[]; v_removals jsonb; v_by_state jsonb; v_packaged numeric; v_in_process numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if p_end < p_start then raise exception 'the period ends before it starts'; end if;
  -- one pass over the ledger; every figure is an aggregate of the same rows
  with r as materialized (select * from private.report_movements(p_brewery, p_end)),
  per_class as (
    select c.class,
      coalesce(sum(bbl) filter (where d < p_start), 0) as b,
      coalesce(sum(bbl) filter (where d >= p_start and side = 'in'), 0) as i,
      coalesce(-sum(bbl) filter (where d >= p_start and side = 'out'), 0) as o,
      coalesce(sum(bbl), 0) as e
    from unnest(enum_range(null::public.package_type)) as c(class) left join r on r.class = c.class group by c.class)
  select
    -- the printed cells must foot as printed: end is derived from the rounded cells, the identity is checked unrounded below
    (select jsonb_agg(jsonb_build_object('class', class, 'begin', round(b, 2), 'in', round(i, 2), 'out', round(o, 2), 'end', round(b, 2) + round(i, 2) - round(o, 2)) order by class) from per_class),
    coalesce((select array_agg(class::text || ' does not balance' order by class) from per_class where b + i - o <> e), '{}')
      || coalesce((select array_agg(distinct 'unclassified movement type ' || type::text) from r where d >= p_start and side is null), '{}'),
    (select coalesce(jsonb_object_agg(k, round(v, 2)), '{}'::jsonb) from (
      select case when type in ('sale_removal', 'depletion') then tax_treatment::text else type::text end as k, -sum(bbl) as v
      from r where d >= p_start and side = 'out' and type <> 'adjustment' group by 1) t),
    (select coalesce(jsonb_object_agg(dest_state, round(v, 2)), '{}'::jsonb) from (
      select dest_state, -sum(bbl) as v from r where d >= p_start and type = 'sale_removal' and tax_treatment = 'taxable' group by 1) t),
    (select coalesce(sum(bbl), 0) from r where d >= p_start and type = 'production_in')
    into v_lines, v_warnings, v_removals, v_by_state, v_packaged;
  select coalesce(sum(bbl), 0) into v_in_process from public.occupancy_volumes where brewery_id = p_brewery and ended_at is null;
  return jsonb_build_object(
    'figures', jsonb_build_object(
      'jurisdiction', p_jurisdiction, 'periodStart', p_start, 'periodEnd', p_end,
      'lines', v_lines, 'removals', v_removals, 'byState', v_by_state,
      'packaged', round(v_packaged, 2), 'inProcess', round(v_in_process, 2),
      'balances', cardinality(v_warnings) = 0),
    'warnings', to_jsonb(v_warnings));
end $$;
create function file_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_report jsonb; v_row public.report_filings;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'file_compliance_report', p_request_id,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'start', p_start, 'end', p_end, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  v_report := public.generate_compliance_report(p_brewery, p_jurisdiction, p_start, p_end);
  if not (v_report->'figures'->>'balances')::boolean then
    raise exception 'the report does not balance: %', array_to_string(array(select jsonb_array_elements_text(v_report->'warnings')), '; ');
  end if;
  begin
    insert into public.report_filings (brewery_id, jurisdiction, period_start, period_end, figures, filed_at, filed_by, note)
      values (p_brewery, p_jurisdiction, p_start, p_end, v_report->'figures', now(), auth.uid(), p_note) returning * into v_row;
  exception when unique_violation or exclusion_violation then
    raise exception 'this period is already filed' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function save_route(
  p_brewery uuid, p_id uuid, p_name text, p_delivery_date date, p_driver uuid, p_vehicle text, p_note text, p_stops jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'save_route', p_request_id,
    jsonb_build_object('id', p_id, 'name', p_name, 'delivery_date', p_delivery_date, 'driver', p_driver, 'vehicle', p_vehicle, 'note', p_note, 'stops', p_stops));
  if v_replay is not null then return v_replay; end if;
  v_result := private.save_route_impl(p_brewery, p_id, p_name, p_delivery_date, p_driver, p_vehicle, p_note, p_stops);
  return private.complete_command_request(p_request_id, v_result);
end $$;

create function record_pick(p_order uuid,p_picks jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'record_pick',p_request_id,jsonb_build_object('order',p_order,'picks',p_picks));
  if v_replay is not null then return v_replay; end if;
  v_result := private.record_pick_impl(p_order,p_picks); return private.complete_command_request(p_request_id,v_result);
end $$;

create function ship_order(p_order uuid,p_ship jsonb,p_carrier text,p_tracking text,p_request_id uuid,p_invoice_timing text default 'now') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  if p_invoice_timing not in ('now','on_delivery') then raise exception 'unknown invoice timing'; end if;
  v_brewery := private.assert_order_staff(p_order,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'ship_order',p_request_id,jsonb_build_object('order',p_order,'ship',p_ship,'carrier',p_carrier,'tracking',p_tracking,'invoice_timing',p_invoice_timing));
  if v_replay is not null then return v_replay; end if;
  v_result := private.ship_order_impl(p_order,p_ship,p_carrier,p_tracking,p_invoice_timing); return private.complete_command_request(p_request_id,v_result);
end $$;

-- Return shipment: the credit memo above, then the beer. Reason decides the
-- beer, never the money: unsold and wrong_item come back sellable at the
-- destination; damaged comes back and is written to loss in the same call.
create function private.return_shipment_impl(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_memo uuid; v_brewery uuid;
begin
  if p_reason not in ('damaged','wrong_item','unsold') then raise exception 'unknown return reason'; end if;
  v_memo := (private.create_credit_memo_impl(p_invoice, p_lines, p_location, p_reason)->>'invoice_id')::uuid;
  if p_reason = 'damaged' then
    select brewery_id into v_brewery from public.invoices where id = p_invoice;
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, source_movement_id, qty, type, ref, note, created_by)
    select v_brewery, m.sku_id, m.location_id, m.bin_id, m.lot_id, m.id, -m.qty, 'loss', v_memo, 'damaged return', auth.uid()
    from public.inventory_movements m where m.ref = v_memo and m.type = 'return_in';
  end if;
  return jsonb_build_object('credit_memo_id', v_memo);
end $$;

create function return_shipment(p_invoice uuid,p_lines jsonb,p_location uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_invoice_staff(p_invoice,array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'return_shipment',p_request_id,jsonb_build_object('invoice',p_invoice,'lines',p_lines,'location',p_location,'reason',p_reason));
  if v_replay is not null then return v_replay; end if;
  v_result := private.return_shipment_impl(p_invoice,p_lines,p_location,p_reason); return private.complete_command_request(p_request_id,v_result);
end $$;

-- ---------------------------------------------------------------- recipes
-- A recipe is a name; every fact about how it is brewed lives on a version,
-- and a version is immutable — there is deliberately no update RPC. Editing a
-- recipe means adding the next version, so a batch that points at version 1
-- still reads exactly what was brewed. `version` is max+1 under a lock on the
-- recipe row, so two concurrent saves queue rather than collide on the
-- (recipe_id, version) unique index.
create function create_recipe(p_brewery uuid, p_brand uuid, p_name text, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.recipes;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_recipe', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'brand', p_brand, 'name', p_name, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  insert into public.recipes (brewery_id, brand_id, name, note)
  values (p_brewery, p_brand, p_name, p_note) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- One call writes the version and its ingredients, so a version never exists
-- without the lines it was costed and predicted from. Each line snapshots
-- materials.extract_potential into extract_snapshot: the material may be
-- retyped tomorrow, but this version's predicted gravity (lib/recipe-gravity.ts,
-- which reads the snapshot) must not move. Gravity itself is never computed or
-- stored here — get_recipe predicts it in TypeScript.
create function create_recipe_version(
  p_brewery uuid, p_recipe uuid, p_mash_temp_f numeric, p_brewhouse_efficiency numeric,
  p_yeast_attenuation numeric, p_boil_minutes int, p_target_ibu numeric, p_note text,
  p_ingredients jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_recipe public.recipes; v_row public.recipe_versions;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_recipe_version', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'recipe', p_recipe, 'mash_temp_f', p_mash_temp_f,
      'brewhouse_efficiency', p_brewhouse_efficiency, 'yeast_attenuation', p_yeast_attenuation,
      'boil_minutes', p_boil_minutes, 'target_ibu', p_target_ibu, 'note', p_note, 'ingredients', p_ingredients));
  if v_replay is not null then return v_replay; end if;
  -- The lock serializes concurrent saves of the same recipe; max+1 is read under it.
  select * into v_recipe from public.recipes where id = p_recipe and brewery_id = p_brewery for update;
  if v_recipe.id is null then raise exception 'recipe not found'; end if;
  if jsonb_array_length(p_ingredients) = 0 then raise exception 'a recipe version needs at least one ingredient'; end if;

  insert into public.recipe_versions (brewery_id, recipe_id, version, mash_temp_f, brewhouse_efficiency,
    yeast_attenuation, boil_minutes, target_ibu, note, created_by)
  select p_brewery, p_recipe, coalesce(max(rv.version), 0) + 1, p_mash_temp_f, p_brewhouse_efficiency,
    p_yeast_attenuation, p_boil_minutes, p_target_ibu, p_note, v_actor
  from public.recipe_versions rv where rv.recipe_id = p_recipe
  returning * into v_row;

  insert into public.recipe_ingredients (brewery_id, recipe_version_id, material_id, per_bbl_qty, stage,
    timing_minutes, sort, extract_snapshot)
  select p_brewery, v_row.id, (line->>'material_id')::uuid, (line->>'per_bbl_qty')::numeric,
    (line->>'stage')::public.ingredient_stage, (line->>'timing_minutes')::int, (ord - 1)::int,
    (select m.extract_potential from public.materials m
      where m.id = (line->>'material_id')::uuid and m.brewery_id = p_brewery)
  from jsonb_array_elements(p_ingredients) with ordinality as t(line, ord);

  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- ---------------------------------------------------------------- vessels and batches
-- A vessel is cellar hardware; it deliberately has no status column, because
-- what is in it is derived from the open row in vessel_occupancies.
create function upsert_vessel(
  p_brewery uuid, p_vessel uuid, p_name text, p_kind public.vessel_kind, p_capacity_bbl numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.vessels;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_vessel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vessel', p_vessel, 'name', p_name, 'kind', p_kind, 'capacity_bbl', p_capacity_bbl));
  if v_replay is not null then return v_replay; end if;
  if p_vessel is null then
    insert into public.vessels (brewery_id, name, kind, capacity_bbl)
    values (p_brewery, p_name, p_kind, p_capacity_bbl) returning * into v_row;
  else
    update public.vessels set name = p_name, kind = p_kind, capacity_bbl = p_capacity_bbl
    where id = p_vessel and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'vessel not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Scheduling is intent, not commitment: the brand is optional (§16.9 — identity
-- is required at packaging, not at the kettle) and so is the recipe version, so
-- a brewer can pencil in a brew day before deciding what goes in it. Neither is
-- cross-checked against the other: a recipe may itself be brand-less.
create function schedule_batch(
  p_brewery uuid, p_brand uuid, p_recipe_version uuid, p_planned_on date, p_planned_bbl numeric,
  p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_row public.batches;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'schedule_batch', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'brand', p_brand, 'recipe_version', p_recipe_version,
      'planned_on', p_planned_on, 'planned_bbl', p_planned_bbl, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  -- The composite FKs on (intended_brand_id, brewery_id) and
  -- (recipe_version_id, brewery_id) already refuse another tenant's rows; these
  -- checks only turn that into a readable error.
  if p_brand is not null and not exists (select 1 from public.brands where id = p_brand and brewery_id = p_brewery)
    then raise exception 'brand not found'; end if;
  if p_recipe_version is not null and not exists (
    select 1 from public.recipe_versions where id = p_recipe_version and brewery_id = p_brewery)
    then raise exception 'recipe version not found'; end if;

  insert into public.batches (brewery_id, intended_brand_id, recipe_version_id, planned_on, planned_bbl, note, created_by)
  values (p_brewery, p_brand, p_recipe_version, p_planned_on, p_planned_bbl, p_note, v_actor) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- One call stamps the brew day and opens the occupancy, so a brewed batch is
-- never sitting in nowhere. started_at is midnight of brewed_on: the cellar
-- thinks in days, and the gist exclusion on (vessel_id, tstzrange) then reads
-- as "this vessel was this batch's from that day on". The vessel row is locked
-- first so two concurrent brews queue rather than race the constraint, and the
-- overlap check — the same range predicate the constraint uses — can report
-- `occupied` instead of a constraint name.
create function record_brew_day(
  p_brewery uuid, p_batch uuid, p_vessel uuid, p_initial_bbl numeric, p_brewed_on date, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_batch public.batches; v_vessel public.vessels; v_occ public.vessel_occupancies;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_brew_day', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'vessel', p_vessel,
      'initial_bbl', p_initial_bbl, 'brewed_on', p_brewed_on));
  if v_replay is not null then return v_replay; end if;

  select * into v_vessel from public.vessels where id = p_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.brewed_on is not null then raise exception 'batch % was already brewed on %', v_batch.batch_no, v_batch.brewed_on; end if;
  -- Exactly the predicate the gist exclusion enforces, so a backdated brew day
  -- that lands inside a *closed* occupancy still gets this readable error
  -- rather than the raw constraint name. `ended_at is null` alone would miss it.
  if exists (
    select 1 from public.vessel_occupancies o
    where o.vessel_id = p_vessel
      and tstzrange(o.started_at, o.ended_at) && tstzrange(p_brewed_on::timestamptz, null)
  ) then raise exception 'vessel % is occupied on %; empty it first', v_vessel.name, p_brewed_on; end if;

  update public.batches set brewed_on = p_brewed_on where id = p_batch returning * into v_batch;
  insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
  values (p_brewery, p_vessel, p_batch, p_brewed_on::timestamptz, p_initial_bbl) returning * into v_occ;
  return private.complete_command_request(p_request_id,
    jsonb_build_object('batch', to_jsonb(v_batch), 'occupancy', to_jsonb(v_occ)));
end $$;

-- ---------------------------------------------------------------- cellar
-- Moving beer is a ledger entry, never a column edit: occupancy_volumes derives
-- what is in a vessel from initial_bbl, transfers in, transfers out (volume plus
-- its loss) and packaging draws. So this writes exactly one transfers row and
-- lets the view speak. The target vessel is locked before the source occupancy
-- — the same vessel-first order record_brew_day uses — so two brewers racing
-- into one brite queue behind the same lock instead of taking it in opposite
-- orders. That order does not make deadlock impossible: a mutual swap
-- (A -> B while B -> A) still takes the two locks in opposite orders and
-- Postgres aborts one side, which the caller retries.
-- An empty target gets a fresh occupancy at initial_bbl 0 carrying the
-- source's batch; an occupied one is blended into and keeps its own batch identity (a "new batch from two parents"
-- is deliberately not modelled). Every timestamp is now(), so a same-day
-- transfer never collides with a brew day's midnight range start.
create function record_cellar_transfer(
  p_brewery uuid, p_from_occupancy uuid, p_to_vessel uuid, p_volume_bbl numeric, p_loss_bbl numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_vessel public.vessels;
  v_from public.vessel_occupancies; v_to public.vessel_occupancies; v_row public.transfers;
  v_available numeric; v_now timestamptz := now();
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_cellar_transfer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'from_occupancy', p_from_occupancy, 'to_vessel', p_to_vessel,
      'volume_bbl', p_volume_bbl, 'loss_bbl', p_loss_bbl));
  if v_replay is not null then return v_replay; end if;

  select * into v_vessel from public.vessels where id = p_to_vessel and brewery_id = p_brewery for update;
  if v_vessel.id is null then raise exception 'vessel not found'; end if;
  select * into v_from from public.vessel_occupancies
    where id = p_from_occupancy and brewery_id = p_brewery for update;
  if v_from.id is null then raise exception 'occupancy not found'; end if;
  if v_from.ended_at is not null then raise exception 'occupancy is closed'; end if;
  if v_from.vessel_id = p_to_vessel then raise exception 'a vessel cannot be transferred into itself'; end if;

  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if p_volume_bbl + coalesce(p_loss_bbl, 0) > v_available + c_epsilon then
    raise exception 'only % bbl in that vessel; asked for %', v_available, p_volume_bbl + coalesce(p_loss_bbl, 0);
  end if;

  select * into v_to from public.vessel_occupancies
    where vessel_id = p_to_vessel and brewery_id = p_brewery and ended_at is null for update;
  if v_to.id is null then
    insert into public.vessel_occupancies (brewery_id, vessel_id, batch_id, started_at, initial_bbl)
    values (p_brewery, p_to_vessel, v_from.batch_id, v_now, 0) returning * into v_to;
  end if;

  insert into public.transfers (brewery_id, from_occupancy_id, to_occupancy_id, bbl, loss_bbl, at, created_by)
  values (p_brewery, v_from.id, v_to.id, p_volume_bbl, coalesce(p_loss_bbl, 0), v_now, v_actor) returning * into v_row;

  -- Re-read the view: it now includes the row just written.
  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_from.id;
  if v_available <= c_epsilon then
    -- greatest(): a brew day may be dated ahead of today, so the occupancy can
    -- start in the future. tstzrange would reject an ended_at below its start;
    -- an empty range there simply frees the vessel.
    update public.vessel_occupancies set ended_at = greatest(v_from.started_at, v_now)
    where id = v_from.id returning * into v_from;
  end if;

  return private.complete_command_request(p_request_id, jsonb_build_object(
    'transfer', to_jsonb(v_row), 'from_occupancy', to_jsonb(v_from), 'to_occupancy', to_jsonb(v_to)));
end $$;

-- Readings are manual entry in °F and °Plato (brewing-domain.md); nothing is
-- ever synthesized. A closed occupancy takes no more of them — the beer has
-- left the vessel, so a reading against it would describe nothing.
create function record_fermentation_reading(
  p_brewery uuid, p_occupancy uuid, p_at timestamptz, p_temp_f numeric,
  p_gravity_plato numeric, p_ph numeric, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_row public.fermentation_readings;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_fermentation_reading', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'occupancy', p_occupancy, 'at', p_at, 'temp_f', p_temp_f,
      'gravity_plato', p_gravity_plato, 'ph', p_ph, 'note', p_note));
  if v_replay is not null then return v_replay; end if;

  perform private.assert_open_occupancy(p_brewery, p_occupancy);

  insert into public.fermentation_readings (brewery_id, occupancy_id, at, temp_f, gravity_plato, ph, note, created_by)
  values (p_brewery, p_occupancy, coalesce(p_at, now()), p_temp_f, p_gravity_plato, p_ph, p_note, v_actor)
  returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- An occupancy a packaging run may draw from: this brewery's, still open.
-- Null passes -- "no tank yet" is the normal state of a planned run.
create function private.assert_open_occupancy(p_brewery uuid, p_occupancy uuid) returns void
language plpgsql set search_path = '' as $$
declare v_ended timestamptz; v_found boolean;
begin
  if p_occupancy is null then return; end if;
  select true, o.ended_at into v_found, v_ended from public.vessel_occupancies o
  where o.id = p_occupancy and o.brewery_id = p_brewery;
  if v_found is null then raise exception 'occupancy not found'; end if;
  if v_ended is not null then raise exception 'occupancy is closed'; end if;
end $$;

-- One line per package is the rule for a run's planned and actual outputs.
-- unique (run_id, sku_id) would catch a repeat, but as a constraint name;
-- say so before the insert does.
create function private.assert_one_line_per_sku(p_outputs jsonb) returns void
language plpgsql set search_path = '' as $$
declare v_dupe uuid;
begin
  select (value->>'sku_id')::uuid into v_dupe
  from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb))
  group by 1 having count(*) > 1 limit 1;
  if v_dupe is not null then
    raise exception 'package % is listed twice; give it one line with the total', v_dupe;
  end if;
end $$;

-- Replace a run's planned outputs. Every sku must belong to the run's brand,
-- so a run's outputs can never quietly package something else.
create function private.replace_packaging_run_outputs(
  p_brewery uuid, p_run uuid, p_brand uuid, p_outputs jsonb
) returns void language plpgsql set search_path = '' as $$
declare v_line jsonb; v_sku_brand uuid;
begin
  if p_outputs is null then return; end if;
  perform private.assert_one_line_per_sku(p_outputs);
  delete from public.packaging_run_outputs where run_id = p_run;
  for v_line in select * from jsonb_array_elements(p_outputs) loop
    select s.brand_id into v_sku_brand from public.skus s
    where s.id = (v_line->>'sku_id')::uuid and s.brewery_id = p_brewery;
    if v_sku_brand is null then raise exception 'sku not found'; end if;
    if v_sku_brand <> p_brand then
      raise exception 'sku % is not a package of this run''s brand', v_line->>'sku_id';
    end if;
    insert into public.packaging_run_outputs (brewery_id, run_id, sku_id, qty_planned)
    values (p_brewery, p_run, (v_line->>'sku_id')::uuid, (v_line->>'qty_planned')::numeric);
  end loop;
end $$;

-- ---------------------------------------------------------------- packaging
-- Planning a run needs only a brand and a date; the tank comes later
-- (packaging_runs' check constraint). Outputs are the units the run intends to
-- fill, and every one must be a sku of the run's own brand -- a Stout run
-- cannot plan Pils cans. An empty outputs list is fine: "Friday is a Stout
-- day" is a real plan.
create function schedule_packaging_run(
  p_brewery uuid, p_brand uuid, p_planned_on date, p_occupancy uuid, p_outputs jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_run public.packaging_runs;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'schedule_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'brand', p_brand, 'planned_on', p_planned_on,
      'occupancy', p_occupancy, 'outputs', p_outputs));
  if v_replay is not null then return v_replay; end if;

  if not exists (select 1 from public.brands where id = p_brand and brewery_id = p_brewery) then
    raise exception 'brand not found';
  end if;
  perform private.assert_open_occupancy(p_brewery, p_occupancy);

  insert into public.packaging_runs (brewery_id, brand_id, occupancy_id, planned_on, created_by)
  values (p_brewery, p_brand, p_occupancy, p_planned_on, v_actor) returning * into v_run;
  perform private.replace_packaging_run_outputs(p_brewery, v_run.id, p_brand, p_outputs);

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

-- The plan changes right up until the run starts: pick the tank, redo the
-- counts, then stamp started_at. Outputs are replaced wholesale rather than
-- diffed -- nothing downstream references a planned output until close writes
-- movement_id, so delete-and-insert loses nothing. A closed run is history.
create function update_packaging_run(
  p_brewery uuid, p_run uuid, p_occupancy uuid, p_outputs jsonb, p_started_at timestamptz, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_run public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'occupancy', p_occupancy,
      'outputs', p_outputs, 'started_at', p_started_at));
  if v_replay is not null then return v_replay; end if;

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;

  if p_occupancy is not null then
    perform private.assert_open_occupancy(p_brewery, p_occupancy);
    -- The brand trigger fires on this update and has the last word.
    update public.packaging_runs set occupancy_id = p_occupancy where id = p_run returning * into v_run;
  end if;

  -- Translate the check constraint into the sentence a brewer would say. The
  -- constraint still stands behind this for anything that writes directly.
  if p_started_at is not null then
    if v_run.occupancy_id is null then
      raise exception 'pick the tank this run draws from before starting it';
    end if;
    -- Re-check the tank that is actually attached (v_run was re-read above if
    -- one was passed in now): a run may have picked its occupancy days ago and
    -- that occupancy may have been emptied since. Nothing else would catch it
    -- -- the trigger only fires when occupancy_id itself is written, and the
    -- check constraint asks only that the column be non-null.
    perform private.assert_open_occupancy(p_brewery, v_run.occupancy_id);
    update public.packaging_runs set started_at = p_started_at where id = p_run returning * into v_run;
  end if;

  if p_outputs is not null then
    perform private.replace_packaging_run_outputs(p_brewery, p_run, v_run.brand_id, p_outputs);
  end if;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

-- Closing turns beer into stock, in one transaction: one lot for the whole
-- run, a production_in movement per package actually filled, the packaging
-- materials consumed off the shelf, and bbl_drawn on the run -- which
-- occupancy_volumes already subtracts from the tank.
--
-- A vessel has no location, so the close names the location and bin the
-- finished goods land in; without one a production_in movement has nowhere to
-- go. The occupancy is deliberately left open: whether a tank is done, and
-- what heel is left in it, is a cellar decision made by ending the occupancy,
-- not a side effect of packaging.
create function close_packaging_run(
  p_brewery uuid, p_run uuid, p_bbl_drawn numeric, p_outputs jsonb, p_lot_code text,
  p_packaged_on date, p_best_by date, p_location uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_run public.packaging_runs; v_lot uuid; v_available numeric;
  v_occupancy public.vessel_occupancies;
  v_line jsonb; v_sku uuid; v_qty numeric; v_format uuid;
  v_movement uuid; v_consumption uuid; v_bom record;
  -- numeric(10,3) rounding means "empty" is never exactly zero after a split.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'close_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'bbl_drawn', p_bbl_drawn,
      'outputs', p_outputs, 'lot_code', p_lot_code, 'packaged_on', p_packaged_on,
      'best_by', p_best_by, 'location', p_location, 'bin', p_bin));
  if v_replay is not null then return v_replay; end if;

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;
  -- The check constraint says the same thing as a constraint name; these are
  -- the two sentences a brewer would actually say.
  if v_run.occupancy_id is null then
    raise exception 'pick the tank this run drew from before closing it';
  end if;
  if v_run.started_at is null then raise exception 'start the run before closing it'; end if;

  -- Finished goods have to land somewhere real: the bin must be a bin of that
  -- location, and the location this brewery's.
  if not exists (
    select 1 from public.bins b join public.locations l on l.id = b.location_id
    where b.id = p_bin and b.location_id = p_location and l.brewery_id = p_brewery
  ) then
    raise exception 'bin does not belong to that location';
  end if;

  -- Lock the tank before reading its volume, as record_cellar_transfer does:
  -- the run lock above serialises closes of *this* run, but two runs drawing
  -- the same tank (or a cellar transfer out of it) would otherwise both see
  -- the pre-draw volume and both pass the check below.
  select * into v_occupancy from public.vessel_occupancies
  where id = v_run.occupancy_id and brewery_id = p_brewery for update;
  if v_occupancy.id is null then raise exception 'occupancy not found'; end if;
  -- The over-draw check below would refuse this anyway -- an ended occupancy
  -- holds nothing -- but only for a run that drew something. Saying it here
  -- keeps a zero-bbl close from quietly booking beer against an emptied tank,
  -- and names the order the two steps belong in.
  if v_occupancy.ended_at is not null then
    raise exception 'the tank was emptied before this run closed; close runs before transferring the heel out';
  end if;

  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_occupancy.id;
  if p_bbl_drawn > coalesce(v_available, 0) + c_epsilon then
    raise exception 'only % bbl in that tank; asked to draw %', coalesce(v_available, 0), p_bbl_drawn;
  end if;

  perform private.assert_one_line_per_sku(p_outputs);

  -- lots is unique (brewery_id, code); say so as a sentence rather than let a
  -- 23505 carrying a constraint name reach the brewer.
  if exists (select 1 from public.lots where brewery_id = p_brewery and code = p_lot_code) then
    raise exception 'lot code "%" is already used', p_lot_code;
  end if;
  insert into public.lots (brewery_id, packaging_run_id, brand_id, code, packaged_on, best_by)
  values (p_brewery, p_run, v_run.brand_id, p_lot_code, p_packaged_on, p_best_by)
  returning id into v_lot;

  -- A planned line nobody filled is settled at zero rather than left null: the
  -- run is history now, and "we filled none of those" is the answer.
  update public.packaging_run_outputs set qty_actual = 0 where run_id = p_run;

  for v_line in select * from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb)) loop
    v_sku := (v_line->>'sku_id')::uuid;
    v_qty := (v_line->>'qty_actual')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'qty_actual must not be negative';
    end if;
    if not exists (select 1 from public.packaging_run_outputs where run_id = p_run and sku_id = v_sku) then
      raise exception 'sku % is not one of this run''s planned outputs', v_sku;
    end if;
    if v_qty = 0 then continue; end if;

    select s.format_id into v_format from public.skus s where s.id = v_sku and s.brewery_id = p_brewery;

    -- One production_in per package filled, all carrying the run's lot and the
    -- run id as ref, so the whole close reads back as one event. bbl is frozen
    -- from the format by the enforce_bbl_integrity trigger.
    insert into public.inventory_movements
      (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, ref, created_by)
    values (p_brewery, v_sku, p_location, p_bin, v_qty, 'production_in', v_lot, p_run, v_actor)
    returning id into v_movement;
    update public.packaging_run_outputs set qty_actual = v_qty, movement_id = v_movement
    where run_id = p_run and sku_id = v_sku;

    -- The packaging bill belongs to the format (§16.12), and every line of it
    -- comes off the same shelf the finished goods land on.
    for v_bom in
      select fb.material_id, fb.qty_per_unit, m.name, m.lot_tracked
      from public.format_bom fb join public.materials m on m.id = fb.material_id
      where fb.format_id = v_format
    loop
      if v_bom.lot_tracked then
        -- ponytail: which lot of crowns went into a run is a real question with
        -- no UI behind it yet (FEFO or an explicit pick), and enforce_material_lot
        -- would reject a null lot_id anyway. Refuse loudly rather than invent one.
        -- Upgrade path: take a lot_id per BOM line on the close input.
        raise exception 'cannot post BOM for lot-tracked material "%" yet', v_bom.name;
      end if;
      insert into public.material_movements
        (brewery_id, material_id, location_id, bin_id, qty, type, created_by)
      values (p_brewery, v_bom.material_id, p_location, p_bin,
              -(v_bom.qty_per_unit * v_qty), 'consumption', v_actor)
      returning id into v_consumption;
      insert into public.packaging_run_consumptions (brewery_id, run_id, movement_id)
      values (p_brewery, p_run, v_consumption);
    end loop;
  end loop;

  update public.packaging_runs set closed_at = now(), bbl_drawn = p_bbl_drawn
  where id = p_run returning * into v_run;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

-- ---------------------------------------------------------------- packaging
-- Repack: breaking a composed unit into the units it is made of (§16.10).
-- Nothing is brewed or removed, so the two FG rows share
-- one `ref` and their volumes must cancel — the function asserts that before it
-- returns, which is the whole point of the command. Composition is one level
-- deep (§16.2a), so the pair must be joined by exactly one format_components
-- row; childQty is pinned to parentQty x that row's qty, because any other
-- ratio is what would make the volumes fail to net. The parent format's BOM
-- says what happens to the packaging that came off: `consumed` writes a
-- consumption, `return_to_stock` puts it back on the same bin's shelf.
create function private.record_repack_impl(
  p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric,
  p_child_sku uuid, p_child_qty numeric, p_actor uuid
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_ref uuid := private.new_uuid();
  v_parent public.skus; v_child public.skus;
  v_component numeric; v_expected numeric; v_on_hand numeric; v_net numeric;
  v_lot_tracked text;
begin
  if p_parent_qty <= 0 then raise exception 'parentQty must be positive'; end if;
  -- Composite FKs on inventory_movements already pin location/bin/sku to this
  -- brewery; these lookups are scoped too so the error is a sentence, not 23503.
  select * into v_parent from public.skus where id = p_parent_sku and brewery_id = p_brewery;
  select * into v_child  from public.skus where id = p_child_sku  and brewery_id = p_brewery;
  if v_parent.id is null or v_child.id is null then raise exception 'sku not found'; end if;
  if v_parent.brand_id <> v_child.brand_id then raise exception 'a repack stays inside one brand'; end if;

  select c.qty into v_component from public.format_components c
   where c.brewery_id = p_brewery and c.parent_format_id = v_parent.format_id and c.child_format_id = v_child.format_id;
  if v_component is null then
    raise exception 'format % is not a component of format %: composition is one level deep',
      v_child.format_id, v_parent.format_id;
  end if;

  v_expected := p_parent_qty * v_component;
  if p_child_qty <> v_expected then
    raise exception 'childQty % does not match parentQty % x % per unit: expected %, and only that ratio is volume-neutral',
      p_child_qty, p_parent_qty, v_component, v_expected;
  end if;

  -- A lot-tracked material needs a lot chosen for it, and a repack has nowhere
  -- to say which one; enforce_material_lot would otherwise fail the call with a
  -- bare uuid. Refuse up front, by name, before a single row is written.
  -- ponytail: take an optional per-material lot pick on the input and pass it
  -- through to material_movements.lot_id when someone lot-tracks packaging.
  select m.name into v_lot_tracked
  from public.format_bom bom join public.materials m on m.id = bom.material_id
  where bom.brewery_id = p_brewery and bom.format_id = v_parent.format_id and m.lot_tracked
  order by m.name limit 1;
  if v_lot_tracked is not null then
    raise exception 'repack cannot post BOM for lot-tracked material "%" yet; mark it untracked or remove it from the format''s BOM', v_lot_tracked;
  end if;

  -- The bin cannot go short. Same balance bin_on_hand reads, at the same grain;
  -- read straight from the ledger because that view is security_invoker.
  select coalesce(sum(m.qty), 0) into v_on_hand from public.inventory_movements m
   where m.brewery_id = p_brewery and m.sku_id = p_parent_sku
     and m.location_id = p_location and m.bin_id = p_bin;
  if v_on_hand < p_parent_qty then
    raise exception 'only % on hand in that bin, cannot repack %', v_on_hand, p_parent_qty;
  end if;

  insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, created_by)
  -- created_by is the actor assert_staff verified in the public wrapper, not
  -- auth.uid() read again here: the wrapper is the one place identity is proven.
  values (p_brewery, p_parent_sku, p_location, p_bin, -p_parent_qty, 'repack', v_ref, p_actor),
         (p_brewery, p_child_sku,  p_location, p_bin,  p_child_qty,  'repack', v_ref, p_actor);

  -- The trigger froze bbl on each row from format_volumes; if the pair does not
  -- cancel the repack invented or destroyed beer, so the whole call rolls back.
  -- Filtered on the on-hand index columns too: `ref` alone has no index, and
  -- the two rows just written are exactly this brewery/bin/sku pair.
  select coalesce(sum(m.bbl), 0) into v_net from public.inventory_movements m
   where m.brewery_id = p_brewery and m.location_id = p_location and m.bin_id = p_bin
     and m.sku_id in (p_parent_sku, p_child_sku) and m.ref = v_ref and m.type = 'repack';
  if abs(v_net) >= 0.000001 then
    raise exception 'repack is not volume-neutral: % bbl left over', v_net;
  end if;

  insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, note, created_by)
  select p_brewery, bom.material_id, p_location, p_bin,
         case bom.on_break when 'consumed' then -(bom.qty_per_unit * p_parent_qty) else bom.qty_per_unit * p_parent_qty end,
         case bom.on_break when 'consumed' then 'consumption' else 'return_to_stock' end::public.material_movement_type,
         'repack ' || v_ref, p_actor
  from public.format_bom bom
  where bom.brewery_id = p_brewery and bom.format_id = v_parent.format_id;

  return jsonb_build_object('ref', v_ref, 'parent_qty', p_parent_qty, 'child_qty', p_child_qty);
end $$;

create function record_repack(
  p_brewery uuid, p_location uuid, p_bin uuid, p_parent_sku uuid, p_parent_qty numeric,
  p_child_sku uuid, p_child_qty numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_actor uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_repack', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'bin', p_bin, 'parent_sku', p_parent_sku,
                       'parent_qty', p_parent_qty, 'child_sku', p_child_sku, 'child_qty', p_child_qty));
  if v_replay is not null then return v_replay; end if;
  v_result := private.record_repack_impl(p_brewery, p_location, p_bin, p_parent_sku, p_parent_qty, p_child_sku, p_child_qty, v_actor);
  return private.complete_command_request(p_request_id, v_result);
end $$;

-- ---------------------------------------------------------------- Purchasing
-- Vendors, materials and contracts are plain upserts. Lead time is typed on
-- the vendor (spec 2026-09-07 §3); a contract never gates ordering (§4).
create function upsert_vendor(
  p_brewery uuid, p_vendor uuid, p_name text, p_email text, p_phone text, p_lead_time_days int,
  p_payment_terms text, p_active boolean, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.vendors;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_vendor', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vendor', p_vendor, 'name', p_name, 'email', p_email, 'phone', p_phone,
      'lead_time_days', p_lead_time_days, 'payment_terms', p_payment_terms, 'active', p_active));
  if v_replay is not null then return v_replay; end if;
  if p_vendor is null then
    insert into public.vendors (brewery_id, name, email, phone, lead_time_days, payment_terms, active)
    values (p_brewery, p_name, p_email, p_phone, p_lead_time_days, coalesce(p_payment_terms, 'net30'), coalesce(p_active, true))
    returning * into v_row;
  else
    update public.vendors set name = p_name, email = p_email, phone = p_phone, lead_time_days = p_lead_time_days,
      payment_terms = coalesce(p_payment_terms, payment_terms), active = coalesce(p_active, active)
    where id = p_vendor and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'vendor not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- The unit vocabulary is fixed: a 44 lb hop box is purchase_uom each with
-- purchase_uom_factor 44, never a "box" unit. Units are refused once a
-- movement exists, because every ledger row was written in them.
create function upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active));
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, active)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true))
    returning * into v_row;
  else
    select * into v_row from public.materials where id = p_material and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'material not found'; end if;
    if (v_row.base_uom, v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1))
       and exists (select 1 from public.material_movements where material_id = p_material) then
      raise exception 'material is in use: its units cannot change';
    end if;
    update public.materials set name = p_name, category = p_category, base_uom = p_base_uom, purchase_uom = p_purchase_uom,
      purchase_uom_factor = coalesce(p_purchase_uom_factor, 1), lot_tracked = coalesce(p_lot_tracked, lot_tracked),
      default_vendor_id = p_default_vendor, reorder_point = coalesce(p_reorder_point, reorder_point), active = coalesce(p_active, active)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function upsert_material_contract(
  p_brewery uuid, p_contract uuid, p_vendor uuid, p_material uuid, p_qty_committed numeric, p_unit_cost_cents int,
  p_starts_on date, p_ends_on date, p_contract_no text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.material_contracts;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material_contract', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'contract', p_contract, 'vendor', p_vendor, 'material', p_material,
      'qty_committed', p_qty_committed, 'unit_cost_cents', p_unit_cost_cents, 'starts_on', p_starts_on, 'ends_on', p_ends_on, 'contract_no', p_contract_no));
  if v_replay is not null then return v_replay; end if;
  if p_contract is null then
    insert into public.material_contracts (brewery_id, vendor_id, material_id, qty_committed, unit_cost_cents, starts_on, ends_on, contract_no)
    values (p_brewery, p_vendor, p_material, p_qty_committed, p_unit_cost_cents, p_starts_on, p_ends_on, p_contract_no)
    returning * into v_row;
  else
    update public.material_contracts set vendor_id = p_vendor, material_id = p_material, qty_committed = p_qty_committed,
      unit_cost_cents = p_unit_cost_cents, starts_on = p_starts_on, ends_on = p_ends_on, contract_no = p_contract_no
    where id = p_contract and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'contract not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- One RPC writes the draft PO and every line. A line with a contract takes the
-- contract's price when none is typed; a contract never gates ordering (§4).
create function create_purchase_order(
  p_brewery uuid, p_vendor uuid, p_expected_on date, p_note text, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_po public.purchase_orders; l jsonb; v_contract_price int;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vendor', p_vendor, 'expected_on', p_expected_on, 'note', p_note, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  if jsonb_array_length(p_lines) = 0 then raise exception 'a purchase order needs at least one line'; end if;
  insert into public.purchase_orders (brewery_id, vendor_id, expected_on, note, created_by)
  values (p_brewery, p_vendor, p_expected_on, p_note, v_actor) returning * into v_po;
  for l in select * from jsonb_array_elements(p_lines) loop
    -- The composite FK only proves the brewery; a contract drawn down here must be this vendor's, for this material.
    v_contract_price := null;
    if l->>'contract_id' is not null then
      select unit_cost_cents into v_contract_price from public.material_contracts
        where id = (l->>'contract_id')::uuid and brewery_id = p_brewery and vendor_id = p_vendor and material_id = (l->>'material_id')::uuid;
      if not found then raise exception 'contract % is not this vendor''s contract for that material', l->>'contract_id'; end if;
    end if;
    insert into public.purchase_order_lines (brewery_id, po_id, material_id, qty_ordered, unit_cost_cents, contract_id, expected_lot_code)
    values (p_brewery, v_po.id, (l->>'material_id')::uuid, (l->>'qty_ordered')::numeric,
      coalesce((l->>'unit_cost_cents')::int, v_contract_price), (l->>'contract_id')::uuid, l->>'expected_lot_code');
  end loop;
  return private.complete_command_request(p_request_id, to_jsonb(v_po));
end $$;

-- Same shape as lock_order / lock_transfer: the row locked, or a MG409 naming the status it is in.
create function private.lock_purchase_order(p_brewery uuid, p_po uuid, p_allowed public.po_status[]) returns public.purchase_orders
language plpgsql set search_path = '' as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po and brewery_id = p_brewery for update;
  if not found then raise exception 'purchase order not found'; end if;
  if not (po.status = any(p_allowed)) then raise exception 'purchase order is %', po.status using errcode = 'MG409'; end if;
  return po;
end $$;

-- Marking a PO sent is an attestation: nothing leaves the process (spec §1).
-- ordered_on is the day the human says it went out, which is why observed
-- lead times are tagged with sent_via.
create function send_purchase_order(p_brewery uuid, p_po uuid, p_sent_via text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_po public.purchase_orders;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'send_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'sent_via', p_sent_via));
  if v_replay is not null then return v_replay; end if;
  v_po := private.lock_purchase_order(p_brewery, p_po, array['draft']::public.po_status[]);
  update public.purchase_orders set status = 'sent', ordered_on = current_date, sent_via = p_sent_via, sent_by = v_actor
  where id = p_po returning * into v_po;
  return private.complete_command_request(p_request_id, to_jsonb(v_po));
end $$;

-- One RPC: receipt header, a line per counted PO line, the material lot read
-- off the package (created here, never from the PO's expected lot), and a
-- receipt movement in base units at the named bin. Only counted quantity
-- posts; over and short are recorded, never blocked. The trigger on
-- receipt_lines derives the PO status.
create function receive_purchase_order(
  p_brewery uuid, p_po uuid, p_location uuid, p_bin uuid, p_received_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_po public.purchase_orders; v_receipt_id uuid; l jsonb;
  v_line public.purchase_order_lines; v_mat public.materials; v_counted numeric; v_expected numeric;
  v_lot uuid; v_movement uuid;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'receive_purchase_order', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'po', p_po, 'location', p_location, 'bin', p_bin, 'received_on', p_received_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_po := private.lock_purchase_order(p_brewery, p_po, array['sent','partially_received']::public.po_status[]);
  if jsonb_array_length(p_lines) = 0 then raise exception 'a receipt needs at least one counted line'; end if;
  insert into public.receipts (brewery_id, po_id, received_on, received_by)
  values (p_brewery, p_po, coalesce(p_received_on, current_date), v_actor) returning id into v_receipt_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.purchase_order_lines where id = (l->>'po_line_id')::uuid and po_id = p_po;
    if v_line.id is null then raise exception 'line % is not on this purchase order', l->>'po_line_id'; end if;
    select * into v_mat from public.materials where id = v_line.material_id;
    v_counted := (l->>'qty_counted')::numeric;
    select qty_open into v_expected from public.po_open_balances where po_line_id = v_line.id;
    v_lot := null; v_movement := null;
    if v_mat.lot_tracked then
      if nullif(trim(l->>'lot_code'), '') is null then raise exception '% is lot-tracked: a lot code is required', v_mat.name; end if;
      insert into public.material_lots (brewery_id, material_id, lot_code, vendor_id, received_on, best_by)
      values (p_brewery, v_mat.id, trim(l->>'lot_code'), v_po.vendor_id, coalesce(p_received_on, current_date), (l->>'best_by')::date)
      -- ponytail: exact (trimmed) lot-code match; case/punctuation normalization needs a generated column carrying the unique
      on conflict (material_id, lot_code) do update set best_by = coalesce(excluded.best_by, public.material_lots.best_by)
      returning id into v_lot;
    end if;
    if v_counted > 0 then
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, unit_cost_cents, created_by)
      values (p_brewery, v_mat.id, p_location, p_bin, v_lot, v_counted * v_mat.purchase_uom_factor, 'receipt',
              case when v_line.unit_cost_cents is null then null else round(v_line.unit_cost_cents / v_mat.purchase_uom_factor)::int end, v_actor)
      returning id into v_movement;
    end if;
    insert into public.receipt_lines (brewery_id, receipt_id, po_line_id, qty_expected, qty_counted, lot_id, movement_id)
    values (p_brewery, v_receipt_id, v_line.id, v_expected, v_counted, v_lot, v_movement);
  end loop;
  select * into v_po from public.purchase_orders where id = p_po;
  return private.complete_command_request(p_request_id, jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po, 'status', v_po.status));
end $$;

-- Planning's verb: one draft PO per vendor the chosen gaps resolve to (§5).
-- Quantities are whole purchase units. A contracted material takes the
-- contract's price up to its available commitment and a spot line (no
-- contract, no price) beyond it — a draft that priced everything at contract
-- rate would be wrong money (§4). Materials with no vendor, and gaps already
-- past their buy-by date, are reported, not drafted. Drafts are not supply:
-- the gap stands until the PO is marked sent.
create function draft_purchase_order_from_requirements(p_brewery uuid, p_materials uuid[], p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; r record; v_po uuid; v_last_vendor uuid; v_pos jsonb := '[]'; v_skipped jsonb := '[]';
  v_units numeric; v_contracted numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'draft_purchase_order_from_requirements', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'materials', to_jsonb(p_materials)));
  if v_replay is not null then return v_replay; end if;
  for r in
    select * from public.material_requirements mr
    where mr.brewery_id = p_brewery and mr.material_id = any(p_materials) and mr.short > 0
    order by mr.vendor_id, mr.material_id
  loop
    if r.vendor_id is null then
      v_skipped := v_skipped || jsonb_build_object('materialId', r.material_id, 'reason', 'no_vendor');
      continue;
    end if;
    if r.out_of_reach then
      v_skipped := v_skipped || jsonb_build_object('materialId', r.material_id, 'reason', 'out_of_reach');
      continue;
    end if;
    if r.vendor_id is distinct from v_last_vendor then   -- rows arrive grouped by vendor
      insert into public.purchase_orders (brewery_id, vendor_id, note, created_by)
      values (p_brewery, r.vendor_id, 'Drafted from Planning', v_actor) returning id into v_po;
      v_pos := v_pos || to_jsonb(v_po);
      v_last_vendor := r.vendor_id;
    end if;
    v_units := r.purchase_units_short;
    v_contracted := 0;
    if r.contract_id is not null then
      v_contracted := greatest(least(v_units, floor(r.contract_qty_available)), 0);
      if v_contracted > 0 then
        insert into public.purchase_order_lines (brewery_id, po_id, material_id, qty_ordered, unit_cost_cents, contract_id)
        values (p_brewery, v_po, r.material_id, v_contracted, r.contract_unit_cost_cents, r.contract_id);
      end if;
    end if;
    if v_units - v_contracted > 0 then
      insert into public.purchase_order_lines (brewery_id, po_id, material_id, qty_ordered)
      values (p_brewery, v_po, r.material_id, v_units - v_contracted);
    end if;
  end loop;
  return private.complete_command_request(p_request_id, jsonb_build_object('purchaseOrderIds', v_pos, 'skipped', v_skipped));
end $$;

-- Cycle count at one bin (Cycle count sheet): one number per material, the
-- header always written (a zero-variance count is a durable occurrence), and
-- only the variance posts, as count_adjustment movements. A count is one
-- number but a material may hold several lots, so this decides which lot
-- moves: a shortage consumes earliest best-by first (lots with none fall to
-- receipt order behind those that have one) and may split across lots, one
-- count line per lot; an overage lands on the newest lot.
create function record_material_count(
  p_brewery uuid, p_location uuid, p_bin uuid, p_counted_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_replay jsonb; v_count public.material_counts; l jsonb; v_mat public.materials;
  v_on_hand numeric; v_counted numeric; v_delta numeric; v_take numeric; v_movement uuid; lot record;
  v_lines jsonb := '[]'; v_movements jsonb;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_material_count', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'bin', p_bin, 'counted_on', p_counted_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  if jsonb_array_length(p_lines) = 0 then raise exception 'a count needs at least one material'; end if;
  insert into public.material_counts (brewery_id, location_id, bin_id, counted_on, counted_by)
  values (p_brewery, p_location, p_bin, coalesce(p_counted_on, current_date), v_actor) returning * into v_count;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into v_mat from public.materials where id = (l->>'material_id')::uuid and brewery_id = p_brewery;
    if v_mat.id is null then raise exception 'material not found'; end if;
    v_counted := (l->>'qty')::numeric;
    select coalesce(qty, 0) into v_on_hand from public.material_bin_on_hand
      where material_id = v_mat.id and location_id = p_location and bin_id = p_bin;
    v_on_hand := coalesce(v_on_hand, 0);
    v_delta := v_counted - v_on_hand;
    v_movements := '[]';
    if v_delta = 0 or not v_mat.lot_tracked then
      -- No lot to pick: one count line, and a movement only when there is a variance.
      v_movement := null;
      if v_delta <> 0 then
        insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, created_by)
        values (p_brewery, v_mat.id, p_location, p_bin, v_delta, 'count_adjustment', v_actor) returning id into v_movement;
        v_movements := v_movements || to_jsonb(v_movement);
      end if;
      insert into public.material_count_lines (brewery_id, count_id, material_id, qty_expected, qty_counted, movement_id)
      values (p_brewery, v_count.id, v_mat.id, v_on_hand, v_counted, v_movement);
    elsif v_delta > 0 then
      -- Overage: the newest lot at this bin (unrecorded stock is likeliest the delivery just counted in).
      select ml.id, coalesce(sum(mm.qty), 0) as qty into lot
      from public.material_lots ml left join public.material_movements mm
        on mm.brewery_id = p_brewery and mm.material_id = v_mat.id and mm.lot_id = ml.id
          and mm.location_id = p_location and mm.bin_id = p_bin
      where ml.material_id = v_mat.id group by ml.id, ml.received_on, ml.created_at
      order by ml.received_on desc nulls last, ml.created_at desc limit 1;
      if lot.id is null then raise exception '% is lot-tracked and has no lot to count against', v_mat.name; end if;
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, created_by)
      values (p_brewery, v_mat.id, p_location, p_bin, lot.id, v_delta, 'count_adjustment', v_actor) returning id into v_movement;
      insert into public.material_count_lines (brewery_id, count_id, material_id, lot_id, qty_expected, qty_counted, movement_id)
      values (p_brewery, v_count.id, v_mat.id, lot.id, lot.qty, lot.qty + v_delta, v_movement);
      v_movements := v_movements || to_jsonb(v_movement);
    else
      -- Shortage: earliest best-by first, lots with none behind those that have one, then receipt order.
      v_delta := -v_delta;
      for lot in
        select ml.id, sum(mm.qty) as qty
        from public.material_lots ml join public.material_movements mm
          on mm.brewery_id = p_brewery and mm.material_id = v_mat.id and mm.lot_id = ml.id
          and mm.location_id = p_location and mm.bin_id = p_bin
        where ml.material_id = v_mat.id group by ml.id, ml.best_by, ml.received_on, ml.created_at
        having sum(mm.qty) > 0
        order by ml.best_by asc nulls last, ml.received_on asc nulls last, ml.created_at
      loop
        exit when v_delta <= 0;
        v_take := least(lot.qty, v_delta);
        insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, created_by)
        values (p_brewery, v_mat.id, p_location, p_bin, lot.id, -v_take, 'count_adjustment', v_actor) returning id into v_movement;
        insert into public.material_count_lines (brewery_id, count_id, material_id, lot_id, qty_expected, qty_counted, movement_id)
        values (p_brewery, v_count.id, v_mat.id, lot.id, lot.qty, lot.qty - v_take, v_movement);
        v_movements := v_movements || to_jsonb(v_movement);
        v_delta := v_delta - v_take;
      end loop;
      if v_delta > 0 then raise exception 'count of % is below zero for its lots at this bin', v_mat.name; end if;
    end if;
    v_lines := v_lines || jsonb_build_object('material_id', v_mat.id, 'qty_expected', v_on_hand, 'qty_counted', v_counted, 'movement_ids', v_movements);
  end loop;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', v_count.id, 'counted_on', v_count.counted_on, 'lines', v_lines));
end $$;

-- ---------------------------------------------------------------- Stock transfers
-- Internal moves of stuff between two locations (spec 2026-09-06 Decision 3).
create function private.lock_transfer(p_transfer uuid, p_allowed public.stock_transfer_status[]) returns public.stock_transfers
language plpgsql set search_path = '' as $$
declare t public.stock_transfers;
begin
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'transfer not found'; end if;
  if not (t.status = any(p_allowed)) then raise exception 'transfer is %', t.status; end if;
  return t;
end $$;

create function private.create_stock_transfer_impl(
  p_brewery uuid, p_from uuid, p_to uuid, p_requested date, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_id uuid; l record;
begin
  if p_from = p_to then raise exception 'same location: use move_stock_bin'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'a transfer needs at least one line'; end if;
  insert into public.stock_transfers (brewery_id, from_location_id, to_location_id, requested_date, note, created_by)
  values (p_brewery, p_from, p_to, p_requested, p_note, auth.uid()) returning id into v_id;
  for l in select
      (e->>'sku_id')::uuid as sku_id, (e->>'material_id')::uuid as material_id,
      (e->>'keg_pool_id')::uuid as keg_pool_id, (e->>'keg_size')::public.keg_size as keg_size,
      (e->>'qty')::numeric as qty, (e->>'from_bin_id')::uuid as from_bin, (e->>'to_bin_id')::uuid as to_bin, e->>'note' as note
    from jsonb_array_elements(p_lines) e loop
    if l.keg_pool_id is not null and l.qty <> trunc(l.qty) then raise exception 'empty kegs must be whole units'; end if;
    insert into public.stock_transfer_lines (brewery_id, transfer_id, sku_id, material_id, keg_pool_id, keg_size, qty, from_bin_id, to_bin_id, note)
    values (p_brewery, v_id, l.sku_id, l.material_id, l.keg_pool_id, l.keg_size, l.qty, l.from_bin, l.to_bin, l.note);
  end loop;
  return jsonb_build_object('transfer_id', v_id);
end $$;

create function create_stock_transfer(
  p_brewery uuid, p_from uuid, p_to uuid, p_requested date, p_note text, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_stock_transfer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'from', p_from, 'to', p_to, 'requested', p_requested, 'note', p_note, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_result := private.create_stock_transfer_impl(p_brewery, p_from, p_to, p_requested, p_note, p_lines);
  return private.complete_command_request(p_request_id, v_result);
end $$;

create function submit_stock_transfer(p_transfer uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; t public.stock_transfers;
begin
  select brewery_id into v_brewery from public.stock_transfers where id = p_transfer;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'submit_stock_transfer', p_request_id, jsonb_build_object('transfer', p_transfer));
  if v_replay is not null then return v_replay; end if;
  t := private.lock_transfer(p_transfer, array['draft']::public.stock_transfer_status[]);
  update public.stock_transfers set status = 'submitted' where id = p_transfer;
  return private.complete_command_request(p_request_id, jsonb_build_object('transfer_id', p_transfer));
end $$;

create function record_stock_transfer_pick(p_transfer uuid, p_picks jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; t public.stock_transfers; pk record;
begin
  select brewery_id into v_brewery from public.stock_transfers where id = p_transfer;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'record_stock_transfer_pick', p_request_id, jsonb_build_object('transfer', p_transfer, 'picks', p_picks));
  if v_replay is not null then return v_replay; end if;
  t := private.lock_transfer(p_transfer, array['submitted','picked']::public.stock_transfer_status[]);
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_picks) e loop
    if pk.qty <> trunc(pk.qty) and exists (select 1 from public.stock_transfer_lines where id = pk.line_id and transfer_id = p_transfer and keg_pool_id is not null) then raise exception 'empty kegs must be whole units'; end if;
    update public.stock_transfer_lines set qty_picked = pk.qty where id = pk.line_id and transfer_id = p_transfer;
    if not found then raise exception 'transfer line % not found', pk.line_id; end if;
  end loop;
  update public.stock_transfers set status = 'picked' where id = p_transfer;
  return private.complete_command_request(p_request_id, jsonb_build_object('transfer_id', p_transfer));
end $$;

-- Receive: the stock arrives. Paired, volume-neutral ledger rows per line —
-- negative at the source bin, positive at the destination bin — into whichever
-- ledger the line addresses, all in this one RPC; the fleet total and the TTB
-- removal figures never move.
create function private.receive_stock_transfer_impl(p_transfer uuid, p_lines jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare t public.stock_transfers; l public.stock_transfer_lines; rq record; v_qty numeric; v_sources jsonb; src record; v_available numeric; v_explicit boolean;
begin
  t := private.lock_transfer(p_transfer, array['picked','in_transit']::public.stock_transfer_status[]);
  -- ponytail: global ledger locks, shared stock-key locks across every writer at higher throughput.
  lock table public.inventory_movements in share row exclusive mode;
  lock table public.material_movements in share row exclusive mode;
  if jsonb_typeof(p_lines) is distinct from 'array' or exists (select 1 from jsonb_array_elements(p_lines) e where not exists (select 1 from public.stock_transfer_lines where id = (e->>'line_id')::uuid and transfer_id = p_transfer))
     or (select count(distinct (e->>'line_id')::uuid) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then raise exception 'invalid transfer line coverage'; end if;
  for l in select * from public.stock_transfer_lines where transfer_id = p_transfer loop
    select (e->>'qty')::numeric into v_qty from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e->>'line_id')::uuid = l.id;
    v_qty := coalesce(v_qty, l.qty_picked, l.qty);
    if l.keg_pool_id is not null and v_qty <> trunc(v_qty) then raise exception 'empty kegs must be whole units'; end if;
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty < 0 or v_qty > least(l.qty,coalesce(l.qty_picked,l.qty)) then raise exception 'invalid received quantity'; end if;
    if l.material_id is not null and v_qty <> round(v_qty,4) then raise exception 'material quantities require at most four decimals'; end if;
    if l.sku_id is not null and v_qty <> round(v_qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
    select e->'sources', e ? 'sources' into v_sources, v_explicit from jsonb_array_elements(p_lines) e where (e->>'line_id')::uuid = l.id;
    v_sources := coalesce(v_sources, case when v_qty = 0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('lot_id', null, 'qty', v_qty)) end);
    if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'sources must be an array'; end if;
    if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e),0) <> v_qty or
       (select count(distinct jsonb_build_array((e->>'lot_id')::uuid)) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources) then raise exception 'distinct sources must sum to received quantity'; end if;
    if v_qty = 0 then
      if jsonb_array_length(v_sources) <> 0 then raise exception 'zero receipt has no sources'; end if;
      continue;
    end if;
    for src in select (e->>'lot_id')::uuid lot_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
      if src.qty is null or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <= 0 then raise exception 'invalid source quantity'; end if;
      if l.sku_id is not null then
        if src.qty <> round(src.qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
        select coalesce(sum(qty),0) into v_available from public.inventory_movements where brewery_id = t.brewery_id and sku_id = l.sku_id and bin_id = l.from_bin_id and lot_id is not distinct from src.lot_id;
        if v_available < src.qty and (coalesce(v_explicit,false) or src.lot_id is not null or exists (select 1 from public.inventory_movements where brewery_id = t.brewery_id and sku_id = l.sku_id and bin_id = l.from_bin_id and lot_id is not null)) then raise exception 'insufficient selected FG source stock'; end if;
      elsif l.material_id is not null then
        if src.qty <> round(src.qty,4) then raise exception 'material quantities require at most four decimals'; end if;
        select coalesce(sum(qty),0) into v_available from public.material_movements where brewery_id = t.brewery_id and material_id = l.material_id and bin_id = l.from_bin_id and lot_id is not distinct from src.lot_id;
        if v_available < src.qty and (coalesce(v_explicit,false) or src.lot_id is not null) then raise exception 'insufficient selected material source stock'; end if;
      elsif src.lot_id is not null then raise exception 'empty kegs have no lot';
      end if;
    end loop;
    if l.sku_id is not null then
      insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, qty, type, ref, created_by)
      select t.brewery_id, l.sku_id, t.from_location_id, l.from_bin_id, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'location_transfer'::public.movement_type, t.id, auth.uid() from jsonb_array_elements(v_sources) e
      union all select t.brewery_id, l.sku_id, t.to_location_id, l.to_bin_id, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'location_transfer'::public.movement_type, t.id, auth.uid() from jsonb_array_elements(v_sources) e;
    elsif l.material_id is not null then
      insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, note, created_by)
      select t.brewery_id, l.material_id, t.from_location_id, l.from_bin_id, (e->>'lot_id')::uuid, -(e->>'qty')::numeric, 'transfer_out'::public.material_movement_type, 'transfer ' || t.id, auth.uid() from jsonb_array_elements(v_sources) e
      union all select t.brewery_id, l.material_id, t.to_location_id, l.to_bin_id, (e->>'lot_id')::uuid, (e->>'qty')::numeric, 'transfer_in'::public.material_movement_type, 'transfer ' || t.id, auth.uid() from jsonb_array_elements(v_sources) e;
    else
      insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, note, created_by)
      values (t.brewery_id, l.keg_pool_id, l.keg_size, t.from_location_id, l.from_bin_id, v_qty::int, 'transferred_out', 'transfer ' || t.id, auth.uid()),
             (t.brewery_id, l.keg_pool_id, l.keg_size, t.to_location_id,   l.to_bin_id,   v_qty::int, 'transferred_in',  'transfer ' || t.id, auth.uid());
    end if;
  end loop;
  update public.stock_transfers set status = 'received', received_at = now() where id = p_transfer;
  return jsonb_build_object('transfer_id', p_transfer);
end $$;

create function receive_stock_transfer(p_transfer uuid, p_lines jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  select brewery_id into v_brewery from public.stock_transfers where id = p_transfer;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'receive_stock_transfer', p_request_id, jsonb_build_object('transfer', p_transfer, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  v_result := private.receive_stock_transfer_impl(p_transfer, p_lines);
  return private.complete_command_request(p_request_id, v_result);
end $$;

-- Bin move: stock changes bin inside one location. No document, no status,
-- just the paired ledger rows (spec 2026-09-06 Decision 5). Two locations is a
-- stock transfer.
create function move_stock_bin(
  p_brewery uuid, p_sku uuid, p_material uuid, p_keg_pool uuid, p_keg_size public.keg_size,
  p_qty numeric, p_from_bin uuid, p_to_bin uuid, p_note text, p_request_id uuid, p_material_lot uuid default null, p_sku_lot uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_from public.bins; v_to public.bins; v_available numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'move_stock_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'sku', p_sku, 'material', p_material, 'keg_pool', p_keg_pool, 'keg_size', p_keg_size,
                       'qty', p_qty, 'from_bin', p_from_bin, 'to_bin', p_to_bin, 'note', p_note, 'material_lot', p_material_lot, 'sku_lot', p_sku_lot));
  if v_replay is not null then return v_replay; end if;
  if p_qty is null or p_qty <= 0 or p_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'qty must be positive'; end if;
  if num_nonnulls(p_sku, p_material, p_keg_pool) <> 1 then raise exception 'exactly one of sku, material, keg pool'; end if;
  if p_material_lot is not null and p_material is null then raise exception 'material lot requires material'; end if;
  if p_sku_lot is not null and (p_sku is null or not exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and lot_id = p_sku_lot)) then raise exception 'lot does not belong to SKU'; end if;
  if p_keg_pool is not null and p_qty <> trunc(p_qty) then raise exception 'empty kegs must be whole units'; end if;
  if (p_keg_pool is null) <> (p_keg_size is null) then raise exception 'keg size is required only for empty kegs'; end if;
  if p_from_bin = p_to_bin then raise exception 'from and to bin are the same'; end if;
  select * into v_from from public.bins where id = p_from_bin and brewery_id = p_brewery;
  select * into v_to   from public.bins where id = p_to_bin   and brewery_id = p_brewery;
  if v_from.id is null or v_to.id is null then raise exception 'bin not found'; end if;
  if v_from.location_id <> v_to.location_id then raise exception 'bins are in different locations: use create_stock_transfer'; end if;
  if p_sku is not null then
    -- ponytail: global ledger lock; migrate all writers to shared stock-key locks for throughput.
    lock table public.inventory_movements in share row exclusive mode;
    if p_qty <> round(p_qty,2) then raise exception 'FG quantities require at most two decimals'; end if;
    select coalesce(sum(qty),0) into v_available from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_from_bin and lot_id is not distinct from p_sku_lot;
    if v_available < p_qty and (p_sku_lot is not null or exists (select 1 from public.inventory_movements where brewery_id = p_brewery and sku_id = p_sku and bin_id = p_from_bin and lot_id is not null)) then raise exception 'insufficient selected FG source stock'; end if;
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, note, created_by)
    values (p_brewery, p_sku, v_from.location_id, p_from_bin, -p_qty, 'location_transfer', p_sku_lot, p_note, auth.uid()),
           (p_brewery, p_sku, v_to.location_id,   p_to_bin,    p_qty, 'location_transfer', p_sku_lot, p_note, auth.uid());
  elsif p_material is not null then
    insert into public.material_movements (brewery_id, material_id, location_id, bin_id, qty, type, lot_id, note, created_by)
    values (p_brewery, p_material, v_from.location_id, p_from_bin, -p_qty, 'transfer_out', p_material_lot, p_note, auth.uid()),
           (p_brewery, p_material, v_to.location_id,   p_to_bin,    p_qty, 'transfer_in',  p_material_lot, p_note, auth.uid());
  else
    if p_keg_size is null then raise exception 'keg_size is required with a keg pool'; end if;
    insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, note, created_by)
    values (p_brewery, p_keg_pool, p_keg_size, v_from.location_id, p_from_bin, p_qty::int, 'transferred_out', p_note, auth.uid()),
           (p_brewery, p_keg_pool, p_keg_size, v_to.location_id,   p_to_bin,   p_qty::int, 'transferred_in',  p_note, auth.uid());
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('from_bin_id', p_from_bin, 'to_bin_id', p_to_bin, 'qty', p_qty));
end $$;

-- ---------------------------------------------------------------- kegs (Program 7)
-- A keg pool is a mutable single row; the fleet is the keg_events ledger
-- underneath it, read at location × bin grain by keg_bin_totals.
create function create_keg_pool(
  p_brewery uuid, p_name text, p_kind public.keg_pool_kind, p_vendor uuid, p_per_fill_cents int, p_deposit_cents int, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.keg_pools;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_keg_pool', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'kind', p_kind, 'vendor', p_vendor,
                       'per_fill_cents', p_per_fill_cents, 'deposit_cents', p_deposit_cents));
  if v_replay is not null then return v_replay; end if;
  -- The table's checks say the same; these are the readable versions.
  if p_kind = 'owned' and p_vendor is not null then raise exception 'an owned pool has no vendor'; end if;
  if p_kind <> 'owned' and p_vendor is null then raise exception 'a % pool needs a vendor', p_kind; end if;
  if p_kind = 'pay_per_fill' and p_per_fill_cents is null then raise exception 'a pay-per-fill pool needs a per-fill cost'; end if;
  insert into public.keg_pools (brewery_id, name, kind, vendor_id, per_fill_cents, deposit_cents)
  values (p_brewery, p_name, p_kind, p_vendor, p_per_fill_cents, coalesce(p_deposit_cents, 0)) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Nulls keep the current value: the form sends only what changed.
-- ponytail: coalesce cannot clear vendor or per-fill cost to null; a
-- p_clear text[] mask when someone needs to.
create function update_keg_pool(
  p_brewery uuid, p_id uuid, p_name text, p_vendor uuid, p_per_fill_cents int, p_deposit_cents int, p_active boolean, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.keg_pools;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_keg_pool', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'vendor', p_vendor,
                       'per_fill_cents', p_per_fill_cents, 'deposit_cents', p_deposit_cents, 'active', p_active));
  if v_replay is not null then return v_replay; end if;
  update public.keg_pools set
    name = coalesce(p_name, name), vendor_id = coalesce(p_vendor, vendor_id),
    per_fill_cents = coalesce(p_per_fill_cents, per_fill_cents), deposit_cents = coalesce(p_deposit_cents, deposit_cents),
    active = coalesce(p_active, active)
  where id = p_id and brewery_id = p_brewery returning * into v_row;
  if v_row.id is null then raise exception 'keg pool not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- One ledger row. qty is always positive; the reason is the direction. The
-- table's check constraint already ties customer to shipped/returned; this
-- only turns it into a readable message and pins the bin to the location.
-- transferred_in/out are not intents here: they come from stock transfers
-- and bin moves in pairs.
-- shipment_id is not taken here: linking keg events to shipments is the
-- ship_order path (slice 9), not a hand-entered id.
create function record_keg_event(
  p_brewery uuid, p_pool uuid, p_keg_size public.keg_size, p_qty int, p_reason public.keg_event_reason,
  p_location uuid, p_bin uuid, p_customer uuid, p_note text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.keg_events; v_active boolean; v_on_hand int;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'record_keg_event', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'pool', p_pool, 'keg_size', p_keg_size, 'qty', p_qty, 'reason', p_reason,
                       'location', p_location, 'bin', p_bin, 'customer', p_customer, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if p_qty <= 0 then raise exception 'qty must be positive'; end if;
  if p_reason in ('transferred_in','transferred_out') then raise exception 'transfers are recorded by stock transfers and bin moves'; end if;
  if p_reason in ('shipped','returned') and p_customer is null then raise exception 'customer is required for % kegs', p_reason; end if;
  -- found is a fleet correction at the bin; a keg found at a customer is a
  -- shipped event, so the customer balance is never moved by found.
  if p_reason in ('acquired','retired','found') and p_customer is not null then raise exception '% kegs carry no customer', p_reason; end if;
  select active into v_active from public.keg_pools where id = p_pool and brewery_id = p_brewery;
  if v_active is null then raise exception 'keg pool not found'; end if;
  if not v_active then raise exception 'keg pool is out of service'; end if;
  if not exists (select 1 from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery) then
    raise exception 'bin is not in that location';
  end if;
  if p_reason in ('retired','shipped','lost') then
    select coalesce(sum(qty), 0) into v_on_hand from public.keg_bin_on_hand
      where pool_id = p_pool and keg_size = p_keg_size and bin_id = p_bin;
    if v_on_hand < p_qty then raise exception 'not enough kegs in that bin: % on hand', v_on_hand; end if;
  end if;
  insert into public.keg_events (brewery_id, pool_id, keg_size, location_id, bin_id, qty, reason, customer_id, note, created_by)
  values (p_brewery, p_pool, p_keg_size, p_location, p_bin, p_qty, p_reason, p_customer, p_note, auth.uid()) returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- Release one open reservation so its quantity returns to ATP (Pars and
-- allocation screen). Only an open allocation can be released.
create function release_allocation(p_allocation uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_status text;
begin
  select brewery_id, status into v_brewery, v_status from public.allocations where id = p_allocation;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_brewery,array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'release_allocation',p_request_id,jsonb_build_object('allocation',p_allocation));
  if v_replay is not null then return v_replay; end if;
  if v_status <> 'open' then raise exception 'allocation is not open'; end if;
  update public.allocations set status = 'released' where id = p_allocation and status = 'open';
  return private.complete_command_request(p_request_id, jsonb_build_object('allocation_id', p_allocation));
end $$;

create function create_credit_memo(p_invoice uuid,p_lines jsonb,p_location uuid,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_invoice_staff(p_invoice,array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery,'create_credit_memo',p_request_id,jsonb_build_object('invoice',p_invoice,'lines',p_lines,'location',p_location,'reason',p_reason));
  if v_replay is not null then return v_replay; end if;
  v_result := private.create_credit_memo_impl(p_invoice,p_lines,p_location,p_reason); return private.complete_command_request(p_request_id,v_result);
end $$;

create function set_standing_allocation(p_location uuid,p_sku uuid,p_qty numeric,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  select l.brewery_id into v_brewery
  from public.locations l
  where l.id = p_location
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = l.brewery_id
        and bu.user_id = auth.uid()
        and bu.role = any(array['admin','sales']::public.staff_role[])
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'set_standing_allocation',p_request_id,jsonb_build_object('location',p_location,'sku',p_sku,'qty',p_qty));
  if v_replay is not null then return v_replay; end if;
  v_result := private.set_standing_allocation_impl(p_location,p_sku,p_qty); return private.complete_command_request(p_request_id,v_result);
end $$;

create function create_replenishment_order(p_from uuid,p_to uuid,p_lines jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  select l.brewery_id into v_brewery
  from public.locations l
  where l.id = p_to
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = l.brewery_id
        and bu.user_id = auth.uid()
        and bu.role = any(array['admin','sales']::public.staff_role[])
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'create_replenishment_order',p_request_id,jsonb_build_object('from',p_from,'to',p_to,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  v_result := private.create_replenishment_order_impl(p_from,p_to,p_lines); return private.complete_command_request(p_request_id,v_result);
end $$;
-- ---------------------------------------------------------------- RLS support indexes
-- Every staff_read / customer policy below filters on brewery_id. Tables whose
-- unique constraints or query indexes already lead with brewery_id are covered;
-- these tables were not (docs/audits/2026-09-05/security.md), so each RLS check
-- was a sequential scan. tests/schema-rls-indexes.test.ts keeps the set complete.
create index batch_additions_brewery_idx on batch_additions (brewery_id);
create index deliveries_brewery_idx on deliveries (brewery_id);
create index fermentation_readings_brewery_idx on fermentation_readings (brewery_id);
create index invoice_lines_brewery_idx on invoice_lines (brewery_id);
create index material_contracts_brewery_idx on material_contracts (brewery_id);
create index material_count_lines_brewery_idx on material_count_lines (brewery_id);
create index material_counts_brewery_idx on material_counts (brewery_id);
create index material_lots_brewery_idx on material_lots (brewery_id);
create index order_events_brewery_idx on order_events (brewery_id);
create index order_lines_brewery_idx on order_lines (brewery_id);
create index packaging_run_consumptions_brewery_idx on packaging_run_consumptions (brewery_id);
create index packaging_run_outputs_brewery_idx on packaging_run_outputs (brewery_id);
create index pos_item_mappings_brewery_idx on pos_item_mappings (brewery_id);
create index pos_locations_brewery_idx on pos_locations (brewery_id);
create index brand_approvals_brewery_idx on brand_approvals (brewery_id);
create index purchase_order_lines_brewery_idx on purchase_order_lines (brewery_id);
create index receipt_lines_brewery_idx on receipt_lines (brewery_id);
create index receipts_brewery_idx on receipts (brewery_id);
create index recipe_ingredients_brewery_idx on recipe_ingredients (brewery_id);
create index recipe_versions_brewery_idx on recipe_versions (brewery_id);
create index ship_tos_brewery_idx on ship_tos (brewery_id);
create index shipments_brewery_idx on shipments (brewery_id);
create index format_bom_brewery_idx on format_bom (brewery_id);
create index state_registrations_brewery_idx on state_registrations (brewery_id);
create index taproom_pars_brewery_idx on taproom_pars (brewery_id);
create index transfers_brewery_idx on transfers (brewery_id);
create index volume_adjustments_brewery_idx on volume_adjustments (brewery_id);
-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  -- Staff read their tenant's registered query surface. Writes are explicitly
  -- limited below to the exact RPC path and command roles that own them.
  foreach t in array array[
    'customers','ship_tos','vendors','materials','material_lots','styles','brands','keg_pools','skus',
    'formats','format_components','format_bom','price_groups','channel_prices','locations','bins','sale_channels','stock_transfers','stock_transfer_lines','allocations','taproom_pars',
    'recipes','recipe_versions','recipe_ingredients','vessels','batches','vessel_occupancies',
    'fermentation_readings','batch_additions','packaging_runs','lots','packaging_run_outputs',
    'packaging_run_consumptions','material_contracts','purchase_orders','purchase_order_lines',
    'receipts','receipt_lines','material_counts','material_count_lines','orders','order_lines',
    'shipments','invoices','invoice_lines','pos_locations','pos_item_mappings','pos_sales',
    'brand_approvals','state_registrations','brewery_state_licenses','report_filings',
    'routes','deliveries','invoice_questions']
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
-- (select auth.uid()) is evaluated once per statement, not once per row.
create policy member_read on brewery_users for select using (user_id = (select auth.uid()) or is_staff_of(brewery_id));
create policy self_read on customer_users for select using (user_id = (select auth.uid()));

-- Portal customers
create policy customer_read_own on customers for select using (id in (select my_customer_ids()));
create policy customer_own on ship_tos for select using (customer_id in (select my_customer_ids()));
create policy customer_read on brands for select
  using (brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy customer_read on formats for select
  using (brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy customer_read on skus for select
  using (active and brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy customer_own_prices on channel_prices for select
  using (sale_channel_id in (select c.sale_channel_id from customers c where c.id in (select my_customer_ids())));
create policy customer_read_portal_source on locations for select
  using (
    id in (
      select b.portal_fulfillment_location_id from public.portal_brewery b
      where b.id = locations.brewery_id
    )
  );
create policy customer_read on orders for select using (customer_id in (select my_customer_ids()));
create policy customer_read on order_lines for select
  using (order_id in (select id from public.orders where customer_id in (select public.my_customer_ids())));
create policy customer_read on shipments for select
  using (order_id in (select id from orders where customer_id in (select my_customer_ids())));
create policy customer_read on invoices for select using (customer_id in (select my_customer_ids()));
create policy customer_read on invoice_lines for select
  using (invoice_id in (select id from invoices where customer_id in (select my_customer_ids())));
create policy customer_read on invoice_questions for select using (customer_id in (select my_customer_ids()));
create policy customer_read on deliveries for select
  using (shipment_id in (select s.id from shipments s join orders o on o.id = s.order_id where o.customer_id in (select my_customer_ids())));
create policy staff_read on order_events for select using (public.is_staff_of(brewery_id));
create policy customer_read on order_events for select
  using (order_id in (select id from orders where customer_id in (select my_customer_ids())));
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
-- Preferences belong to current staff even before linking or after unlinking.
create policy notification_preferences_self_read on notification_preferences for select to authenticated
  using (user_id = (select auth.uid()) and (select is_staff_of(brewery_id)));

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

-- Callback lookup before any token exchange. Service-role only; p_actor must
-- still be a current admin of the owning brewery. Null for forged state.
create function find_chat_oauth_intent(p_state_hash text, p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then return null; end if;
  select * into r from public.chat_installations where oauth_intent_hash = p_state_hash;
  if not found or not exists (
    select 1 from public.brewery_users
    where brewery_id = r.brewery_id and user_id = p_actor and role = 'admin'
  ) then return null; end if;
  return jsonb_build_object(
    'installation_id', r.id, 'brewery_id', r.brewery_id, 'state', r.state, 'kind', r.oauth_intent_kind,
    'redirect_uri', r.oauth_redirect_uri, 'expires_at', r.oauth_expires_at, 'consumed_at', r.oauth_consumed_at,
    'external_installation_id', r.external_installation_id);
end $$;

-- Consumes the intent and activates the mapping. Replaying a consumed intent
-- for the same workspace is a no-op success; anything else fails closed.
-- token_store_key is always slack:installation:<team id>; the caller key is ignored.
create function activate_chat_installation(
  p_installation uuid, p_state_hash text, p_redirect_uri text, p_external_installation_id text,
  p_external_enterprise_id text, p_display_label text, p_token_store_key text, p_granted_capabilities jsonb,
  p_actor uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations; v_key text := 'slack:installation:' || p_external_installation_id;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  if not exists (
    select 1 from public.brewery_users
    where brewery_id = r.brewery_id and user_id = p_actor and role = 'admin'
  ) then raise exception 'permission denied: brewery admin required' using errcode = '42501'; end if;
  if r.oauth_intent_hash is distinct from p_state_hash then raise exception 'oauth state mismatch'; end if;
  if r.oauth_consumed_at is not null then
    if r.state = 'active' and r.external_installation_id = p_external_installation_id
       and r.token_store_key = v_key then
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
               and state <> 'disconnected' and id <> r.id) then
    raise exception 'workspace is already connected to another brewery';
  end if;
  update public.chat_installations
    set state = 'active', external_installation_id = p_external_installation_id,
        external_enterprise_id = p_external_enterprise_id, display_label = p_display_label,
        token_store_key = v_key, granted_capabilities = coalesce(p_granted_capabilities, '{}'),
        oauth_consumed_at = now(), installed_at = coalesce(installed_at, now()), disabled_at = null,
        last_failure_code = null, last_healthy_at = now(), last_health_checked_at = now(), updated_at = now()
    where id = r.id;
  return jsonb_build_object('installation_id', r.id, 'replayed', false);
end $$;

-- Health path (jobs run as service_role).
create function mark_chat_installation_reauthorization(p_installation uuid, p_failure_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
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
        token_store_key = 'disconnected:' || r.id,
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
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  update public.chat_installations
    set oauth_reconciled_at = case when p_credential_deleted then now() else null end,
        last_failure_code = p_failure_code, updated_at = now()
    where id = r.id;
end $$;

revoke execute on function assert_chat_admin(uuid),
  begin_chat_installation(uuid, text, text, text), begin_chat_reauthorization(uuid, text, text),
  find_chat_oauth_intent(text, uuid),
  activate_chat_installation(uuid, text, text, text, text, text, text, jsonb, uuid),
  mark_chat_installation_reauthorization(uuid, text), disable_chat_installation(uuid),
  disconnect_chat_installation(uuid), reconcile_chat_installation(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function
  begin_chat_installation(uuid, text, text, text), begin_chat_reauthorization(uuid, text, text),
  disable_chat_installation(uuid), disconnect_chat_installation(uuid)
  to authenticated;
grant execute on function
  find_chat_oauth_intent(text, uuid),
  activate_chat_installation(uuid, text, text, text, text, text, text, jsonb, uuid),
  mark_chat_installation_reauthorization(uuid, text), reconcile_chat_installation(uuid, boolean, text)
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

create function unlink_chat_user(p_brewery uuid, p_link uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.chat_user_links; v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, enum_range(null::public.staff_role));
  v_replay := private.claim_command_request(p_brewery, 'unlink_chat_user', p_request_id, jsonb_build_object('link',p_link));
  if v_replay is not null then return v_replay; end if;
  select * into l from public.chat_user_links where id = p_link and brewery_id = p_brewery for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  if l.user_id is distinct from auth.uid() and public.staff_role(p_brewery) <> 'admin' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform private.unlink_chat_identity(l.installation_id, l.user_id);
  return private.complete_command_request(p_request_id, '{"ok":true}');
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
  unlink_chat_user(uuid, uuid, uuid), resolve_chat_actor(text, text, text)
  from public, anon, authenticated;
grant execute on function consume_chat_link_proof(text), unlink_chat_user(uuid, uuid, uuid) to authenticated;
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
    where (o.status = 'confirmed' and o.requested_ship_date is not null)
       -- a picked order with a line still owed keeps its pick
       or (o.status = 'picked' and exists (
             select 1 from order_lines ol where ol.order_id = o.id and coalesce(ol.qty_picked, 0) < ol.qty_ordered))
  union all
  -- standing work, not date-due: staged beer to put back while the flag is set
  select o.brewery_id, 'restock_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.needs_restock)),
         'ORD-' || lpad(o.order_no::text, 4, '0'),
         'restock staged beer',
         null::timestamptz,
         '/orders/' || o.id || '/restock',
         array['admin','warehouse']::text[],
         null::uuid
    from orders o
    where o.needs_restock = true
  union all
  -- only the lowest undelivered stop of a departed, unreturned route is "next"
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
    where d.delivered_at is null and r.departed_at is not null and r.returned_at is null
      and d.stop_no = (select min(d2.stop_no) from deliveries d2 where d2.route_id = d.route_id and d2.delivered_at is null)
  union all
  -- overdue when the latest reading (or occupancy start when none) plus the
  -- brewery cadence has passed; never synthesizes a reading
  select vo.brewery_id, 'fermentation_reading_overdue', 'occupancy', vo.id::text,
         md5(concat_ws('|', last.at, vo.started_at, b.fermentation_reading_due_hours)),
         v.name,
         'reading due',
         coalesce(last.at, vo.started_at) + make_interval(hours => b.fermentation_reading_due_hours),
         '/cellar/' || vo.id || '/reading',
         array['admin','brewer']::text[],
         null::uuid
    from vessel_occupancies vo
    join vessels v on v.id = vo.vessel_id
    join breweries b on b.id = vo.brewery_id
    left join lateral (select max(fr.at) as at from fermentation_readings fr where fr.occupancy_id = vo.id) last on true
    where vo.ended_at is null
  union all
  -- a buyer's open question about an invoice; Mark answered clears it
  -- the row is one question: two open questions on one invoice are two rows,
  -- so the subject is the question and only the href points at the invoice
  select q.brewery_id, 'invoice_question', 'invoice', q.id::text,
         md5(concat_ws('|', q.id, q.answered_at)),
         'INV-' || lpad(i.invoice_no::text, 4, '0') || ' · ' || c.name,
         'buyer asked: ' || left(q.body, 60),
         null::timestamptz,
         '/invoices/' || q.invoice_id,
         array['admin','sales']::text[],
         null::uuid
    from invoice_questions q
    join invoices i on i.id = q.invoice_id
    join customers c on c.id = q.customer_id
    where q.answered_at is null;
grant select on private.today_candidates to service_role;

-- Every reason has a live MGR page: /work/deliveries/<stop> (Program 8) and
-- /cellar/<occupancy>/reading.
create function today_live_reasons() returns text[]
language sql immutable set search_path = '' as $$ select array['submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question'] $$;

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
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
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
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
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
create function set_notification_preference(p_brewery uuid, p_reason text, p_enabled boolean, p_quiet_start time, p_quiet_end time, p_quiet_tz text, p_set_quiet boolean, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, enum_range(null::public.staff_role));
  v_replay := private.claim_command_request(p_brewery, 'set_notification_preference', p_request_id,
    jsonb_build_object('reason',p_reason,'enabled',p_enabled,'start',p_quiet_start,'end',p_quiet_end,'timezone',p_quiet_tz,'set_quiet',p_set_quiet));
  if v_replay is not null then return v_replay; end if;
  perform private.set_chat_preference(p_brewery, auth.uid(), p_reason, p_enabled);
  if p_set_quiet then
    perform private.set_chat_quiet_hours(p_brewery, auth.uid(), p_quiet_start, p_quiet_end, p_quiet_tz);
  end if;
  return private.complete_command_request(p_request_id, '{"ok":true}');
end $$;

-- One active private operations channel per installation; replacing it blocks
-- the previous destination so no further digest routes there.
create function set_notification_destination(p_installation uuid, p_external_destination_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; v_id uuid;
begin
  select * into i from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
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
  set_notification_preference(uuid, text, boolean, time, time, text, boolean, uuid), set_notification_destination(uuid, text),
  set_brewery_quiet_hours(uuid, time, time)
  from public, anon, authenticated;
grant execute on function record_submitted_order_occurrence(uuid),
  set_notification_preference(uuid, text, boolean, time, time, text, boolean, uuid), set_notification_destination(uuid, text),
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
declare i public.chat_installations; v_id uuid; v_existing public.chat_callback_receipts;
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
  select * into v_existing from public.chat_callback_receipts where installation_id = i.id and callback_id = p_callback_id;
  if v_existing.payload_hash <> p_payload_hash or v_existing.external_user_id is distinct from p_external_user_id
     or v_existing.callback_kind <> p_callback_kind then raise exception 'callback conflict' using errcode = 'MG409'; end if;
  return jsonb_build_object('receipt_id', v_existing.id, 'installation_id', i.id, 'brewery_id', i.brewery_id,
    'duplicate', v_id is null, 'disposition', v_existing.disposition, 'result', v_existing.result);
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
        where r.disposition = 'pending' and r.callback_kind = 'app_home_opened' order by r.received_at
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
create function get_chat_delivery_context(p_delivery uuid, p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.chat_assert_job();
  with current_items as materialized (
    select c.* from public.notification_deliveries d
      cross join lateral public.scan_chat_today_candidates(d.brewery_id,p_now) c
      where d.id=p_delivery
  )
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
    'quiet_release_at', case when dest.kind='personal' then greatest(d.next_attempt_at,
      public.chat_quiet_release(p_now, coalesce(p.quiet_hours_start,i.quiet_hours_start),
        case when p.quiet_hours_start is not null then p.quiet_hours_end else i.quiet_hours_end end,
        case when p.quiet_hours_start is not null then coalesce(p.quiet_hours_timezone,b.timezone) else coalesce(i.quiet_hours_timezone,b.timezone) end)) else null end,
    'external_user_id', (select l.external_user_id from public.chat_user_links l where l.installation_id=i.id and l.user_id=dest.user_id and l.state='active'),
    'source_current', o.reason='operations_digest' or coalesce(c.source_version=o.source_version,false),
    -- A removed/changed-role user gets no provider write. When the source has
    -- resolved, only a still-eligible prior recipient may get a resolved update.
    'recipient_eligible', bu.user_id is not null and
      case when c.subject_id is not null then (bu.role='admin' or bu.role::text=any(c.recipient_roles)) and (c.assigned_user_id is null or c.assigned_user_id=dest.user_id)
        else (bu.role='admin' or o.payload->'recipient_roles' ? bu.role::text) and (o.payload->>'assigned_user_id' is null or o.payload->>'assigned_user_id'=dest.user_id::text) end,
    'link_active', exists (select 1 from public.chat_user_links l
      where l.installation_id = i.id and l.user_id = dest.user_id and l.state = 'active'),
    'preference_enabled', coalesce((select p.enabled from public.notification_preferences p
      where p.brewery_id = d.brewery_id and p.user_id = dest.user_id and p.reason = o.reason), true),
    'counts', case when o.reason = 'operations_digest' then
      (select coalesce(jsonb_object_agg(x.reason, x.n), '{}'::jsonb)
         from (select reason, count(*) as n from current_items group by reason) x)
      else null end)
  from public.notification_deliveries d
  join public.notification_occurrences o on o.id = d.occurrence_id
  join public.notification_destinations dest on dest.id = d.destination_id
  join public.chat_installations i on i.id = d.installation_id
  join public.breweries b on b.id=d.brewery_id
  left join public.notification_preferences p on p.brewery_id=d.brewery_id and p.user_id=dest.user_id and p.reason=o.reason
  left join current_items c on c.reason=o.reason and c.subject_type=o.subject_type and c.subject_id=o.subject_id
  left join public.brewery_users bu on bu.brewery_id=d.brewery_id and bu.user_id=dest.user_id
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
  complete_chat_callback_receipt(uuid, text, text), get_chat_home_items(uuid, text), get_chat_delivery_context(uuid, timestamptz),
  block_notification_destination(uuid, text)
  from public, anon, authenticated;
grant execute on function list_chat_scan_targets(), claim_chat_callback_receipts(int, timestamptz),
  complete_chat_callback_receipt(uuid, text, text), get_chat_home_items(uuid, text), get_chat_delivery_context(uuid, timestamptz),
  block_notification_destination(uuid, text)
  to service_role;
-- ---------------------------------------------------------------- immutability grants
-- The existing staff insert policies are effective only with these bounded DML grants.

-- ---------------------------------------------------------------- Data API grants
-- Table writes are deliberately unavailable to application roles. All state
-- changes enter through the narrow, request-ledger-backed RPC list below.
revoke all on schema public, private, extensions from public, anon, authenticated;
-- Bin-grain stock identities for explicit moves; null lot means untracked stock.
create view bin_move_stock with (security_invoker = true) as
select m.brewery_id, m.location_id, m.bin_id, 'sku'::text as kind, m.sku_id as stock_id,
  m.lot_id, null::text as keg_size, s.name, 'SKU units'::text as unit, l.code as lot_code, sum(m.qty) as qty
from inventory_movements m join skus s on s.id = m.sku_id left join lots l on l.id = m.lot_id
 group by m.brewery_id, m.location_id, m.bin_id, m.sku_id, m.lot_id, s.name, l.code
union all
select m.brewery_id, m.location_id, m.bin_id, 'material', m.material_id,
  m.lot_id, null::text, s.name, s.base_uom::text, l.lot_code, sum(m.qty)
from material_movements m join materials s on s.id = m.material_id left join material_lots l on l.id = m.lot_id
 group by m.brewery_id, m.location_id, m.bin_id, m.material_id, m.lot_id, s.name, s.base_uom, l.lot_code
union all
select m.brewery_id, m.location_id, m.bin_id, 'keg', m.pool_id,
  null::uuid, m.keg_size::text, p.name, 'empty kegs', null::text, m.qty
from keg_bin_on_hand m join keg_pools p on p.id = m.pool_id;

grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
-- qbo_connections and pos_connections hold connection metadata only; token
-- material lives in private.integration_tokens behind service-only RPCs.
grant select on breweries, brewery_users, customer_users,
  customers, ship_tos, vendors, materials, material_lots, styles, brands, keg_pools, skus,
  formats, format_components, format_bom, price_groups, channel_prices, locations, bins, sale_channels, stock_transfers, stock_transfer_lines, inventory_movements, allocations, taproom_pars,
  recipes, recipe_versions, recipe_ingredients, vessels, batches, vessel_occupancies, transfers,
  volume_adjustments, fermentation_readings, material_movements, batch_additions, packaging_runs,
  lots, packaging_run_outputs, packaging_run_consumptions, material_contracts, purchase_orders,
  purchase_order_lines, receipts, receipt_lines, material_counts, material_count_lines, orders,
  order_lines, order_events, shipments, invoices, invoice_lines, invoice_questions, keg_events,
  pos_locations, pos_item_mappings, pos_sales, brand_approvals, state_registrations,
  brewery_state_licenses, report_filings, routes, deliveries, qbo_connections, pos_connections
  to authenticated;
-- Security-invoker views retain the underlying tables' RLS predicates; expose
-- only the derived reads consumed by registered commands.
grant select on bin_move_stock, on_hand, bin_on_hand, atp, invoice_totals, keg_deposit_balances, portal_brewery, sku_prices,
  format_volumes, occupancy_volumes, product_volume_requirements,
  material_on_hand, material_bin_on_hand, material_lot_on_hand, material_on_order, material_last_cost,
  contract_balances, material_requirements, po_open_balances, vendor_lead_times,
  keg_bin_totals, keg_bin_on_hand, keg_fleet_totals, keg_customer_balances to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

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

-- Function defaults are executable by PUBLIC. Revoke them globally, then expose
-- only the RLS-safe reads and the explicit command RPC contract.
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function my_brewery_ids(), my_customer_ids(), is_staff_of(uuid), staff_role(uuid), portal_availability(uuid), portal_brewery_rows()
  to authenticated;
grant execute on function
  provision_brewery(text,text,text,uuid),
  create_sku(uuid,uuid,uuid,text,text,uuid),
  update_sku(uuid,uuid,boolean,text,uuid),
  upsert_brand(uuid,uuid,text,text,numeric,text,text,uuid,text,uuid),
  upsert_format(uuid,uuid,text,public.format_basis,public.package_type,public.keg_size,int,numeric,uuid),
  replace_format_components(uuid,uuid,jsonb,uuid),
  create_location(uuid,text,public.location_kind,uuid),
  update_location(uuid,uuid,text,public.location_kind,uuid),
  update_brewery(uuid,text,text,text,text,text,int,uuid),
  list_team_members(uuid),
  claim_invite_request(uuid,text,text,public.staff_role,uuid,uuid),
  complete_invite_membership(uuid),
  record_invite_failure(uuid),
  update_staff_role(uuid,uuid,public.staff_role,uuid),
  revoke_staff(uuid,uuid,uuid),
  raise_invoice_question(uuid,uuid,text,uuid),
  resolve_invoice_question(uuid,uuid,uuid),
  create_bin(uuid,uuid,text,uuid),
  update_bin(uuid,uuid,text,uuid),
  delete_bin(uuid,uuid,uuid),
  begin_csv_import(uuid,text,jsonb,uuid), import_csv_row(uuid,uuid,integer),
  upsert_customer(uuid,uuid,text,public.customer_type,text,uuid,text,text,public.tax_treatment,uuid),
  upsert_sale_channel(uuid,uuid,text,public.tax_treatment,uuid),
  delete_sale_channel(uuid,uuid,uuid),
  set_brewery_gravity_unit(uuid,text,uuid),
  set_my_gravity_unit(uuid,text,uuid),
  upsert_ship_to(uuid,uuid,uuid,text,text,text,text,text,text,uuid,boolean),
  upsert_price_group(uuid,uuid,text,int,int,uuid),
  delete_price_group(uuid,uuid,uuid),
  set_channel_price(uuid,uuid,uuid,uuid,int,uuid),
  clear_channel_price(uuid,uuid,uuid,uuid,uuid),
  replace_format_bom(uuid,uuid,jsonb,uuid),
  record_inventory_movement(uuid,uuid,uuid,uuid,numeric,public.movement_type,uuid,text,text,uuid,uuid),
  set_taproom_par(uuid,uuid,uuid,numeric,uuid),
  set_portal_fulfillment_source(uuid,uuid,uuid),
  create_order(uuid,public.order_kind,uuid,uuid,uuid,uuid,date,text,text,jsonb,uuid),
  portal_create_order(uuid,uuid,uuid,text,text,jsonb,uuid,date),
  update_draft_order(uuid,uuid,date,text,text,jsonb,uuid,boolean,uuid,uuid),
  submit_order(uuid,uuid,uuid,uuid),
  confirm_order(uuid,uuid),
  adjust_order_lines(uuid,jsonb,text,uuid),
  cancel_order(uuid,text,uuid),
  record_pick(uuid,jsonb,uuid),
  confirm_restock(uuid,uuid),
  confirm_delivery(uuid,text,uuid),
  resolve_short_pick(uuid,uuid,numeric,text,text,uuid),
  ship_order(uuid,jsonb,text,text,uuid,text),
  create_credit_memo(uuid,jsonb,uuid,text,uuid),
  return_shipment(uuid,jsonb,uuid,text,uuid),
  release_allocation(uuid,uuid),
  create_stock_transfer(uuid,uuid,uuid,date,text,jsonb,uuid),
  submit_stock_transfer(uuid,uuid),
  record_stock_transfer_pick(uuid,jsonb,uuid),
  receive_stock_transfer(uuid,jsonb,uuid),
  move_stock_bin(uuid,uuid,uuid,uuid,public.keg_size,numeric,uuid,uuid,text,uuid,uuid,uuid),
  set_standing_allocation(uuid,uuid,numeric,uuid),
  create_replenishment_order(uuid,uuid,jsonb,uuid),
  create_recipe(uuid,uuid,text,text,uuid),
  create_recipe_version(uuid,uuid,numeric,numeric,numeric,int,numeric,text,jsonb,uuid),
  upsert_vessel(uuid,uuid,text,public.vessel_kind,numeric,uuid),
  schedule_batch(uuid,uuid,uuid,date,numeric,text,uuid),
  record_brew_day(uuid,uuid,uuid,numeric,date,uuid),
  record_cellar_transfer(uuid,uuid,uuid,numeric,numeric,uuid),
  record_fermentation_reading(uuid,uuid,timestamptz,numeric,numeric,numeric,text,uuid),
  schedule_packaging_run(uuid,uuid,date,uuid,jsonb,uuid),
  update_packaging_run(uuid,uuid,uuid,jsonb,timestamptz,uuid),
  close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid),
  record_repack(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid),
  upsert_vendor(uuid,uuid,text,text,text,int,text,boolean,uuid),
  upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,uuid),
  upsert_material_contract(uuid,uuid,uuid,uuid,numeric,int,date,date,text,uuid),
  create_purchase_order(uuid,uuid,date,text,jsonb,uuid),
  send_purchase_order(uuid,uuid,text,uuid),
  receive_purchase_order(uuid,uuid,uuid,uuid,date,jsonb,uuid),
  draft_purchase_order_from_requirements(uuid,uuid[],uuid),
  record_material_count(uuid,uuid,uuid,date,jsonb,uuid),
  create_keg_pool(uuid,text,public.keg_pool_kind,uuid,int,int,uuid),
  update_keg_pool(uuid,uuid,text,uuid,int,int,boolean,uuid),
  record_keg_event(uuid,uuid,public.keg_size,int,public.keg_event_reason,uuid,uuid,uuid,text,uuid),
  save_route(uuid,uuid,text,date,uuid,text,text,jsonb,uuid),
  depart_route(uuid,uuid),
  return_route(uuid,uuid),
  upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid),
  upsert_state_registration(uuid,uuid,text,text,date,date,uuid),
  upsert_brewery_state_license(uuid,text,text,text,date,text,uuid),
  generate_compliance_report(uuid,text,date,date),
  file_compliance_report(uuid,text,date,date,text,uuid)
  to authenticated;
grant usage on schema private, extensions to service_role;
-- service_role reaches `private` only for the UUID default its seed inserts
-- evaluate; the ledger and token store stay behind owner-run definer functions.
grant execute on function private.new_uuid() to service_role;
grant execute on all functions in schema public to service_role;

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
  disable_chat_installation(uuid),
  disconnect_chat_installation(uuid),
  consume_chat_link_proof(text),
  unlink_chat_user(uuid, uuid, uuid),
  today_live_reasons(),
  get_today_items(uuid, timestamptz),
  record_submitted_order_occurrence(uuid),
  set_notification_preference(uuid, text, boolean, time, time, text, boolean, uuid),
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

-- ---------------------------------------------------------------- integration-owned chat actions
-- These helpers mutate delivery/preferences only, never domain state. Their
-- caller supplies an identity derived from auth.uid() or a receipt-bound link.
create function private.set_chat_preference(p_brewery uuid, p_user uuid, p_reason text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_reason is null or p_reason <> all(array['submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question','operations_digest']) or p_enabled is null then
    raise exception 'invalid notification preference' using errcode = '22023';
  end if;
  insert into public.notification_preferences (brewery_id,user_id,reason,enabled)
  values (p_brewery,p_user,p_reason,p_enabled)
  on conflict (brewery_id,user_id,reason) do update set enabled=excluded.enabled, updated_at=now();
end $$;

create function private.set_chat_quiet_hours(p_brewery uuid, p_user uuid, p_start time, p_end time, p_timezone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (p_start is null) <> (p_end is null) or p_start = p_end or p_start >= time '24:00' or p_end >= time '24:00'
    or (p_timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name=p_timezone)) then
    raise exception 'invalid quiet hours' using errcode = '22023';
  end if;
  insert into public.notification_preferences (brewery_id,user_id,reason,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,use_brewery_timezone)
  select p_brewery,p_user,r,p_start,p_end,p_timezone,p_timezone is null
    from unnest(array['submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question','operations_digest']) r
  on conflict (brewery_id,user_id,reason) do update set quiet_hours_start=excluded.quiet_hours_start,
    quiet_hours_end=excluded.quiet_hours_end,quiet_hours_timezone=excluded.quiet_hours_timezone,
    use_brewery_timezone=excluded.use_brewery_timezone,updated_at=now();
  update public.notification_deliveries d set next_attempt_at=greatest(d.next_attempt_at,
    public.chat_quiet_release(now(),coalesce(p_start,i.quiet_hours_start),coalesce(p_end,i.quiet_hours_end),
      coalesce(p_timezone,i.quiet_hours_timezone,b.timezone))),updated_at=now()
    from public.notification_destinations dst,public.chat_installations i,public.breweries b
    where dst.id=d.destination_id and dst.user_id=p_user and d.brewery_id=p_brewery
      and i.id=d.installation_id and b.id=p_brewery and d.state in ('queued','retrying');
end $$;

create function private.snooze_chat_delivery(p_brewery uuid, p_user uuid, p_delivery uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'snooze must be within the next seven days' using errcode='22023';
  end if;
  update public.notification_deliveries d set next_attempt_at=greatest(d.next_attempt_at,p_until),
    state='queued',lease_expires_at=null,updated_at=now()
    from public.notification_destinations dst, public.chat_installations i, public.chat_user_links l, public.notification_occurrences o
    where d.id=p_delivery and d.brewery_id=p_brewery and dst.id=d.destination_id and dst.user_id=p_user
      and dst.kind='personal' and dst.state='active' and i.id=d.installation_id and i.state='active'
      and l.installation_id=i.id and l.user_id=p_user and l.state='active'
      and o.id=d.occurrence_id and o.state='active'
      and exists (
        select 1 from public.scan_chat_today_candidates(p_brewery,now()) c
          join public.brewery_users bu on bu.brewery_id=c.brewery_id and bu.user_id=p_user
          where c.reason=o.reason and c.subject_type=o.subject_type and c.subject_id=o.subject_id and c.source_version=o.source_version
            and (bu.role='admin' or (bu.role::text=any(c.recipient_roles) and (c.assigned_user_id is null or c.assigned_user_id=p_user))));
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create function private.unlink_chat_identity(p_installation uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_user_links set state='unlinked',unlinked_at=now(),proof_hash=null,updated_at=now()
    where installation_id=p_installation and user_id=p_user and state <> 'unlinked';
  update public.notification_deliveries d set state='suppressed',lease_expires_at=null,last_error_code='unlinked',updated_at=now()
    from public.notification_destinations dst where dst.id=d.destination_id and dst.user_id=p_user
      and d.installation_id=p_installation and d.state in ('queued','retrying','leased');
  update public.chat_action_intents set expires_at=now() where installation_id=p_installation and user_id=p_user and consumed_at is null;
end $$;

create function set_personal_quiet_hours(p_brewery uuid, p_start time, p_end time, p_timezone text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  perform private.assert_staff(p_brewery,enum_range(null::public.staff_role));
  replay := private.claim_command_request(p_brewery,'set_personal_quiet_hours',p_request_id,jsonb_build_object('start',p_start,'end',p_end,'timezone',p_timezone));
  if replay is not null then return replay; end if;
  perform private.set_chat_quiet_hours(p_brewery,auth.uid(),p_start,p_end,p_timezone);
  return private.complete_command_request(p_request_id,'{"ok":true}');
end $$;

create function snooze_notification(p_brewery uuid, p_delivery uuid, p_until timestamptz, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare replay jsonb;
begin
  perform private.assert_staff(p_brewery,enum_range(null::public.staff_role));
  replay := private.claim_command_request(p_brewery,'snooze_notification',p_request_id,jsonb_build_object('delivery',p_delivery,'until',p_until));
  if replay is not null then return replay; end if;
  perform private.snooze_chat_delivery(p_brewery,auth.uid(),p_delivery,p_until);
  return private.complete_command_request(p_request_id,'{"ok":true}');
end $$;

create function issue_chat_action_intent(p_installation uuid, p_external_user_id text, p_action text, p_delivery uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; actor jsonb; v_id uuid; v_input jsonb:='{}'; d record;
begin
  perform public.chat_assert_job();
  select * into i from public.chat_installations where id=p_installation;
  actor := public.resolve_chat_actor(i.provider,i.external_installation_id,p_external_user_id);
  if actor is null then return null; end if;
  if p_action not in ('mgr_open','mgr_snooze','mgr_mute_reason','mgr_preferences','mgr_save_preferences','mgr_refresh','mgr_unlink') then
    raise exception 'unsupported chat action' using errcode='22023'; end if;
  if p_action in ('mgr_snooze','mgr_mute_reason') then
    select nd.id,o.reason,o.semantic_key into d from public.notification_deliveries nd
      join public.notification_destinations dst on dst.id=nd.destination_id
      join public.notification_occurrences o on o.id=nd.occurrence_id
      where nd.id=p_delivery and nd.installation_id=i.id and dst.user_id=(actor->>'user_id')::uuid
        and dst.kind='personal' and dst.state='active' and o.state='active';
    if not found then return null; end if;
    v_input:=jsonb_build_object('delivery',d.id,'reason',d.reason,'until',now()+interval '1 hour');
  end if;
  insert into public.chat_action_intents (brewery_id,installation_id,user_id,provider,external_user_id,
    action_origin_hash,command_name,input_hash,subject_type,subject_id,subject_version,request_id,preview_token_hash,allowed_action,integration_input,expires_at)
  values (i.brewery_id,i.id,(actor->>'user_id')::uuid,i.provider,p_external_user_id,
    encode(extensions.digest(p_external_user_id,'sha256'),'hex'),p_action,encode(extensions.digest(v_input::text,'sha256'),'hex'),
    'chat',coalesce(p_delivery::text,i.id::text),'integration-only',gen_random_uuid(),'integration-only',p_action,v_input,now()+interval '10 minutes')
  returning id into v_id;
  return v_id;
end $$;

-- A receipt is committed before this RPC runs. Identity and receipt replay are
-- separate from ordinary user command requests; no JWT impersonation occurs.
create function consume_chat_action_intent(p_receipt uuid, p_intent uuid, p_action text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.chat_callback_receipts; t public.chat_action_intents; i public.chat_installations;
  actor jsonb; v_result jsonb; pref record; submit_intent uuid;
begin
  perform public.chat_assert_job();
  select * into r from public.chat_callback_receipts where id=p_receipt for update;
  if not found then raise exception 'receipt required' using errcode='42501'; end if;
  if r.result is not null then return r.result; end if;
  select * into t from public.chat_action_intents where id=p_intent for update;
  select * into i from public.chat_installations where id=r.installation_id;
  actor:=public.resolve_chat_actor(r.provider,i.external_installation_id,r.external_user_id);
  v_result:='{"disposition":"ignored","code":"stale_action"}';
  if t.id is not null and actor is not null and t.installation_id=r.installation_id and t.brewery_id=r.brewery_id
    and t.provider=r.provider and t.user_id=(actor->>'user_id')::uuid and t.external_user_id=r.external_user_id
    and t.allowed_action=p_action and r.callback_kind=p_action and t.expires_at>now() and t.consumed_at is null then
    begin
      if p_action='mgr_snooze' then
        perform private.snooze_chat_delivery(t.brewery_id,t.user_id,(t.integration_input->>'delivery')::uuid,(t.integration_input->>'until')::timestamptz);
      elsif p_action='mgr_mute_reason' then
        perform private.set_chat_preference(t.brewery_id,t.user_id,t.integration_input->>'reason',false);
      elsif p_action='mgr_save_preferences' then
        if jsonb_typeof(p_input->'enabled') <> 'boolean' or nullif(p_input->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or nullif(p_input->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'invalid preferences' using errcode='22023'; end if;
        perform private.set_chat_preference(t.brewery_id,t.user_id,p_input->>'reason',(p_input->>'enabled')::boolean);
        perform private.set_chat_quiet_hours(t.brewery_id,t.user_id,nullif(p_input->>'start','')::time,nullif(p_input->>'end','')::time,nullif(p_input->>'timezone',''));
      elsif p_action='mgr_unlink' then
        perform private.unlink_chat_identity(t.installation_id,t.user_id);
      end if;
      v_result:=jsonb_build_object('disposition','processed');
      if p_action='mgr_preferences' then
        submit_intent:=public.issue_chat_action_intent(t.installation_id,r.external_user_id,'mgr_save_preferences');
        select quiet_hours_start,quiet_hours_end,quiet_hours_timezone into pref from public.notification_preferences
          where brewery_id=t.brewery_id and user_id=t.user_id order by reason limit 1;
        v_result:=v_result || jsonb_build_object('intentId',submit_intent,'quietHours',jsonb_build_object('start',pref.quiet_hours_start,'end',pref.quiet_hours_end,'timezone',pref.quiet_hours_timezone));
      end if;
      if p_action in ('mgr_refresh','mgr_unlink') then
        insert into public.chat_callback_receipts (brewery_id,installation_id,provider,callback_id,callback_kind,external_user_id,disposition,payload_hash,received_at)
          values (r.brewery_id,r.installation_id,r.provider,'action-home:'||r.id,'app_home_opened',r.external_user_id,'pending',r.payload_hash,now())
          on conflict (installation_id,callback_id) do nothing;
      end if;
      update public.chat_action_intents set consumed_at=now(),first_result_reference=r.id::text where id=t.id;
    exception when invalid_parameter_value or invalid_datetime_format or datetime_field_overflow or insufficient_privilege then
      v_result:='{"disposition":"ignored","code":"invalid_action"}';
    end;
  end if;
  update public.chat_callback_receipts set disposition=v_result->>'disposition',result=v_result,completed_at=now() where id=r.id;
  return v_result;
end $$;

revoke execute on function private.set_chat_preference(uuid,uuid,text,boolean), private.set_chat_quiet_hours(uuid,uuid,time,time,text),
  private.snooze_chat_delivery(uuid,uuid,uuid,timestamptz), private.unlink_chat_identity(uuid,uuid) from public,anon,authenticated,service_role;
revoke execute on function set_personal_quiet_hours(uuid,time,time,text,uuid),snooze_notification(uuid,uuid,timestamptz,uuid),
  issue_chat_action_intent(uuid,text,text,uuid),consume_chat_action_intent(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function set_personal_quiet_hours(uuid,time,time,text,uuid),snooze_notification(uuid,uuid,timestamptz,uuid) to authenticated;
grant execute on function issue_chat_action_intent(uuid,text,text,uuid),consume_chat_action_intent(uuid,uuid,text,jsonb) to service_role;

-- ---------------------------------------------------------------- live Chat settings boundaries
-- Reuse the lifecycle owners; only the request-aware entry points are public.
alter function public.begin_chat_installation(uuid,text,text,text) set schema private;
revoke all on function private.begin_chat_installation(uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.begin_chat_installation(p_brewery uuid,p_provider text,p_redirect_uri text,p_state_hash text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'begin_chat_installation',p_request_id,jsonb_build_object('provider',p_provider,'redirect',p_redirect_uri,'state',p_state_hash));
  if v_replay is not null then return v_replay; end if;
  v_result := private.begin_chat_installation(p_brewery,p_provider,p_redirect_uri,p_state_hash);
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.begin_chat_installation(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_chat_installation(uuid,text,text,text,uuid) to authenticated;

alter function public.begin_chat_reauthorization(uuid,text,text) set schema private;
revoke all on function private.begin_chat_reauthorization(uuid,text,text) from public,anon,authenticated,service_role;
create function public.begin_chat_reauthorization(p_brewery uuid,p_installation uuid,p_redirect_uri text,p_state_hash text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'begin_chat_reauthorization',p_request_id,jsonb_build_object('installation',p_installation,'redirect',p_redirect_uri,'state',p_state_hash));
  if v_replay is not null then return v_replay; end if;
  if not exists(select 1 from public.chat_installations where id=p_installation and brewery_id=p_brewery) then raise exception 'permission denied' using errcode='42501'; end if;
  v_result := private.begin_chat_reauthorization(p_installation,p_redirect_uri,p_state_hash);
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.begin_chat_reauthorization(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_chat_reauthorization(uuid,uuid,text,text,uuid) to authenticated;

alter function public.disable_chat_installation(uuid) set schema private;
revoke all on function private.disable_chat_installation(uuid) from public,anon,authenticated,service_role;
create function public.disable_chat_installation(p_brewery uuid,p_installation uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'disable_chat_installation',p_request_id,jsonb_build_object('installation',p_installation));
  if v_replay is not null then return v_replay; end if;
  if not exists(select 1 from public.chat_installations where id=p_installation and brewery_id=p_brewery) then raise exception 'permission denied' using errcode='42501'; end if;
  perform private.disable_chat_installation(p_installation);
  v_result := '{"ok":true}';
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.disable_chat_installation(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.disable_chat_installation(uuid,uuid,uuid) to authenticated;

alter function public.disconnect_chat_installation(uuid) set schema private;
revoke all on function private.disconnect_chat_installation(uuid) from public,anon,authenticated,service_role;
create function public.disconnect_chat_installation(p_brewery uuid,p_installation uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'disconnect_chat_installation',p_request_id,jsonb_build_object('installation',p_installation));
  if v_replay is not null then return v_replay; end if;
  if not exists(select 1 from public.chat_installations where id=p_installation and brewery_id=p_brewery) then raise exception 'permission denied' using errcode='42501'; end if;
  v_result := private.disconnect_chat_installation(p_installation);
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.disconnect_chat_installation(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.disconnect_chat_installation(uuid,uuid,uuid) to authenticated;

alter function public.set_brewery_quiet_hours(uuid,time,time) set schema private;
revoke all on function private.set_brewery_quiet_hours(uuid,time,time) from public,anon,authenticated,service_role;
create function public.set_brewery_quiet_hours(p_brewery uuid,p_installation uuid,p_start time,p_end time,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery,'set_brewery_quiet_hours',p_request_id,jsonb_build_object('installation',p_installation,'start',p_start,'end',p_end));
  if v_replay is not null then return v_replay; end if;
  if not exists(select 1 from public.chat_installations where id=p_installation and brewery_id=p_brewery) then raise exception 'permission denied' using errcode='42501'; end if;
  if p_start=p_end then raise exception 'quiet hours must have different start and end'; end if;
  perform private.set_brewery_quiet_hours(p_installation,p_start,p_end);
  v_result := '{"ok":true}';
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.set_brewery_quiet_hours(uuid,uuid,time,time,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_brewery_quiet_hours(uuid,uuid,time,time,uuid) to authenticated;

alter function public.consume_chat_link_proof(text) set schema private;
revoke all on function private.consume_chat_link_proof(text) from public,anon,authenticated,service_role;
create function public.consume_chat_link_proof(p_brewery uuid,p_proof_hash text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb;
begin
  perform private.assert_staff(p_brewery, enum_range(null::public.staff_role));
  v_replay := private.claim_command_request(p_brewery,'consume_chat_link_proof',p_request_id,jsonb_build_object('proof',p_proof_hash));
  if v_replay is not null then return v_replay; end if;
  if exists(select 1 from public.chat_user_links where proof_hash=p_proof_hash and brewery_id<>p_brewery) then raise exception 'not a member of this brewery' using errcode='42501'; end if;
  v_result := private.consume_chat_link_proof(p_proof_hash);
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.consume_chat_link_proof(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.consume_chat_link_proof(uuid,text,uuid) to authenticated;

alter function public.set_notification_destination(uuid,text) set schema private;
revoke all on function private.set_notification_destination(uuid,text) from public,anon,authenticated,service_role;

-- A provider check is evidence, never a browser-supplied privacy flag. Issued
-- immediately before the write, bound to the current installation generation.
create table private.chat_destination_checks (
  request_id uuid primary key, brewery_id uuid not null, installation_id uuid not null,
  user_id uuid not null, channel_id text not null, installation_version timestamptz not null,
  checked_at timestamptz not null default now()
);
revoke all on private.chat_destination_checks from public,anon,authenticated,service_role;
create function record_chat_destination_check(p_brewery uuid,p_installation uuid,p_user uuid,p_channel text,p_version timestamptz,p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_user and role='admin')
    or not exists(select 1 from public.chat_installations where id=p_installation and brewery_id=p_brewery and state='active' and updated_at=p_version)
    then raise exception 'installation changed; reload Chat settings'; end if;
  delete from private.chat_destination_checks where checked_at < now()-interval '1 minute';
  insert into private.chat_destination_checks values(p_request_id,p_brewery,p_installation,p_user,p_channel,p_version,now())
    on conflict(request_id) do update set checked_at=excluded.checked_at
    where chat_destination_checks.brewery_id=excluded.brewery_id and chat_destination_checks.installation_id=excluded.installation_id
      and chat_destination_checks.user_id=excluded.user_id and chat_destination_checks.channel_id=excluded.channel_id
      and chat_destination_checks.installation_version=excluded.installation_version;
end $$;
create function set_notification_destination(p_brewery uuid,p_installation uuid,p_external_destination_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; i public.chat_installations;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay:=private.claim_command_request(p_brewery,'set_notification_destination',p_request_id,jsonb_build_object('installation',p_installation,'channel',p_external_destination_id));
  if v_replay is not null then return v_replay; end if;
  select * into i from public.chat_installations where id=p_installation and brewery_id=p_brewery for update;
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
  delete from private.chat_destination_checks where request_id=p_request_id and brewery_id=p_brewery and installation_id=p_installation
    and user_id=auth.uid() and channel_id=p_external_destination_id and installation_version=i.updated_at
    and checked_at>now()-interval '1 minute' and i.state='active';
  if not found then raise exception 'choose a currently validated private Slack channel'; end if;
  v_result:=private.set_notification_destination(p_installation,p_external_destination_id);
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function record_chat_destination_check(uuid,uuid,uuid,text,timestamptz,uuid),set_notification_destination(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function record_chat_destination_check(uuid,uuid,uuid,text,timestamptz,uuid) to service_role;
grant execute on function set_notification_destination(uuid,uuid,text,uuid) to authenticated;
-- Slack HTTP stays in TypeScript. This is the one durable tenant write after
-- validateDestination: claim request, upsert the operations channel, store result.
create function set_notification_destination(p_brewery uuid,p_installation uuid,p_external_destination_id text,p_request_id uuid,p_actor uuid,p_version timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and role='admin') then
    raise exception 'permission denied: brewery admin required' using errcode='42501';
  end if;
  v_replay:=private.claim_command_request_for(p_actor,p_brewery,'set_notification_destination',p_request_id,jsonb_build_object('installation',p_installation,'channel',p_external_destination_id));
  if v_replay is not null then return v_replay; end if;
  select * into i from public.chat_installations where id=p_installation and brewery_id=p_brewery for update;
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
  if i.state <> 'active' or i.updated_at is distinct from p_version then
    raise exception 'installation changed; reload Chat settings';
  end if;
  v_result:=private.set_notification_destination(p_installation,p_external_destination_id);
  return private.complete_command_request_for(p_actor,p_request_id,v_result);
end $$;
revoke all on function set_notification_destination(uuid,uuid,text,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function set_notification_destination(uuid,uuid,text,uuid,uuid,timestamptz) to service_role;
create function get_chat_link_intent(p_brewery uuid,p_proof_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.assert_staff(p_brewery,enum_range(null::public.staff_role));
  select jsonb_build_object('brewery',b.name,'mgrIdentity',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,u.id::text),
    'slackIdentity',l.external_user_id,'workspace',i.display_label,'expiresAt',l.proof_expires_at) into v_result
    from public.chat_user_links l join public.chat_installations i on i.id=l.installation_id
    join public.breweries b on b.id=l.brewery_id join auth.users u on u.id=auth.uid()
    where l.brewery_id=p_brewery and l.proof_hash=p_proof_hash and l.state='pending' and l.proof_consumed_at is null
      and l.proof_expires_at>now() and i.state='active';
  return v_result;
end $$;

create function get_chat_integration_health(p_brewery uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.chat_installations; v_queue jsonb; v_links int;
begin
  perform public.assert_chat_admin(p_brewery);
  select * into i from public.chat_installations where brewery_id=p_brewery and provider='slack'
    order by (state<>'disconnected') desc,created_at desc limit 1;
  select count(*) into v_links from public.chat_user_links l join public.brewery_users bu on bu.user_id=l.user_id and bu.brewery_id=l.brewery_id
    where l.installation_id=i.id and l.state='active';
  select jsonb_object_agg(s.state,coalesce(d.n,0)) into v_queue
    from unnest(array['queued','leased','retrying','sent','updated','suppressed','terminal']) s(state)
    left join (select state,count(*) n from public.notification_deliveries where installation_id=i.id group by state) d using(state);
  return jsonb_build_object('installation',case when i.id is null then null else jsonb_build_object(
    'id',i.id,'workspace',i.display_label,'state',i.state,'scopes',(select coalesce(jsonb_agg(cap.scope),'[]') from jsonb_array_elements_text(case when jsonb_typeof(i.granted_capabilities->'scopes')='array' then i.granted_capabilities->'scopes' else '[]'::jsonb end) cap(scope) where cap.scope in ('chat:write','im:write','groups:read')),
    'quietStart',i.quiet_hours_start,'quietEnd',i.quiet_hours_end,'timezone',i.quiet_hours_timezone,
    'lastError',case when i.last_failure_code in ('invalid_auth','token_revoked','token_expired','missing_scope','credential_delete_failed','network','ratelimited') then i.last_failure_code when i.last_failure_code is not null then 'provider_error' end) end,
    'linkedCount',v_links,'queue',v_queue,
    'lastCallback',(select max(completed_at) from public.chat_callback_receipts where installation_id=i.id and disposition='processed'),
    'lastDelivery',(select max(sent_at) from public.notification_deliveries where installation_id=i.id),
    'destinations',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'channelId',d.external_destination_id,'state',d.state,'privacy',d.privacy_class,
      'reason',case when d.blocked_reason in ('replaced','installation_disconnected','not_private','archived','bot_not_member','externally_shared','shared') then d.blocked_reason when d.blocked_reason is not null then 'provider_error' end))
      from public.notification_destinations d where d.installation_id=i.id and d.kind='private_channel'),'[]'));
end $$;

create function list_chat_user_links(p_brewery uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_chat_admin(p_brewery);
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,u.id::text),
    'role',bu.role,'slackIdentity',l.external_user_id,'linkedAt',l.linked_at) order by l.linked_at)
    from public.chat_user_links l join public.chat_installations i on i.id=l.installation_id
    join public.brewery_users bu on bu.user_id=l.user_id and bu.brewery_id=l.brewery_id join auth.users u on u.id=l.user_id
    where l.brewery_id=p_brewery and l.state='active' and i.state<>'disconnected'),'[]');
end $$;

revoke all on function get_chat_link_intent(uuid,text),get_chat_integration_health(uuid),list_chat_user_links(uuid) from public,anon,authenticated,service_role;
grant execute on function get_chat_link_intent(uuid,text),get_chat_integration_health(uuid),list_chat_user_links(uuid) to authenticated;

create function set_brewery_operating_defaults(p_brewery uuid,p_reading_due_hours int,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay:=private.claim_command_request(p_brewery,'set_brewery_operating_defaults',p_request_id,jsonb_build_object('hours',p_reading_due_hours));
  if v_replay is not null then return v_replay; end if;
  update public.breweries set fermentation_reading_due_hours=p_reading_due_hours where id=p_brewery;
  return private.complete_command_request(p_request_id,'{"ok":true}');
end $$;
revoke all on function set_brewery_operating_defaults(uuid,int,uuid) from public,anon,authenticated,service_role;
grant execute on function set_brewery_operating_defaults(uuid,int,uuid) to authenticated;

-- A completed request needs no new provider validation. This reveals only
-- presence; the authenticated write still checks the full canonical identity.
create function chat_settings_request_completed(p_brewery uuid,p_user uuid,p_request_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_user and role='admin'
  ) then raise exception 'permission denied' using errcode='42501'; end if;
  return exists(select 1 from private.command_requests where actor_id=p_user and request_id=p_request_id and result is not null);
end $$;
revoke all on function chat_settings_request_completed(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function chat_settings_request_completed(uuid,uuid,uuid) to service_role;

-- Named service-only reads. Recheck current admin membership in-statement;
-- jobs.ts must not select chat_installations through the service client.
create function get_chat_settings_installation(p_brewery uuid, p_installation uuid, p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_actor and role = 'admin'
  ) then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into i from public.chat_installations where id = p_installation and brewery_id = p_brewery;
  if not found then raise exception 'installation not found'; end if;
  return jsonb_build_object(
    'id', i.id, 'state', i.state, 'external_installation_id', i.external_installation_id, 'updated_at', i.updated_at);
end $$;

create function chat_credential_has_canonical_owner(p_external_installation_id text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.chat_installations
    where provider = 'slack' and external_installation_id = p_external_installation_id
      and token_store_key = 'slack:installation:' || p_external_installation_id
  );
end $$;

create function has_active_canonical_chat_installation(p_external_installation_id text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.chat_installations
    where provider = 'slack' and external_installation_id = p_external_installation_id
      and state = 'active'
      and token_store_key = 'slack:installation:' || p_external_installation_id
  );
end $$;

create function get_chat_installation_lifecycle(p_installation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into i from public.chat_installations where id = p_installation;
  if not found then return null; end if;
  return jsonb_build_object('state', i.state, 'external_installation_id', i.external_installation_id);
end $$;

-- No hosted scheduler. Call before hosted traffic (v1 90-day log prune).
create function prune_chat_integration_logs(p_older_than interval default interval '90 days') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_receipts int; v_intents int; v_deliveries int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  delete from public.chat_callback_receipts
    where received_at < now() - p_older_than and disposition in ('processed','ignored','failed');
  get diagnostics v_receipts = row_count;
  delete from public.chat_action_intents
    where created_at < now() - p_older_than and (consumed_at is not null or expires_at < now());
  get diagnostics v_intents = row_count;
  delete from public.notification_deliveries
    where created_at < now() - p_older_than and state in ('suppressed','terminal');
  get diagnostics v_deliveries = row_count;
  return jsonb_build_object('receipts', v_receipts, 'intents', v_intents, 'deliveries', v_deliveries);
end $$;

revoke all on function
  get_chat_settings_installation(uuid, uuid, uuid),
  chat_credential_has_canonical_owner(text),
  has_active_canonical_chat_installation(text),
  get_chat_installation_lifecycle(uuid),
  prune_chat_integration_logs(interval)
  from public, anon, authenticated, service_role;
grant execute on function
  get_chat_settings_installation(uuid, uuid, uuid),
  chat_credential_has_canonical_owner(text),
  has_active_canonical_chat_installation(text),
  get_chat_installation_lifecycle(uuid),
  prune_chat_integration_logs(interval)
  to service_role;
-- 00002_catalog_ledger.sql — catalog, immutable movement ledger, allocations, pars.

-- customers is created in 00001 with a non-unique (brewery_id, name) index;
-- the CSV importer and general customer lookups resolve by (brewery_id, name),
-- so that pair must be unique per tenant. Replace the plain index with a
-- unique one here rather than editing 00001.
drop index if exists customers_brewery_idx;
create unique index customers_brewery_name_uidx on customers (brewery_id, name);

create table products (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  style text,
  abv numeric(4,2),
  ttb_tax_class text not null default 'beer',
  created_at timestamptz not null default now()
);
create index products_brewery_idx on products (brewery_id, name);
-- Lets child tables enforce brewery-consistent composite FKs (products.id, products.brewery_id).
create unique index products_id_brewery_uidx on products (id, brewery_id);

create type package_type as enum ('keg','can','bottle');

create table skus (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  product_id uuid not null,
  name text not null,                    -- "1/2 bbl keg", "16oz 4-pack"
  package_type package_type not null,
  units_per_case int,
  bbl_per_unit numeric(12,8) not null check (bbl_per_unit > 0),   -- exact fraction; basis of all TTB math
  qbo_item_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Composite FK (not just product_id -> products(id)) so a sku can never be
  -- attached to a product belonging to a different brewery.
  constraint skus_product_brewery_fk foreign key (product_id, brewery_id) references products (id, brewery_id)
);
create index skus_brewery_idx on skus (brewery_id, product_id);
create unique index skus_product_name_idx on skus (product_id, name);
-- Lets child tables (inventory_movements, allocations, taproom_pars, price_list_items)
-- enforce brewery-consistent composite FKs.
create unique index skus_id_brewery_uidx on skus (id, brewery_id);

create table price_lists (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null
);
-- Lets customers/price_list_items enforce brewery-consistent composite FKs.
create unique index price_lists_id_brewery_uidx on price_lists (id, brewery_id);

create table price_list_items (
  price_list_id uuid not null,
  sku_id uuid not null,
  brewery_id uuid not null references breweries(id),
  unit_price_cents int not null check (unit_price_cents >= 0),
  primary key (price_list_id, sku_id),
  constraint price_list_items_price_list_brewery_fk foreign key (price_list_id, brewery_id) references price_lists (id, brewery_id),
  constraint price_list_items_sku_brewery_fk foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);
alter table customers add constraint customers_price_list_fk
  foreign key (price_list_id, brewery_id) references price_lists (id, brewery_id);

create type location_kind as enum ('warehouse','taproom');
create table locations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  kind location_kind not null
);
create index locations_brewery_idx on locations (brewery_id);
create unique index locations_brewery_name_idx on locations (brewery_id, name);
-- Lets child tables (inventory_movements, taproom_pars) enforce brewery-consistent composite FKs.
create unique index locations_id_brewery_uidx on locations (id, brewery_id);

create type movement_type as enum
  ('opening_balance','production_in','adjustment','sale_removal','taproom_transfer',
   'depletion','return_in','destruction','loss','sample','festival_removal');
create type sale_channel as enum ('wholesale','taproom','dtc','export');

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null,
  location_id uuid not null,
  qty numeric(12,2) not null check (qty <> 0),   -- signed units
  bbl numeric(14,8) not null,                    -- qty * bbl_per_unit, frozen at write time
  type movement_type not null,
  channel sale_channel,
  dest_state text,
  lot_id uuid,                                   -- forward-compat (slice 5)
  ref uuid,                                      -- order_id etc.
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Composite FKs so a movement's sku/location can never belong to a
  -- different brewery than the movement itself (proven exploit: staff could
  -- otherwise write brewery A movements against brewery B's sku/location).
  constraint inventory_movements_sku_brewery_fk foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  constraint inventory_movements_location_brewery_fk foreign key (location_id, brewery_id) references locations (id, brewery_id),
  -- removals must be negative and classified; inflows positive.
  -- channel/dest_state are required on removals that leave the brewery
  -- (sale_removal, festival_removal, sample) and null everywhere else,
  -- per spec section 3: "required on removals, null otherwise".
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

-- Enforce bbl = qty * bbl_per_unit at insert time.
create function enforce_bbl_integrity() returns trigger as $$
begin
  select (new.qty * s.bbl_per_unit) into new.bbl from skus s where s.id = new.sku_id;
  return new;
end;
$$ language plpgsql;

create trigger inventory_movements_bbl_trigger before insert on inventory_movements
  for each row execute function enforce_bbl_integrity();

-- Immutability at the grant level.
revoke update, delete on inventory_movements from authenticated, anon;

create type allocation_source as enum ('order_line','taproom_standing');
create type allocation_status as enum ('open','fulfilled','released');
create table allocations (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  sku_id uuid not null,
  qty numeric(12,2) not null check (qty > 0),
  source allocation_source not null,
  ref uuid not null,               -- order_line_id or location_id
  status allocation_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint allocations_sku_brewery_fk foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);
create index allocations_open_idx on allocations (brewery_id, sku_id) where status = 'open';

create table taproom_pars (
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  sku_id uuid not null,
  par_qty numeric(12,2) not null check (par_qty >= 0),
  primary key (location_id, sku_id),
  constraint taproom_pars_location_brewery_fk foreign key (location_id, brewery_id) references locations (id, brewery_id),
  constraint taproom_pars_sku_brewery_fk foreign key (sku_id, brewery_id) references skus (id, brewery_id)
);

-- Derived truth
create view on_hand with (security_invoker = true) as
  select brewery_id, sku_id, location_id, sum(qty) as qty
  from inventory_movements group by 1,2,3;

create view atp with (security_invoker = true) as
  select o.brewery_id, o.sku_id,
         sum(o.qty) - coalesce((select sum(a.qty) from allocations a
             where a.status = 'open' and a.brewery_id = o.brewery_id and a.sku_id = o.sku_id), 0) as qty
  from on_hand o group by o.brewery_id, o.sku_id;

-- RLS
alter table products enable row level security;
alter table skus enable row level security;
alter table price_lists enable row level security;
alter table price_list_items enable row level security;
alter table locations enable row level security;
alter table inventory_movements enable row level security;
alter table allocations enable row level security;
alter table taproom_pars enable row level security;

create policy staff_all on products for all using (is_staff_of(brewery_id));
create policy customer_read on products for select
  using (brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy staff_all on skus for all using (is_staff_of(brewery_id));
create policy customer_read on skus for select
  using (active and brewery_id in (select c.brewery_id from customers c where c.id in (select my_customer_ids())));
create policy staff_all on price_lists for all using (is_staff_of(brewery_id));
create policy staff_all on price_list_items for all using (is_staff_of(brewery_id));
create policy customer_own_prices on price_list_items for select
  using (price_list_id in (select c.price_list_id from customers c where c.id in (select my_customer_ids())));
create policy staff_all on locations for all using (is_staff_of(brewery_id));
create policy staff_read on inventory_movements for select using (is_staff_of(brewery_id));
create policy staff_insert on inventory_movements for insert with check (is_staff_of(brewery_id) and created_by = auth.uid());
create policy staff_all on allocations for all using (is_staff_of(brewery_id));
create policy staff_all on taproom_pars for all using (is_staff_of(brewery_id));

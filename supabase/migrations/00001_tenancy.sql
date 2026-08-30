-- 00001_tenancy.sql — tenant root + membership tables. RLS derives all access from these.
create table breweries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ttb_registry_no text,
  pa_license_no text,
  timezone text not null default 'America/New_York',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create type staff_role as enum ('admin','sales','warehouse');

create table brewery_users (
  brewery_id uuid not null references breweries(id),
  user_id uuid not null references auth.users(id),
  role staff_role not null,
  created_at timestamptz not null default now(),
  primary key (brewery_id, user_id)
);

create type customer_type as enum ('distributor','retailer','brewery','other');

create table customers (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  name text not null,
  type customer_type not null default 'retailer',
  license_no text,
  state text not null,             -- home state, 2-letter
  price_list_id uuid,             -- FK added in 00002 (price_lists created there)
  qbo_customer_id text,
  payment_terms text not null default 'net30',
  created_at timestamptz not null default now()
);
create index customers_brewery_idx on customers (brewery_id, name);

create table customer_users (
  customer_id uuid not null references customers(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

create table ship_tos (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  customer_id uuid not null references customers(id),
  label text not null,
  address1 text not null, address2 text, city text not null,
  state text not null,             -- drives dest_state on removals
  zip text not null,
  created_at timestamptz not null default now()
);
create index ship_tos_customer_idx on ship_tos (customer_id);

-- Access helper functions (security definer so RLS policies can call them cheaply)
create or replace function my_brewery_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select brewery_id from brewery_users where user_id = auth.uid() $$;

create or replace function my_customer_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select customer_id from customer_users where user_id = auth.uid() $$;

create or replace function is_staff_of(b uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from brewery_users where user_id = auth.uid() and brewery_id = b) $$;

create or replace function staff_role(b uuid) returns staff_role
language sql stable security definer set search_path = public as
$$ select role from brewery_users where user_id = auth.uid() and brewery_id = b $$;

-- RLS
alter table breweries enable row level security;
alter table brewery_users enable row level security;
alter table customers enable row level security;
alter table customer_users enable row level security;
alter table ship_tos enable row level security;

create policy staff_read on breweries for select using (is_staff_of(id));
create policy admin_update on breweries for update using (staff_role(id) = 'admin');

create policy member_read on brewery_users for select using (user_id = auth.uid() or is_staff_of(brewery_id));
create policy admin_write on brewery_users for all using (staff_role(brewery_id) = 'admin');

create policy staff_all on customers for all using (is_staff_of(brewery_id));
create policy customer_read_own on customers for select using (id in (select my_customer_ids()));

create policy self_read on customer_users for select using (user_id = auth.uid());
create policy staff_manage on customer_users for all
  using (exists(select 1 from customers c where c.id = customer_id and is_staff_of(c.brewery_id)));

create policy staff_all on ship_tos for all using (is_staff_of(brewery_id));
create policy customer_own on ship_tos for select using (customer_id in (select my_customer_ids()));

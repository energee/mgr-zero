-- Customer contact storage, QuickBooks observations and human decisions.
-- Snapshots and decisions are staff-read only; writes arrive in later migrations
-- through definer RPCs. Portal buyers never read these tables, and buyer-safe
-- customer projection work belongs to #793.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

alter table public.customers
  add column billing_email text,
  add column phone text,
  add column bill_address1 text,
  add column bill_address2 text,
  add column bill_city text,
  add column bill_state text,
  add column bill_zip text,
  add column qbo_sync_token text,
  add column qbo_sync_state text
    check (qbo_sync_state in ('in_sync','pending','changed_in_qbo','inactive_in_qbo'));

do $$ begin
  if exists (select 1 from public.customers
    where qbo_customer_id is not null and qbo_realm_id is not null
    group by brewery_id,qbo_realm_id,qbo_customer_id having count(*) > 1) then
    raise exception 'duplicate QuickBooks customer mappings require explicit reconciliation';
  end if;
end $$;
-- Rows with a NULL realm (legacy) are outside this uniqueness by design.
create unique index customers_qbo_customer_unique
  on public.customers(brewery_id,qbo_realm_id,qbo_customer_id)
  where qbo_customer_id is not null;

create table public.qbo_customer_snapshots (
  brewery_id uuid not null references public.breweries(id),
  realm_id text not null,
  qbo_customer_id text not null,
  display_name text not null,
  company_name text,
  email text,
  phone text,
  bill_address1 text,
  bill_address2 text,
  bill_city text,
  bill_state text,
  bill_zip text,
  active boolean not null,
  sync_token text not null,
  qbo_updated_at timestamptz not null,
  read_at timestamptz not null,
  primary key(brewery_id,realm_id,qbo_customer_id)
);
alter table public.qbo_customer_snapshots enable row level security;
create policy staff_read on public.qbo_customer_snapshots for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));
revoke all on public.qbo_customer_snapshots from public,anon,authenticated,service_role;
grant select on public.qbo_customer_snapshots to authenticated;

create table public.qbo_customer_decisions (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  realm_id text not null,
  qbo_customer_id text not null,
  customer_id uuid,
  decision text not null check(decision in ('not_a_match','ignore')),
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  unique(id,brewery_id),
  foreign key(customer_id,brewery_id) references public.customers(id,brewery_id),
  foreign key(brewery_id,realm_id,qbo_customer_id)
    references public.qbo_customer_snapshots(brewery_id,realm_id,qbo_customer_id),
  check((decision='ignore' and customer_id is null)
    or (decision='not_a_match' and customer_id is not null))
);
-- Serves the customers FK lookup (deleting a customer must not scan decisions).
create index qbo_customer_decisions_customer on public.qbo_customer_decisions(customer_id,brewery_id);
create unique index qbo_customer_rejected_pair on public.qbo_customer_decisions
  (brewery_id,realm_id,qbo_customer_id,customer_id) where decision='not_a_match';
create unique index qbo_customer_ignored on public.qbo_customer_decisions
  (brewery_id,realm_id,qbo_customer_id) where decision='ignore';
alter table public.qbo_customer_decisions enable row level security;
create policy staff_read on public.qbo_customer_decisions for select to authenticated
  using(brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));
revoke all on public.qbo_customer_decisions from public,anon,authenticated,service_role;
grant select on public.qbo_customer_decisions to authenticated;

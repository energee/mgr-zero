-- #793: buyers read customer identity through a scoped projection, never
-- customer bookkeeping or the underlying brand/format/channel price grid.
-- Staff retain their base-table policies and table-wide SELECT grants.
-- Deploy the matching portal and membership readers with this migration.

-- security-definer: justified -- customer base-table SELECT is removed;
-- my_customer_ids() binds both identity discovery and scoped command reads.
create function public.portal_customer_rows()
returns table (id uuid, brewery_id uuid, name text, sale_channel_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.brewery_id, c.name, c.sale_channel_id
  from public.customers c
  where c.id in (select public.my_customer_ids());
$$;
comment on function public.portal_customer_rows() is
  'portal customer identity only; never add bookkeeping, tax, license or payment-term columns';
revoke all on function public.portal_customer_rows() from public, anon;
grant execute on function public.portal_customer_rows() to authenticated;

create view public.portal_customers with (security_invoker = true) as
  select * from public.portal_customer_rows();
grant select on public.portal_customers to authenticated;

drop policy customer_read_own on public.customers;
drop policy customer_read on public.brands;
drop policy customer_read on public.formats;
drop policy customer_own_prices on public.channel_prices;

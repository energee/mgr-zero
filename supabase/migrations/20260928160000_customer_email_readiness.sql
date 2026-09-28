-- #651: one authorized predicate owns missing portal-email count and review.
-- Return customer rows so PostgREST preserves the existing embeds and paging.
create function public.customers_missing_portal_email(p_brewery uuid)
returns setof public.customers
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales']::public.staff_role[]);
  return query
    select c.* from public.customers c
    where c.brewery_id = p_brewery
      and not exists (
        select 1 from public.customer_users cu
        join auth.users u on u.id = cu.user_id
        where cu.customer_id = c.id and nullif(pg_catalog.btrim(u.email), '') is not null
      );
end $$;
revoke all on function public.customers_missing_portal_email(uuid) from public, anon, authenticated, service_role;
grant execute on function public.customers_missing_portal_email(uuid) to authenticated;

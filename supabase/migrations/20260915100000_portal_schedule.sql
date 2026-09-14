-- portal_schedule (issue #278, Coming up): buyers see what their brewery plans
-- to brew next as brand + expected week, plus whether that brand has a package
-- on their wholesale list, and nothing else — no volume, recipe, tank, lot or
-- exact day (ai-chat plan Task 10). Same shape as portal_brewery: a
-- security-definer rows function pins the caller to their own account, and
-- the security_invoker view wraps it, so batches keeps no customer policy.
-- security-definer: justified — no customer SELECT on batches; returns only
-- portal columns for my_customer_ids().
create function public.portal_schedule_rows()
returns table (brewery_id uuid, brand_id uuid, brand_name text, planned_week date, listed boolean)
language sql stable security definer set search_path = '' as $$
  select b.brewery_id, b.intended_brand_id, br.name, date_trunc('week', b.planned_on)::date,
         exists (select 1 from public.sku_prices p
                 where p.brewery_id = b.brewery_id and p.brand_name = br.name and p.active
                   and p.sale_channel_id = c.sale_channel_id)
  from public.customers c
  join public.batches b on b.brewery_id = c.brewery_id and b.brewed_on is null
  join public.brands br on br.id = b.intended_brand_id and br.brewery_id = b.brewery_id
  where c.id in (select public.my_customer_ids());
$$;
comment on function public.portal_schedule_rows() is
  'portal schedule projection; never add batch columns beyond brand and week';
revoke all on function public.portal_schedule_rows() from public, anon;
grant execute on function public.portal_schedule_rows() to authenticated;

create view public.portal_schedule with (security_invoker = true) as
  select brewery_id, brand_id, brand_name, planned_week, listed from public.portal_schedule_rows();
grant select on public.portal_schedule to authenticated;

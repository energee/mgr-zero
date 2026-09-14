-- portal_schedule (issue #278, Coming up): buyers see what their brewery plans
-- to brew next as brand + expected week and nothing else — no volume, recipe,
-- tank, lot or exact day (ai-chat plan Task 10). batches keeps no customer
-- policy; this view is definer-owned and scopes itself, so a customer reads
-- only their brewery's rows and staff read their own. security_invoker is
-- deliberately off: with it, the missing customer policy on batches would
-- return nothing.
create view public.portal_schedule as
  select b.brewery_id, b.intended_brand_id as brand_id, br.name as brand_name,
         date_trunc('week', b.planned_on)::date as planned_week
  from public.batches b
  join public.brands br on br.id = b.intended_brand_id and br.brewery_id = b.brewery_id
  where b.brewed_on is null
    and (public.is_staff_of(b.brewery_id)
         or b.brewery_id in (select c.brewery_id from public.customers c where c.id in (select public.my_customer_ids())));
grant select on public.portal_schedule to authenticated;

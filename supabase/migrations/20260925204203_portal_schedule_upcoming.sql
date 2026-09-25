-- portal_schedule upcoming only (issue #477): a batch whose planned week has
-- passed without a brew no longer shows buyers "week of <past date>" forever
-- (batches cannot be cancelled, so a slipped plan would never leave), and two
-- batches of one brand in one week collapse to one row instead of repeating
-- the same brand + week (which also repeated the Coming up row key).
-- Body copied from 20260915100000_portal_schedule.sql; only the week cut and
-- distinct are new.
-- security-definer: justified — no customer SELECT on batches; returns only
-- portal columns for my_customer_ids().
create or replace function public.portal_schedule_rows()
returns table (brewery_id uuid, brand_id uuid, brand_name text, planned_week date, listed boolean)
language sql stable security definer set search_path = '' as $$
  select distinct b.brewery_id, b.intended_brand_id, br.name, date_trunc('week', b.planned_on)::date,
         exists (select 1 from public.sku_prices p
                 where p.brewery_id = b.brewery_id and p.brand_name = br.name and p.active
                   and p.sale_channel_id = c.sale_channel_id)
  from public.customers c
  join public.batches b on b.brewery_id = c.brewery_id and b.brewed_on is null
    and b.planned_on >= date_trunc('week', current_date)::date
  join public.brands br on br.id = b.intended_brand_id and br.brewery_id = b.brewery_id
  where c.id in (select public.my_customer_ids());
$$;

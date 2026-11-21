-- Portal Shop shows a brand's COLA label (owner decision 2026-11-18). Buyers
-- read only MGR's stored copies in cola_label_images, never TTB: only staff's
-- get_cola_image fetches and stores a label. A brand links to its labels
-- through brand_approvals (kind 'cola', approved, with the saved image_url),
-- the same rule get_stored_cola_label_image serves staff by.
--
-- private.portal_cola_label_rows is the one owner of which label a buyer sees:
-- for each brand with an active price on the caller's sale channel, one stored
-- label. TTB does not say which attachment is the front label, so a brand with
-- several picks the earliest approval (approved_on, then ttb_id): the label it
-- was first sold under, and the same one on every read.
-- portal_cola_labels lists brand and TTB id only, so Shop stays light;
-- portal_cola_label_image returns one brand's image as a data URL when its
-- thumbnail scrolls into view. Both scope the customer like portal_availability.

create function private.portal_cola_label_rows(p_customer uuid)
returns table (brand_id uuid, brand_name text, ttb_id text, image_url text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id, c.sale_channel_id from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  )
  select distinct on (b.id) b.id, b.name, a.ttb_id, a.image_url
  from caller
  join public.brands b on b.brewery_id = caller.brewery_id
  join public.brand_approvals a on a.brand_id = b.id and a.brewery_id = b.brewery_id
    and a.kind = 'cola' and a.approved_on is not null and a.image_url is not null
  join public.cola_label_images i on i.brewery_id = a.brewery_id and i.ttb_id = a.ttb_id and i.image_url = a.image_url
  where exists (
    select 1 from public.sku_prices p join public.skus s on s.id = p.sku_id and s.brewery_id = p.brewery_id
    where s.brand_id = b.id and p.brewery_id = caller.brewery_id and p.sale_channel_id = caller.sale_channel_id and p.active
  )
  order by b.id, a.approved_on, a.ttb_id;
$$;
revoke all on function private.portal_cola_label_rows(uuid) from public, anon, authenticated, service_role;

-- security-definer: justified — no customer SELECT on brands, brand_approvals
-- or cola_label_images; returns only the brand and TTB id for my_customer_ids().
create function public.portal_cola_labels(p_customer uuid)
returns table (brand_id uuid, brand_name text, ttb_id text)
language sql stable security definer set search_path = '' as $$
  select r.brand_id, r.brand_name, r.ttb_id from private.portal_cola_label_rows(p_customer) r;
$$;
revoke all on function public.portal_cola_labels(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_cola_labels(uuid) to authenticated;

-- security-definer: justified — as above; one brand's stored label as a data
-- URL, or null when the caller may not see it or MGR has no copy.
create function public.portal_cola_label_image(p_customer uuid, p_brand uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select 'data:' || i.content_type || ';base64,' || replace(encode(i.bytes, 'base64'), E'\n', '')
  from private.portal_cola_label_rows(p_customer) r
  join public.customers c on c.id = p_customer
  join public.cola_label_images i on i.brewery_id = c.brewery_id and i.ttb_id = r.ttb_id and i.image_url = r.image_url
  where r.brand_id = p_brand;
$$;
revoke all on function public.portal_cola_label_image(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_cola_label_image(uuid, uuid) to authenticated;

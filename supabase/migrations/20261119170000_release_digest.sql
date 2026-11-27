-- The weekly release digest (docs/plans/release-pool-and-ceilings.md, stage 3):
-- one email a week to each customer's portal users, on the weekday the brewery
-- chose (breweries.release_digest_dow; null sends none). It rides the order
-- email queue, so the existing worker, leases and retries deliver it.
--
-- A delivery row is now either an order confirmation (order_id) or a digest
-- (digest_week, the Monday of the week the digest was built in), never both.

alter table private.order_email_deliveries
  alter column order_id drop not null,
  add column digest_week date,
  add constraint order_email_deliveries_one_kind check ((order_id is null) <> (digest_week is null));
-- The old key treated nulls as equal, which would allow one digest per user ever.
alter table private.order_email_deliveries drop constraint order_email_deliveries_order_id_user_id_key;
create unique index order_email_deliveries_order_user_uidx on private.order_email_deliveries (order_id, user_id) nulls not distinct where order_id is not null;
create unique index order_email_deliveries_digest_uidx on private.order_email_deliveries (customer_id, user_id, digest_week) where digest_week is not null;

-- What today's digests are built from: for every brewery whose digest day is
-- today (in its own timezone), each open planned-batch release each customer
-- can order, once per portal user of that customer with an email address. The
-- job (lib/email/digest.ts) words the email; nothing here sends.
create function public.release_digest_rows()
returns table(brewery_id uuid, brewery_name text, customer_id uuid, user_id uuid, digest_week date, today date, lift_days integer,
  brand text, package text, release_id uuid, sku_id uuid, ships_from date, orders_close_on date, new_this_week boolean,
  badge text, bbl_per_unit numeric, limit_left_bbl numeric, limit_lifts_on date, suggested_qty numeric)
language sql stable security definer set search_path = '' as $$
  -- digest_week is the week, not the day: moving the digest day mid-week cannot send a second one.
  select b.id, b.name, c.id, u.id, date_trunc('week', t.today)::date, t.today, b.release_cap_lift_days, br.name, f.name, r.release_id, r.sku_id, r.ships_from, r.orders_close_on,
    rel.released_at >= now() - interval '7 days', r.badge, r.bbl_per_unit, r.limit_left_bbl, r.limit_lifts_on, s.qty
  from public.breweries b
  cross join lateral (select (now() at time zone b.timezone)::date as today) t
  join public.customers c on c.brewery_id = b.id
  join public.customer_users cu on cu.customer_id = c.id
  join auth.users u on u.id = cu.user_id and nullif(btrim(u.email), '') is not null
  cross join lateral private.customer_releases(c.id) r
  join public.releases rel on rel.id = r.release_id
  join public.skus sk on sk.id = r.sku_id and sk.brewery_id = b.id
  join public.brands br on br.id = sk.brand_id
  join public.formats f on f.id = sk.format_id
  left join lateral (select so.qty from private.suggested_order(b.id, c.id) so where so.release_id = r.release_id) s on true
  where b.release_digest_dow = extract(dow from t.today)::int and b.closed_at is null and r.from_batch
  order by c.id, u.id, r.ships_from, br.name, f.name;
$$;
revoke all on function public.release_digest_rows() from public, anon, authenticated, service_role;
grant execute on function public.release_digest_rows() to service_role;

-- Queues one digest for one portal user. The recipient is read here, never
-- taken from the caller, and a second digest for the same user and week is
-- ignored, so the job can run again safely. Returns whether a row was queued.
create function public.queue_release_digest(p_brewery uuid, p_customer uuid, p_user uuid, p_week date, p_subject text, p_text text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_queued integer;
begin
  insert into private.order_email_deliveries (brewery_id, customer_id, user_id, recipient, payload, state, digest_week)
  select c.brewery_id, c.id, u.id, u.email, jsonb_build_object('to', u.email, 'subject', p_subject, 'text', p_text), 'pending', p_week
  from public.customers c
  join public.customer_users cu on cu.customer_id = c.id and cu.user_id = p_user
  join auth.users u on u.id = cu.user_id and nullif(btrim(u.email), '') is not null
  where c.id = p_customer and c.brewery_id = p_brewery
  on conflict (customer_id, user_id, digest_week) where digest_week is not null do nothing;
  get diagnostics v_queued = row_count;
  return v_queued > 0;
end $$;
revoke all on function public.queue_release_digest(uuid, uuid, uuid, date, text, text) from public, anon, authenticated, service_role;
grant execute on function public.queue_release_digest(uuid, uuid, uuid, date, text, text) to service_role;

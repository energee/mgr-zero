-- Review fixes for release ceilings and the weekly digest (PR #1903).
--
-- 1. A ceiling lifts per release, on that release's own ship date, as the
--    portal shows it. assert_portal_offers took the earliest ship date among
--    an order's lines of a batch, so one unit of an earlier release of the same
--    batch lifted the ceiling on a later one.
-- 2. The digest reads a release as new for the week after it opens to the
--    customer, so a customer who sees releases late still hears about them.
-- 3. The digest also runs the day after the digest day, keyed to the digest
--    day's week, so one missed daily run does not lose that week's digest.

create or replace function private.assert_portal_offers(p_brewery uuid, p_customer uuid, p_requested date, p_lines jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare l record; b record; v_delay integer; v_today date; v_lift integer; v_share numeric; v_used numeric; v_limit numeric;
begin
  select release_delay_days into v_delay from public.customers where id = p_customer and brewery_id = p_brewery;
  select s.name into l from jsonb_array_elements(p_lines) e
    join public.skus s on s.id = (e->>'sku_id')::uuid and s.brewery_id = p_brewery
    where e->>'release_id' is null and not s.portal_from_stock limit 1;
  if found then raise exception '% is not orderable from stock', l.name; end if;
  for l in
    select (e->>'qty')::numeric as want, s.name, r.*
    from jsonb_array_elements(p_lines) e
    join public.skus s on s.id = (e->>'sku_id')::uuid and s.brewery_id = p_brewery
    left join private.release_state(p_brewery) r on r.id = (e->>'release_id')::uuid and r.sku_id = s.id
    where e->>'release_id' is not null
  loop
    if l.id is null then raise exception 'release not found for %', l.name; end if;
    if l.withdrawn_at is not null then raise exception 'The release of % was withdrawn', l.name; end if;
    if l.cancelled then raise exception 'The release of % closed: its batch was cancelled', l.name; end if;
    if l.packaged then raise exception 'The release of % closed: its batch was packaged', l.name; end if;
    if not l.open then raise exception 'Orders for the release of % closed', l.name; end if;
    if l.days_open < coalesce(v_delay, 0) then raise exception 'The release of % is not open to this account yet', l.name; end if;
    if l.want > l.remaining then raise exception 'Only % of % left in this release', l.remaining, l.name; end if;
    if p_requested is null or p_requested < l.ships_from then
      raise exception '% ships from %; choose a requested date on or after it', l.name, l.ships_from;
    end if;
  end loop;
  select (now() at time zone timezone)::date, release_cap_lift_days into v_today, v_lift from public.breweries where id = p_brewery;
  select pct into v_share from private.release_shares(p_brewery) where customer_id = p_customer;
  for b in
    -- capped_bbl: the barrels wanted from releases whose ceiling has not lifted; capped_from: the latest of their ship dates.
    select r.batch_id, min(br.name) as brand, min(r.pool_bbl) as pool_bbl, min(r.pool_left_bbl) as left_bbl,
      sum((e->>'qty')::numeric * r.bbl_per_unit) as want_bbl,
      coalesce(sum((e->>'qty')::numeric * r.bbl_per_unit) filter (where v_today < r.ships_from - v_lift), 0) as capped_bbl,
      max(r.ships_from) filter (where v_today < r.ships_from - v_lift) as capped_from
    from jsonb_array_elements(p_lines) e
    join private.release_state(p_brewery) r on r.id = (e->>'release_id')::uuid
    join public.skus s on s.id = r.sku_id and s.brewery_id = p_brewery
    join public.brands br on br.id = s.brand_id
    where r.pool_bbl is not null
    group by r.batch_id
  loop
    if b.want_bbl > b.left_bbl then
      raise exception 'Only % bbl of % left in this release', trim_scale(round(greatest(b.left_bbl, 0), 2)), b.brand;
    end if;
    if v_share is not null and b.capped_bbl > 0 then
      select coalesce((select u.bbl from private.customer_batch_bbl(p_brewery, p_customer) u where u.batch_id = b.batch_id), 0) into v_used;
      v_limit := round(v_share / 100 * b.pool_bbl, 2);
      if v_used + b.capped_bbl > v_limit then
        raise exception 'Your limit on % is % bbl until %; % bbl of it is left', b.brand, trim_scale(v_limit),
          to_char(b.capped_from - v_lift, 'Mon FMDD'), trim_scale(greatest(v_limit - v_used, 0));
      end if;
    end if;
  end loop;
end $$;

create or replace function public.release_digest_rows()
returns table(brewery_id uuid, brewery_name text, customer_id uuid, user_id uuid, digest_week date, today date, lift_days integer,
  brand text, package text, release_id uuid, sku_id uuid, ships_from date, orders_close_on date, new_this_week boolean,
  badge text, bbl_per_unit numeric, limit_left_bbl numeric, limit_lifts_on date, suggested_qty numeric)
language sql stable security definer set search_path = '' as $$
  -- digest_week is the week of the digest day, not of the run: moving the digest day mid-week, or catching up the day after, cannot send a second one.
  select b.id, b.name, c.id, u.id, date_trunc('week', d.day)::date, t.today, b.release_cap_lift_days, br.name, f.name, r.release_id, r.sku_id, r.ships_from, r.orders_close_on,
    -- New for the week after it opened to this customer, who may see releases some days late.
    rel.released_at + make_interval(days => coalesce(c.release_delay_days, 0)) >= now() - interval '7 days', r.badge, r.bbl_per_unit, r.limit_left_bbl, r.limit_lifts_on, s.qty
  from public.breweries b
  cross join lateral (select (now() at time zone b.timezone)::date as today) t
  -- The digest day is today, or was yesterday: a daily run that was missed is made up the next day.
  cross join lateral (select case when b.release_digest_dow = extract(dow from t.today)::int then t.today
                                  when b.release_digest_dow = extract(dow from t.today - 1)::int then t.today - 1 end as day) d
  join public.customers c on c.brewery_id = b.id
  join public.customer_users cu on cu.customer_id = c.id
  join auth.users u on u.id = cu.user_id and nullif(btrim(u.email), '') is not null
  cross join lateral private.customer_releases(c.id) r
  join public.releases rel on rel.id = r.release_id
  join public.skus sk on sk.id = r.sku_id and sk.brewery_id = b.id
  join public.brands br on br.id = sk.brand_id
  join public.formats f on f.id = sk.format_id
  left join lateral (select so.qty from private.suggested_order(b.id, c.id) so where so.release_id = r.release_id) s on true
  where d.day is not null and b.closed_at is null and r.from_batch
  order by c.id, u.id, r.ships_from, br.name, f.name;
$$;

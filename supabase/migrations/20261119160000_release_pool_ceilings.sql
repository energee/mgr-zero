-- Release pools, customer ceilings, calculated shares and suggested orders
-- (docs/plans/release-pool-and-ceilings.md, owner decisions 2026-11-19).
--
-- A batch release is one number: batches.wholesale_bbl, the barrels open to
-- wholesale. Every package of the batch's brand draws from that pool by its
-- size, so a release row no longer needs a unit quantity (releases.qty null:
-- no limit of its own). A customer can have a ceiling, a percentage of each
-- pool, typed on the customer (customers.release_share_pct) or calculated from
-- recent purchases with stock barrels counting for more. Ceilings lift a set
-- number of days before ship. Nothing here changes a batch that has no pool or
-- a customer that has no share.
--
-- Functions replaced here, and where each was last defined:
--   private.release_state, private.assert_portal_offers, release_rows,
--   release_sku, update_release, upsert_customer    20261118190000_releases.sql
--   portal_releases                                 20261119150500_portal_release_from_batch.sql
--   portal_submit_quote, submit_order               as they stood on 2026-11-19; each
--     gains only the batch lock that keeps one pool from being oversold.

alter table public.breweries
  add column release_open_pct integer not null default 75 check (release_open_pct between 1 and 100),
  add column release_order_by_days integer not null default 7 check (release_order_by_days between 0 and 60),
  add column release_cap_lift_days integer not null default 14 check (release_cap_lift_days between 0 and 90),
  add column release_digest_dow smallint check (release_digest_dow between 0 and 6),
  add column release_share_window_days integer check (release_share_window_days between 7 and 730),
  add column release_stock_multiplier numeric(4,2) not null default 2 check (release_stock_multiplier between 1 and 10),
  add column release_max_share_pct integer not null default 50 check (release_max_share_pct between 1 and 100);
comment on column public.breweries.release_open_pct is 'Percent of a planned batch the release form offers to wholesale by default';
comment on column public.breweries.release_order_by_days is 'Days before ship that the release form closes ordering by default';
comment on column public.breweries.release_cap_lift_days is 'Days before ship that customer ceilings stop applying';
comment on column public.breweries.release_digest_dow is 'Day of the week (0 Sunday to 6 Saturday) the release digest is sent; null sends none';
comment on column public.breweries.release_share_window_days is 'Days of purchases a calculated ceiling looks back over; null calculates none';
comment on column public.breweries.release_stock_multiplier is 'How many times a barrel bought from stock counts toward a calculated ceiling';
comment on column public.breweries.release_max_share_pct is 'The most a calculated ceiling can be, in percent of a pool';

alter table public.batches add column wholesale_bbl numeric check (wholesale_bbl > 0);
comment on column public.batches.wholesale_bbl is 'Barrels of this batch open to wholesale: the pool its releases share. Null: no pool';
alter table public.customers add column release_share_pct numeric(5,2) check (release_share_pct > 0 and release_share_pct <= 100);
comment on column public.customers.release_share_pct is 'Ceiling: the percent of a batch pool this customer may order until ceilings lift. Null: none typed';
-- A stock release still needs its quantity; a batch release may rely on the pool.
alter table public.releases alter column qty drop not null,
  add constraint releases_stock_has_qty check (qty is not null or batch_id is not null);

-- Every active packaged SKU of each unpackaged batch's brand: what the release
-- form offers. Unlike projected_batch_packaging_units it needs no batch share.
create view public.release_batch_skus with (security_invoker = true) as
  select b.brewery_id, b.id as batch_id, b.batch_no, b.planned_bbl, b.wholesale_bbl,
    coalesce(b.brewed_on, b.planned_on) + br.days_to_package as needed_by, s.id as sku_id
  from public.batches b
  join public.breweries br on br.id = b.brewery_id
  join public.skus s on s.brand_id = b.intended_brand_id and s.brewery_id = b.brewery_id and s.active
  join public.format_volumes fv on fv.id = s.format_id and fv.bbl_per_unit > 0
  where b.cancelled_at is null and b.closed_at is null
    and not exists (select 1 from public.packaging_runs r
      left join public.vessel_occupancies o on o.id = r.occupancy_id and o.brewery_id = r.brewery_id
      where r.brewery_id = b.brewery_id and r.cancelled_at is null and (r.batch_id = b.id or o.batch_id = b.id));
revoke all on public.release_batch_skus from public, anon, authenticated, service_role;
grant select on public.release_batch_skus to authenticated;

-- Remaining is now the smaller of the release's own limit and what its batch's
-- pool still holds in that package. pool_left_bbl is the pool less every
-- counted line on the batch's releases, in barrels.
drop function private.release_state(uuid);
create function private.release_state(p_brewery uuid)
returns table(id uuid, batch_id uuid, sku_id uuid, qty numeric, ships_from date, orders_close_on date, released_at timestamptz, withdrawn_at timestamptz,
  ready_on date, packaged boolean, cancelled boolean, open boolean, confirmed numeric, preordered numeric, remaining numeric, stock_claim numeric, days_open integer,
  bbl_per_unit numeric, pool_bbl numeric, pool_left_bbl numeric)
language sql stable set search_path = '' as $$
  with brewery as (
    select (now() at time zone timezone)::date as today, timezone, days_to_package from public.breweries where id = p_brewery
  ), counted as (
    select ol.release_id,
      coalesce(sum(case when o.status = 'shipped' then coalesce(ol.qty_shipped, ol.qty_ordered) else ol.qty_ordered end)
        filter (where o.status in ('confirmed','picked','shipped')), 0) as confirmed,
      coalesce(sum(ol.qty_ordered) filter (where o.status = 'submitted'), 0) as preordered
    from public.order_lines ol
    join public.orders o on o.id = ol.order_id and o.brewery_id = ol.brewery_id
    where ol.brewery_id = p_brewery and ol.release_id is not null
    group by 1
  ), base as (
    select r.id, r.batch_id, r.sku_id, r.qty, r.ships_from, r.orders_close_on, r.released_at, r.withdrawn_at,
      coalesce(c.confirmed, 0) as confirmed, coalesce(c.preordered, 0) as preordered,
      private.batch_ready_on(b.brewed_on, b.planned_on, br.days_to_package) as ready_on,
      r.batch_id is not null and private.batch_packaged(p_brewery, r.batch_id) as packaged,
      coalesce(b.cancelled_at is not null, false) as cancelled,
      r.withdrawn_at is null and (r.orders_close_on is null or r.orders_close_on >= br.today)
        and (r.batch_id is null or (b.cancelled_at is null and b.closed_at is null)) as dated_open,
      br.today - (r.released_at at time zone br.timezone)::date as days_open,
      fv.bbl_per_unit, b.wholesale_bbl as pool_bbl
    from public.releases r
    cross join brewery br
    join public.skus s on s.id = r.sku_id and s.brewery_id = r.brewery_id
    left join public.format_volumes fv on fv.id = s.format_id
    left join counted c on c.release_id = r.id
    left join public.batches b on b.id = r.batch_id and b.brewery_id = r.brewery_id
    where r.brewery_id = p_brewery
  ), pooled as (
    select base.*, pool_bbl - sum((confirmed + preordered) * bbl_per_unit) over (partition by batch_id) as pool_left_bbl from base
  )
  select id, batch_id, sku_id, qty, ships_from, orders_close_on, released_at, withdrawn_at, ready_on,
    packaged, cancelled, dated_open and not packaged as open, confirmed, preordered,
    -- least() skips a null: a release with no limit of its own follows the pool, and one without a pool its own limit.
    greatest(coalesce(least(qty - confirmed - preordered,
      case when pool_bbl is not null then floor(greatest(pool_left_bbl, 0) / nullif(bbl_per_unit, 0)) end), 0), 0) as remaining,
    case
      when batch_id is not null then case when packaged then preordered else 0 end
      when dated_open then greatest(qty - confirmed, preordered)
      else preordered
    end as stock_claim,
    -- Below zero when the pool was lowered under what is already ordered: Confirm order flags it.
    days_open, bbl_per_unit, pool_bbl, pool_left_bbl
  from pooled;
$$;
revoke all on function private.release_state(uuid) from public, anon, authenticated, service_role;

drop function public.release_rows(uuid, uuid[], uuid[], uuid[], boolean);
create function public.release_rows(p_brewery uuid, p_ids uuid[] default null, p_skus uuid[] default null, p_batches uuid[] default null, p_open boolean default null)
returns table(id uuid, batch_id uuid, batch_no bigint, sku_id uuid, sku_name text, qty numeric, ships_from date, orders_close_on date, released_at timestamptz, withdrawn_at timestamptz,
  ready_on date, open boolean, cancelled boolean, confirmed numeric, preordered numeric, remaining numeric, bbl_per_unit numeric, pool_bbl numeric, pool_left_bbl numeric, planned_bbl numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales','warehouse','brewer']::public.staff_role[]);
  return query
    select r.id, r.batch_id, b.batch_no, r.sku_id, s.name, r.qty, r.ships_from, r.orders_close_on,
      r.released_at, r.withdrawn_at, r.ready_on, r.open, r.cancelled, r.confirmed, r.preordered, r.remaining,
      r.bbl_per_unit, r.pool_bbl, r.pool_left_bbl, b.planned_bbl
    from private.release_state(p_brewery) r
    join public.skus s on s.id = r.sku_id and s.brewery_id = p_brewery
    left join public.batches b on b.id = r.batch_id and b.brewery_id = p_brewery
    where (p_ids is null or r.id = any(p_ids))
      and (p_skus is null or r.sku_id = any(p_skus))
      and (p_batches is null or r.batch_id = any(p_batches))
      and (p_open is null or r.open = p_open)
    order by r.ships_from, s.name, r.released_at, r.id;
end $$;
revoke all on function public.release_rows(uuid, uuid[], uuid[], uuid[], boolean) from public, anon, authenticated, service_role;
grant execute on function public.release_rows(uuid, uuid[], uuid[], uuid[], boolean) to authenticated;

-- Each customer's ceiling, in percent of a pool. manual_pct is the typed share.
-- With a history window set, the calculated share is the customer's part of
-- everyone's barrels on confirmed, picked and shipped wholesale orders in the
-- window, a barrel bought from stock counting release_stock_multiplier times,
-- kept between 5 percent and release_max_share_pct. base_pct is the same part
-- with every barrel counted once, so staff can see what stock purchases added.
-- pct is the ceiling that applies: typed, else calculated, else null (none).
-- ponytail: the 5 percent floor is fixed, so a small buyer's share never rounds
-- down to nothing they can order; make it a brewery setting if one size does not fit.
create function private.release_shares(p_brewery uuid)
returns table(customer_id uuid, manual_pct numeric, base_pct numeric, pct numeric)
language sql stable set search_path = '' as $$
  with b as (
    select release_share_window_days as win, release_stock_multiplier as mult, release_max_share_pct as cap from public.breweries where id = p_brewery
  ), bought as (
    select o.customer_id, sum(v.bbl) as plain, sum(v.bbl * case when rel.batch_id is null then b.mult else 1 end) as weighted
    from public.orders o
    join b on b.win is not null
    join public.order_lines ol on ol.order_id = o.id and ol.brewery_id = o.brewery_id
    join public.skus s on s.id = ol.sku_id and s.brewery_id = ol.brewery_id
    join public.format_volumes fv on fv.id = s.format_id
    left join public.releases rel on rel.id = ol.release_id
    cross join lateral (select coalesce(ol.qty_shipped, ol.qty_ordered) * fv.bbl_per_unit as bbl) v
    where o.brewery_id = p_brewery and o.kind = 'wholesale' and o.status in ('confirmed','picked','shipped')
      and coalesce(o.shipped_at, o.created_at) >= now() - make_interval(days => b.win)
    group by 1
  ), total as (
    select sum(plain) as plain, sum(weighted) as weighted from bought
  )
  select c.id, c.release_share_pct, round(100 * bo.plain / nullif(t.plain, 0), 1),
    -- least() skips a null, so a customer with no purchases must not fall through to the maximum.
    coalesce(c.release_share_pct, case when bo.weighted > 0 then least(b.cap, greatest(5, round(100 * bo.weighted / t.weighted, 1))) end)
  from public.customers c
  cross join b cross join total t
  left join bought bo on bo.customer_id = c.id
  where c.brewery_id = p_brewery;
$$;
revoke all on function private.release_shares(uuid) from public, anon, authenticated, service_role;

/** Staff view of the ceilings, for Settings. */
create function public.release_share_rows(p_brewery uuid)
returns table(customer_id uuid, customer_name text, manual_pct numeric, base_pct numeric, pct numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales']::public.staff_role[]);
  return query select s.customer_id, c.name, s.manual_pct, s.base_pct, s.pct
    from private.release_shares(p_brewery) s join public.customers c on c.id = s.customer_id order by c.name;
end $$;
revoke all on function public.release_share_rows(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_share_rows(uuid) to authenticated;

-- A buyer's barrels already counted on each batch: submitted orders and later.
create function private.customer_batch_bbl(p_brewery uuid, p_customer uuid)
returns table(batch_id uuid, bbl numeric)
language sql stable set search_path = '' as $$
  select rel.batch_id, sum(ol.qty_ordered * fv.bbl_per_unit)
  from public.order_lines ol
  join public.orders o on o.id = ol.order_id and o.brewery_id = ol.brewery_id
  join public.releases rel on rel.id = ol.release_id and rel.batch_id is not null
  join public.skus s on s.id = ol.sku_id and s.brewery_id = ol.brewery_id
  join public.format_volumes fv on fv.id = s.format_id
  where ol.brewery_id = p_brewery and o.customer_id = p_customer and o.status in ('submitted','confirmed','picked','shipped')
  group by 1;
$$;
revoke all on function private.customer_batch_bbl(uuid, uuid) from public, anon, authenticated, service_role;

-- As before, then per batch: the order's lines together must fit the pool, and
-- until the ceiling lifts the customer's barrels on the batch stay within it.
-- The order being checked is still a quote or a draft, so it is not yet counted.
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
    select r.batch_id, min(br.name) as brand, min(r.pool_bbl) as pool_bbl, min(r.pool_left_bbl) as left_bbl, min(r.ships_from) as ships_from,
      sum((e->>'qty')::numeric * r.bbl_per_unit) as want_bbl
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
    if v_share is not null and v_today < b.ships_from - v_lift then
      select coalesce((select u.bbl from private.customer_batch_bbl(p_brewery, p_customer) u where u.batch_id = b.batch_id), 0) into v_used;
      v_limit := round(v_share / 100 * b.pool_bbl, 2);
      if v_used + b.want_bbl > v_limit then
        raise exception 'Your limit on % is % bbl until %; % bbl of it is left', b.brand, trim_scale(v_limit),
          to_char(b.ships_from - v_lift, 'Mon FMDD'), trim_scale(greatest(v_limit - v_used, 0));
      end if;
    end if;
  end loop;
end $$;

-- release_sku gains p_wholesale_bbl: releasing from a batch sets (or changes)
-- the batch's pool, and a line may then leave its quantity out. The pool stays
-- within the planned batch and above what is already confirmed on it.
drop function public.release_sku(uuid, uuid, date, date, jsonb, uuid);
create function public.release_sku(
  p_brewery uuid, p_batch uuid, p_ships_from date, p_orders_close_on date, p_lines jsonb, p_request_id uuid, p_wholesale_bbl numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_batch public.batches; v_ships date; v_rows jsonb; l record; v_free numeric; v_pool numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'release_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'ships_from', p_ships_from,
      'orders_close_on', p_orders_close_on, 'lines', p_lines)
      || case when p_wholesale_bbl is not null then jsonb_build_object('wholesale_bbl', p_wholesale_bbl) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a release needs at least one SKU';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e
    where jsonb_typeof(e->'sku_id') is distinct from 'string'
      or (e ? 'qty' and (jsonb_typeof(e->'qty') is distinct from 'number'
        or (e->>'qty')::numeric <= 0 or (e->>'qty')::numeric <> trunc((e->>'qty')::numeric)))) then
    raise exception 'release quantities must be positive whole units';
  end if;
  if (select count(distinct e->>'sku_id') from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then
    raise exception 'a SKU appears twice in this release';
  end if;
  perform 1 from public.skus s where s.brewery_id = p_brewery
    and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e) order by s.id for update;
  if (select count(*) from public.skus s where s.brewery_id = p_brewery and s.active
      and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)) <> jsonb_array_length(p_lines) then
    raise exception 'sku not found or not active';
  end if;
  if p_batch is not null then
    select * into v_batch from public.batches where id = p_batch and brewery_id = p_brewery for update;
    if not found then raise exception 'batch not found'; end if;
    if v_batch.cancelled_at is not null or v_batch.closed_at is not null or private.batch_packaged(p_brewery, p_batch) then
      raise exception 'this batch is already packaged or cancelled; release its stock instead';
    end if;
    if exists (select 1 from public.skus s where s.brewery_id = p_brewery
        and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
        and s.brand_id is distinct from v_batch.intended_brand_id) then
      raise exception 'every SKU must be a package of the batch''s brand';
    end if;
    if p_wholesale_bbl is not null then perform private.set_batch_pool(p_brewery, p_batch, p_wholesale_bbl); end if;
    v_pool := coalesce(p_wholesale_bbl, v_batch.wholesale_bbl);
    v_ships := coalesce(p_ships_from, (select private.batch_ready_on(v_batch.brewed_on, v_batch.planned_on, days_to_package)
      from public.breweries where id = p_brewery));
  else
    if p_wholesale_bbl is not null then raise exception 'only a batch release has barrels open to wholesale'; end if;
    v_ships := coalesce(p_ships_from, (select (now() at time zone timezone)::date from public.breweries where id = p_brewery));
    for l in select s.id, s.name, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e
      join public.skus s on s.id = (e->>'sku_id')::uuid and s.brewery_id = p_brewery where e ? 'qty' loop
      v_free := private.release_stock_free(p_brewery, l.id);
      if l.qty > v_free then
        raise exception 'Only % of % are available to release from stock', greatest(v_free, 0), l.name;
      end if;
    end loop;
  end if;
  -- Without a pool every line needs its own quantity.
  if v_pool is null and exists (select 1 from jsonb_array_elements(p_lines) e where not e ? 'qty') then
    raise exception 'release quantities must be positive whole units';
  end if;
  -- A package draws from the pool by its size, so one without a size cannot be released from it.
  if v_pool is not null then
    select s.name into l from jsonb_array_elements(p_lines) e
      join public.skus s on s.id = (e->>'sku_id')::uuid and s.brewery_id = p_brewery
      left join public.format_volumes fv on fv.id = s.format_id
      where coalesce(fv.bbl_per_unit, 0) <= 0 limit 1;
    if found then raise exception '% has no barrels per unit, so it cannot draw from the batch''s pool', l.name; end if;
  end if;
  begin
    with made as (
      insert into public.releases (brewery_id, batch_id, sku_id, qty, ships_from, orders_close_on)
      select p_brewery, p_batch, (e->>'sku_id')::uuid, (e->>'qty')::numeric, v_ships, p_orders_close_on
      from jsonb_array_elements(p_lines) e
      returning id, sku_id, qty
    )
    select jsonb_agg(jsonb_build_object('id', id, 'sku_id', sku_id, 'qty', qty) order by sku_id) into v_rows from made;
  exception when unique_violation then
    raise exception 'this batch already has an open release for that SKU; edit it instead' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('releases', v_rows));
end $$;
revoke all on function public.release_sku(uuid, uuid, date, date, jsonb, uuid, numeric) from public, anon, authenticated, service_role;
grant execute on function public.release_sku(uuid, uuid, date, date, jsonb, uuid, numeric) to authenticated;

-- Sets a batch's pool. The caller holds the batch row lock.
create function private.set_batch_pool(p_brewery uuid, p_batch uuid, p_wholesale_bbl numeric)
returns void language plpgsql set search_path = '' as $$
declare v_planned numeric; v_confirmed numeric;
begin
  select planned_bbl into v_planned from public.batches where id = p_batch and brewery_id = p_brewery;
  if p_wholesale_bbl <= 0 then raise exception 'barrels open to wholesale must be above zero'; end if;
  if p_wholesale_bbl > v_planned then
    raise exception 'cannot open % bbl: the batch is planned at % bbl', trim_scale(p_wholesale_bbl), trim_scale(v_planned);
  end if;
  select coalesce(sum(r.confirmed * r.bbl_per_unit), 0) into v_confirmed from private.release_state(p_brewery) r where r.batch_id = p_batch;
  if p_wholesale_bbl < v_confirmed then
    raise exception 'cannot lower the pool below the % bbl already confirmed', trim_scale(round(v_confirmed, 2));
  end if;
  update public.batches set wholesale_bbl = p_wholesale_bbl where id = p_batch;
end $$;
revoke all on function private.set_batch_pool(uuid, uuid, numeric) from public, anon, authenticated, service_role;

-- update_release: the quantity may now be null on a batch release with a pool
-- (no limit of its own), and p_wholesale_bbl changes the batch's pool.
drop function public.update_release(uuid, uuid, numeric, date, uuid);
create function public.update_release(p_brewery uuid, p_release uuid, p_qty numeric, p_orders_close_on date, p_request_id uuid, p_wholesale_bbl numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.releases; v_confirmed numeric; v_free numeric; v_batch uuid; v_pool numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_release', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'release', p_release, 'qty', p_qty, 'orders_close_on', p_orders_close_on)
      || case when p_wholesale_bbl is not null then jsonb_build_object('wholesale_bbl', p_wholesale_bbl) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  -- The SKU row first, as release_sku and portal_submit_quote lock it before
  -- any release: the free-stock check below then sees one serialized state.
  -- Then the batch before the release, the order every writer of a pool uses.
  perform 1 from public.skus s join public.releases r on r.sku_id = s.id and r.brewery_id = s.brewery_id
    where r.id = p_release and r.brewery_id = p_brewery for update of s;
  select batch_id into v_batch from public.releases where id = p_release and brewery_id = p_brewery;
  if v_batch is not null then
    select wholesale_bbl into v_pool from public.batches where id = v_batch and brewery_id = p_brewery for update;
  end if;
  select * into v_row from public.releases where id = p_release and brewery_id = p_brewery for update;
  if not found then raise exception 'release not found'; end if;
  if v_row.withdrawn_at is not null then raise exception 'a withdrawn release cannot change'; end if;
  if p_wholesale_bbl is not null then
    if v_batch is null then raise exception 'only a batch release has barrels open to wholesale'; end if;
    perform private.set_batch_pool(p_brewery, v_batch, p_wholesale_bbl);
    v_pool := p_wholesale_bbl;
  end if;
  if p_qty is null and v_pool is null then raise exception 'release quantities must be positive whole units'; end if;
  if p_qty <= 0 or p_qty <> trunc(p_qty) then
    raise exception 'release quantities must be positive whole units';
  end if;
  select r.confirmed into v_confirmed from private.release_state(p_brewery) r where r.id = p_release;
  if p_qty < v_confirmed then
    raise exception 'cannot lower this release below the % already confirmed', v_confirmed;
  end if;
  if v_row.batch_id is null and p_qty > v_row.qty then
    v_free := private.release_stock_free(p_brewery, v_row.sku_id, p_release);
    if p_qty - v_confirmed > v_free then
      raise exception 'Only % more are available to release from stock', greatest(v_free - (v_row.qty - v_confirmed), 0);
    end if;
  end if;
  update public.releases set qty = p_qty, orders_close_on = p_orders_close_on
    where id = p_release returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.update_release(uuid, uuid, numeric, date, uuid, numeric) from public, anon, authenticated, service_role;
grant execute on function public.update_release(uuid, uuid, numeric, date, uuid, numeric) to authenticated;

-- The open releases one customer can order, with what a buyer needs to see
-- their ceiling: the package's size, the barrels of the batch still open to
-- them (null: no ceiling, or it has lifted) and the day the ceiling lifts.
-- portal_releases answers a buyer with it; the weekly digest reads it for every customer.
-- What a barrel of a batch's beer weighs in pounds, from its latest gravity
-- reading (water is 258.7 lb a barrel; the fraction turns Plato into specific
-- gravity). Null before the first reading; the portal then assumes 1.010.
-- A reading taken mid-ferment reads a little heavy, which errs on the safe side.
create function private.batch_lb_per_bbl(p_batch uuid) returns numeric language sql stable set search_path = '' as $$
  select round(258.7 * (1 + g.gravity_plato / (258.6 - 0.8796 * g.gravity_plato)), 1)
  from public.fermentation_readings g
  where g.batch_id = p_batch and g.gravity_plato is not null
  order by g.at desc limit 1;
$$;
revoke all on function private.batch_lb_per_bbl(uuid) from public, anon, authenticated, service_role;

create function private.customer_releases(p_customer uuid)
returns table(release_id uuid, sku_id uuid, ships_from date, orders_close_on date, badge text, from_batch boolean,
  bbl_per_unit numeric, limit_left_bbl numeric, limit_lifts_on date, lb_per_bbl numeric)
language sql stable set search_path = '' as $$
  with caller as (
    select c.id, c.brewery_id, c.sale_channel_id, c.release_delay_days, b.release_cap_lift_days as lift,
      (now() at time zone b.timezone)::date as today
    from public.customers c join public.breweries b on b.id = c.brewery_id
    where c.id = p_customer
  ), share as (
    select s.pct from private.release_shares((select brewery_id from caller)) s where s.customer_id = p_customer
  )
  select r.id, r.sku_id, r.ships_from, r.orders_close_on,
    case when r.remaining <= 0 then 'out' when r.remaining < 20 then 'low' else 'in' end,
    r.batch_id is not null, r.bbl_per_unit, cap.left_bbl, case when cap.left_bbl is not null then r.ships_from - c.lift end,
    private.batch_lb_per_bbl(r.batch_id)
  from private.release_state((select brewery_id from caller)) r
  join public.sku_prices p on p.sku_id = r.sku_id and p.active
  join caller c on c.brewery_id = p.brewery_id and c.sale_channel_id = p.sale_channel_id
  left join share on true
  left join private.customer_batch_bbl((select brewery_id from caller), p_customer) u on u.batch_id = r.batch_id
  cross join lateral (
    select case when share.pct is not null and r.pool_bbl is not null and c.today < r.ships_from - c.lift
      then greatest(round(share.pct / 100 * r.pool_bbl, 2) - coalesce(u.bbl, 0), 0) end as left_bbl
  ) cap
  where r.open and r.days_open >= c.release_delay_days
  order by r.ships_from, r.id;
$$;
revoke all on function private.customer_releases(uuid) from public, anon, authenticated, service_role;

drop function public.portal_releases(uuid);
create function public.portal_releases(p_customer uuid)
returns table(release_id uuid, sku_id uuid, ships_from date, orders_close_on date, badge text, from_batch boolean,
  bbl_per_unit numeric, limit_left_bbl numeric, limit_lifts_on date, lb_per_bbl numeric)
language sql stable security definer set search_path = '' as $$
  select r.* from private.customer_releases(p_customer) r where p_customer in (select public.my_customer_ids());
$$;
revoke all on function public.portal_releases(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_releases(uuid) to authenticated;

-- A buyer's own ceiling in percent, what it would be without the stock
-- multiplier, and the days before ship it lifts. No row means no ceiling.
create function public.portal_release_share(p_customer uuid)
returns table(pct numeric, base_pct numeric, manual boolean, lift_days integer)
language sql stable security definer set search_path = '' as $$
  select s.pct, s.base_pct, s.manual_pct is not null, b.release_cap_lift_days
  from public.customers c
  join public.breweries b on b.id = c.brewery_id
  join private.release_shares(c.brewery_id) s on s.customer_id = c.id
  where c.id = p_customer and c.id in (select public.my_customer_ids()) and s.pct is not null;
$$;
revoke all on function public.portal_release_share(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_release_share(uuid) to authenticated;

-- A buyer's usual quantity of each open batch release, following where their
-- buying is now: an average of their last six order lines in which the latest
-- counts most and each one before it half as much. It uses lines of the same
-- style and package when they have any, and otherwise of the package alone, so
-- a new style still gets a suggestion. Only orders from the last 180 days
-- count, so a customer who stopped ordering is not offered an old order. The
-- result is less what they already ordered on the release, held to what is
-- left; releases with nothing to suggest are left out. last_on is the date of
-- the latest order it drew on. An order's size is not used: imported orders
-- sometimes merge several can weeks, so only per-beer quantities are trusted.
create function private.suggested_order(p_brewery uuid, p_customer uuid)
returns table(release_id uuid, sku_id uuid, qty numeric, last_on date, can_round_up boolean)
language sql stable set search_path = '' as $$
  with c as (
    select sale_channel_id, release_delay_days from public.customers where id = p_customer and brewery_id = p_brewery
  ), lines as (
    -- Imported history carries its real date in shipped_at; created_at is when it was entered.
    select ol.id, o.id as order_id, s.format_id, br.style_id, ol.qty_ordered, ol.release_id, coalesce(o.shipped_at, o.created_at) as ordered_at
    from public.orders o
    join public.order_lines ol on ol.order_id = o.id and ol.brewery_id = o.brewery_id
    join public.skus s on s.id = ol.sku_id and s.brewery_id = ol.brewery_id
    join public.brands br on br.id = s.brand_id
    where o.brewery_id = p_brewery and o.customer_id = p_customer and o.kind = 'wholesale'
      and o.status in ('submitted','confirmed','picked','shipped')
      and coalesce(o.shipped_at, o.created_at) >= now() - interval '180 days'
  ), mine as (
    select ol.release_id, sum(ol.qty_ordered) as qty
    from public.order_lines ol join public.orders o on o.id = ol.order_id and o.brewery_id = ol.brewery_id
    where ol.brewery_id = p_brewery and o.customer_id = p_customer and ol.release_id is not null
      and o.status in ('submitted','confirmed','picked','shipped')
    group by 1
  ), beers as (
  select r.id, r.sku_id, r.ships_from, r.remaining, usual.qty, usual.last_on, coalesce(mine.qty, 0) as mine, f.pallet_fit
  from private.release_state(p_brewery) r
  join c on r.days_open >= c.release_delay_days
  join public.skus s on s.id = r.sku_id and s.brewery_id = p_brewery
  join public.brands br on br.id = s.brand_id
  join public.formats f on f.id = s.format_id
  join public.sku_prices p on p.sku_id = r.sku_id and p.active and p.sale_channel_id = c.sale_channel_id
  left join mine on mine.release_id = r.id
  cross join lateral (
    select round(sum(w.qty_ordered * w.weight) / sum(w.weight)) as qty, max(w.ordered_at)::date as last_on
    from (
      select l.qty_ordered, l.ordered_at, power(0.5, row_number() over (order by l.ordered_at desc, l.id desc) - 1) as weight
      from lines l
      -- Lines already on this release are what is being topped up, not habit.
      where l.format_id = s.format_id and l.release_id is distinct from r.id
        and (l.style_id = br.style_id or not exists (
          select 1 from lines m where m.format_id = s.format_id and m.style_id = br.style_id and m.release_id is distinct from r.id))
      order by l.ordered_at desc, l.id desc
      limit 6
    ) w
  ) usual
  where r.open and r.batch_id is not null and usual.qty is not null
  )
  -- can_round_up: the release has a whole layer to spare after the suggestion, so
  -- the portal may round it up to a full layer without asking for more than is left.
  select b.id, b.sku_id, least(b.qty - b.mine, b.remaining), b.last_on,
    b.remaining - least(b.qty - b.mine, b.remaining) >= coalesce(b.pallet_fit, 0)
  from beers b
  where least(b.qty - b.mine, b.remaining) > 0
  order by b.ships_from, b.id;
$$;
revoke all on function private.suggested_order(uuid, uuid) from public, anon, authenticated, service_role;

create function public.portal_suggested_order(p_customer uuid)
returns table(release_id uuid, sku_id uuid, qty numeric, last_on date, can_round_up boolean)
language sql stable security definer set search_path = '' as $$
  select s.release_id, s.sku_id, s.qty, s.last_on, s.can_round_up
  from public.customers c, private.suggested_order(c.brewery_id, c.id) s
  where c.id = p_customer and c.id in (select public.my_customer_ids());
$$;
revoke all on function public.portal_suggested_order(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_suggested_order(uuid) to authenticated;

-- The Releases section of Settings. Admin only, as the other brewery defaults.
create function public.set_release_defaults(
  p_brewery uuid, p_open_pct integer, p_order_by_days integer, p_cap_lift_days integer, p_share_window_days integer,
  p_stock_multiplier numeric, p_max_share_pct integer, p_digest_dow integer, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'set_release_defaults', p_request_id,
    jsonb_build_object('open_pct', p_open_pct, 'order_by_days', p_order_by_days, 'cap_lift_days', p_cap_lift_days,
      'share_window_days', p_share_window_days, 'stock_multiplier', p_stock_multiplier, 'max_share_pct', p_max_share_pct, 'digest_dow', p_digest_dow));
  if v_replay is not null then return v_replay; end if;
  update public.breweries set release_open_pct = p_open_pct, release_order_by_days = p_order_by_days,
    release_cap_lift_days = p_cap_lift_days, release_share_window_days = p_share_window_days,
    release_stock_multiplier = p_stock_multiplier, release_max_share_pct = p_max_share_pct, release_digest_dow = p_digest_dow
    where id = p_brewery;
  return private.complete_command_request(p_request_id, '{"ok":true}');
end $$;
revoke all on function public.set_release_defaults(uuid, integer, integer, integer, integer, numeric, integer, integer, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_release_defaults(uuid, integer, integer, integer, integer, numeric, integer, integer, uuid) to authenticated;

-- upsert_customer gains the typed ceiling: p_release_share_pct sets it, and
-- p_clear_release_share removes it (null keeps the current one, as the delay does).
drop function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text, integer);
CREATE OR REPLACE FUNCTION public.upsert_customer(p_brewery uuid, p_id uuid, p_name text, p_type customer_type, p_state text, p_sale_channel uuid, p_license_no text, p_payment_terms text, p_tax_treatment tax_treatment, p_request_id uuid, p_alias text DEFAULT NULL::text, p_country text DEFAULT 'US'::text, p_release_delay_days integer DEFAULT NULL::integer, p_release_share_pct numeric DEFAULT NULL::numeric, p_clear_release_share boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_replay jsonb; v_row public.customers; v_terms text := nullif(btrim(p_payment_terms), ''); v_payload jsonb;
  -- The whitespace characters removed by the command schema's String.trim().
  v_name text := btrim(p_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'type', p_type, 'state', p_state, 'sale_channel', p_sale_channel, 'license_no', p_license_no, 'payment_terms', p_payment_terms, 'tax_treatment', p_tax_treatment);
  if p_alias is not null then v_payload := v_payload || jsonb_build_object('alias', p_alias); end if;
  if p_country is distinct from 'US' then v_payload := v_payload || jsonb_build_object('country', p_country); end if;
  if p_release_delay_days is not null then v_payload := v_payload || jsonb_build_object('release_delay_days', p_release_delay_days); end if;
  if p_release_share_pct is not null then v_payload := v_payload || jsonb_build_object('release_share_pct', p_release_share_pct); end if;
  if p_clear_release_share then v_payload := v_payload || jsonb_build_object('clear_release_share', true); end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_customer', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'a customer name is required' using errcode = '22023'; end if;
  if p_sale_channel is null then raise exception 'customer needs a sale channel' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.customers (brewery_id, name, type, state, sale_channel_id, license_no, payment_terms, tax_treatment, alias, country, release_delay_days, release_share_pct)
      values (p_brewery, v_name, p_type, p_state, p_sale_channel, p_license_no, coalesce(v_terms, 'net30'), p_tax_treatment, p_alias, p_country, coalesce(p_release_delay_days, 0), p_release_share_pct) returning * into v_row;
  else
    update public.customers set name = v_name, type = p_type, state = p_state, sale_channel_id = p_sale_channel,
      license_no = p_license_no, payment_terms = coalesce(v_terms, payment_terms), tax_treatment = p_tax_treatment,
      alias = p_alias, country = p_country, release_delay_days = coalesce(p_release_delay_days, release_delay_days),
      release_share_pct = case when p_clear_release_share then null else coalesce(p_release_share_pct, release_share_pct) end
      where id = p_id and brewery_id = p_brewery returning * into v_row;
    if not found then raise exception 'customer not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $function$;
revoke all on function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text, integer, numeric, boolean) from public, anon, authenticated, service_role;
grant execute on function public.upsert_customer(uuid, uuid, text, public.customer_type, text, uuid, text, text, public.tax_treatment, uuid, text, text, integer, numeric, boolean) to authenticated;

-- One pool per batch: both submit paths lock the batch before its releases.
CREATE OR REPLACE FUNCTION public.portal_submit_quote(p_brewery uuid, p_customer uuid, p_quote uuid, p_order uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_replay jsonb; v_row private.portal_order_quotes; v_current jsonb; v_result jsonb; v_order uuid;
begin
  v_actor:=private.assert_customer(p_brewery,p_customer);
  v_replay:=private.claim_command_request(p_brewery,'portal_submit_quote',p_request_id,
    jsonb_build_object('brewery',p_brewery,'customer',p_customer,'quoteId',p_quote,'orderId',p_order));
  if v_replay is not null then return v_replay; end if;
  select * into v_row from private.portal_order_quotes where id=p_quote and actor_id=v_actor
    and brewery_id=p_brewery and customer_id=p_customer for update;
  if not found then raise exception 'quote not found'; end if;
  if v_row.submitted_order_id is not null then raise exception 'quote was already submitted' using errcode='MG409'; end if;
  if v_row.expires_at<=now() then raise exception 'quote expired; review the order again' using errcode='MG409'; end if;
  -- Lock every mutable row that contributed to the quote. Ordinary writers
  -- acquire these same row locks when updating, so the comparison and order
  -- line writes below observe one serialized state at READ COMMITTED.
  perform 1 from public.customers where id=p_customer and brewery_id=p_brewery for update;
  perform 1 from public.ship_tos where id=(v_row.snapshot#>>'{input,shipToId}')::uuid and brewery_id=p_brewery for update;
  perform 1 from public.breweries where id=p_brewery for update;
  -- The one-way keg fee comes from the customer's sale channel (20261117190000).
  perform 1 from public.sale_channels c join public.customers cu on cu.sale_channel_id=c.id and cu.brewery_id=c.brewery_id
    where cu.id=p_customer and c.brewery_id=p_brewery for update of c;
  perform 1 from public.locations where id=(v_row.snapshot#>>'{source,id}')::uuid and brewery_id=p_brewery for update;
  perform 1 from public.skus s where s.id in (
    select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
  ) order by s.id for update;
  perform 1 from public.brands b where b.id in (
    select s.brand_id from public.skus s where s.id in (
      select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
    )
  ) order by b.id for update;
  perform 1 from public.formats f where f.id in (
    select s.format_id from public.skus s where s.id in (
      select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
    )
  ) order by f.id for update;
  perform 1 from public.channel_prices cp
  join public.brands b on b.price_group_id=cp.price_group_id and b.brewery_id=cp.brewery_id
  join public.skus s on s.brand_id=b.id and s.format_id=cp.format_id and s.brewery_id=cp.brewery_id
  where cp.brewery_id=p_brewery
    and cp.sale_channel_id=(select sale_channel_id from public.customers where id=p_customer)
    and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e)
  order by cp.sale_channel_id,cp.price_group_id,cp.format_id for update of cp;
  perform 1 from public.keg_pools k where k.id in (
    select (e->>'depositPoolId')::uuid from jsonb_array_elements(v_row.snapshot->'lines') e
    where e->>'depositPoolId' is not null
  ) order by k.id for update;
  -- Releases (20261118190000): the snapshot below rechecks remaining under this lock.
  -- A draft being submitted is locked first, as submit_order locks the order
  -- before its releases, so the two never wait on each other in a cycle.
  if p_order is not null then
    perform 1 from public.orders where id=p_order and brewery_id=p_brewery and customer_id=p_customer for update;
  end if;
  -- Every package of a batch draws one pool (20261119160000): lock the batch, so two
  -- orders on different packages of it cannot both take the last barrels.
  perform 1 from public.batches b where b.brewery_id=p_brewery and b.id in (
    select r.batch_id from public.releases r where r.brewery_id=p_brewery and r.id in (
      select (e->>'release_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e)
  ) order by b.id for update;
  perform 1 from public.releases r where r.brewery_id=p_brewery and r.id in (
    select (e->>'release_id')::uuid from jsonb_array_elements(v_row.snapshot#>'{input,lines}') e
  ) order by r.id for update;
  v_current:=private.portal_quote_snapshot(p_brewery,p_customer,
    (v_row.snapshot#>>'{input,shipToId}')::uuid,(v_row.snapshot#>>'{input,requestedShipDate}')::date,
    v_row.snapshot#>>'{input,poNumber}',v_row.snapshot#>>'{input,note}',v_row.snapshot#>'{input,lines}');
  if (v_current-'taxInput')<>(v_row.snapshot-'taxInput') then
    raise exception 'order details changed; review the current quote again' using errcode='MG409';
  end if;
  if p_order is null then
    v_result:=private.create_order_impl(p_brewery,'wholesale',p_customer,
      (v_row.snapshot#>>'{input,shipToId}')::uuid,(v_row.snapshot#>>'{source,id}')::uuid,null,
      (v_row.snapshot#>>'{input,requestedShipDate}')::date,v_row.snapshot#>>'{input,poNumber}',v_row.snapshot#>>'{input,note}',v_row.snapshot#>'{input,lines}');
    v_order:=(v_result->>'order_id')::uuid;
  else
    perform 1 from public.orders where id=p_order and brewery_id=p_brewery and customer_id=p_customer and status='draft' for update;
    if not found then raise exception 'order not found'; end if;
    v_result:=private.update_draft_order_impl(p_order,(v_row.snapshot#>>'{input,shipToId}')::uuid,
      (v_row.snapshot#>>'{input,requestedShipDate}')::date,v_row.snapshot#>>'{input,poNumber}',v_row.snapshot#>>'{input,note}',v_row.snapshot#>'{input,lines}');
    v_order:=p_order;
  end if;
  delete from public.order_deposit_lines where order_id=v_order;
  insert into public.order_deposit_lines(
    brewery_id,order_id,order_line_id,keg_pool_id,keg_size,description,qty_ordered,unit_price_cents
  )
  select p_brewery,v_order,ol.id,(e->>'depositPoolId')::uuid,(e->>'kegSize')::public.keg_size,
    coalesce(nullif(e->>'depositName',''),'Keg')||' deposit',(e->>'qty')::numeric,(e->>'depositUnitPriceCents')::int
  from jsonb_array_elements(v_row.snapshot->'lines') e
  join public.order_lines ol on ol.order_id=v_order and ol.sku_id=(e->>'skuId')::uuid
  where e->>'depositPoolId' is not null and (e->>'depositUnitPriceCents')::int>0;
  v_result:=private.submit_order_impl(v_order);
  update private.portal_order_quotes set submitted_order_id=v_order where id=p_quote;
  return private.complete_command_request(p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.submit_order(p_order uuid, p_request_id uuid, p_expected_brewery uuid DEFAULT NULL::uuid, p_expected_customer uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid; v_replay jsonb; v_result jsonb; v_is_staff boolean;
begin
  select o.brewery_id,
    exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && array['admin','sales']::public.staff_role[]
    )
    into v_brewery, v_is_staff
  from public.orders o
  where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    and (
      exists (
        select 1 from public.brewery_users bu
        where bu.brewery_id = o.brewery_id
          and bu.user_id = auth.uid()
          and bu.roles && array['admin','sales']::public.staff_role[]
      )
      or exists (
        select 1 from public.customer_users cu
        where cu.customer_id = o.customer_id and cu.user_id = auth.uid()
      )
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'submit_order',p_request_id,jsonb_build_object('order',p_order,'expected_brewery',p_expected_brewery,'expected_customer',p_expected_customer));
  if v_replay is not null then return v_replay; end if;
  -- Keep the shared claim-before-order-lock ordering. The first scope check
  -- rejects a wrong active account without claiming; this locked check prevents
  -- target scope changing between that read and the transactional write.
  perform 1 from public.orders o where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    for update of o;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  if not v_is_staff and not exists (
    select 1 from public.orders where id=p_order and status='draft'
  ) then
    raise exception 'order not found';
  end if;
  if not v_is_staff then
    -- The batch before its releases, as portal_submit_quote locks them: one pool per batch.
    perform 1 from public.batches b where b.id in (
      select r.batch_id from public.releases r where r.id in (
        select release_id from public.order_lines where order_id = p_order and release_id is not null)
    ) order by b.id for update;
    perform 1 from public.releases r where r.id in (
      select release_id from public.order_lines where order_id = p_order and release_id is not null
    ) order by r.id for update;
    perform private.assert_portal_offers(v_brewery,
      (select customer_id from public.orders where id = p_order),
      (select requested_ship_date from public.orders where id = p_order),
      (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('sku_id', sku_id, 'qty', qty_ordered, 'release_id', release_id)))
       from public.order_lines where order_id = p_order));
  end if;
  v_result := private.submit_order_impl(p_order); return private.complete_command_request(p_request_id,v_result);
end $function$;

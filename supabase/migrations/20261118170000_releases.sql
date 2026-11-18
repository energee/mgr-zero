-- Portal releases, Phase A (docs/plans/portal-release-windows.md).
--
-- Staff control portal orderability per SKU: skus.portal_from_stock turns the
-- packaged-stock offer off without deactivating the SKU, and a release offers a
-- quantity of one SKU, from a planned batch or from packaged stock, for
-- delivery on or after ships_from. An order line names the release it draws
-- on. private.release_state is the one owner of a release's counts (confirmed,
-- pre-ordered, remaining), whether it is open, and what it still claims of
-- packaged stock; every reader below goes through it.
--
-- Redefined functions start from their latest definition and keep all of it:
--   portal_availability   20261030031040_tenancy_identity_and_team_authority.sql
--   portal_quote_snapshot 20261117190000_channel_one_way_keg_fee.sql
--   portal_submit_quote   20261118070000_portal_submit_locks_sale_channel.sql
--   create_order_impl,
--   update_draft_order_impl 20261016100200_pickup_orders.sql
--   submit_order          20261017144000_staff_roles.sql
--   portal_order_rows     20261016100900_portal_order_ship_to_country.sql
--   update_sku, projected_batch_packaging_units 20261017143500_projected_packaging_demand.sql

alter table public.skus add column portal_from_stock boolean not null default true;

create table public.releases (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  batch_id uuid,                         -- null: released from packaged stock
  sku_id uuid not null,
  qty numeric(12,2) not null check (qty > 0),
  ships_from date not null,
  orders_close_on date,
  released_at timestamptz not null default now(),
  released_by uuid not null default auth.uid(),
  withdrawn_at timestamptz,
  unique (id, brewery_id),
  -- Order lines reference (release, brewery, SKU), so a line can only draw on
  -- a release of its own SKU.
  unique (id, brewery_id, sku_id),
  foreign key (batch_id, brewery_id) references public.batches (id, brewery_id),
  foreign key (sku_id, brewery_id) references public.skus (id, brewery_id)
);
-- One open release per batch and SKU; a withdrawn one can be released again.
create unique index releases_batch_sku_uidx on public.releases (batch_id, sku_id)
  where batch_id is not null and withdrawn_at is null;
create index releases_brewery_sku_idx on public.releases (brewery_id, sku_id);
alter table public.releases enable row level security;
create policy staff_read on public.releases for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[])));
-- Writes go through release_sku, update_release and withdraw_release (admin/sales).
revoke all on public.releases from anon, authenticated;
grant select on public.releases to authenticated;

alter table public.order_lines add column release_id uuid;
alter table public.order_lines add constraint order_lines_release_fkey
  foreign key (release_id, brewery_id, sku_id) references public.releases (id, brewery_id, sku_id);
create index order_lines_release_idx on public.order_lines (release_id) where release_id is not null;

-- The release form prefills from this projection, one batch at a time, so it
-- names the batch. New columns go last; existing readers are unchanged.
-- needed_by is a batch's ready date; private.batch_ready_on below computes the
-- same date for definer code, and the two must stay equal.
create or replace view public.projected_batch_packaging_units with (security_invoker = true) as
  select b.brewery_id, s.id as sku_id,
    floor(b.planned_bbl * s.batch_share / fv.bbl_per_unit) as units,
    coalesce(b.brewed_on, b.planned_on) + br.days_to_package as needed_by,
    b.id as batch_id, b.batch_no
  from public.batches b
  join public.breweries br on br.id = b.brewery_id
  join public.skus s on s.brand_id = b.intended_brand_id and s.brewery_id = b.brewery_id
    and s.active and s.batch_share is not null
  join public.format_volumes fv on fv.id = s.format_id and fv.bbl_per_unit > 0
  where b.cancelled_at is null and b.closed_at is null
    and b.brewery_id in (select public.my_staff_brewery_ids(array['admin','sales','warehouse','brewer']::public.staff_role[]))
    and floor(b.planned_bbl * s.batch_share / fv.bbl_per_unit) > 0
    and not exists (
      select 1 from public.packaging_runs r
      left join public.vessel_occupancies o on o.id = r.occupancy_id and o.brewery_id = r.brewery_id
      where r.brewery_id = b.brewery_id and r.cancelled_at is null
        and (r.batch_id = b.id or o.batch_id = b.id));

-- A batch is packaged once any uncancelled packaging run draws on it: the same
-- signal projected_batch_packaging_units uses to stop projecting it. The view
-- repeats this predicate instead of calling here because it is security_invoker
-- and application roles cannot execute private functions; keep the two equal.
create function private.batch_packaged(p_brewery uuid, p_batch uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.packaging_runs r
    left join public.vessel_occupancies o on o.id = r.occupancy_id and o.brewery_id = r.brewery_id
    where r.brewery_id = p_brewery and r.cancelled_at is null
      and (r.batch_id = p_batch or o.batch_id = p_batch));
$$;
revoke all on function private.batch_packaged(uuid, uuid) from public, anon, authenticated, service_role;

-- A batch's ready date: brew date (planned date until brewed) plus the
-- brewery's days to package. One owner for release_state and release_sku.
create function private.batch_ready_on(p_brewed_on date, p_planned_on date, p_days_to_package integer) returns date
language sql immutable set search_path = '' as $$
  select coalesce(p_brewed_on, p_planned_on) + p_days_to_package;
$$;
revoke all on function private.batch_ready_on(date, date, integer) from public, anon, authenticated, service_role;

-- Every release of one brewery with its counts. Counted lines are on orders
-- that are submitted (pre-ordered) or confirmed, picked or shipped
-- (confirmed; a shipped line counts what shipped, so a short shipment leaves
-- the rest of the release claimed); drafts and cancelled orders do not count. A release is open
-- while it is not withdrawn, its order-by date (brewery time) has not passed,
-- and its batch is not packaged, completed or cancelled. stock_claim is what
-- it still holds back from the packaged-stock offer: an open stock release
-- holds its quantity less what confirmed lines already allocated; a closed one
-- holds its standing pre-orders; a packaged batch release holds its
-- pre-orders, since that stock now exists; an unpackaged batch holds nothing.
create function private.release_state(p_brewery uuid)
returns table (
  id uuid, batch_id uuid, sku_id uuid, qty numeric, ships_from date, orders_close_on date,
  released_at timestamptz, withdrawn_at timestamptz, ready_on date, packaged boolean, cancelled boolean,
  open boolean, confirmed numeric, preordered numeric, remaining numeric, stock_claim numeric
)
language sql stable set search_path = '' as $$
  with brewery as (
    select (now() at time zone timezone)::date as today, days_to_package from public.breweries where id = p_brewery
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
        and (r.batch_id is null or (b.cancelled_at is null and b.closed_at is null)) as dated_open
    from public.releases r
    cross join brewery br
    left join counted c on c.release_id = r.id
    left join public.batches b on b.id = r.batch_id and b.brewery_id = r.brewery_id
    where r.brewery_id = p_brewery
  )
  select id, batch_id, sku_id, qty, ships_from, orders_close_on, released_at, withdrawn_at, ready_on,
    packaged, cancelled, dated_open and not packaged as open, confirmed, preordered,
    greatest(qty - confirmed - preordered, 0) as remaining,
    case
      when batch_id is not null then case when packaged then preordered else 0 end
      when dated_open then greatest(qty - confirmed, preordered)
      else preordered
    end as stock_claim
  from base;
$$;
revoke all on function private.release_state(uuid) from public, anon, authenticated, service_role;

-- Packaged stock a new or larger stock release may still set aside: ATP less
-- what other releases claim (p_except leaves out the release being edited).
create function private.release_stock_free(p_brewery uuid, p_sku uuid, p_except uuid default null) returns numeric
language sql stable set search_path = '' as $$
  select coalesce((select a.qty from public.atp a where a.brewery_id = p_brewery and a.sku_id = p_sku), 0)
    - coalesce((select sum(r.stock_claim) from private.release_state(p_brewery) r
                where r.sku_id = p_sku and r.id is distinct from p_except), 0);
$$;
revoke all on function private.release_stock_free(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- What a buyer may order: a line with release_id must name an open release of
-- its SKU with enough remaining, and the requested date must be on or after
-- that release's ships-from date; a line without one needs a SKU orderable
-- from stock. Callers lock the named release rows first, so the remaining
-- check sees every committed order.
create function private.assert_portal_offers(p_brewery uuid, p_requested date, p_lines jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare l record;
begin
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
    if l.want > l.remaining then raise exception 'Only % of % left in this release', l.remaining, l.name; end if;
    if p_requested is null or p_requested < l.ships_from then
      raise exception '% ships from %; choose a requested date on or after it', l.name, l.ships_from;
    end if;
  end loop;
end $$;
revoke all on function private.assert_portal_offers(uuid, date, jsonb) from public, anon, authenticated, service_role;

-- Staff read of releases with their counts. Brewers see quantities only, like
-- order_packaging_shortfall_rows; no customer data leaves. p_open keeps only
-- releases buyers can (true) or can no longer (false) order from.
create function public.release_rows(p_brewery uuid, p_ids uuid[] default null, p_skus uuid[] default null, p_batches uuid[] default null, p_open boolean default null)
returns table (
  id uuid, batch_id uuid, batch_no bigint, sku_id uuid, sku_name text, qty numeric, ships_from date,
  orders_close_on date, released_at timestamptz, withdrawn_at timestamptz, ready_on date, open boolean,
  cancelled boolean, confirmed numeric, preordered numeric, remaining numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales','warehouse','brewer']::public.staff_role[]);
  return query
    select r.id, r.batch_id, b.batch_no, r.sku_id, s.name, r.qty, r.ships_from, r.orders_close_on,
      r.released_at, r.withdrawn_at, r.ready_on, r.open, r.cancelled, r.confirmed, r.preordered, r.remaining
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

-- Release SKUs for portal ordering: one row per line. From a batch (planned,
-- not packaged, every SKU a package of its brand) ships_from defaults to the
-- batch's ready date; from stock it defaults to today and each quantity must
-- fit what is free to promise.
create function public.release_sku(
  p_brewery uuid, p_batch uuid, p_ships_from date, p_orders_close_on date, p_lines jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_batch public.batches; v_ships date; v_rows jsonb; l record; v_free numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'release_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'ships_from', p_ships_from,
      'orders_close_on', p_orders_close_on, 'lines', p_lines));
  if v_replay is not null then return v_replay; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a release needs at least one SKU';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e
    where jsonb_typeof(e->'sku_id') is distinct from 'string' or jsonb_typeof(e->'qty') is distinct from 'number'
      or (e->>'qty')::numeric <= 0 or (e->>'qty')::numeric <> trunc((e->>'qty')::numeric)) then
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
    v_ships := coalesce(p_ships_from, (select private.batch_ready_on(v_batch.brewed_on, v_batch.planned_on, days_to_package)
      from public.breweries where id = p_brewery));
  else
    v_ships := coalesce(p_ships_from, (select (now() at time zone timezone)::date from public.breweries where id = p_brewery));
    for l in select s.id, s.name, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e
      join public.skus s on s.id = (e->>'sku_id')::uuid and s.brewery_id = p_brewery loop
      v_free := private.release_stock_free(p_brewery, l.id);
      if l.qty > v_free then
        raise exception 'Only % of % are available to release from stock', greatest(v_free, 0), l.name;
      end if;
    end loop;
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
revoke all on function public.release_sku(uuid, uuid, date, date, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_sku(uuid, uuid, date, date, jsonb, uuid) to authenticated;

-- Change a release's quantity and order-by date (null clears it).
-- Never below what is confirmed on it; a lower quantity that pre-orders
-- already exceed is allowed, and Confirm order flags those pre-orders. A
-- larger stock release must fit what is free to promise.
create function public.update_release(
  p_brewery uuid, p_release uuid, p_qty numeric, p_orders_close_on date, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.releases; v_confirmed numeric; v_free numeric;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_release', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'release', p_release, 'qty', p_qty, 'orders_close_on', p_orders_close_on));
  if v_replay is not null then return v_replay; end if;
  -- The SKU row first, as release_sku and portal_submit_quote lock it before
  -- any release: the free-stock check below then sees one serialized state.
  perform 1 from public.skus s join public.releases r on r.sku_id = s.id and r.brewery_id = s.brewery_id
    where r.id = p_release and r.brewery_id = p_brewery for update of s;
  select * into v_row from public.releases where id = p_release and brewery_id = p_brewery for update;
  if not found then raise exception 'release not found'; end if;
  if v_row.withdrawn_at is not null then raise exception 'a withdrawn release cannot change'; end if;
  if p_qty is null or p_qty <= 0 or p_qty <> trunc(p_qty) then
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
revoke all on function public.update_release(uuid, uuid, numeric, date, uuid) from public, anon, authenticated, service_role;
grant execute on function public.update_release(uuid, uuid, numeric, date, uuid) to authenticated;

-- Withdraw stops new orders against a release. The row and the orders already
-- submitted against it stay; staff handle those at Confirm order.
create function public.withdraw_release(p_brewery uuid, p_release uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.releases;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'withdraw_release', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'release', p_release));
  if v_replay is not null then return v_replay; end if;
  select * into v_row from public.releases where id = p_release and brewery_id = p_brewery for update;
  if not found then raise exception 'release not found'; end if;
  if v_row.withdrawn_at is not null then raise exception 'this release is already withdrawn'; end if;
  update public.releases set withdrawn_at = now() where id = p_release returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.withdraw_release(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_release(uuid, uuid, uuid) to authenticated;

-- A buyer's open releases: SKUs active and priced on the caller's channel,
-- scoped exactly like portal_availability, with a remaining badge only.
create function public.portal_releases(p_customer uuid)
returns table (release_id uuid, sku_id uuid, ships_from date, orders_close_on date, badge text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id, c.sale_channel_id from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  )
  select r.id, r.sku_id, r.ships_from, r.orders_close_on,
    case when r.remaining <= 0 then 'out' when r.remaining < 20 then 'low' else 'in' end
  from private.release_state((select brewery_id from caller)) r
  join public.sku_prices p on p.sku_id = r.sku_id and p.active
  join caller c on c.brewery_id = p.brewery_id and c.sale_channel_id = p.sale_channel_id
  where r.open
  order by r.ships_from, r.id;
$$;
revoke all on function public.portal_releases(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_releases(uuid) to authenticated;

-- The stock offer: only SKUs orderable from stock, every such priced SKU (no
-- ledger rows reads as out), less what releases still claim. The two ledger
-- sums are unchanged so they stay index-only scans (#794).
create or replace function public.portal_availability(p_customer uuid) returns table (sku_id uuid, badge text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id, c.sale_channel_id from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  ), on_hand as (
    select m.sku_id, sum(m.qty) as qty from public.inventory_movements m
    where m.brewery_id = (select brewery_id from caller) group by 1
  ), allocated as (
    select al.sku_id, sum(al.qty) as qty from public.allocations al
    where al.brewery_id = (select brewery_id from caller) and al.status = 'open' group by 1
  ), availability as (
    select coalesce(o.sku_id, al.sku_id) as sku_id,
      coalesce(o.qty, 0) - coalesce(al.qty, 0) as qty
    from on_hand o full join allocated al on al.sku_id = o.sku_id
  ), claims as (
    select r.sku_id, sum(r.stock_claim) as qty from private.release_state((select brewery_id from caller)) r group by 1
  )
  select p.sku_id, case when q.qty <= 0 then 'out' when q.qty < 20 then 'low' else 'in' end
  from public.sku_prices p
  join caller c on c.brewery_id = p.brewery_id and c.sale_channel_id = p.sale_channel_id
  join public.skus s on s.id = p.sku_id and s.brewery_id = p.brewery_id and s.portal_from_stock
  left join availability a on a.sku_id = p.sku_id
  left join claims cl on cl.sku_id = p.sku_id
  cross join lateral (select coalesce(a.qty, 0) - coalesce(cl.qty, 0) as qty) q
  where p.active;
$$;

-- Quote lines may name a release (release_id); the snapshot keeps it on each
-- line and checks the buyer's offers. Otherwise unchanged.
CREATE OR REPLACE FUNCTION private.portal_quote_snapshot(p_brewery uuid, p_customer uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_customer public.customers; v_ship public.ship_tos; v_source public.locations;
  v_lines jsonb; v_deposits jsonb; v_subtotal bigint; v_deposit bigint; v_fees jsonb; v_fee bigint;
begin
  perform private.assert_order_lines(p_lines);
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
    where jsonb_typeof(e)<>'object' or not (e ?& array['sku_id','qty'])
      or exists (select 1 from jsonb_object_keys(e) k where k not in ('sku_id','qty','release_id'))
      or jsonb_typeof(e->'sku_id')<>'string' or jsonb_typeof(e->'qty')<>'number'
      or (e ? 'release_id' and jsonb_typeof(e->'release_id')<>'string')
      or (e->>'qty')::numeric<=0 or (e->>'qty')::numeric<>trunc((e->>'qty')::numeric)
  ) then raise exception 'quote lines require a SKU and positive whole quantity'; end if;
  if (select count(distinct (e->>'sku_id')::uuid) from jsonb_array_elements(p_lines) e)<>jsonb_array_length(p_lines) then
    raise exception 'duplicate quote line';
  end if;
  select * into v_customer from public.customers where id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'customer not found'; end if;
  select * into v_ship from public.ship_tos where id=p_ship_to and customer_id=p_customer and brewery_id=p_brewery;
  if not found then raise exception 'ship-to not found'; end if;
  select l.* into v_source from public.breweries b join public.locations l
    on l.id=b.portal_fulfillment_location_id and l.brewery_id=b.id
    where b.id=p_brewery and 'warehouse' = any(l.uses);
  if not found then raise exception 'portal fulfillment source is not configured'; end if;

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty,(e->>'release_id')::uuid release_id from jsonb_array_elements(p_lines) e
  ), resolved as (
    select r.sku_id,r.qty,r.release_id,p.sku_name,p.brand_name,p.unit_price_cents,
      (r.qty*p.unit_price_cents)::bigint amount_cents,s.qbo_item_id,s.qbo_realm_id,
      k.id pool_id,k.name pool_name,f.keg_size,k.deposit_cents
    from requested r
    join public.sku_prices p on p.brewery_id=p_brewery and p.sale_channel_id=v_customer.sale_channel_id
      and p.sku_id=r.sku_id and p.active
    join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    left join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
  )
  select jsonb_agg(jsonb_build_object(
      'skuId',sku_id,'name',sku_name,'product',brand_name,'qty',qty,
      'unitPriceCents',unit_price_cents,'amountCents',amount_cents,
      'qboItemId',qbo_item_id,'qboRealmId',qbo_realm_id,
      'depositPoolId',pool_id,'depositName',pool_name,'kegSize',keg_size,
      'depositUnitPriceCents',case when deposit_cents>0 then deposit_cents end)
      -- Only a release line carries releaseId, so stock quotes keep their earlier shape.
      || case when release_id is null then '{}'::jsonb else jsonb_build_object('releaseId',release_id) end order by sku_id),
    coalesce(sum(amount_cents),0)
  into v_lines,v_subtotal from resolved;
  if coalesce(jsonb_array_length(v_lines),0)<>jsonb_array_length(p_lines) then
    raise exception 'sku is not active and priced for this customer';
  end if;
  perform private.assert_portal_offers(p_brewery, p_requested, p_lines);

  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), deposits as (
    select k.id pool_id,k.name,k.deposit_cents,f.keg_size,sum(r.qty)::int qty
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id
    join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=p_brewery
    where k.deposit_cents>0 group by k.id,k.name,k.deposit_cents,f.keg_size
  )
  select coalesce(jsonb_agg(jsonb_build_object('poolId',pool_id,'name',name,'kegSize',keg_size,
      'qty',qty,'unitPriceCents',deposit_cents,'amountCents',qty*deposit_cents) order by pool_id),'[]'),
    coalesce(sum(qty*deposit_cents),0)
  into v_deposits,v_deposit from deposits;

  -- One-way kegs (a keg SKU with no container source) carry the customer's channel fee, as the line insert stamps it.
  with requested as (
    select (e->>'sku_id')::uuid sku_id,(e->>'qty')::numeric qty from jsonb_array_elements(p_lines) e
  ), fees as (
    select s.id,s.name,r.qty,c.one_way_keg_fee_cents fee
    from requested r join public.skus s on s.id=r.sku_id and s.brewery_id=p_brewery
    join public.formats f on f.id=s.format_id and f.brewery_id=p_brewery
    join public.sale_channels c on c.id=v_customer.sale_channel_id and c.brewery_id=p_brewery
    where f.package_type='keg' and s.container_source is null and c.one_way_keg_fee_cents>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'qty',qty,'unitPriceCents',fee,'amountCents',(qty*fee)::bigint) order by id),'[]'),
    coalesce(sum(qty*fee),0)::bigint
  into v_fees,v_fee from fees;

  return jsonb_build_object(
    'input',jsonb_build_object('shipToId',p_ship_to,'requestedShipDate',p_requested,'poNumber',p_po,'note',p_note,'lines',p_lines),
    'customer',jsonb_build_object('id',v_customer.id,'name',v_customer.name,'qboCustomerId',v_customer.qbo_customer_id,'qboRealmId',v_customer.qbo_realm_id),
    'source',jsonb_build_object('id',v_source.id,'name',v_source.name,'address',v_source.address),
    'destination',jsonb_build_object('id',v_ship.id,'label',v_ship.label,'address1',v_ship.address1,'address2',v_ship.address2,'city',v_ship.city,'state',v_ship.state,'zip',v_ship.zip),
    'lines',v_lines,'deposits',v_deposits,'subtotalCents',v_subtotal,
    'depositCents',v_deposit,'oneWayFees',v_fees,'oneWayFeeCents',v_fee,'amountBeforeTaxCents',v_subtotal+v_deposit+v_fee
  );
end $function$;

-- portal_submit_quote also locks every release its lines name before the
-- snapshot rechecks them, so concurrent submits cannot oversell a release.
-- Only that lock is new.
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
  -- Releases (20261118170000): the snapshot below rechecks remaining under this lock.
  -- A draft being submitted is locked first, as submit_order locks the order
  -- before its releases, so the two never wait on each other in a cycle.
  if p_order is not null then
    perform 1 from public.orders where id=p_order and brewery_id=p_brewery and customer_id=p_customer for update;
  end if;
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

-- A line may name a release only on a buyer's own order (portal paths). Staff
-- entry points (create_order, staff update_draft_order, replenishment, the
-- refused-delivery reorder) reach these impls too, so the check lives here.
create function private.assert_release_lines(p_customer uuid, p_lines jsonb) returns void
language plpgsql stable set search_path = '' as $$
begin
  if exists (select 1 from jsonb_array_elements(p_lines) e where e ? 'release_id')
    and not exists (select 1 from public.customer_users cu where cu.customer_id = p_customer and cu.user_id = auth.uid()) then
    raise exception 'only a portal buyer orders from a release' using errcode = '42501';
  end if;
end $$;
revoke all on function private.assert_release_lines(uuid, jsonb) from public, anon, authenticated, service_role;

-- Lines keep the release they name (release_id), checked by assert_release_lines.
-- Otherwise unchanged.
create or replace function private.create_order_impl(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb,
  p_pickup boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare v_order uuid; v_channel uuid; l record;
begin
  perform private.assert_order_lines(p_lines);
  perform private.assert_release_lines(p_customer, p_lines);
  if p_kind = 'taproom_transfer' and p_from_location = p_to_location then
    raise exception 'A transfer needs a different source and destination location.';
  end if;
  if p_kind = 'wholesale' then
    select sale_channel_id into v_channel from public.customers where id = p_customer and brewery_id = p_brewery;
    if v_channel is null then raise exception 'customer not found'; end if;
  else
    -- a transfer has no customer: the seeded taproom system_code, else the first by name
    select id into v_channel from public.sale_channels where brewery_id = p_brewery
      order by (system_code = 'taproom') desc, name limit 1;
  end if;
  insert into public.orders (brewery_id, kind, customer_id, ship_to_id, from_location_id, to_location_id,
                             sale_channel_id, requested_ship_date, po_number, note, created_by, pickup)
  values (p_brewery, p_kind, p_customer, p_ship_to, p_from_location, p_to_location,
          v_channel, p_requested, p_po, p_note, auth.uid(), coalesce(p_pickup, false))
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty, (e->>'release_id')::uuid as release_id from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents, release_id)
    values (p_brewery, v_order, l.sku_id, l.qty,
            case when p_kind = 'wholesale' then private.order_line_price(p_brewery, v_channel, l.sku_id) else 0 end,
            l.release_id);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;

create or replace function private.update_draft_order_impl(
  p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb,
  p_pickup boolean default null
) returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l record;
begin
  perform private.assert_order_lines(p_lines);
  o := private.lock_order(p_order, array['draft']::public.order_status[]);
  perform private.assert_release_lines(o.customer_id, p_lines);
  update public.orders set ship_to_id = coalesce(p_ship_to, ship_to_id),
    requested_ship_date = coalesce(p_requested, requested_ship_date),
    po_number = coalesce(p_po, po_number), note = coalesce(p_note, note),
    pickup = coalesce(p_pickup, pickup)
    where id = p_order;
  delete from public.order_lines where order_id = p_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty, (e->>'release_id')::uuid as release_id from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents, release_id)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then private.order_line_price(o.brewery_id, o.sale_channel_id, l.sku_id) else 0 end,
            l.release_id);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'updated', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', p_order);
end $$;

-- A buyer submitting a saved draft passes the same offer checks as a quote
-- submit (release rows locked first). Staff submits are unchanged.
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
    perform 1 from public.releases r where r.id in (
      select release_id from public.order_lines where order_id = p_order and release_id is not null
    ) order by r.id for update;
    perform private.assert_portal_offers(v_brewery,
      (select requested_ship_date from public.orders where id = p_order),
      (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('sku_id', sku_id, 'qty', qty_ordered, 'release_id', release_id)))
       from public.order_lines where order_id = p_order));
  end if;
  v_result := private.submit_order_impl(p_order); return private.complete_command_request(p_request_id,v_result);
end $function$;

-- Buyer order lines carry release_id so the portal can label a pre-order.
create or replace function public.portal_order_rows(p_order uuid default null)
returns table (
  id uuid, brewery_id uuid, customer_id uuid, order_no bigint, status public.order_status,
  ship_to_id uuid, requested_ship_date date, po_number text, note text, created_at timestamptz,
  ship_tos jsonb, order_lines jsonb
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.brewery_id, o.customer_id, o.order_no, o.status, o.ship_to_id,
         o.requested_ship_date, o.po_number, o.note, o.created_at,
         (select jsonb_build_object('label', t.label, 'country', t.country, 'city', t.city, 'state', t.state)
          from public.ship_tos t where t.id = o.ship_to_id),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', l.id, 'sku_id', l.sku_id, 'qty_ordered', l.qty_ordered,
                     'qty_shipped', l.qty_shipped, 'qty_refused', l.qty_refused,
                     'short_reason', l.short_reason, 'unit_price_cents', l.unit_price_cents,
                     'release_id', l.release_id,
                     'skus', jsonb_build_object('name', s.name)
                   ) order by s.name, l.id)
                   from public.order_lines l join public.skus s on s.id = l.sku_id
                   where l.order_id = o.id), '[]'::jsonb)
  from public.orders o
  where o.customer_id in (select public.my_customer_ids())
    and (p_order is null or o.id = p_order);
$$;

-- update_sku takes p_portal_from_stock (null keeps it); the key joins the
-- request payload only when set, so earlier requests keep their hash.
drop function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean,numeric,boolean);
create function public.update_sku(
  p_brewery uuid, p_id uuid, p_active boolean, p_upc text, p_request_id uuid,
  p_keg_pool uuid default null, p_clear_keg_pool boolean default false,
  p_batch_share numeric default null, p_clear_batch_share boolean default false,
  p_portal_from_stock boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.skus;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  p_upc := private.normalize_upc(p_upc);
  v_replay := private.claim_command_request(p_brewery, 'update_sku', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'active', p_active, 'upc', p_upc)
      || case when p_keg_pool is not null or p_clear_keg_pool then jsonb_build_object('keg_pool', p_keg_pool, 'clear_keg_pool', p_clear_keg_pool) else '{}'::jsonb end
      || case when p_batch_share is not null or p_clear_batch_share then jsonb_build_object('batch_share', p_batch_share, 'clear_batch_share', p_clear_batch_share) else '{}'::jsonb end
      || case when p_portal_from_stock is not null then jsonb_build_object('portal_from_stock', p_portal_from_stock) else '{}'::jsonb end);
  if v_replay is not null then return v_replay; end if;
  if p_active is null then raise exception 'active is required'; end if;
  -- All share editors take the brand lock before a SKU lock, matching the trigger.
  perform 1 from public.brands b join public.skus s on s.brand_id = b.id and s.brewery_id = b.brewery_id
    where s.id = p_id and s.brewery_id = p_brewery for update of b;
  select * into v_row from public.skus where id = p_id and brewery_id = p_brewery for update;
  if v_row.id is null then raise exception 'sku not found'; end if;
  if p_clear_keg_pool and p_keg_pool is not null then raise exception 'choose a keg pool or clear it, not both'; end if;
  if p_clear_batch_share and p_batch_share is not null then raise exception 'choose a batch share or clear it, not both'; end if;
  if p_keg_pool is distinct from v_row.keg_pool_id and p_keg_pool is not null then
    v_row.container_source := private.sku_keg_source(p_brewery, v_row.format_id, p_keg_pool);
    v_row.keg_pool_id := p_keg_pool;
  end if;
  if p_clear_keg_pool then v_row.keg_pool_id := null; v_row.container_source := null; end if;
  begin
    update public.skus set active = p_active, upc = p_upc,
      keg_pool_id = v_row.keg_pool_id, container_source = v_row.container_source,
      batch_share = case when p_clear_batch_share then null else coalesce(p_batch_share, v_row.batch_share) end,
      portal_from_stock = coalesce(p_portal_from_stock, v_row.portal_from_stock)
      where id = p_id and brewery_id = p_brewery returning * into v_row;
  exception when unique_violation then
    raise exception 'UPC is already assigned to another SKU; use a different UPC or clear it';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean,numeric,boolean,boolean) from public, anon, authenticated, service_role;
grant execute on function public.update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean,numeric,boolean,boolean) to authenticated;

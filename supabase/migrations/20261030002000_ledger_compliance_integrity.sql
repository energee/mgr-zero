-- #1663: keep filed reporting inputs and submitted keg charges stable.
-- Copied from 20261028231100_pa_license_home.sql; add the filing workflow gate.
create or replace function public.update_brewery(
  p_brewery uuid, p_name text, p_timezone text, p_ttb_registry_no text,
  p_customer_phone text, p_reading_due_hours int, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.breweries; v_timezone text;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_brewery', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'timezone', p_timezone, 'ttb', p_ttb_registry_no,
      'phone', p_customer_phone, 'hours', p_reading_due_hours));
  if v_replay is not null then return v_replay; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone using errcode = 'P0001';
  end if;
  perform private.lock_cellar_workflow(p_brewery);
  select timezone into v_timezone from public.breweries where id = p_brewery;
  if p_timezone is distinct from v_timezone and exists (
    select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null
  ) then
    raise exception 'timezone cannot change after a report is filed; keep the saved timezone and consult your compliance owner about a correction';
  end if;
  update public.breweries set name = p_name, timezone = p_timezone, ttb_registry_no = p_ttb_registry_no,
    customer_phone = p_customer_phone, fermentation_reading_due_hours = p_reading_due_hours
    where id = p_brewery returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- NULL fee means either not captured or captured at zero. Keep the existing
-- nullable amount contract (invoice writers omit it) and record capture separately.
alter table public.order_lines add column one_way_fee_captured boolean not null default false;
comment on column public.order_lines.one_way_fee_captured is
  'True once the submitted one-way keg fee is frozen, including a zero fee stored as NULL.';
update public.order_lines ol set one_way_fee_captured = true
from public.orders o, public.skus s, public.formats f
where o.id = ol.order_id and o.brewery_id = ol.brewery_id and o.kind = 'wholesale'
  and o.status <> 'draft' and s.id = ol.sku_id and s.brewery_id = ol.brewery_id
  and f.id = s.format_id and f.brewery_id = s.brewery_id
  and f.package_type = 'keg' and s.container_source is null;

-- Copied from 20261016130000_one_way_fee_at_submit.sql; capture zero exactly once.
create or replace function private.ensure_order_deposit_lines(o public.orders) returns void
language plpgsql set search_path = '' as $$
declare r record;
begin
  if o.kind <> 'wholesale' then return; end if;
  update public.order_lines ol set one_way_fee_cents = nullif(b.one_way_keg_fee_cents, 0), one_way_fee_captured = true
    from public.skus s join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id,
         public.breweries b
   where ol.order_id = o.id and not ol.one_way_fee_captured and b.id = o.brewery_id
     and s.id = ol.sku_id and s.brewery_id = o.brewery_id
     and f.package_type = 'keg' and s.container_source is null;
  for r in
    select ol.id as line_id, ol.qty_ordered, f.package_type, f.keg_size, k.id as pool_id, k.name, k.deposit_cents
    from public.order_lines ol
    join public.skus s on s.id = ol.sku_id and s.brewery_id = o.brewery_id
    join public.formats f on f.id = s.format_id and f.brewery_id = o.brewery_id
    left join public.keg_pools k on k.id = s.keg_pool_id and k.brewery_id = o.brewery_id
    where ol.order_id = o.id and s.container_source in ('owned_fleet','per_fill_rental')
      and not exists (select 1 from public.order_deposit_lines d where d.order_line_id = ol.id)
  loop
    if r.package_type is distinct from 'keg' or r.keg_size is null or r.pool_id is null then
      raise exception 'returnable keg deposit is not configured';
    end if;
    if r.deposit_cents > 0 then
      insert into public.order_deposit_lines (brewery_id, order_id, order_line_id, keg_pool_id, keg_size, description, qty_ordered, unit_price_cents)
      values (o.brewery_id, o.id, r.line_id, r.pool_id, r.keg_size, r.name || ' deposit', r.qty_ordered, r.deposit_cents);
    end if;
  end loop;
end $$;

-- Same codes as lib/mgr/enums.ts US_STATE_CODES, including DC and territories.
create function private.is_us_state(p_state text) returns boolean
language sql immutable set search_path = '' as $$
  select p_state = any(array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
    'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
    'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP'
  ]::text[])
$$;
revoke all on function private.is_us_state(text) from public, anon, authenticated, service_role;
-- Validate existing rows too; refuse deployment rather than silently rewrite a ledger.
alter table public.inventory_movements add constraint inventory_movements_destination_state
  check (dest_state is null or private.is_us_state(dest_state));
alter table public.volume_adjustments add constraint volume_adjustments_destination_state
  check (dest_state is null or private.is_us_state(dest_state));
alter table public.volume_adjustment_reclassifications add constraint volume_reclassifications_destination_state
  check (dest_state is null or private.is_us_state(dest_state));

-- now() is transaction start, potentially before a midnight crossed while
-- waiting on stock/workflow locks. Sample the wall clock when the row is inserted.
-- Explicit historical created_at / packaging occurred_on values remain supported.
-- These are recording timestamps, not PostgreSQL commit timestamps.
alter table public.inventory_movements alter column created_at set default clock_timestamp();

-- Governed changes after confirm (docs/plans/portal-release-windows.md,
-- Phase C). A confirmed or picked order still changes when beer goes missing
-- or is damaged, so what ships matches what the buyer sees, but each change
-- now names one fixed reason code (short, damaged, customer_request,
-- brewery_error, other) with an optional note; other needs the note. A
-- submitted (pre-order) change keeps its free-text reason and takes no code.
-- The lines_adjusted event payload stores the code, which is what marks a
-- change as made after confirm for the buyer's order page and the staff
-- report below.
--
-- The public RPC gains p_reason_code last, defaulting to null. The request
-- hash includes reason_code only when one is sent, so a request recorded
-- before this migration (order, lines, reason) replays unchanged.

drop function public.adjust_order_lines(uuid, jsonb, text, uuid);
drop function private.adjust_order_lines_impl(uuid, jsonb, text);

-- Copied from 20261103062554_atp_warnings_order_skus.sql; the reason-code
-- checks after the trim and lock, and reason_code in the event, are new.
CREATE FUNCTION private.adjust_order_lines_impl (
  p_order       uuid,
  p_lines       jsonb,
  p_reason      text,
  p_reason_code text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare o public.orders; l record; v_line uuid; v_before jsonb; v_existing boolean; v_dropped_picked boolean; w jsonb; v_skus uuid[];
begin
  p_reason := btrim(p_reason, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  -- Without a code the reason is required free text, as before. With a code
  -- it is the optional note; blank stores null.
  if p_reason_code is null and (p_reason is null or p_reason = '') then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if p_reason_code is not null and p_reason_code <> all (array['short','damaged','customer_request','brewery_error','other']) then
    raise exception 'unknown reason code: choose short, damaged, customer request, brewery error or other';
  end if;
  if p_reason_code = 'other' and (p_reason is null or p_reason = '') then
    raise exception 'a note is required when the reason is other';
  end if;
  p_reason := nullif(p_reason, '');
  perform private.assert_order_lines(p_lines);
  -- One line per SKU: the upsert below would keep the last, and the change
  -- report would count both. Checked here only, not in assert_order_lines.
  if (select count(*) <> count(distinct e->>'sku_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'an adjustment lists the same SKU twice; give each SKU one line';
  end if;
  o := private.lock_order(p_order, array['submitted','confirmed','picked']::public.order_status[]);
  -- A pre-order (submitted) change keeps free text; once the brewery has
  -- confirmed, every change names why with a reason code.
  if o.status = 'submitted' and p_reason_code is not null then
    raise exception 'a reason code applies only after confirm; describe a pre-order change in the reason';
  end if;
  if o.status <> 'submitted' and p_reason_code is null then
    raise exception 'a reason code is required to change a confirmed order';
  end if;
  -- #1070: the per-SKU atp: locks confirm takes, before the wholesale
  -- skus freeze below. Confirm takes the skus key-share lock only after its
  -- atp: lock, so freezing first could deadlock with it.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atp:' || sku_id::text, 0))
  from (select distinct (e->>'sku_id')::uuid sku_id from jsonb_array_elements(p_lines) e order by 1) s;
  if o.kind = 'wholesale' then
    -- #1075: key-share the brewery row before freezing the skus rows. The
    -- inserts below key-share it anyway; taking it first means this raise
    -- never holds a skus row while it waits for the brewery, which
    -- portal_submit_quote locks before the same skus rows.
    perform 1 from public.breweries where id=o.brewery_id for key share;
    -- Freeze every mutable catalog row used by this replacement before any
    -- order mutation. A concurrent config edit either finishes first and is
    -- reviewed here, or waits until the adjusted order has its deposit rows.
    perform 1 from public.skus s
      where s.brewery_id=o.brewery_id
        and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
      order by s.id for update;
    perform 1 from public.formats f
      where f.brewery_id=o.brewery_id and f.id in (
        select s.format_id from public.skus s where s.brewery_id=o.brewery_id
          and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
      ) order by f.id for update;
    perform 1 from public.channel_prices cp
      where cp.brewery_id=o.brewery_id and cp.sale_channel_id=o.sale_channel_id
        and (cp.price_group_id,cp.format_id) in (
          select b.price_group_id,s.format_id from public.skus s
          join public.brands b on b.id=s.brand_id and b.brewery_id=s.brewery_id
          where s.brewery_id=o.brewery_id
            and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
        )
      order by cp.price_group_id,cp.format_id for update;
    perform 1 from public.keg_pools k
      where k.brewery_id=o.brewery_id and k.id in (
        select s.keg_pool_id from public.skus s where s.brewery_id=o.brewery_id
          and s.id in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e)
      ) order by k.id for update;
    if exists (
      select 1 from jsonb_array_elements(p_lines) e
      join public.skus s on s.id=(e->>'sku_id')::uuid and s.brewery_id=o.brewery_id
      join public.formats f on f.id=s.format_id and f.brewery_id=o.brewery_id
      left join public.keg_pools k on k.id=s.keg_pool_id and k.brewery_id=o.brewery_id
      where s.container_source in ('owned_fleet','per_fill_rental')
        and (f.package_type is distinct from 'keg' or f.keg_size is null
          or k.id is null)
    ) then
      raise exception 'returnable keg deposit is not configured';
    end if;
  end if;
  select jsonb_object_agg(ol.sku_id, ol.qty_ordered) into v_before
  from public.order_lines ol where ol.order_id = p_order;
  -- #811: a counted line dropped from a picked order leaves staged beer behind.
  v_dropped_picked := o.status = 'picked' and exists (select 1 from public.order_lines
    where order_id = p_order and coalesce(qty_picked, 0) > 0
      and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e));
  -- Drop lines (and their open allocations) not present in the new set.
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order
                and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e));
  delete from public.order_lines where order_id = p_order
    and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e);
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    select exists (
      select 1 from public.order_lines where order_id=p_order and sku_id=l.sku_id
    ) into v_existing;
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then private.order_line_price(o.brewery_id, o.sale_channel_id, l.sku_id) else 0 end)
    on conflict (order_id, sku_id) do update set qty_ordered = excluded.qty_ordered,
      -- #811: a raised line is unpicked work; Pick recounts it from ordered.
      -- A staged count that already covers the new quantity stays (lowered,
      -- then raised again): the beer is on the floor. A recount also drops the
      -- old shortage reason, which described the count it replaces.
      qty_picked = case when o.status = 'picked' and excluded.qty_ordered > public.order_lines.qty_ordered
                          and excluded.qty_ordered > coalesce(public.order_lines.qty_picked, 0)
                        then null else public.order_lines.qty_picked end,
      short_reason = case when o.status = 'picked' and excluded.qty_ordered > public.order_lines.qty_ordered
                          and excluded.qty_ordered > coalesce(public.order_lines.qty_picked, 0)
                        then null else public.order_lines.short_reason end
    returning id into v_line;
    -- A submitted order holds no allocations; confirm_order creates them.
    if o.status <> 'submitted' then
      update public.allocations set qty = l.qty
        where source = 'order_line' and ref = v_line and status = 'open';
      insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
      select o.brewery_id, l.sku_id, l.qty, 'order_line', v_line, 'open'
      where not exists (select 1 from public.allocations where source = 'order_line' and ref = v_line and status = 'open');
    end if;
    if v_existing then
      -- Retaining an order-line identity retains the charge it was reviewed
      -- with; only its quantity follows the line adjustment.
      update public.order_deposit_lines set qty_ordered=l.qty where order_line_id=v_line;
    end if;
  end loop;
  -- New lines are charged by the same helper submit uses (#413).
  perform private.ensure_order_deposit_lines(o);
  if o.status = 'picked' then
    update public.orders set
      -- staged beer to put back: a dropped counted line, or counted above the new order
      needs_restock = needs_restock or v_dropped_picked or exists (
        select 1 from public.order_lines where order_id = p_order and qty_picked > qty_ordered),
      -- an uncounted line (new or raised) means pick again before ship (#811);
      -- mark_picked_if_complete promotes the order once every line is counted
      status = case when exists (select 1 from public.order_lines where order_id = p_order and qty_picked is null)
                    then 'confirmed'::public.order_status else status end,
      repick_since = case when exists (select 1 from public.order_lines where order_id = p_order and qty_picked is null)
                          then coalesce(repick_since, now()) else repick_since end
    where id = p_order;
  end if;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'lines_adjusted',
          jsonb_build_object('before', v_before, 'lines', p_lines, 'reason', p_reason)
            || case when p_reason_code is null then '{}'::jsonb else jsonb_build_object('reason_code', p_reason_code) end);
  -- #1088: the same soft warnings confirm returns, for every SKU now on the
  -- order that is still below zero ATP.
  select array_agg(distinct sku_id) into v_skus from public.order_lines where order_id = p_order;
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', a.sku_id, 'atp', a.qty)), '[]') into w
  from public.atp a
  where a.brewery_id = o.brewery_id and a.sku_id = any(v_skus) and a.qty < 0;
  return jsonb_build_object('order_id', p_order, 'warnings', w);
end $function$;

revoke all on function private.adjust_order_lines_impl(uuid, jsonb, text, text) from public, anon, authenticated, service_role;

-- Copied from 00001_baseline.sql; only p_reason_code is new.
create function public.adjust_order_lines(p_order uuid, p_lines jsonb, p_reason text, p_request_id uuid, p_reason_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  v_brewery := private.assert_order_staff(p_order, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'adjust_order_lines', p_request_id,
    jsonb_build_object('order', p_order, 'lines', p_lines, 'reason', p_reason)
      || case when p_reason_code is null then '{}'::jsonb else jsonb_build_object('reason_code', p_reason_code) end);
  if v_replay is not null then return v_replay; end if;
  v_result := private.adjust_order_lines_impl(p_order, p_lines, p_reason, p_reason_code);
  return private.complete_command_request(p_request_id, v_result);
end $$;
revoke all on function public.adjust_order_lines(uuid, jsonb, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.adjust_order_lines(uuid, jsonb, text, uuid, text) to authenticated;

-- One change's lines as [{sku_id, name, delta}]: the new quantity minus the
-- one before, for each SKU whose quantity moved (a dropped line is negative,
-- an added one positive), by name. before is the event's {sku_id: qty} map of
-- stored quantities; lines is the [{sku_id, qty}] array as sent, rounded here
-- to the two places order_lines stores, so re-sending 2.555 is no change.
create function private.order_line_changes(p_brewery uuid, p_before jsonb, p_lines jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', d.sku_id, 'name', s.name, 'delta', d.delta) order by s.name, d.sku_id), '[]'::jsonb)
  from (
    select coalesce(n.sku_id, b.sku_id) sku_id, coalesce(n.qty, 0) - coalesce(b.qty, 0) delta
    from (select (e->>'sku_id')::uuid sku_id, round((e->>'qty')::numeric, 2) qty from jsonb_array_elements(p_lines) e) n
    full join (select key::uuid sku_id, (value #>> '{}')::numeric qty from jsonb_each(coalesce(p_before, '{}'::jsonb))) b
      on b.sku_id = n.sku_id
  ) d
  left join public.skus s on s.id = d.sku_id and s.brewery_id = p_brewery
  where d.delta <> 0
$$;
revoke all on function private.order_line_changes(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

-- security-definer: justified — it calls the private line-change helper.
-- Admin and Sales only, as adjust_order_lines. A definer function is never
-- inlined, so the reason, staff and customer filters are arguments and apply
-- inside it; the caller's cursor and limit do not, so every matching change's
-- deltas are built before paging. Changes after confirm are rare; if they grow,
-- pass the cursor and limit as arguments too.
create function public.order_change_rows(
  p_brewery uuid, p_reason_code text default null, p_actor uuid default null, p_customer uuid default null
) returns table (
  id uuid, created_at timestamptz, order_id uuid, order_no bigint, kind text, customer_id uuid, customer_name text,
  actor uuid, reason_code text, note text, changes jsonb
) language sql stable security definer set search_path = '' as $$
  select e.id, e.created_at, o.id, o.order_no, o.kind::text, o.customer_id, c.name, e.actor,
    e.payload->>'reason_code', e.payload->>'reason',
    private.order_line_changes(e.brewery_id, e.payload->'before', e.payload->'lines')
  from public.order_events e
  join public.orders o on o.id = e.order_id and o.brewery_id = e.brewery_id
  left join public.customers c on c.id = o.customer_id and c.brewery_id = o.brewery_id
  where e.brewery_id = p_brewery
    and e.brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[]))
    and e.event = 'lines_adjusted' and e.payload ? 'reason_code'
    and (p_reason_code is null or e.payload->>'reason_code' = p_reason_code)
    and (p_actor is null or e.actor = p_actor)
    and (p_customer is null or o.customer_id = p_customer)
$$;
comment on function public.order_change_rows(uuid, text, uuid, uuid) is
  'staff report of order changes after confirm (lines_adjusted events with a reason code)';
revoke all on function public.order_change_rows(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.order_change_rows(uuid, text, uuid, uuid) to authenticated;

-- security-definer: justified — no customer policy on order_events (#754).
-- The buyer's view of one order's changes after confirm: when, the reason
-- code and each line's change. Never add the actor or the staff note.
create function public.portal_order_change_rows(p_order uuid)
returns table (id uuid, created_at timestamptz, reason_code text, changes jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id, e.created_at, e.payload->>'reason_code',
    private.order_line_changes(e.brewery_id, e.payload->'before', e.payload->'lines')
  from public.order_events e
  join public.orders o on o.id = e.order_id
  where e.order_id = p_order
    and o.customer_id in (select public.my_customer_ids())
    and e.event = 'lines_adjusted' and e.payload ? 'reason_code'
$$;
comment on function public.portal_order_change_rows(uuid) is
  'portal projection of one order''s changes after confirm; never add actor or note';
revoke all on function public.portal_order_change_rows(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_order_change_rows(uuid) to authenticated;

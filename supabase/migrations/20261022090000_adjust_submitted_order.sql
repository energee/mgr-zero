-- Confirm order can adjust lines: adjust_order_lines_impl now also accepts a
-- submitted order. A submitted order holds no allocations (confirm_order
-- creates them), so on one it only replaces the lines and their deposits.
-- Body otherwise copied from 20261021121000_raise_atp_warnings.sql.

CREATE OR REPLACE FUNCTION private.adjust_order_lines_impl (
  p_order  uuid,
  p_lines  jsonb,
  p_reason text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare o public.orders; l record; v_line uuid; v_before jsonb; v_existing boolean; v_dropped_picked boolean; w jsonb;
begin
  perform private.assert_order_lines(p_lines);
  o := private.lock_order(p_order, array['submitted','confirmed','picked']::public.order_status[]);
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
          jsonb_build_object('before', v_before, 'lines', p_lines, 'reason', p_reason));
  -- #1088: the same soft warnings confirm returns, for every SKU now on the
  -- order that is still below zero ATP.
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', a.sku_id, 'atp', a.qty)), '[]') into w
  from public.atp a join public.order_lines ol on ol.sku_id = a.sku_id and ol.order_id = p_order
  where a.brewery_id = o.brewery_id and a.qty < 0;
  return jsonb_build_object('order_id', p_order, 'warnings', w);
end $function$;

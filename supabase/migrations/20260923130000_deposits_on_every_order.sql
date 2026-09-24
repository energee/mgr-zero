-- Keg deposits on every wholesale order (#413). Only portal_submit_quote and
-- adjust_order_lines wrote order_deposit_lines, so a staff-created order, or a
-- portal draft submitted without a quote, shipped returnable kegs with no
-- deposit on the invoice. Every order passes submit_order_impl, which now
-- charges each wholesale line that has no deposit row yet at the keg pool's
-- current deposit. adjust_order_lines_impl calls the same helper for the lines
-- it adds. Lines a quote already charged keep their reviewed price.
create function private.ensure_order_deposit_lines(o public.orders) returns void
language plpgsql set search_path = '' as $$
declare r record;
begin
  if o.kind <> 'wholesale' then return; end if;
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
revoke all on function private.ensure_order_deposit_lines(public.orders) from public, anon, authenticated, service_role;

create or replace function private.submit_order_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  o := private.lock_order(p_order, array['draft']::public.order_status[]);
  perform private.ensure_order_deposit_lines(o);
  update public.orders set status = 'submitted' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'submitted');
  -- chat: the submitted_order occurrence commits with the state change
  perform public.record_submitted_order_occurrence(p_order);
  return jsonb_build_object('order_id', p_order);
end $$;

-- adjust_order_lines_impl charged a new line's deposit with its own copy of
-- this selection. It now calls ensure_order_deposit_lines after its loop, so
-- one query decides which lines owe a deposit. Body otherwise copied verbatim
-- from 20260910120847_deploy_current_schema.sql.
CREATE OR REPLACE FUNCTION private.adjust_order_lines_impl (
  p_order  uuid,
  p_lines  jsonb,
  p_reason text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare o public.orders; l record; v_line uuid; v_before jsonb; v_existing boolean;
begin
  perform private.assert_order_lines(p_lines);
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  if o.kind = 'wholesale' then
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
    on conflict (order_id, sku_id) do update set qty_ordered = excluded.qty_ordered
    returning id into v_line;
    update public.allocations set qty = l.qty
      where source = 'order_line' and ref = v_line and status = 'open';
    insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
    select o.brewery_id, l.sku_id, l.qty, 'order_line', v_line, 'open'
    where not exists (select 1 from public.allocations where source = 'order_line' and ref = v_line and status = 'open');
    if v_existing then
      -- Retaining an order-line identity retains the charge it was reviewed
      -- with; only its quantity follows the line adjustment.
      update public.order_deposit_lines set qty_ordered=l.qty where order_line_id=v_line;
    end if;
  end loop;
  -- New lines are charged by the same helper submit uses (#413).
  perform private.ensure_order_deposit_lines(o);
  update public.orders set needs_restock = needs_restock or (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'lines_adjusted',
          jsonb_build_object('before', v_before, 'lines', p_lines, 'reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $function$;

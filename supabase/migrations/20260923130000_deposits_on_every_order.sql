-- Keg deposits on every wholesale order (#413). Only portal_submit_quote and
-- adjust_order_lines wrote order_deposit_lines, so a staff-created order, or a
-- portal draft submitted without a quote, shipped returnable kegs with no
-- deposit on the invoice. Every order passes submit_order_impl, which now
-- charges each wholesale line that has no deposit row yet: the same
-- selection and configuration check adjust_order_lines_impl applies to a new
-- line. Lines a quote already charged keep their reviewed price.
create function private.ensure_order_deposit_lines(p_order uuid) returns void
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if o.kind <> 'wholesale' then return; end if;
  if exists (
    select 1 from public.order_lines ol
    join public.skus s on s.id = ol.sku_id and s.brewery_id = o.brewery_id
    join public.formats f on f.id = s.format_id and f.brewery_id = o.brewery_id
    left join public.keg_pools k on k.id = s.keg_pool_id and k.brewery_id = o.brewery_id
    where ol.order_id = p_order and s.container_source in ('owned_fleet','per_fill_rental')
      and (f.package_type is distinct from 'keg' or f.keg_size is null or k.id is null)
  ) then
    raise exception 'returnable keg deposit is not configured';
  end if;
  insert into public.order_deposit_lines (brewery_id, order_id, order_line_id, keg_pool_id, keg_size, description, qty_ordered, unit_price_cents)
  select o.brewery_id, p_order, ol.id, k.id, f.keg_size, k.name || ' deposit', ol.qty_ordered, k.deposit_cents
  from public.order_lines ol
  join public.skus s on s.id = ol.sku_id and s.brewery_id = o.brewery_id
  join public.formats f on f.id = s.format_id and f.brewery_id = o.brewery_id
  join public.keg_pools k on k.id = s.keg_pool_id and k.brewery_id = o.brewery_id
  where ol.order_id = p_order
    and s.container_source in ('owned_fleet','per_fill_rental')
    and f.package_type = 'keg' and f.keg_size is not null and k.deposit_cents > 0
    and not exists (select 1 from public.order_deposit_lines d where d.order_line_id = ol.id);
end $$;
revoke all on function private.ensure_order_deposit_lines(uuid) from public, anon, authenticated, service_role;

create or replace function private.submit_order_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  o := private.lock_order(p_order, array['draft']::public.order_status[]);
  perform private.ensure_order_deposit_lines(p_order);
  update public.orders set status = 'submitted' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'submitted');
  -- chat: the submitted_order occurrence commits with the state change
  perform public.record_submitted_order_occurrence(p_order);
  return jsonb_build_object('order_id', p_order);
end $$;

-- Keg deposits on every wholesale order (#413). Only portal_submit_quote and
-- adjust_order_lines wrote order_deposit_lines, so a staff-created order, or a
-- portal draft submitted without a quote, shipped returnable kegs with no
-- deposit on the invoice. Every order passes submit_order_impl, which now
-- charges each wholesale line that has no deposit row yet: the same
-- selection and configuration check adjust_order_lines_impl applies to a new
-- line. Lines a quote already charged keep their reviewed price.
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

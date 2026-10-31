-- #1662: optionally check empty shells in with a deposit-only refund.
drop function public.return_shipment(uuid,jsonb,uuid,text,uuid,uuid);
create function public.return_shipment(p_invoice uuid,p_lines jsonb,p_location uuid,p_reason text,p_request_id uuid,p_refused_delivery uuid default null,p_return_empty boolean default false,p_bin uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_brewery uuid; v_replay jsonb; v_result jsonb; v_payload jsonb;
  v_delivery public.deliveries; v_shipment public.shipments; v_invoice public.invoices;
  v_line record; v_outstanding numeric; v_beer boolean; v_customer uuid;
begin
  v_brewery := private.assert_invoice_staff(p_invoice,array['admin','sales']::public.staff_role[]);
  -- Ordinary returns retain the original five-argument request hash.
  v_payload := jsonb_build_object('invoice',p_invoice,'lines',p_lines,'location',p_location,'reason',p_reason);
  if p_refused_delivery is not null then v_payload := v_payload || jsonb_build_object('refused_delivery',p_refused_delivery); end if;
  if p_return_empty or p_bin is not null then v_payload := v_payload || jsonb_build_object('return_empty',p_return_empty,'bin',p_bin); end if;
  v_replay := private.claim_command_request(v_brewery,'return_shipment',p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if p_refused_delivery is not null then
    -- Same delivery -> order -> invoice order as physical refusal check-in.
    -- NO KEY UPDATE permits ordinary returns to insert their order-event FK.
    -- The invoice lock also serializes ordinary returns of accepted beer.
    select * into v_delivery from public.deliveries where id=p_refused_delivery and brewery_id=v_brewery for update;
    if v_delivery.id is null or v_delivery.delivered_at is null then raise exception 'closed refused delivery required'; end if;
    select * into v_shipment from public.shipments where id=v_delivery.shipment_id;
    if v_shipment.id is null or v_shipment.invoice_timing<>'now' then raise exception 'use refused beer check-in for an invoice-on-delivery shipment'; end if;
    perform 1 from public.orders where id=v_shipment.order_id for no key update;
    select * into v_invoice from public.invoices where id=p_invoice for update;
    if v_invoice.shipment_id is distinct from v_shipment.id then raise exception 'refused delivery does not belong to this invoice'; end if;
    -- Group by SKU so multiple submitted lines cannot each spend the same cap.
    for v_line in
      select il.sku_id,sum((e->>'qty')::numeric) qty
      from jsonb_array_elements(p_lines) e join public.invoice_lines il on il.id=(e->>'invoice_line_id')::uuid
      where il.invoice_id=p_invoice and il.kind='sku' group by il.sku_id
    loop
      select outstanding_qty into v_outstanding from public.refused_delivery_returns
      where delivery_id=p_refused_delivery and sku_id=v_line.sku_id;
      if v_line.qty > coalesce(v_outstanding,0) then raise exception 'return exceeds outstanding refusal'; end if;
    end loop;
  end if;
  select exists(select 1 from jsonb_array_elements(p_lines) e join public.invoice_lines l
    on l.id=(e->>'invoice_line_id')::uuid and l.invoice_id=p_invoice where l.kind='sku') into v_beer;
  if v_beer and (p_location is null or p_reason is null) then raise exception 'beer returns require a location and reason'; end if;
  if p_return_empty and v_beer then raise exception 'full beer returns already record their shells; return empty kegs with deposit-only refunds'; end if;
  -- Beer stock is locked before shells, matching the full-keg return path.
  v_result := private.return_shipment_impl(p_invoice,p_lines,p_location,p_reason);
  if p_return_empty then
    if not exists(select 1 from public.bins where id=p_bin and location_id=p_location and brewery_id=v_brewery) then
      raise exception 'choose the bin receiving the empty kegs';
    end if;
    lock table public.keg_events in share row exclusive mode;
    select customer_id into v_customer from public.invoices where id=p_invoice;
    for v_line in
      select l.keg_pool_id,l.keg_size,sum((e->>'qty')::numeric)::integer qty
      from jsonb_array_elements(p_lines) e join public.invoice_lines l on l.id=(e->>'invoice_line_id')::uuid
      where l.invoice_id=p_invoice and l.kind='keg_deposit' group by l.keg_pool_id,l.keg_size
    loop
      select coalesce(sum(qty),0) into v_outstanding from public.keg_customer_balances
        where brewery_id=v_brewery and customer_id=v_customer and pool_id=v_line.keg_pool_id and keg_size=v_line.keg_size;
      if v_line.qty>v_outstanding then raise exception 'empty-keg return exceeds the customer balance; refund only if the kegs were already returned'; end if;
      insert into public.keg_events(brewery_id,pool_id,keg_size,location_id,bin_id,qty,reason,customer_id,note,created_by)
        values(v_brewery,v_line.keg_pool_id,v_line.keg_size,p_location,p_bin,v_line.qty,'returned',v_customer,
          'deposit refund '||(v_result->>'credit_memo_id'),auth.uid());
    end loop;
  end if;
  if p_refused_delivery is not null then
    update public.invoices set refused_delivery_id=p_refused_delivery where id=(v_result->>'credit_memo_id')::uuid;
  end if;
  return private.complete_command_request(p_request_id,v_result);
end $$;
revoke all on function public.return_shipment(uuid,jsonb,uuid,text,uuid,uuid,boolean,uuid) from public,anon;
grant execute on function public.return_shipment(uuid,jsonb,uuid,text,uuid,uuid,boolean,uuid) to authenticated,service_role;


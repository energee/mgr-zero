-- Refused check-in reads its outstanding cap from refused_delivery_returns, so
-- the rule has one definition, and reads it once per line instead of once per
-- source. The per-source cap stays in the movements trigger ("return exceeds
-- original shipment"). The indexes back the view's per-line subquery.
create index if not exists movements_sale_ref_idx on public.inventory_movements (ref, sku_id) where type = 'sale_removal';
create index if not exists movements_return_source_idx on public.inventory_movements (source_movement_id) where type = 'return_in';

create or replace function public.check_in_refused_return(p_delivery uuid,p_location uuid,p_lines jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.deliveries; sh public.shipments; ol public.order_lines; m public.inventory_movements;
  v_replay jsonb; l jsonb; s jsonb; v_qty numeric; v_remaining numeric; v_return uuid; v_ids uuid[] := '{}';
begin
  select * into d from public.deliveries where id=p_delivery;
  perform private.assert_staff(d.brewery_id,array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(d.brewery_id,'check_in_refused_return',p_request_id,jsonb_build_object('delivery',p_delivery,'location',p_location,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  select * into d from public.deliveries where id=p_delivery for update;
  select * into sh from public.shipments where id=d.shipment_id;
  if sh.id is null or sh.invoice_timing<>'on_delivery' then raise exception 'use Return and credit for an invoice-now shipment'; end if;
  if d.outcome is null or d.outcome='delivered' then raise exception 'stop has no refused beer'; end if;
  -- The order key is unchanged; allow the accepted return's order-event FK.
  perform 1 from public.orders where id=sh.order_id for no key update;
  -- Accepted-unit credits lock the invoice too; both return paths must serialize
  -- before the shared source movement cap and frozen-volume rounding are read.
  perform 1 from public.invoices where shipment_id=sh.id and kind='invoice' for update;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'return lines are required'; end if;
  if not exists(select 1 from public.locations where id=p_location and brewery_id=d.brewery_id) then raise exception 'location not found'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into ol from public.order_lines where id=(l->>'order_line_id')::uuid and order_id=sh.order_id for update;
    if not found then raise exception 'order line not found'; end if;
    if jsonb_typeof(l->'sources') is distinct from 'array' or jsonb_array_length(l->'sources')=0 then raise exception 'return sources are required'; end if;
    select coalesce(max(outstanding_qty),0) into v_remaining from public.refused_delivery_returns where delivery_id=d.id and order_line_id=ol.id;
    for s in select * from jsonb_array_elements(l->'sources') loop
      select * into m from public.inventory_movements where id=(s->>'movement_id')::uuid and brewery_id=d.brewery_id and ref=sh.order_id and sku_id=ol.sku_id and type='sale_removal' for update;
      if not found then raise exception 'shipped source not found'; end if;
      v_qty := (s->>'qty')::numeric;
      if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'invalid return quantity'; end if;
      if v_qty>v_remaining then raise exception 'return exceeds outstanding refused quantity'; end if;
      v_remaining := v_remaining-v_qty;
      if not exists(select 1 from public.bins where id=(s->>'bin_id')::uuid and location_id=p_location and brewery_id=d.brewery_id) then raise exception 'return bin not found at location'; end if;
      insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,source_movement_id,qty,type,ref,note,created_by)
        values(d.brewery_id,m.sku_id,p_location,(s->>'bin_id')::uuid,m.lot_id,m.id,v_qty,'return_in',d.id,'refused delivery check-in',auth.uid()) returning id into v_return;
      v_ids := array_append(v_ids,v_return);
      if coalesce((s->>'damaged')::boolean,false) then
        insert into public.inventory_movements(brewery_id,sku_id,location_id,bin_id,lot_id,source_movement_id,qty,type,ref,note,created_by)
          values(d.brewery_id,m.sku_id,p_location,(s->>'bin_id')::uuid,m.lot_id,v_return,-v_qty,'loss',d.id,'damaged refused return',auth.uid());
      end if;
    end loop;
  end loop;
  return private.complete_command_request(p_request_id,jsonb_build_object('delivery_id',d.id,'movement_ids',v_ids));
end $$;

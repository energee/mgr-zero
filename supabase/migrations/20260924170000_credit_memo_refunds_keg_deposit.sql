-- #414: a credit memo refunds returned kegs' deposits. Crediting a keg_deposit
-- invoice line writes a keg_deposit_refund line (negative whole kegs, the
-- deposit's keg pool and size, the deposit price frozen on the invoice), which
-- is what keg_deposit_balances subtracts and what the QuickBooks push already
-- maps to the deposit item. A deposit line moves no inventory: the empty keg is
-- a separate Keg fleet event, so it takes no return sources. Any other line
-- kind still refuses. Otherwise identical to the definition in
-- 20260923190000_credit_memo_refuses_void_invoice.sql.
create or replace function private.create_credit_memo_impl(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_cm uuid; v_order uuid; cl record; v_orig_qty numeric; v_already_credited numeric; v_sources jsonb; src record; v_original public.inventory_movements; v_sku uuid; v_line public.invoice_lines;
begin
  -- for update: concurrent memos against one invoice serialize here, so the
  -- over-credit guard below always sees the other memo's lines.
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'can only credit an invoice'; end if;
  if v_inv.written_off_at is not null or v_inv.qbo_remote_state <> 'live' then
    raise exception 'cannot credit a voided or written-off invoice';
  end if;
  insert into public.invoices (brewery_id, kind, customer_id, issued_on)
  values (v_inv.brewery_id, 'credit_memo', v_inv.customer_id, current_date)
  returning id into v_cm;
  select order_id into v_order from public.shipments where id = v_inv.shipment_id;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'credit lines required'; end if;
  if (select count(distinct (e->>'invoice_line_id')::uuid) from jsonb_array_elements(p_lines) e) <> jsonb_array_length(p_lines) then raise exception 'duplicate credit line'; end if;
  for cl in select (e->>'invoice_line_id')::uuid as line_id, (e->>'qty')::numeric as qty, e->'sources' as sources from jsonb_array_elements(p_lines) e loop
    if cl.qty is null or cl.qty::text in ('NaN','Infinity','-Infinity') or cl.qty <= 0 or cl.qty <> round(cl.qty, 2) then raise exception 'invalid return quantity'; end if;
    select qty into v_orig_qty from public.invoice_lines where id = cl.line_id and invoice_id = p_invoice;
    if v_orig_qty is null then raise exception 'invoice line % not found on invoice', cl.line_id; end if;
    -- Over-credit guard: qty already credited against this invoice line across
    -- all prior credit memos, plus this request, must not exceed the original.
    select coalesce(sum(-il.qty), 0) into v_already_credited
      from public.invoice_lines il where il.credited_invoice_line_id = cl.line_id;
    if cl.qty > (v_orig_qty - v_already_credited) then
      raise exception 'credit exceeds remaining creditable qty for line %', cl.line_id;
    end if;
    select * into v_line from public.invoice_lines where id = cl.line_id and invoice_id = p_invoice;
    if v_line.kind = 'keg_deposit' then
      if cl.qty <> trunc(cl.qty) then raise exception 'a deposit refund is in whole kegs'; end if;
      if cl.sources is not null then raise exception 'a deposit refund takes no return sources'; end if;
      insert into public.invoice_lines (brewery_id, invoice_id, kind, keg_pool_id, keg_size, qty, unit_price_cents, description, credited_invoice_line_id)
      values (v_inv.brewery_id, v_cm, 'keg_deposit_refund', v_line.keg_pool_id, v_line.keg_size, -cl.qty, v_line.unit_price_cents, v_line.description, v_line.id);
      continue;
    end if;
    if v_line.kind <> 'sku' then raise exception 'cannot credit a % line', v_line.kind; end if;
    insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents, description, credited_invoice_line_id)
    values (v_inv.brewery_id, v_cm, 'sku', v_line.sku_id, -cl.qty, v_line.unit_price_cents, v_line.description, v_line.id);
    v_sku := v_line.sku_id;
    v_sources := cl.sources;
    if v_sources is null and v_order is not null then
      -- A legacy caller may return one untracked shipment source; no guessed lot.
      select * into v_original from public.inventory_movements where brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal';
      if v_original.id is null or v_original.lot_id is not null or
         (select count(*) from public.inventory_movements where brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal') <> 1 then
        raise exception 'choose original shipped sources for this return';
      end if;
      v_sources := jsonb_build_array(jsonb_build_object('movement_id', v_original.id, 'bin_id', private.first_bin(p_location), 'qty', cl.qty));
    end if;
    if v_sources is null and v_order is null then
      insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, ref, note, created_by)
      values (v_inv.brewery_id, v_sku, p_location, private.first_bin(p_location), cl.qty, 'return_in', v_cm, p_reason, auth.uid());
    else
      if jsonb_typeof(v_sources) is distinct from 'array' then raise exception 'return sources must be an array'; end if;
      if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(v_sources) e),0) <> cl.qty
         or (select count(distinct (e->>'movement_id')::uuid) from jsonb_array_elements(v_sources) e) <> jsonb_array_length(v_sources) then raise exception 'distinct return sources must sum to returned quantity'; end if;
      for src in select (e->>'movement_id')::uuid movement_id, (e->>'bin_id')::uuid bin_id, (e->>'qty')::numeric qty from jsonb_array_elements(v_sources) e loop
        if src.qty is null or src.qty <= 0 or src.qty::text in ('NaN','Infinity','-Infinity') or src.qty <> round(src.qty,2) then raise exception 'invalid return source quantity'; end if;
        select * into v_original from public.inventory_movements where id = src.movement_id and brewery_id = v_inv.brewery_id and ref = v_order and sku_id = v_sku and type = 'sale_removal';
        if v_original.id is null then raise exception 'source was not shipped on this invoice'; end if;
        if not exists (select 1 from public.bins where id = src.bin_id and location_id = p_location and brewery_id = v_inv.brewery_id) then raise exception 'invalid return destination bin'; end if;
        if src.qty > -v_original.qty - (select coalesce(sum(qty),0) from public.inventory_movements where brewery_id = v_inv.brewery_id and source_movement_id = v_original.id and type = 'return_in') then raise exception 'return exceeds remaining shipped source quantity'; end if;
        insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, lot_id, source_movement_id, qty, type, ref, note, created_by)
        values (v_inv.brewery_id, v_sku, p_location, src.bin_id, v_original.lot_id, v_original.id, src.qty, 'return_in', v_cm, p_reason, auth.uid());
      end loop;
    end if;
  end loop;
  -- Append to the originating order's event log, if this invoice came from a
  -- shipment (credit memos on a manually-issued invoice have none).
  select s.order_id into v_order from public.shipments s where s.id = v_inv.shipment_id;
  if v_order is not null then
    insert into public.order_events (brewery_id, order_id, actor, event, payload)
    values (v_inv.brewery_id, v_order, auth.uid(), 'credit_memo',
            jsonb_build_object('invoice_id', p_invoice, 'credit_memo_id', v_cm, 'lines', p_lines, 'reason', p_reason));
  end if;
  return jsonb_build_object('invoice_id', v_cm);
end $$;

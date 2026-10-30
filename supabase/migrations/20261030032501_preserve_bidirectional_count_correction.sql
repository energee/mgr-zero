-- Preserve bidirectional count corrections (#1639) alongside packaging output reversals (#1626).
-- Only the corrected-count equality guard differs from the preceding packaging trigger.
create or replace function public.enforce_bbl_integrity() returns trigger language plpgsql set search_path = '' as $$
declare original public.inventory_movements; returned_qty numeric; returned_bbl numeric; root_line record;
begin
  if new.compensates_id is not null then
    select * into original from public.inventory_movements where id = new.compensates_id and brewery_id = new.brewery_id;
    if original.id is null or original.id = new.id or original.compensates_id is not null
       or original.source_movement_id is not null or original.correction_source_id is not null
       or new.source_movement_id is not null or new.correction_source_id is not null
       or (new.sku_id, new.location_id, new.bin_id, new.lot_id, new.type, new.sale_channel_id, new.tax_treatment, new.dest_state)
          is distinct from (original.sku_id, original.location_id, original.bin_id, original.lot_id, original.type, original.sale_channel_id, original.tax_treatment, original.dest_state)
       or new.qty <> -original.qty then raise exception 'invalid movement compensation'; end if;
    if original.type in ('adjustment','loss') then
      if original.ref is not null or new.ref is not null then raise exception 'invalid standalone movement compensation'; end if;
    elsif original.type = 'production_in' then
      if original.ref is null or new.qty >= 0 or new.occurred_on <> original.occurred_on
         or not exists (
           select 1 from public.packaging_output_corrections correction
           cross join lateral jsonb_array_elements(correction.previous_outputs) output
           where correction.id=new.ref and correction.brewery_id=new.brewery_id
             and correction.run_id=original.ref and (output->>'movement_id')::uuid=original.id
         ) then raise exception 'invalid packaging output compensation'; end if;
    elsif original.type = 'depletion' then
      select l.* into root_line from public.taproom_count_lines l
      join public.taproom_counts root on root.id=l.count_id and root.brewery_id=l.brewery_id and root.corrects_count_id is null
      join public.taproom_counts correction on correction.id=new.ref and correction.brewery_id=l.brewery_id
        and correction.location_id=l.location_id and correction.corrects_count_id=root.id
      where l.brewery_id=new.brewery_id and l.movement_id=original.id and original.ref=root.id;
      if root_line.id is null or new.type <> 'depletion' or new.qty <= 0 then raise exception 'invalid count compensation'; end if;
    else
      raise exception 'invalid standalone movement compensation';
    end if;
    new.bbl := -original.bbl;
    new.package_type := original.package_type;
    return new;
  end if;
  if new.correction_source_id is not null then
    select * into original from public.inventory_movements where id = new.correction_source_id and brewery_id = new.brewery_id;
    select l.* into root_line from public.taproom_count_lines l
    join public.taproom_counts root on root.id=l.count_id and root.brewery_id=l.brewery_id and root.corrects_count_id is null
    join public.taproom_counts correction on correction.id=new.ref and correction.brewery_id=l.brewery_id
      and correction.location_id=l.location_id and correction.corrects_count_id=root.id
    where l.brewery_id=new.brewery_id and l.movement_id=original.id and original.ref=root.id;
    if original.id is null or root_line.id is null or original.type <> 'depletion' or new.type <> 'depletion'
       or original.compensates_id is not null or original.source_movement_id is not null or original.correction_source_id is not null
       or (new.sku_id, new.location_id, new.bin_id, new.lot_id, new.sale_channel_id, new.tax_treatment, new.dest_state)
          is distinct from (original.sku_id, original.location_id, original.bin_id, original.lot_id, original.sale_channel_id, original.tax_treatment, original.dest_state)
       or new.qty >= 0 or root_line.qty_before + new.qty = root_line.qty_counted
       or root_line.qty_before + new.qty >= root_line.qty_before then raise exception 'invalid corrected-count replacement'; end if;
    new.bbl := round(original.bbl * new.qty / original.qty, 8);
    new.package_type := original.package_type;
    return new;
  end if;
  if new.source_movement_id is not null then
    select * into original from public.inventory_movements where id = new.source_movement_id and brewery_id = new.brewery_id;
    if original.id is null or original.sku_id <> new.sku_id or original.lot_id is distinct from new.lot_id
       or not ((new.type = 'return_in' and original.type = 'sale_removal' and new.qty > 0 and new.qty <= -original.qty)
            or (new.type = 'loss' and original.type = 'return_in' and new.qty = -original.qty and new.ref = original.ref)) then
      raise exception 'invalid movement compensation source';
    end if;
    new.package_type := original.package_type;
    -- The original volume is a frozen fact, even after a format is edited.
    if new.type = 'return_in' then
      select coalesce(sum(qty),0), coalesce(sum(bbl),0) into returned_qty, returned_bbl from public.inventory_movements
        where brewery_id = new.brewery_id and source_movement_id = original.id and type = 'return_in';
      if returned_qty + new.qty > -original.qty then raise exception 'return exceeds original shipment'; end if;
      new.bbl := round(original.bbl * (returned_qty + new.qty) / original.qty, 8) - returned_bbl;
    else
      new.bbl := -original.bbl;
    end if;
    return new;
  end if;
  select (new.qty * f.bbl_per_unit), p.package_type into new.bbl, new.package_type
    from public.skus s join public.format_volumes f on f.id = s.format_id
    join public.formats p on p.id = s.format_id where s.id = new.sku_id;
  if new.bbl is null then raise exception 'format has no bbl_per_unit'; end if;
  return new;
end $$;

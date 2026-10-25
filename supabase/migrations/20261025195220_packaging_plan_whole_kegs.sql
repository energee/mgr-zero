-- A planned keg is a whole container. Keep fractional quantities legal for
-- other package types, and validate before numeric(12,2) can round the input.
-- Both public planning RPCs call this owner only after raw request replay.
create or replace function private.replace_packaging_run_outputs(
  p_brewery uuid, p_run uuid, p_brand uuid, p_outputs jsonb
) returns void language plpgsql set search_path = '' as $$
declare v_line jsonb; v_sku_brand uuid; v_package_type public.package_type; v_qty numeric;
begin
  if p_outputs is null then return; end if;
  perform private.assert_one_line_per_sku(p_outputs);
  delete from public.packaging_run_outputs where run_id = p_run;
  for v_line in select * from jsonb_array_elements(p_outputs) loop
    select s.brand_id, f.package_type into v_sku_brand, v_package_type
    from public.skus s join public.formats f on f.id = s.format_id and f.brewery_id = s.brewery_id
    where s.id = (v_line->>'sku_id')::uuid and s.brewery_id = p_brewery;
    if v_sku_brand is null then raise exception 'sku not found'; end if;
    if v_sku_brand <> p_brand then
      raise exception 'sku % is not a package of this run''s brand', v_line->>'sku_id';
    end if;
    v_qty := (v_line->>'qty_planned')::numeric;
    if v_package_type = 'keg' and (v_qty::text in ('NaN', 'Infinity', '-Infinity') or v_qty <> trunc(v_qty)) then
      raise exception 'Enter a whole number of kegs.';
    end if;
    insert into public.packaging_run_outputs (brewery_id, run_id, sku_id, qty_planned)
    values (p_brewery, p_run, (v_line->>'sku_id')::uuid, v_qty);
  end loop;
end $$;

-- #648 review: compare and order UUID identities, not their input spelling.
-- Postgres accepts uppercase and unhyphenated UUIDs for the same material.
create or replace function private.plan_material_count(p_brewery uuid, p_location uuid, p_bin uuid, p_lines jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  item jsonb; material public.materials; lots jsonb; lot record;
  expected numeric; counted numeric; delta numeric; remaining numeric; taken numeric;
  adjustments jsonb; result_lines jsonb := '[]'; revision_parts jsonb := '[]'; movements jsonb;
begin
  if not exists (select 1 from public.bins where id = p_bin and location_id = p_location and brewery_id = p_brewery) then
    raise exception 'count bin not found';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a count needs at least one material';
  end if;
  if (select count(*) <> count(distinct (value->>'material_id')::uuid) from jsonb_array_elements(p_lines)) then
    raise exception 'count each material only once';
  end if;
  for item in select value from jsonb_array_elements(p_lines) order by (value->>'material_id')::uuid loop
    select * into material from public.materials where id = (item->>'material_id')::uuid and brewery_id = p_brewery;
    if material.id is null then raise exception 'material not found'; end if;
    counted := (item->>'qty')::numeric;
    if counted is null or counted < 0 or counted > 9999999999.9999 or counted::text = 'NaN' or round(counted, 4) <> counted then
      raise exception 'count must be a nonnegative base quantity with at most four decimal places';
    end if;
    select coalesce(sum(qty), 0), coalesce(jsonb_agg(jsonb_build_array(id, qty) order by id), '[]')
      into expected, movements from public.material_movements
      where brewery_id = p_brewery and material_id = material.id and location_id = p_location and bin_id = p_bin;
    -- Include every lot: a newest zero-stock lot can receive an overage.
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.id), '[]') into lots from (
      select ml.id, ml.lot_code, ml.best_by, ml.received_on, ml.created_at, coalesce(sum(mm.qty), 0) as qty
      from public.material_lots ml left join public.material_movements mm
        on mm.brewery_id = p_brewery and mm.material_id = material.id and mm.lot_id = ml.id
        and mm.location_id = p_location and mm.bin_id = p_bin
      where ml.brewery_id = p_brewery and ml.material_id = material.id
      group by ml.id
    ) candidate;
    revision_parts := revision_parts || jsonb_build_array(jsonb_build_object('material', to_jsonb(material), 'counted', counted, 'movements', movements, 'lots', lots));
    delta := counted - expected;
    adjustments := '[]';
    if delta <> 0 and not material.lot_tracked then
      adjustments := jsonb_build_array(jsonb_build_object('lot_id', null, 'lot_code', null, 'qty_expected', expected, 'qty_counted', counted, 'delta', delta));
    elsif delta > 0 then
      select * into lot from jsonb_to_recordset(lots) as l(id uuid, lot_code text, received_on date, created_at timestamptz, qty numeric)
        order by received_on desc nulls last, created_at desc, id limit 1;
      if lot.id is null then raise exception '% is lot-tracked and has no lot to count against', material.name; end if;
      adjustments := jsonb_build_array(jsonb_build_object('lot_id', lot.id, 'lot_code', lot.lot_code, 'qty_expected', lot.qty, 'qty_counted', lot.qty + delta, 'delta', delta));
    elsif delta < 0 then
      remaining := -delta;
      for lot in select * from jsonb_to_recordset(lots) as l(id uuid, lot_code text, best_by date, received_on date, created_at timestamptz, qty numeric)
        where qty > 0 order by best_by asc nulls last, received_on asc nulls last, created_at, id
      loop
        exit when remaining <= 0;
        taken := least(lot.qty, remaining);
        adjustments := adjustments || jsonb_build_array(jsonb_build_object('lot_id', lot.id, 'lot_code', lot.lot_code, 'qty_expected', lot.qty, 'qty_counted', lot.qty - taken, 'delta', -taken));
        remaining := remaining - taken;
      end loop;
      if remaining > 0 then raise exception 'count of % is below zero for its lots at this bin', material.name; end if;
    end if;
    result_lines := result_lines || jsonb_build_array(jsonb_build_object('material_id', material.id, 'material_name', material.name, 'base_uom', material.base_uom, 'qty_expected', expected, 'qty_counted', counted, 'adjustments', adjustments));
  end loop;
  return jsonb_build_object('revision', md5(jsonb_build_object('brewery', p_brewery, 'location', p_location, 'bin', p_bin, 'parts', revision_parts)::text), 'lines', result_lines);
end $$;

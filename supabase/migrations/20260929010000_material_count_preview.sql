-- #648: one exact allocation plan owns preview and commit.
-- NOWAIT avoids lock-order inversions with receipt, packaging, and material edits.
-- The short transaction contains no provider calls. Contention is retryable.
create function private.lock_material_count() returns void
language plpgsql set search_path = '' as $$
begin
  lock table public.materials in exclusive mode nowait;
  lock table public.material_lots in share mode nowait;
  lock table public.material_movements in share row exclusive mode nowait;
exception when lock_not_available then
  raise exception 'Material stock is busy. Try preview again.' using errcode = 'MG409';
end $$;

-- Call only after taking the count locks. VOLATILE gives fresh reads after them.
create function private.plan_material_count(p_brewery uuid, p_location uuid, p_bin uuid, p_lines jsonb)
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
  if (select count(*) <> count(distinct value->>'material_id') from jsonb_array_elements(p_lines)) then
    raise exception 'count each material only once';
  end if;
  for item in select value from jsonb_array_elements(p_lines) order by value->>'material_id' loop
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

create function public.get_material_count_preview(p_brewery uuid, p_location uuid, p_bin uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  perform private.lock_material_count();
  return private.plan_material_count(p_brewery, p_location, p_bin, p_lines);
end $$;

-- Missing revisions can replay an existing legacy request, never write a new count.
drop function public.record_material_count(uuid, uuid, uuid, date, jsonb, uuid);
create function public.record_material_count(p_brewery uuid, p_location uuid, p_bin uuid, p_counted_on date, p_lines jsonb, p_request_id uuid, p_revision text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; replay jsonb; plan jsonb; counted public.material_counts;
  line jsonb; adjustment jsonb; movement uuid; movement_ids jsonb; result_lines jsonb := '[]';
begin
  actor := private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery, 'record_material_count', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'bin', p_bin, 'counted_on', p_counted_on, 'lines', p_lines) || case when p_revision is null then '{}'::jsonb else jsonb_build_object('revision', p_revision) end);
  if replay is not null then return replay; end if;
  if p_revision is null then raise exception 'Preview the count before recording.' using errcode = 'MG409'; end if;
  perform private.lock_material_count();
  plan := private.plan_material_count(p_brewery, p_location, p_bin, p_lines);
  if p_revision is null or p_revision <> plan->>'revision' then
    raise exception 'Material stock changed. Preview the count again.' using errcode = 'MG409';
  end if;
  insert into public.material_counts (brewery_id, location_id, bin_id, counted_on, counted_by)
    values (p_brewery, p_location, p_bin, coalesce(p_counted_on, current_date), actor) returning * into counted;
  for line in select value from jsonb_array_elements(plan->'lines') loop
    movement_ids := '[]';
    if jsonb_array_length(line->'adjustments') = 0 then
      insert into public.material_count_lines (brewery_id, count_id, material_id, qty_expected, qty_counted)
        values (p_brewery, counted.id, (line->>'material_id')::uuid, (line->>'qty_expected')::numeric, (line->>'qty_counted')::numeric);
    else
      for adjustment in select value from jsonb_array_elements(line->'adjustments') loop
        insert into public.material_movements (brewery_id, material_id, location_id, bin_id, lot_id, qty, type, created_by)
          values (p_brewery, (line->>'material_id')::uuid, p_location, p_bin, (adjustment->>'lot_id')::uuid, (adjustment->>'delta')::numeric, 'count_adjustment', actor)
          returning id into movement;
        insert into public.material_count_lines (brewery_id, count_id, material_id, lot_id, qty_expected, qty_counted, movement_id)
          values (p_brewery, counted.id, (line->>'material_id')::uuid, (adjustment->>'lot_id')::uuid, (adjustment->>'qty_expected')::numeric, (adjustment->>'qty_counted')::numeric, movement);
        movement_ids := movement_ids || to_jsonb(movement);
      end loop;
    end if;
    result_lines := result_lines || jsonb_build_array(jsonb_build_object('material_id', line->'material_id', 'qty_expected', line->'qty_expected', 'qty_counted', line->'qty_counted', 'movement_ids', movement_ids));
  end loop;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', counted.id, 'counted_on', counted.counted_on, 'lines', result_lines));
end $$;

revoke all on function private.lock_material_count() from public, anon, authenticated, service_role;
revoke all on function private.plan_material_count(uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_material_count_preview(uuid,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.record_material_count(uuid,uuid,uuid,date,jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_material_count_preview(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.record_material_count(uuid,uuid,uuid,date,jsonb,uuid,text) to authenticated;

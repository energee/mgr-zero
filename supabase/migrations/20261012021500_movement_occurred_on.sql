-- #821: freeze brewery-local movement dates and date packaging stock by Packaged on.
-- Copied from: report_movements 20260928236000_destination_state_facts_on_ledger.sql,
-- close_packaging_run 20261001205704_packaging_draw_conservation.sql,
-- file_compliance_report 20260925114317_ttb_filing_calendar_period.sql.
-- Non-concurrent index/backfill: hosted is pre-release with minimal ledger volume.
-- Historical rows retain their original reporting date, never lots.packaged_on.
alter table public.inventory_movements add column occurred_on date;
update public.inventory_movements m set occurred_on = (m.created_at at time zone b.timezone)::date
from public.breweries b where b.id = m.brewery_id;
alter table public.inventory_movements alter column occurred_on set not null;
comment on column public.inventory_movements.occurred_on is
  'Brewery-local effective date, frozen at insert. Defaults to the local date of created_at; packaging closes use Packaged on.';

-- Column defaults run before BEFORE INSERT; an omitted date uses created_at.
create function private.default_movement_occurred_on() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.occurred_on is null then
    select (new.created_at at time zone b.timezone)::date into new.occurred_on
    from public.breweries b where b.id = new.brewery_id;
  end if;
  return new;
end $$;
create trigger inventory_movements_occurred_on before insert on public.inventory_movements
for each row execute function private.default_movement_occurred_on();
revoke all on function private.default_movement_occurred_on() from public, anon, authenticated, service_role;
create index movements_occurred_idx on public.inventory_movements (brewery_id, occurred_on);

-- Effective-date filtering uses movements_occurred_idx; recorded-time lists keep their index.
create or replace function private.report_movements(p_brewery uuid, p_end date)
returns table (class public.package_type, bbl numeric, type public.movement_type, tax_treatment public.tax_treatment,
  dest_state text, d date, side text, id uuid, original_id uuid)
language sql stable set search_path = '' as $$
  select m.package_type, m.bbl, m.type, m.tax_treatment, m.dest_state, m.occurred_on,
    case m.type
      when 'production_in' then 'in' when 'return_in' then 'in' when 'opening_balance' then 'in'
      when 'adjustment' then case when coalesce(original.bbl, m.bbl) > 0 then 'in' else 'out' end
      when 'sale_removal' then 'out' when 'depletion' then 'out' when 'destruction' then 'out'
      when 'loss' then 'out' when 'sample' then 'out' when 'festival_removal' then 'out'
      when 'taproom_transfer' then 'transfer' when 'location_transfer' then 'transfer' when 'repack' then 'transfer'
    end,
    m.id, coalesce(m.source_movement_id, m.compensates_id, m.correction_source_id)
  from public.breweries b
  join public.inventory_movements m on m.brewery_id = b.id
    and m.occurred_on <= p_end
  left join public.inventory_movements original on original.id = m.compensates_id and original.brewery_id = m.brewery_id
  where b.id = p_brewery
$$;
revoke all on function private.report_movements(uuid, date) from public, anon, authenticated;


create or replace function public.close_packaging_run(
  p_brewery uuid, p_run uuid, p_bbl_drawn numeric, p_outputs jsonb, p_lot_code text,
  p_packaged_on date, p_best_by date, p_location uuid, p_bin uuid, p_request_id uuid,
  p_actuals jsonb default null, p_plan_revision text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_plan jsonb; v_record uuid; v_hash jsonb;
  v_actor uuid; v_replay jsonb; v_run public.packaging_runs; v_lot uuid; v_available numeric;
  v_occupancy public.vessel_occupancies;
  v_line jsonb; v_sku uuid; v_qty numeric; v_format uuid;
  v_movement uuid; v_packaged numeric; v_balance jsonb; v_drawn numeric;
  -- Allow half the stored tank/draw precision (numeric(10,3)); compare frozen
  -- output volume without rounding it to that precision.
  c_epsilon constant numeric := 0.0005;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_hash := jsonb_build_object('brewery',p_brewery,'run',p_run,'bbl_drawn',p_bbl_drawn,
    'outputs',p_outputs,'lot_code',p_lot_code,'packaged_on',p_packaged_on,
    'best_by',p_best_by,'location',p_location,'bin',p_bin);
  -- Omitted new fields retain old completed request identity, never a new
  -- theoretical close. Claim/replay precedes all new validation.
  if p_actuals is not null then v_hash := v_hash||jsonb_build_object('actuals',p_actuals,'plan_revision',p_plan_revision); end if;
  v_replay := private.claim_command_request(p_brewery,'close_packaging_run',p_request_id,v_hash);
  if v_replay is not null then return v_replay; end if;

  if p_bbl_drawn is null or p_bbl_drawn < 0 or p_bbl_drawn::text in ('NaN','Infinity','-Infinity') then
    raise exception 'barrels drawn must be nonnegative and finite';
  end if;
  -- Match the stored numeric(10,3) draw, but retain raw input in replay identity
  -- and the existing tank guard so rounding never admits a previously refused draw.
  v_drawn := round(p_bbl_drawn, 3);

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;
  if v_run.cancelled_at is not null then raise exception 'packaging run is cancelled'; end if;
  -- The check constraint says the same thing as a constraint name; these are
  -- the two sentences a brewer would actually say.
  if v_run.occupancy_id is null then
    raise exception 'pick the tank this run drew from before closing it';
  end if;
  if v_run.started_at is null then raise exception 'start the run before closing it'; end if;

  -- Filing takes this same workflow lock, so the date check cannot race it.
  if p_packaged_on is null then raise exception 'packaged on is required'; end if;
  if p_packaged_on > (select (now() at time zone timezone)::date from public.breweries where id = p_brewery) then
    raise exception 'packaged on % is after today; enter the day the beer was packaged', p_packaged_on;
  end if;
  if exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null and period_end >= p_packaged_on) then
    raise exception 'packaged on % is inside a filed report period; packaging cannot be dated into a filed month', p_packaged_on;
  end if;

  -- Finished goods have to land somewhere real: the bin must be a bin of that
  -- location, and the location this brewery's.
  if not exists (
    select 1 from public.bins b join public.locations l on l.id = b.location_id
    where b.id = p_bin and b.location_id = p_location and l.brewery_id = p_brewery
  ) then
    raise exception 'bin does not belong to that location';
  end if;

  -- Lock the tank before reading its volume, as record_cellar_transfer does:
  -- the run lock above serialises closes of *this* run, but two runs drawing
  -- the same tank (or a cellar transfer out of it) would otherwise both see
  -- the pre-draw volume and both pass the check below.
  select * into v_occupancy from public.vessel_occupancies
  where id = v_run.occupancy_id and brewery_id = p_brewery for update;
  if v_occupancy.id is null then raise exception 'occupancy not found'; end if;
  -- The over-draw check below would refuse this anyway -- an ended occupancy
  -- holds nothing -- but only for a run that drew something. Saying it here
  -- keeps a zero-bbl close from quietly booking beer against an emptied tank,
  -- and names the order the two steps belong in.
  if v_occupancy.ended_at is not null then
    raise exception 'the tank was emptied before this run closed; close runs before transferring the heel out';
  end if;

  select bbl into v_available from public.occupancy_volumes where occupancy_id = v_occupancy.id;
  if p_bbl_drawn > coalesce(v_available, 0) + c_epsilon then
    raise exception 'only % bbl in that tank; asked to draw %', coalesce(v_available, 0), p_bbl_drawn;
  end if;

  perform private.assert_one_line_per_sku(p_outputs);

  perform private.lock_packaging_materials();
  v_plan := public.packaging_material_plan(p_brewery,(select coalesce(jsonb_agg(jsonb_build_object('sku_id',sku_id,'qty_planned',qty_planned) order by sku_id),'[]'::jsonb) from public.packaging_run_outputs where run_id=p_run));
  if p_actuals is null or p_plan_revision is null then raise exception 'review packaging material plan and confirm actuals before closing'; end if;
  if p_plan_revision is distinct from encode(extensions.digest(v_plan::text,'sha256'),'hex') then raise exception 'Packaging material plan changed. Review it again.' using errcode='MG412'; end if;
  insert into public.packaging_material_records(brewery_id,run_id,planned,created_by)
    values(p_brewery,p_run,v_plan,v_actor) returning id into v_record;
  perform private.append_packaging_actuals(v_record,p_actuals);

  -- lots is unique (brewery_id, code); say so as a sentence rather than let a
  -- 23505 carrying a constraint name reach the brewer.
  if exists (select 1 from public.lots where brewery_id = p_brewery and code = p_lot_code) then
    raise exception 'lot code "%" is already used', p_lot_code;
  end if;
  insert into public.lots (brewery_id, packaging_run_id, brand_id, code, packaged_on, best_by)
  values (p_brewery, p_run, v_run.brand_id, p_lot_code, p_packaged_on, p_best_by)
  returning id into v_lot;

  -- A planned line nobody filled is settled at zero rather than left null: the
  -- run is history now, and "we filled none of those" is the answer.
  update public.packaging_run_outputs set qty_actual = 0 where run_id = p_run;

  for v_line in select * from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb)) loop
    v_sku := (v_line->>'sku_id')::uuid;
    v_qty := (v_line->>'qty_actual')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'qty_actual must not be negative';
    end if;
    if not exists (select 1 from public.packaging_run_outputs where run_id = p_run and sku_id = v_sku) then
      raise exception 'sku % is not one of this run''s planned outputs', v_sku;
    end if;
    if v_qty = 0 then continue; end if;

    select s.format_id into v_format from public.skus s where s.id = v_sku and s.brewery_id = p_brewery;

    -- One production_in per package filled, all carrying the run's lot and the
    -- run id as ref, so the whole close reads back as one event. bbl is frozen
    -- from the format by the enforce_bbl_integrity trigger.
    insert into public.inventory_movements
      (brewery_id, sku_id, location_id, bin_id, qty, type, lot_id, ref, created_by, occurred_on)
    values (p_brewery, v_sku, p_location, p_bin, v_qty, 'production_in', v_lot, p_run, v_actor, p_packaged_on)
    returning id into v_movement;
    update public.packaging_run_outputs set qty_actual = v_qty, movement_id = v_movement
    where run_id = p_run and sku_id = v_sku;

  end loop;

  -- Packaging never makes beer: what this run put in packages cannot exceed
  -- what the tank held, or the batch's completion residual goes negative for
  -- good with no way to reopen the run (#432).
  select coalesce(sum(bbl), 0) into v_packaged from public.inventory_movements
  where brewery_id = p_brewery and lot_id = v_lot and type = 'production_in';
  if v_packaged > coalesce(v_available, 0) + c_epsilon then
    raise exception 'packaged % bbl but the tank held %; check the package counts', round(v_packaged, 2), round(coalesce(v_available, 0), 2);
  end if;

  -- Tank availability is not the run's draw: packages cannot create beer (#723).
  if v_packaged > v_drawn + c_epsilon then
    raise exception 'packaged % bbl but only % bbl drawn; check the barrels drawn and package counts', v_packaged, v_drawn;
  end if;

  update public.packaging_runs set closed_at = now(), bbl_drawn = v_drawn
  where id = p_run returning * into v_run;

  -- Nor across runs: several closes that each fit their tank can together
  -- package more than the batch had. Refuse the close that tips it over, with
  -- the same arithmetic Complete batch uses, so its operator hears why (#499).
  v_balance := private.batch_volume_balance(p_brewery, v_occupancy.batch_id);
  if (v_balance->>'residualBbl')::numeric < 0 then
    raise exception 'packaged % bbl across this batch''s runs, but the batch had % bbl; check the package counts',
      round((v_balance->>'packagedBbl')::numeric, 2),
      round((v_balance->>'baselineBbl')::numeric - (v_balance->>'attributedBbl')::numeric, 2);
  end if;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

revoke all on function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text) to authenticated;

create or replace function public.file_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_report jsonb; v_row public.report_filings;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'file_compliance_report', p_request_id,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'start', p_start, 'end', p_end, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_cellar_workflow(p_brewery);
  if p_jurisdiction = 'TTB' and not (
      p_end = (p_start + interval '1 month - 1 day')::date and p_start = date_trunc('month', p_start)::date
      or p_end = (p_start + interval '3 months - 1 day')::date and p_start = date_trunc('quarter', p_start)::date
      or p_end = (p_start + interval '1 year - 1 day')::date and p_start = date_trunc('year', p_start)::date) then
    raise exception 'a TTB filing covers one calendar month, quarter, or year';
  end if;
  v_report := private.generate_compliance_report(p_brewery, p_jurisdiction, p_start, p_end);
  if not (v_report->'figures'->>'balances')::boolean then
    raise exception 'the report does not balance: %', array_to_string(array(select jsonb_array_elements_text(v_report->'warnings')), '; ');
  end if;
  if v_report->'externalMappingRequired' ? 'taproom' then
    raise exception 'direct cellar Taproom removals need an approved external filing-line mapping before filing';
  end if;
  if p_end >= (select (now() at time zone timezone)::date from public.breweries where id = p_brewery) then
    raise exception 'the period has not ended yet; file it once it is over';
  end if;
  begin
    insert into public.report_filings (brewery_id, jurisdiction, period_start, period_end, figures, filed_at, filed_by, note)
      values (p_brewery, p_jurisdiction, p_start, p_end, v_report->'figures', now(), auth.uid(), p_note) returning * into v_row;
  exception when unique_violation or exclusion_violation then
    raise exception 'this period is already filed' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

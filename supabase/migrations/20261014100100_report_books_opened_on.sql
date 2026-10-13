-- Compliance reports start counting at breweries.books_opened_on
-- (20261014100000_books_opened_on.sql; docs/plans/lolev-history.md task 3).
-- Two changes. (1) report_movements, the one reader that looks back to the
-- beginning of time (for the beginning balance), skips rows dated before the
-- books opened, so imported history leaves every movement figure but stays in
-- the ledger, lot trace and batch screens. (2) Generating or filing a period
-- that starts before the books opened is refused. With (2), every other
-- period-bounded read (cellar removals, invoice facts) already starts on or
-- after the date, so it needs no bound of its own. A null date changes nothing.
--
-- Copied from: report_movements 20261012110000_movement_occurred_on.sql;
-- only the books_opened_on bound is new. create or replace keeps its grants.

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
    and m.occurred_on >= coalesce(b.books_opened_on, '-infinity'::date)
  left join public.inventory_movements original on original.id = m.compensates_id and original.brewery_id = m.brewery_id
  where b.id = p_brewery
$$;

-- A period that starts before the books opened would mix counted and
-- uncounted rows, so both report entry points refuse it. Plain raise (P0001)
-- so the message reaches the caller (lib/commands/registry.ts rpcError).
create function private.assert_period_after_books_opened(p_brewery uuid, p_start date) returns void
language plpgsql stable set search_path = '' as $$
declare v_opened date;
begin
  select books_opened_on into v_opened from public.breweries where id = p_brewery;
  if p_start < v_opened then
    raise exception 'this period starts before the books opened on %', v_opened;
  end if;
end $$;
revoke all on function private.assert_period_after_books_opened(uuid, date) from public, anon, authenticated;

-- Copied from: 00001_baseline.sql; only the books-opened check is new.
create or replace function public.generate_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales']::public.staff_role[]);
  perform private.assert_period_after_books_opened(p_brewery, p_start);
  return private.generate_compliance_report(p_brewery, p_jurisdiction, p_start, p_end);
end $$;

-- Copied from: 20261013100000_file_cellar_taproom_removals.sql; only the
-- books-opened check is new.
create or replace function public.file_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_report jsonb; v_row public.report_filings;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'file_compliance_report', p_request_id,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'start', p_start, 'end', p_end, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  perform private.assert_period_after_books_opened(p_brewery, p_start);
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

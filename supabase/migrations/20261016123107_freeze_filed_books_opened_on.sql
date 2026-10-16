-- Freeze the reporting basis once any snapshot has been filed (#910 RC01).
-- Clearing, moving earlier, and moving within the beginning-balance window can
-- all change a filed period's source population. No amendment policy is implied.
-- Both writers use the existing cellar gate and read the basis after acquiring
-- it, so whichever wins the gate determines what the other may safely do.
create or replace function public.set_brewery_books_opened_on(p_brewery uuid, p_books_opened_on date, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_current date;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'set_brewery_books_opened_on', p_request_id,
    jsonb_build_object('books_opened_on', p_books_opened_on));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);
  select books_opened_on into v_current from public.breweries where id = p_brewery;
  if p_books_opened_on is distinct from v_current then
    if exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null) then
      -- Plain raise (P0001) preserves the actionable message at the command boundary.
      raise exception 'books opened on cannot change or be cleared after a report is filed; keep the saved value and consult your compliance owner about a correction';
    end if;
    update public.breweries set books_opened_on = p_books_opened_on where id = p_brewery;
  end if;
  return private.complete_command_request(p_request_id, jsonb_build_object('books_opened_on', p_books_opened_on));
end $$;

-- Copied from 20261014100100_report_books_opened_on.sql. Only move the
-- books-opened check behind the gate: a setter may commit while filing waits.
-- CREATE OR REPLACE preserves both functions' existing grants and authority.
create or replace function public.file_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_report jsonb; v_row public.report_filings;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'file_compliance_report', p_request_id,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'start', p_start, 'end', p_end, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_cellar_workflow(p_brewery);
  perform private.assert_period_after_books_opened(p_brewery, p_start);
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

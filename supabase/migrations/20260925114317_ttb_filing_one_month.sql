-- A TTB filing covers exactly one calendar month (#486). An arbitrary range
-- such as the 10th to the 20th claimed those days through the overlap
-- exclusion, blocking the real month's filing and leaving the rest of the
-- month in no filing. Other jurisdictions keep caller-chosen periods.
create or replace function public.file_compliance_report(p_brewery uuid, p_jurisdiction text, p_start date, p_end date, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_report jsonb; v_row public.report_filings;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'file_compliance_report', p_request_id,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'start', p_start, 'end', p_end, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if p_jurisdiction = 'TTB' and (p_start <> date_trunc('month', p_start)::date
      or p_end <> (date_trunc('month', p_start) + interval '1 month - 1 day')::date) then
    raise exception 'a TTB filing covers one calendar month: the 1st through its last day';
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

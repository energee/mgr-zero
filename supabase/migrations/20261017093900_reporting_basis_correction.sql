-- Owner-approved reporting-basis correction (#939). Filed figures never change.
-- Each affected filing gets an append-only amendment flag linked to its cause.
create table public.reporting_basis_corrections (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  old_basis date,
  new_basis date,
  corrected_by uuid not null references auth.users(id),
  corrected_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) > 0),
  unique (brewery_id, id),
  check (old_basis is distinct from new_basis)
);
create table public.report_basis_amendments (
  brewery_id uuid not null references public.breweries(id),
  filing_id uuid not null,
  correction_id uuid not null,
  old_figures jsonb not null,
  new_figures jsonb not null,
  primary key (filing_id, correction_id),
  foreign key (brewery_id, correction_id) references public.reporting_basis_corrections(brewery_id, id)
);
-- report_filings predates the composite tenant key; enforce it here as well.
create unique index report_filings_brewery_id_id on public.report_filings(brewery_id, id);
alter table public.report_basis_amendments add foreign key (brewery_id, filing_id) references public.report_filings(brewery_id, id);
create index reporting_basis_corrections_brewery_time on public.reporting_basis_corrections(brewery_id, corrected_at desc);
create index report_basis_amendments_brewery on public.report_basis_amendments(brewery_id);
create index report_basis_amendments_correction on public.report_basis_amendments(brewery_id, correction_id);

alter table public.reporting_basis_corrections enable row level security;
alter table public.report_basis_amendments enable row level security;
revoke all on public.reporting_basis_corrections, public.report_basis_amendments from public, anon, authenticated, service_role;
grant select on public.reporting_basis_corrections, public.report_basis_amendments to authenticated;
create policy staff_read on public.reporting_basis_corrections for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));
create policy staff_read on public.report_basis_amendments for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));

create function private.preserve_reporting_basis_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'reporting basis correction history is immutable';
end $$;
revoke all on function private.preserve_reporting_basis_history() from public, anon, authenticated, service_role;
create trigger immutable_history before update or delete on public.reporting_basis_corrections
  for each row execute function private.preserve_reporting_basis_history();
create trigger immutable_history before update or delete on public.report_basis_amendments
  for each row execute function private.preserve_reporting_basis_history();

create function public.correct_reporting_basis(p_brewery uuid, p_books_opened_on date, p_expected_books_opened_on date, p_reason text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb;
  v_old date;
  v_correction public.reporting_basis_corrections;
  v_filing public.report_filings;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'correct_reporting_basis', p_request_id,
    jsonb_build_object('books_opened_on', p_books_opened_on, 'expected_books_opened_on', p_expected_books_opened_on, 'reason', p_reason));
  if v_replay is not null then return v_replay; end if;
  -- The same gate as filing and the ordinary setter: no filing can slip
  -- between the before/after comparison and recording its amendment flag.
  perform private.lock_cellar_workflow(p_brewery);
  select books_opened_on into v_old from public.breweries where id = p_brewery;
  if v_old is distinct from p_expected_books_opened_on then
    raise exception 'the reporting basis changed; refresh and review before correcting it';
  end if;
  if v_old is not distinct from p_books_opened_on then raise exception 'choose a different reporting basis'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a correction reason is required'; end if;
  if not exists (select 1 from public.report_filings where brewery_id = p_brewery and filed_at is not null) then
    raise exception 'no report has been filed; change Books opened on in brewery details instead';
  end if;
  -- Match existing cellar -> ledger lock order. An inventory write cannot
  -- masquerade as a basis change between the two balance calculations.
  lock table public.inventory_movements in share row exclusive mode;

  select jsonb_object_agg(filing.id::text,
    private.generate_compliance_report(p_brewery, filing.jurisdiction, filing.period_start, filing.period_end)->'figures')
    into v_before from public.report_filings filing where brewery_id = p_brewery and filed_at is not null;
  insert into public.reporting_basis_corrections(brewery_id, old_basis, new_basis, corrected_by, reason)
    values (p_brewery, v_old, p_books_opened_on, auth.uid(), btrim(p_reason)) returning * into v_correction;
  update public.breweries set books_opened_on = p_books_opened_on where id = p_brewery;
  for v_filing in select * from public.report_filings where brewery_id = p_brewery and filed_at is not null loop
    -- Use the private generator to retain evidence even when the new basis
    -- invalidates this period. Public generation still refuses such a range.
    v_after := private.generate_compliance_report(p_brewery, v_filing.jurisdiction, v_filing.period_start, v_filing.period_end)->'figures';
    if v_before->v_filing.id::text is distinct from v_after
        or v_filing.period_start < p_books_opened_on then
      insert into public.report_basis_amendments(brewery_id, filing_id, correction_id, old_figures, new_figures)
        values (p_brewery, v_filing.id, v_correction.id, v_before->v_filing.id::text, v_after);
    end if;
  end loop;
  return private.complete_command_request(p_request_id, to_jsonb(v_correction));
end $$;
revoke all on function public.correct_reporting_basis(uuid, date, date, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.correct_reporting_basis(uuid, date, date, text, uuid) to authenticated;

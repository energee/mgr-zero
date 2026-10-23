-- #1209: the Compliance list marks an ended, unfiled period with nothing to
-- report "No activity". list_compliance_reports needs to know which periods
-- hold anything the compliance report reads. This function answers by month:
-- the first day of every month in p_start..p_end with at least one row from
-- the report's own inputs. Those are the finished-goods ledger rows
-- (report_movements, which already skips rows before the books opened), the
-- cellar removals (report_cellar_removals), and the destination-state facts,
-- which add invoice lines (destination_state_facts). No second definition of
-- activity: a month counts exactly when generate_compliance_report would read
-- a row dated in it. The command turns months into month, quarter and year keys.
create function public.list_compliance_active_months(p_brewery uuid, p_start date, p_end date)
returns date[] language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','sales']::public.staff_role[]);
  return (
    select coalesce(array_agg(distinct date_trunc('month', a.d::timestamp)::date), '{}')
    from (
      select m.d from private.report_movements(p_brewery, p_end) m where m.d >= p_start
      union all
      select c.d from private.report_cellar_removals(p_brewery, p_start, p_end) c
      union all
      select f.event_date from private.destination_state_facts(p_brewery, p_start, p_end) f
    ) a);
end $$;

revoke all on function public.list_compliance_active_months(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.list_compliance_active_months(uuid, date, date) to authenticated;
comment on function public.list_compliance_active_months(uuid, date, date) is
  'First day of each month in the range with any row the compliance report reads; admin and sales only (#1209).';

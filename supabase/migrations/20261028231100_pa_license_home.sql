-- #1517 item 5: brewery_state_licenses is the one home for a state license.
-- Settings kept its own breweries.pa_license_no, which nothing copied to
-- /compliance/licenses, so the two could disagree.
--
-- 1. Copy each Settings PA number into the brewery's PA brewery license. A
--    license row the brewery already keeps wins; its blank number is filled.
-- 2. update_brewery stops taking the PA number (Settings no longer shows it).
-- The column stays, unread and unwritten, so no saved number is deleted.
insert into public.brewery_state_licenses as l (brewery_id, state, kind, license_no)
  select id, 'PA', 'brewery', trim(pa_license_no)
    from public.breweries
    where nullif(trim(pa_license_no), '') is not null
on conflict (brewery_id, state, kind) do update
  set license_no = excluded.license_no
  where l.license_no is null or trim(l.license_no) = '';

comment on column public.breweries.pa_license_no is
  'Retired (#1517): copied into brewery_state_licenses (PA, brewery); nothing reads or writes it.';

drop function public.update_brewery(uuid,text,text,text,text,text,int,uuid);

create function public.update_brewery(
  p_brewery uuid, p_name text, p_timezone text, p_ttb_registry_no text,
  p_customer_phone text, p_reading_due_hours int, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.breweries;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_brewery', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'timezone', p_timezone, 'ttb', p_ttb_registry_no,
      'phone', p_customer_phone, 'hours', p_reading_due_hours));
  if v_replay is not null then return v_replay; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone using errcode = 'P0001';
  end if;
  update public.breweries set name = p_name, timezone = p_timezone, ttb_registry_no = p_ttb_registry_no,
    customer_phone = p_customer_phone, fermentation_reading_due_hours = p_reading_due_hours
    where id = p_brewery returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.update_brewery(uuid,text,text,text,text,int,uuid) from public, anon, authenticated;
grant execute on function public.update_brewery(uuid,text,text,text,text,int,uuid) to authenticated;

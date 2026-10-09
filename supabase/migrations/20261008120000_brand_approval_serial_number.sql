-- #730: a COLA carries two identifiers. ttb_id is the TTB ID that TTB
-- assigns (e.g. 25318001000034); serial_number is the applicant's own serial.
-- The sheet used to label ttb_id "Serial number", conflating the two. A
-- formula keeps only its number in ttb_id, so serial_number is COLA-only.
-- No approval data had been entered, so nothing is backfilled.

alter table public.brand_approvals add column serial_number text,
  add constraint brand_approvals_serial_cola_only check (serial_number is null or kind = 'cola');

drop function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[]);

-- Same keep-omitted / clear-named rule as #522; a formula clears any serial.
create function public.upsert_brand_approval(
  p_brewery uuid, p_id uuid, p_brand uuid, p_kind public.approval_kind, p_ttb_id text, p_approved_on date, p_expires_on date, p_note text, p_request_id uuid,
  p_clear text[] default '{}', p_serial_number text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brand_approvals;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand_approval', p_request_id,
    jsonb_build_object('id', p_id, 'brand', p_brand, 'kind', p_kind, 'ttb_id', p_ttb_id, 'serial_number', p_serial_number, 'approved_on', p_approved_on, 'expires_on', p_expires_on, 'note', p_note, 'clear', p_clear));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.brand_approvals (brewery_id, brand_id, kind, ttb_id, serial_number, approved_on, expires_on, note)
        values (p_brewery, p_brand, p_kind, p_ttb_id, p_serial_number, p_approved_on, p_expires_on, p_note) returning * into v_row;
    else
      update public.brand_approvals set brand_id = p_brand, kind = p_kind, ttb_id = p_ttb_id,
          serial_number = case when p_kind <> 'cola' or 'serial_number' = any(p_clear) then null else coalesce(p_serial_number, serial_number) end,
          approved_on = case when 'approved_on' = any(p_clear) then null else coalesce(p_approved_on, approved_on) end,
          expires_on = case when 'expires_on' = any(p_clear) then null else coalesce(p_expires_on, expires_on) end,
          note = case when 'note' = any(p_clear) then null else coalesce(p_note, note) end
        where id = p_id and brewery_id = p_brewery returning * into v_row;
      if not found then raise exception 'approval not found'; end if;
    end if;
  exception when unique_violation then
    raise exception 'that approval is already recorded for this brand' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[],text) from public, anon, authenticated;
grant execute on function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[],text) to authenticated;

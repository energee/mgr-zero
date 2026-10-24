-- TTB assigns a 14-digit COLA ID; formula numbers share this text column but
-- are different identifiers. Keep leading zeros and preserve historical rows.
-- https://www.ttb.gov/system/files/images/pdfs/labeling_colas-docs/display-cola-detail-through-public-cola-registry.pdf
-- NOT VALID avoids inventing corrections for existing approvals; every new or
-- edited row must meet the rule, including writes through the public RPC.
alter table public.brand_approvals
  add constraint brand_approvals_cola_ttb_id_format
  check (kind <> 'cola' or ttb_id ~ '^[0-9]{14}$') not valid;

-- Preserve the original payload and replay boundary. A historical committed
-- request can contain an identifier the new-write guard no longer accepts.
create or replace function public.upsert_brand_approval(
  p_brewery uuid, p_id uuid, p_brand uuid, p_kind public.approval_kind, p_ttb_id text, p_approved_on date, p_expires_on date, p_note text, p_request_id uuid,
  p_clear text[] default '{}', p_serial_number text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brand_approvals;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand_approval', p_request_id,
    jsonb_build_object('id', p_id, 'brand', p_brand, 'kind', p_kind, 'ttb_id', p_ttb_id, 'serial_number', p_serial_number, 'approved_on', p_approved_on, 'expires_on', p_expires_on, 'note', p_note, 'clear', p_clear));
  if v_replay is not null then return v_replay; end if;
  if p_kind = 'cola' and (p_ttb_id is null or p_ttb_id !~ '^[0-9]{14}$') then
    raise exception 'Enter the 14-digit TTB ID, including any leading zeros.';
  end if;
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
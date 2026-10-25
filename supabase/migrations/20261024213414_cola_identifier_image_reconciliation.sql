-- Retire the pre-image signature recreated by the immutable identifier migration.
-- Keep one image-aware write boundary and recover both completed payload versions.
drop function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[],text);

create or replace function public.upsert_brand_approval(
  p_brewery uuid, p_id uuid, p_brand uuid, p_kind public.approval_kind, p_ttb_id text, p_approved_on date, p_expires_on date, p_note text, p_request_id uuid,
  p_clear text[] default '{}', p_serial_number text default null, p_image_url text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brand_approvals; v_payload jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_payload := jsonb_build_object('id', p_id, 'brand', p_brand, 'kind', p_kind, 'ttb_id', p_ttb_id, 'serial_number', p_serial_number, 'approved_on', p_approved_on, 'expires_on', p_expires_on, 'note', p_note, 'image_url', p_image_url, 'clear', p_clear);
  -- A successful pre-image request omitted this key. Select that exact payload
  -- only for its original completed request; new writes keep the image-aware hash.
  if p_image_url is null and exists (
    select 1 from private.command_requests r
    where r.actor_id = auth.uid() and r.request_id = p_request_id
      and r.brewery_id = p_brewery and r.command_name = 'upsert_brand_approval'
      and r.origin = 'ui' and r.conversation_id is null and r.preview_token is null
      and r.result is not null
      and r.payload_hash = extensions.digest((v_payload - 'image_url')::text, 'sha256')
  ) then
    v_payload := v_payload - 'image_url';
  end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand_approval', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  if p_kind = 'cola' and (p_ttb_id is null or p_ttb_id !~ '^[0-9]{14}$') then
    raise exception 'Enter the 14-digit TTB ID, including any leading zeros.';
  end if;
  if p_image_url is not null and (p_kind <> 'cola' or p_approved_on is null or 'approved_on' = any(p_clear)) then
    raise exception 'A selected label image requires an approved COLA with its approval date.';
  end if;
  begin
    if p_id is null then
      insert into public.brand_approvals (brewery_id, brand_id, kind, ttb_id, serial_number, approved_on, expires_on, note, image_url)
        values (p_brewery, p_brand, p_kind, p_ttb_id, p_serial_number, p_approved_on, p_expires_on, p_note, p_image_url) returning * into v_row;
    else
      update public.brand_approvals set brand_id = p_brand, kind = p_kind, ttb_id = p_ttb_id,
          serial_number = case when p_kind <> 'cola' or 'serial_number' = any(p_clear) then null else coalesce(p_serial_number, serial_number) end,
          approved_on = case when 'approved_on' = any(p_clear) then null else coalesce(p_approved_on, approved_on) end,
          expires_on = case when 'expires_on' = any(p_clear) then null else coalesce(p_expires_on, expires_on) end,
          note = case when 'note' = any(p_clear) then null else coalesce(p_note, note) end,
          image_url = case
            when p_kind <> 'cola' or 'image_url' = any(p_clear) or 'approved_on' = any(p_clear) then null
            when p_image_url is not null then p_image_url
            when p_ttb_id is distinct from ttb_id or p_kind is distinct from kind then null
            else image_url
          end
        where id = p_id and brewery_id = p_brewery returning * into v_row;
      if not found then raise exception 'approval not found'; end if;
    end if;
  exception when unique_violation then
    raise exception 'that approval is already recorded for this brand' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[],text,text) from public, anon, authenticated;
grant execute on function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[],text,text) to authenticated;

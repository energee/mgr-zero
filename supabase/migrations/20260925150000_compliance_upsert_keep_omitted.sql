-- #522: the three compliance-registry upserts replaced every column with what
-- the caller sent, so an API or chat caller that omitted a field cleared it.
-- Now a null parameter keeps the saved value (coalesce, as update_draft_order
-- does), and p_clear names the columns the caller explicitly set to null
-- (the p_clear_requested pattern, one text[] instead of a flag per column).
-- The signature gains p_clear, so each old function is dropped first.

drop function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid);
drop function public.upsert_state_registration(uuid,uuid,text,text,date,date,uuid);
drop function public.upsert_brewery_state_license(uuid,text,text,text,date,text,uuid);

create function public.upsert_brand_approval(
  p_brewery uuid, p_id uuid, p_brand uuid, p_kind public.approval_kind, p_ttb_id text, p_approved_on date, p_expires_on date, p_note text, p_request_id uuid,
  p_clear text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brand_approvals;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand_approval', p_request_id,
    jsonb_build_object('id', p_id, 'brand', p_brand, 'kind', p_kind, 'ttb_id', p_ttb_id, 'approved_on', p_approved_on, 'expires_on', p_expires_on, 'note', p_note, 'clear', p_clear));
  if v_replay is not null then return v_replay; end if;
  begin
    if p_id is null then
      insert into public.brand_approvals (brewery_id, brand_id, kind, ttb_id, approved_on, expires_on, note)
        values (p_brewery, p_brand, p_kind, p_ttb_id, p_approved_on, p_expires_on, p_note) returning * into v_row;
    else
      update public.brand_approvals set brand_id = p_brand, kind = p_kind, ttb_id = p_ttb_id,
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

create function public.upsert_state_registration(
  p_brewery uuid, p_brand uuid, p_state text, p_registration_no text, p_approved_on date, p_expires_on date, p_request_id uuid,
  p_clear text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.state_registrations;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_state_registration', p_request_id,
    jsonb_build_object('brand', p_brand, 'state', p_state, 'registration_no', p_registration_no, 'approved_on', p_approved_on, 'expires_on', p_expires_on, 'clear', p_clear));
  if v_replay is not null then return v_replay; end if;
  -- Composer previews lock the same parent row so an absent registration
  -- cannot appear between their warning snapshot and commit.
  perform 1 from public.brands where id=p_brand and brewery_id=p_brewery for update;
  if not found then raise exception 'brand not found'; end if;
  -- the composite FK pins the brand to this brewery, and the conflict key is the brand, so the row hit is this brewery's
  insert into public.state_registrations as t (brewery_id, brand_id, state, registration_no, approved_on, expires_on)
    values (p_brewery, p_brand, p_state, p_registration_no, p_approved_on, p_expires_on)
    on conflict (brand_id, state) do update set
      registration_no = case when 'registration_no' = any(p_clear) then null else coalesce(excluded.registration_no, t.registration_no) end,
      approved_on = case when 'approved_on' = any(p_clear) then null else coalesce(excluded.approved_on, t.approved_on) end,
      expires_on = case when 'expires_on' = any(p_clear) then null else coalesce(excluded.expires_on, t.expires_on) end
    returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function public.upsert_brewery_state_license(
  p_brewery uuid, p_state text, p_kind text, p_license_no text, p_expires_on date, p_note text, p_request_id uuid,
  p_clear text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brewery_state_licenses;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_brewery_state_license', p_request_id,
    jsonb_build_object('state', p_state, 'kind', p_kind, 'license_no', p_license_no, 'expires_on', p_expires_on, 'note', p_note, 'clear', p_clear));
  if v_replay is not null then return v_replay; end if;
  -- kind is free text on the unique key: normalize it so "Brewery " and "brewery" are one license
  insert into public.brewery_state_licenses as t (brewery_id, state, kind, license_no, expires_on, note)
    values (p_brewery, p_state, lower(trim(p_kind)), p_license_no, p_expires_on, p_note)
    on conflict (brewery_id, state, kind) do update set
      license_no = case when 'license_no' = any(p_clear) then null else coalesce(excluded.license_no, t.license_no) end,
      expires_on = case when 'expires_on' = any(p_clear) then null else coalesce(excluded.expires_on, t.expires_on) end,
      note = case when 'note' = any(p_clear) then null else coalesce(excluded.note, t.note) end
    returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[]) from public, anon, authenticated;
revoke all on function public.upsert_state_registration(uuid,uuid,text,text,date,date,uuid,text[]) from public, anon, authenticated;
revoke all on function public.upsert_brewery_state_license(uuid,text,text,text,date,text,uuid,text[]) from public, anon, authenticated;
grant execute on function public.upsert_brand_approval(uuid,uuid,uuid,public.approval_kind,text,date,date,text,uuid,text[]) to authenticated;
grant execute on function public.upsert_state_registration(uuid,uuid,text,text,date,date,uuid,text[]) to authenticated;
grant execute on function public.upsert_brewery_state_license(uuid,text,text,text,date,text,uuid,text[]) to authenticated;

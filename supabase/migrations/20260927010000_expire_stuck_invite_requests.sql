-- #580: a crash between claim_invite_request and record_invite_failure left the
-- request in pending_auth, and invite_requests_open_email_idx then blocked that
-- email in its brewery forever. A new claim now first marks this brewery's
-- pending_auth rows for the email that are older than 15 minutes as failed.
--
-- This is safe if the stuck request's Auth call commits later:
-- bind_invited_auth_user still binds a failed row by its own auth_token, and
-- invite_requests_open_email_idx aborts that Auth transaction while the
-- replacement request is open, so no second account is created.
-- Only the expiry update below is new; the rest is the baseline body.
create or replace function claim_invite_request(p_brewery uuid, p_email text, p_kind text,
  p_role public.staff_role, p_customer uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row private.invite_requests; v_email text := lower(btrim(p_email));
begin
  if p_kind is null or p_kind not in ('staff','customer') or
    (p_kind = 'staff' and (p_role is null or p_customer is not null)) or
    (p_kind = 'customer' and (p_role is not null or p_customer is null)) or
    v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'invalid invitation'; end if;
  perform private.assert_staff(p_brewery, case when p_kind = 'staff' then array['admin']::public.staff_role[] else array['admin','sales']::public.staff_role[] end);
  if p_kind = 'customer' and not exists (select 1 from public.customers where id = p_customer and brewery_id = p_brewery) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery,
    case when p_kind = 'staff' then 'invite_staff' else 'invite_customer_user' end, p_request_id,
    jsonb_build_object('email', v_email, 'role', p_role, 'customer', p_customer));
  if v_replay is null then
    if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email already has an account' using errcode = 'MG409'; end if;
    update private.invite_requests set state = 'failed', last_error = 'Invitation expired before Auth; replaced by a new request'
      where brewery_id = p_brewery and email = v_email and state = 'pending_auth'
        and created_at < now() - interval '15 minutes';
    begin
      insert into private.invite_requests(brewery_id, actor_id, email, role, customer_id, kind, request_id)
      values(p_brewery, auth.uid(), v_email, p_role, p_customer, p_kind, p_request_id) returning * into v_row;
    exception when unique_violation then raise exception 'invitation already requested' using errcode = 'MG409'; end;
    perform private.complete_command_request(p_request_id, jsonb_build_object('inviteId', v_row.id));
  else
    select * into v_row from private.invite_requests where id = (v_replay->>'inviteId')::uuid and actor_id = auth.uid();
  end if;
  return jsonb_build_object('id', v_row.id, 'email', v_row.email, 'authToken', v_row.auth_token,
    'userId', v_row.auth_user_id, 'state', v_row.state);
end $$;

-- #580 simplify: one definition of who may invite (invite_roles), one membership
-- grant for both invite completion paths (grant_invite_membership), and an index
-- for list_my_invitations, which runs on every password sign-in.
-- Function bodies are 20260928060000_existing_account_consent.sql's, with the
-- repeated role case and membership inserts replaced by the helpers.

create function private.invite_roles(p_kind text) returns public.staff_role[]
language sql immutable set search_path = '' as $$
  select case when p_kind = 'staff' then array['admin']::public.staff_role[]
    else array['admin','sales']::public.staff_role[] end;
$$;
revoke all on function private.invite_roles(text) from public;

-- Adds the invited membership for p_user and marks the request complete.
-- A duplicate membership raises unique_violation for the caller to map to MG409.
create function private.grant_invite_membership(p_row private.invite_requests, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_row.kind = 'staff' then
    insert into public.brewery_users(brewery_id,user_id,role) values(p_row.brewery_id,p_user,p_row.role);
  else
    insert into public.customer_users(customer_id,user_id) values(p_row.customer_id,p_user);
  end if;
  update private.invite_requests set state = 'complete', last_error = null where id = p_row.id;
end $$;
revoke all on function private.grant_invite_membership(private.invite_requests, uuid) from public;

create index invite_requests_pending_consent_idx on private.invite_requests(auth_user_id)
  where state = 'pending_consent';

create or replace function claim_invite_request(p_brewery uuid, p_email text, p_kind text,
  p_role public.staff_role, p_customer uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row private.invite_requests; v_email text := lower(btrim(p_email)); v_user uuid;
begin
  if p_kind is null or p_kind not in ('staff','customer') or
    (p_kind = 'staff' and (p_role is null or p_customer is not null)) or
    (p_kind = 'customer' and (p_role is not null or p_customer is null)) or
    v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'invalid invitation'; end if;
  perform private.assert_staff(p_brewery, private.invite_roles(p_kind));
  if p_kind = 'customer' and not exists (select 1 from public.customers where id = p_customer and brewery_id = p_brewery) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery,
    case when p_kind = 'staff' then 'invite_staff' else 'invite_customer_user' end, p_request_id,
    jsonb_build_object('email', v_email, 'role', p_role, 'customer', p_customer));
  if v_replay is null then
    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is not null and ((p_kind = 'staff' and exists (select 1 from public.brewery_users where brewery_id = p_brewery and user_id = v_user))
      or (p_kind = 'customer' and exists (select 1 from public.customer_users where customer_id = p_customer and user_id = v_user))) then
      raise exception 'membership already exists' using errcode = 'MG409';
    end if;
    update private.invite_requests set state = 'failed', last_error = 'Consent invitation expired'
      where brewery_id = p_brewery and email = v_email and state = 'pending_consent' and consent_expires_at <= now();
    update private.invite_requests set state = 'failed', last_error = 'Invitation expired before Auth; replaced by a new request'
      where brewery_id = p_brewery and email = v_email and state = 'pending_auth'
        and created_at < now() - interval '15 minutes';
    begin
      insert into private.invite_requests(brewery_id, actor_id, email, role, customer_id, kind, request_id, auth_user_id, state, consent_expires_at)
      values(p_brewery, auth.uid(), v_email, p_role, p_customer, p_kind, p_request_id, v_user,
        case when v_user is null then 'pending_auth' else 'pending_consent' end,
        case when v_user is not null then now() + interval '7 days' end) returning * into v_row;
    exception when unique_violation then raise exception 'invitation already requested' using errcode = 'MG409'; end;
    perform private.complete_command_request(p_request_id, jsonb_build_object('inviteId', v_row.id));
  else
    select * into v_row from private.invite_requests where id = (v_replay->>'inviteId')::uuid and actor_id = auth.uid();
  end if;
  return jsonb_build_object('id', v_row.id, 'email', v_row.email, 'authToken', v_row.auth_token,
    'userId', v_row.auth_user_id, 'state', v_row.state);
end $$;

create or replace function complete_invite_membership(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests;
begin
  select * into v_row from private.invite_requests where request_id = p_request_id and actor_id = auth.uid() for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_row.brewery_id, private.invite_roles(v_row.kind));
  if v_row.state = 'complete' then return jsonb_build_object('userId', v_row.auth_user_id); end if;
  -- The consent expiry marks a consent-flow row for life; its state later moves to failed or revoked.
  if v_row.consent_expires_at is not null then raise exception 'invitation requires recipient consent'; end if;
  if v_row.auth_user_id is null then raise exception 'invitation is awaiting Auth'; end if;
  perform private.grant_invite_membership(v_row, v_row.auth_user_id);
  return jsonb_build_object('userId', v_row.auth_user_id);
exception when unique_violation then raise exception 'membership already exists' using errcode = 'MG409';
end $$;

create or replace function record_invite_failure(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests;
begin
  select * into v_row from private.invite_requests where request_id = p_request_id and actor_id = auth.uid() for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(v_row.brewery_id, private.invite_roles(v_row.kind));
  update private.invite_requests set last_error = 'Invitation interrupted; retry this request',
    state = case when auth_user_id is null then 'failed' else 'pending_membership' end
    where id = v_row.id and state not in ('complete','pending_consent','revoked');
end $$;

create or replace function public.accept_account_invitation(p_invite uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests; v_result jsonb;
begin
  select i.* into v_row from private.invite_requests i join auth.users u on u.id = i.auth_user_id
    where i.id = p_invite and i.auth_user_id = auth.uid() and lower(u.email) = i.email
      and u.email_confirmed_at is not null and i.consent_expires_at is not null for update of i;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  v_result := private.claim_command_request_for(auth.uid(), null, 'accept_account_invitation', p_request_id,
    jsonb_build_object('inviteId', p_invite));
  if v_result is not null then return v_result; end if;
  if v_row.state = 'complete' then raise exception 'invitation already accepted' using errcode = 'MG409'; end if;
  if v_row.state <> 'pending_consent' or v_row.consent_expires_at <= now() then
    raise exception 'invitation expired or revoked';
  end if;
  -- Lock the inviter membership against a concurrent removal or role change.
  perform 1 from public.brewery_users where brewery_id = v_row.brewery_id and user_id = v_row.actor_id
    and role = any(private.invite_roles(v_row.kind)) for share;
  if not found then raise exception 'inviter no longer has permission' using errcode = '42501'; end if;
  perform private.grant_invite_membership(v_row, auth.uid());
  v_result := jsonb_build_object('breweryId', v_row.brewery_id, 'kind', v_row.kind, 'customerId', v_row.customer_id);
  perform private.complete_command_request_for(auth.uid(), p_request_id, v_result);
  return v_result;
exception when unique_violation then raise exception 'membership already exists' using errcode = 'MG409';
end $$;

create or replace function public.revoke_account_invitation(p_brewery uuid, p_invite uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests; v_result jsonb;
begin
  select * into v_row from private.invite_requests where id = p_invite and brewery_id = p_brewery for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(p_brewery, private.invite_roles(v_row.kind));
  v_result := private.claim_command_request(p_brewery, 'revoke_account_invitation', p_request_id, jsonb_build_object('inviteId', p_invite));
  if v_result is not null then return v_result; end if;
  if v_row.state <> 'pending_consent' then raise exception 'invitation is not pending consent'; end if;
  update private.invite_requests set state = 'revoked' where id = p_invite;
  v_result := jsonb_build_object('inviteId', p_invite);
  perform private.complete_command_request(p_request_id, v_result);
  return v_result;
end $$;

-- #1204: Team lists the brewery's pending staff invitations, and an admin can
-- resend one. Cancel reuses revoke_account_invitation.
-- Pending means an existing-account invitation awaiting consent and not yet
-- expired: the only invitation a recipient can still accept. A new-account
-- invitation grants membership as soon as Auth creates the account, so it is
-- on the roster, not here.

-- Admin only, like inviting staff. A caller without Admin gets no rows,
-- the same filter list_team_members applies.
create function public.list_pending_invitations(p_brewery uuid)
returns table(id uuid, email text, role public.staff_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.email, i.role, i.created_at
    from private.invite_requests i
    where i.brewery_id = p_brewery and i.kind = 'staff'
      and i.state = 'pending_consent' and i.consent_expires_at > now()
      and private.request_scope_allows(p_brewery)
      and exists (select 1 from public.brewery_users me where me.brewery_id = p_brewery and me.user_id = auth.uid()
                    and me.roles && private.invite_roles('staff'))
    order by i.created_at, i.id;
$$;
revoke all on function public.list_pending_invitations(uuid) from public, anon;
grant execute on function public.list_pending_invitations(uuid) to authenticated, service_role;

-- Resend retires the pending invitation and issues a new one for the same
-- email, role and account, with a fresh seven-day consent window. The caller
-- becomes the inviter, so acceptance checks the caller's permission.
-- Role checks and replay follow revoke_account_invitation.
create function public.resend_account_invitation(p_brewery uuid, p_invite uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests; v_id uuid; v_result jsonb;
begin
  select * into v_row from private.invite_requests where id = p_invite and brewery_id = p_brewery for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(p_brewery, private.invite_roles(v_row.kind));
  v_result := private.claim_command_request(p_brewery, 'resend_account_invitation', p_request_id, jsonb_build_object('inviteId', p_invite));
  if v_result is not null then return v_result; end if;
  if v_row.state <> 'pending_consent' then raise exception 'invitation is not pending consent'; end if;
  update private.invite_requests set state = 'revoked' where id = p_invite;
  insert into private.invite_requests(brewery_id, actor_id, email, role, customer_id, kind, request_id, auth_user_id, state, consent_expires_at)
    values (v_row.brewery_id, auth.uid(), v_row.email, v_row.role, v_row.customer_id, v_row.kind, p_request_id,
      v_row.auth_user_id, 'pending_consent', now() + interval '7 days')
    returning id into v_id;
  v_result := jsonb_build_object('inviteId', v_id);
  perform private.complete_command_request(p_request_id, v_result);
  return v_result;
end $$;
revoke all on function public.resend_account_invitation(uuid, uuid, uuid) from public, anon;
grant execute on function public.resend_account_invitation(uuid, uuid, uuid) to authenticated;

-- Team lists a new-account invitee under Pending invitations until they first
-- sign in. invite_staff adds the membership as soon as Auth sends the email, so
-- membership alone cannot tell an invitee from a member. "Invited and never
-- signed in" can; Auth sets last_sign_in_at when the invite link is opened.
-- The return type changes, so the function is dropped and recreated.
drop function public.list_team_members(uuid);
create function public.list_team_members(p_brewery uuid)
returns table(user_id uuid, email text, name text, roles public.staff_role[], created_at timestamptz, invited boolean)
language sql stable security definer set search_path = '' as $$
  select bu.user_id, u.email::text,
    private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,u.id),
    bu.roles, bu.created_at,
    u.invited_at is not null and u.last_sign_in_at is null
  from public.brewery_users bu
  join auth.users u on u.id = bu.user_id
  where bu.brewery_id = p_brewery
    and private.request_scope_allows(p_brewery)
    and exists (
      select 1 from public.brewery_users me
      where me.brewery_id = p_brewery and me.user_id = auth.uid()
        and me.roles && array['admin','sales','warehouse']::public.staff_role[]
    )
  order by u.email;
$$;
revoke all on function public.list_team_members(uuid) from public, anon;
grant execute on function public.list_team_members(uuid) to authenticated, service_role;

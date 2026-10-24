-- #1265: expose the existing Auth profile name for presentation only.
-- Keep the roster's tenant, request-scope, role and execute gates unchanged.
drop function public.list_team_members(uuid);
create function public.list_team_members(p_brewery uuid)
returns table(user_id uuid, email text, name text, roles public.staff_role[], created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select bu.user_id, u.email::text,
    coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), u.email::text),
    bu.roles, bu.created_at
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
revoke execute on function public.list_team_members(uuid) from public, anon;
grant execute on function public.list_team_members(uuid) to authenticated, service_role;

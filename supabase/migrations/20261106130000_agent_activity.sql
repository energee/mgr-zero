-- The Admin's list of what models did. A function, because an agent's name lives in
-- auth.oauth_clients, which no tenant role can read. plpgsql, so a problem with that
-- table fails this call and never a deploy. docs/plans/agent-access.md, Phase 4.
create function public.list_agent_sessions(p_brewery uuid, p_session uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin']::public.staff_role[]);
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t."lastSeenAt" desc), '[]'::jsonb) from (
      select s.id, s.client_id as "clientId", c.client_name as "clientName", u.email as person, s.last_seen_at as "lastSeenAt",
        (select count(*) from public.agent_session_steps st where st.session_id = s.id) as steps,
        (select count(*) from public.agent_session_steps st where st.session_id = s.id and st.outcome <> 'ok') as problems,
        (select count(*) from public.agent_session_notes n where n.session_id = s.id) as notes
      from public.agent_sessions s
      join auth.users u on u.id = s.actor_id
      left join auth.oauth_clients c on c.id::text = s.client_id
      where s.brewery_id = p_brewery and (p_session is null or s.id = p_session)
      order by s.last_seen_at desc
      -- ponytail: the latest 100, with no paging; add it when an Admin needs older sessions.
      limit 100
    ) t);
end $$;

revoke all on function public.list_agent_sessions(uuid, uuid) from public, anon;
grant execute on function public.list_agent_sessions(uuid, uuid) to authenticated;

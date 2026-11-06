-- The weekly friction report. It lands in a public issue, so it reads only names, codes,
-- paths and counts, and never a note or a proposal's input. plpgsql, so a problem with
-- auth.oauth_clients fails this call and never a deploy. docs/plans/agent-access.md, Phase 5.
create function public.agent_friction_report() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz := now() - interval '7 days';
begin
  return jsonb_build_object(
    'operations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select coalesce(st.operation, st.tool) as name, count(*) as calls,
        count(*) filter (where st.outcome = 'refused') as refused,
        count(*) filter (where st.outcome = 'failed') as failed
      from public.agent_session_steps st where st.created_at > v_since
      group by 1 order by count(*) filter (where st.outcome <> 'ok') desc, count(*) desc limit 30) t),
    'errors', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select coalesce(st.operation, st.tool) as name, st.error_code as code, count(*) as count
      from public.agent_session_steps st where st.created_at > v_since and st.error_code is not null
      group by 1, 2 order by count(*) desc limit 20) t),
    'paths', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select coalesce(st.operation, st.tool) as name, st.input_path as path, count(*) as count
      from public.agent_session_steps st where st.created_at > v_since and st.input_path is not null
      group by 1, 2 order by count(*) desc limit 20) t),
    'proposals', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select case when p.status = 'pending' and p.expires_at <= now() then 'expired' else p.status end as status, count(*) as count
      from public.agent_proposals p where p.created_at > v_since group by 1 order by 1) t),
    'clients', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select s.client_id as "clientId", c.client_name as "clientName", count(*) as sessions
      from public.agent_sessions s left join auth.oauth_clients c on c.id::text = s.client_id
      where s.last_seen_at > v_since group by 1, 2 order by count(*) desc limit 20) t));
end $$;

revoke all on function public.agent_friction_report() from public, anon, authenticated;
grant execute on function public.agent_friction_report() to service_role;

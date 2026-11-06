-- The Admin switch for outside agents, off until an Admin turns it on. The
-- guards that read this column are in 20261105152731_agent_token_guards.sql.
create function public.set_brewery_agents_enabled(p_brewery uuid, p_enabled boolean, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_enabled boolean;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_brewery_agents_enabled', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'enabled', p_enabled));
  if v_replay is not null then return v_replay; end if;
  update public.breweries set agents_enabled = p_enabled where id = p_brewery returning agents_enabled into v_enabled;
  return private.complete_command_request(p_request_id, jsonb_build_object('enabled', v_enabled));
end $$;
revoke all on function public.set_brewery_agents_enabled(uuid, boolean, uuid) from public, anon;
grant execute on function public.set_brewery_agents_enabled(uuid, boolean, uuid) to authenticated;

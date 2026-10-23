-- get_chat_history gains p_recent_turns (#1169). When it is set, the RPC
-- returns only the newest p_recent_turns text turns (user and assistant rows),
-- oldest first. Ask MGR's drawer setup passes it, so restoring a long
-- conversation stays inside the 15 s setup timeout (#1105). Result rows have
-- no content, and the drawer never showed them.
--
-- When it is null (the default), the RPC returns every message, result rows
-- included, exactly as before. The chat route still relies on that.
--
-- A new argument changes the signature, so the old function is dropped first.
-- Dropping the function also drops its grants; they are restored as before.

drop function public.get_chat_history(uuid, uuid);

create function public.get_chat_history (
  p_brewery      uuid,
  p_conversation uuid,
  p_recent_turns integer default null
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
declare v_actor uuid := private.assert_chat_conversation(p_brewery,p_conversation); v_conversation jsonb;
begin
  select jsonb_build_object('id',id,'title',title,'created_at',created_at,'updated_at',updated_at)
    into v_conversation from private.chat_conversations
    where id=p_conversation and brewery_id=p_brewery and actor_id=v_actor;
  -- LIMIT null means no limit.
  return jsonb_build_object('conversation',v_conversation,'messages',coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'role',role,'content',content,'result',result,'request_id',request_id,'created_at',created_at)
      order by created_at,id)
    from (select * from private.chat_messages
      where conversation_id=p_conversation and brewery_id=p_brewery and actor_id=v_actor
        and (p_recent_turns is null or role<>'result')
      order by created_at desc,id desc
      limit p_recent_turns) newest),'[]'::jsonb));
end $function$;

revoke all on function public.get_chat_history(uuid, uuid, integer) from public, anon;
grant execute on function public.get_chat_history(uuid, uuid, integer) to authenticated, postgres, service_role;

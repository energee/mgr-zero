-- #1659: Consent names the Slack person and workspace, with stable ids beside
-- their editable display names. Only the service can record Slack profile data.
-- Legacy pending proofs have no display identity and must be restarted in Home.
alter table public.chat_user_links add column external_display_name text;
drop function public.issue_chat_link_proof(uuid,text,text);

create or replace function issue_chat_link_proof(p_installation uuid, p_external_user_id text, p_proof_hash text,p_external_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.chat_installations; l public.chat_user_links; v_id uuid; v_exp timestamptz := now() + interval '10 minutes';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  if nullif(btrim(p_external_display_name),'') is null then raise exception 'Slack display name required'; end if;
  select * into i from public.chat_installations where id = p_installation;
  if not found then raise exception 'installation not found'; end if;
  if i.state <> 'active' then raise exception 'installation is not active'; end if;
  select * into l from public.chat_user_links
    where installation_id = p_installation and external_user_id = p_external_user_id for update;
  if found and l.state = 'active' then raise exception 'external user already linked'; end if;
  if found then
    update public.chat_user_links
      set external_display_name=btrim(p_external_display_name), state = 'pending', user_id = null, proof_hash = p_proof_hash, proof_issued_at = now(), proof_expires_at = v_exp,
          proof_consumed_at = null, linked_at = null, disabled_at = null, unlinked_at = null, updated_at = now()
      where id = l.id returning id into v_id;
  else
    insert into public.chat_user_links
      (brewery_id, installation_id, provider, external_user_id, external_display_name, state, proof_hash, proof_issued_at, proof_expires_at)
    values (i.brewery_id, i.id, i.provider, p_external_user_id, btrim(p_external_display_name), 'pending', p_proof_hash, now(), v_exp)
    returning id into v_id;
  end if;
  return jsonb_build_object('link_id', v_id, 'expires_at', v_exp);
end $$;

create or replace function get_chat_link_intent(p_brewery uuid,p_proof_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.assert_staff_read(p_brewery,array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]);
  select jsonb_build_object('brewery',b.name,'mgrIdentity',private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,u.id),
    'slackIdentity',l.external_display_name || ' (' || l.external_user_id || ')','workspace',i.display_label || ' (' || i.external_installation_id || ')','expiresAt',l.proof_expires_at) into v_result
    from public.chat_user_links l join public.chat_installations i on i.id=l.installation_id
    join public.breweries b on b.id=l.brewery_id join auth.users u on u.id=auth.uid()
    where l.brewery_id=p_brewery and l.proof_hash=p_proof_hash and l.state='pending' and l.proof_consumed_at is null
      and nullif(btrim(l.external_display_name),'') is not null and l.proof_expires_at>now() and i.state='active';
  return v_result;
end $$;

create or replace function get_chat_integration_health(p_brewery uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.chat_installations; v_queue jsonb; v_links int;
begin
  perform public.assert_chat_admin(p_brewery);
  select * into i from public.chat_installations where brewery_id=p_brewery and provider='slack'
    order by (state<>'disconnected') desc,created_at desc limit 1;
  select count(*) into v_links from public.chat_user_links l join public.brewery_users bu on bu.user_id=l.user_id and bu.brewery_id=l.brewery_id
    where l.installation_id=i.id and l.state='active';
  select jsonb_object_agg(s.state,coalesce(d.n,0)) into v_queue
    from unnest(array['queued','leased','retrying','sent','updated','suppressed','terminal']) s(state)
    left join (select state,count(*) n from public.notification_deliveries where installation_id=i.id group by state) d using(state);
  return jsonb_build_object('installation',case when i.id is null then null else jsonb_build_object(
    'id',i.id,'workspace',i.display_label,'state',i.state,'scopes',(select coalesce(jsonb_agg(cap.scope),'[]') from jsonb_array_elements_text(case when jsonb_typeof(i.granted_capabilities->'scopes')='array' then i.granted_capabilities->'scopes' else '[]'::jsonb end) cap(scope) where cap.scope in ('chat:write','im:write','groups:read','users:read')),
    'quietStart',i.quiet_hours_start,'quietEnd',i.quiet_hours_end,'timezone',i.quiet_hours_timezone,
    'lastError',case when i.last_failure_code in ('invalid_auth','token_revoked','token_expired','missing_scope','credential_delete_failed','network','ratelimited') then i.last_failure_code when i.last_failure_code is not null then 'provider_error' end) end,
    'linkedCount',v_links,'queue',v_queue,
    'lastCallback',(select max(completed_at) from public.chat_callback_receipts where installation_id=i.id and disposition='processed'),
    'lastDelivery',(select max(sent_at) from public.notification_deliveries where installation_id=i.id),
    'destinations',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'channelId',d.external_destination_id,'state',d.state,'privacy',d.privacy_class,
      'reason',case when d.blocked_reason in ('replaced','installation_disconnected','not_private','archived','bot_not_member','externally_shared','shared') then d.blocked_reason when d.blocked_reason is not null then 'provider_error' end))
      from public.notification_destinations d where d.installation_id=i.id and d.kind='private_channel'),'[]'));
end $$;

revoke all on function public.issue_chat_link_proof(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_chat_link_proof(uuid,text,text,text) to service_role;

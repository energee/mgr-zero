-- #1659: A user-editable name is never an identity without the account email.
create function private.staff_identity_label(p_name text, p_email text, p_user uuid) returns text
language sql immutable set search_path = '' as $$
  select case when nullif(btrim(p_name), '') is not null
    then btrim(p_name) || ' <' || coalesce(nullif(p_email, ''), p_user::text) || '>'
    else coalesce(nullif(p_email, ''), p_user::text, 'staff') end;
$$;
revoke all on function private.staff_identity_label(text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.list_team_members(p_brewery uuid)
returns table(user_id uuid, email text, name text, roles public.staff_role[], created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select bu.user_id, u.email::text,
    private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,u.id),
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

create or replace function public.get_qbo_sync_status(p_brewery uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin','sales']::public.staff_role[]);
  -- Only batches against the brewery's current connection and realm count.
  return jsonb_build_object(
    'latest', (select jsonb_build_object('at',greatest(b.created_at,b.completed_at,b.failed_at,b.superseded_at),
        'operator',private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,b.actor_id),
        'completed',b.completed_at is not null,'superseded',b.superseded_at is not null)
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      left join auth.users u on u.id=b.actor_id
      where b.brewery_id=p_brewery
      order by greatest(b.created_at,b.completed_at,b.failed_at,b.superseded_at) desc,b.request_id desc limit 1),
    'lastSuccess', (select jsonb_build_object('at',b.completed_at,
        'operator',private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,b.actor_id))
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      left join auth.users u on u.id=b.actor_id
      where b.brewery_id=p_brewery and b.completed_at is not null
      order by b.completed_at desc,b.request_id desc limit 1),
    'latestFailure', (select jsonb_build_object('at',b.failed_at,
        'operator',private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,b.actor_id))
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      left join auth.users u on u.id=b.actor_id
      where b.brewery_id=p_brewery and b.failed_at is not null
      order by b.failed_at desc,b.request_id desc limit 1),
    -- The primary key (actor_id, request_id) bounds this read to one operator.
    'retryRequestId', (select b.request_id
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      where b.brewery_id=p_brewery and b.actor_id=v_actor and b.completed_at is null and b.superseded_at is null
      order by b.created_at desc,b.request_id desc limit 1)
  );
end $$;

create or replace function public.list_open_taps(p_brewery uuid, p_location uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('sku_name',s.name,'brand_id',s.brand_id,'brand_name',b.name,
      'opened_by_label',private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,u.id))
    order by t.tap_number nulls last,t.opened_at,t.id),'[]'::jsonb)
    from public.tap_intervals t left join public.skus s on s.id=t.sku_id and s.brewery_id=t.brewery_id
    left join public.brands b on b.id=s.brand_id and b.brewery_id=t.brewery_id
    left join auth.users u on u.id=t.opened_by
    where t.brewery_id=p_brewery and t.location_id=p_location and t.closed_at is null);
end;
$$;

create or replace function public.list_tap_history(p_brewery uuid, p_location uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(
      'opened_by_label',private.staff_identity_label(o.raw_user_meta_data->>'full_name',o.email::text,o.id),
      'closed_by_label',private.staff_identity_label(c.raw_user_meta_data->>'full_name',c.email::text,c.id),
      'sku_name',s.name,'brand_name',b.name) order by t.closed_at desc,t.id),'[]'::jsonb) from
    (select * from public.tap_intervals where brewery_id=p_brewery and location_id=p_location and closed_at is not null order by closed_at desc,id limit 50) t
    left join auth.users o on o.id=t.opened_by left join auth.users c on c.id=t.closed_by
    left join public.skus s on s.id=t.sku_id and s.brewery_id=t.brewery_id left join public.brands b on b.id=s.brand_id and b.brewery_id=t.brewery_id);
end;
$$;

create or replace function private.close_tap(p_brewery uuid,p_interval uuid,p_closing_fill numeric,p_reason text,p_actor uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_row public.tap_intervals; v_closed_by_label text;
begin
  select * into v_row from public.tap_intervals where id=p_interval and brewery_id=p_brewery for update;
  if not found then raise exception 'tap interval not found'; end if;
  if v_row.closed_at is not null then
    select private.staff_identity_label(raw_user_meta_data->>'full_name',email::text,id) into v_closed_by_label from auth.users where id=v_row.closed_by;
    raise exception 'Keg already closed by % at %; refresh the tap board',coalesce(v_closed_by_label,'staff'),v_row.closed_at using errcode='MG409';
  end if;
  update public.tap_intervals set closed_at=now(),closed_by=p_actor,closing_fill=p_closing_fill,close_reason=btrim(p_reason)
    where id=p_interval and brewery_id=p_brewery returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.list_chat_user_links(p_brewery uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.assert_chat_admin(p_brewery);
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',private.staff_identity_label(u.raw_user_meta_data->>'full_name',u.email::text,u.id),
    'roles',bu.roles,'slackIdentity',l.external_user_id,'linkedAt',l.linked_at) order by l.linked_at)
    from public.chat_user_links l join public.chat_installations i on i.id=l.installation_id
    join public.brewery_users bu on bu.user_id=l.user_id and bu.brewery_id=l.brewery_id join auth.users u on u.id=l.user_id
    where l.brewery_id=p_brewery and l.state='active' and i.state<>'disconnected'),'[]');
end $function$;

create or replace function public.portal_availability(p_customer uuid) returns table (sku_id uuid, badge text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select c.brewery_id, c.sale_channel_id from public.customers c
    where c.id = p_customer and c.id in (select public.my_customer_ids())
  ), on_hand as (
    select m.sku_id, sum(m.qty) as qty from public.inventory_movements m
    where m.brewery_id = (select brewery_id from caller) group by 1
  ), allocated as (
    select al.sku_id, sum(al.qty) as qty from public.allocations al
    where al.brewery_id = (select brewery_id from caller) and al.status = 'open' group by 1
  ), availability as (
    select coalesce(o.sku_id, al.sku_id) as sku_id,
      coalesce(o.qty, 0) - coalesce(al.qty, 0) as qty
    from on_hand o full join allocated al on al.sku_id = o.sku_id
  )
  select a.sku_id, case when a.qty <= 0 then 'out' when a.qty < 20 then 'low' else 'in' end
  from availability a
  join public.sku_prices p on p.sku_id=a.sku_id
  join caller c on c.brewery_id=p.brewery_id and c.sale_channel_id=p.sale_channel_id
  where p.active;
$$;

-- Hold current Team authority until commit. Team role/removal commands take
-- the brewery lock first, so two administrators cannot deadlock on each other.
create function private.lock_staff_permission(p_brewery uuid,p_roles public.staff_role[]) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  perform private.assert_request_scope(p_brewery);
  perform 1 from public.brewery_users
    where brewery_id=p_brewery and user_id=v_actor and roles && p_roles for share;
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
  return v_actor;
end $$;
revoke all on function private.lock_staff_permission(uuid,public.staff_role[]) from public,anon,authenticated,service_role;


create or replace function public.update_staff_role(p_brewery uuid, p_user uuid, p_roles public.staff_role[], p_request_id uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_row public.brewery_users;
  v_roles public.staff_role[];
begin
  perform 1 from public.breweries where id=p_brewery for no key update;
  perform private.lock_staff_permission(p_brewery, array['admin']::public.staff_role[]);
  if p_roles is null or cardinality(p_roles) = 0 or array_ndims(p_roles) <> 1
     or array_position(p_roles, null) is not null then
    raise exception 'choose at least one role';
  end if;
  v_roles := array(select distinct r from unnest(p_roles) r order by r);
  v_replay := private.claim_command_request(p_brewery, 'update_staff_role', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'user', p_user, 'roles', to_jsonb(v_roles)));
  if v_replay is not null then return v_replay; end if;
  if not 'admin' = any(v_roles) then perform private.assert_not_last_admin(p_brewery, p_user); end if;
  update public.brewery_users set roles = v_roles
    where brewery_id = p_brewery and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'member not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create or replace function revoke_staff(p_brewery uuid, p_user uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_actor uuid; v_row public.brewery_users;
begin
  perform 1 from public.breweries where id=p_brewery for no key update;
  v_actor := private.lock_staff_permission(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'revoke_staff', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'user', p_user));
  if v_replay is not null then return v_replay; end if;
  if p_user = v_actor then raise exception 'you cannot remove yourself' using errcode = 'P0001'; end if;
  perform private.assert_not_last_admin(p_brewery, p_user);
  delete from public.brewery_users where brewery_id = p_brewery and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'member not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

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
  perform private.lock_staff_permission(p_brewery, private.invite_roles(p_kind));
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
  perform private.lock_staff_permission(v_row.brewery_id, private.invite_roles(v_row.kind));
  if v_row.state = 'complete' then return jsonb_build_object('userId', v_row.auth_user_id); end if;
  -- The consent expiry marks a consent-flow row for life; its state later moves to failed or revoked.
  if v_row.consent_expires_at is not null then raise exception 'invitation requires recipient consent'; end if;
  if v_row.auth_user_id is null then raise exception 'invitation is awaiting Auth'; end if;
  perform private.grant_invite_membership(v_row, v_row.auth_user_id);
  return jsonb_build_object('userId', v_row.auth_user_id);
exception when unique_violation then raise exception 'membership already exists' using errcode = 'MG409';
end $$;

create or replace function public.revoke_account_invitation(p_brewery uuid, p_invite uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests; v_result jsonb;
begin
  select * into v_row from private.invite_requests where id = p_invite and brewery_id = p_brewery for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.lock_staff_permission(p_brewery, private.invite_roles(v_row.kind));
  v_result := private.claim_command_request(p_brewery, 'revoke_account_invitation', p_request_id, jsonb_build_object('inviteId', p_invite));
  if v_result is not null then return v_result; end if;
  if v_row.state <> 'pending_consent' then raise exception 'invitation is not pending consent'; end if;
  update private.invite_requests set state = 'revoked' where id = p_invite;
  v_result := jsonb_build_object('inviteId', p_invite);
  perform private.complete_command_request(p_request_id, v_result);
  return v_result;
end $$;

create or replace function public.resend_account_invitation(p_brewery uuid, p_invite uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row private.invite_requests; v_id uuid; v_result jsonb;
begin
  select * into v_row from private.invite_requests where id = p_invite and brewery_id = p_brewery for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.lock_staff_permission(p_brewery, private.invite_roles(v_row.kind));
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

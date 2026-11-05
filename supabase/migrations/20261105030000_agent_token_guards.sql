-- Agent tokens: an OAuth access token is an ordinary authenticated JWT, so it
-- reaches every granted RPC and every RLS policy. These guards hold whichever
-- way the token arrives, including straight to the Supabase API.
-- docs/plans/agent-access.md, Phase 1.

alter table public.breweries add column agents_enabled boolean not null default false;

-- An agent reads and proposes; a person's session commits. The triggers cover
-- the command ledger, which every write inserts into or, on a retry, updates,
-- and the two tables written outside it. tests/agent-access.test.ts pins the
-- list of functions reviewed against this.
create function private.refuse_agent_token() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.jwt() ->> 'client_id' is not null then
    raise exception 'agent tokens cannot commit' using errcode = '42501';
  end if;
  return null;
end $$;
revoke all on function private.refuse_agent_token() from public, anon, authenticated, service_role;

create trigger refuse_agent_token before insert or update on private.command_requests
  for each statement execute function private.refuse_agent_token();
create trigger refuse_agent_token before insert or update on private.invite_requests
  for each statement execute function private.refuse_agent_token();
create trigger refuse_agent_token before insert on public.notification_occurrences
  for each statement execute function private.refuse_agent_token();

-- Supabase Auth accepts any access token on its own endpoints, so an agent could
-- set the person's password and sign in as them. No trigger sees that, because
-- Auth writes as its own role. This hook gives an agent token a session id that
-- does not exist: Auth refuses it, and PostgREST never looks. The real session
-- moves to agent_session_id. Auth runs this for every token it issues, so a
-- failure here fails every sign-in; it touches nothing but the JSON.
create function private.agent_access_token_hook(event jsonb) returns jsonb
language sql set search_path = '' as $$
  select case when event -> 'claims' ? 'client_id'
    then jsonb_set(event, '{claims}', (event -> 'claims') || jsonb_build_object(
      'agent_session_id', event -> 'claims' -> 'session_id',
      'session_id', gen_random_uuid()))
    else event end
$$;
revoke all on function private.agent_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.agent_access_token_hook(jsonb) to supabase_auth_admin;

-- An access token keeps a valid signature after its grant is revoked, but revoke
-- deletes the session. A token with no agent_session_id is not live.
create function public.agent_session_is_live() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.sessions where id = (auth.jwt() ->> 'agent_session_id')::uuid)
$$;
revoke all on function public.agent_session_is_live() from public, anon;
grant execute on function public.agent_session_is_live() to authenticated;

-- The RLS helpers and assert_staff call this, so it stops an agent's reads.
CREATE OR REPLACE FUNCTION private.request_scope_allows(p_brewery uuid, p_customer uuid DEFAULT NULL::uuid, p_allow_unspecified_customer boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_headers jsonb; v_actor uuid; v_brewery uuid; v_customer uuid;
begin
  begin
    -- An agent token needs its brewery's switch on and its session alive; the
    -- token itself outlives a revoked grant until it expires. Every RLS read
    -- comes through here, and parsing the claims tripled this function's cost,
    -- so a plain text match keeps ordinary sessions off that path.
    if position('"client_id"' in current_setting('request.jwt.claims', true)) > 0 then
      if auth.jwt() ->> 'client_id' is not null and not (
        exists (select 1 from public.breweries where id = p_brewery and agents_enabled)
        and public.agent_session_is_live()
      ) then return false; end if;
    end if;
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    if v_headers is null then return true; end if;
    if jsonb_typeof(v_headers) <> 'object' then return false; end if;
    if v_headers ? 'x-mgr-actor-id' then
      v_actor := (v_headers ->> 'x-mgr-actor-id')::uuid;
      if v_actor is null or v_actor is distinct from auth.uid() then return false; end if;
    end if;
    if v_headers ? 'x-mgr-brewery-id' then
      v_brewery := (v_headers ->> 'x-mgr-brewery-id')::uuid;
      if v_brewery is null or v_brewery is distinct from p_brewery then return false; end if;
    end if;
    if v_headers ? 'x-mgr-customer-id' then
      v_customer := (v_headers ->> 'x-mgr-customer-id')::uuid;
      if v_customer is null or (p_customer is null and not p_allow_unspecified_customer) or (p_customer is not null and v_customer is distinct from p_customer) then return false; end if;
    end if;
    return true;
  exception when others then
    return false;
  end;
end $function$;

-- A revoked agent cannot spend its person's request budget. A live one can: Q9 in
-- the plan keeps one budget per person until usage says otherwise.
CREATE OR REPLACE FUNCTION public.consume_command_admission()
 RETURNS TABLE(allowed boolean, retry_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_window interval := interval '60 seconds';
  v_limit constant integer := 120;
  v_row private.command_admissions%rowtype;
begin
  if v_user is null then raise insufficient_privilege using message = 'authentication required'; end if;
  if auth.jwt() ? 'client_id' and not public.agent_session_is_live() then
    raise insufficient_privilege using message = 'agent session ended';
  end if;
  insert into private.command_admissions(user_id, window_started_at, request_count)
  values (v_user, v_now, 1)
  on conflict (user_id) do update set
    window_started_at = case when private.command_admissions.window_started_at + v_window <= v_now then v_now else private.command_admissions.window_started_at end,
    request_count = case when private.command_admissions.window_started_at + v_window <= v_now then 1 else private.command_admissions.request_count + 1 end
  returning * into v_row;
  allowed := v_row.request_count <= v_limit;
  retry_after := case when allowed then 0 else greatest(1, ceil(extract(epoch from v_row.window_started_at + v_window - v_now))::integer) end;
  return next;
end $function$;

-- This order check read brewery_users directly, so it missed the scope check.
CREATE OR REPLACE FUNCTION private.assert_order_staff(p_order uuid, p_roles staff_role[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid;
begin
  select o.brewery_id into v_brewery
  from public.orders o
  where o.id = p_order
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && p_roles
        and private.request_scope_allows(o.brewery_id)
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_brewery;
end $function$;

-- This reads the person's invitations across breweries, which an agent has no use for.
CREATE OR REPLACE FUNCTION public.list_my_invitations()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'breweryName', b.name,
    'kind', i.kind, 'role', i.role, 'customerName', c.name, 'expiresAt', i.consent_expires_at)
    order by i.created_at, i.id), '[]'::jsonb)
  from private.invite_requests i join public.breweries b on b.id = i.brewery_id
  join auth.users u on u.id = i.auth_user_id
  left join public.customers c on c.id = i.customer_id and c.brewery_id = i.brewery_id
  where i.auth_user_id = auth.uid() and lower(u.email) = i.email and u.email_confirmed_at is not null
    and i.state = 'pending_consent' and i.consent_expires_at > now()
    and auth.jwt() ->> 'client_id' is null;
$function$;

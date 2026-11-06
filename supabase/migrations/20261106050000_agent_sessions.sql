-- What models did in MGR, for the Admin activity page and the friction report. A step
-- holds names and codes, never input or output values, because those are tenant data.
-- A null client_id means Ask MGR. docs/plans/agent-access.md, Phase 4.
create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references public.breweries(id),
  actor_id uuid not null references auth.users(id),
  client_id text,
  conversation_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index agent_sessions_brewery_seen on public.agent_sessions (brewery_id, last_seen_at desc);
create index agent_sessions_actor_seen on public.agent_sessions (actor_id, last_seen_at desc);

create table public.agent_session_steps (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references public.breweries(id),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  -- A token can call record_agent_step itself, so these checks keep free text out.
  tool text not null check (tool ~ '^[a-z0-9_]{1,64}$'),
  operation text check (operation ~ '^[a-z0-9_]{1,64}$'),
  kind text check (kind in ('query', 'command')),
  outcome text not null check (outcome in ('ok', 'refused', 'failed')),
  error_code text check (error_code ~ '^[A-Za-z0-9_]{1,64}$'),
  input_path text check (char_length(input_path) <= 200),
  proposal_id uuid references public.agent_proposals(id) on delete set null,
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  created_at timestamptz not null default now()
);
create index agent_session_steps_brewery on public.agent_session_steps (brewery_id, created_at desc);
create index agent_session_steps_session on public.agent_session_steps (session_id, created_at);
create index agent_session_steps_proposal on public.agent_session_steps (proposal_id);

-- Written by a model, so it is untrusted text. It is never exported, and a screen
-- always shows it labelled with the client.
create table public.agent_session_notes (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references public.breweries(id),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  kind text not null check (kind in ('friction', 'handoff')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index agent_session_notes_brewery on public.agent_session_notes (brewery_id, created_at desc);
create index agent_session_notes_session on public.agent_session_notes (session_id, created_at);

alter table public.agent_sessions enable row level security;
alter table public.agent_session_steps enable row level security;
alter table public.agent_session_notes enable row level security;
create policy admin_read on public.agent_sessions for select to authenticated
  using (public.has_staff_role(brewery_id, array['admin']::public.staff_role[]));
create policy admin_read on public.agent_session_steps for select to authenticated
  using (public.has_staff_role(brewery_id, array['admin']::public.staff_role[]));
create policy admin_read on public.agent_session_notes for select to authenticated
  using (public.has_staff_role(brewery_id, array['admin']::public.staff_role[]));
revoke all on public.agent_sessions, public.agent_session_steps, public.agent_session_notes from anon, authenticated;
grant select on public.agent_sessions, public.agent_session_steps, public.agent_session_notes to authenticated;

-- A conversation is one session. Otherwise a person and client share one until 30
-- minutes pass with no step.
-- ponytail: two parallel first calls can open two sessions; add a unique key if that misleads.
create function private.current_agent_session(p_brewery uuid, p_conversation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_client text := auth.jwt() ->> 'client_id'; v_session uuid;
begin
  perform private.assert_staff(p_brewery, array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]);
  update public.agent_sessions s set last_seen_at = now()
    where s.id = (
      select c.id from public.agent_sessions c
      where c.brewery_id = p_brewery and c.actor_id = auth.uid() and c.client_id is not distinct from v_client
        and case when p_conversation is null then c.last_seen_at > now() - interval '30 minutes'
                 else c.conversation_id = p_conversation end
      order by c.last_seen_at desc limit 1)
    returning s.id into v_session;
  if found then return v_session; end if;
  insert into public.agent_sessions (brewery_id, actor_id, client_id, conversation_id)
    values (p_brewery, auth.uid(), v_client, p_conversation) returning id into v_session;
  return v_session;
end $$;

create function public.record_agent_step(p_brewery uuid, p_tool text, p_outcome text, p_duration_ms integer,
  p_conversation uuid default null, p_operation text default null, p_kind text default null,
  p_error_code text default null, p_input_path text default null, p_proposal uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_proposal is not null and not exists (
    select 1 from public.agent_proposals p
    where p.id = p_proposal and p.brewery_id = p_brewery and p.actor_id = auth.uid()
  ) then raise exception 'a step can link only your own proposal' using errcode = '42501'; end if;
  insert into public.agent_session_steps (brewery_id, session_id, tool, operation, kind, outcome, error_code, input_path, proposal_id, duration_ms)
    values (p_brewery, private.current_agent_session(p_brewery, p_conversation), p_tool, p_operation, p_kind, p_outcome, p_error_code, p_input_path, p_proposal, p_duration_ms);
end $$;

create function public.leave_agent_note(p_brewery uuid, p_kind text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.jwt() ->> 'client_id' is null then raise exception 'only an agent leaves a note' using errcode = '42501'; end if;
  insert into public.agent_session_notes (brewery_id, session_id, kind, body)
    values (p_brewery, private.current_agent_session(p_brewery, null), p_kind, p_body);
end $$;

-- Q6: sessions, their steps and notes, and proposals all last 90 days. Steps and notes
-- go by their own age, because a session in steady use would otherwise keep them forever.
create function public.prune_agent_history() returns integer
language sql security definer set search_path = '' as $$
  with steps as (
    delete from public.agent_session_steps where created_at < now() - interval '90 days' returning 1
  ), notes as (
    delete from public.agent_session_notes where created_at < now() - interval '90 days' returning 1
  ), sessions as (
    delete from public.agent_sessions where last_seen_at < now() - interval '90 days' returning 1
  ), proposals as (
    delete from public.agent_proposals where expires_at < now() - interval '90 days' returning 1
  )
  select ((select count(*) from steps) + (select count(*) from notes)
    + (select count(*) from sessions) + (select count(*) from proposals))::int;
$$;

revoke all on function private.current_agent_session(uuid, uuid), public.leave_agent_note(uuid, text, text), public.prune_agent_history(),
  public.record_agent_step(uuid, text, text, integer, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_agent_step(uuid, text, text, integer, uuid, text, text, text, text, uuid),
  public.leave_agent_note(uuid, text, text) to authenticated;
grant execute on function public.prune_agent_history() to service_role;

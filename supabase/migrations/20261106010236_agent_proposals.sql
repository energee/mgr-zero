-- An agent's write waits here until its person approves it. The agent inserts
-- through create_agent_proposal, and only the person's own session moves a
-- proposal on. docs/plans/agent-access.md, Phase 3.
create table public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references public.breweries(id),
  actor_id uuid not null references auth.users(id),
  client_id text not null,
  command text not null,
  input jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'committed', 'failed')),
  failure text,
  request_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index agent_proposals_brewery_actor_status on public.agent_proposals (brewery_id, actor_id, status);

alter table public.agent_proposals enable row level security;
create policy actor_read on public.agent_proposals for select to authenticated
  using (actor_id = (select auth.uid()) and brewery_id in (select public.my_brewery_ids()));
revoke all on public.agent_proposals from anon, authenticated;
grant select on public.agent_proposals to authenticated;

-- An agent token may create a proposal, but moving one on is the person's alone.
create trigger refuse_agent_token before update on public.agent_proposals
  for each statement execute function private.refuse_agent_token();

create function public.create_agent_proposal(p_brewery uuid, p_command text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_client text := auth.jwt() ->> 'client_id'; v_row public.agent_proposals;
begin
  if v_client is null then raise exception 'only an agent proposes' using errcode = '42501'; end if;
  perform private.assert_staff(p_brewery, array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]);
  insert into public.agent_proposals (brewery_id, actor_id, client_id, command, input)
    values (p_brewery, auth.uid(), v_client, p_command, p_input) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'expiresAt', v_row.expires_at);
end $$;

-- pending to approved is the one atomic step, so two approvals cannot both run it.
-- The brewery must match, because the command runs in the person's active brewery.
create function public.begin_agent_proposal(p_brewery uuid, p_proposal uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.agent_proposals;
begin
  update public.agent_proposals set status = 'approved'
    where id = p_proposal and brewery_id = p_brewery and actor_id = auth.uid()
      and status = 'pending' and expires_at > now()
    returning * into v_row;
  if not found then raise exception 'This proposal can no longer be approved.' using errcode = 'MG409'; end if;
  return jsonb_build_object('command', v_row.command, 'input', v_row.input, 'requestId', v_row.request_id);
end $$;

create function public.finish_agent_proposal(p_proposal uuid, p_status text, p_failure text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_proposals set status = p_status, failure = p_failure
    where id = p_proposal and actor_id = auth.uid() and status = 'approved' and p_status in ('committed', 'failed');
  if not found then raise exception 'This proposal is not being approved.' using errcode = 'MG409'; end if;
end $$;

create function public.decline_agent_proposal(p_proposal uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_proposals set status = 'declined'
    where id = p_proposal and actor_id = auth.uid() and status = 'pending';
  if not found then raise exception 'This proposal can no longer be declined.' using errcode = 'MG409'; end if;
end $$;

revoke all on function public.create_agent_proposal(uuid, text, jsonb), public.begin_agent_proposal(uuid, uuid),
  public.finish_agent_proposal(uuid, text, text), public.decline_agent_proposal(uuid) from public, anon;
grant execute on function public.create_agent_proposal(uuid, text, jsonb), public.begin_agent_proposal(uuid, uuid),
  public.finish_agent_proposal(uuid, text, text), public.decline_agent_proposal(uuid) to authenticated;

-- #619 efficiency follow-up: reschedule rejects a missing date before claiming
-- the request or taking the cellar lock, plan updates key on (brewery_id, id)
-- like the lock that precedes them, and partial indexes cover the open-plan
-- filters the requirement views and buyer schedule now apply.

create or replace function public.cancel_batch(p_brewery uuid, p_batch uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.batches;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'cancel_batch', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_batch(p_brewery, p_batch);
  update public.batches set cancelled_at = now() where brewery_id = p_brewery and id = p_batch returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.cancel_batch(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.cancel_batch(uuid, uuid, uuid) to authenticated;

create or replace function public.reschedule_batch(p_brewery uuid, p_batch uuid, p_planned_on date, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.batches;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  if p_planned_on is null then raise exception 'planned date is required'; end if;
  v_replay := private.claim_command_request(p_brewery, 'reschedule_batch', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'batch', p_batch, 'planned_on', p_planned_on));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_batch(p_brewery, p_batch);
  update public.batches set planned_on = p_planned_on where brewery_id = p_brewery and id = p_batch returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.reschedule_batch(uuid, uuid, date, uuid) from public, anon, service_role;
grant execute on function public.reschedule_batch(uuid, uuid, date, uuid) to authenticated;

create or replace function public.cancel_packaging_run(p_brewery uuid, p_run uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'cancel_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_packaging_run(p_brewery, p_run);
  update public.packaging_runs set cancelled_at = now() where brewery_id = p_brewery and id = p_run returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.cancel_packaging_run(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.cancel_packaging_run(uuid, uuid, uuid) to authenticated;

create or replace function public.reschedule_packaging_run(p_brewery uuid, p_run uuid, p_planned_on date, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  if p_planned_on is null then raise exception 'planned date is required'; end if;
  v_replay := private.claim_command_request(p_brewery, 'reschedule_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'planned_on', p_planned_on));
  if v_replay is not null then return v_replay; end if;
  perform private.lock_unstarted_packaging_run(p_brewery, p_run);
  update public.packaging_runs set planned_on = p_planned_on where brewery_id = p_brewery and id = p_run returning * into v_row;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.reschedule_packaging_run(uuid, uuid, date, uuid) from public, anon, service_role;
grant execute on function public.reschedule_packaging_run(uuid, uuid, date, uuid) to authenticated;

create index batches_unbrewed_idx on public.batches (brewery_id, planned_on)
  where brewed_on is null and cancelled_at is null;
create index packaging_runs_open_idx on public.packaging_runs (brewery_id, planned_on)
  where closed_at is null and cancelled_at is null;

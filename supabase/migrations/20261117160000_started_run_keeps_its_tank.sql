-- A started packaging run keeps its tank and its start time.
-- update_packaging_run guarded only cancelled and closed runs, so a started
-- run could be pointed at a different tank, or have started_at rewritten, by
-- an API caller or a stale second tab. The run page never offers either once
-- started. Planned outputs stay editable as before.
-- Copied from: 20260928040000_unstarted_plans.sql, public.update_packaging_run.
create or replace function public.update_packaging_run(
  p_brewery uuid, p_run uuid, p_occupancy uuid, p_outputs jsonb, p_started_at timestamptz, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_run public.packaging_runs;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_packaging_run', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'run', p_run, 'occupancy', p_occupancy,
      'outputs', p_outputs, 'started_at', p_started_at));
  if v_replay is not null then return v_replay; end if;

  perform private.lock_cellar_workflow(p_brewery);

  select * into v_run from public.packaging_runs where id = p_run and brewery_id = p_brewery for update;
  if v_run.id is null then raise exception 'packaging run not found'; end if;
  if v_run.cancelled_at is not null then raise exception 'packaging run is cancelled'; end if;
  if v_run.closed_at is not null then raise exception 'packaging run is closed'; end if;
  -- A started run draws from the tank it started on, from the time it started:
  -- its page shows only the close form, so neither may change afterwards.
  if v_run.started_at is not null
     and (p_started_at is not null or (p_occupancy is not null and p_occupancy is distinct from v_run.occupancy_id)) then
    raise exception 'packaging run already started; its tank and start time are fixed';
  end if;

  if p_occupancy is not null then
    perform private.assert_open_occupancy(p_brewery, p_occupancy);
    -- The brand trigger fires on this update and has the last word.
    update public.packaging_runs set occupancy_id = p_occupancy where id = p_run returning * into v_run;
  end if;

  -- Translate the check constraint into the sentence a brewer would say. The
  -- constraint still stands behind this for anything that writes directly.
  if p_started_at is not null then
    if v_run.occupancy_id is null then
      raise exception 'pick the tank this run draws from before starting it';
    end if;
    -- Re-check the tank that is actually attached (v_run was re-read above if
    -- one was passed in now): a run may have picked its occupancy days ago and
    -- that occupancy may have been emptied since. Nothing else would catch it
    -- -- the trigger only fires when occupancy_id itself is written, and the
    -- check constraint asks only that the column be non-null.
    perform private.assert_open_occupancy(p_brewery, v_run.occupancy_id);
    update public.packaging_runs set started_at = p_started_at where id = p_run returning * into v_run;
  end if;

  if p_outputs is not null then
    perform private.replace_packaging_run_outputs(p_brewery, p_run, v_run.brand_id, p_outputs);
  end if;

  return private.complete_command_request(p_request_id, to_jsonb(v_run));
end $$;

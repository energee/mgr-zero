-- capacity_bbl is numeric(10,3), not numeric(10,2). Reject values that
-- would silently round, including tiny positive inputs that round to zero.
create or replace function public.upsert_vessel(
  p_brewery uuid, p_vessel uuid, p_name text, p_kind public.vessel_kind, p_capacity_bbl numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.vessels;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_vessel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vessel', p_vessel, 'name', p_name, 'kind', p_kind, 'capacity_bbl', p_capacity_bbl));
  if v_replay is not null then return v_replay; end if;
  -- Replay comes first: a new refusal must not mask an earlier committed result.
  if p_capacity_bbl is null or p_capacity_bbl < 0.001 then
    raise exception 'Capacity must be at least 0.001 bbl.';
  end if;
  if p_capacity_bbl > 9999999.999 then
    raise exception 'Capacity must be at most 9,999,999.999 bbl.';
  end if;
  if p_capacity_bbl <> pg_catalog.round(p_capacity_bbl, 3) then
    raise exception 'Use no more than 3 decimal places for capacity.';
  end if;
  if p_vessel is null then
    insert into public.vessels (brewery_id, name, kind, capacity_bbl)
    values (p_brewery, p_name, p_kind, p_capacity_bbl) returning * into v_row;
  else
    update public.vessels set name = p_name, kind = p_kind, capacity_bbl = p_capacity_bbl
    where id = p_vessel and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'vessel not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

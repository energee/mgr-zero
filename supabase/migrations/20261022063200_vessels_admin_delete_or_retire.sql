-- Vessels are admin-managed. upsert_vessel drops the brewer role (body is the
-- baseline's otherwise), and delete_vessel removes one: a vessel that never
-- held beer is deleted; one with occupancy history is retired (active = false)
-- so that history keeps its vessel; one holding beer now is refused.
-- list_vessels hides retired vessels unless asked (lib/commands/production.ts).

create or replace function public.upsert_vessel(
  p_brewery uuid, p_vessel uuid, p_name text, p_kind public.vessel_kind, p_capacity_bbl numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.vessels;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_vessel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vessel', p_vessel, 'name', p_name, 'kind', p_kind, 'capacity_bbl', p_capacity_bbl));
  if v_replay is not null then return v_replay; end if;
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

create function public.delete_vessel(
  p_brewery uuid, p_vessel uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.vessels; v_retired boolean;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_vessel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'vessel', p_vessel));
  if v_replay is not null then return v_replay; end if;
  select v.* into v_row from public.vessels v where v.id = p_vessel and v.brewery_id = p_brewery for update;
  if not found then raise exception 'vessel not found'; end if;
  if exists (select 1 from public.vessel_occupancies where vessel_id = p_vessel and ended_at is null) then
    raise exception 'this vessel holds beer; transfer or complete its batch before deleting it';
  end if;
  v_retired := exists (select 1 from public.vessel_occupancies where vessel_id = p_vessel);
  if v_retired then
    update public.vessels set active = false where id = p_vessel returning * into v_row;
  else
    delete from public.vessels where id = p_vessel;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row) || jsonb_build_object('retired', v_retired));
end $$;

revoke all on function public.delete_vessel(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_vessel(uuid, uuid, uuid) to authenticated;

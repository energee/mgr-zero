-- WF01: packaging operators need their committed receipt without gaining
-- compliance/trace access to the lots table or unrelated lot columns.
create function public.get_packaging_run_lot(p_brewery uuid, p_run uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_closed_at timestamptz;
  v_lot jsonb;
begin
  perform private.assert_staff_read(p_brewery, array['admin', 'brewer', 'warehouse']::public.staff_role[]);
  select r.closed_at into v_closed_at
    from public.packaging_runs r
    where r.brewery_id = p_brewery and r.id = p_run;
  if not found then
    raise exception 'packaging run not found';
  end if;
  if v_closed_at is null then return null; end if;

  select jsonb_build_object('id', l.id, 'code', l.code,
    'packaged_on', l.packaged_on, 'best_by', l.best_by)
    into v_lot
    from public.lots l
    where l.brewery_id = p_brewery and l.packaging_run_id = p_run;
  return v_lot;
end $$;
revoke all on function public.get_packaging_run_lot(uuid, uuid) from public, anon, service_role;
grant execute on function public.get_packaging_run_lot(uuid, uuid) to authenticated;
comment on function public.get_packaging_run_lot(uuid, uuid) is
  'Packaging receipt only: authorized run lot identity and packaging dates; does not expose compliance trace or broaden lots table access.';

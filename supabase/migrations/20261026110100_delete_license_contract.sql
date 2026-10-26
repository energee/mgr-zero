-- Remove mistaken licenses and unused contracts while preserving purchase-order history.
create function public.delete_brewery_state_license(
  p_brewery uuid, p_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_license public.brewery_state_licenses;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_brewery_state_license', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_license from public.brewery_state_licenses where id = p_id and brewery_id = p_brewery for update;
  if not found then raise exception 'license not found'; end if;
  delete from public.brewery_state_licenses where id = p_id and brewery_id = p_brewery;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id));
end $$;

create function public.delete_material_contract(
  p_brewery uuid, p_id uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_contract public.material_contracts;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_material_contract', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_contract from public.material_contracts where id = p_id and brewery_id = p_brewery for update;
  if not found then raise exception 'contract not found'; end if;
  begin
    delete from public.material_contracts where id = p_id and brewery_id = p_brewery;
  exception when foreign_key_violation then
    raise exception 'Contract is on purchase orders. Set an end date instead.' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id));
end $$;

revoke all on function public.delete_brewery_state_license(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_material_contract(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_brewery_state_license(uuid, uuid, uuid) to authenticated;
grant execute on function public.delete_material_contract(uuid, uuid, uuid) to authenticated;

-- A composed format and its contents are one creation. Volume remains derived.
create function public.create_composed_format(p_brewery uuid, p_name text, p_package_type public.package_type, p_components jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_composed_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name, 'package_type', p_package_type, 'components', p_components));
  if v_replay is not null then return v_replay; end if;
  if p_package_type is null or p_components is null or jsonb_typeof(p_components) <> 'array' then
    raise exception 'Choose a container and package contents';
  end if;
  if jsonb_array_length(p_components) = 0 or exists (
    select 1 from jsonb_array_elements(p_components) e where jsonb_typeof(e->'qty') is distinct from 'number'
  ) then raise exception 'Choose packages and enter positive quantities'; end if;
  insert into public.formats (brewery_id, name, basis, package_type)
    values (p_brewery, btrim(p_name), 'packaged', p_package_type) returning * into v_row;
  -- Reuse the existing child validation in the same transaction. Its request is
  -- internal; replay of the outer command returns before either dependent write.
  perform public.replace_format_components(p_brewery, v_row.id, p_components, private.new_uuid());
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

create function public.delete_format(p_brewery uuid, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_format public.formats;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_format', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_format from public.formats where id = p_id and brewery_id = p_brewery for update;
  if not found then raise exception 'format not found'; end if;
  if v_format.basis <> 'packaged' then raise exception 'Only packaged formats can be deleted here'; end if;
  begin
    delete from public.format_components where parent_format_id = p_id and brewery_id = p_brewery;
    delete from public.format_bom where format_id = p_id and brewery_id = p_brewery;
    delete from public.formats where id = p_id and brewery_id = p_brewery;
  exception when foreign_key_violation then
    raise exception 'Format is in use by a SKU, another package, pricing or history and cannot be deleted.' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id));
end $$;

revoke all on function public.create_composed_format(uuid, text, public.package_type, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_format(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_composed_format(uuid, text, public.package_type, jsonb, uuid) to authenticated;
grant execute on function public.delete_format(uuid, uuid, uuid) to authenticated;

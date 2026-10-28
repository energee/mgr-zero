-- Delete one ship-to address (#1487). Admin and Sales, the roles that edit
-- ship-tos. The customer's default ship-to is refused: the user makes another
-- ship-to the default first (owner decision, 2026-10-28). A ship-to an order
-- names is held by the orders foreign key, which keeps the order's frozen
-- destination; that refusal reads "on an order". Same shape as delete_customer.
create function public.delete_ship_to(p_brewery uuid, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_ship_to public.ship_tos;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_ship_to', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_ship_to from public.ship_tos where id = p_id and brewery_id = p_brewery for update;
  if not found then raise exception 'ship-to not found'; end if;
  if v_ship_to.is_default then
    raise exception 'The default ship-to cannot be deleted. Make another ship-to the default first.' using errcode = 'MG409';
  end if;
  begin
    delete from public.ship_tos where id = p_id and brewery_id = p_brewery;
  exception when foreign_key_violation then
    raise exception 'This ship-to is on an order and cannot be deleted. Orders keep their destination.' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id));
end $$;
revoke all on function public.delete_ship_to(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_ship_to(uuid, uuid, uuid) to authenticated;

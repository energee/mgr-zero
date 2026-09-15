-- Remove setup-only customers; all historical/portal references remain protected by FKs.
create function public.delete_customer(p_brewery uuid, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_customer public.customers;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_customer', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_customer from public.customers where id = p_id and brewery_id = p_brewery for update;
  if not found then raise exception 'customer not found'; end if;
  if v_customer.qbo_customer_id is not null then
    raise exception 'Customer is linked to QuickBooks and cannot be deleted.' using errcode = 'MG409';
  end if;
  begin
    delete from public.ship_tos where customer_id = p_id and brewery_id = p_brewery;
    delete from public.customers where id = p_id and brewery_id = p_brewery;
  exception when foreign_key_violation then
    raise exception 'Customer is in use. Orders, invoices, keg records, portal access and invitations must be preserved.' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('id', p_id));
end $$;
revoke all on function public.delete_customer(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_customer(uuid, uuid, uuid) to authenticated;

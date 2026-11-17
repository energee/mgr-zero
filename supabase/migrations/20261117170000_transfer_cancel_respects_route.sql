-- A transfer that is an open route stop cannot be cancelled.
-- cancel_stock_transfer never looked at deliveries: on an undeparted route the
-- cancelled transfer made depart_route fail for every stop, and on a departed
-- route its stop could still be confirmed delivered. Remove the stop from the
-- route, or close it as refused, first; a refused transfer stays in transit
-- and can then be cancelled.
-- Copied from: 20260926020000_cancel_stock_transfer.sql, public.cancel_stock_transfer.
create or replace function public.cancel_stock_transfer(p_transfer uuid, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid; v_replay jsonb; v_actor uuid; t public.stock_transfers;
begin
  select brewery_id into v_brewery from public.stock_transfers where id = p_transfer;
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_actor := private.assert_staff(v_brewery, array['admin','warehouse']::public.staff_role[]);
  if nullif(btrim(p_reason), '') is null then raise exception 'say why the transfer is cancelled'; end if;
  v_replay := private.claim_command_request(v_brewery, 'cancel_stock_transfer', p_request_id,
    jsonb_build_object('transfer', p_transfer, 'reason', p_reason));
  if v_replay is not null then return v_replay; end if;
  t := private.lock_transfer(p_transfer, array['draft','submitted','picked','in_transit']::public.stock_transfer_status[]);
  -- An open stop would block Depart for its route, or be confirmed delivered
  -- for a transfer that no longer exists. A refused or delivered stop is closed.
  if exists (select 1 from public.deliveries where stock_transfer_id = p_transfer and delivered_at is null) then
    raise exception 'transfer is an open route stop: remove it from the route, or close the stop as refused, before cancelling';
  end if;
  update public.stock_transfer_lines set qty_picked = null where transfer_id = p_transfer;
  update public.stock_transfers
  set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_at = now(), cancelled_by = v_actor
  where id = p_transfer;
  return private.complete_command_request(p_request_id, jsonb_build_object('transfer_id', p_transfer));
end $$;

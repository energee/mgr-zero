-- cancel_stock_transfer (#578): an unreceived transfer can be cancelled with a
-- reason. A transfer over-picked before #531 could never balance at receipt,
-- and nothing moved it out of picked. A pick never touches the ledger (receipt
-- writes both halves), so cancelling releases the picks and the stock is
-- already where it was: in the source bin. Transfers keep no event log, so the
-- reason, time and actor live on the transfer row, as received_at does.
alter table public.stock_transfers
  add column cancel_reason text check (char_length(cancel_reason) <= 500),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id);

create function public.cancel_stock_transfer(p_transfer uuid, p_reason text, p_request_id uuid) returns jsonb
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
  update public.stock_transfer_lines set qty_picked = null where transfer_id = p_transfer;
  update public.stock_transfers
  set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_at = now(), cancelled_by = v_actor
  where id = p_transfer;
  return private.complete_command_request(p_request_id, jsonb_build_object('transfer_id', p_transfer));
end $$;
revoke all on function public.cancel_stock_transfer(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_stock_transfer(uuid, text, uuid) to authenticated;

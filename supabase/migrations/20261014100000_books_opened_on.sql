-- breweries.books_opened_on: the day the ledger starts counting for
-- compliance (docs/plans/lolev-history.md). Rows dated before it stay in the
-- ledger, lot trace and batch screens but no compliance report reads them
-- (20261014100100_report_books_opened_on.sql). Null keeps today's behavior:
-- every row ever recorded counts.
alter table public.breweries add column books_opened_on date;

-- Admin-only, replayable. A date after the start of a filed period is refused:
-- that filing's beginning balance was computed from rows the new date would
-- hide, so the filed numbers could no longer be reproduced.
create function public.set_brewery_books_opened_on(p_brewery uuid, p_books_opened_on date, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_first_filed date;
begin
  perform public.assert_chat_admin(p_brewery);
  v_replay := private.claim_command_request(p_brewery, 'set_brewery_books_opened_on', p_request_id,
    jsonb_build_object('books_opened_on', p_books_opened_on));
  if v_replay is not null then return v_replay; end if;
  select min(period_start) into v_first_filed from public.report_filings
    where brewery_id = p_brewery and filed_at is not null;
  if p_books_opened_on > v_first_filed then
    -- Plain raise (P0001) so the message reaches the caller (lib/commands/registry.ts rpcError).
    raise exception 'books cannot open after % — a period starting then is already filed', v_first_filed;
  end if;
  update public.breweries set books_opened_on = p_books_opened_on where id = p_brewery;
  return private.complete_command_request(p_request_id, jsonb_build_object('books_opened_on', p_books_opened_on));
end $$;
revoke all on function public.set_brewery_books_opened_on(uuid, date, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_brewery_books_opened_on(uuid, date, uuid) to authenticated;

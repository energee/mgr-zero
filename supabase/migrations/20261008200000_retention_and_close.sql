-- #766 data lifecycle (decision on #766, 2026-10-08).
--
-- 1. private.command_requests keeps each write's replay record for 90 days.
--    The prune removes only finished records (result is not null) that no
--    private table still references: QuickBooks and Square sync history and
--    portal quotes cascade from command_requests, and the sync status screens
--    read that history, so those requests stay.
-- 2. Closing a brewery ends every staff and buyer login's access and stamps
--    breweries.closed_at, and revokes open invitations. No business record is
--    removed: brewery records are kept for 3 years from closure (TTB
--    recordkeeping); removing them after that is a manual, admin-run step.
--    Close refuses while QuickBooks, Square or Slack is still connected, because
--    those hold provider credentials only their own disconnect commands revoke.
--    A QuickBooks disconnect whose remote revocation stayed unresolved still
--    counts: its local credential is already purged and it cannot be retried.
-- Both are public (PostgREST exposes only public) but executable by service_role
-- alone: scripts/brewery-lifecycle.ts and POST /api/retention/jobs/prune call them.

create function public.prune_command_requests() returns integer
language sql security definer set search_path = '' as $$
  with gone as (
    delete from private.command_requests r
    where r.result is not null and r.created_at < now() - interval '90 days'
      and not exists (select 1 from private.qbo_invoice_sync_batches x where x.actor_id = r.actor_id and x.request_id = r.request_id)
      and not exists (select 1 from private.square_catalog_syncs x where x.actor_id = r.actor_id and x.request_id = r.request_id)
      and not exists (select 1 from private.square_sales_syncs x where x.actor_id = r.actor_id and x.request_id = r.request_id)
      and not exists (select 1 from private.square_menu_publications x where x.actor_id = r.actor_id and x.request_id = r.request_id)
      and not exists (select 1 from private.square_disconnects x where x.actor_id = r.actor_id and x.request_id = r.request_id)
      and not exists (select 1 from private.portal_order_quotes x where x.actor_id = r.actor_id and x.request_id = r.request_id)
    returning 1)
  select count(*)::int from gone;
$$;

alter table public.breweries add column closed_at timestamptz;

create function public.close_brewery(p_brewery uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_staff int; v_buyers int; v_invites int; v_closed timestamptz;
begin
  -- Lock the brewery first so a connect cannot slip in between the checks and the close.
  perform 1 from public.breweries where id = p_brewery for update;
  if not found then raise exception 'brewery not found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.qbo_connections where brewery_id = p_brewery and state <> 'disconnected') then
    raise exception 'disconnect QuickBooks first' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pos_connections where brewery_id = p_brewery and state <> 'disconnected') then
    raise exception 'disconnect Square first' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.chat_installations where brewery_id = p_brewery and state <> 'disconnected') then
    raise exception 'disconnect Slack first' using errcode = 'P0001';
  end if;
  delete from public.customer_users cu using public.customers c
    where c.id = cu.customer_id and c.brewery_id = p_brewery;
  get diagnostics v_buyers = row_count;
  delete from public.brewery_users where brewery_id = p_brewery;
  get diagnostics v_staff = row_count;
  update private.invite_requests set state = 'revoked'
    where brewery_id = p_brewery and state in ('pending_auth', 'pending_membership', 'pending_consent');
  get diagnostics v_invites = row_count;
  update public.breweries set closed_at = coalesce(closed_at, now()) where id = p_brewery returning closed_at into v_closed;
  return jsonb_build_object('staff_removed', v_staff, 'buyers_removed', v_buyers, 'invites_revoked', v_invites, 'closed_at', v_closed);
end $$;

revoke all on function public.prune_command_requests(), public.close_brewery(uuid) from public, anon, authenticated;
grant execute on function public.prune_command_requests(), public.close_brewery(uuid) to service_role;

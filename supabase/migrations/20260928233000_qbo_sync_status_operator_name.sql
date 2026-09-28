-- get_qbo_sync_status: name the operator by full name (falling back to email,
-- then id), the same expression the baseline staff reads use; and read each
-- answer with its own indexed LIMIT 1 instead of materializing the whole
-- brewery history and joining auth.users for every row.

-- "Latest activity" orders by the newest of the four timestamps; index that
-- expression so the read stops at the first matching row. It replaces the
-- created_at-only index, which no query orders by any more.
drop index private.qbo_invoice_sync_batches_brewery_history;
create index qbo_invoice_sync_batches_brewery_activity
  on private.qbo_invoice_sync_batches
  (brewery_id, greatest(created_at, completed_at, failed_at, superseded_at) desc, request_id desc);
create index qbo_invoice_sync_batches_brewery_success
  on private.qbo_invoice_sync_batches (brewery_id, completed_at desc, request_id desc)
  where completed_at is not null;
create index qbo_invoice_sync_batches_brewery_failure
  on private.qbo_invoice_sync_batches (brewery_id, failed_at desc, request_id desc)
  where failed_at is not null;

create or replace function public.get_qbo_sync_status(p_brewery uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin','sales']::public.staff_role[]);
  -- Only batches against the brewery's current connection and realm count.
  return jsonb_build_object(
    'latest', (select jsonb_build_object('at',greatest(b.created_at,b.completed_at,b.failed_at,b.superseded_at),
        'operator',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email::text,b.actor_id::text),
        'completed',b.completed_at is not null,'superseded',b.superseded_at is not null)
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      left join auth.users u on u.id=b.actor_id
      where b.brewery_id=p_brewery
      order by greatest(b.created_at,b.completed_at,b.failed_at,b.superseded_at) desc,b.request_id desc limit 1),
    'lastSuccess', (select jsonb_build_object('at',b.completed_at,
        'operator',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email::text,b.actor_id::text))
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      left join auth.users u on u.id=b.actor_id
      where b.brewery_id=p_brewery and b.completed_at is not null
      order by b.completed_at desc,b.request_id desc limit 1),
    'latestFailure', (select jsonb_build_object('at',b.failed_at,
        'operator',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email::text,b.actor_id::text))
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      left join auth.users u on u.id=b.actor_id
      where b.brewery_id=p_brewery and b.failed_at is not null
      order by b.failed_at desc,b.request_id desc limit 1),
    -- The primary key (actor_id, request_id) bounds this read to one operator.
    'retryRequestId', (select b.request_id
      from private.qbo_invoice_sync_batches b
      join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
      where b.brewery_id=p_brewery and b.actor_id=v_actor and b.completed_at is null and b.superseded_at is null
      order by b.created_at desc,b.request_id desc limit 1)
  );
end $$;

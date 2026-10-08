-- #758: a QuickBooks sync skips invoices settled more than 90 days ago.
--
-- begin_qbo_invoice_sync re-read every pushed invoice ever, so a sync grew with
-- the brewery's whole history. An invoice is settled once a sync observes it
-- fully paid, voided or deleted. qbo_settled_at records when; a trigger keeps
-- it, so complete_qbo_invoice_sync is unchanged. Open, part-paid and recently
-- settled invoices are still re-read every sync. What is given up: an edit in
-- QuickBooks to an invoice settled over 90 days ago (decision on #758).

alter table public.invoices add column qbo_settled_at timestamptz;

create function private.track_qbo_settled_at() returns trigger
language plpgsql set search_path = '' as $$
declare v_settled boolean := new.qbo_remote_state in ('voided','deleted')
  or (new.qbo_remote_state = 'live' and new.qbo_balance_cents = 0 and new.paid_at is not null);
begin
  -- Keep the first time it settled; clear it when a sync sees it reopened.
  new.qbo_settled_at := case when not v_settled then null else coalesce(old.qbo_settled_at, now()) end;
  return new;
end $$;

revoke all on function private.track_qbo_settled_at() from public, anon, authenticated, service_role;

create trigger invoices_track_qbo_settled_at before update of qbo_remote_state, qbo_balance_cents, paid_at
  on public.invoices for each row execute function private.track_qbo_settled_at();

-- Already-settled invoices count from their payment, or from now when no
-- payment time is known, so nothing is skipped before it has been settled 90 days.
update public.invoices set qbo_settled_at = coalesce(paid_at, now())
  where qbo_remote_state in ('voided','deleted')
     or (qbo_remote_state = 'live' and qbo_balance_cents = 0 and paid_at is not null);

create or replace function public.begin_qbo_invoice_sync(p_brewery uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_request private.command_requests; v_conn public.qbo_connections;
  v_targets jsonb; v_existing boolean:=false;
  v_payload_hash bytea:=extensions.digest('{}'::jsonb::text,'sha256');
begin
  v_actor:=private.assert_staff(p_brewery,array['admin','sales']::public.staff_role[]);
  select * into v_request from private.command_requests
    where actor_id=v_actor and request_id=p_request_id for update;
  v_existing:=found;
  if not v_existing then
    select * into v_conn from public.qbo_connections
      where brewery_id=p_brewery and state='connected' for share;
    if not found then raise exception 'QuickBooks connection required'; end if;
    insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash)
      values(v_actor,p_brewery,p_request_id,'sync_qbo_payments',v_payload_hash)
      on conflict(actor_id,request_id) do nothing;
    if not found then
      select * into v_request from private.command_requests
        where actor_id=v_actor and request_id=p_request_id for update;
      v_existing:=true;
    end if;
  end if;
  if v_existing then
    if v_request.brewery_id is distinct from p_brewery or v_request.command_name<>'sync_qbo_payments'
       or v_request.payload_hash<>v_payload_hash then
      raise exception 'request id was already used with a different payload' using errcode='MG409';
    end if;
    if v_request.result is not null then return jsonb_build_object('replayResult',v_request.result); end if;
    select connection_id,realm_id,targets into v_conn.id,v_conn.realm_id,v_targets
      from private.qbo_invoice_sync_batches where actor_id=v_actor and request_id=p_request_id;
    if not found then raise exception 'QuickBooks sync request is incomplete' using errcode='MG409'; end if;
    perform 1 from public.qbo_connections where brewery_id=p_brewery for share;
    -- Another batch can advance the frozen invoice generation. Resolve this old request
    -- explicitly so clients can release its unknown identity without inventing a sync success.
    perform 1 from public.invoices i join jsonb_array_elements(v_targets) t
      on i.id=(t->>'invoiceId')::uuid and i.brewery_id=p_brewery order by i.id for update of i;
    if exists(select 1 from jsonb_array_elements(v_targets) t
      left join public.invoices i on i.id=(t->>'invoiceId')::uuid and i.brewery_id=p_brewery
      where i.id is null or i.qbo_sync_generation is distinct from (t->>'generation')::bigint
        or i.qbo_invoice_id is distinct from t->>'remoteId')
      or not exists(select 1 from public.qbo_connections where brewery_id=p_brewery
        and id=v_conn.id and realm_id=v_conn.realm_id) then
      perform private.complete_command_request_for(v_actor,p_request_id,jsonb_build_object('superseded',true));
      update private.qbo_invoice_sync_batches set superseded_at=now(),targets='[]'::jsonb
        where actor_id=v_actor and request_id=p_request_id;
      return jsonb_build_object('replayResult',jsonb_build_object('superseded',true));
    end if;
    perform 1 from public.qbo_connections where brewery_id=p_brewery and id=v_conn.id
      and realm_id=v_conn.realm_id and state='connected' for share;
    if not found then raise exception 'QuickBooks connection changed' using errcode='MG409'; end if;
    return jsonb_build_object('actorId',v_actor,'connectionId',v_conn.id,'realmId',v_conn.realm_id,'targets',v_targets);
  end if;
  update public.invoices i set qbo_sync_generation=i.qbo_sync_generation+1
  where i.brewery_id=p_brewery and i.kind='invoice' and i.qbo_sync_status='pushed'
    and (i.qbo_settled_at is null or i.qbo_settled_at > now() - interval '90 days')
    and i.qbo_invoice_id is not null and exists(
      select 1 from public.qbo_pushes qp where qp.invoice_id=i.id and qp.brewery_id=p_brewery
        and qp.connection_id=v_conn.id and qp.realm_id=v_conn.realm_id and qp.status='pushed'
        and qp.qbo_entity_id=i.qbo_invoice_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'invoiceId',i.id,'remoteId',i.qbo_invoice_id,'pushId',p.id,
      'generation',i.qbo_sync_generation,'requestBody',p.request_body,'pushedResponse',p.response) order by i.id),'[]'::jsonb)
    into v_targets
  from public.invoices i
  join lateral (
    select qp.* from public.qbo_pushes qp
    where qp.invoice_id=i.id and qp.brewery_id=p_brewery and qp.connection_id=v_conn.id
      and qp.realm_id=v_conn.realm_id and qp.status='pushed' and qp.qbo_entity_id=i.qbo_invoice_id
    order by qp.finished_at desc nulls last,qp.created_at desc,qp.id desc limit 1
  ) p on true
  where i.brewery_id=p_brewery and i.kind='invoice' and i.qbo_sync_status='pushed'
    and (i.qbo_settled_at is null or i.qbo_settled_at > now() - interval '90 days')
    and i.qbo_invoice_id is not null;
  insert into private.qbo_invoice_sync_batches(actor_id,request_id,brewery_id,connection_id,realm_id,targets)
    values(v_actor,p_request_id,p_brewery,v_conn.id,v_conn.realm_id,v_targets);
  return jsonb_build_object('actorId',v_actor,'connectionId',v_conn.id,'realmId',v_conn.realm_id,'targets',v_targets);
end $$;

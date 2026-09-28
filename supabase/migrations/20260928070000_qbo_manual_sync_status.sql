-- Retain the existing frozen batch's operator/outcome; successful replay still uses command_requests.
alter table private.qbo_invoice_sync_batches
  add column completed_at timestamptz,
  add column superseded_at timestamptz,
  add column failed_at timestamptz;
create index qbo_invoice_sync_batches_brewery_history
  on private.qbo_invoice_sync_batches(brewery_id, created_at desc);

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
    and i.qbo_invoice_id is not null;
  insert into private.qbo_invoice_sync_batches(actor_id,request_id,brewery_id,connection_id,realm_id,targets)
    values(v_actor,p_request_id,p_brewery,v_conn.id,v_conn.realm_id,v_targets);
  return jsonb_build_object('actorId',v_actor,'connectionId',v_conn.id,'realmId',v_conn.realm_id,'targets',v_targets);
end $$;

CREATE OR REPLACE FUNCTION public.complete_qbo_invoice_sync (
  p_brewery      uuid,
  p_actor        uuid,
  p_request_id   uuid,
  p_connection   uuid,
  p_realm        text,
  p_observations jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_batch private.qbo_invoice_sync_batches; v_request private.command_requests;
  v_target jsonb; v_observation jsonb; v_inv public.invoices; v_push public.qbo_pushes;
  v_state text; v_drift boolean; v_paid boolean; v_cash int;
  v_synced int:=0; v_paid_count int:=0; v_voided int:=0; v_deleted int:=0; v_drifted int:=0; v_result jsonb;
begin
  if p_actor is null or not exists(select 1 from public.brewery_users
      where brewery_id=p_brewery and user_id=p_actor and role in ('admin','sales')) then
    raise insufficient_privilege using message='permission denied';
  end if;
  perform 1 from public.qbo_connections where brewery_id=p_brewery and id=p_connection
    and realm_id=p_realm and state='connected' for share;
  if not found then raise exception 'QuickBooks connection changed' using errcode='MG409'; end if;
  select * into v_request from private.command_requests
    where actor_id=p_actor and request_id=p_request_id for update;
  if not found or v_request.brewery_id is distinct from p_brewery or v_request.command_name<>'sync_qbo_payments'
    then raise exception 'QuickBooks sync request changed' using errcode='MG409'; end if;
  if v_request.result is not null then return v_request.result; end if;
  select * into v_batch from private.qbo_invoice_sync_batches
    where actor_id=p_actor and request_id=p_request_id for update;
  if not found or v_batch.brewery_id<>p_brewery or v_batch.connection_id<>p_connection or v_batch.realm_id<>p_realm
    then raise exception 'QuickBooks sync request changed' using errcode='MG409'; end if;
  if jsonb_typeof(p_observations)<>'array'
     or jsonb_array_length(p_observations)<>jsonb_array_length(v_batch.targets)
     or exists(select 1 from jsonb_array_elements(p_observations) o
       where (select count(*) from jsonb_array_elements(v_batch.targets) t
         where t->>'invoiceId'=o->>'invoiceId' and t->>'remoteId'=o->>'remoteId')<>1)
     or exists(select 1 from jsonb_array_elements(v_batch.targets) t
       where (select count(*) from jsonb_array_elements(p_observations) o
         where o->>'invoiceId'=t->>'invoiceId' and o->>'remoteId'=t->>'remoteId')<>1)
    then raise exception 'QuickBooks sync observations changed' using errcode='MG409'; end if;

  -- Lock all targets in deterministic order before applying any observation.
  perform 1 from public.invoices i join jsonb_array_elements(v_batch.targets) t
    on i.id=(t->>'invoiceId')::uuid and i.brewery_id=p_brewery order by i.id for update of i;
  for v_target in select value from jsonb_array_elements(v_batch.targets) order by value->>'invoiceId' loop
    select value into v_observation from jsonb_array_elements(p_observations)
      where value->>'invoiceId'=v_target->>'invoiceId' and value->>'remoteId'=v_target->>'remoteId';
    select * into v_inv from public.invoices where id=(v_target->>'invoiceId')::uuid and brewery_id=p_brewery;
    select * into v_push from public.qbo_pushes where id=(v_target->>'pushId')::uuid and brewery_id=p_brewery
      and invoice_id=v_inv.id and connection_id=p_connection and realm_id=p_realm and status='pushed'
      and qbo_entity_id=v_target->>'remoteId';
    if v_inv.id is null or v_push.id is null or v_inv.qbo_invoice_id is distinct from v_target->>'remoteId'
       or v_inv.qbo_sync_generation is distinct from (v_target->>'generation')::bigint then
      raise exception 'QuickBooks invoice identity changed' using errcode='MG409';
    end if;
    v_state:=v_observation->>'remoteState';
    if v_state not in ('live','voided','deleted') then raise exception 'invalid QuickBooks invoice state'; end if;
    v_drift:=false;
    if v_state='live' then
      v_drift:=not (v_observation->>'contentMatches')::boolean
        or (v_push.response ? 'TotalAmt' and round((v_push.response->>'TotalAmt')::numeric*100)::int
          is distinct from (v_observation->>'totalCents')::int)
        or (v_push.response ? 'TotalTax' and round((v_push.response->>'TotalTax')::numeric*100)::int
          is distinct from (v_observation->>'taxCents')::int);
    end if;
    v_cash:=(v_observation->>'cashCollectedCents')::int;
    if v_cash<0 or v_cash>coalesce((v_observation->>'totalCents')::int,0) then
      raise exception 'invalid QuickBooks cash evidence';
    end if;
    v_paid:=v_state='live' and v_cash>0
      and (v_observation->>'balanceCents')::int=0 and (v_observation->>'totalCents')::int>0;
    update public.invoices set qbo_remote_state=v_state::public.qbo_remote_state,
      qbo_sync_token=v_observation->>'syncToken',
      qbo_tax_cents=case when v_observation->'taxCents'='null'::jsonb then null else (v_observation->>'taxCents')::int end,
      qbo_total_cents=case when v_observation->'totalCents'='null'::jsonb then null else (v_observation->>'totalCents')::int end,
      qbo_balance_cents=case when v_observation->'balanceCents'='null'::jsonb then null else (v_observation->>'balanceCents')::int end,
      qbo_cash_collected_cents=case when v_state='live' then v_cash else qbo_cash_collected_cents end,
      qbo_accountant_drift=v_drift,
      paid_at=case when v_paid then coalesce(paid_at,nullif(v_observation->>'paidAt','')::timestamptz,now())
        when v_state='live' then null else paid_at end
      where id=v_inv.id and brewery_id=p_brewery;
    v_synced:=v_synced+1;
    v_paid_count:=v_paid_count+v_paid::int;
    v_voided:=v_voided+(v_state='voided')::int;
    v_deleted:=v_deleted+(v_state='deleted')::int;
    v_drifted:=v_drifted+v_drift::int;
  end loop;
  v_result:=jsonb_build_object('synced',v_synced,'paid',v_paid_count,'voided',v_voided,'deleted',v_deleted,'drifted',v_drifted);
  perform private.complete_command_request_for(p_actor,p_request_id,v_result);
  update private.qbo_invoice_sync_batches set completed_at=now(), targets='[]'::jsonb
    where actor_id=p_actor and request_id=p_request_id;
  return v_result;
end $function$;

create function public.record_qbo_invoice_sync_failure(p_brewery uuid, p_actor uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery
    and user_id=p_actor and role in ('admin','sales')) then
    raise insufficient_privilege using message='permission denied';
  end if;
  -- A late failed response cannot overwrite a concurrently committed success.
  update private.qbo_invoice_sync_batches set failed_at=now()
    where brewery_id=p_brewery and actor_id=p_actor and request_id=p_request_id and completed_at is null and superseded_at is null;
end $$;
revoke all on function public.record_qbo_invoice_sync_failure(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_qbo_invoice_sync_failure(uuid,uuid,uuid) to service_role;

create function public.get_qbo_sync_status(p_brewery uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_result jsonb;
begin
  v_actor:=private.assert_staff(p_brewery,array['admin','sales']::public.staff_role[]);
  with history as (
    select b.*, coalesce(u.email::text,b.actor_id::text) as operator
    from private.qbo_invoice_sync_batches b
    join public.qbo_connections c on c.brewery_id=b.brewery_id and c.id=b.connection_id and c.realm_id=b.realm_id
    left join auth.users u on u.id=b.actor_id
    where b.brewery_id=p_brewery
  )
  select jsonb_build_object(
    'latest', (select jsonb_build_object('at',greatest(created_at,completed_at,failed_at,superseded_at),'operator',operator,'completed',completed_at is not null,'superseded',superseded_at is not null)
      from history order by greatest(created_at,completed_at,failed_at,superseded_at) desc,request_id desc limit 1),
    'lastSuccess', (select jsonb_build_object('at',completed_at,'operator',operator)
      from history where completed_at is not null order by completed_at desc,request_id desc limit 1),
    'latestFailure', (select jsonb_build_object('at',failed_at,'operator',operator)
      from history where failed_at is not null order by failed_at desc,request_id desc limit 1),
    'retryRequestId', (select request_id from history
      where actor_id=v_actor and completed_at is null and superseded_at is null
      order by created_at desc,request_id desc limit 1)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_qbo_sync_status(uuid) from public, anon;
grant execute on function public.get_qbo_sync_status(uuid) to authenticated, service_role;

-- Confirmation and its immutable buyer messages commit together. No historical backfill.
create table private.order_email_deliveries (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  order_id uuid not null,
  customer_id uuid not null,
  user_id uuid,
  recipient text,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','accepted','blocked','suppressed')),
  created_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_id text,
  accepted_at timestamptz,
  last_error text,
  foreign key (order_id, brewery_id) references public.orders(id, brewery_id),
  foreign key (customer_id, brewery_id) references public.customers(id, brewery_id),
  unique nulls not distinct (order_id, user_id)
);
alter table private.order_email_deliveries enable row level security;
revoke all on private.order_email_deliveries from public, anon, authenticated, service_role;
create index order_email_due_idx on private.order_email_deliveries(next_attempt_at, created_at)
  where state in ('pending','sending');

create function private.queue_order_confirmation_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_subject text; v_text text;
begin
  if new.kind <> 'wholesale' or new.status <> 'confirmed' or old.status = new.status then return new; end if;
  select b.name || ': order ' || new.order_no || ' confirmed',
    'Your order ' || new.order_no || ' with ' || b.name || E' is confirmed.\n' ||
    case when new.requested_ship_date is null then '' else 'Requested ship date: ' || new.requested_ship_date || E'\n' end ||
    E'\n' || coalesce((select string_agg(ol.qty_ordered::text || ' × ' || s.name, E'\n' order by ol.id)
      from public.order_lines ol join public.skus s on s.id=ol.sku_id and s.brewery_id=ol.brewery_id
      where ol.order_id=new.id and ol.brewery_id=new.brewery_id), '') ||
    E'\n\nThese are the details at confirmation. Check your customer portal for the current order.'
  into v_subject, v_text from public.breweries b where b.id=new.brewery_id;

  insert into private.order_email_deliveries(brewery_id,order_id,customer_id,user_id,recipient,payload,state,last_error)
  select new.brewery_id,new.id,new.customer_id,u.id,u.email,
    jsonb_build_object('to',u.email,'subject',v_subject,'text',v_text),
    case when nullif(btrim(u.email),'') is null then 'blocked' else 'pending' end,
    case when nullif(btrim(u.email),'') is null then 'no_recipient' else null end
  from public.customer_users cu join auth.users u on u.id=cu.user_id
  where cu.customer_id=new.customer_id;
  if not found then
    insert into private.order_email_deliveries(brewery_id,order_id,customer_id,payload,state,last_error)
    values(new.brewery_id,new.id,new.customer_id,jsonb_build_object('subject',v_subject,'text',v_text),'blocked','no_recipient');
  end if;
  return new;
end $$;
revoke all on function private.queue_order_confirmation_email() from public, anon, authenticated, service_role;
create trigger order_confirmation_email after update of status on public.orders
  for each row execute function private.queue_order_confirmation_email();

create function public.lease_order_emails(p_from text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d private.order_email_deliveries; v_now timestamptz := clock_timestamp(); v_result jsonb := '[]';
begin
  if nullif(btrim(p_from),'') is null then raise exception 'email sender required'; end if;
  for d in
    select * from private.order_email_deliveries
    where state in ('pending','sending') and next_attempt_at <= v_now
      and (lease_expires_at is null or lease_expires_at <= v_now)
    order by created_at,id limit 10 for update skip locked
  loop
    -- Resend keeps keys 24h. Stop at 23h rather than risk a duplicate after expiry.
    if d.first_attempt_at is not null and d.first_attempt_at + interval '23 hours' <= v_now then
      update private.order_email_deliveries set state='blocked',last_error='retry_window_expired',lease_token=null,lease_expires_at=null where id=d.id;
      continue;
    end if;
    if not exists (select 1 from public.customer_users cu join auth.users u on u.id=cu.user_id
      join public.customers c on c.id=cu.customer_id
      where cu.customer_id=d.customer_id and cu.user_id=d.user_id and c.brewery_id=d.brewery_id and u.email=d.recipient) then
      update private.order_email_deliveries set state='suppressed',last_error='recipient_changed',lease_token=null,lease_expires_at=null where id=d.id;
      continue;
    end if;
    update private.order_email_deliveries set
      payload=case when first_attempt_at is null then payload || jsonb_build_object('from',p_from) else payload end,
      first_attempt_at=coalesce(first_attempt_at,v_now),state='sending',attempt_count=attempt_count+1,
      lease_token=private.new_uuid(),lease_expires_at=v_now+interval '10 minutes'
    where id=d.id returning * into d;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id',d.id,'lease_token',d.lease_token,
      'lease_expires_at',d.lease_expires_at,'retry_before',d.first_attempt_at+interval '23 hours','payload',d.payload));
  end loop;
  return v_result;
end $$;
revoke all on function public.lease_order_emails(text) from public, anon, authenticated;
grant execute on function public.lease_order_emails(text) to service_role;

-- Exactly one of provider id or error. Only provider_uncertain retries; any other error blocks.
create function public.finish_order_email(p_delivery uuid,p_lease uuid,p_provider_id text,p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (p_provider_id is null) = (p_error is null)
    or (p_provider_id is not null and btrim(p_provider_id)='')
    or (p_error is not null and p_error not in ('provider_uncertain','provider_rejected','retry_window_expired')) then
    raise exception 'invalid email outcome';
  end if;
  update private.order_email_deliveries set
    state=case when p_provider_id is not null then 'accepted' when p_error='provider_uncertain' then 'pending' else 'blocked' end,
    provider_id=p_provider_id,accepted_at=case when p_provider_id is not null then clock_timestamp() else null end,
    last_error=p_error,next_attempt_at=clock_timestamp()+interval '5 minutes',lease_token=null,lease_expires_at=null
  where id=p_delivery and lease_token=p_lease and state='sending' and lease_expires_at>clock_timestamp();
  return found;
end $$;
revoke all on function public.finish_order_email(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_order_email(uuid,uuid,text,text) to service_role;

create function public.get_order_email_status(p_brewery uuid,p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_brewery uuid;
begin
  v_brewery := private.assert_order_staff(p_order,array['admin','sales']::public.staff_role[]);
  if v_brewery <> p_brewery or p_brewery is null then raise exception 'order not found'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'state',state,
    'attempt_count',attempt_count,'last_error',last_error,'accepted_at',accepted_at) order by created_at,id),'[]')
    from private.order_email_deliveries where order_id=p_order and brewery_id=v_brewery);
end $$;
revoke all on function public.get_order_email_status(uuid,uuid) from public, anon, service_role;
grant execute on function public.get_order_email_status(uuid,uuid) to authenticated;

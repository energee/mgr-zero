-- Staff permissions are the union of every role held by a brewery member (#797).
-- Invitations still grant one role; the Team command can add more afterward.
alter table public.brewery_users add column roles public.staff_role[];
update public.brewery_users set roles = array[role];
alter table public.brewery_users
  alter column roles set not null,
  alter column role drop not null,
  add constraint brewery_users_roles_nonempty check (cardinality(roles) > 0),
  add constraint brewery_users_roles_valid check (
    array_ndims(roles) = 1 and array_position(roles, null) is null);

-- Both helpers retain request-scope binding and derive authority from membership,
-- never from user-editable JWT metadata. A non-member has no permissions.
create function public.staff_roles(b uuid) returns public.staff_role[]
  language sql stable security definer set search_path = '' as $$
  select roles from public.brewery_users
  where user_id = auth.uid() and brewery_id = b and private.request_scope_allows(b)
$$;
create function public.has_staff_role(b uuid, p_roles public.staff_role[]) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(public.staff_roles(b) && p_roles, false)
$$;
revoke execute on function public.staff_roles(uuid) from public, anon;
revoke execute on function public.has_staff_role(uuid, public.staff_role[]) from public, anon;
grant execute on function public.staff_roles(uuid) to authenticated, service_role;
grant execute on function public.has_staff_role(uuid, public.staff_role[]) to authenticated, service_role;

-- The renamed command input deliberately replaces the scalar API (pre-release).
drop function public.update_staff_role(uuid, uuid, public.staff_role, uuid);
create function public.update_staff_role(p_brewery uuid, p_user uuid, p_roles public.staff_role[], p_request_id uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_row public.brewery_users;
  v_roles public.staff_role[];
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  if p_roles is null or cardinality(p_roles) = 0 or array_ndims(p_roles) <> 1
     or array_position(p_roles, null) is not null then
    raise exception 'choose at least one role';
  end if;
  v_roles := array(select distinct r from unnest(p_roles) r order by r);
  v_replay := private.claim_command_request(p_brewery, 'update_staff_role', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'user', p_user, 'roles', to_jsonb(v_roles)));
  if v_replay is not null then return v_replay; end if;
  if not 'admin' = any(v_roles) then perform private.assert_not_last_admin(p_brewery, p_user); end if;
  update public.brewery_users set roles = v_roles
    where brewery_id = p_brewery and user_id = p_user returning * into v_row;
  if v_row.user_id is null then raise exception 'member not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke execute on function public.update_staff_role(uuid, uuid, public.staff_role[], uuid) from public, anon;
grant execute on function public.update_staff_role(uuid, uuid, public.staff_role[], uuid) to authenticated, service_role;

-- private.assert_invoice_staff
CREATE OR REPLACE FUNCTION private.assert_invoice_staff(p_invoice uuid, p_roles staff_role[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid;
begin
  select i.brewery_id into v_brewery
  from public.invoices i
  where i.id = p_invoice
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = i.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && p_roles
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_brewery;
end $function$;

-- private.assert_not_last_admin
CREATE OR REPLACE FUNCTION private.assert_not_last_admin(p_brewery uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Changing a non-admin can never remove the last admin; only then lock.
  if not exists (select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_user and 'admin' = any(roles)) then
    return;
  end if;
  perform 1 from public.brewery_users
    where brewery_id = p_brewery and 'admin' = any(roles)
    order by user_id
    for update;
  if exists (select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_user and 'admin' = any(roles))
     and (select count(*) from public.brewery_users where brewery_id = p_brewery and 'admin' = any(roles)) = 1 then
    raise exception 'keep at least one admin' using errcode = 'P0001';
  end if;
end $function$;

-- private.assert_order_staff
CREATE OR REPLACE FUNCTION private.assert_order_staff(p_order uuid, p_roles staff_role[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid;
begin
  select o.brewery_id into v_brewery
  from public.orders o
  where o.id = p_order
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && p_roles
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_brewery;
end $function$;

-- private.assert_route_runner
CREATE OR REPLACE FUNCTION private.assert_route_runner(p_route uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.routes;
begin
  select * into r from public.routes where id = p_route;
  if r.id is null then raise exception 'permission denied' using errcode = '42501'; end if;
  perform private.assert_staff(r.brewery_id, array['admin','warehouse']::public.staff_role[]);
  if r.driver_user_id is distinct from auth.uid() and not public.has_staff_role(r.brewery_id, array['admin']::public.staff_role[]) then
    raise exception 'only the assigned driver or an admin may run this route' using errcode = '42501';
  end if;
  return r.brewery_id;
end $function$;

-- private.assert_staff
CREATE OR REPLACE FUNCTION private.assert_staff(p_brewery uuid, p_roles staff_role[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid();
begin
  perform private.assert_request_scope(p_brewery);
  if v_actor is null or not exists (
    select 1 from public.brewery_users
    where brewery_id = p_brewery and user_id = v_actor and roles && p_roles
  ) then raise exception 'permission denied' using errcode = '42501'; end if;
  return v_actor;
end $function$;

-- private.grant_invite_membership
CREATE OR REPLACE FUNCTION private.grant_invite_membership(p_row private.invite_requests, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_row.kind = 'staff' then
    insert into public.brewery_users(brewery_id,user_id,roles) values(p_row.brewery_id,p_user,array[p_row.role]);
  else
    insert into public.customer_users(customer_id,user_id) values(p_row.customer_id,p_user);
  end if;
  update private.invite_requests set state = 'complete', last_error = null where id = p_row.id;
end $function$;

-- private.save_route_impl
CREATE OR REPLACE FUNCTION private.save_route_impl(p_brewery uuid, p_id uuid, p_name text, p_delivery_date date, p_driver uuid, p_vehicle text, p_note text, p_stops jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid := p_id; r public.routes; s jsonb; v_ship uuid; v_tr uuid; v_doc uuid; v_route uuid; v_seen uuid[] := '{}'; v_no int; v_seen_no int[] := '{}';
begin
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then raise exception 'a route needs at least one stop'; end if;
  if p_driver is not null and not exists (
    select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_driver and roles && array['admin','warehouse']::public.staff_role[]
  ) then raise exception 'driver must be a warehouse or admin member'; end if;
  if v_id is null then
    insert into public.routes (brewery_id, name, delivery_date, driver_user_id, vehicle, note)
    values (p_brewery, nullif(trim(p_name), ''), p_delivery_date, p_driver, nullif(trim(p_vehicle), ''), nullif(trim(p_note), ''))
    returning id into v_id;
  else
    select * into r from public.routes where id = v_id and brewery_id = p_brewery for update;
    if not found then raise exception 'route not found'; end if;
    -- ponytail: a departed route is frozen, so a refused stop blocks the return until it is delivered; a per-stop
    -- "leave for a later route" verb on the run page is the upgrade path
    if r.departed_at is not null then raise exception 'route has departed'; end if;
    update public.routes set name = nullif(trim(p_name), ''), delivery_date = p_delivery_date, driver_user_id = p_driver,
      vehicle = nullif(trim(p_vehicle), ''), note = nullif(trim(p_note), '') where id = v_id;
  end if;
  for s in select * from jsonb_array_elements(p_stops) loop
    v_ship := (s->>'shipment_id')::uuid; v_tr := (s->>'stock_transfer_id')::uuid; v_doc := coalesce(v_ship, v_tr);
    if num_nonnulls(v_ship, v_tr) <> 1 then raise exception 'a stop is one shipment or one stock transfer'; end if;
    if v_doc = any(v_seen) then raise exception 'the same document is listed twice'; end if;
    v_seen := v_seen || v_doc;
    v_no := (s->>'stop_no')::int;
    if v_no is null or v_no < 1 then raise exception 'stop number must be positive'; end if;
    if v_no = any(v_seen_no) then raise exception 'stop number % is used twice', v_no; end if;
    v_seen_no := v_seen_no || v_no;
    -- the brewery check comes first so a foreign id learns nothing about where it sits
    if v_ship is not null and not exists (select 1 from public.shipments where id = v_ship and brewery_id = p_brewery) then raise exception 'shipment not found'; end if;
    if v_ship is not null and exists (
      select 1 from public.shipments sh join public.orders o on o.id = sh.order_id and o.brewery_id = sh.brewery_id
      where sh.id = v_ship and o.pickup
    ) then raise exception 'a pickup order is not delivered on a route'; end if;
    if v_tr is not null and not exists (
      select 1 from public.stock_transfers where id = v_tr and brewery_id = p_brewery and status in ('picked','in_transit')
    ) then raise exception 'transfer must be picked before it can be delivered'; end if;
    select d.route_id into v_route from public.deliveries d where d.brewery_id = p_brewery and coalesce(d.shipment_id, d.stock_transfer_id) = v_doc;
    if v_route is not null and v_route <> v_id then raise exception 'document is already on route %', v_route; end if;
  end loop;
  -- delivered stops stay; replace the rest
  if exists (
    select 1 from public.deliveries d where d.route_id = v_id and d.delivered_at is not null
      and not (coalesce(d.shipment_id, d.stock_transfer_id) = any(v_seen))
  ) then raise exception 'a delivered stop cannot be removed'; end if;
  -- kept stops keep their id: Today rows, chat subjects and open Confirm pages point at it
  delete from public.deliveries where route_id = v_id and delivered_at is null and not (coalesce(shipment_id, stock_transfer_id) = any(v_seen));
  -- two passes so renumbering never collides with a kept stop
  update public.deliveries set stop_no = -stop_no where route_id = v_id;
  for s in select * from jsonb_array_elements(p_stops) loop
    v_ship := (s->>'shipment_id')::uuid; v_tr := (s->>'stock_transfer_id')::uuid;
    update public.deliveries set stop_no = (s->>'stop_no')::int where route_id = v_id and coalesce(shipment_id, stock_transfer_id) = coalesce(v_ship, v_tr);
    if not found then
      insert into public.deliveries (brewery_id, route_id, shipment_id, stock_transfer_id, stop_no)
      values (p_brewery, v_id, v_ship, v_tr, (s->>'stop_no')::int);
    end if;
  end loop;
  return jsonb_build_object('routeId', v_id);
end $function$;

-- public.accept_account_invitation
CREATE OR REPLACE FUNCTION public.accept_account_invitation(p_invite uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row private.invite_requests; v_result jsonb;
begin
  select i.* into v_row from private.invite_requests i join auth.users u on u.id = i.auth_user_id
    where i.id = p_invite and i.auth_user_id = auth.uid() and lower(u.email) = i.email
      and u.email_confirmed_at is not null and i.consent_expires_at is not null for update of i;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  v_result := private.claim_command_request_for(auth.uid(), null, 'accept_account_invitation', p_request_id,
    jsonb_build_object('inviteId', p_invite));
  if v_result is not null then return v_result; end if;
  if v_row.state = 'complete' then raise exception 'invitation already accepted' using errcode = 'MG409'; end if;
  if v_row.state <> 'pending_consent' or v_row.consent_expires_at <= now() then
    raise exception 'invitation expired or revoked';
  end if;
  -- Lock the inviter membership against a concurrent removal or role change.
  perform 1 from public.brewery_users where brewery_id = v_row.brewery_id and user_id = v_row.actor_id
    and roles && private.invite_roles(v_row.kind) for share;
  if not found then raise exception 'inviter no longer has permission' using errcode = '42501'; end if;
  perform private.grant_invite_membership(v_row, auth.uid());
  v_result := jsonb_build_object('breweryId', v_row.brewery_id, 'kind', v_row.kind, 'customerId', v_row.customer_id);
  perform private.complete_command_request_for(auth.uid(), p_request_id, v_result);
  return v_result;
exception when unique_violation then raise exception 'membership already exists' using errcode = 'MG409';
end $function$;

-- public.create_replenishment_order
CREATE OR REPLACE FUNCTION public.create_replenishment_order(p_from uuid, p_to uuid, p_lines jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  select l.brewery_id into v_brewery
  from public.locations l
  where l.id = p_to
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = l.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && array['admin','sales']::public.staff_role[]
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'create_replenishment_order',p_request_id,jsonb_build_object('from',p_from,'to',p_to,'lines',p_lines));
  if v_replay is not null then return v_replay; end if;
  v_result := private.create_replenishment_order_impl(p_from,p_to,p_lines); return private.complete_command_request(p_request_id,v_result);
end $function$;

-- public.is_staff_of
CREATE OR REPLACE FUNCTION public.is_staff_of(b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.request_scope_allows(b) and exists(select 1 from public.brewery_users where user_id = auth.uid() and brewery_id = b and roles && array['admin','sales','warehouse','brewer']::public.staff_role[]) $function$;

-- public.keg_bin_on_hand_rows
CREATE OR REPLACE FUNCTION public.keg_bin_on_hand_rows()
 RETURNS TABLE(brewery_id uuid, pool_id uuid, keg_size keg_size, location_id uuid, bin_id uuid, qty integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- A loss at a customer (customer_id set) is off that customer's balance;
  -- the shipped event already took it out of the bin.
  -- private.bin_stock_on_hand (#532) repeats this reason-to-sign arithmetic
  -- for keg bins; change both together.
  with staff as materialized (
    select bu.brewery_id, bu.roles from public.brewery_users bu
    where bu.user_id = auth.uid() and private.request_scope_allows(bu.brewery_id))
  select e.brewery_id, e.pool_id, e.keg_size, e.location_id, e.bin_id,
         sum(case e.reason when 'acquired' then e.qty when 'found' then e.qty when 'transferred_in' then e.qty when 'returned' then e.qty
                         when 'retired' then -e.qty when 'transferred_out' then -e.qty when 'shipped' then -e.qty
                         when 'lost' then case when e.customer_id is null then -e.qty else 0 end
                         else 0 end)::int
  from public.keg_events e
  join staff s on s.brewery_id = e.brewery_id
  join public.locations l on l.id = e.location_id and l.brewery_id = e.brewery_id
  where s.roles && array['admin','sales','warehouse','brewer']::public.staff_role[]
     or ('taproom' = any(s.roles) and 'taproom' = any(l.uses))
  group by 1,2,3,4,5;
$function$;

-- public.list_customer_users
CREATE OR REPLACE FUNCTION public.list_customer_users(p_brewery uuid, p_customer uuid)
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select cu.user_id, u.email::text, cu.created_at
    from public.customer_users cu
    join public.customers c on c.id = cu.customer_id and c.brewery_id = p_brewery
    join auth.users u on u.id = cu.user_id
    where cu.customer_id = p_customer
      and private.request_scope_allows(p_brewery)
      and exists (select 1 from public.brewery_users me where me.brewery_id = p_brewery and me.user_id = auth.uid()
                    and me.roles && array['admin','sales']::public.staff_role[])
    order by u.email;
$function$;

-- public.list_team_members
drop function public.list_team_members(uuid);
CREATE OR REPLACE FUNCTION public.list_team_members(p_brewery uuid)
 RETURNS TABLE(user_id uuid, email text, roles staff_role[], created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select bu.user_id, u.email::text, bu.roles, bu.created_at
    from public.brewery_users bu
    join auth.users u on u.id = bu.user_id
    where bu.brewery_id = p_brewery
      and private.request_scope_allows(p_brewery)
      and exists (select 1 from public.brewery_users me where me.brewery_id = p_brewery and me.user_id = auth.uid()
                    and me.roles && array['admin','sales','warehouse']::public.staff_role[])
    order by u.email;
$function$
;
revoke execute on function public.list_team_members(uuid) from public, anon;
grant execute on function public.list_team_members(uuid) to authenticated, service_role;

-- public.my_staff_brewery_ids
CREATE OR REPLACE FUNCTION public.my_staff_brewery_ids(p_roles staff_role[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select brewery_id from public.brewery_users
   where user_id = auth.uid() and roles && p_roles and private.request_scope_allows(brewery_id) $function$;

-- public.on_hand_rows
CREATE OR REPLACE FUNCTION public.on_hand_rows()
 RETURNS TABLE(brewery_id uuid, sku_id uuid, location_id uuid, qty numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with staff as materialized (
    select bu.brewery_id, bu.roles from public.brewery_users bu
    where bu.user_id = auth.uid() and private.request_scope_allows(bu.brewery_id))
  select m.brewery_id, m.sku_id, m.location_id, sum(m.qty)
  from public.inventory_movements m
  join staff s on s.brewery_id = m.brewery_id
  join public.locations l on l.id = m.location_id and l.brewery_id = m.brewery_id
  where s.roles && array['admin','sales','warehouse','brewer']::public.staff_role[]
     or ('taproom' = any(s.roles) and 'taproom' = any(l.uses))
  group by 1,2,3;
$function$;

-- public.provision_brewery
CREATE OR REPLACE FUNCTION public.provision_brewery(p_actor uuid, p_name text, p_timezone text, p_ttb text, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_actor)
    then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'brewery name is required'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    then raise exception 'invalid timezone'; end if;
  v_result := private.claim_command_request_for(p_actor, null, 'provision_brewery', p_request_id,
    jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone, 'ttb', nullif(btrim(p_ttb), '')));
  if v_result is not null then return (v_result #>> '{}')::uuid; end if;
  insert into public.breweries(name, timezone, ttb_registry_no)
    values (btrim(p_name), p_timezone, nullif(btrim(p_ttb), '')) returning id into v_id;
  insert into public.brewery_users(brewery_id, user_id, roles) values (v_id, p_actor, array['admin']::public.staff_role[]);
  perform private.complete_command_request_for(p_actor, p_request_id, to_jsonb(v_id));
  return v_id;
end $function$;

-- public.set_standing_allocation
CREATE OR REPLACE FUNCTION public.set_standing_allocation(p_location uuid, p_sku uuid, p_qty numeric, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid; v_replay jsonb; v_result jsonb;
begin
  select l.brewery_id into v_brewery
  from public.locations l
  where l.id = p_location
    and exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = l.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && array['admin','sales']::public.staff_role[]
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'set_standing_allocation',p_request_id,jsonb_build_object('location',p_location,'sku',p_sku,'qty',p_qty));
  if v_replay is not null then return v_replay; end if;
  v_result := private.set_standing_allocation_impl(p_location,p_sku,p_qty); return private.complete_command_request(p_request_id,v_result);
end $function$;

-- public.submit_order
CREATE OR REPLACE FUNCTION public.submit_order(p_order uuid, p_request_id uuid, p_expected_brewery uuid DEFAULT NULL::uuid, p_expected_customer uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid; v_replay jsonb; v_result jsonb; v_is_staff boolean;
begin
  select o.brewery_id,
    exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && array['admin','sales']::public.staff_role[]
    )
    into v_brewery, v_is_staff
  from public.orders o
  where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    and (
      exists (
        select 1 from public.brewery_users bu
        where bu.brewery_id = o.brewery_id
          and bu.user_id = auth.uid()
          and bu.roles && array['admin','sales']::public.staff_role[]
      )
      or exists (
        select 1 from public.customer_users cu
        where cu.customer_id = o.customer_id and cu.user_id = auth.uid()
      )
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  v_replay := private.claim_command_request(v_brewery,'submit_order',p_request_id,jsonb_build_object('order',p_order,'expected_brewery',p_expected_brewery,'expected_customer',p_expected_customer));
  if v_replay is not null then return v_replay; end if;
  -- Keep the shared claim-before-order-lock ordering. The first scope check
  -- rejects a wrong active account without claiming; this locked check prevents
  -- target scope changing between that read and the transactional write.
  perform 1 from public.orders o where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    for update of o;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  if not v_is_staff and not exists (
    select 1 from public.orders where id=p_order and status='draft'
  ) then
    raise exception 'order not found';
  end if;
  v_result := private.submit_order_impl(p_order); return private.complete_command_request(p_request_id,v_result);
end $function$;

-- public.taproom_can
CREATE OR REPLACE FUNCTION public.taproom_can(b uuid, t text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.has_staff_role(b, array['taproom']::public.staff_role[]) and t = any(array[
    'locations','bins','taproom_pars','taproom_counts','taproom_count_lines','tap_intervals',
    'brands','formats','format_components','skus','keg_pools',
    'pos_locations','pos_item_mappings']);
$function$;

-- public.update_draft_order
CREATE OR REPLACE FUNCTION public.update_draft_order(p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb, p_request_id uuid, p_clear_requested boolean DEFAULT false, p_expected_brewery uuid DEFAULT NULL::uuid, p_expected_customer uuid DEFAULT NULL::uuid, p_pickup boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_brewery uuid; v_customer uuid; v_replay jsonb; v_result jsonb; v_is_staff boolean; v_payload jsonb;
begin
  select o.brewery_id, o.customer_id,
    exists (
      select 1 from public.brewery_users bu
      where bu.brewery_id = o.brewery_id
        and bu.user_id = auth.uid()
        and bu.roles && array['admin','sales']::public.staff_role[]
    )
    into v_brewery, v_customer, v_is_staff
  from public.orders o
  where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    and (
      exists (
        select 1 from public.brewery_users bu
        where bu.brewery_id = o.brewery_id
          and bu.user_id = auth.uid()
          and bu.roles && array['admin','sales']::public.staff_role[]
      )
      or exists (
        select 1 from public.customer_users cu
        where cu.customer_id = o.customer_id and cu.user_id = auth.uid()
      )
    );
  if v_brewery is null then raise exception 'permission denied' using errcode = '42501'; end if;
  -- The portal adapter supplies p_expected_customer. A customer calling this
  -- RPC directly cannot omit that argument to bypass whole-unit validation;
  -- an authorized staff call keeps its fractional-quantity contract even when
  -- the same user also belongs to the order's customer account.
  if p_expected_customer is not null or not v_is_staff then
    perform private.assert_portal_order_lines(p_lines);
    -- Buyers supply only ship-to, PO, note and lines; staff mark a pickup.
    if p_pickup is not null then raise exception 'permission denied' using errcode = '42501'; end if;
  end if;
  v_payload := jsonb_build_object('order',p_order,'ship_to',p_ship_to,'requested',p_requested,'po',p_po,'note',p_note,'lines',p_lines,'clear_requested',p_clear_requested,'expected_brewery',p_expected_brewery,'expected_customer',p_expected_customer);
  -- Requests completed before pickup existed keep their original hash.
  if p_pickup is not null then v_payload := v_payload || jsonb_build_object('pickup', p_pickup); end if;
  v_replay := private.claim_command_request(v_brewery,'update_draft_order',p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  -- Keep the shared claim-before-order-lock ordering. The first scope check
  -- rejects a wrong active account without claiming; this locked check prevents
  -- target scope changing between that read and the transactional write.
  perform 1 from public.orders o where o.id = p_order
    and (p_expected_brewery is null or o.brewery_id = p_expected_brewery)
    and (p_expected_customer is null or o.customer_id = p_expected_customer)
    for update of o;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  v_result := private.update_draft_order_impl(p_order,p_ship_to,p_requested,p_po,p_note,p_lines,p_pickup);
  if p_clear_requested then update public.orders set requested_ship_date = null where id = p_order; end if;
  return private.complete_command_request(p_request_id,v_result);
end $function$;

-- Keep each policy's existing target roles and non-role ownership restrictions.
alter policy chat_installations_admin_read on public.chat_installations
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin']::public.staff_role[])));

alter policy chat_user_links_self_read on public.chat_user_links
  using (user_id = (select auth.uid()) and state = 'active' and brewery_id in (select public.my_staff_brewery_ids(enum_range(null::public.staff_role))));

alter policy notification_destinations_admin_shared_read on public.notification_destinations
  using (kind = 'private_channel' and brewery_id in (select public.my_staff_brewery_ids(array['admin']::public.staff_role[])));

alter policy notification_destinations_personal_read on public.notification_destinations
  using (kind = 'personal' and user_id = (select auth.uid())
    and brewery_id in (select public.my_staff_brewery_ids(enum_range(null::public.staff_role)))
    and exists (select 1 from public.chat_user_links l
      where l.brewery_id = notification_destinations.brewery_id
        and l.user_id = (select auth.uid()) and l.state = 'active'));

alter policy notification_preferences_self_read on public.notification_preferences
  using (user_id = (select auth.uid()) and brewery_id in (select public.my_staff_brewery_ids(enum_range(null::public.staff_role))));

alter policy staff_read on public.pos_catalog_items
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[])));

alter policy staff_read on public.pos_catalog_ownership
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[])));

alter policy staff_read on public.pos_catalog_variations
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[])));

alter policy integration_operator_read on public.pos_connections
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));

alter policy staff_read on public.pos_menu_lines
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[])));

alter policy staff_read on public.pos_menus
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[])));

alter policy integration_operator_read on public.qbo_connections
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));

alter policy integration_operator_read on public.qbo_pushes
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','sales']::public.staff_role[])));

CREATE OR REPLACE FUNCTION private.consume_chat_link_proof(p_proof_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.chat_user_links; v_state text;
begin
  select * into l from public.chat_user_links where proof_hash = p_proof_hash and state = 'pending' for update;
  if not found or l.proof_consumed_at is not null or l.proof_expires_at < now() then
    raise exception 'link proof invalid or expired';
  end if;
  select state into v_state from public.chat_installations where id = l.installation_id;
  if v_state <> 'active' then raise exception 'installation is not active'; end if;
  perform private.assert_staff_read(l.brewery_id, enum_range(null::public.staff_role));
  if exists (select 1 from public.chat_user_links
             where installation_id = l.installation_id and user_id = auth.uid() and state = 'active') then
    raise exception 'you are already linked in this workspace';
  end if;
  update public.chat_user_links
    set user_id = auth.uid(), state = 'active', linked_at = now(), proof_consumed_at = now(), proof_hash = null, updated_at = now()
    where id = l.id;
  return jsonb_build_object('link_id', l.id, 'installation_id', l.installation_id, 'brewery_id', l.brewery_id);
end $function$;

CREATE OR REPLACE FUNCTION private.set_chat_quiet_hours(p_brewery uuid, p_user uuid, p_start time without time zone, p_end time without time zone, p_timezone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_user
    and roles && array['admin','sales','warehouse','brewer']::public.staff_role[]) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if (p_start is null) <> (p_end is null) or p_start = p_end or p_start >= time '24:00' or p_end >= time '24:00'
    or (p_timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name=p_timezone)) then
    raise exception 'invalid quiet hours' using errcode = '22023';
  end if;
  insert into public.notification_preferences (brewery_id,user_id,reason,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,use_brewery_timezone)
  select p_brewery,p_user,r,p_start,p_end,p_timezone,p_timezone is null
    from unnest(array['submitted_order','pick_due','restock_due','delivery_next','fermentation_reading_overdue','invoice_question','operations_digest']) r
  on conflict (brewery_id,user_id,reason) do update set quiet_hours_start=excluded.quiet_hours_start,
    quiet_hours_end=excluded.quiet_hours_end,quiet_hours_timezone=excluded.quiet_hours_timezone,
    use_brewery_timezone=excluded.use_brewery_timezone,updated_at=now();
  update public.notification_deliveries d set next_attempt_at=greatest(d.next_attempt_at,
    public.chat_quiet_release(now(),coalesce(p_start,i.quiet_hours_start),coalesce(p_end,i.quiet_hours_end),
      coalesce(p_timezone,i.quiet_hours_timezone,b.timezone))),updated_at=now()
    from public.notification_destinations dst,public.chat_installations i,public.breweries b
    where dst.id=d.destination_id and dst.user_id=p_user and d.brewery_id=p_brewery
      and i.id=d.installation_id and b.id=p_brewery and d.state in ('queued','retrying');
end $function$;

CREATE OR REPLACE FUNCTION private.snooze_chat_delivery(p_brewery uuid, p_user uuid, p_delivery uuid, p_until timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_user
    and roles && array['admin','sales','warehouse','brewer']::public.staff_role[]) then
    raise exception 'permission denied' using errcode='42501';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'snooze must be within the next seven days' using errcode='22023';
  end if;
  update public.notification_deliveries d set next_attempt_at=greatest(d.next_attempt_at,p_until),
    state='queued',lease_expires_at=null,updated_at=now()
    from public.notification_destinations dst, public.chat_installations i, public.chat_user_links l, public.notification_occurrences o
    where d.id=p_delivery and d.brewery_id=p_brewery and dst.id=d.destination_id and dst.user_id=p_user
      and dst.kind='personal' and dst.state='active' and i.id=d.installation_id and i.state='active'
      and l.installation_id=i.id and l.user_id=p_user and l.state='active'
      and o.id=d.occurrence_id and o.state='active'
      and exists (
        select 1 from public.scan_chat_today_candidates(p_brewery,now()) c
          join public.brewery_users bu on bu.brewery_id=c.brewery_id and bu.user_id=p_user
          where c.reason=o.reason and c.subject_type=o.subject_type and c.subject_id=o.subject_id and c.source_version=o.source_version
            and ('admin'=any(bu.roles) or (bu.roles::text[] && c.recipient_roles and (c.assigned_user_id is null or c.assigned_user_id=p_user))));
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.activate_chat_installation(p_installation uuid, p_state_hash text, p_redirect_uri text, p_external_installation_id text, p_external_enterprise_id text, p_display_label text, p_token_store_key text, p_granted_capabilities jsonb, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.chat_installations; v_key text := 'slack:installation:' || p_external_installation_id;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select * into r from public.chat_installations where id = p_installation for update;
  if not found then raise exception 'installation not found'; end if;
  if not exists (
    select 1 from public.brewery_users
    where brewery_id = r.brewery_id and user_id = p_actor and 'admin' = any(roles)
  ) then raise exception 'permission denied: brewery admin required' using errcode = '42501'; end if;
  if r.oauth_intent_hash is distinct from p_state_hash then raise exception 'oauth state mismatch'; end if;
  if r.oauth_consumed_at is not null then
    if r.state = 'active' and r.external_installation_id = p_external_installation_id
       and r.token_store_key = v_key then
      return jsonb_build_object('installation_id', r.id, 'replayed', true);
    end if;
    raise exception 'oauth state already used';
  end if;
  if r.oauth_expires_at < now() then raise exception 'oauth state expired'; end if;
  if r.oauth_redirect_uri is distinct from p_redirect_uri then raise exception 'oauth redirect mismatch'; end if;
  if r.oauth_intent_kind = 'reauthorize' and r.external_installation_id <> p_external_installation_id then
    raise exception 'reauthorization returned a different workspace';
  end if;
  if exists (select 1 from public.chat_installations
             where provider = r.provider and external_installation_id = p_external_installation_id
               and state <> 'disconnected' and id <> r.id) then
    raise exception 'workspace is already connected to another brewery';
  end if;
  update public.chat_installations
    set state = 'active', external_installation_id = p_external_installation_id,
        external_enterprise_id = p_external_enterprise_id, display_label = p_display_label,
        token_store_key = v_key, granted_capabilities = coalesce(p_granted_capabilities, '{}'),
        oauth_consumed_at = now(), installed_at = coalesce(installed_at, now()), disabled_at = null,
        last_failure_code = null, last_healthy_at = now(), last_health_checked_at = now(), updated_at = now()
    where id = r.id;
  return jsonb_build_object('installation_id', r.id, 'replayed', false);
end $function$;

CREATE OR REPLACE FUNCTION public.assert_chat_admin(b uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.assert_staff_read(b, array['admin']::public.staff_role[]);
end $function$;

CREATE OR REPLACE FUNCTION public.chat_fanout_deliveries(p_brewery uuid, p_now timestamp with time zone, p_occurrence uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into public.notification_deliveries
    (brewery_id, occurrence_id, destination_id, installation_id, provider, semantic_key, next_attempt_at)
  select o.brewery_id, o.id, d.id, i.id, i.provider, o.semantic_key || ':' || d.id,
         public.chat_quiet_release(p_now,
           coalesce(p.quiet_hours_start, i.quiet_hours_start),
           case when p.quiet_hours_start is not null then p.quiet_hours_end else i.quiet_hours_end end,
           case when p.quiet_hours_start is not null then coalesce(p.quiet_hours_timezone, b.timezone) else coalesce(i.quiet_hours_timezone, b.timezone) end)
    from public.notification_occurrences o
    join public.breweries b on b.id = o.brewery_id
    join public.chat_installations i on i.brewery_id = o.brewery_id and i.state = 'active'
    join public.brewery_users bu on bu.brewery_id = o.brewery_id
      and ('admin' = any(bu.roles) or o.payload->'recipient_roles' ?| bu.roles::text[])
      and ((o.payload->>'assigned_user_id') is null or (o.payload->>'assigned_user_id')::uuid = bu.user_id)
    join public.chat_user_links l on l.installation_id = i.id and l.user_id = bu.user_id and l.state = 'active'
    join public.notification_destinations d on d.installation_id = i.id and d.user_id = bu.user_id
      and d.kind = 'personal' and d.state = 'active'
    left join public.notification_preferences p on p.brewery_id = o.brewery_id and p.user_id = bu.user_id and p.reason = o.reason
    where o.brewery_id = p_brewery and o.state = 'active' and o.reason <> 'operations_digest'
      and (p_occurrence is null or o.id = p_occurrence)
      and coalesce(p.enabled, true)
      and (p.personal_destination_id is null or p.personal_destination_id = d.id)
  on conflict (brewery_id, semantic_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.chat_settings_request_completed(p_brewery uuid, p_user uuid, p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_user and 'admin'=any(roles)
  ) then raise exception 'permission denied' using errcode='42501'; end if;
  return exists(select 1 from private.command_requests
    where actor_id=p_user and request_id=p_request_id and command_name='set_notification_destination' and result is not null);
end $function$;

CREATE OR REPLACE FUNCTION public.find_chat_oauth_intent(p_state_hash text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then return null; end if;
  select * into r from public.chat_installations where oauth_intent_hash = p_state_hash;
  if not found or not exists (
    select 1 from public.brewery_users
    where brewery_id = r.brewery_id and user_id = p_actor and 'admin' = any(roles)
  ) then return null; end if;
  return jsonb_build_object(
    'installation_id', r.id, 'brewery_id', r.brewery_id, 'state', r.state, 'kind', r.oauth_intent_kind,
    'redirect_uri', r.oauth_redirect_uri, 'expires_at', r.oauth_expires_at, 'consumed_at', r.oauth_consumed_at,
    'external_installation_id', r.external_installation_id);
end $function$;

CREATE OR REPLACE FUNCTION public.get_chat_delivery_context(p_delivery uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.chat_assert_job();
  with current_items as materialized (
    select c.* from public.notification_deliveries d
      cross join lateral public.scan_chat_today_candidates(d.brewery_id,p_now) c
      where d.id=p_delivery
  )
  select jsonb_build_object(
    'delivery', jsonb_build_object('id', d.id, 'state', d.state, 'attempt_count', d.attempt_count,
      'provider_conversation_id', d.provider_conversation_id, 'provider_message_id', d.provider_message_id,
      'resolved_at', d.resolved_at, 'semantic_key', d.semantic_key),
    'occurrence', jsonb_build_object('id', o.id, 'reason', o.reason, 'state', o.state, 'subject_type', o.subject_type,
      'subject_id', o.subject_id, 'urgency', o.urgency, 'due_at', o.due_at, 'payload', o.payload, 'semantic_key', o.semantic_key),
    'destination', jsonb_build_object('id', dest.id, 'kind', dest.kind, 'external_destination_id', dest.external_destination_id,
      'state', dest.state, 'user_id', dest.user_id),
    'installation', jsonb_build_object('id', i.id, 'state', i.state, 'external_installation_id', i.external_installation_id,
      'provider', i.provider, 'brewery_id', i.brewery_id),
    'quiet_release_at', case when dest.kind='personal' then greatest(d.next_attempt_at,
      public.chat_quiet_release(p_now, coalesce(p.quiet_hours_start,i.quiet_hours_start),
        case when p.quiet_hours_start is not null then p.quiet_hours_end else i.quiet_hours_end end,
        case when p.quiet_hours_start is not null then coalesce(p.quiet_hours_timezone,b.timezone) else coalesce(i.quiet_hours_timezone,b.timezone) end)) else null end,
    'external_user_id', (select l.external_user_id from public.chat_user_links l where l.installation_id=i.id and l.user_id=dest.user_id and l.state='active'),
    'source_current', o.reason='operations_digest' or coalesce(c.source_version=o.source_version,false),
    -- A removed/changed-role user gets no provider write. When the source has
    -- resolved, only a still-eligible prior recipient may get a resolved update.
    'recipient_eligible', bu.user_id is not null and
      case when c.subject_id is not null then ('admin'=any(bu.roles) or bu.roles::text[] && c.recipient_roles) and (c.assigned_user_id is null or c.assigned_user_id=dest.user_id)
        else ('admin'=any(bu.roles) or o.payload->'recipient_roles' ?| bu.roles::text[]) and (o.payload->>'assigned_user_id' is null or o.payload->>'assigned_user_id'=dest.user_id::text) end,
    'link_active', exists (select 1 from public.chat_user_links l
      where l.installation_id = i.id and l.user_id = dest.user_id and l.state = 'active'),
    'preference_enabled', coalesce((select p.enabled from public.notification_preferences p
      where p.brewery_id = d.brewery_id and p.user_id = dest.user_id and p.reason = o.reason), true),
    'counts', case when o.reason = 'operations_digest' then
      (select coalesce(jsonb_object_agg(x.reason, x.n), '{}'::jsonb)
         from (select reason, count(*) as n from current_items group by reason) x)
      else null end)
  from public.notification_deliveries d
  join public.notification_occurrences o on o.id = d.occurrence_id
  join public.notification_destinations dest on dest.id = d.destination_id
  join public.chat_installations i on i.id = d.installation_id
  join public.breweries b on b.id=d.brewery_id
  left join public.notification_preferences p on p.brewery_id=d.brewery_id and p.user_id=dest.user_id and p.reason=o.reason
  left join current_items c on c.reason=o.reason and c.subject_type=o.subject_type and c.subject_id=o.subject_id
  left join public.brewery_users bu on bu.brewery_id=d.brewery_id and bu.user_id=dest.user_id
  where d.id = p_delivery;
$function$;

CREATE OR REPLACE FUNCTION public.get_chat_home_items(p_installation uuid, p_external_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  perform public.chat_assert_job();
  select i.brewery_id, l.user_id, bu.roles into r
    from public.chat_installations i
    join public.chat_user_links l on l.installation_id = i.id and l.external_user_id = p_external_user_id and l.state = 'active'
    join public.brewery_users bu on bu.brewery_id = i.brewery_id and bu.user_id = l.user_id
    where i.id = p_installation and i.state = 'active';
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'reason', o.reason, 'state', o.state, 'subject_type', o.subject_type,
      'subject_id', o.subject_id, 'urgency', o.urgency, 'due_at', o.due_at, 'payload', o.payload, 'semantic_key', o.semantic_key)
      order by o.due_at nulls last, o.created_at)
    from public.notification_occurrences o
    where o.brewery_id = r.brewery_id and o.state = 'active' and o.reason <> 'operations_digest'
      and ('admin' = any(r.roles) or o.payload->'recipient_roles' ?| r.roles::text[])
      and ((o.payload->>'assigned_user_id') is null or (o.payload->>'assigned_user_id')::uuid = r.user_id)
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.get_chat_settings_installation(p_brewery uuid, p_installation uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' or not exists (
    select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_actor and 'admin' = any(roles)
  ) then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into i from public.chat_installations where id = p_installation and brewery_id = p_brewery;
  if not found then raise exception 'installation not found'; end if;
  return jsonb_build_object(
    'id', i.id, 'state', i.state, 'external_installation_id', i.external_installation_id, 'updated_at', i.updated_at);
end $function$;

CREATE OR REPLACE FUNCTION public.get_today_items(p_brewery uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS SETOF private.today_candidates
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- definer only to reach the private view; visibility is re-derived from the
  -- caller's own brewery_users row below, never widened.
  select c.*
    from private.today_candidates c
    join public.brewery_users bu on bu.brewery_id = c.brewery_id and bu.user_id = auth.uid()
    where c.brewery_id = p_brewery
      and private.request_scope_allows(p_brewery)
      and (c.reason = 'refused_return' or c.reason = any (public.today_live_reasons()))
      and (c.reason = 'submitted_order' or c.due_at is null or c.due_at <= p_now)
      and ('admin' = any(bu.roles)
           or (bu.roles::text[] && c.recipient_roles and (c.assigned_user_id is null or c.assigned_user_id = auth.uid())))
    order by c.due_at nulls last, c.safe_label
$function$;

CREATE OR REPLACE FUNCTION public.list_chat_user_links(p_brewery uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.assert_chat_admin(p_brewery);
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,u.id::text),
    'roles',bu.roles,'slackIdentity',l.external_user_id,'linkedAt',l.linked_at) order by l.linked_at)
    from public.chat_user_links l join public.chat_installations i on i.id=l.installation_id
    join public.brewery_users bu on bu.user_id=l.user_id and bu.brewery_id=l.brewery_id join auth.users u on u.id=l.user_id
    where l.brewery_id=p_brewery and l.state='active' and i.state<>'disconnected'),'[]');
end $function$;

CREATE OR REPLACE FUNCTION public.resolve_chat_actor(p_provider text, p_external_installation_id text, p_external_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: internal job only' using errcode = '42501';
  end if;
  select i.id as installation_id, i.brewery_id, l.user_id, bu.roles into r
    from public.chat_installations i
    join public.chat_user_links l on l.installation_id = i.id and l.external_user_id = p_external_user_id and l.state = 'active'
    join public.brewery_users bu on bu.brewery_id = i.brewery_id and bu.user_id = l.user_id
    where i.provider = p_provider and i.external_installation_id = p_external_installation_id and i.state = 'active';
  if not found then return null; end if;
  return jsonb_build_object('installation_id', r.installation_id, 'brewery_id', r.brewery_id,
    'external_user_id', p_external_user_id, 'user_id', r.user_id, 'roles', r.roles);
end $function$;

CREATE OR REPLACE FUNCTION public.set_notification_destination(p_brewery uuid, p_installation uuid, p_external_destination_id text, p_request_id uuid, p_actor uuid, p_version timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_result jsonb; i public.chat_installations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and 'admin'=any(roles)) then
    raise exception 'permission denied: brewery admin required' using errcode='42501';
  end if;
  v_replay:=private.claim_command_request_for(p_actor,p_brewery,'set_notification_destination',p_request_id,jsonb_build_object('installation',p_installation,'channel',p_external_destination_id));
  if v_replay is not null then return v_replay; end if;
  select * into i from public.chat_installations where id=p_installation and brewery_id=p_brewery for update;
  if not found then raise exception 'permission denied' using errcode='42501'; end if;
  if i.state <> 'active' or i.updated_at is distinct from p_version then
    raise exception 'installation changed; reload Chat settings';
  end if;
  v_result:=private.set_notification_destination(p_installation,p_external_destination_id);
  return private.complete_command_request_for(p_actor,p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.set_notification_preference(p_brewery uuid, p_reason text, p_enabled boolean, p_quiet_start time without time zone, p_quiet_end time without time zone, p_quiet_tz text, p_set_quiet boolean, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]);
  if p_set_quiet and not public.has_staff_role(p_brewery, array['admin','sales','warehouse','brewer']::public.staff_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery, 'set_notification_preference', p_request_id,
    jsonb_build_object('reason',p_reason,'enabled',p_enabled,'start',p_quiet_start,'end',p_quiet_end,'timezone',p_quiet_tz,'set_quiet',p_set_quiet));
  if v_replay is not null then return v_replay; end if;
  perform private.set_chat_preference(p_brewery, auth.uid(), p_reason, p_enabled);
  if p_set_quiet then
    perform private.set_chat_quiet_hours(p_brewery, auth.uid(), p_quiet_start, p_quiet_end, p_quiet_tz);
  end if;
  return private.complete_command_request(p_request_id, '{"ok":true}');
end $function$;

CREATE OR REPLACE FUNCTION public.unlink_chat_user(p_brewery uuid, p_link uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.chat_user_links; v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales','warehouse','brewer','taproom']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'unlink_chat_user', p_request_id, jsonb_build_object('link',p_link));
  if v_replay is not null then return v_replay; end if;
  select * into l from public.chat_user_links where id = p_link and brewery_id = p_brewery for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  if l.user_id is distinct from auth.uid() and not public.has_staff_role(p_brewery, array['admin']::public.staff_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform private.unlink_chat_identity(l.installation_id, l.user_id);
  return private.complete_command_request(p_request_id, '{"ok":true}');
end $function$;

-- Integration actor authorization uses role unions; connection and generation rechecks remain unchanged.

CREATE OR REPLACE FUNCTION private.supersede_square_publications(p_connection uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_connection public.pos_connections; v_attempt private.square_publications;
  v_menu private.square_menu_publications; v_token_version bigint; v_code text; v_result jsonb;
BEGIN
  SELECT * INTO v_connection FROM public.pos_connections WHERE id=p_connection FOR SHARE;
  SELECT credential_version INTO v_token_version FROM private.integration_tokens
    WHERE provider='square' AND connection_id=p_connection FOR SHARE;
  FOR v_attempt IN SELECT * FROM private.square_publications p WHERE p.connection_id=p_connection
    AND p.status IN ('needs_snapshot','prepared') AND (
      v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS DISTINCT FROM v_connection.credential_version
      OR p.credential_version<>v_connection.credential_version OR p.catalog_generation<>v_connection.catalog_sync_generation
      OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p.brewery_id AND u.user_id=p.actor_id
        AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]))
    FOR UPDATE
  LOOP
    v_code:=CASE WHEN NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=v_attempt.brewery_id
        AND u.user_id=v_attempt.actor_id AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) THEN 'role_changed'
      WHEN v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS NULL THEN 'connection_changed'
      WHEN v_attempt.credential_version<>v_connection.credential_version OR v_token_version<>v_connection.credential_version THEN 'credential_changed'
      ELSE 'catalog_changed' END;
    v_result:=jsonb_build_object('published',false,'superseded',true,'errorCode',v_code);
    UPDATE private.square_publications SET status='superseded',error_code=v_code,result=v_result,finished_at=now()
      WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  END LOOP;
  FOR v_menu IN SELECT * FROM private.square_menu_publications p WHERE p.connection_id=p_connection
    AND p.status='publishing' AND (
      v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS DISTINCT FROM v_connection.credential_version
      OR p.credential_version<>v_connection.credential_version OR p.catalog_generation<>v_connection.catalog_sync_generation
      OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p.brewery_id AND u.user_id=p.actor_id
        AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]))
    FOR UPDATE
  LOOP
    v_code:=CASE WHEN NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=v_menu.brewery_id
        AND u.user_id=v_menu.actor_id AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) THEN 'role_changed'
      WHEN v_connection.id IS NULL OR v_connection.state<>'connected' OR v_token_version IS NULL THEN 'connection_changed'
      WHEN v_menu.credential_version<>v_connection.credential_version OR v_token_version<>v_connection.credential_version THEN 'credential_changed'
      ELSE 'catalog_changed' END;
    v_result:=jsonb_build_object('published',false,'superseded',true,'errorCode',v_code);
    UPDATE private.square_menu_publications SET status='superseded',result=v_result,finished_at=now() WHERE id=v_menu.id;
    PERFORM private.complete_command_request_for(v_menu.actor_id,v_menu.request_id,private.square_menu_publication_state(v_menu.id));
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.advance_square_catalog_sync(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_next_version bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE private.square_catalog_syncs a SET credential_version=p_next_version
    WHERE a.brewery_id=p_brewery AND a.connection_id=p_connection AND a.actor_id=p_actor AND a.request_id=p_request_id
      AND a.credential_version=p_expected_version AND p_next_version>p_expected_version
      AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND 'admin' = ANY(u.roles))
      AND EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
        ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
        WHERE c.brewery_id=p_brewery AND c.id=p_connection AND c.merchant_id=a.merchant_id AND c.state='connected'
          AND c.credential_version=p_next_version AND c.catalog_sync_generation<a.catalog_generation
          AND t.credential_version=p_next_version
          AND NOT EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
            WHERE newer.connection_id=a.connection_id AND newer.catalog_generation>a.catalog_generation));
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $function$;

CREATE OR REPLACE FUNCTION public.advance_square_sales_sync(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_next_version bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE private.square_sales_syncs a SET credential_version=p_next_version
  WHERE a.actor_id=p_actor AND a.request_id=p_request_id AND a.brewery_id=p_brewery AND a.connection_id=p_connection
    AND a.credential_version=p_expected_version AND a.status='in_progress'
    AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND 'admin' = ANY(u.roles))
    AND EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.credential_version=p_next_version
        AND t.credential_version=p_next_version)
  RETURNING true
$function$;

CREATE OR REPLACE FUNCTION public.begin_qbo_disconnect(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid)
 RETURNS TABLE(refresh_token text, replay_result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_token text; v_version bigint; v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState','unresolved');
begin
 if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and 'admin' = ANY(roles)) then raise exception 'permission denied'; end if;
 v_replay:=private.claim_command_request_for(p_actor,p_brewery,'disconnect_qbo',p_request_id,jsonb_build_object('connectionId',p_connection));
 if v_replay is not null then return query select null::text,v_replay; return; end if;
 update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
 where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
 delete from private.integration_tokens t where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
 returning t.refresh_token,t.credential_version into v_token,v_version;
 update public.qbo_connections q set state='disconnected',remote_revocation_state='unresolved',
   credential_version=greatest(q.credential_version,coalesce(v_version,q.credential_version))+1,
   updated_at=now()
 where q.brewery_id=p_brewery and q.id=p_connection and q.state in ('connected','recovery_required');
 if not found then raise exception 'connection not available'; end if;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(p_brewery,p_connection,'disconnected');
 perform private.complete_command_request_for(p_actor,p_request_id,v_result);
 return query select v_token,null::jsonb;
end $function$;

CREATE OR REPLACE FUNCTION public.begin_qbo_oauth(p_brewery uuid, p_redirect_uri text, p_state_hash text, p_provider_intent text, p_request_id uuid, p_requested_scopes text[] DEFAULT ARRAY['com.intuit.quickbooks.accounting'::text])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replay jsonb; v_id uuid;
begin
  perform private.assert_staff_read(p_brewery, array['admin']::public.staff_role[]);
  if p_requested_scopes<>array['com.intuit.quickbooks.accounting']::text[]
    and p_requested_scopes<>array['com.intuit.quickbooks.accounting','indirect-tax.tax-calculation.quickbooks']::text[] then
    raise exception 'oauth scopes invalid';
  end if;
  perform 1 from public.breweries where id=p_brewery for update;
  v_replay := private.claim_command_request(p_brewery, 'begin_qbo_oauth', p_request_id,
    jsonb_build_object('redirectUri',p_redirect_uri,'stateHash',p_state_hash,'providerIntent',p_provider_intent,'requestedScopes',p_requested_scopes));
  if v_replay is not null then return v_replay; end if;
  update private.qbo_oauth_intents set consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
  where brewery_id=p_brewery and exchange_state in ('pending','exchanging');
  insert into private.qbo_oauth_intents(brewery_id,actor_id,state_hash,redirect_uri,provider_intent,requested_scopes,expires_at)
  values(p_brewery,(select auth.uid()),p_state_hash,p_redirect_uri,p_provider_intent,p_requested_scopes,now()+interval '10 minutes') returning id into v_id;
  v_replay := jsonb_build_object('intentId',v_id);
  perform private.complete_command_request(p_request_id,v_replay); return v_replay;
end $function$;

CREATE OR REPLACE FUNCTION public.begin_square_disconnect(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid)
 RETURNS TABLE(access_token text, merchant_id text, replay_result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE request private.command_requests; connection public.pos_connections; token text; token_version bigint; next_version bigint; retry boolean;
  payload_hash bytea:=extensions.digest(jsonb_build_object('connectionId',p_connection)::text,'sha256');
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND 'admin' = ANY(roles)) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=p_brewery FOR UPDATE;
  INSERT INTO private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash)
    VALUES(p_actor,p_brewery,p_request_id,'disconnect_square',payload_hash) ON CONFLICT(actor_id,request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
    IF request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'disconnect_square' OR request.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'request id was already used with a different payload' USING errcode='MG409'; END IF;
    IF request.result IS NOT NULL THEN RETURN QUERY SELECT null::text,null::text,request.result; RETURN; END IF;
    RAISE EXCEPTION 'Square disconnect is still being reconciled' USING errcode='MG409';
  END IF;
  UPDATE private.square_oauth_intents SET consumed_at=coalesce(consumed_at,now()),exchange_state='recovery_required'
    WHERE brewery_id=p_brewery AND exchange_state IN ('pending','exchanging');
  SELECT * INTO connection FROM public.pos_connections WHERE brewery_id=p_brewery AND id=p_connection AND state IN ('connected','recovery_required') FOR UPDATE;
  IF NOT FOUND OR connection.remote_revocation_state='pending' THEN RAISE EXCEPTION 'connection not available'; END IF;
  retry:=connection.state='recovery_required' AND connection.remote_revocation_state='unresolved';
  DELETE FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection
    RETURNING t.access_token,t.credential_version INTO token,token_version;
  IF token IS NULL AND NOT retry THEN RAISE EXCEPTION 'connection credential not available'; END IF;
  next_version:=greatest(connection.credential_version,coalesce(token_version,0))+1;
  UPDATE public.pos_connections SET state='recovery_required',remote_revocation_state='pending',
    last_error='Square authorization revocation is pending',credential_version=next_version,updated_at=now()
    WHERE brewery_id=p_brewery AND id=p_connection AND state IN ('connected','recovery_required');
  IF NOT FOUND THEN RAISE EXCEPTION 'connection not available'; END IF;
  INSERT INTO private.square_disconnects(actor_id,request_id,brewery_id,connection_id,credential_version)
    VALUES(p_actor,p_request_id,p_brewery,p_connection,next_version);
  RETURN QUERY SELECT token,CASE WHEN token IS NULL THEN connection.merchant_id END,null::jsonb;
END $function$;

CREATE OR REPLACE FUNCTION public.cas_integration_tokens(p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid, p_expected_version bigint, p_access_token text, p_refresh_token text, p_received_at timestamp with time zone, p_access_seconds integer, p_refresh_seconds integer, p_hard_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_version bigint;
BEGIN
  IF p_provider='square' THEN
    PERFORM 1 FROM public.pos_connections p WHERE p.brewery_id=p_brewery AND p.id=p_connection
      AND p.state='connected' AND p.credential_version=p_expected_version FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  UPDATE private.integration_tokens t SET access_token=p_access_token,refresh_token=p_refresh_token,
    credential_version=credential_version+1,updated_at=now()
  WHERE t.brewery_id=p_brewery AND t.provider=p_provider AND t.connection_id=p_connection AND t.credential_version=p_expected_version
    AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
      AND ((p_provider='square' AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) OR (p_provider='qbo' AND u.roles && ARRAY['admin','sales']::public.staff_role[])))
    AND ((p_provider='qbo' AND EXISTS(SELECT 1 FROM public.qbo_connections q WHERE q.brewery_id=p_brewery AND q.id=p_connection AND q.state='connected'))
      OR (p_provider='square' AND EXISTS(SELECT 1 FROM public.pos_connections p WHERE p.brewery_id=p_brewery AND p.id=p_connection AND p.state='connected')))
  RETURNING credential_version INTO v_version;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_provider='qbo' THEN
    UPDATE public.qbo_connections SET access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),
      refresh_expires_at=CASE WHEN p_refresh_seconds IS NULL THEN null ELSE p_received_at+make_interval(secs=>p_refresh_seconds) END,
      refresh_hard_expires_at=CASE WHEN p_hard_seconds IS NULL THEN refresh_hard_expires_at ELSE p_received_at+make_interval(secs=>p_hard_seconds) END,
      credential_version=v_version,updated_at=now() WHERE brewery_id=p_brewery AND id=p_connection;
  ELSE
    UPDATE public.pos_connections SET access_expires_at=p_received_at+make_interval(secs=>p_access_seconds),credential_version=v_version,updated_at=now()
      WHERE brewery_id=p_brewery AND id=p_connection AND provider='square';
    PERFORM private.supersede_square_publications(p_connection);
  END IF;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_qbo_oauth(p_state_hash text, p_actor uuid, p_brewery uuid, p_redirect_uri text)
 RETURNS TABLE(intent_id uuid, brewery_id uuid, provider_intent text, requested_scopes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 return query update private.qbo_oauth_intents i set consumed_at=now(),exchange_state='exchanging'
 where i.state_hash=p_state_hash and i.actor_id=p_actor and i.brewery_id=p_brewery and i.redirect_uri=p_redirect_uri
   and i.consumed_at is null and i.exchange_state='pending' and i.expires_at>=now()
   and exists(select 1 from public.brewery_users u where u.brewery_id=i.brewery_id and u.user_id=p_actor and 'admin' = ANY(u.roles))
 returning i.id,i.brewery_id,i.provider_intent,i.requested_scopes;
end $function$;

CREATE OR REPLACE FUNCTION public.claim_square_oauth(p_state_hash text, p_actor uuid, p_brewery uuid, p_redirect_uri text)
 RETURNS TABLE(intent_id uuid, brewery_id uuid, provider_intent text, requested_scopes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY UPDATE private.square_oauth_intents i SET consumed_at=now(),exchange_state='exchanging'
    WHERE i.state_hash=p_state_hash AND i.actor_id=p_actor AND i.brewery_id=p_brewery AND i.redirect_uri=p_redirect_uri
      AND i.consumed_at IS NULL AND i.exchange_state='pending' AND i.expires_at>=now()
      AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=i.brewery_id AND u.user_id=p_actor AND 'admin' = ANY(u.roles))
      AND NOT EXISTS(SELECT 1 FROM public.pos_connections c WHERE c.brewery_id=i.brewery_id AND c.provider='square' AND c.remote_revocation_state='pending')
      AND NOT EXISTS(SELECT 1 FROM private.square_oauth_intents cleanup WHERE cleanup.brewery_id=i.brewery_id AND cleanup.cleanup_state='pending')
    RETURNING i.id,i.brewery_id,i.provider_intent,i.requested_scopes;
END $function$;

CREATE OR REPLACE FUNCTION public.complete_qbo_invoice_sync(p_brewery uuid, p_actor uuid, p_request_id uuid, p_connection uuid, p_realm text, p_observations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_batch private.qbo_invoice_sync_batches; v_request private.command_requests;
  v_target jsonb; v_observation jsonb; v_inv public.invoices; v_push public.qbo_pushes;
  v_entity_type text; v_state text; v_drift boolean; v_paid boolean; v_cash int;
  v_synced int:=0; v_paid_count int:=0; v_voided int:=0; v_deleted int:=0; v_drifted int:=0; v_result jsonb;
begin
  if p_actor is null or not exists(select 1 from public.brewery_users
      where brewery_id=p_brewery and user_id=p_actor and roles && ARRAY['admin','sales']::public.staff_role[]) then
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
    -- Only an absent field belongs to the invoice-only legacy contract.
    v_entity_type:=case when v_target ? 'entityType' then v_target->>'entityType' else 'Invoice' end;
    if v_entity_type is null or v_entity_type not in ('Invoice','CreditMemo') then
      raise exception 'invalid QuickBooks sync entity type';
    end if;
    select * into v_inv from public.invoices where id=(v_target->>'invoiceId')::uuid and brewery_id=p_brewery;
    select * into v_push from public.qbo_pushes where id=(v_target->>'pushId')::uuid and brewery_id=p_brewery
      and invoice_id=v_inv.id and connection_id=p_connection and realm_id=p_realm and status='pushed'
      and qbo_entity_id=v_target->>'remoteId' and entity_type=v_entity_type;
    if v_inv.id is null or v_push.id is null
       or v_entity_type is distinct from (case v_inv.kind when 'invoice' then 'Invoice' else 'CreditMemo' end) or v_inv.qbo_invoice_id is distinct from v_target->>'remoteId'
       or v_inv.qbo_sync_generation is distinct from (v_target->>'generation')::bigint then
      raise exception 'QuickBooks invoice identity changed' using errcode='MG409';
    end if;
    v_state:=v_observation->>'remoteState';
    if v_state is null or v_state not in ('live','voided','deleted')
      or (v_entity_type='CreditMemo' and v_state='voided') then raise exception 'invalid QuickBooks invoice state'; end if;
    v_drift:=false;
    if v_state='live' then
      v_drift:=not (v_observation->>'contentMatches')::boolean
        or (v_push.response ? 'TotalAmt' and round((v_push.response->>'TotalAmt')::numeric*100)::int
          is distinct from (v_observation->>'totalCents')::int)
        or (v_push.response ? 'TotalTax' and round((v_push.response->>'TotalTax')::numeric*100)::int
          is distinct from (v_observation->>'taxCents')::int);
    end if;
    v_cash:=(v_observation->>'cashCollectedCents')::int;
    if v_entity_type='CreditMemo' and (v_cash is distinct from 0 or v_observation->>'paidAt' is not null) then
      raise exception 'invalid QuickBooks credit cash evidence';
    end if;
    if v_cash<0 or v_cash>coalesce((v_observation->>'totalCents')::int,0) then
      raise exception 'invalid QuickBooks cash evidence';
    end if;
    v_paid:=v_entity_type='Invoice' and v_state='live' and v_cash>0
      and (v_observation->>'balanceCents')::int=0 and (v_observation->>'totalCents')::int>0;
    update public.invoices set qbo_remote_state=v_state::public.qbo_remote_state,
      qbo_sync_token=v_observation->>'syncToken',
      qbo_tax_cents=case when v_observation->'taxCents'='null'::jsonb then null else (v_observation->>'taxCents')::int end,
      qbo_total_cents=case when v_observation->'totalCents'='null'::jsonb then null else (v_observation->>'totalCents')::int end,
      -- Credit availability is not the invoice balance consumed by staff payment views.
      qbo_balance_cents=case when v_entity_type='CreditMemo' or v_observation->'balanceCents'='null'::jsonb then null else (v_observation->>'balanceCents')::int end,
      qbo_cash_collected_cents=case when v_entity_type='Invoice' and v_state='live' then v_cash else qbo_cash_collected_cents end,
      qbo_accountant_drift=v_drift,
      paid_at=case when v_entity_type='CreditMemo' then paid_at when v_paid then coalesce(paid_at,nullif(v_observation->>'paidAt','')::timestamptz,now())
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

CREATE OR REPLACE FUNCTION public.complete_qbo_oauth(p_intent uuid, p_actor uuid, p_realm_id text, p_realm_label text, p_access_token text, p_refresh_token text, p_received_at timestamp with time zone, p_access_seconds integer, p_refresh_seconds integer, p_hard_seconds integer, p_granted_scopes text[] DEFAULT NULL::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i private.qbo_oauth_intents; v_id uuid:=private.new_uuid(); v_version bigint; v_scopes text[];
begin
 select * into i from private.qbo_oauth_intents where id=p_intent for update;
 if i.id is null or i.actor_id<>p_actor or i.exchange_state<>'exchanging' or not exists(select 1 from public.brewery_users u where u.brewery_id=i.brewery_id and u.user_id=p_actor and 'admin' = ANY(u.roles)) then raise exception 'oauth state invalid'; end if;
 if p_granted_scopes is not null and not p_granted_scopes<@i.requested_scopes then raise exception 'oauth scopes invalid'; end if;
 v_scopes:=coalesce(p_granted_scopes,i.requested_scopes);
 perform 1 from private.integration_tokens where brewery_id=i.brewery_id and provider='qbo' for update;
 insert into public.qbo_connections(id,brewery_id,realm_id,realm_label,state,access_expires_at,refresh_expires_at,refresh_hard_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
 values(v_id,i.brewery_id,p_realm_id,p_realm_label,'connected',p_received_at+make_interval(secs=>p_access_seconds),case when p_refresh_seconds is null then null else p_received_at+make_interval(secs=>p_refresh_seconds) end,case when p_hard_seconds is null then null else p_received_at+make_interval(secs=>p_hard_seconds) end,'not_requested',null,1,p_actor,now(),v_scopes)
 on conflict(brewery_id) do update set id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.id else excluded.id end,realm_id=excluded.realm_id,realm_label=excluded.realm_label,state='connected',access_expires_at=excluded.access_expires_at,refresh_expires_at=excluded.refresh_expires_at,refresh_hard_expires_at=excluded.refresh_hard_expires_at,remote_revocation_state='not_requested',last_error=null,
   qbo_deposit_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_deposit_item_id end,
   qbo_one_way_fee_item_id=case when qbo_connections.realm_id=excluded.realm_id then qbo_connections.qbo_one_way_fee_item_id end,
   granted_scopes=excluded.granted_scopes,credential_version=qbo_connections.credential_version+1,connected_by=p_actor,updated_at=now()
 returning id,credential_version into v_id,v_version;
 insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
 values(i.brewery_id,'qbo',v_id,p_access_token,p_refresh_token,v_version)
 on conflict(brewery_id,provider) do update set connection_id=excluded.connection_id,access_token=excluded.access_token,refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
 update private.qbo_oauth_intents set exchange_state='completed' where id=i.id;
 insert into private.qbo_connection_events(brewery_id,connection_id,kind) values(i.brewery_id,v_id,'connected'); return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_square_oauth(p_intent uuid, p_actor uuid, p_merchant_id text, p_merchant_label text, p_access_token text, p_refresh_token text, p_access_expires_at timestamp with time zone, p_granted_scopes text[], p_locations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE i private.square_oauth_intents; c public.pos_connections; v_id uuid:=private.new_uuid(); v_version bigint;
  v_sync_result jsonb:=jsonb_build_object('synced',false,'superseded',true,'errorCode','connection_changed');
BEGIN
  SELECT brewery_id INTO i.brewery_id FROM private.square_oauth_intents WHERE id=p_intent AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'oauth state invalid'; END IF;
  PERFORM 1 FROM public.breweries WHERE id=i.brewery_id FOR UPDATE;
  SELECT * INTO i FROM private.square_oauth_intents WHERE id=p_intent FOR UPDATE;
  IF i.id IS NULL OR i.actor_id<>p_actor OR i.exchange_state<>'exchanging'
    OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=i.brewery_id AND u.user_id=p_actor AND 'admin' = ANY(u.roles)) THEN
    RAISE EXCEPTION 'oauth state invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections current_connection WHERE current_connection.provider='square'
      AND current_connection.remote_revocation_state='pending'
      AND (current_connection.brewery_id=i.brewery_id OR current_connection.merchant_id=p_merchant_id))
    OR EXISTS(SELECT 1 FROM private.square_oauth_intents pending WHERE pending.id<>i.id AND pending.cleanup_state='pending'
      AND (pending.brewery_id=i.brewery_id OR pending.cleanup_merchant_id=p_merchant_id)) THEN
    RAISE EXCEPTION 'Square authorization cleanup is still pending' USING errcode='MG409';
  END IF;
  IF p_merchant_id IS NULL OR btrim(p_merchant_id)='' OR p_access_token IS NULL OR p_refresh_token IS NULL
    OR p_granted_scopes IS NULL OR NOT p_granted_scopes<@i.requested_scopes OR jsonb_typeof(p_locations)<>'array' THEN
    RAISE EXCEPTION 'oauth response invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_connections x WHERE x.merchant_id=p_merchant_id AND x.brewery_id<>i.brewery_id AND x.state='connected') THEN
    RAISE EXCEPTION 'Square seller is already connected to another brewery' USING errcode='MG409';
  END IF;
  SELECT current_connection.id,current_connection.merchant_id INTO c.id,c.merchant_id
    FROM public.pos_connections current_connection WHERE current_connection.brewery_id=i.brewery_id
      AND current_connection.provider='square';
  IF c.id IS NOT NULL THEN
    PERFORM 1 FROM private.command_requests request
      JOIN private.square_catalog_syncs sync ON sync.actor_id=request.actor_id AND sync.request_id=request.request_id
      WHERE sync.connection_id=c.id AND request.result IS NULL
      ORDER BY request.actor_id,request.request_id FOR UPDATE OF request;
    UPDATE private.command_requests request SET result=v_sync_result
      FROM private.square_catalog_syncs sync
      WHERE sync.actor_id=request.actor_id AND sync.request_id=request.request_id
        AND sync.connection_id=c.id AND request.result IS NULL;
  END IF;
  SELECT * INTO c FROM public.pos_connections WHERE brewery_id=i.brewery_id AND provider='square' FOR UPDATE;
  IF c.id IS NOT NULL AND c.merchant_id IS DISTINCT FROM p_merchant_id THEN
    IF EXISTS(SELECT 1 FROM public.pos_sales WHERE connection_id=c.id)
      OR EXISTS(SELECT 1 FROM public.pos_sales_coverage WHERE connection_id=c.id) THEN
      RAISE EXCEPTION 'Square seller cannot be replaced while retained sales history exists' USING errcode='MG409';
    END IF;
    EXECUTE $cleanup$UPDATE private.square_publications SET status='superseded',error_code='connection_changed',
      result=jsonb_build_object('published',false,'superseded',true,'errorCode','connection_changed'),finished_at=now()
      WHERE connection_id=$1 AND status IN ('needs_snapshot','prepared')$cleanup$ USING c.id;
    EXECUTE $cleanup$UPDATE private.square_menu_publications SET status='superseded',
      result=jsonb_build_object('published',false,'superseded',true,'errorCode','connection_changed'),finished_at=now()
      WHERE connection_id=$1 AND status='publishing'$cleanup$ USING c.id;
    EXECUTE 'DELETE FROM public.pos_catalog_ownership WHERE connection_id=$1' USING c.id;
    EXECUTE 'DELETE FROM public.pos_catalog_items WHERE connection_id=$1' USING c.id;
    DELETE FROM public.pos_menus WHERE connection_id=c.id;
    DELETE FROM public.pos_item_mappings WHERE connection_id=c.id;
    DELETE FROM public.pos_catalog_variations WHERE connection_id=c.id;
    DELETE FROM public.pos_locations WHERE connection_id=c.id;
  END IF;
  IF c.id IS NOT NULL THEN
    UPDATE private.command_requests request SET result=v_sync_result
      FROM private.square_catalog_syncs sync
      WHERE sync.actor_id=request.actor_id AND sync.request_id=request.request_id
        AND sync.connection_id=c.id AND request.result IS NULL;
  END IF;
  INSERT INTO public.pos_connections(id,brewery_id,provider,merchant_id,merchant_label,state,access_expires_at,remote_revocation_state,last_error,credential_version,connected_by,updated_at,granted_scopes)
    VALUES(v_id,i.brewery_id,'square',p_merchant_id,p_merchant_label,'connected',p_access_expires_at,'not_requested',null,1,p_actor,now(),p_granted_scopes)
  ON CONFLICT(brewery_id,provider) DO UPDATE SET merchant_id=excluded.merchant_id,merchant_label=excluded.merchant_label,state='connected',
    access_expires_at=excluded.access_expires_at,remote_revocation_state='not_requested',last_error=null,
    credential_version=pos_connections.credential_version+1,
    catalog_sync_generation=CASE WHEN pos_connections.merchant_id IS DISTINCT FROM excluded.merchant_id THEN 0 ELSE pos_connections.catalog_sync_generation END,
    connected_by=p_actor,updated_at=now(),granted_scopes=excluded.granted_scopes
  RETURNING id,credential_version INTO v_id,v_version;
  INSERT INTO private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
    VALUES(i.brewery_id,'square',v_id,p_access_token,p_refresh_token,v_version)
  ON CONFLICT(brewery_id,provider) DO UPDATE SET connection_id=excluded.connection_id,access_token=excluded.access_token,
    refresh_token=excluded.refresh_token,credential_version=excluded.credential_version,updated_at=now();
  INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
    SELECT i.brewery_id,v_id,x.id,x.name,x.status,true,now()
    FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text)
    WHERE x.id IS NOT NULL AND btrim(x.id)<>''
  ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
    external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
  UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=v_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text) WHERE x.id=l.external_location_id);
  UPDATE private.square_oauth_intents SET exchange_state='completed' WHERE id=i.id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_qbo_disconnect(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_revoked boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb:=jsonb_build_object('disconnected',true,'remoteRevocationState',case when p_revoked then 'confirmed' else 'unresolved' end);
begin
 update public.qbo_connections q set remote_revocation_state=case when p_revoked then 'confirmed' else 'unresolved' end,last_error=case when p_revoked then null else 'Remote revocation could not be confirmed' end,updated_at=now()
 where q.brewery_id=p_brewery and q.id=p_connection and q.state='disconnected' and exists(select 1 from public.brewery_users u where u.brewery_id=p_brewery and u.user_id=p_actor and 'admin' = ANY(u.roles));
 if not found then raise exception 'disconnect reconciliation is not available'; end if;
 if not p_revoked then insert into private.qbo_connection_events(brewery_id,connection_id,kind,detail) values(p_brewery,p_connection,'remote_revocation_unresolved','Remote revocation could not be confirmed'); end if;
 return private.complete_command_request_for(p_actor,p_request_id,v_result);
end
$function$;

CREATE OR REPLACE FUNCTION public.finish_qbo_push(p_brewery uuid, p_push uuid, p_actor uuid, p_status text, p_qbo_entity_id text, p_error text, p_response jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_push public.qbo_pushes; v_replay jsonb; v_result jsonb;
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery and user_id=p_actor and roles && ARRAY['admin','sales']::public.staff_role[])
    then raise insufficient_privilege using message='permission denied'; end if;
  select * into v_push from public.qbo_pushes where id=p_push and brewery_id=p_brewery for update;
  if not found then raise exception 'QuickBooks push not found'; end if;
  perform 1 from public.qbo_connections
    where brewery_id=p_brewery and id=v_push.connection_id and realm_id=v_push.realm_id and state='connected'
    for share;
  if not found then raise exception 'QuickBooks connection changed; pending push remains frozen and cannot be finalized by another connection' using errcode='MG409'; end if;
  if p_request_id<>v_push.finish_request_id then raise exception 'invalid QuickBooks finish identity' using errcode='MG409'; end if;
  if p_status not in ('pushed','push_failed') then raise exception 'invalid QuickBooks push result'; end if;
  if p_status='pushed' and nullif(btrim(p_qbo_entity_id),'') is null then raise exception 'QuickBooks entity id required'; end if;
  v_replay:=private.claim_command_request_for(p_actor,p_brewery,'finish_qbo_push',p_request_id,
    jsonb_build_object('pushId',p_push,'status',p_status,'remoteId',p_qbo_entity_id,'error',p_error,'response',p_response));
  if v_replay is not null then return v_replay; end if;
  if v_push.status<>'pending' then raise exception 'QuickBooks push is already finished' using errcode='MG409'; end if;
  update public.qbo_pushes set status=p_status::public.qbo_sync_status,qbo_entity_id=p_qbo_entity_id,
    response=p_response,error=left(p_error,500),finished_at=now() where id=p_push;
  if p_status='pushed' then
    update public.invoices set qbo_invoice_id=p_qbo_entity_id,qbo_sync_status='pushed',qbo_sync_error=null,
      qbo_sync_token=p_response->>'SyncToken',qbo_remote_state='live',qbo_accountant_drift=false,
      qbo_tax_cents=case when p_response ? 'TotalTax' then round((p_response->>'TotalTax')::numeric*100)::int end,
      qbo_total_cents=case when p_response ? 'TotalAmt' then round((p_response->>'TotalAmt')::numeric*100)::int end,
      qbo_balance_cents=case when p_response ? 'Balance' then round((p_response->>'Balance')::numeric*100)::int end
      where id=v_push.invoice_id and brewery_id=p_brewery;
  else
    update public.invoices set qbo_sync_status='push_failed',qbo_sync_error=left(p_error,500)
      where id=v_push.invoice_id and brewery_id=p_brewery;
  end if;
  v_result:=jsonb_build_object('pushId',p_push,'status',p_status,'remoteId',p_qbo_entity_id);
  return private.complete_command_request_for(p_actor,p_request_id,v_result);
end $function$;

CREATE OR REPLACE FUNCTION public.finish_square_menu_publication(p_brewery uuid, p_publication uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_menu_publications; v_child private.square_publications;
  v_result jsonb; v_items jsonb; v_error text; v_partial boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_menu_publications
    WHERE id=p_publication AND brewery_id=p_brewery AND actor_id=p_actor;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_menu_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.manifest) e JOIN private.square_publications p
    ON p.actor_id=v_attempt.actor_id AND p.request_id=(e->>'requestId')::uuid
      AND p.menu_publication_id=v_attempt.id WHERE p.status='rejected') THEN
    SELECT p.error_code INTO v_error FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
      JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
        AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id
      WHERE p.status='rejected' ORDER BY x.ord LIMIT 1;
    FOR v_child IN
      UPDATE private.square_publications SET status='superseded',error_code='menu_rejected',
        result=jsonb_build_object('published',false,'superseded',true,'errorCode','menu_rejected'),finished_at=now()
      WHERE menu_publication_id=v_attempt.id AND status IN ('needs_snapshot','prepared') RETURNING *
    LOOP
      PERFORM private.complete_command_request_for(v_child.actor_id,v_child.request_id,
        private.square_publication_state(v_child.id));
    END LOOP;
    SELECT coalesce(jsonb_agg(jsonb_build_object('brandId',x.e->>'brandId','requestId',x.e->>'requestId',
      'status',coalesce(p.status,'not_attempted'),'result',p.result) ORDER BY x.ord),'[]'::jsonb),
      coalesce(bool_or(p.status='succeeded'),false) INTO v_items,v_partial
    FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
    LEFT JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
      AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id;
    v_result:=jsonb_build_object('published',false,'rejected',true,'partial',v_partial,
      'errorCode',v_error,'items',v_items);
    UPDATE private.square_menu_publications SET status='rejected',error_code=v_error,result=v_result,finished_at=now()
      WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,
      private.square_menu_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.manifest) e WHERE NOT EXISTS(
    SELECT 1 FROM private.square_publications p WHERE p.actor_id=v_attempt.actor_id
      AND p.request_id=(e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id AND p.status='succeeded'))
  THEN RAISE EXCEPTION 'Square menu publication is incomplete' USING errcode='MG409'; END IF;
  SELECT coalesce(jsonb_agg(p.result ORDER BY x.ord),'[]'::jsonb) INTO v_items
    FROM jsonb_array_elements(v_attempt.manifest) WITH ORDINALITY x(e,ord)
    JOIN private.square_publications p ON p.actor_id=v_attempt.actor_id
      AND p.request_id=(x.e->>'requestId')::uuid AND p.menu_publication_id=v_attempt.id;
  v_result:=jsonb_build_object('published',true,'items',v_items);
  UPDATE private.square_menu_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_menu_publication_state(v_attempt.id));
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid, p_error_code text, p_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications; v_result jsonb; v_object jsonb; v_maps jsonb; v_source_variation jsonb;
  v_item text; v_variation text; v_item_version bigint; v_variation_version bigint; v_present boolean; v_format uuid;
  v_expected_versions jsonb; v_changed_variations jsonb; v_request_variation jsonb; v_response_variation jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'square-publish:'||v_attempt.connection_id::text||':'||v_attempt.brand_id::text||':'||v_attempt.catalog_group,0));
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status IN ('succeeded','rejected','superseded') THEN RETURN v_attempt.result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=v_attempt.connection_id AND c.brewery_id=p_brewery AND c.state='connected'
      AND c.credential_version=v_attempt.credential_version AND c.catalog_sync_generation=v_attempt.catalog_generation
      AND t.credential_version=v_attempt.credential_version)
  THEN RAISE EXCEPTION 'Square publication was superseded' USING errcode='MG409'; END IF;
  IF p_error_code IS NOT NULL THEN
    IF p_error_code NOT IN ('version_mismatch','provider_rejected','provider_missing','provider_invalid') OR p_response IS NOT NULL
      OR (v_attempt.status='needs_snapshot' AND p_error_code NOT IN ('provider_missing','provider_invalid'))
    THEN RAISE EXCEPTION 'Square publication result is invalid'; END IF;
    v_result:=jsonb_build_object('published',false,'conflict',p_error_code='version_mismatch','errorCode',p_error_code);
    UPDATE private.square_publications SET status='rejected',error_code=p_error_code,result=v_result,finished_at=now() WHERE id=v_attempt.id;
    PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
    RETURN v_result;
  END IF;
  IF v_attempt.status<>'prepared' THEN RAISE EXCEPTION 'Square publication was not prepared' USING errcode='MG409'; END IF;
  v_object:=p_response->'catalogObject'; v_maps:=p_response->'idMappings';
  v_expected_versions:=v_attempt.expected_variation_versions->'versions';
  v_changed_variations:=v_attempt.expected_variation_versions->'changed';
  IF jsonb_typeof(v_object)<>'object' OR jsonb_typeof(v_maps)<>'array' THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    SELECT e->>'object_id' INTO v_item FROM jsonb_array_elements(v_maps) e
      WHERE e->>'client_object_id'=(v_attempt.request_body::jsonb#>>'{object,id}');
  ELSE v_item:=v_attempt.external_item_id; END IF;
  IF v_object->>'type'='ITEM' THEN
    IF v_object->>'id'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=(v_object->>'version')::bigint;
    IF v_attempt.expected_item_version IS NOT NULL AND v_item_version<=v_attempt.expected_item_version
      THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
  ELSIF v_object->>'type'='ITEM_VARIATION' THEN
    IF v_object#>>'{item_variation_data,item_id}'<>v_item THEN RAISE EXCEPTION 'Square publication response identity is invalid'; END IF;
    v_item_version:=v_attempt.expected_item_version;
  ELSE RAISE EXCEPTION 'Square publication response type is invalid'; END IF;
  IF nullif(btrim(v_item),'') IS NULL OR v_item_version IS NULL OR v_item_version<0
    THEN RAISE EXCEPTION 'Square publication response is invalid'; END IF;
  v_present:=EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
    WHERE coalesce((e->>'present')::boolean,false));
  INSERT INTO public.pos_catalog_items(brewery_id,connection_id,brand_id,catalog_group,external_item_id,ownership,retired_at)
  VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_item,v_attempt.ownership_intent,
    CASE WHEN v_present THEN null ELSE now() END)
  ON CONFLICT(connection_id,brand_id,catalog_group) DO UPDATE SET external_item_id=excluded.external_item_id,
    ownership=excluded.ownership,retired_at=excluded.retired_at,updated_at=now();
  FOR v_source_variation IN SELECT value FROM jsonb_array_elements(v_attempt.source_snapshot->'variations')
  LOOP
    v_format:=(v_source_variation->>'formatId')::uuid;
    v_variation:=v_source_variation->>'externalVariationId';
    IF v_variation IS NULL AND coalesce((v_source_variation->>'present')::boolean,false) THEN
      SELECT e->>'object_id' INTO v_variation FROM jsonb_array_elements(v_maps) e
        WHERE e->>'client_object_id'='#mgr-variation-'||(v_source_variation->>'formatId');
    END IF;
    IF v_variation IS NULL THEN CONTINUE; END IF;
    IF v_object->>'type'='ITEM' THEN
      SELECT e,(e->>'version')::bigint INTO v_response_variation,v_variation_version
        FROM jsonb_array_elements(v_object#>'{item_data,variations}') e
        WHERE e->>'id'=v_variation;
      SELECT e INTO v_request_variation FROM jsonb_array_elements(v_attempt.request_body::jsonb#>'{object,item_data,variations}') e
        WHERE e->>'id'=v_variation;
    ELSIF v_object->>'id'=v_variation THEN
      v_response_variation:=v_object; v_variation_version:=(v_object->>'version')::bigint;
      v_request_variation:=v_attempt.request_body::jsonb->'object';
    ELSE CONTINUE;
    END IF;
    IF v_variation_version IS NULL OR v_variation_version<0 OR
      ((v_expected_versions ? v_variation) AND
        (v_variation_version<(v_expected_versions->>v_variation)::bigint
          OR (v_changed_variations ? v_variation) AND v_variation_version=(v_expected_versions->>v_variation)::bigint
          OR v_request_variation IS NULL OR NOT (v_response_variation @> (v_request_variation-'version'))))
    THEN RAISE EXCEPTION 'Square publication response version is invalid'; END IF;
    INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,
      external_item_name,external_variation_name,source_version,available,last_seen_at)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_variation,v_attempt.source_snapshot->>'brand',
      v_source_variation->>'format',v_variation_version,true,now())
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,external_variation_name=excluded.external_variation_name,
      source_version=excluded.source_version,available=true,last_seen_at=excluded.last_seen_at;
    INSERT INTO public.pos_item_mappings(brewery_id,connection_id,external_item_id,external_item_name,
      external_variation_id,format_id,sku_id,ignored)
    VALUES(p_brewery,v_attempt.connection_id,v_item,v_attempt.source_snapshot->>'brand',v_variation,v_format,null,false)
    ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET
      external_item_name=excluded.external_item_name,format_id=excluded.format_id,sku_id=null,ignored=false;
    INSERT INTO public.pos_catalog_ownership(brewery_id,connection_id,brand_id,catalog_group,format_id,
      external_item_id,external_variation_id,retired_at)
    VALUES(p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,v_item,v_variation,
      CASE WHEN coalesce((v_source_variation->>'present')::boolean,false) THEN null ELSE now() END)
    ON CONFLICT(connection_id,format_id,brand_id) DO UPDATE SET external_item_id=excluded.external_item_id,
      external_variation_id=excluded.external_variation_id,retired_at=excluded.retired_at,updated_at=now();
    INSERT INTO private.square_publication_events(publication_id,brewery_id,connection_id,brand_id,catalog_group,
      format_id,external_item_id,external_variation_id,ownership,present)
    VALUES(v_attempt.id,p_brewery,v_attempt.connection_id,v_attempt.brand_id,v_attempt.catalog_group,v_format,
      v_item,v_variation,v_attempt.ownership_intent,coalesce((v_source_variation->>'present')::boolean,false));
  END LOOP;
  v_result:=jsonb_build_object('published',v_present,'retired',NOT v_present,'externalItemId',v_item,
    'ownership',v_attempt.ownership_intent,'variations',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'formatId',o.format_id,'externalVariationId',o.external_variation_id,'retired',o.retired_at IS NOT NULL)
      ORDER BY o.format_id),'[]'::jsonb) FROM public.pos_catalog_ownership o WHERE o.connection_id=v_attempt.connection_id
        AND o.brand_id=v_attempt.brand_id AND o.catalog_group=v_attempt.catalog_group));
  UPDATE private.square_publications SET status='succeeded',result=v_result,finished_at=now() WHERE id=v_attempt.id;
  PERFORM private.complete_command_request_for(v_attempt.actor_id,v_attempt.request_id,private.square_publication_state(v_attempt.id));
  RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR no_data_found THEN
  RAISE EXCEPTION 'Square publication response is invalid';
END $function$;

CREATE OR REPLACE FUNCTION public.lease_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid)
 RETURNS TABLE(access_token text, request_body text, superseded boolean, refresh_token text, access_expires_at timestamp with time zone, merchant_id text, credential_version bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  SELECT * INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication AND p.brewery_id=p_brewery;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT p.* INTO v_attempt FROM private.square_publications p WHERE p.id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN
    RETURN QUERY SELECT null::text,null::text,true,null::text,null::timestamptz,null::text,null::bigint;
    RETURN;
  END IF;
  RETURN QUERY SELECT t.access_token,p.request_body,false,t.refresh_token,c.access_expires_at,c.merchant_id,c.credential_version
  FROM private.square_publications p
  JOIN public.pos_connections c ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.provider='square'
    AND c.state='connected' AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
  JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
    AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
  WHERE p.id=p_publication AND p.status IN ('needs_snapshot','prepared') AND (
    (p.external_item_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.pos_catalog_items i
      WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id AND i.catalog_group=p.catalog_group))
    OR EXISTS(SELECT 1 FROM public.pos_catalog_items i WHERE i.connection_id=p.connection_id AND i.brand_id=p.brand_id
      AND i.catalog_group=p.catalog_group AND i.external_item_id=p.external_item_id AND i.ownership=p.ownership_intent)
    OR (p.ownership_intent='adopted' AND p.adopt_variation_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.pos_catalog_variations v JOIN public.pos_item_mappings m
        ON m.connection_id=v.connection_id AND m.external_item_id=v.external_item_id
          AND m.external_variation_id=v.external_variation_id AND NOT m.ignored
      JOIN public.formats f ON f.id=m.format_id AND f.brewery_id=m.brewery_id AND f.price_group_id=(SELECT price_group_id FROM public.brands WHERE id=p.brand_id AND brewery_id=p.brewery_id)
      WHERE v.connection_id=p.connection_id AND v.external_item_id=p.external_item_id
        AND v.external_variation_id=p.adopt_variation_id AND v.available)));
END $function$;

CREATE OR REPLACE FUNCTION public.mark_qbo_authorization_failed(p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint, p_customer uuid DEFAULT NULL::uuid, p_invoice uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_changed integer;
begin
  -- Refresh CAS locks the credential before updating connection health too.
  perform 1 from private.integration_tokens t
    where t.brewery_id=p_brewery and t.provider='qbo' and t.connection_id=p_connection
      and t.credential_version=p_expected_version for update;
  if not found then return false; end if;

  update public.qbo_connections c
    set state='recovery_required', last_error='QuickBooks authorization expired or was revoked', updated_at=now()
    where c.brewery_id=p_brewery and c.id=p_connection and c.state='connected'
      and c.credential_version=p_expected_version
      and (exists(select 1 from public.brewery_users u
        where u.brewery_id=p_brewery and u.user_id=p_actor and u.roles && ARRAY['admin','sales']::public.staff_role[])
        or exists(select 1 from public.read_portal_qbo_payment(p_brewery,p_customer,p_invoice,p_actor) claim
          where claim.connection_id=p_connection and claim.credential_version=p_expected_version));
  get diagnostics v_changed = row_count;
  return v_changed=1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_square_authorization_failed(p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE changed integer;
BEGIN
  UPDATE public.pos_connections c SET state='recovery_required',last_error='Square authorization expired or was revoked',updated_at=now()
    WHERE c.brewery_id=p_brewery AND c.id=p_connection AND c.provider='square' AND c.state='connected'
      AND c.credential_version=p_expected_version
      AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
        AND u.roles && ARRAY['admin','warehouse']::public.staff_role[])
      AND EXISTS(SELECT 1 FROM private.integration_tokens t WHERE t.brewery_id=p_brewery AND t.provider='square'
        AND t.connection_id=p_connection AND t.credential_version=p_expected_version);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 THEN PERFORM private.supersede_square_publications(p_connection); END IF;
  RETURN changed=1;
END $function$;

CREATE OR REPLACE FUNCTION public.pos_order_versions()
 RETURNS TABLE(brewery_id uuid, connection_id uuid, external_order_id text, source_version bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT o.brewery_id,o.connection_id,o.external_order_id,max(o.source_version)
  FROM private.square_order_snapshots o
  WHERE public.has_staff_role(o.brewery_id, ARRAY['admin','warehouse']::public.staff_role[])
  GROUP BY o.brewery_id,o.connection_id,o.external_order_id
$function$;

CREATE OR REPLACE FUNCTION public.prepare_square_publication(p_brewery uuid, p_publication uuid, p_actor uuid, p_request_body text, p_item_version bigint, p_variation_versions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_publications; v_body jsonb; v_object jsonb;
BEGIN
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication AND brewery_id=p_brewery;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor
    AND u.roles && ARRAY['admin','warehouse']::public.staff_role[]) THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  PERFORM private.supersede_square_publications(v_attempt.connection_id);
  SELECT * INTO v_attempt FROM private.square_publications WHERE id=p_publication FOR UPDATE;
  IF v_attempt.status='superseded' THEN RETURN false; END IF;
  SELECT p.* INTO v_attempt FROM private.square_publications p JOIN public.pos_connections c
    ON c.id=p.connection_id AND c.brewery_id=p.brewery_id AND c.state='connected'
      AND c.credential_version=p.credential_version AND c.catalog_sync_generation=p.catalog_generation
    JOIN private.integration_tokens t ON t.brewery_id=p.brewery_id AND t.provider='square'
      AND t.connection_id=p.connection_id AND t.credential_version=p.credential_version
    WHERE p.id=p_publication AND p.brewery_id=p_brewery FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF v_attempt.status='prepared' THEN RETURN v_attempt.request_body=p_request_body; END IF;
  IF v_attempt.status<>'needs_snapshot' THEN RAISE EXCEPTION 'Square publication is already finished' USING errcode='MG409'; END IF;
  BEGIN v_body:=p_request_body::jsonb; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Square publication body is invalid'; END;
  v_object:=v_body->'object';
  IF v_body->>'idempotency_key'<>v_attempt.provider_key::text OR jsonb_typeof(v_object)<>'object'
    OR jsonb_typeof(p_variation_versions)<>'object'
    OR jsonb_typeof(p_variation_versions->'versions')<>'object'
    OR jsonb_typeof(p_variation_versions->'changed')<>'array'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_variation_versions->'changed') e WHERE jsonb_typeof(e)<>'string')
    OR p_request_body LIKE '%"sold_out"%' OR p_request_body LIKE '%"sold_out_valid_until"%'
    OR p_request_body LIKE '%access_token%' THEN RAISE EXCEPTION 'Square publication body is invalid'; END IF;
  IF v_attempt.external_item_id IS NULL THEN
    IF v_object->>'type'<>'ITEM' OR left(v_object->>'id',1)<>'#' OR p_item_version IS NOT NULL
      THEN RAISE EXCEPTION 'Square create publication is invalid'; END IF;
  ELSIF p_item_version IS NULL OR v_object->>'id'<>v_attempt.external_item_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_attempt.source_snapshot->'variations') e
      WHERE e->>'externalVariationId'=v_object->>'id')
  THEN RAISE EXCEPTION 'Square update publication is invalid'; END IF;
  UPDATE private.square_publications SET request_body=p_request_body,expected_item_version=p_item_version,
    expected_variation_versions=coalesce(p_variation_versions,'{}'::jsonb),status='prepared' WHERE id=v_attempt.id;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.read_integration_tokens(p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid)
 RETURNS TABLE(access_token text, refresh_token text, credential_version bigint, access_expires_at timestamp with time zone, refresh_expires_at timestamp with time zone, refresh_hard_expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT t.access_token,t.refresh_token,t.credential_version,coalesce(q.access_expires_at,p.access_expires_at),q.refresh_expires_at,q.refresh_hard_expires_at
  FROM private.integration_tokens t
  LEFT JOIN public.qbo_connections q ON p_provider='qbo' AND q.brewery_id=t.brewery_id AND q.id=t.connection_id
  LEFT JOIN public.pos_connections p ON p_provider='square' AND p.brewery_id=t.brewery_id AND p.id=t.connection_id
  WHERE t.brewery_id=p_brewery AND t.provider=p_provider AND t.connection_id=p_connection
    AND EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND u.roles && ARRAY['admin','sales']::public.staff_role[])
    AND ((p_provider='qbo' AND q.state='connected') OR (p_provider='square' AND p.state='connected'))
$function$;

CREATE OR REPLACE FUNCTION public.record_qbo_invoice_sync_failure(p_brewery uuid, p_actor uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.brewery_users where brewery_id=p_brewery
    and user_id=p_actor and roles && ARRAY['admin','sales']::public.staff_role[]) then
    raise insufficient_privilege using message='permission denied';
  end if;
  -- A late failed response cannot overwrite a concurrently committed success.
  update private.qbo_invoice_sync_batches set failed_at=now()
    where brewery_id=p_brewery and actor_id=p_actor and request_id=p_request_id and completed_at is null and superseded_at is null;
end $function$;

CREATE OR REPLACE FUNCTION public.record_square_catalog_snapshot(p_brewery uuid, p_connection uuid, p_actor uuid, p_expected_version bigint, p_request_id uuid, p_locations jsonb, p_variations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE request private.command_requests; attempt private.square_catalog_syncs; connection public.pos_connections;
  token_version bigint; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brewery_users u WHERE u.brewery_id=p_brewery AND u.user_id=p_actor AND 'admin' = ANY(u.roles)) THEN
    RAISE insufficient_privilege USING message='permission denied'; END IF;
  IF jsonb_typeof(p_locations)<>'array' OR jsonb_typeof(p_variations)<>'array' THEN RAISE EXCEPTION 'Square snapshot invalid'; END IF;
  SELECT * INTO request FROM private.command_requests WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR request.brewery_id IS DISTINCT FROM p_brewery OR request.command_name<>'sync_square_catalog'
    OR request.payload_hash<>extensions.digest('{}'::jsonb::text,'sha256') THEN
    RAISE EXCEPTION 'Square catalog sync request is invalid' USING errcode='MG409';
  END IF;
  IF request.result IS NOT NULL THEN RETURN request.result; END IF;
  SELECT * INTO attempt FROM private.square_catalog_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR attempt.brewery_id<>p_brewery OR attempt.connection_id<>p_connection OR attempt.credential_version<>p_expected_version THEN
    RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  SELECT * INTO connection FROM public.pos_connections c WHERE c.brewery_id=p_brewery AND c.id=p_connection FOR UPDATE;
  SELECT credential_version INTO token_version FROM private.integration_tokens t
    WHERE t.brewery_id=p_brewery AND t.provider='square' AND t.connection_id=p_connection FOR UPDATE;
  IF connection.id IS NULL OR connection.provider<>'square' OR connection.state<>'connected'
    OR connection.merchant_id<>attempt.merchant_id OR connection.credential_version<>p_expected_version
    OR connection.catalog_sync_generation>=attempt.catalog_generation OR token_version IS DISTINCT FROM p_expected_version
    OR EXISTS(SELECT 1 FROM private.square_catalog_syncs newer
      WHERE newer.connection_id=attempt.connection_id AND newer.catalog_generation>attempt.catalog_generation) THEN
    RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
    SELECT p_brewery,p_connection,x.id,x.name,x.status,true,now() FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text)
    WHERE x.id IS NOT NULL AND btrim(x.id)<>''
  ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
    external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
  UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=p_connection
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_locations) AS x(id text,name text,status text) WHERE x.id=l.external_location_id);
  INSERT INTO public.pos_catalog_variations(brewery_id,connection_id,external_item_id,external_variation_id,external_item_name,
    external_variation_name,source_version,available,last_seen_at)
    SELECT p_brewery,p_connection,x."itemId",x."variationId",x."itemName",x."variationName",x.version,x.available,now()
    FROM jsonb_to_recordset(p_variations) AS x("itemId" text,"itemName" text,"variationId" text,"variationName" text,version bigint,available boolean)
    WHERE x."itemId" IS NOT NULL AND btrim(x."itemId")<>'' AND x."variationId" IS NOT NULL AND btrim(x."variationId")<>'' AND x.version>=0 AND x.available IS NOT NULL
  ON CONFLICT(connection_id,external_item_id,external_variation_id) DO UPDATE SET external_item_name=excluded.external_item_name,
    external_variation_name=excluded.external_variation_name,source_version=excluded.source_version,available=excluded.available,last_seen_at=excluded.last_seen_at
    WHERE public.pos_catalog_variations.source_version<=excluded.source_version;
  UPDATE public.pos_catalog_variations v SET available=false,last_seen_at=now() WHERE v.connection_id=p_connection
    AND v.last_seen_at<attempt.created_at
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_variations) AS x("itemId" text,"variationId" text) WHERE x."itemId"=v.external_item_id AND x."variationId"=v.external_variation_id);
  UPDATE public.pos_connections SET catalog_sync_generation=attempt.catalog_generation,updated_at=now()
    WHERE id=p_connection AND brewery_id=p_brewery AND catalog_sync_generation<attempt.catalog_generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM private.supersede_square_publications(p_connection);
  result:=jsonb_build_object('locations',(SELECT count(*) FROM public.pos_locations WHERE connection_id=p_connection AND available),
    'variations',(SELECT count(*) FROM public.pos_catalog_variations WHERE connection_id=p_connection AND available));
  RETURN private.complete_command_request_for(p_actor,p_request_id,result);
END $function$;

CREATE OR REPLACE FUNCTION public.record_square_sales_locations(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_locations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_sales_syncs; v_ids text[];
BEGIN
  IF jsonb_typeof(p_locations)<>'array' THEN RAISE EXCEPTION 'Square locations invalid'; END IF;
  SELECT coalesce(array_agg(x.id ORDER BY x.id),'{}') INTO v_ids
    FROM jsonb_to_recordset(p_locations) x(id text,name text,status text)
    WHERE nullif(btrim(x.id),'') IS NOT NULL AND nullif(btrim(x.name),'') IS NOT NULL AND nullif(btrim(x.status),'') IS NOT NULL;
  IF cardinality(v_ids)<>jsonb_array_length(p_locations) OR cardinality(v_ids)<>cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) THEN
    RAISE EXCEPTION 'Square locations invalid';
  END IF;
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.brewery_id<>p_brewery OR v_attempt.connection_id<>p_connection
    OR v_attempt.credential_version<>p_expected_version OR v_attempt.status<>'in_progress'
    OR NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND 'admin' = ANY(roles))
    OR NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
        AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version)
  THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
      AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version FOR SHARE OF c,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  IF v_attempt.locations_captured THEN
    IF v_attempt.external_location_ids<>v_ids THEN RAISE EXCEPTION 'Square location snapshot changed' USING errcode='MG409'; END IF;
  ELSE
    INSERT INTO public.pos_locations(brewery_id,connection_id,external_location_id,external_name,external_status,available,last_seen_at)
      SELECT p_brewery,p_connection,x.id,x.name,x.status,true,now() FROM jsonb_to_recordset(p_locations) x(id text,name text,status text)
    ON CONFLICT(connection_id,external_location_id) DO UPDATE SET external_name=excluded.external_name,
      external_status=excluded.external_status,available=true,last_seen_at=excluded.last_seen_at;
    UPDATE public.pos_locations l SET available=false,last_seen_at=now() WHERE l.connection_id=p_connection
      AND NOT(l.external_location_id=ANY(v_ids));
    UPDATE private.square_sales_syncs SET external_location_ids=v_ids,locations_captured=true
      WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  END IF;
  RETURN jsonb_build_object('locationIds',v_attempt.external_location_ids,'locationOffset',v_attempt.location_offset,
    'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $function$;

CREATE OR REPLACE FUNCTION public.record_square_sales_page(p_brewery uuid, p_connection uuid, p_actor uuid, p_request_id uuid, p_expected_version bigint, p_location_ids text[], p_cursor text, p_next_cursor text, p_orders jsonb, p_facts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt private.square_sales_syncs; v_expected_locations text[]; v_order jsonb; v_fact jsonb; v_previous record;
  v_order_id text; v_line_id text; v_kind text; v_status text; v_reason text; v_source_order text; v_source_line text;
  v_version bigint; v_qty numeric; v_source_qty numeric; v_returned numeric; v_sale_id uuid; v_hash text; v_snapshot_hash text;
  v_inserted integer:=0; v_accepted integer:=0; v_unsupported integer:=0; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_orders)<>'array' OR jsonb_typeof(p_facts)<>'array' THEN RAISE EXCEPTION 'Square sales page invalid'; END IF;
  SELECT * INTO v_attempt FROM private.square_sales_syncs WHERE actor_id=p_actor AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.brewery_id<>p_brewery OR v_attempt.connection_id<>p_connection
    OR v_attempt.credential_version<>p_expected_version OR v_attempt.status<>'in_progress' OR NOT v_attempt.locations_captured
    OR v_attempt.cursor IS DISTINCT FROM p_cursor
    OR NOT EXISTS(SELECT 1 FROM public.brewery_users WHERE brewery_id=p_brewery AND user_id=p_actor AND 'admin' = ANY(roles))
    OR NOT EXISTS(SELECT 1 FROM public.pos_connections c JOIN private.integration_tokens t
      ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
      WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
        AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version)
  THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_connection::text,0));
  PERFORM 1 FROM public.pos_connections c JOIN private.integration_tokens t
    ON t.brewery_id=c.brewery_id AND t.provider='square' AND t.connection_id=c.id
    WHERE c.id=p_connection AND c.brewery_id=p_brewery AND c.state='connected' AND c.merchant_id=v_attempt.merchant_id
      AND c.credential_version=p_expected_version AND t.credential_version=p_expected_version FOR SHARE OF c,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square connection changed' USING errcode='MG409'; END IF;
  v_expected_locations:=v_attempt.external_location_ids[v_attempt.location_offset+1:v_attempt.location_offset+10];
  IF p_location_ids IS DISTINCT FROM v_expected_locations THEN RAISE EXCEPTION 'Square sales location page changed' USING errcode='MG409'; END IF;
  IF p_next_cursor IS NOT NULL AND (p_next_cursor IS NOT DISTINCT FROM p_cursor OR p_next_cursor=ANY(v_attempt.seen_cursors)) THEN
    RAISE EXCEPTION 'Square sales cursor repeated';
  END IF;

  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
  LOOP
    v_order_id:=nullif(btrim(v_order->>'externalOrderId'),''); v_version:=(v_order->>'sourceVersion')::bigint;
    IF v_order_id IS NULL OR v_version<0 OR NOT((v_order->>'externalLocationId')=ANY(p_location_ids)) THEN
      RAISE EXCEPTION 'Square order snapshot invalid';
    END IF;
    v_snapshot_hash:=encode(extensions.digest(jsonb_build_object(
      'externalOrderId',v_order_id,'sourceVersion',v_version,'externalLocationId',v_order->>'externalLocationId',
      'soldAt',v_order->>'soldAt','orderUpdatedAt',v_order->>'orderUpdatedAt','facts',coalesce((
        SELECT jsonb_agg(jsonb_build_object('factKind',f->>'factKind','externalLineId',f->>'externalLineId',
          'sourceHash',f->>'sourceHash') ORDER BY f->>'factKind',f->>'externalLineId')
        FROM jsonb_array_elements(p_facts) f WHERE f->>'externalOrderId'=v_order_id
          AND (f->>'sourceVersion')::bigint=v_version
      ),'[]'::jsonb))::text,'sha256'),'hex');
    INSERT INTO private.square_order_snapshots(brewery_id,connection_id,merchant_id,external_order_id,source_version,snapshot_hash)
    VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_version,v_snapshot_hash)
    ON CONFLICT(connection_id,external_order_id,source_version) DO NOTHING;
    IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM private.square_order_snapshots s WHERE s.connection_id=p_connection
      AND s.external_order_id=v_order_id AND s.source_version=v_version AND s.snapshot_hash=v_snapshot_hash) THEN
      RAISE EXCEPTION 'Square order changed within one source version' USING errcode='MG409';
    END IF;
  END LOOP;

  FOR v_fact IN SELECT value FROM jsonb_array_elements(p_facts) WITH ORDINALITY rows(value,n)
    ORDER BY (value->>'factKind'='return'),n
  LOOP
    v_order_id:=nullif(btrim(v_fact->>'externalOrderId'),''); v_line_id:=nullif(btrim(v_fact->>'externalLineId'),'');
    v_kind:=v_fact->>'factKind'; v_status:=v_fact->>'factStatus'; v_reason:=nullif(v_fact->>'unsupportedReason','');
    v_version:=(v_fact->>'sourceVersion')::bigint; v_qty:=CASE WHEN v_fact->>'qty' IS NULL THEN null ELSE (v_fact->>'qty')::numeric END;
    v_source_order:=nullif(v_fact->>'sourceOrderId',''); v_source_line:=nullif(v_fact->>'sourceLineId',''); v_hash:=v_fact->>'sourceHash';
    IF v_order_id IS NULL OR v_line_id IS NULL OR v_kind NOT IN ('sale','return') OR v_status NOT IN ('accepted','unsupported')
      OR v_version<0 OR nullif(v_hash,'') IS NULL OR NOT((v_fact->>'externalLocationId')=ANY(p_location_ids))
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_orders) o WHERE o->>'externalOrderId'=v_order_id
        AND (o->>'sourceVersion')::bigint=v_version AND o->>'externalLocationId'=v_fact->>'externalLocationId')
    THEN RAISE EXCEPTION 'Square sales fact invalid'; END IF;
    IF v_status='accepted' AND (v_qty IS NULL OR v_qty<=0 OR v_qty::text IN ('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Square sales quantity invalid';
    END IF;
    IF v_kind='return' AND v_status='accepted' THEN
      SELECT s.qty INTO v_source_qty FROM private.pos_current_sales s
        WHERE s.connection_id=p_connection AND s.external_order_id=v_source_order AND s.fact_kind='sale'
          AND s.external_line_id=v_source_line AND s.fact_status='accepted'
          AND s.external_variation_id=v_fact->>'externalVariationId';
      SELECT coalesce(sum(r.qty),0) INTO v_returned FROM private.pos_current_sales r
        WHERE r.connection_id=p_connection AND r.fact_kind='return' AND r.fact_status='accepted'
          AND r.source_order_id=v_source_order AND r.source_line_id=v_source_line
          AND NOT(r.external_order_id=v_order_id AND r.external_line_id=v_line_id);
      IF v_source_qty IS NULL THEN v_status:='unsupported'; v_reason:='return_source_not_found'; v_qty:=null;
      ELSIF v_returned+v_qty>v_source_qty THEN v_status:='unsupported'; v_reason:='return_quantity_exceeds_source'; v_qty:=null;
      END IF;
    END IF;
    INSERT INTO public.pos_sales(brewery_id,connection_id,merchant_id,external_order_id,external_line_id,source_version,
      fact_kind,fact_status,source_quantity,qty,gross_cents,external_item_id,external_variation_id,external_location_id,
      sold_at,source_order_updated_at,catalog_version,quantity_unit,source_order_id,source_line_id,unsupported_reason,source_hash)
    VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_line_id,v_version,v_kind,v_status,
      v_fact->>'sourceQuantity',v_qty,CASE WHEN v_fact->>'grossCents' IS NULL THEN null ELSE (v_fact->>'grossCents')::bigint END,
      (SELECT c.external_item_id FROM public.pos_catalog_variations c WHERE c.connection_id=p_connection
        AND c.external_variation_id=v_fact->>'externalVariationId'),nullif(v_fact->>'externalVariationId',''),
      v_fact->>'externalLocationId',(v_fact->>'soldAt')::timestamptz,(v_fact->>'orderUpdatedAt')::timestamptz,
      CASE WHEN v_fact->>'catalogVersion' IS NULL THEN null ELSE (v_fact->>'catalogVersion')::bigint END,
      v_fact->'quantityUnit',v_source_order,v_source_line,v_reason,v_hash)
    ON CONFLICT(connection_id,external_order_id,fact_kind,external_line_id,source_version) DO NOTHING
    RETURNING id INTO v_sale_id;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted=0 THEN
      SELECT id INTO v_sale_id FROM public.pos_sales WHERE connection_id=p_connection AND external_order_id=v_order_id
        AND fact_kind=v_kind AND external_line_id=v_line_id AND source_version=v_version AND source_hash=v_hash;
      IF NOT FOUND THEN RAISE EXCEPTION 'Square fact changed within one source version' USING errcode='MG409'; END IF;
    ELSE
      IF v_status='accepted' THEN v_accepted:=v_accepted+1; ELSE v_unsupported:=v_unsupported+1; END IF;
    END IF;
    PERFORM private.reconcile_pos_sale(p_brewery,v_sale_id);
  END LOOP;

  FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
  LOOP
    v_order_id:=v_order->>'externalOrderId'; v_version:=(v_order->>'sourceVersion')::bigint;
    FOR v_previous IN SELECT DISTINCT ON (s.fact_kind,s.external_line_id) s.* FROM public.pos_sales s
      WHERE s.connection_id=p_connection AND s.external_order_id=v_order_id AND s.source_version<v_version
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_facts) f WHERE f->>'externalOrderId'=v_order_id
          AND f->>'factKind'=s.fact_kind AND f->>'externalLineId'=s.external_line_id)
      ORDER BY s.fact_kind,s.external_line_id,s.source_version DESC,s.id DESC
    LOOP
      v_hash:=encode(extensions.digest(concat_ws('|',p_connection,v_order_id,v_previous.fact_kind,
        v_previous.external_line_id,v_version,'removed'),'sha256'),'hex');
      INSERT INTO public.pos_sales(brewery_id,connection_id,merchant_id,external_order_id,external_line_id,source_version,
        fact_kind,fact_status,external_item_id,external_variation_id,external_location_id,sold_at,source_order_updated_at,
        catalog_version,source_order_id,source_line_id,source_hash)
      VALUES(p_brewery,p_connection,v_attempt.merchant_id,v_order_id,v_previous.external_line_id,v_version,
        v_previous.fact_kind,'removed',v_previous.external_item_id,v_previous.external_variation_id,v_order->>'externalLocationId',
        (v_order->>'soldAt')::timestamptz,(v_order->>'orderUpdatedAt')::timestamptz,v_previous.catalog_version,
        v_previous.source_order_id,v_previous.source_line_id,v_hash)
      ON CONFLICT(connection_id,external_order_id,fact_kind,external_line_id,source_version) DO NOTHING;
      IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.connection_id=p_connection
        AND s.external_order_id=v_order_id AND s.fact_kind=v_previous.fact_kind
        AND s.external_line_id=v_previous.external_line_id AND s.source_version=v_version
        AND s.fact_status='removed' AND s.source_hash=v_hash) THEN
        RAISE EXCEPTION 'Square fact changed within one source version' USING errcode='MG409';
      END IF;
    END LOOP;
  END LOOP;

  UPDATE private.square_sales_syncs SET pages=pages+1,accepted_facts=accepted_facts+v_accepted,
    unsupported_facts=unsupported_facts+v_unsupported,cursor=p_next_cursor,
    seen_cursors=CASE WHEN p_next_cursor IS NULL THEN seen_cursors ELSE array_append(seen_cursors,p_next_cursor) END
    WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  IF p_next_cursor IS NULL AND v_attempt.location_offset+10<cardinality(v_attempt.external_location_ids) THEN
    UPDATE private.square_sales_syncs SET location_offset=location_offset+10
      WHERE actor_id=p_actor AND request_id=p_request_id RETURNING * INTO v_attempt;
  ELSIF p_next_cursor IS NULL THEN
    INSERT INTO public.pos_sales_coverage(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,complete)
      SELECT p_brewery,p_connection,l.external_location_id,l.location_id,v_attempt.coverage_starts_at,v_attempt.ends_at,true
      FROM public.pos_locations l WHERE l.connection_id=p_connection AND l.external_location_id=ANY(v_attempt.external_location_ids)
      ;
    UPDATE public.pos_connections SET sales_synced_through=greatest(coalesce(sales_synced_through,v_attempt.ends_at),v_attempt.ends_at),updated_at=now()
      WHERE id=p_connection AND brewery_id=p_brewery AND credential_version=p_expected_version;
    v_result:=jsonb_build_object('complete',true,'acceptedFacts',v_attempt.accepted_facts,'unsupportedFacts',v_attempt.unsupported_facts,
      'pages',v_attempt.pages,'locations',cardinality(v_attempt.external_location_ids),'startsAt',v_attempt.starts_at,'endsAt',v_attempt.ends_at);
    UPDATE private.square_sales_syncs SET status='completed',result=v_result WHERE actor_id=p_actor AND request_id=p_request_id;
    PERFORM private.complete_command_request_for(p_actor,p_request_id,v_result);
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('complete',false,'locationIds',v_attempt.external_location_ids,
    'locationOffset',v_attempt.location_offset,'cursor',v_attempt.cursor,'pages',v_attempt.pages);
END $function$;

CREATE OR REPLACE FUNCTION public.store_integration_tokens(p_brewery uuid, p_provider text, p_connection uuid, p_actor uuid, p_access_token text, p_refresh_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with authorized as (
    select true
    where exists (
      select 1 from public.brewery_users u
      where u.brewery_id = p_brewery
        and u.user_id = p_actor
        and u.roles && ARRAY['admin', 'sales']::public.staff_role[]
    )
    and (
      (p_provider = 'qbo' and exists (
        select 1 from public.qbo_connections q
        where q.brewery_id = p_brewery and q.id = p_connection and q.state = 'connected'
      ))
      or
      (p_provider = 'square' and exists (
        select 1 from public.pos_connections p
        where p.brewery_id = p_brewery
          and p.provider = p_provider
          and p.id = p_connection
      ))
    )
  ),
  written as (
    insert into private.integration_tokens as t (
      brewery_id, provider, connection_id, access_token, refresh_token
    )
    select p_brewery, p_provider, p_connection, p_access_token, p_refresh_token
    from authorized
    on conflict (brewery_id, provider) do update
      set connection_id = excluded.connection_id,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          credential_version = t.credential_version + 1,
          updated_at = now()
    returning credential_version
  ),
  qbo_version as (
    update public.qbo_connections q set credential_version=w.credential_version
    from written w where p_provider='qbo' and q.brewery_id=p_brewery and q.id=p_connection
    returning true
  )
  select coalesce((select true from written), false);
$function$;

-- Clean cutover: nothing may keep reading the obsolete scalar membership.
alter table public.brewery_users drop column role;
drop function public.staff_role(uuid);

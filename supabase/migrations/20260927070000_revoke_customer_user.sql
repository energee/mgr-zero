-- #616: Admin and Sales list a customer's portal users and revoke one.
-- Mirrors list_team_members / revoke_staff: the roster is definer only to
-- reach auth.users and returns rows only to Admin or Sales of the brewery that
-- owns the customer; revoke ends one membership in one write and leaves the
-- Auth user alone. The command ledger keeps the removed row as its result.
-- A buyer's live session loses access on its next request, because
-- my_customer_ids(), assert_customer() and the request context all read
-- customer_users rather than the token.
create function public.list_customer_users(p_brewery uuid, p_customer uuid)
returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select cu.user_id, u.email::text, cu.created_at
    from public.customer_users cu
    join public.customers c on c.id = cu.customer_id and c.brewery_id = p_brewery
    join auth.users u on u.id = cu.user_id
    where cu.customer_id = p_customer
      and private.request_scope_allows(p_brewery)
      and exists (select 1 from public.brewery_users me where me.brewery_id = p_brewery and me.user_id = auth.uid()
                    and me.role = any (array['admin','sales']::public.staff_role[]))
    order by u.email;
$$;

create function public.revoke_customer_user(p_brewery uuid, p_customer uuid, p_user uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.customer_users;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'revoke_customer_user', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'customer', p_customer, 'user', p_user));
  if v_replay is not null then return v_replay; end if;
  -- The customers join is the tenant check: another brewery's customer id matches nothing.
  delete from public.customer_users cu using public.customers c
    where c.id = cu.customer_id and c.brewery_id = p_brewery and cu.customer_id = p_customer and cu.user_id = p_user
    returning cu.* into v_row;
  if v_row.user_id is null then raise exception 'portal user not found' using errcode = 'P0001'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

revoke all on function public.list_customer_users(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_customer_user(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_customer_users(uuid, uuid) to authenticated;
grant execute on function public.revoke_customer_user(uuid, uuid, uuid, uuid) to authenticated;

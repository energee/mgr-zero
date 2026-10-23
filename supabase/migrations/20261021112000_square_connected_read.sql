-- Whether this brewery's Square seller is connected, for the roles that open
-- Menu (#1083). pos_connections RLS is admin and sales, and
-- get_pos_integration_health is admin-only, so Warehouse could not tell a
-- disconnected Square from an unmapped location. Definer, so it can read the
-- row; it returns only the boolean (no token, id, merchant, or error text) and
-- refuses any brewery the caller is not admin or warehouse staff of.
create function public.get_square_connected(p_brewery uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.my_staff_brewery_ids(array['admin', 'warehouse']::public.staff_role[]) as s(brewery_id)
                 where s.brewery_id = p_brewery) then
    raise insufficient_privilege using message = 'permission denied';
  end if;
  return exists (
    select 1 from public.pos_connections c
    where c.brewery_id = p_brewery and c.provider = 'square' and c.state = 'connected');
end;
$$;

revoke all on function public.get_square_connected(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_square_connected(uuid) to authenticated;
comment on function public.get_square_connected(uuid) is
  'True when the brewery''s Square seller is connected; admin and warehouse only, boolean only (#1083).';

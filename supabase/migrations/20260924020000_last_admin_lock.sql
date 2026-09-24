-- Issue #458: two admins demoting or removing each other at the same moment
-- could each count two admins, update different rows, and commit, leaving the
-- brewery with none. Lock the brewery's admin rows (in a fixed order, so two
-- callers cannot deadlock) before counting: the second caller waits for the
-- first to commit, then counts what is left and refuses.
-- The function is now volatile: FOR UPDATE is not allowed in a stable
-- function, and a stable function would count from its caller's snapshot,
-- missing the write it just waited for.
create or replace function private.assert_not_last_admin(p_brewery uuid, p_user uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Changing a non-admin can never remove the last admin; only then lock.
  if not exists (select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_user and role = 'admin') then
    return;
  end if;
  perform 1 from public.brewery_users
    where brewery_id = p_brewery and role = 'admin'
    order by user_id
    for update;
  if exists (select 1 from public.brewery_users where brewery_id = p_brewery and user_id = p_user and role = 'admin')
     and (select count(*) from public.brewery_users where brewery_id = p_brewery and role = 'admin') = 1 then
    raise exception 'keep at least one admin' using errcode = 'P0001';
  end if;
end $$;

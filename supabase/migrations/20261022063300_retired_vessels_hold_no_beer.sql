-- A retired vessel (active = false, set by delete_vessel) holds no new beer,
-- and its name is free for a replacement tank.
--
-- Every writer that opens an occupancy (brew day, cellar transfer) locks the
-- vessel row first, as delete_vessel does, so the active check below cannot
-- race a retire. Only inserts are checked: a vessel holding beer cannot be
-- retired, so no open occupancy ever sits in a retired vessel.

create function private.refuse_retired_vessel() returns trigger language plpgsql set search_path = '' as $$
begin
  if not (select v.active from public.vessels v where v.id = new.vessel_id and v.brewery_id = new.brewery_id) then
    raise exception 'vessel is retired';
  end if;
  return new;
end $$;
create trigger vessel_occupancies_active_vessel before insert on public.vessel_occupancies
  for each row execute function private.refuse_retired_vessel();

-- Names stay unique among active vessels only; a retired vessel keeps its name
-- for history without blocking a new tank of the same name.
alter table public.vessels drop constraint vessels_brewery_id_name_key;
create unique index vessels_active_name_key on public.vessels (brewery_id, name) where active;

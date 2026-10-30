-- #1662: retiring a mistaken mapping releases its location without rewriting history.
alter table public.pos_locations add column mapping_started_at timestamptz not null default '-infinity';
create table public.pos_location_mapping_history (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  connection_id uuid not null,
  external_location_id text not null,
  location_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  retired_by uuid not null references auth.users(id),
  check(starts_at<ends_at),
  foreign key(connection_id,external_location_id) references public.pos_locations(connection_id,external_location_id) on delete cascade,
  foreign key(connection_id,brewery_id) references public.pos_connections(id,brewery_id),
  foreign key(location_id,brewery_id) references public.locations(id,brewery_id)
);
alter table public.pos_location_mapping_history enable row level security;
create policy pos_location_mapping_history_staff on public.pos_location_mapping_history for select to authenticated
  using(brewery_id in (select public.my_staff_brewery_ids(array['admin']::public.staff_role[])));
revoke all on public.pos_location_mapping_history from public,anon,authenticated,service_role;
grant select on public.pos_location_mapping_history to authenticated;
create index pos_location_mapping_history_source_idx on public.pos_location_mapping_history(connection_id,external_location_id,ends_at);
create index pos_location_mapping_history_brewery_idx on public.pos_location_mapping_history(brewery_id);

create function public.retire_pos_location_mapping(p_brewery uuid,p_external_location text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; loc public.pos_locations; replay jsonb; cutoff timestamptz;
begin
  perform private.assert_staff(p_brewery,array['admin']::public.staff_role[]);
  replay := private.claim_command_request(p_brewery,'retire_pos_location_mapping',p_request_id,jsonb_build_object('posLocationId',p_external_location));
  if replay is not null then return replay; end if;
  select id into c from public.pos_connections where brewery_id=p_brewery and provider='square' and state='connected' for update;
  if c is null then raise exception 'connect Square before retiring its mapping'; end if;
  select * into loc from public.pos_locations where connection_id=c and external_location_id=p_external_location for update;
  if loc.location_id is null then raise exception 'Square location has no current mapping'; end if;
  if exists(select 1 from private.square_publications where connection_id=c and external_location_id=p_external_location and status in ('needs_snapshot','prepared'))
    or exists(select 1 from private.square_menu_publications where connection_id=c and external_location_id=p_external_location and status='publishing') then
    raise exception 'finish the pending Square publication before retiring this mapping' using errcode='MG409';
  end if;
  cutoff := clock_timestamp();
  insert into public.pos_location_mapping_history(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,retired_by)
    values(p_brewery,c,p_external_location,loc.location_id,loc.mapping_started_at,cutoff,auth.uid());
  delete from public.pos_menus where connection_id=c and external_location_id=p_external_location;
  update public.pos_locations set location_id=null,mapping_started_at=cutoff where connection_id=c and external_location_id=p_external_location;
  return private.complete_command_request(p_request_id,jsonb_build_object('retired',true));
end $$;
revoke all on function public.retire_pos_location_mapping(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.retire_pos_location_mapping(uuid,text,uuid) to authenticated;

-- Sales sync overlaps historical windows. Split coverage at mapping boundaries,
-- so delayed provider pages cannot assign an old window to a replacement location.
create function private.split_pos_mapping_coverage() returns trigger
language plpgsql set search_path='' as $$
declare loc public.pos_locations; h public.pos_location_mapping_history;
begin
  if pg_trigger_depth()>1 then return new; end if;
  select * into loc from public.pos_locations where connection_id=new.connection_id and external_location_id=new.external_location_id;
  if loc.mapping_started_at='-infinity'::timestamptz then return new; end if;
  for h in select * from public.pos_location_mapping_history where connection_id=new.connection_id
    and external_location_id=new.external_location_id and starts_at<new.ends_at and ends_at>new.starts_at
  loop
    insert into public.pos_sales_coverage(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,complete)
      values(new.brewery_id,new.connection_id,new.external_location_id,h.location_id,greatest(new.starts_at,h.starts_at),least(new.ends_at,h.ends_at),new.complete);
  end loop;
  if new.ends_at>loc.mapping_started_at then
    insert into public.pos_sales_coverage(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,complete)
      values(new.brewery_id,new.connection_id,new.external_location_id,loc.location_id,greatest(new.starts_at,loc.mapping_started_at),new.ends_at,new.complete);
  end if;
  return null;
end $$;
revoke all on function private.split_pos_mapping_coverage() from public,anon,authenticated,service_role;
create trigger split_pos_mapping_coverage before insert on public.pos_sales_coverage
  for each row execute function private.split_pos_mapping_coverage();

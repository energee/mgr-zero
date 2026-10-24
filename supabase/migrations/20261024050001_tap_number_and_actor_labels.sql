-- Validate new tap identifiers without rewriting historical intervals or
-- preventing an old, invalidly numbered keg from being kicked.
create function private.validate_tap_number()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.tap_number is not distinct from old.tap_number then
    return new;
  end if;
  if new.tap_number is not null and
    (length(new.tap_number) > 80 or new.tap_number !~ '^[0-9]*[1-9][0-9]*$') then
    raise exception using errcode = 'P0001',
      message = 'Enter a positive whole tap number up to 9007199254740991, or no number.';
  end if;
  if new.tap_number is not null and new.tap_number::numeric > 9007199254740991 then
    raise exception using errcode = 'P0001',
      message = 'Enter a positive whole tap number up to 9007199254740991, or no number.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_tap_number() from public, anon, authenticated;

create trigger validate_tap_number
before insert or update of tap_number on public.tap_intervals
for each row execute function private.validate_tap_number();

-- Actor names are display data only, never an authorization source. Keep the
-- existing role, tenant and location guards; do not expose email or metadata.
create or replace function public.list_open_taps(p_brewery uuid, p_location uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('sku_name',s.name,'brand_id',s.brand_id,'brand_name',b.name,
      'opened_by_label',coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),'staff'))
    order by t.tap_number nulls last,t.opened_at,t.id),'[]'::jsonb)
    from public.tap_intervals t left join public.skus s on s.id=t.sku_id and s.brewery_id=t.brewery_id
    left join public.brands b on b.id=s.brand_id and b.brewery_id=t.brewery_id
    left join auth.users u on u.id=t.opened_by
    where t.brewery_id=p_brewery and t.location_id=p_location and t.closed_at is null);
end;
$$;

create or replace function public.list_tap_history(p_brewery uuid, p_location uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery,array['admin','warehouse','taproom']::public.staff_role[]);
  if not exists(select 1 from public.locations where id=p_location and brewery_id=p_brewery and 'taproom' = any(uses)) then raise exception 'choose an owned taproom location'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(
      'opened_by_label',coalesce(nullif(btrim(o.raw_user_meta_data->>'full_name'),''),'staff'),
      'closed_by_label',coalesce(nullif(btrim(c.raw_user_meta_data->>'full_name'),''),'staff'),
      'sku_name',s.name,'brand_name',b.name) order by t.closed_at desc,t.id),'[]'::jsonb) from
    (select * from public.tap_intervals where brewery_id=p_brewery and location_id=p_location and closed_at is not null order by closed_at desc,id limit 50) t
    left join auth.users o on o.id=t.opened_by left join auth.users c on c.id=t.closed_by
    left join public.skus s on s.id=t.sku_id and s.brewery_id=t.brewery_id left join public.brands b on b.id=s.brand_id and b.brewery_id=t.brewery_id);
end;
$$;

create or replace function private.close_tap(p_brewery uuid,p_interval uuid,p_closing_fill numeric,p_reason text,p_actor uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_row public.tap_intervals; v_closed_by_label text;
begin
  select * into v_row from public.tap_intervals where id=p_interval and brewery_id=p_brewery for update;
  if not found then raise exception 'tap interval not found'; end if;
  if v_row.closed_at is not null then
    select nullif(btrim(raw_user_meta_data->>'full_name'),'') into v_closed_by_label from auth.users where id=v_row.closed_by;
    raise exception 'Keg already closed by % at %; refresh the tap board',coalesce(v_closed_by_label,'staff'),v_row.closed_at using errcode='MG409';
  end if;
  update public.tap_intervals set closed_at=now(),closed_by=p_actor,closing_fill=p_closing_fill,close_reason=btrim(p_reason)
    where id=p_interval and brewery_id=p_brewery returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

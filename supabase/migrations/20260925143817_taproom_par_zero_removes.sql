-- set_taproom_par: a par of 0 deletes the row, as the form and staff guide say
-- ("Zero removes its replenishment target"), so it leaves suggestions,
-- taproom_replenishment and the below-par count instead of listing "Par 0".
-- Otherwise copied from 00001_baseline.sql.
create or replace function public.set_taproom_par(
  p_brewery uuid, p_location uuid, p_sku uuid, p_par_qty numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.taproom_pars;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  if not exists (
    select 1
    from public.locations l
    join public.skus s on s.brewery_id = l.brewery_id
    where l.id = p_location and s.id = p_sku and l.brewery_id = p_brewery
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_replay := private.claim_command_request(p_brewery, 'set_taproom_par', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'location', p_location, 'sku', p_sku, 'par_qty', p_par_qty));
  if v_replay is not null then return v_replay; end if;
  if p_par_qty = 0 then
    delete from public.taproom_pars
      where brewery_id = p_brewery and location_id = p_location and sku_id = p_sku;
    return private.complete_command_request(p_request_id,
      jsonb_build_object('brewery_id', p_brewery, 'location_id', p_location, 'sku_id', p_sku, 'par_qty', 0));
  end if;
  insert into public.taproom_pars (brewery_id, location_id, sku_id, par_qty)
    values (p_brewery, p_location, p_sku, p_par_qty)
    on conflict (location_id, sku_id) do update
      set par_qty = excluded.par_qty
      where public.taproom_pars.brewery_id = excluded.brewery_id
    returning * into v_row;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

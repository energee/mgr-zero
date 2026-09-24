-- #421: pos_menus.bin_id references bins on delete cascade, so delete_bin on an
-- "empty" bin silently took the location's POS menu with it: every price
-- override (pos_menu_lines cascade too), its website publication, and its
-- public_id, which a re-created menu never gets back. delete_bin now refuses a
-- bin a POS menu points at, the same way it refuses one with recorded stock;
-- configure the menu against another bin first. The foreign key is unchanged.
--
-- Otherwise a copy of the latest definition (00001_baseline.sql). The bin row is
-- now locked before the checks: configure_pos_menu's insert holds a key-share
-- lock on it, so a menu being set up concurrently either commits first and is
-- seen by the check, or waits and then fails its foreign key.
create or replace function public.delete_bin(
  p_brewery uuid, p_bin uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.bins; v_used boolean;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_bin', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'bin', p_bin));
  if v_replay is not null then return v_replay; end if;
  select b.* into v_row from public.bins b where b.id = p_bin and b.brewery_id = p_brewery for update;
  if not found then raise exception 'bin not found'; end if;
  perform 1 from public.locations where id = v_row.location_id for update;
  if (select count(*) from public.bins where location_id = v_row.location_id) <= 1 then
    raise exception 'a location keeps at least one bin; rename it instead';
  end if;
  v_used := exists (select 1 from public.inventory_movements where bin_id = p_bin)
         or exists (select 1 from public.material_movements  where bin_id = p_bin)
         or exists (select 1 from public.keg_events          where bin_id = p_bin);
  if v_used then
    raise exception 'bin has recorded stock and cannot be removed; rename it instead';
  end if;
  if exists (select 1 from public.pos_menus where bin_id = p_bin) then
    raise exception 'a POS menu uses this bin; configure the menu against another bin before removing it';
  end if;
  delete from public.bins where id = p_bin;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

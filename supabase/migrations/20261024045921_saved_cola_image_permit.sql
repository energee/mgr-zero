-- Taproom staff can read saved COLAs but not the breweries base table.
-- Reveal only the permit required to render an exact, already-saved image;
-- do not widen access to the brewery's other settings or registry data.
create function public.get_saved_cola_image_permit(
  p_brewery uuid, p_ttb_id text, p_image_url text
) returns text language plpgsql stable security definer set search_path = '' as $$
declare v_permit text;
begin
  perform private.assert_staff(p_brewery, enum_range(null::public.staff_role));
  select nullif(btrim(b.ttb_registry_no), '') into v_permit
    from public.breweries b
    where b.id = p_brewery
      and exists (
        select 1 from public.brand_approvals a
        where a.brewery_id = b.id and a.kind = 'cola'
          and a.ttb_id = p_ttb_id and a.image_url = p_image_url
          and a.approved_on is not null
      );
  if not found then
    raise exception 'Only saved approved COLA images are available.' using errcode = 'MG404';
  end if;
  return v_permit;
end $$;

revoke all on function public.get_saved_cola_image_permit(uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_saved_cola_image_permit(uuid,text,text) to authenticated;
-- #1495: refuse a new category name that differs from an existing one only by
-- letter case, as #1265 did for bins. No lower(name) unique index: existing
-- Core/core variants must survive. Both writers take the same per-brewery lock.
create or replace function private.register_brand_category() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_existing text;
begin
  new.category := nullif(btrim(new.category), '');
  if new.category is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-category:' || new.brewery_id::text, 0));
    -- File the brand under the existing spelling (an exact match wins), so the
    -- case-sensitive brands_catalog_category_fk never gains a new variant.
    select c.name into v_existing from public.catalog_categories c
      where c.brewery_id = new.brewery_id and lower(c.name) = lower(new.category)
      order by c.name <> new.category, c.name limit 1;
    if found then
      new.category := v_existing;
    else
      insert into public.catalog_categories (brewery_id, name) values (new.brewery_id, new.category) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function public.save_catalog_category(p_brewery uuid, p_previous_name text, p_name text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_name text := btrim(p_name); v_duplicate text;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'save_catalog_category', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'previous_name', p_previous_name, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'Enter a category name'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-category:' || p_brewery::text, 0));
  -- A rename that keeps the name leaves an unchanged historical collision editable.
  if v_name is distinct from p_previous_name then
    select c.name into v_duplicate from public.catalog_categories c
      where c.brewery_id = p_brewery and c.name is distinct from p_previous_name and lower(c.name) = lower(v_name)
      order by c.name limit 1;
    if found then raise exception 'A category named % already exists', v_duplicate using errcode = 'MG409'; end if;
  end if;
  begin
    if p_previous_name is null then
      insert into public.catalog_categories (brewery_id, name) values (p_brewery, v_name);
    else
      update public.catalog_categories set name = v_name where brewery_id = p_brewery and name = p_previous_name;
      if not found then raise exception 'Category not found; refresh the list'; end if;
    end if;
  exception when unique_violation then
    raise exception 'A category with this name already exists' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('name', v_name));
end $$;

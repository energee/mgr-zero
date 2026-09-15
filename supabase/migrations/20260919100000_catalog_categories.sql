create table public.catalog_categories (
  brewery_id uuid not null references public.breweries(id),
  name text not null check (name = btrim(name) and name <> ''),
  primary key (brewery_id, name)
);
alter table public.catalog_categories enable row level security;
create policy staff_read on public.catalog_categories for select to authenticated using (public.is_staff_of(brewery_id));
revoke all on public.catalog_categories from anon, authenticated;
grant select on public.catalog_categories to authenticated;
grant all on public.catalog_categories to service_role;

-- Preserve existing categories and the choices previously supplied by the UI.
update public.brands set category = nullif(btrim(category), '') where category is not null;
insert into public.catalog_categories (brewery_id, name)
select brewery_id, category from public.brands where category is not null
union
select b.id, c.name from public.breweries b cross join (values ('Core'), ('Seasonal'), ('One-off'), ('Barrel-aged')) c(name);
alter table public.brands add constraint brands_catalog_category_fk
  foreign key (brewery_id, category) references public.catalog_categories (brewery_id, name)
  on update cascade on delete restrict;
create index brands_category_idx on public.brands (brewery_id, category);

-- Preserve upsert_brand's existing ability to accept a new category via API/import.
create function private.register_brand_category() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.category := nullif(btrim(new.category), '');
  if new.category is not null then
    insert into public.catalog_categories (brewery_id, name) values (new.brewery_id, new.category) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.register_brand_category() from public, anon, authenticated, service_role;
create trigger register_brand_category before insert or update of category, brewery_id on public.brands
  for each row execute function private.register_brand_category();

create function public.save_catalog_category(p_brewery uuid, p_previous_name text, p_name text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_name text := btrim(p_name);
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'save_catalog_category', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'previous_name', p_previous_name, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'Enter a category name'; end if;
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

create function public.delete_catalog_category(p_brewery uuid, p_name text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'delete_catalog_category', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'name', p_name));
  if v_replay is not null then return v_replay; end if;
  begin
    delete from public.catalog_categories where brewery_id = p_brewery and name = p_name;
    if not found then raise exception 'Category not found; refresh the list'; end if;
  exception when foreign_key_violation then
    raise exception 'Category is in use. Reassign its brands before deleting it.' using errcode = 'MG409';
  end;
  return private.complete_command_request(p_request_id, jsonb_build_object('name', p_name));
end $$;
revoke all on function public.save_catalog_category(uuid,text,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_catalog_category(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_catalog_category(uuid,text,text,uuid) to authenticated;
grant execute on function public.delete_catalog_category(uuid,text,uuid) to authenticated;

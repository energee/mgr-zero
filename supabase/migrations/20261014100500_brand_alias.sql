-- Brand alias and a recipe's brand that can change (docs/plans/brand-alias.md).
-- brands.alias is an optional informal name (a series number such as
-- "Animal #14" beside the beer's name "Appaloosa"). It is staff-only already:
-- brands has no customer policy (dropped in 20261012100800), and the portal,
-- Square and SKU names all read brands.name.

alter table public.brands add column alias text check (alias is null or length(trim(alias)) > 0);

-- upsert_brand replaces every field, so it takes the alias like the rest. The
-- trailing default keeps the CSV-import callers (10 positional arguments) valid.
-- Copied from 00001_baseline.sql; only p_alias is new.
drop function public.upsert_brand(uuid, uuid, text, text, numeric, text, text, uuid, text, uuid);
create function public.upsert_brand(
  p_brewery uuid, p_id uuid, p_name text, p_style text, p_abv numeric,
  p_description text, p_category text, p_price_group uuid, p_hops text, p_request_id uuid,
  p_alias text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.brands; v_style uuid; v_payload jsonb;
begin
  perform private.assert_staff(p_brewery, array['admin','sales']::public.staff_role[]);
  v_payload := jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'style', p_style, 'abv', p_abv,
                       'description', p_description, 'category', p_category, 'price_group', p_price_group, 'hops', p_hops);
  -- Requests completed before the alias existed keep their original hash.
  if p_alias is not null then v_payload := v_payload || jsonb_build_object('alias', p_alias); end if;
  v_replay := private.claim_command_request(p_brewery, 'upsert_brand', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  if nullif(trim(p_style), '') is not null then
    insert into public.styles (brewery_id, name) values (p_brewery, trim(p_style))
      on conflict (brewery_id, name) do update set name = excluded.name returning id into v_style;
  end if;
  if p_id is null then
    insert into public.brands (brewery_id, name, style_id, abv, description, category, price_group_id, hops, alias)
    values (p_brewery, p_name, v_style, p_abv, p_description, p_category, p_price_group, p_hops, p_alias) returning * into v_row;
  else
    update public.brands set name = p_name, style_id = v_style, abv = p_abv, description = p_description,
      category = p_category, price_group_id = p_price_group, hops = p_hops, alias = p_alias
    where id = p_id and brewery_id = p_brewery returning * into v_row;
    if v_row.id is null then raise exception 'brand not found'; end if;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_brand(uuid, uuid, text, text, numeric, text, text, uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_brand(uuid, uuid, text, text, numeric, text, text, uuid, text, uuid, text) to authenticated;

-- A recipe's brand after creation (create_recipe was the only writer). Null
-- clears it. Batches copied the brand when scheduled, so none is rewritten.
create function public.set_recipe_brand(p_brewery uuid, p_recipe uuid, p_brand uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.recipes;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'set_recipe_brand', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'recipe', p_recipe, 'brand', p_brand));
  if v_replay is not null then return v_replay; end if;
  if p_brand is not null and not exists (select 1 from public.brands where id = p_brand and brewery_id = p_brewery)
    then raise exception 'brand not found'; end if;
  update public.recipes set brand_id = p_brand where id = p_recipe and brewery_id = p_brewery returning * into v_row;
  if v_row.id is null then raise exception 'recipe not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.set_recipe_brand(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_recipe_brand(uuid, uuid, uuid, uuid) to authenticated;

-- A recipe's name and note after creation (#1818). create_recipe was their only
-- writer, so a typo in a name was permanent. Batches and saved copies point at
-- the recipe by id, so nothing else is rewritten. A name another recipe of the
-- brewery already has is refused by the table's unique (brewery_id, name).
create function public.update_recipe(p_brewery uuid, p_recipe uuid, p_name text, p_note text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.recipes;
begin
  perform private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'update_recipe', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'recipe', p_recipe, 'name', p_name, 'note', p_note));
  if v_replay is not null then return v_replay; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'a recipe needs a name'; end if;
  update public.recipes set name = p_name, note = p_note where id = p_recipe and brewery_id = p_brewery returning * into v_row;
  if v_row.id is null then raise exception 'recipe not found'; end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.update_recipe(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.update_recipe(uuid, uuid, text, text, uuid) to authenticated;

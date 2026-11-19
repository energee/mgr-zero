-- What suggest_material_category answered for each new material name, so Settings
-- can count how its suggestions turned out (docs/plans/jev-suggestions.md, Outcomes).
-- Nothing stores "accepted": the outcome is derived by comparing the suggested kind
-- with the kind of the material later saved under that name.
--
-- The table follows private.brewery_typesafe_keys: nobody reads it directly, and the
-- two service-only functions recheck the actor's current role.

create table private.material_kind_suggestions (
  brewery_id uuid not null references public.breweries(id),
  -- lower(btrim(material name)): one row per name, holding the latest answer.
  name text not null check (name = lower(btrim(name)) and length(name) between 1 and 120),
  -- Null when no kind reached the threshold, so the form showed nothing.
  category public.material_category,
  probability numeric check (probability between 0 and 1),
  asked_at timestamptz not null default now(),
  primary key (brewery_id, name)
);
alter table private.material_kind_suggestions enable row level security;
revoke all privileges on table private.material_kind_suggestions from public, anon, authenticated, service_role;

-- Called by suggest_material_category after TypeSafe answers. Asking the same name
-- again replaces its row, so the write is safe to repeat.
create function public.record_material_kind_suggestion(
  p_brewery uuid, p_actor uuid, p_name text, p_category public.material_category, p_probability numeric
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.actor_has_staff_roles(p_brewery, p_actor, array['admin', 'warehouse', 'brewer']::public.staff_role[]) then
    raise insufficient_privilege using message = 'permission denied';
  end if;
  insert into private.material_kind_suggestions (brewery_id, name, category, probability)
  values (p_brewery, lower(btrim(p_name)), p_category, p_probability)
  on conflict (brewery_id, name) do update
    set category = excluded.category, probability = excluded.probability, asked_at = now();
end $$;

-- The last 30 days for Settings: names asked, names that got a suggestion, and of
-- those saved as a material, how many kept the suggested kind or have another one.
-- Admin only; null for anyone else, which the server boundary turns into 403.
create function public.get_material_kind_suggestion_outcomes(p_brewery uuid, p_actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_build_object(
      'asked', count(*),
      'suggested', count(s.category),
      'kept', count(*) filter (where m.category = s.category),
      'changed', count(*) filter (where m.category <> s.category))
    from private.material_kind_suggestions s
    -- Material names are unique only to the letter, so "Citra" and "citra" can both exist:
    -- the newest one answers, and a name counts once.
    left join lateral (
      select category from public.materials
      where brewery_id = s.brewery_id and lower(btrim(name)) = s.name
      order by created_at desc, id limit 1) m on true
    where s.brewery_id = p_brewery and s.asked_at >= now() - interval '30 days')
  where private.actor_has_staff_roles(p_brewery, p_actor, array['admin']::public.staff_role[]);
$$;

revoke all on function public.record_material_kind_suggestion(uuid, uuid, text, public.material_category, numeric),
  public.get_material_kind_suggestion_outcomes(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_material_kind_suggestion(uuid, uuid, text, public.material_category, numeric),
  public.get_material_kind_suggestion_outcomes(uuid, uuid)
  to service_role;

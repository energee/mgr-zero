-- Near-duplicate name warnings (docs/plans/near-duplicate-names.md). Customer,
-- vendor, material and brand names are unique only to the letter, so "Joe's Bar"
-- and "Joes Bar" both save. similar_names lists up to three existing names close
-- to a typed one, so the form can warn before a second record is made. It never
-- blocks a save, and no model is involved: pg_trgm and unaccent do the comparing.

-- The comparison key: lowercase, accents removed, "&" read as "and", a leading
-- "the" dropped, then everything except letters and digits removed.
-- "Joe's Bar" and "JOES  BAR" both become joesbar.
create function private.name_key(p_name text) returns text
language sql stable set search_path = '' as $$
  select regexp_replace(
    regexp_replace(replace(lower(extensions.unaccent(p_name)), '&', ' and '), '^\s*the\s+', ''),
    '[^a-z0-9]+', '', 'g');
$$;

create function private.name_similarity(p_a text, p_b text) returns real
language sql stable set search_path = '' as $$
  select extensions.similarity(private.name_key(p_a), private.name_key(p_b));
$$;

-- 0.61 comes from tests/fixtures/near-duplicate-names.json: it flags none of
-- the look-alike pairs that are different ("16oz Can Lids" and "12oz Can Lids"
-- score 0.60) and misses only a swapped-letter typo ("Mosiac", 0.47).
create function private.names_close(p_a text, p_b text) returns boolean
language sql stable set search_path = '' as $$
  select private.name_similarity(p_a, p_b) >= 0.61;
$$;
revoke all on function private.name_key(text), private.name_similarity(text, text), private.names_close(text, text)
  from public, anon, authenticated, service_role;

-- Security definer because browser roles cannot use the extensions schema. It
-- checks the caller itself: only the roles that may create that kind of record.
-- A customer's or brand's alias is compared as well as its name.
-- No index: a brewery has hundreds of names, not millions.
create function public.similar_names(p_brewery uuid, p_kind text, p_name text, p_exclude uuid default null)
returns table (id uuid, name text) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, case
    when p_kind in ('customer', 'brand') then array['admin', 'sales']
    when p_kind in ('vendor', 'material') then array['admin', 'warehouse', 'brewer']
  end::public.staff_role[]);
  return query
  with candidates as (
    select c.id as record_id, c.name as record_name, v.compared
      from public.customers c cross join lateral (values (c.name), (c.alias)) v(compared)
      where p_kind = 'customer' and c.brewery_id = p_brewery
    union all
    select b.id, b.name, v.compared
      from public.brands b cross join lateral (values (b.name), (b.alias)) v(compared)
      where p_kind = 'brand' and b.brewery_id = p_brewery
    union all
    select v.id, v.name, v.name from public.vendors v
      where p_kind = 'vendor' and v.brewery_id = p_brewery
    union all
    select m.id, m.name, m.name from public.materials m
      where p_kind = 'material' and m.brewery_id = p_brewery
  )
  select c.record_id, c.record_name
  from candidates c
  where c.compared is not null and c.record_id is distinct from p_exclude
    and private.names_close(c.compared, p_name)
  group by c.record_id, c.record_name
  order by max(private.name_similarity(c.compared, p_name)) desc, c.record_name
  limit 3;
end $$;
revoke all on function public.similar_names(uuid, text, text, uuid) from public, anon;
grant execute on function public.similar_names(uuid, text, text, uuid) to authenticated;

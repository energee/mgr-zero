# Near-duplicate names

Status: built 2026-11-19. The owner approved all four recommendations: code
only, warn only, all four record kinds, and edit forms when the name changes.
"Built, and what changed from the plan" at the end lists the differences.

Source: use case 23 in `docs/plans/jev-use-cases.md`, chosen by the owner on
2026-11-19 as the next suggestion feature.

## The problem

Customer, vendor, material and brand names are unique only to the letter
(`unique (brewery_id, name)` in `supabase/migrations/00001_baseline.sql`).
"Joe's Bar" and "Joes Bar" both save. So do "Citra T-90" and "citra t90".
The second record then splits orders, stock or purchasing history across
two rows, and nobody is told.

## Recommendation: code first, no Jev

The original idea was a Jev suggestion. This plan recommends plain code
instead, for three reasons.

1. **The common case is spelling, not meaning.** Punctuation, case, spacing
   and one or two typed letters are what separate most duplicates. Postgres
   already has `pg_trgm` and `unaccent` installed
   (`20261012100000_qbo_customer_data.sql`), and they measure exactly that.
2. **Code needs no key and no consent.** A Jev check would work only for a
   brewery that saved a TypeSafe key and turned suggestions on. A code check
   works for every brewery from the first day, and sends no name anywhere.
3. **The last experiment says to check a baseline first.** On 207 messy
   material names a keyword lookup did about as well as Jev
   (`docs/plans/jev-suggestions.md`, messy holdout results).

Jev could still add matches that share meaning but not spelling ("Joe's
Tavern LLC" and "Joes Bar"). That is a later, separate step. It should be
built only if staff report duplicates the code check missed.

## What staff see

On the create form, after leaving the name field:

- If an existing record has a close name, a note shows under the field:
  **Similar: Joes Bar**, linking to that record.
- The note never blocks Save. Two real customers can have close names.
- An exact duplicate is still refused by the database, as today.
- The same note shows on an edit form when the name is changed.

Up to three close names are listed, closest first.

## How a name is compared

One SQL function, `private.name_key(text)`, makes a comparison key:
lowercase, accents removed, everything except letters and digits removed.
"Joe's Bar" and "JOES  BAR" both become `joesbar`.

Two names are close when the trigram similarity of their keys is at or
above a threshold. Equal keys score 1. The threshold is set by task 1's
test set, starting at 0.6.

Customers and brands each have an `alias` column
(`20261016100500_customer_country_alias.sql`, `20261014100500_brand_alias.sql`).
The alias is compared too, because `list_customers` already searches name
and alias.

## Tasks

Each task starts with its failing test. Task 1 comes first because it sets
the threshold. Tasks 3 to 6 can run in parallel after task 2. Task 7 is last.

### 1. Threshold test set

- **Create** `tests/fixtures/near-duplicate-names.json`: about 60 made-up
  name pairs, each labeled `same` or `different`. Include punctuation, case,
  spacing, one-letter typos, "LLC" and "Inc" endings, and pairs that look
  close but are different ("Hop Head Farms" and "Hop Hero Farms").
- **Create** `tests/near-duplicate-names.test.ts` (database suite). It loads
  the pairs, calls the comparison from task 2, and fails if any `same` pair
  is missed or more than two `different` pairs are flagged.
- **Acceptance:** the test fails before task 2. After task 2 it passes, and
  the threshold it needed is written in the migration's comment.

### 2. Migration and query (depends on 1)

- **Create** `supabase/migrations/<timestamp later than main's newest>_similar_names.sql`:

```sql
create function private.name_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(extensions.unaccent(p_name)), '[^a-z0-9]+', '', 'g');
$$;

-- Up to three existing names close to p_name, closest first. Security
-- invoker: row level security already limits each table to the caller's
-- brewery and roles. No index: a brewery has hundreds of names, not millions.
create function public.similar_names(
  p_brewery uuid, p_kind text, p_name text, p_exclude uuid default null
) returns table (id uuid, name text) language sql stable set search_path = '' as $$
  with candidates as (
    select c.id, c.name, compared from public.customers c
      cross join lateral (values (c.name), (c.alias)) v(compared)
      where p_kind = 'customer' and c.brewery_id = p_brewery
    union all
    select b.id, b.name, compared from public.brands b
      cross join lateral (values (b.name), (b.alias)) v(compared)
      where p_kind = 'brand' and b.brewery_id = p_brewery
    union all
    select v.id, v.name, v.name from public.vendors v
      where p_kind = 'vendor' and v.brewery_id = p_brewery
    union all
    select m.id, m.name, m.name from public.materials m
      where p_kind = 'material' and m.brewery_id = p_brewery
  )
  select id, name from (
    select id, name, max(extensions.similarity(private.name_key(compared), private.name_key(p_name))) as score
    from candidates
    where compared is not null and id is distinct from p_exclude
    group by id, name
  ) scored
  where score >= 0.6
  order by score desc, name
  limit 3;
$$;
revoke all on function private.name_key(text) from public, anon, authenticated;
revoke all on function public.similar_names(uuid, text, text, uuid) from public, anon;
grant execute on function public.similar_names(uuid, text, text, uuid) to authenticated;
```

  `similar_names` runs as the caller, so it cannot call a function in the
  private schema. Before writing the migration, check how other invoker
  functions reach private helpers; if they cannot, inline the
  `regexp_replace` expression and drop `private.name_key`.
- **Modify** `lib/commands/customers.ts`: add the query
  `find_similar_names`.
  - Input: `{ kind: "customer" | "vendor" | "material" | "brand", name: string (1 to 120 characters), excludeId?: uuid }`.
  - Output: `{ id: string; name: string }[]`.
  - Roles: the union of the roles that may create each kind. The handler
    refuses a kind the caller's roles cannot create.
- **Modify** `lib/commands/query-cache.ts`: add `find_similar_names` to the
  read-once names, as `suggest_material_category` is.
- **Then run** `bun run migrations:lock`, `bun run types:database` and
  `bun run docs:api`. Add the function to `tests/rpc-allowlist.test.ts` and
  `tests/rls-taproom.test.ts`.
- **Acceptance:** task 1's test passes. A caller in brewery A never gets a
  name from brewery B.

### 3. The note under a name field

- **Test first:** `tests/similar-names-view.test.ts` (pure, listed in
  `pureTests`). No close names renders nothing. One renders "Similar: Joes
  Bar" as a link. Three render in order.
- **Create** `lib/mgr/similar-names.ts`: `similarNamesNote(matches, hrefFor)`
  returns the note's parts, or null.
- **Modify** `components/mgr/e.tsx`: `E.edit` takes an optional `note`
  (ReactNode) drawn under the field where `error` is drawn. An error wins
  when both are set. `FieldControls` has no description slot today; search
  once more before adding one.

### 4. Vendor form

- **Modify** `components/mgr/views/vendor.tsx` and
  `app/(app)/vendors/vendor-form.tsx`: on name blur, ask
  `find_similar_names` with kind `vendor` (and `excludeId` on edit), and
  pass the note.
- **Test:** extend the vendor view test: the note renders from the model.

### 5. Material form

- **Modify** `components/mgr/views/material.tsx` and
  `app/(app)/materials/material-form.tsx`. The form already has `nameBlur`
  and `askedName` for the kind suggestion. The duplicate check reuses both.
- **Test:** extend `tests/purchasing-view.test.ts`.

### 6. Customer and brand forms

- **Modify** `app/(app)/customers/customer-form.tsx` and its view, and the
  brand create form under `app/(app)/catalog/brands/`.
- **Test:** extend each view's existing test.

### 7. Docs and inventory (after 4 to 6)

- **Modify** `content/docs/staff-guide.mdx`: one sentence per form.
- **Modify** `components/mgr/screens.tsx`: a "similar name" state on each of
  the four create frames, and one new frame, "Vendor similar name".
- **Acceptance:** the screen proof list in `AGENTS.md` passes, and the
  rendered note is checked at desk and phone width.

## Not in this plan

- No Jev call, no TypeSafe key, no consent switch.
- No merge tool for records that are already duplicated.
- No check on CSV import rows (use case 8 covers imports).
- No block on Save.

## Owner decisions needed

1. **Code only, or Jev too?** Recommended: code only. Revisit Jev if staff
   report misses.
2. **Warn or block?** Recommended: warn only.
3. **Which records?** Recommended: customers, vendors, materials, brands.
4. **Edit forms too?** Recommended: yes, when the name changes.

## Built, and what changed from the plan (2026-11-19)

- **Threshold 0.61, not 0.6.** On the 45 labeled pairs in
  `tests/fixtures/near-duplicate-names.json`, 0.61 flags no look-alike pair
  that is a different record and misses one `same` pair, a swapped-letter
  typo ("Mosiac Cryo", 0.47). "16oz Can Lids" and "12oz Can Lids" score
  exactly 0.60.
- **The key also reads "&" as "and" and drops a leading "the".** Without
  these, "Maple & Vine" and "The Rusty Anchor" were missed.
- **`similar_names` is a security definer function.** Browser roles cannot
  use the `extensions` schema, where `similarity` and `unaccent` live. The
  function checks the caller's roles for the kind asked.
- **The note is a `note` control on `E.edit`**, drawn where the error is. An
  error replaces it.
- **One shared hook, `useSimilarNames`** in `components/mgr/similar-names.tsx`,
  serves all four forms.
- **A material's close name is plain text.** A material has no page to open.
- **45 pairs, not 60.** They were enough to place the threshold.
- **One new inventory frame**, "Vendor similar name". The other three forms
  are described in its spec and in the staff guide, not drawn separately.

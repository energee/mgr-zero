# Brand alias, and a recipe's brand that can change

Status: plan, awaiting approval. Branch `feat/brand-alias`, PR to `main`.

## Why

Two gaps surfaced while reviewing the Lolev import on /batches (2026-10-14):

1. **An informal name.** A beer can carry a series number and a real name:
   Lolev's "Animal #14 Appaloosa". The user wants the brand **name** to be the
   beer's name ("Appaloosa") and an **alias** for the series number
   ("Animal #14"). That means one optional alias per brand, shown to staff only.
   (Prior plans that ban command-name "aliases" such as `create_product` are
   unrelated: this is a brand field.)
2. **A recipe's brand cannot be set after creation.** `recipes.brand_id` exists
   (nullable), but only `create_recipe` writes it; there is no update. The import
   never set it, so all 169 Lolev recipes are unlinked, and staff cannot fix a
   wrong or missing link.

## Decisions (user, 2026-10-14)

- One alias per brand. Staff-only: shown and searchable in MGR, never on the
  portal, Square, the public menu, or SKU, QBO or invoice names.
- Name = the beer's real name; alias = the series number.

| Lolev beer | Brand name | Alias | Description note |
|---|---|---|---|
| Animal #14 Appaloosa | Appaloosa | Animal #14 | |
| Animal #15 Ocelot | Ocelot | Animal #15 | |
| Animal #16 Dalmatian | Dalmatian | Animal #16 | |
| Animal #17 Coven Collab | Stygian Owl | Animal #17 | Coven collab |
| Animal #18 Vulture Eskerhart Collab | Vulture | Animal #18 | Eskerhart collab |
| Animal #19 Azvex Collab | Peregrine Falcon | Animal #19 | Azvex collab |
| Rock/Mineral #1 Opal | Sapphire | Rock/Mineral #1 | |

Beers with only a number ("Animal #20", "Reptile #3") keep their name and get
no alias. The renames are import data (local, git-ignored), not this PR.

## What reads a brand name (mapped read-only, spot-checked)

| Reader | Where | Alias? |
|---|---|---|
| `upsert_brand` command + RPC | `lib/commands/catalog.ts:27`; `00001_baseline.sql:3442` | **yes**: new `p_alias` |
| CSV import calls `upsert_brand` positionally | `00001_baseline.sql:4099`, `20261012100700_import_resolve_names.sql:97` | `p_alias` defaults to null, so both keep working unchanged |
| Brand page and form | `app/(app)/catalog/brands/[id]/brand-page.tsx`, `components/mgr/views/brand.tsx:59`, `lib/mgr/brand-view.ts:96` | **yes**: an Alias field (`E.edit`) |
| Catalog brand row | `lib/mgr/catalog-view.ts:67` | **yes**: "Appaloosa · Animal #14" |
| Brand pickers | `new-recipe.tsx:32`, `recipes/new/page.tsx:24`, `new-batch-form.tsx:37`, `schedule-packaging-run-view.ts:63` | **yes**: the option label shows the alias |
| `search_entities` | `lib/commands/search.ts` (no brand kind today) | **yes**: the `sku` and `batch` branches also match `brands.alias`, so "Animal #14" finds the SKUs and batches. No new kind. |
| `brandNames()` (batches, packaging runs) | `lib/commands/packaging.ts:258` | no: rows keep the name; the alias shows on brand surfaces |
| Portal, Square/POS menu, public menu, SKU names (QBO, invoices) | `portal.ts:137`, `lib/pos.ts:77`, `get_published_pos_menu`, `00001_baseline.sql:3488` | **no**: they read `brands.name`, so a new column changes nothing there |
| **Portal customers reading `brands` rows directly** | `customer_read on brands` (`00001_baseline.sql:6469`) | **yes, a leak**: the policy is row-level only, so a customer could `select alias from brands` through PostgREST. The portal never reads `brands` directly: it gets `brand_name` from the `portal_sku_price_rows` projection (`20261009100000…:64`). So the policy is dropped, as #788 dropped the customer policies on orders and SKUs. |

### Recipe brand

| Reader | Where | Change? |
|---|---|---|
| `recipes.brand_id` | `00001_baseline.sql:787` (nullable, composite FK, no trigger) | no schema change |
| Only writer, `create_recipe` | `production.ts:41` | unchanged |
| Recipes list | `app/(app)/recipes/page.tsx:26` | no: it already shows the brand |
| Recipe page | `app/(app)/recipes/[id]/page.tsx`, `components/mgr/views/recipe.tsx:51` (`parentForm` slot) | **yes**: a Brand picker that calls `set_recipe_brand` |
| Batches | copy the brand into `intended_brand_id` at schedule time (`00001_baseline.sql:5053`) | no: changing a recipe's brand never rewrites past batches |

## Schema — `20261014100500_brand_alias.sql`

(`…100400` is taken by #875; re-check the max migration when writing.)

```sql
alter table public.brands add column alias text check (alias is null or length(trim(alias)) > 0);
-- Staff-only by construction: customers read brand names through the portal
-- projections (#788), never the table, so the leftover row policy goes.
drop policy customer_read on public.brands;
-- upsert_brand gains p_alias text default null (drop + recreate; grants re-issued).
-- set_recipe_brand(p_brewery, p_recipe, p_brand, p_request_id): admin|brewer;
--   p_brand null clears it; the brand must be this brewery's.
```

## Tasks

Each one starts by writing its failing test.

1. **Migration: `alias` + `upsert_brand(p_alias)`.**
   - Test first: `tests/brand-alias.test.ts` (DB):
     - the alias saves and reads back; a blank alias is refused;
     - an upsert without an alias keeps the existing one; an explicit null clears it;
     - both CSV-import callers still work;
     - **a portal customer reads no `brands` row** (so no alias), and the portal
       catalog still names the brand (`portal_sku_price_rows.brand_name`). Run the
       existing portal suites to prove nothing else read `brands` directly.
   - Write the migration, then `bun run migrations:lock`.
   - Deps: none.
2. **`set_recipe_brand` RPC + command.**
   - Same test file:
     - sets the brand, clears it, refuses another brewery's brand, refuses sales;
     - replays;
     - a batch scheduled earlier keeps its `intended_brand_id`.
   - Add the RPC to `rpc-allowlist` and `rls-taproom`, plus an `API_AREAS` check.
   - Deps: 1.
3. **Search.**
   - Test in the existing search test file: "Animal #14" finds the brand's SKU
     and batch.
   - Add an alias match to the `sku` and `batch` branches of `search.ts`.
   - Deps: 1.
4. **Brand view, form and catalog row.**
   - TDD `brand-view.ts` and `catalog-view.ts`: the alias is in the model, and
     the row title reads "Name · Alias".
   - Add the Alias field (`E.edit`) to the brand page.
   - Update `screens.tsx` "Brand" and "Catalog" (`writes`), and the
     `lib/mgr/fixtures/catalog.ts` fixtures.
   - Deps: 1.
5. **Pickers and the recipe brand picker.**
   - TDD one shared label helper, `brandLabel(b)` = `name` or `name · alias`.
     Search for an existing one first; reuse it in all four pickers.
   - Add the Brand `E.pick` in the recipe page's `parentForm`, saving through
     `set_recipe_brand`.
   - Update `screens.tsx` "Recipe" `writes`, and the fixtures.
   - Deps: 2, 4.
6. **Types and docs.**
   - Run `bash scripts/generate-db-types.sh` and `bun run docs:api`.
   - Schema design: `brands.alias`, `set_recipe_brand`.
   - Staff guide, Catalog/Brand: what an alias is, that only staff see it, and
     that search finds it. Recipes: changing a recipe's brand.
   - Deps: 3, 5.

Then the full proof, the eyeball check of /catalog, a brand page and a recipe
page, `/simplify`, and the PR.

Parallelism: 1 → {2, 3, 4} → 5 → 6.

## v1 cross-check (2026-10-14)

No conflict or repeat. v1 had no brand alias and no recipe-brand change
(`~/Repos/mgr/supabase/migrations/00003_brands.sql:6`). One lesson, adopted:
v1's RLS audit (`docs/security/rls-policy-audit.md:115`, #604) found that a
new column on a row-readable table leaks to portal customers. v2's
`customer_read on brands` would have done exactly that, so this plan drops it
and tests it (task 1).

## Import (local only, git-ignored; after merge)

1. Rename the 7 brands and set their aliases, through `upsert_brand`, from the
   table above.
2. Link recipes to brands:
   - Lolev `recipe.beer` where set (43);
   - otherwise the single beer its batches were brewed as (126);
   - recipes brewed as several beers (6) stay unlinked and are reported.

## Open question (default chosen; say if wrong)

- **Alias on batch rows.** Default: no. Batch rows show the brand name, and the
  alias appears on brand surfaces and in search. To show "Appaloosa · Animal #14"
  on /batches too, `brandNames()` would need the alias, which touches packaging
  rows as well.

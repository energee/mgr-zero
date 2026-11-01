# Brand alias, and a recipe's brand that can change

Status: plan, awaiting approval. Branch `feat/brand-alias`, PR to `main`.

## Why

Two import gaps need product support. Examples below are fictional.

1. **An informal name.** A beer can carry a series number and a real name:
   For example, "Series #1 Meadow Pale" needs the brand **name** "Meadow Pale"
   and the staff-only **alias** "Series #1".
   (Prior plans that ban command-name "aliases" such as `create_product` are
   unrelated: this is a brand field.)
2. **A recipe's brand cannot be set after creation.** `recipes.brand_id` exists
   (nullable), but only `create_recipe` writes it; there is no update.
   Staff cannot fix a wrong or missing link after an import.

## Decisions (user, 2026-10-14)

- One alias per brand. Staff-only: shown and searchable in MGR, never on the
  portal, Square, the public menu, or SKU, QBO or invoice names.
- Name = the beer's real name; alias = the series number.

| Fictional source name | Brand name | Alias | Description note |
| --- | --- | --- | --- |
| Series #1 Meadow Pale | Meadow Pale | Series #1 | |
| Series #2 Summit Collab | Summit IPA | Series #2 | Collaboration |

A beer with only a series number keeps its name and gets no alias.
Actual tenant mappings remain local and git-ignored.

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
| Portal customers reading `brands` rows directly | `customer_read on brands` was dropped by `20261012100800_portal_customer_columns.sql:25` | **no leak**: `brands` has only `staff_read`. The portal gets `brand_name` through security-definer projections (`portal_sku_price_rows`, `portal_schedule_rows`). A test proves a customer still reads no alias. |

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
-- Staff-only already: brands has no customer policy (dropped in 20261012100800).
-- upsert_brand gains p_alias text default null (drop + recreate; grants re-issued).
-- set_recipe_brand(p_brewery, p_recipe, p_brand, p_request_id): admin|brewer;
--   p_brand null clears it; the brand must be this brewery's.
```

## Tasks

Each one starts by writing its failing test.

1. **Migration: `alias` + `upsert_brand(p_alias)`.**
   - Test first: `tests/brand-alias.test.ts` (DB):
     - the alias saves and reads back; a blank alias is refused;
     - upsert_brand replaces every field (style, hops…), so an upsert without an
       alias clears it, like the rest; the form always sends the current alias;
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
baseline `customer_read on brands` would have done exactly that. It turned out
already dropped (`20261012100800…:25`; the cross-check read only the baseline),
so no policy change is needed. Task 1 keeps a test that a customer reads no alias.

## Import (local only, git-ignored; after merge)

1. Set approved names and aliases through `upsert_brand` using private mappings.
2. Link recipes to brands:
   - use a source recipe's explicit beer reference where present;
   - otherwise use the single beer its batches were brewed as;
   - report ambiguous recipes without inventing a brand link.

## Open question (default chosen; say if wrong)

- **Alias on batch rows.** Default: no. Batch rows show the brand name, and the
  alias appears on brand surfaces and in search. To show "Appaloosa · Animal #14"
  on /batches too, `brandNames()` would need the alias, which touches packaging
  rows as well.

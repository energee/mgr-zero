# Recipe run sheet: batch size, packs, the day at a glance, pooled actuals

Status: Phase 1 plan, awaiting approval. Three PRs, each to `main`, each cut
from `main` after the one before it lands. The first starts after the recipe
brewsheet (`docs/plans/recipe-brewsheet.md`, PR #1819) lands.

The approved design is `docs/plans/recipe-run-sheet-mock.html`. Open it in a
browser. Its data is made up.

## Why

- The recipe sheet shows a malt as `57.5 lb / bbl`. The brewery writes recipes
  in whole bags for a batch: 23 bags of 55 lb at 22 bbl.
- A hop extract reads `0.0455 lb / bbl` where it is one bottle.
- The sheet is a column of identical boxes. Nothing on it could only belong to
  a brewery.
- Batch actuals shows one recipe's batches. The imported data has 169 recipes
  on 99 grain bills, and 21 grain bills are shared, so a mash has far more
  history than any one recipe shows.

## Owner decisions (2026-11-10)

| Decision | Choice |
|---|---|
| Batch size | Saved on the recipe. |
| Pack size | Tracked on every ingredient, so anything sold by the piece reads in pieces. |
| Layout | Option B, "the day at a glance", as in the mock. |
| Batch actuals | Mash figures pooled across recipes with the same grain bill. A split batch gets a row per tank. |

My calls, not yet confirmed by the owner:

- A brewer can also type packs when entering an ingredient.
- The six simplifications in the mock: batch amounts only, "when" said once per
  moment, no rest or stage names on the sheet, the two assumptions under the
  figures, only the target water profile, Batch actuals and history folded.
- The boil draws at a fixed height with no temperature, because the boiling
  point depends on altitude.

## What the brewer sees

- **Header.** The name, then one sentence: the brand, the batch size, the
  recipe note, the saved date.
- **Figures.** OG, FG, ABV, IBU (and SRM once `docs/plans/recipe-srm.md`
  lands). Under them: *Assumes 72% efficiency and 78% attenuation.*
- **The band.** One temperature line from mash-in to knock-out: each mash rest
  with its minutes, the boil, the whirlpool and its rest. A mark shows where
  each hop goes in.
- **Goes in on brew day.** Everything in time order: water and salts, grain in
  bags with its share, sparge, each boil addition, the whirlpool. Each row is
  when, what, how much for the batch. A grain-bill bar shows the shares.
- **In the cellar.** A temperature profile by day with the dry hop marked,
  then the pitch, the dry hops and any packaging additions.
- **Batch actuals**, folded to one line that opens the table.
- **As brewed before**, one row that opens the earlier recipe.
- Editing is unchanged in kind: a name opens its ingredient, a fact opens the
  sheet that holds it, and Save changes appears once something differs.

## Rules

| Rule | Detail |
|---|---|
| Amounts are stored per barrel | Planning reads `per_bbl_qty`. Batch amounts and packs are derived from it and the batch size. |
| Batch size is optional | A recipe without one shows per-barrel amounts, as today. |
| Packs | `amount ÷ pack size`, shown as "23 bags" when it is whole. Otherwise the amount in its unit, with the existing Round choices. |
| Pack word | Picked from a fixed list on the material: bag, sack, box, bottle, pitch, pail, drum, tote. No word means "× 55 lb", as today. |
| Grain share | Each mash line's weight over all mash lines' weight. |
| Same grain bill | Two saved copies match when their mash-stage materials and per-barrel amounts are equal. Exact, no tolerance. |
| Which copy is compared | Each batch is matched on the copy it was brewed from. |
| What pools | OG and efficiency. A batch brewed as another recipe shows no FG, ABV or attenuation here. |
| Per tank | A batch with more than one tank gets one row per tank, each with its own readings. Efficiency is the batch's. |

## Not in this plan

- One brew split into two differently named beers. A batch belongs to one
  recipe today.
- A shared base mash that several recipes build on.
- Grain-bar tints from malt color. That needs the SRM plan.
- Near-match grain bills.
- New batch pre-filling its volume from the recipe's batch size.

## Open questions for the owner

1. **Batch size on existing recipes.** 130 of 175 imported batches are 22 bbl.
   Should a one-time data fill set each imported recipe's batch size from its
   most common batch, and on which databases?
2. **Pack sizes.** None of the 41 malts has one. You said these will be
   tracked on the ingredient. Will you type them, or should a fill propose
   them?
3. **Pack words.** Is the list right: bag, sack, box, bottle, pitch, pail,
   drum, tote?
4. **Split into two beers.** Does the brewery split one brew into two
   differently named beers? That is a separate change if so.

---

## PR 1: batch size and packs

Branch `feat/recipe-batch-size`. Database change.

### Migration

File: `supabase/migrations/<UTC timestamp at build>_recipe_batch_size.sql`,
later than every migration on `main`.

```sql
alter table public.recipe_versions
  add column batch_bbl numeric(10,3) check (batch_bbl > 0); -- the batch this copy is written for
alter table public.materials
  add column pack_name text check (pack_name in ('bag','sack','box','bottle','pitch','pail','drum','tote'));
```

Function bodies are copied from their latest definitions at build time:

| Function | Change |
|---|---|
| `public.create_recipe_version` | Same signature. It reads `p_process ->> 'batch_bbl'`, as it reads the other process values. |
| `public.upsert_material` | New `p_pack_name`, so drop the old signature and re-grant. An omitted value keeps the saved one. |

Merging deploys production and pushes the migration to hosted. Ask first.

### Tasks

1. **Migration, lock, types.** Test first: `tests/rpc-allowlist.test.ts`
   (new signature), `tests/rls-taproom.test.ts` (arity). Run
   `MGR_TEST_DB_RESET=1 scripts/test-db.sh`, `bun run types:database`,
   `bun run migrations:lock`. Accept: `migrations-applied`, tsc.
2. **Commands.** Test first: `tests/production.test.ts` (batch size saves on a
   copy, is optional, 0 is refused; `get_recipe` returns it),
   `tests/purchasing.test.ts` (pack word saves, an omitted one is kept, an
   unknown word is refused). Files: `lib/commands/production.ts`,
   `lib/commands/purchasing.ts`, `lib/mgr/enums.ts` (`PACK_NAMES`). Types:
   `batchBbl: bbl.optional()`, `packName: z.enum(PACK_NAMES).optional()`.
3. **Pack and share math.** Test first: `tests/pack-qty.test.ts` (or the file
   that covers `lib/mgr/pack-qty.ts`), `tests/recipe-view.test.ts`. Extend
   `splitPacks` and `withPacks`; do not write a second pack helper. Types:
   `packText(qty, { factor, unit, packName }): string`;
   `gristShares(lines): number[]`. Goldens: 1,265 lb at 55 lb is "23 bags";
   8.8 lb with no pack is "8.8 lb"; 1,265 of 1,925 lb is 66%.
4. **Material sheet.** Test first: `tests/purchasing-view.test.ts`. A **Sold
   by** pick beside Base units per purchase unit. Files:
   `lib/mgr/material-view.ts`, `components/mgr/views/material.tsx`,
   `app/(app)/materials/material-form.tsx`, `lib/mgr/fixtures/purchasing.ts`.
5. **Batch size in the editor.** Test first: `tests/recipe-draft.test.ts`,
   `tests/new-recipe.test.ts`, `tests/recipe-view.test.ts`. The draft gains
   `batchBbl`; it replaces the page-only Show totals at. `draftBlocker` checks
   it. A kept draft from before this change fails its schema and is dropped
   with the existing message. Files: `lib/mgr/recipe-view.ts`,
   `lib/mgr/recipe-draft.ts`, `components/mgr/views/recipe.tsx`,
   `app/(app)/recipes/[id]/recipe-version-form.tsx`.
6. **Entering packs.** Test first: `tests/recipe-process-view.test.ts`. With a
   batch size and a pack size, the Ingredient sheet takes a count of packs and
   works out the per-barrel amount; the per-barrel field stays. Files:
   `components/mgr/views/ingredient.tsx`, `lib/mgr/recipe-process-view.ts`,
   `app/(app)/recipes/[id]/schedule-sheets.tsx`.
7. **Docs and proof.** Staff guide; `bun run docs:api`; `bunx tsc --noEmit`,
   `bun run lint`, the complete `bun run test`; browser at 1280 and 390.

## PR 2: the day at a glance

Branch `feat/recipe-run-sheet`. Screen-only. Build to the mock.

8. **View model.** Test first: `tests/recipe-view.test.ts`. Types:
   `brewDayBand(mashSchedule, numbers): { zones; steps; marks }`;
   `goesIn(lines, water, batchBbl): { when: string; rows }[]` for brew day and
   for the cellar; `assumesText(numbers): string`. Files:
   `lib/mgr/recipe-view.ts`, `lib/mgr/recipe-process-view.ts`.
9. **The step line.** One small SVG component, used by the band and by the
   fermentation profile: x as a percent of the span, y in pixels, so text
   keeps its size at any width. Its accessible name is a sentence from the
   model. Test first: `tests/mgr-screens.test.ts` (the drawn labels). File:
   `components/mgr/views/recipe.tsx`, or a sibling file if it grows.
10. **The sheet.** Test first: `tests/mgr-screens.test.ts`,
    `tests/new-recipe.test.ts`, `tests/standing-help.test.ts`. Rewrite
    `RecipeView` to the mock: header sentence, figures, assumptions, band, two
    columns that stack on a phone, folded Batch actuals and As brewed. The
    save bar, the change note, the read-only copy, the creating state and
    Refresh from Materials keep working. No "version" on screen.
11. **One sheet for the process numbers.** The eight process numbers and the
    batch size open in one sheet from any fact that shows them. Test first:
    `tests/mgr-screens.test.ts`, `tests/tap-coverage.test.ts`,
    `tests/screen-links.test.ts`. Files: a view under `components/mgr/views/`,
    `app/(app)/recipes/[id]/schedule-sheets.tsx`, `components/mgr/screens.tsx`,
    `lib/mgr/screen-routes.ts`, `lib/mgr/screen-links.ts`.
12. **Inventory and guide.** `lib/mgr/fixtures/production.ts`, the Recipe
    record, `content/docs/staff-guide.mdx`.
13. **Proof.** `bunx tsc --noEmit`, `bun run lint`, the complete
    `bun run test`; browser at 1280, 900 and 390; before and after
    screenshots from the inventory frame on the PR.

## PR 3: Batch actuals by mash and by tank

Branch `feat/recipe-actuals-by-mash`. A query change, no database change.

14. **A row per tank.** Test first: `tests/recipe-outcomes.test.ts` (a batch
    in two tanks gives two rows with their own OG and FG and the batch's
    efficiency; a double batch into one tank stays one row). Readings are read
    by `occupancy_id`; the row carries the vessel's name. File:
    `lib/commands/production.ts`. Types: `RecipeOutcome` gains
    `vessel?: string`.
15. **Same grain bill.** Test first: `tests/recipe-outcomes.test.ts` (another
    recipe with the same mash lines pools; one bag different does not; a batch
    brewed before a grain-bill change pools with its own copy's bill; another
    brewery's recipe never pools), `tests/recipe-view.test.ts` (`gristKey`).
    `get_recipe_outcomes` also returns brewed batches of other recipes whose
    own copy has the shown copy's grain bill, each with its recipe's name.
    Types: `gristKey(mashLines): string`; `RecipeOutcome` gains
    `recipeName?: string`.
    Ceiling: it reads every saved copy's mash lines in the brewery to find
    matches. That is a few hundred rows today. If it measures slow, store the
    key on the copy.
16. **The table.** Test first: `tests/recipe-outcomes-view.test.ts`,
    `tests/mgr-screens.test.ts`. The summary gives the mash figures for the
    grain bill and the fermentation figures for this recipe. Rows read
    "as <recipe>" and "in <vessel>". Files: `lib/mgr/recipe-view.ts`,
    `components/mgr/views/recipe.tsx`, fixtures.
17. **Docs and proof.** Staff guide; `bun run docs:api` for
    `get_recipe_outcomes`; the proof list as in task 13.

## Order with the other plans

1. PR #1819, the brewsheet.
2. PR 1 here, batch size and packs.
3. PR 2 here, the layout.
4. PR 3 here, actuals by mash and by tank.
5. `docs/plans/recipe-srm.md`. Its figure and malt tints fit the new sheet.
   It also changes `upsert_material`, so it copies that function after PR 1.
6. The derived figures: BU:GU, IBU per addition, cost per barrel. Grain shares
   are in PR 1 and PR 2.

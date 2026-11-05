# Recipe outcomes, brewing order and recipe search (PR C)

Status: Phase 1 plan, never approved or built. Kept for its decisions, 2026-11-04. PR A merged
as #906. Re-check every path against `main` before use.
Original status: Phase 1 plan, awaiting approval. Branch `feat/recipe-outcomes`, worktree
`.agents/worktrees/feat-recipe-outcomes`, PR to `main`. Phase 2 starts after PR
A (`feat/recipe-page-usability`) merges: rebase onto `main` first, so every task
builds on A's code. PR B runs in parallel. PR D rebases onto this one.

Ownership: this PR owns QW9 (brewing order) and BIG7 (recipe search). A's open
question 1 and D's overlap row for `lib/commands/production.ts` still name A or
nobody. Correct both before Phase 2.

## Goal

The recipe page's job is "actuals keep predictions honest", but it shows no
actuals. `get_recipe_outcomes` measures each brewed batch of a recipe from its
fermentation readings. The page lists one row per batch, newest first, beside
what that batch's version predicted. Nothing is stored. The PR also lists
ingredients in brewing order and adds search to Recipes.

## Decisions it implements

| Item | What ships |
|---|---|
| Decision 1, BIG1 | `get_recipe_outcomes`: OG, FG, ABV, apparent attenuation and realized brewhouse efficiency per batch, computed on read, drawn as the tape under **Batch actuals**. |
| QW9 | `get_recipe` returns ingredients in brewing order. |
| Decision 9, BIG7 | `list_recipes` takes an optional `q`. Recipes gets a search box and a "No recipes match" state. Reading: reuse #896's search pattern; BIG7 asks only for `q`, so no sort (Risk 3). |

### How an outcome is computed

Gravity is stored in °Plato. The formulas run in SG via `platoToSg` and
`sgToPlato` (`lib/recipe-gravity.ts`).

- **Batches.** `recipe_version_id` is a version of the recipe and `brewed_on` is set. A brewed batch cannot be cancelled (`lock_unstarted_batch`), so no `cancelled_at` filter is needed.
- **Version.** `batches.recipe_version_id`. Nothing updates it after `schedule_batch`, and every brew record copies it.
- **OG.** The first `fermentation_readings.gravity_plato` by `at`, skipping readings with no gravity. Readings are read by `batch_id` (`readings_batch_idx`), so a historical batch with no tank counts.
- **FG.** The last gravity reading. With only one reading, FG and everything built on it is null. An open batch's FG is its latest reading (decision 1).
- **ABV.** `(OG_sg - FG_sg) * 131.25`, the expression `recipeGravity` uses.
- **Apparent attenuation.** `(OG_sg - FG_sg) / (OG_sg - 1)`, the quantity `yeast_attenuation` assumes.
- **Knockout.** The sum of `brew_records.initial_bbl` over each turn's current revision (`currentBrewRecords`). Null for an older batch with no brew record. It enters efficiency only; it is not shown.
- **Efficiency.** `(OG_sg - 1) * 1000 * knockoutBbl / (potentialPointsPerBbl * plannedBbl)`.
  - `potentialPointsPerBbl` is `recipeGravity`'s gravity-unit sum at 100% efficiency over the version's mash lines.
  - Brew day prefills grain for `planned_bbl` (`app/(app)/batches/[id]/page.tsx:39`; later turns get the remainder, `lib/mgr/brew-day-view.ts:97-101`). So the grain is the plan per barrel times planned barrels, and the wort is the knockout.
  - A short knockout no longer reads as higher efficiency: 28.5 of 30 bbl at a true 72% shows 72%, not 75.8%.
  - Imported batches set `planned_bbl` to their knockout (`scripts/import-lolev.ts:259`), so their ratio is 1.
- **Predicted.** Each batch's own version: `recipeGravity` over its ingredients, plus its assumed efficiency and attenuation.
- **Missing inputs.** A metric is null, never 0, when an input is missing: no reading, one reading, no brew record, a blocked or empty mash bill, `potentialPointsPerBbl <= 0`, or `OG_sg <= 1`.

### Brewing order (QW9)

`INGREDIENT_STAGES` (`lib/mgr/recipe-process-view.ts:12`) is already in process
order. Within a stage, boil and whirlpool lines count down (larger timing
first). Every other stage counts up (smaller first), so dry hops sort by day
once D stores `day * 1440`. Untimed lines follow timed ones, and `sort` breaks
ties. The direction depends on the stage, so `get_recipe` sorts in TypeScript
after the query. A's copied draft then saves in this order.

## Out of scope

| Item | Owner |
|---|---|
| Batch totals, dry-hop day display and yeast packs on Brew day | B, D |
| IBU, alpha acid, pitch rate, dry-hop day | D |
| Saved date, price-group row, empty-tape rule (QW12), Recipes row shape (QW17), frame helpers (QW25) | A |
| Knockout on the row | Not requested. |
| Efficiency from recorded mash consumption | Not requested; imported batches record none. |
| A computed "lower the assumption?" note | Not requested. The fixture's hand-written `actualsNote` goes with its field, since nothing live can fill it (screen-parity rule 5). |

## Files touched

| File | Change | Also touched by |
|---|---|---|
| `lib/recipe-gravity.ts`, `tests/recipe-gravity.test.ts` | `potentialPointsPerBbl`, `measuredGravity`, private `abvFromSg` | A (`gravityBlockers`), D (IBU) |
| `lib/mgr/brew-day-view.ts` | `currentBrewRecords` becomes generic | B (`brewPlanRows`), D (`yeastPitch`) |
| `lib/commands/production.ts` | `get_recipe_outcomes`; brewing order; `q` on `list_recipes` | D (`get_recipe`, `create_recipe_version`) |
| `lib/mgr/recipe-view.ts` | `RecipeOutcome`, `outcomeTape`; drop `actualsNote` | A, B (`scheduleHref`), D |
| `components/mgr/views/recipe.tsx` | heading over the tape; drop `actualsNote` | A, B, D |
| `app/(app)/recipes/[id]/page.tsx` | read outcomes, set `tape` | A, B, D |
| `lib/mgr/recipes-view.ts`, `components/mgr/views/recipes.tsx`, `app/(app)/recipes/page.tsx` | `filtered`, `controls`, `?q=` | A (QW17) |
| `lib/mgr/fixtures/production.ts`, `components/mgr/screens.tsx` | outcomes fixture, predicted text, reads tag, states, inert search | A, B, D |
| `content/docs/staff-guide.mdx`, `content/docs/api/production.mdx` (generated) | Recipes section; `bun run docs:api` | A, B, D |
| Tests | `tests/recipe-outcomes.test.ts` (new, DB), `tests/recipe-outcomes-view.test.ts` (new, pure), `tests/recipe-process.test.ts`, `tests/production.test.ts`, `tests/production-view.test.ts` (A, B), `tests/new-recipe.test.ts` (A, B), `tests/nav-page-roles.test.ts`, `tests/mgr-screens.test.ts` (A) | |

No migration, so no `bun run migrations:lock` and no generated types. Existing
indexes cover the reads: `readings_batch_idx (batch_id, at)`,
`brew_records_brewery_batch (brewery_id, batch_id, created_at)` and
`recipe_ingredients_version_idx`. Batches filter on `brewery_id`
(`batches_planned_idx`), and a recipe has few batches.

## Reuse

| Need | Found | Use |
|---|---|---|
| Plato and SG | `platoToSg`, `sgToPlato` | Reused. |
| The "no prediction" rule | A's `gravityBlockers` | `potentialPointsPerBbl` returns null on no mash line or any blocker. One rule. |
| Gravity points per bbl | the sum inside `recipeGravity` | Extracted as `potentialPointsPerBbl`; `recipeGravity` multiplies it by efficiency. |
| ABV | `(og - fg) * 131.25` in `recipeGravity` | One private `abvFromSg(og, fg)`; `recipeGravity` and `measuredGravity` both call it. |
| Current turn revision | `currentBrewRecords` (`brew-day-view.ts:91`) | Reused; its parameter becomes `T extends { id; corrects_id }`. |
| Batch label, date, gravity | `batNo` (`lib/mgr/doc-no.ts:8`), `formatDate` (`lib/date-format.ts`), `formatGravity` (`lib/mgr/gravity-unit.ts:27`) | Reused. |
| Percent text | Searched `pct` and `percent`: only the page's local `pct`, which A moves into `versionNumbers` (it trims, not rounds) | `Math.round(x * 100)` inside `outcomeTape`. |
| Drawing | `E.tape`, `E.ttl` | Reused; no new component. |
| Paged reads | `completeRows`, `inChunks` (`lib/commands/registry.ts:121,144`) | Batches, brew records and readings. |
| Missing record | `orNotFound` (`lib/mgr/not-found.ts`) | Wraps the new read too. |
| Search | `escapeLike`, `listParams`, `ListControls`, Catalog's `filtered` (`lib/mgr/catalog-view.ts:68`), `.ilike` as in `lib/commands/search.ts:44-56` | Reused. |
| Stage order | `INGREDIENT_STAGES`; no sorter exists | One comparator beside `get_recipe`. |

## Tasks

Each task starts by writing its named test and watching it fail. 1, 2, 4 and 5
run in parallel. 3 needs 1 and 2. 6 needs 2 and 3. 7 needs 5. 8 is last.

1. **Gravity helpers.** Parallel.
   - Test first: `tests/recipe-gravity.test.ts`. `potentialPointsPerBbl` gives the golden example's points; null for no mash line and for each A blocker. `recipeGravity` keeps its golden values. `measuredGravity`: known OG, FG and potential; 28.5 of 30 bbl at a true 72% gives 0.72; null FG nulls ABV and attenuation; null knockout or potential `<= 0` nulls efficiency; OG 0 °P nulls all three.
   - File: `lib/recipe-gravity.ts`; its header states both new formulas.
   - Types: `potentialPointsPerBbl(ingredients: RecipeGravityIngredient[]): number | null`; `measuredGravity(input: { ogPlato: number; fgPlato: number | null; potentialPointsPerBbl: number | null; plannedBbl: number; knockoutBbl: number | null }): { abv: number | null; apparentAttenuation: number | null; brewhouseEfficiency: number | null }`.
   - Accept: vitest, `bunx tsc --noEmit`.

2. **Outcome type and tape text.** Parallel.
   - Test first: `tests/recipe-outcomes-view.test.ts` (new, pure). `outcomeTape` keeps input order. The label is `B-0413 · v4 · Oct 3, 2026`. For OG 14.8, FG 3.5, ABV 6.112, attenuation 0.7727, efficiency 0.70, predicted OG 15.2, FG 3.482, ABV 6.345, assumed 0.72 and 0.78, the detail is `OG 14.8 °P (15.2) · FG 3.5 °P (3.5) · ABV 6.1% (6.3%) · attenuation 77% (78%) · efficiency 70% (72%)` (recomputed with task 1's formulas). A null metric and its bracket are left out. No readings reads `no gravity readings yet`; one reading ends `FG needs a second reading`. SG goes through `formatGravity`. An empty list returns `undefined`, so the view draws nothing.
   - File: `lib/mgr/recipe-view.ts`.
   - Types: `RecipeOutcome = { batchId: string; batchNo: number | null; version: number; brewedOn: string; ogPlato: number | null; fgPlato: number | null; abv: number | null; apparentAttenuation: number | null; brewhouseEfficiency: number | null; predicted: { ogPlato: number; fgPlato: number; abv: number } | null; assumedEfficiency: number; assumedAttenuation: number }`; `outcomeTape(outcomes: RecipeOutcome[], unit: GravityUnit): [string, string][] | undefined`.
   - Accept: vitest, tsc.

3. **`get_recipe_outcomes`.** Sequential, after 1 and 2.
   - Test first: `tests/recipe-outcomes.test.ts` (new, `mgr_test`). One recipe with two versions of different efficiency, and these batches:
     - planned 10 bbl; two 5 bbl turns with `confirmEmpty`; turn 1 corrected to 4 bbl (as `tests/brew-record.test.ts:24-31`): efficiency uses knockout 9 against planned 10;
     - a `record_historical_batch` batch with batch-only readings: measured;
     - one reading: OG only;
     - brewed with no readings: row present, every metric null;
     - `brewed_on` set with the admin client, no brew record, two readings inserted with `ins`: version kept, efficiency null;
     - a cancelled batch and an unbrewed batch: absent;
     - a version whose mash line has no extract: efficiency and predicted null.
     Also assert newest first (`brewed_on` desc, then `batch_no` desc), each batch against its own version, a reading with no gravity skipped, another brewery's recipe `not_found`, and a non-UUID id `invalid_input`.
   - Files: `lib/commands/production.ts`; `lib/mgr/brew-day-view.ts` (`currentBrewRecords<T extends { id: string; corrects_id: string | null }>(records: T[]): T[]`).
   - Types: input `{ recipeId: string }` (uuid); roles `admin`, `brewer`; output `{ batches: RecipeOutcome[] }`.
   - Reads: the recipe (404 when not this brewery's), its versions, their ingredients with `materials(base_uom)`, brewed batches (`id, batch_no, recipe_version_id, brewed_on, planned_bbl`), brew records (`id, batch_id, initial_bbl, corrects_id`) and gravity readings by batch.
   - Description: "Each brewed batch of a recipe, newest first: OG from its first gravity reading, FG from its last, ABV, apparent attenuation and brewhouse efficiency against the planned grain bill, beside its version's prediction; computed, never stored".
   - Accept: vitest on `mgr_test`; tsc; `tests/brew-day-actuals-view.test.ts` green; `bun run docs:api` (the `/recipe/` rule, `lib/mgr/api-operations.ts:35`, files it); `tests/api-docs.test.ts` green.

4. **Brewing order in `get_recipe` (QW9).** Parallel.
   - Test first: `tests/recipe-process.test.ts`. A version saved as dry hop at 2880 min, yeast (fermentation), boil 10, mash malt, boil 60, untimed boil sugar, dry hop at 1440 min comes back as mash, boil 60, boil 10, boil untimed, fermentation, dry hop 1440, dry hop 2880.
   - File: `lib/commands/production.ts`: a comparator beside `get_recipe`, commented with the two directions.
   - Accept: vitest on `mgr_test`; tsc; `tests/production.test.ts` green.

5. **`list_recipes` search (BIG7, command).** Parallel.
   - Test first: `tests/production.test.ts`, `describe("list_recipes search")`: part of a name matches in any case; `%` and `_` match themselves; empty input returns every recipe; another brewery's recipes never match.
   - File: `lib/commands/production.ts`.
   - Types: input `z.object({ q: z.string().trim().max(100).optional() })`; filter `.ilike("name", `%${escapeLike(q)}%`)`. The description gains "; optionally only those whose name contains q".
   - Accept: vitest on `mgr_test`; tsc; `bun run docs:api`; `tests/api-docs.test.ts` green; `app/(app)/batches/page.tsx:20` still passes `{}`.

6. **Recipe page draws outcomes.** Sequential, after 2 and 3.
   - Test first:
     - `tests/production-view.test.ts`: the Recipe frame's `tape` equals `outcomeTape(recipeHazyOutcomes, "plato")`; a source assertion that the page wraps `get_recipe` and `get_recipe_outcomes` in `orNotFound` and sets `tape` from `outcomeTape`.
     - `tests/new-recipe.test.ts`: `RecipeView` draws "Batch actuals" with a tape, and not without one.
     - `tests/nav-page-roles.test.ts`: `"/recipes"` lists `get_recipe_outcomes`.
     - `tests/mgr-screens.test.ts`: Recipe `reads` no longer tags it `[design`; its states include "no batches".
   - Files:
     - `app/(app)/recipes/[id]/page.tsx`: add `orNotFound(runCommand("get_recipe_outcomes", { recipeId: id }, ctx))` to the `Promise.all`. Render `model={{ ...toRecipePageModel(snapshot, ctx), tape: outcomeTape(outcomes.batches, unit) }}`. A's `RecipeSnapshot` is unchanged. Update the header comment.
     - `components/mgr/views/recipe.tsx`: when `model.tape?.length`, draw `E.ttl("Batch actuals · predicted in brackets")` then `E.tape(model.tape)`. Remove the `actualsNote` line.
     - `lib/mgr/recipe-view.ts`: remove `actualsNote`.
     - `lib/mgr/fixtures/production.ts`: `recipeHazyOutcomes: RecipeOutcome[]`: B-0413 (Oct 3, 2026, OG 14.8, FG 3.5, 15 of 15 bbl) and B-0398 (Sep 12, 2026, OG 15.0, FG 3.3, 14.6 of 15 bbl), both v4. Potential is about 86.1 points per bbl, so v4 at 72% predicts 15.2 °P. Metrics are spread from `measuredGravity`. `recipeHazyV4.tape` is `outcomeTape(recipeHazyOutcomes, "plato")`. `predicted` becomes "Predicted: OG 15.2 °P · FG 3.5 °P · ABV 6.3%", the `recipeGravity` result for 15.2 °P at 78%. Remove `actualsNote`.
     - `components/mgr/screens.tsx`, Recipe record: reads `get_recipe_outcomes [per batch OG, FG, ABV, apparent attenuation and realized efficiency from fermentation readings; computed, never stored]`; state `["no batches", "no brewed batch yet: Batch actuals is not drawn"]`.
     - `tests/nav-page-roles.test.ts`.
   - Accept: tsc, lint, the pure inventory tests, the four tests above. Browse `/recipes/<id>` with readings and without, in Plato and SG, at phone width.

7. **Recipes search on the page (BIG7, screen).** Sequential, after 5.
   - Test first: `tests/production-view.test.ts`: `toRecipesViewProps({ recipes: [], filtered: true })` gives "No recipes match" and "Clear the search to see every recipe."; an unfiltered empty list keeps "No recipes yet"; a source assertion that the page passes `q` to `list_recipes` and draws `ListControls`.
   - Files:
     - `lib/mgr/recipes-view.ts`: `filtered?: boolean` on the snapshot.
     - `components/mgr/views/recipes.tsx`: `controls?: ReactNode`, drawn after the header as `components/mgr/views/catalog.tsx:31` does.
     - `app/(app)/recipes/page.tsx`: take `searchParams`; `listParams(z.object({ q: z.string().trim().max(100).catch("") }), raw)`; pass `params` to `list_recipes`; draw `<ListControls search={{ label: "Search recipes", value: params.q, keep: {} }} rows={[]} />`; `filtered: Boolean(params.q)`; header comment.
     - `components/mgr/screens.tsx`: the Recipes body passes an inert `ListControls`, as Catalog does (`:1423`); state `["no match", "No recipes match: clear the search"]`.
   - Accept: tsc, lint, the pure inventory tests. Browse `/recipes?q=ipa` and `/recipes?q=zzz`.

8. **Docs and PR text.** Sequential, last.
   - `content/docs/staff-guide.mdx`, Recipes section: the three sentences below. `tests/docs.test.ts` and `tests/design-docs.test.ts` green.
   - Module comments: `lib/recipe-gravity.ts`, the `lib/commands/production.ts` header (outcomes are computed on read), both recipe pages.
   - `bun run docs:api` once more; `tests/api-docs.test.ts` green.
   - `/simplify`, then the proof again, then `git diff` for stray bytes.
   - PR description: one progress line. No `TODO:` line, since no `TODO.md` item matches (re-check then). `DOCS:` and `API:` omitted, so both agents run.

## Proof

This PR changes commands, so it runs the full step-4 proof on `mgr_test`:

```
scripts/test-db.sh
bun run test && bunx tsc --noEmit && bun run lint
```

`bun run test` includes the pure inventory list and `tests/api-docs.test.ts`.
The browse checks in tasks 6 and 7 use session `feat-recipe-outcomes` on the
test stack.

## Docs

`content/docs/staff-guide.mdx`, Recipes section, no em dashes:

1. "Ingredients list in brewing order: mash first, then boil and whirlpool from the longest time down, then fermentation and dry-hop lines in the order they go in. Untimed lines close their stage."
2. "Type part of a name in **Search recipes** to narrow the list. When nothing matches, the list says so; clear the search to see every recipe."
3. "Once a batch is brewed, **Batch actuals** lists each brewed batch of the recipe, newest first. Each row names the batch, the version it brewed and its brew date. OG is the batch's first gravity reading, and FG is its latest, so FG settles as fermentation finishes. ABV, apparent attenuation and brewhouse efficiency are worked out from them. The figure in brackets is what that batch's version predicted. Efficiency compares the OG and knockout barrels with what the version's grain bill could give for the planned barrels. A figure is left out when its readings, the batch's brew record or the version's extract potentials are missing. Log gravity readings in **Cellar** (each tank's **Reading**) to fill them in."

`content/docs/api/production.mdx` is regenerated, not hand-edited.

## Risks and open questions

1. **Efficiency far from the assumption.** A first reading taken after fermentation starts reads low; optimistic extract snapshots can read over 100%. The plan shows the computed number. Hide or flag values outside a band such as 40 to 100%?
2. **Untimed boil lines.** They go after timed ones. A brewer may expect an untimed kettle sugar first. Confirm "untimed last".
3. **Search scope.** `q` matches the recipe name only; recipes have no alias, and most imported names equal their brand's. Should `q` also match the brand name, and does Recipes want a sort?

## Review notes

Every major issue and most minor ones are fixed in place above. These need a reason:

- Knockout stays read (critique 2 said drop it). Critique 1 showed efficiency needs it: grain follows planned barrels, wort is the knockout. It is not shown or returned.
- A's and D's plans still name A, or nobody, for QW9 and BIG7. They live in other worktrees, so this commit cannot edit them; the header asks for the fix before Phase 2.
- `actualsNote` is removed rather than kept as design intent: nothing live can fill it.
- No `cancelled_at` filter: a brewed batch cannot be cancelled. The test still asserts a cancelled batch is absent.

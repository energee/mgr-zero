# Recipe manager

Status: PRs 1 to 3 below are built and ship together in #1767, 2026-11-04. PR 4 is not built. This replaces plans B, C and D from the recipe page review
(`brew-day-recipe-targets`, `recipe-outcomes`, `recipe-ibu-pitch`). Their full
text is in commit 9de3f81e3 and on those local branches.

## Goal

A recipe makes a prediction, a batch measures the result, and the gap informs
the next version. That loop is what makes MGR's recipes better than a recipe
calculator, because MGR already holds the batches, readings and stock.

The work keeps three promises:

| Promise | What the brewer sees |
|---|---|
| Honest | Each prediction sits beside what real batches measured. |
| Brewable | Prep, Brew day and the batch record show what happens after knockout, not only brew-day steps. |
| Complete | A recipe carries IBU and, if approved, pitch rate. |

## Not doing

- No stored outcomes. Every measured figure is computed on read.
- No automatic change to a recipe's assumptions. MGR shows the gap and the brewer decides.
- No invented data. A missing input gives a stated reason or a lower bound, never a guess.
- No typed `target_ibu`, IBU actuals or SQL IBU. The unused column stays as it is.
- No yeast viability, harvest or generation tracking.
- No efficiency from recorded mash consumption, since imported batches record none.
- No new analytics page. Comparison stays on the recipe page.

## What the data says

Counts come from the dev database (`:54342`, Lolev import) and the 2026-10-13
Lolev backup, read on 2026-11-04.

| Fact | Count | Meaning for this plan |
|---|---|---|
| Recipes | 169, each with one version | Version comparison has nothing to compare yet. |
| Brewed batches with a version | 179 | Batch actuals has real rows on day one. |
| Batches with one gravity reading | 102 | They show OG and efficiency only. |
| Open or multi-turn brewed batches | 0 of 183 | Imported history can't show those cases, so tests must. |
| Batches with two or more | 77 | They show every metric. |
| Recipes brewed at least twice | 19 | A trend needs at least two batches, so few recipes show one yet. |
| Measured attenuation | Median 77.3%, against 75.0% assumed | The formulas give believable results. |
| First readings from 8 to 22 °P | 168 of 179 | Using the first reading as OG holds up. 11 read above 22 °P. |
| Attenuation under 60% | 13 of 77 | Some batches will look wrong. The page shows them unfiltered. |
| Distinct assumed efficiencies | 1 (the import's 75%) | Measured efficiency replaces a placeholder. |
| Hops with alpha acid | 0 of 139 in MGR, 67 of 140 in Lolev | IBU can start with about half its data. |
| Boil hop lines with a time | 91 of 95 | Boil time is rarely a gap. |
| Hop lines by stage | 209 whirlpool, 95 boil | This brewery hops mostly in the whirlpool. |
| Recipes with whirlpool hops only | 122 of 168 with hops | A boil-only IBU would estimate nothing for 73% of recipes. |
| Dry-hop lines with a day | 0 of 584, and Lolev has none | The shipped Timing day field starts empty, so dry hops sort last in their stage. |
| Recipes with a target pitch rate | 94 of 169 in Lolev | Pitch rate has source data. |
| Yeast materials | 8, all stocked by `each` | Cells per unit means cells per pack today. |

`brew_records` holds no measured OG, so the first gravity reading stays the OG source.

## Already on main

These items from the old plans need no work:

| Item | Shipped as |
|---|---|
| Plan A: read-out, copy-forward draft, kept draft | #906 |
| Recipe search (`list_recipes` `q`) | On `main` |
| Schedule batch from a recipe | #1581 |
| Brand filled from the recipe in New batch | `brandAfterRecipePick` |
| Batch totals and pack rounding on the recipe page | Show totals at |
| Dry-hop and fermentation timing in days | #1478 (`timedInDays`, the Timing day field) |
| Stage targets and planned amounts on Brew day | The Brew day timeline (`brewTargets`, `brewIngredients`) |

## PR 1: Batch actuals (no migration)

Branch `feat/recipe-batch-actuals`. This PR delivers the Honest promise and comes first.

### How an outcome is computed

Gravity is stored in °Plato. Formulas run in SG through `platoToSg` and `sgToPlato`.

| Figure | Rule |
|---|---|
| Batches | `recipe_version_id` is a version of the recipe and `brewed_on` is set. |
| OG | The first `fermentation_readings.gravity_plato` by `at`, skipping readings with no gravity. |
| FG | The last gravity reading, so an open batch's FG is its latest reading. With one reading, FG and everything built on it is null. |
| ABV | `(OG_sg - FG_sg) * 131.25` |
| Apparent attenuation | `(OG_sg - FG_sg) / (OG_sg - 1)` |
| Knockout | Sum of `brew_records.initial_bbl` over each turn's current revision. |
| Efficiency | `(OG_sg - 1) * 1000 * knockoutBbl / (potentialPointsPerBbl * plannedBbl)`, on a closed batch only |
| Predicted | Each batch's own version, through `recipeGravity`. |

- Grain follows planned barrels and wort is the knockout, so efficiency needs both.
- A short knockout must not read as higher efficiency: 28.5 of 30 bbl at a true 72% shows 72%.
- A metric is null, never 0, when an input is missing.
- **My call:** an open batch shows no efficiency. Nothing records how many turns it will have, so turn 1 of a two-turn batch would read about half its true figure.
- An open batch's row says `still open`, because its FG can still move.
- Imported batches set `planned_bbl` to their knockout, so their ratio is 1.

### The summary line

The old plan removed the fixture's hand-written `actualsNote`, because nothing live could
fill it. Outcomes can fill it now. **My call:** compute it instead of removing it.

With two or more closed batches of the shown version that have an efficiency, the note reads:
"2 batches: efficiency 68–71% against 72% assumed; attenuation 75–78% against 78% assumed."
Attenuation is left out with fewer than two values. The note states the gap and gives no advice.

### Tasks

Tasks 1, 2 and 4 run in parallel. 3 needs 1 and 2. 5 needs 2, 3 and 4. 6 is last.

1. **Gravity helpers.**
   - Test first: `tests/recipe-gravity.test.ts`. 28.5 of 30 bbl at a true 72% gives 0.72. A null FG nulls ABV and attenuation. A null knockout or potential nulls efficiency. ABV from Plato inputs stays under 20, because v1 once read Plato as SG and printed an ABV near 1508.
   - File: `lib/recipe-gravity.ts`. Extract `potentialPointsPerBbl` from `recipeGravity`, and share one private `abvFromSg`.
   - Types: `potentialPointsPerBbl(ingredients: RecipeGravityIngredient[]): number | null`; `measuredGravity({ ogPlato, fgPlato, potentialPointsPerBbl, plannedBbl, knockoutBbl }): { abv: number | null; apparentAttenuation: number | null; brewhouseEfficiency: number | null }`.
   - Accept: vitest, `bunx tsc --noEmit`.
2. **Outcome text.**
   - Test first: `tests/recipe-outcomes-view.test.ts` (new, pure). Label `B-0413 · v4 · Oct 3, 2026`; detail `OG 14.8 °P (15.2) · FG 3.5 °P (3.5) · ABV 6.1% (6.3%) · attenuation 77% (78%) · efficiency 70% (72%)`. A null metric is left out. No readings reads `no gravity readings yet`. One reading ends `FG needs a second reading`. An open batch ends `still open`. `outcomeSummary` follows the rule above and skips open batches.
   - File: `lib/mgr/recipe-view.ts`.
   - Types: `RecipeOutcome` (batch id and number, version, brewed date, the five measured figures, `predicted`, both assumptions); `outcomeTape(outcomes, unit): [string, string][] | undefined`; `outcomeSummary(outcomes, version): string | undefined`.
   - Accept: vitest, tsc.
3. **`get_recipe_outcomes`.**
   - Test first: `tests/recipe-outcomes.test.ts` (new, `mgr_test`). Cover a corrected two-turn batch, an open first turn of a two-turn batch (no efficiency), a historical batch, one reading, no readings, no brew record, a blocked mash bill, a cancelled and an unbrewed batch (both absent), newest first, each batch against its own version, another brewery's recipe (`not_found`).
   - Files: `lib/commands/production.ts`; `lib/mgr/brew-day-view.ts` (`currentBrewRecords` becomes generic over `{ id; corrects_id }`).
   - Types: input `{ recipeId: string }`, roles `admin` and `brewer`, output `{ batches: RecipeOutcome[] }`.
   - Reuse: `completeRows`, `inChunks`, `orNotFound`. Reads select `closed_at`.
   - Index: readings and brew records are indexed. No index covers `batches.recipe_version_id`, so batches scan one brewery through `batches_planned_idx`. That is about 100 rows a year, so add no index unless it measures slow.
   - Accept: vitest on `mgr_test`, tsc, `bun run docs:api`, `tests/api-docs.test.ts`.
4. **Brewing order in `get_recipe`.**
   - Test first: `tests/recipe-process.test.ts`. Mash, boil 60, boil 10, untimed boil, fermentation, dry hop by day.
   - File: `lib/commands/production.ts`, one comparator beside `get_recipe`. Stages follow `INGREDIENT_STAGES`. Boil and whirlpool count down, other stages count up, and untimed lines close their stage.
   - Accept: vitest on `mgr_test`, tsc, `tests/production.test.ts`.
5. **Recipe page draws outcomes.**
   - Test first: `tests/production-view.test.ts`, `tests/new-recipe.test.ts`, `tests/nav-page-roles.test.ts`, `tests/mgr-screens.test.ts`.
   - Files: `app/(app)/recipes/[id]/page.tsx`, `components/mgr/views/recipe.tsx` (heading "Batch actuals · predicted in brackets", then `E.tape`, then the note), `lib/mgr/fixtures/production.ts`, `components/mgr/screens.tsx` (drop the `[design` tag from `get_recipe_outcomes`; add a "no batches" state).
   - Accept: tsc, lint, the screen proof list. Browse `/recipes/<id>` with and without readings, in Plato and SG, at phone width.
6. **Docs.** Recipes section of `content/docs/staff-guide.mdx`: brewing order, Batch actuals, the summary line, and that readings fill it in. Accept: `tests/docs.test.ts`, `tests/design-docs.test.ts`.

## PR 2: What happens after knockout (screen-only)

Branch `feat/brew-cellar-plan`. This PR delivers the Brewable promise and can run beside PR 1.

A batch has three surfaces today:

| State | Screen | Shows | Gap |
|---|---|---|---|
| Planned, Prep tab | `BrewPrepView` | Brew-day lines, and "Later, in cellar" as a count ("Dry hop 6") | No amounts or days for later additions, and no fermentation stages |
| Planned, Brew day tab | `BrewTimelineView` | Stage targets and ingredient rows | No later additions or fermentation stages |
| Recorded | `BrewDayView`, `BrewPlanSheet` | Ingredients, mash steps, water | No boil, whirlpool, knockout or fermentation targets, and no totals |

7. **`cellarPlanRows` and `fermentationStageDetail`.**
   - Test first: `tests/brew-prep-view.test.ts`, `tests/recipe-process-view.test.ts`. One row per stage ("Primary", "68 °F · 4 days"). A later line reads "Dry hop · day 4 · 1.2 lb / bbl · 17.5 lb for 14.6 bbl". No total at 0 or NaN barrels. No later lines reads "None".
   - Files: `lib/mgr/brew-prep-view.ts` (`cellarPlanRows` replaces `laterAdditions`), `lib/mgr/recipe-process-view.ts`, `components/mgr/views/fermentation-schedule.tsx`.
   - Types: `cellarPlanRows(plan: BrewPlan, bbl: number): [string, string][]`; `fermentationStageDetail(s: FermentationStage): string`.
   - Reuse: `ingredientDetail`, `perBblDisplay`, `plural`. Check whether Show totals at's `batchTotalText` can print the total before writing anything new.
   - Accept: vitest, tsc.
8. **Draw the rows on all three surfaces.** Needs 7.
   - Test first: `tests/brew-prep-view.test.ts`, `tests/production-view.test.ts`. Prep and the timeline total for planned barrels. A recorded two-turn batch totals each turn's own knockout, never the planned barrels. `BrewPlanSheet` gains boil, whirlpool and knockout through the existing `brewTargets`.
   - Files: `components/mgr/views/brew-prep.tsx`, `components/mgr/views/brew-timeline.tsx`, `components/mgr/views/brew-day.tsx` (`BrewPlanSheet` gains `bbl`), `app/(app)/batches/[id]/page.tsx`, `lib/mgr/fixtures/production.ts`, `components/mgr/screens.tsx`, the Brew day section of `content/docs/staff-guide.mdx`.
   - Accept: the screen proof list, tsc, lint. Browse the Prep tab, the Brew day tab and a recorded two-turn batch at phone width.

## PR 3: IBU

Branch `feat/recipe-ibu`. Needs PR 1 for brewing order. 11 and 14 can start at once. 10 follows 9. 12 and 13 need 10 and 11.

### IBU (Tinseth)

For each hop line:

- `grams per bbl = perBblQty × LB_PER[unit] × 453.59237`
- `alpha mg/L = (alpha % / 100) × grams per bbl × 1000 / LITERS_PER_BBL`
- `bigness = 1.65 × 0.000125 ^ (OG_SG − 1)`
- `boil factor = (1 − e^(−0.04 × minutes)) / 4.15`
- Boil line: `line IBU = bigness × boil factor × alpha mg/L`
- Whirlpool line: `line IBU = 0.05 × alpha mg/L`

The recipe IBU is the rounded sum. Goldens for 1 lb/bbl of a 10% hop: 60 min at OG 1.050 gives 89, and whirlpool gives 19.
OG is the predicted OG, a usual simplification of boil gravity. Dry-hop lines add nothing.

**My recommendation:** count whirlpool hops at a flat 5% utilization, which is v1's value
(`00218_recipe_ibu_tinseth.sql`). Plan D excluded them, but that estimates nothing for 122 of 168
recipes. The flat value needs no whirlpool time, and all 209 whirlpool hop lines have none. It stays a rough estimate, and the text says so.

IBU is computed in TypeScript only. v1 kept a second copy in SQL, and the two drifted about 2.3x apart.

The first matching row wins:

| Case | Text |
|---|---|
| No predicted OG | "IBU not estimated: no predicted OG" |
| No boil or whirlpool hops | "IBU not estimated: no boil or whirlpool hops" |
| Every counted hop has a gap | "IBU not estimated: no alpha acid: Citra, Mosaic" |
| Some counted hops have a gap | "IBU ≥ 31 · no alpha acid: Mosaic" |
| No gaps | "IBU 89", plus "· whirlpool hops at 5%" when any are counted |

A gap is no alpha acid, no boil time on a boil line, or a unit that is not a weight. Gaps group by reason.

### Existing recipes

Alpha acid freezes per version, like extract potential. A material edit therefore changes
no saved version, so all 169 imported recipes would stay "IBU not estimated" even with hop data.
The old plan missed this. **My call:** the local-only importer fills `materials.alpha_acid`
from Lolev, then fills null `alpha_snapshot` values on imported versions. This is local import
work, stays out of the PR, and needs its own go-ahead per database.

### Migration

File: `supabase/migrations/<UTC timestamp at build>_recipe_alpha_acid.sql`, later than every migration on `main`.

```sql
alter table public.materials
  add column alpha_acid numeric(5,2) check (alpha_acid > 0 and alpha_acid <= 30); -- percent, as on the bag
alter table public.recipe_ingredients
  add column alpha_snapshot numeric(5,2); -- materials.alpha_acid when the version was saved
```

Function bodies are copied from their latest definitions at build time, never from an old plan:

| Function | Latest definition today | Change |
|---|---|---|
| `public.create_recipe_version` | `20260917100000_recipe_process_spec.sql` | Same signature. The ingredient insert left-joins `materials` and writes `m.alpha_acid` to `alpha_snapshot`. |
| `public.upsert_material` | `20260927050000_material_units_guard_references.sql` | New `p_alpha_acid`, so drop the old signature and re-grant. An omitted value keeps the saved one. |

### Tasks

9. **Migration, lock, types.** Test first: pin the new signature in `tests/rpc-allowlist.test.ts`. Update the arity in `tests/rls-taproom.test.ts`. Run `MGR_TEST_DB_RESET=1 scripts/test-db.sh`, `bun run types:database`, `bun run migrations:lock`. Accept: `migrations-applied`, `rpc-allowlist`, `rls-taproom`, tsc.
10. **Commands.** Test first: `tests/purchasing.test.ts` (alpha saves, an edit keeps it, 40 is refused), `tests/production.test.ts` (alpha freezes on a version). Files: `lib/commands/purchasing.ts`, `lib/commands/production.ts`. Types: `alphaAcid: z.number().gt(0).max(30).optional()`. Accept: vitest on `mgr_test`, tsc.
11. **`recipeIbu`.** Test first: `tests/recipe-ibu.test.ts` (every table row, both goldens, oz and g match lb, dry hop adds nothing), `tests/volume.test.ts`. Files: `lib/recipe-ibu.ts` (new), `lib/recipe-gravity.ts` (export `LB_PER`), `lib/volume.ts` (move `LITERS_PER_BBL` from `lib/mgr/format-view.ts`). Types: `RecipeIbu`, `recipeIbu({ ogPlato, lines }): RecipeIbu`, `ibuText(result, { saved }): string`. Accept: vitest, tsc.
12. **Recipe page and editor.** Test first: `tests/recipe-view.test.ts`, `tests/mgr-screens.test.ts`. Files: `lib/commands/production.ts` (`get_recipe` returns `ibu`), `lib/mgr/recipe-view.ts`, `components/mgr/views/recipe.tsx`, `app/(app)/recipes/[id]/recipe-version-form.tsx` (live preview), fixtures, `components/mgr/screens.tsx`. The fixture IBU is computed, never typed. Accept: vitest, screen proof list, `bun run docs:api`, browse a recipe with hops.
13. **Material sheet.** Test first: `tests/purchasing-view.test.ts` (Alpha acid on hops only). Files: `lib/mgr/material-view.ts`, `components/mgr/views/material.tsx`, `app/(app)/materials/material-form.tsx`, `lib/mgr/fixtures/purchasing.ts`. Accept: screen proof list, browse `/materials`.
14. **Remove the unused `dryHopDay`.** The field shipped in #1478, and this leftover only feeds a fixture.
    - Test first: `tests/recipe-process-view.test.ts`, `tests/mgr-screens.test.ts` (no "falls in Primary").
    - Files: `lib/mgr/recipe-process-view.ts` (`fermentationSummary`), `components/mgr/views/fermentation-schedule.tsx`, `components/mgr/screens.tsx`.
    - Accept: vitest, screen proof list.

Docs in this PR: the Materials and Recipes sections of the staff guide, plus `extract_potential`, `extract_snapshot` and both alpha columns in the schema design spec.

## PR 4: Yeast pitch rate (build only if approved)

Branch `feat/recipe-pitch-rate`. Needs PR 2 and PR 3.

- Unit: million cells per mL per °P, above 0 and at most 5.
- Packs = ceil(rate × 10^6 × knockout bbl × LITERS_PER_BBL × 1000 × OG °P ÷ (cells per unit × 10^9)).
- Golden: 13.27 °P, rate 0.75, 15 bbl and 200 billion per unit gives 87.6, so 88 packs.
- Fixture: the same rate at 9.71 °P and 14.6 bbl gives 62.4, so 63 packs.
- `per_bbl_qty` stays required, because Planning demand reads it.
- A line without a rate keeps its per-barrel display.

Migration `<UTC timestamp at build>_recipe_pitch_rate.sql`:

```sql
alter table public.materials
  add column cells_per_unit numeric(10,3) check (cells_per_unit > 0); -- billion cells per base unit
alter table public.recipe_ingredients
  add column pitch_rate numeric(5,3) check (pitch_rate > 0 and pitch_rate <= 5); -- million cells / mL / °P
```

`create_recipe_version` writes the rate and refuses it on a non-yeast line. `upsert_material`
gains `p_cells_per_unit`. `private.brew_plan_snapshot` (latest in `20261022120000_brew_pulls.sql`)
adds `cellsPerUnit` to each ingredient.

15. **Migration, lock, types.** Test first: `tests/rpc-allowlist.test.ts`, `tests/brew-record.test.ts` (the snapshot carries `cellsPerUnit` and `pitch_rate`). Accept: as task 9.
16. **Commands and sheets.** Test first: `tests/production.test.ts` (a rate on a malt line is refused), `tests/purchasing-view.test.ts`, `tests/new-recipe.test.ts`. Files: `lib/commands/production.ts`, `lib/commands/purchasing.ts`, `components/mgr/views/ingredient.tsx`, `components/mgr/views/material.tsx`, `lib/mgr/recipe-draft.ts`. Types: `pitchRate: z.number().gt(0).max(5).optional()`, `cellsPerUnit: z.number().gt(0).max(100000).optional()`. Accept: vitest on `mgr_test`, screen proof list.
17. **Packs on the cellar rows.** Needs 8 and 16. Test first: `tests/brew-prep-view.test.ts` (the golden 88; no rate, no cells, no OG). File: `lib/mgr/brew-prep-view.ts`, inside `cellarPlanRows`, because a yeast line is a fermentation-stage line. The row reads "pitch 0.75 M cells / mL / °P · 63 packs for 14.6 bbl". Accept: vitest, screen proof list, browse the Prep tab.
18. **Docs.** Staff guide, schema design spec, and the yeast scope note in `brewing-domain.md`. Accept: `tests/docs.test.ts`, `tests/design-docs.test.ts`.

## Order and proof

PR 1 and PR 2 run in parallel. PR 3 follows PR 1. PR 4 is last. Every PR is based on `main`.

- PR 1, 3 and 4 change commands, so they run the full proof: `scripts/test-db.sh`, `bun run test`, `bunx tsc --noEmit`, `bun run lint`.
- PR 2 is screen-only and runs the screen proof in `AGENTS.md`.
- Paths and names above were checked against `main` on 2026-11-04. Re-check each before its first edit.

## Calls made while distilling

- Untimed lines close their stage, as plan C proposed.
- Efficiency shows unfiltered, with no 40 to 100% band, because hiding a number hides a bad reading.
- Totals on Brew day print three significant digits, matching the recipe page.
- Hop category is read live rather than frozen, because category changes are rare.
- Open batches keep plan C's latest-reading FG, are labelled, and stay out of the summary line.

## Decisions for the build

The owner approved the build without answering these questions, so each one takes the plan's recommendation:

| Question | Decision |
|---|---|
| Do whirlpool hops count toward IBU? | Yes, at a flat 5%. |
| Does the summary line suggest lowering the assumption? | No. It stays a plain statement. |
| Is PR 4 built now? | No. Decide after PRs 1 to 3. |
| Does the local importer fill alpha acid on imported versions? | Not yet. That needs its own go-ahead per database. |

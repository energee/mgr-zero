# Recipe IBU, yeast pitch rate and dry-hop day (PR D)

Status: Phase 1 plan, never approved or built. Kept for its decisions, 2026-11-04. PR A merged
as #906; B and C did not ship as planned. Re-check every path against `main` before use.
Original status: Phase 1 plan, waiting for approval. Branch `feat/recipe-ibu-pitch`,
worktree `.agents/worktrees/feat-recipe-ibu-pitch`, PR to `main`.
D lands last. Before building, it rebases onto A (`feat/recipe-page-usability`),
B (`feat/brew-day-recipe-targets`) and C (`feat/recipe-outcomes`).
Line numbers are from 45257057 and may shift.

## Goal

A recipe shows an estimated IBU beside its predicted OG, FG and ABV.
A yeast line can carry a target pitch rate. Brew day turns that rate into a pack count.
A dry-hop line carries the day it goes in, and its row reads "dry hop · day 4".

## Decisions it implements

| Decision | Review ids | What this PR does |
|---|---|---|
| 8 IBU | BIG9 | Calculates IBU (Tinseth). Alpha acid lives on the material and is frozen per version, like extract potential. No typed `target_ibu`. |
| 5 Pitch rate | BIG4 | Adds a pitch rate to the yeast line and cells per unit to the yeast material. Brew day derives packs. No viability, harvest or generation. |
| 4 Dry-hop day | BIG5, QW25 (dry-hop part) | On a `dry_hop` line, `timing_minutes` holds day × 1440. No schema change. Removes the invented `dryHopDay`. |

### IBU (Tinseth)

For each counted line:

- `grams per bbl = perBblQty × LB_PER[unit] × 453.59237`
- `alpha mg/L = (alpha % / 100) × grams per bbl × 1000 / LITERS_PER_BBL`
- `bigness = 1.65 × 0.000125 ^ (OG_SG − 1)`
- `boil factor = (1 − e^(−0.04 × minutes)) / 4.15`
- `line IBU = bigness × boil factor × alpha mg/L`

- The recipe IBU is the sum of the line IBUs, rounded to a whole number.
- Golden example: 1 lb/bbl of a 10% hop at 60 min, with OG 1.050, gives 89.
- OG is the predicted `ogPlato`, converted with `platoToSg`. Tinseth asks for boil
  gravity. Using OG is the usual simplification, and the module comment says so.
- A line counts only when its stage is `boil` and its material is a hop.
- Whirlpool and dry-hop lines add nothing, because Tinseth has no term for them.
  The read-out says "boil hops only".

**Degrading (decision 8).** This list is the single source for `recipeIbu` and `ibuText`.
Rows are checked top to bottom; the first match wins.

| Case | Result | Text |
|---|---|---|
| No predicted OG | none | "IBU not estimated: no predicted OG" |
| No boil hop lines | none | "IBU not estimated: no boil hops" |
| Every boil hop has a gap | none | "IBU not estimated: no alpha acid: Citra, Mosaic" |
| Some boil hops have a gap | lowerBound | "IBU ≥ 31 · boil hops only · no alpha acid: Mosaic" |
| No gaps | estimate | "IBU 89 · boil hops only" |

- There are three kinds of gap: no alpha acid, no boil time, or a unit that is not a weight.
  Gaps are grouped by reason, each followed by its hop names.
- On a saved version, the "no alpha acid" group adds "; set alpha acid under
  Materials, then create the next version". This is A's `gravityBlockerText`
  wording. A draft does not add it.
- Alpha acid is never invented. Imported hops stay blank until a brewer types a value.

### Pitch rate

- The unit is million cells per mL per °P. A rate must be above 0 and at most 5.
- Packs = ceil(rate × 10^6 × knockout bbl × LITERS_PER_BBL × 1000 × OG °P ÷ (cells per unit × 10^9)).
- OG °P is `recipeGravity` over the brew plan snapshot.
- Golden example: 60 lb/bbl of a 1.037 malt at 75% efficiency predicts 13.27 °P.
  With rate 0.75, 15 bbl and 200 billion per unit, that gives 87.6 packs, rounded up to 88.
- A line without a rate keeps its per-bbl display. All 124 imported lines read "0.0455 each / bbl".

### Why each new column

| Column | Why |
|---|---|
| `materials.alpha_acid` | IBU needs alpha acid. It is a fact about the hop, so it sits beside `extract_potential`. It is stored as a percent (12.5), as printed on the bag. |
| `recipe_ingredients.alpha_snapshot` | A version must keep its IBU when a new crop's alpha acid is typed (#614 pattern, `extract_snapshot`). |
| `recipe_ingredients.pitch_rate` | The rate is a recipe choice for each yeast line. It is nullable because imported lines have none. |
| `materials.cells_per_unit` | Packs need the cell count in one stocked unit (100 billion per liquid pack, 200 billion per dry packet). It is not frozen per version, because the brewer pitches what is on hand. It is frozen into `plan_snapshot` when a turn is recorded. |

## Out of scope

- PR A owns: copy-forward draft, kept draft, headings, the price-group row (QW10), and the rest of QW25.
- PR B owns: Brew day targets and knockout totals (QW15), brand pre-fill (QW13), and Schedule batch (QW14).
- PR C owns: `get_recipe_outcomes`, brewing order (QW9) and recipe search (decision 9).
- A later slice owns: yeast viability, harvest and repitch generation.
- Not requested: whirlpool IBU, typed `target_ibu`, IBU actuals, backfilling imported lines, and dry-hop days on the Fermentation schedule footer.

## Files touched (overlap only)

D alone touches the migration, `lib/recipe-ibu.ts` (new), `lib/volume.ts`, `lib/mgr/format-view.ts`,
`lib/commands/purchasing.ts`, the material view, form and fixture, the two specs, and `dryHopDay` in
`fermentation-schedule.tsx` (A changes only its back slot). Each task names its own files. Shared files:

| File | D | Also |
|---|---|---|
| `supabase/migrations.lock.json`, `lib/supabase/database.generated.ts` | regenerated | none (A, B, C add no migration) |
| `lib/recipe-gravity.ts` | export `LB_PER` | A (`gravityBlockers`), C (`potentialPointsPerBbl`) |
| `lib/commands/production.ts` | `create_recipe_version`, `get_recipe` | C (outcomes, brewing order, `list_recipes q`) |
| `lib/mgr/recipe-process-view.ts` | timing by stage, pitch rate, `fermentationSummary` param | A (formatters), B (`fermentationStageDetail`) |
| `lib/mgr/recipe-view.ts`, `lib/mgr/recipe-draft.ts` | page model IBU, draft copy, blocker, draft schema | A (owner), C (tape) |
| `lib/mgr/brew-day-view.ts` | pack rows in `brewPlanRows` | B (owner), C (`currentBrewRecords`) |
| `components/mgr/views/{ingredient,recipe}.tsx`, `app/(app)/recipes/[id]/recipe-version-form.tsx` | Day, pitch rate, IBU line | A |
| `components/mgr/screens.tsx`, `lib/mgr/fixtures/production.ts` | records, fixtures | A, B, C |
| `content/docs/staff-guide.mdx` | Materials, Recipes, Brew day | A, B, C |

## Tasks

Each task starts by writing its named test and watching it fail. UI rendering is the exception: the logic is
TDD'd below the component, then the page is checked with `/browse`. Parallel tasks never share a file.
New `screens.tsx` spec and state text uses words, not snake_case (the copy test at `tests/mgr-screens.test.ts:446`).

**Order.** 1 first. Then 2, 3, 4, 5 in parallel. Then 6, 7, 10 in parallel. Then 8, 9, 11, 12 one at a time,
because they share `screens.tsx` and the production fixture. Then 13 and 14.

### 1. Migration, lock, types and pinned signatures (first)

- Test first: `tests/rpc-allowlist.test.ts:207` pins
  `upsert_material(uuid,uuid,text,material_category,uom,uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,numeric,uuid)`.
  A new `tests/brew-record.test.ts` case sets the material's `cells_per_unit` to 200 through `admin` and records a
  turn; its `plan_snapshot` ingredient carries `cellsPerUnit: 200` and a `pitch_rate` key.
- Before writing the SQL, grep `supabase/migrations` for `create_recipe_version`, `upsert_material(` and
  `brew_plan_snapshot`. If A, B or C redefined one, copy their body instead.
- Write `supabase/migrations/20261016120000_recipe_ibu_pitch.sql` (SQL below). In `tests/rls-taproom.test.ts`
  (~:397), add two `null`s before `R()` in the `upsert_material` case, so its arity matches.
  Run `MGR_TEST_DB_RESET=1 scripts/test-db.sh`, then `bun run types:database`, then `bun run migrations:lock`.
- Types: the `materials` Row gains `alpha_acid` and `cells_per_unit`; `recipe_ingredients` gains `alpha_snapshot`
  and `pitch_rate`; all four are `number | null`.
- Accept: `migrations-applied`, `rpc-allowlist`, `rls-taproom` and `brew-record` green on `mgr_test`; tsc clean.
- Timestamp: the highest migration today is `20261015120000`, and `land-pr.sh` lands in timestamp order. If an
  earlier-merged PR added a later migration, rename this file to a later stamp and re-lock before pushing.

### 2. `upsert_material` and `list_materials` (needs 1)

- `lib/commands/purchasing.ts`: input gains `alphaAcid: z.number().gt(0).max(30).optional()` and
  `cellsPerUnit: z.number().gt(0).max(100000).optional()`, sent as `p_alpha_acid` and `p_cells_per_unit`.
  On an edit, an omitted value keeps the saved one, like `extractPotential`. `list_materials` selects both.
  Update both descriptions.
- Test first: `tests/purchasing.test.ts`, beside the extract case (~:246). A hop saves `alphaAcid: 12.5`.
  An edit without it keeps 12.5. A yeast saves `cellsPerUnit: 200`. `alphaAcid: 40` and `cellsPerUnit: 0` are refused.
- Accept: vitest on `mgr_test`, tsc. `tests/api-docs.test.ts` is expected red until task 6 runs `bun run docs:api`.

### 3. `create_recipe_version` takes a pitch rate (needs 1)

- `lib/commands/production.ts`: each ingredient gains `pitchRate: z.number().gt(0).max(5).optional()`, sent as
  `pitch_rate`. The description says alpha acid is snapshotted with extract potential.
- Test first: `tests/production.test.ts`, mirroring the extract-freeze test (~:25-45).
  The hop's `alpha_acid` is frozen into `alpha_snapshot`; a later material edit leaves the version unchanged.
  A yeast line stores `pitch_rate`. A rate on a malt line is refused with "a pitch rate belongs on a yeast line".
- Accept: vitest on `mgr_test`, tsc. `api-docs` is expected red until task 6.

### 4. Shared constants and `recipeIbu` (no dependency)

- Reuse, after searching `lib` for mass and volume constants:
  - Export `LB_PER` from `lib/recipe-gravity.ts`. It is private today and is the only mass table.
  - Move `LITERS_PER_BBL` (`GALLONS_PER_BBL × 3.785411784`) from `lib/mgr/format-view.ts:7` into `lib/volume.ts`
    beside `GALLONS_PER_BBL`, and export it. `format-view.ts` imports it.
  - `lib/water-chemistry.ts` keeps its own `GAL_TO_L` and `OZ_TO_G`; merging them is a drive-by (negative 6).
- Create `lib/recipe-ibu.ts`. Its module comment gives the formula, the OG simplification and the whirlpool rule.
  It imports `LB_PER` and `platoToSg`. It is a sibling of `lib/recipe-gravity.ts`, not an extension: bitterness has
  different inputs and failure modes.
  - `IbuLine = { name: string; category: string; stage: string; perBblQty: number; unit: string | null | undefined; timingMinutes: number | null; alphaAcid: number | null }`
  - `IbuGap = { name: string; reason: "no alpha acid" | "no boil time" | "not by weight" }`
  - `RecipeIbu = { kind: "estimate"; ibu: number } | { kind: "lowerBound"; ibu: number; missing: IbuGap[] } | { kind: "none"; reason: "no predicted OG" | "no boil hops" | "every boil hop has a gap"; missing: IbuGap[] }`
  - `recipeIbu({ ogPlato: number | null; lines: IbuLine[] }): RecipeIbu`
  - `ibuText(result: RecipeIbu, opts: { saved: boolean }): string`. Two callers: the page model (task 11) and the editor (task 10).
- Test first: `tests/recipe-ibu.test.ts` (every Degrading row; the golden 89 from `sgToPlato(1.05)`; oz and g lines
  match lb; whirlpool, dry-hop and boil-adjunct lines add nothing) and `tests/volume.test.ts`
  (`LITERS_PER_BBL` ≈ 117.3478).
- Accept: vitest, tsc. `tests/format-sizing.test.ts` stays green.

### 5. Draft-line helpers: day, pitch rate, alpha on the picker (no dependency)

- `lib/mgr/recipe-process-view.ts`:
  - `IngredientLine` gains `pitchRate?: string`. It is optional, so existing literals and older kept drafts still
    type-check. `timingMinutes` stays the stored minutes, as a string.
  - `typedTiming(stage, minutes)` gives whole days for `dry_hop`, minutes otherwise. `storedTiming(stage, typed)` is
    its inverse, kept beside it as one tested pair. Both use `MINUTES_PER_DAY` from `lib/time-window.ts`.
    Callers: `ingredientDetail` and IngredientView.
  - `ingredientDetail` prints "dry hop · day 4 · 1.2 lb / bbl". An optional fifth argument, a pitch rate, prints
    "pitch 0.75 M cells / mL / °P" in place of the per-bbl amount.
  - `lineReady` also requires `pitchRate` empty or positive. Dry-hop timing stays optional; when given it must be a
    whole number of days, at least 1.
  - `RecipeMaterial` and `toRecipeMaterial` gain `alpha_acid: number | null`.
- Test first: `tests/recipe-process-view.test.ts`. A dry hop at 5760 prints "day 4"; "boil · 60 min" is unchanged.
  Day 4 and 5760 convert both ways. A yeast line with a rate prints it; one without keeps "0.0455 each / bbl".
  `lineReady` rejects 30 minutes on a dry hop. `toRecipeMaterial` keeps `alpha_acid`.
- Accept: vitest, tsc.

### 6. `get_recipe` returns the IBU (needs 2, 3, 4)

- `lib/commands/production.ts`: the ingredient select adds `alpha_snapshot`, `pitch_rate` and
  `materials(base_uom, name, category)`. The result adds `ibu: RecipeIbu` from `recipeIbu` and the predicted OG,
  computed on read like `ogPlato`. Update the description.
- Test first: `tests/production.test.ts`. One 10% hop at 60 min gives `ibu.kind === "estimate"`.
  Without alpha acid it gives `"none"`, with the hop in `missing`.
- Then run `bun run docs:api` once for tasks 2, 3 and 6. The `/recipe/` and `/material/` rules in
  `lib/mgr/api-operations.ts` already file these operations.
- Accept: vitest on `mgr_test`, `tests/api-docs.test.ts`, tsc.

### 7. Material sheet: alpha acid and cells per unit (needs 2)

- `lib/mgr/material-view.ts` gains `alphaAcid?: string` and `cellsPerUnit?: string`.
- `components/mgr/views/material.tsx`, following `EXTRACT_KINDS` (:29), no new primitive.
  A hop gets `E.edit("Alpha acid % · optional", …)`. A yeast gets `E.edit("Billion cells per <unit> · optional", …)`
  and `E.info("About 100 per liquid pack and 200 per dry packet.")`.
- `app/(app)/materials/material-form.tsx`: state for both, seeded from the saved row, each sent only for its kind.
- `lib/mgr/fixtures/purchasing.ts`: `materialCitra` gets `alphaAcid: "12.5"`.
- `components/mgr/screens.tsx`, Material record (:1959), new states: "hop" (alpha acid asked; recipes estimate IBU
  from it) and "yeast" (billion cells per unit asked; Brew day counts packs from it).
- Test first: `tests/purchasing-view.test.ts` (alpha field on Hop only; cells field and hint on Yeast only) and
  `tests/mgr-screens.test.ts` (Material states include "hop" and "yeast").
- Accept: the pure inventory list, tsc, lint. `/browse` on `/materials`.

### 8. Ingredient sheet: Day and pitch rate (needs 5, 7)

- `components/mgr/views/ingredient.tsx`:
  - The timing label is "Day" on a dry hop, else "Timing min · optional" (inline; one caller).
    The field shows `typedTiming` and writes `storedTiming`.
  - A stage change clears timing, so 60 minutes never shows as day 0.04.
  - A yeast material (A's `IngredientMaterial.category`) shows `E.edit("Pitch rate · M cells / mL / °P · optional", …)`,
    min 0.1, max 5, step 0.05. Picking a non-yeast clears `pitchRate`, so the RPC never refuses the line.
- `components/mgr/screens.tsx`, Ingredient record (~:2033-2045): fixture `timingMinutes: "5760"`; states "dry hop: Day
  asked" and "yeast: pitch rate asked". The spec matches recipe-builder spec :125-126 (minutes for boil and whirlpool,
  a day number for dry hop) and says a yeast line may carry a pitch rate.
- Test first: `tests/mgr-screens.test.ts` (the frame shows "Day" and "4"; both states listed) and
  `tests/new-recipe.test.ts` (a yeast material shows "Pitch rate"; a source assertion that `sheetMaterials` passes `category`).
- Accept: the pure inventory list, tsc, lint. `/browse` on the sheet.

### 9. Drop the invented `dryHopDay` (needs 5, 8)

- Remove the parameter and branch from `fermentationSummary` (`lib/mgr/recipe-process-view.ts:59-66`), `dryHopDay` from
  `fermentation-schedule.tsx:11,16`, `dryHopDay={4}` from `screens.tsx` (~:2089), and the `4` from A's
  `fermentationSummary(FERM_STAGES, 4)` call in `lib/mgr/fixtures/production.ts`.
- Rewrite the Fermentation schedule spec (~:2087): the dry-hop day is on the dry-hop ingredient line.
- Test first: `tests/recipe-process-view.test.ts:35-36` (the two-argument cases go) and
  `tests/mgr-screens.test.ts:108-113` (no "falls in Primary").
- Accept: the pure inventory list, tsc, lint.

### 10. Editor: copy, kept draft, blocker, send, preview (needs 2, 3, 4, 5)

- `lib/mgr/recipe-view.ts`: A's `versionToDraft` copies `pitch_rate` into `pitchRate` (`""` when null) and keeps the
  stored minutes. A's `draftBlocker` names the first line failing `lineReady` ("Edit Citra: a dry hop needs a whole
  day"), so a copied line is never dropped silently.
- `lib/mgr/recipe-draft.ts`: A's zod line schema gains `pitchRate: z.string().optional()`. An older stored draft
  without it restores; its lines have no rate.
- `app/(app)/recipes/[id]/recipe-version-form.tsx`: `build` sends `pitchRate` (a number, or omitted) and the stored
  minutes. The preview adds `ibuText(recipeIbu(…), { saved: false })` from the same lines and material map.
- Test first: `tests/recipe-view.test.ts` (0.75 seeds "0.75"; 5760 seeds "5760"; an incomplete line blocks and is
  named) and `tests/recipe-draft.test.ts` (a draft without `pitchRate` restores; one with it keeps it).
- Accept: vitest, tsc, lint. `/browse` on `/recipes/<id>/new`: add a hop with alpha acid and one without.

### 11. Recipe page read-out (needs 6, 9, 10)

- `lib/mgr/recipe-view.ts`: `RecipeViewModel` gains `bitterness?: string`; `RecipeSnapshot` gains `ibu`, `pitch_rate`
  and `alpha_snapshot`. `toRecipePageModel` sets `bitterness: ibuText(s.ibu, { saved: true })` and passes
  `pitch_rate` to `ingredientDetail`.
- `components/mgr/views/recipe.tsx`: `E.info(model.bitterness)` right after Predicted, inside A's status region.
- `lib/mgr/fixtures/production.ts`: `recipeHazyV4.bitterness` is computed with `recipeIbu`, not typed: Citra boil
  10 min, 0.4 lb/bbl, alpha 12.5, OG 15.2 °P gives "IBU 15 · boil hops only".
- `components/mgr/screens.tsx`, Recipe record: writes add the alpha acid snapshot and pitch rate. The spec says IBU
  comes from frozen alpha acid and the predicted OG and is never stored. New states: "some hops lack alpha acid"
  (IBU ≥ N names them) and "no predicted OG or no alpha acid" (the reason, no number).
- Test first: `tests/recipe-view.test.ts` (the IBU text; a lower bound naming the hop and the Materials remedy; a
  yeast row with its rate) and `tests/mgr-screens.test.ts` (the frame shows "IBU 15 · boil hops only" and
  "dry hop · day 4"; both states listed).
- Accept: vitest, the pure inventory list, tsc, lint. `/browse` on a recipe with hops.

### 12. Brew day pack count (needs 1, 4, 11; B merged)

- `lib/mgr/brew-day-view.ts`:
  - `BrewPlan` ingredients gain `extract_snapshot?`, `pitch_rate?`, `cellsPerUnit?`; `version` gains
    `brewhouse_efficiency?` and `yeast_attenuation?`. Merge with B's widened `version`; do not duplicate it.
  - In B's `brewPlanRows`, a line with `pitch_rate` reads "pitch 0.75 M cells / mL / °P · 63 packs for 14.6 bbl"
    in place of the per-bbl total. An unknown count gives the reason ("no predicted OG", "no cells per unit on the
    material"). At 0 or NaN bbl there is no count, as B prints no total.
  - OG comes from `recipeGravity`; litres from `LITERS_PER_BBL` (task 4). No new function: B reserves these rows for D.
- Reuse: `brewPlanActuals` scales by volume. Packs are cells, rounded up, so they are not an option on it.
- `lib/mgr/fixtures/production.ts`, `brewDayHazy.plan`: the malt gets `extract_snapshot: 1.037`; the version gets
  efficiency 0.72 and attenuation 0.78; add a yeast line with `pitch_rate: 0.75` and `cellsPerUnit: 200`.
- `components/mgr/screens.tsx`, Brew day: the spec says how packs are counted; new state "no cells per unit or no
  predicted OG" (the reason in place of packs).
- Test first: `tests/brew-day-actuals-view.test.ts`, B's "brew plan rows" (the golden 88; no-rate, no-cells, no-OG)
  and `tests/production-view.test.ts` "Brew day view" (63 packs at 14.6 bbl; the recorded 7.3 bbl turn shows 32;
  from 45.2 lb malt at 72%, 9.71 °P; recompute if B changed that line; the Brew day states include the new one).
- Accept: vitest, the pure inventory list, tsc, lint. `/browse` on a planned batch.

### 13. Docs (needs 7-12)

- `content/docs/staff-guide.mdx`, no em dashes:
  - Materials (~743): **Alpha acid** on hops, a percent; recipes estimate IBU from it; blank on an edit keeps it.
    **Billion cells per unit** on yeast, with the 100 / 200 hint.
  - Recipes (~643): the IBU line counts boil hops by their minutes and shows a lower bound or a reason, never an
    invented number. A version freezes alpha acid like extract potential, so new alpha acid needs the next version.
    A dry hop asks for **Day**. A yeast line may carry a **Pitch rate**.
  - Brew day (~663): packs come from the pinned version's predicted OG and this turn's knockout barrels, rounded up.
- `.agents/superpowers/specs/brewing-domain.md:59`: the UI now sets a pitch rate and counts packs; viability,
  harvest and generation stay in a later slice.
- `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`: §materials (:383) adds `alpha_acid`,
  `cells_per_unit` and the undocumented `extract_potential`. §recipe_ingredients (:486) adds `alpha_snapshot`,
  `pitch_rate`, the undocumented `extract_snapshot`, and day × 1440 in `timing_minutes` on a dry hop.
- Test first: `tests/docs.test.ts` and `tests/design-docs.test.ts` stay green.

### 14. Simplify and prove (needs all)

- `/simplify`, then the full proof, then `git diff` for stray bytes.
- PR description: a progress line; real `DOCS:` and `API:` (both change); no `TODO:` line (no `TODO.md` item names
  IBU or pitch; re-check at PR time).

## Migration SQL

`supabase/migrations/20261016120000_recipe_ibu_pitch.sql`

```sql
-- Recipe IBU and yeast pitch (decisions 5 and 8). Alpha acid on the hop,
-- frozen per version like extract_potential (#614); a target pitch rate on a
-- yeast line; cells per stocked unit on the yeast, frozen into the brew plan
-- snapshot when a turn is recorded. Dry-hop day needs no schema:
-- timing_minutes holds day × 1440 on a dry_hop line.
alter table public.materials
  add column alpha_acid numeric(5,2) check (alpha_acid > 0 and alpha_acid <= 30),        -- percent, e.g. 12.5 (lib/recipe-ibu.ts)
  add column cells_per_unit numeric(10,3) check (cells_per_unit > 0);                     -- billion cells per base unit (lib/mgr/brew-day-view.ts)
alter table public.recipe_ingredients
  add column alpha_snapshot numeric(5,2),                                                  -- materials.alpha_acid when the version was saved
  add column pitch_rate numeric(5,3) check (pitch_rate > 0 and pitch_rate <= 5);           -- million cells / mL / °P

-- Same signature as 20260917100000, so create or replace keeps its grants.
-- The body is that definition plus the yeast-only pitch rate and the alpha snapshot.
create or replace function public.create_recipe_version(
  p_brewery uuid, p_recipe uuid, p_mash_schedule jsonb, p_fermentation_schedule jsonb, p_process jsonb,
  p_brewhouse_efficiency numeric, p_yeast_attenuation numeric, p_boil_minutes int, p_target_ibu numeric, p_note text,
  p_ingredients jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_replay jsonb; v_recipe public.recipes; v_row public.recipe_versions; v_mash_temp numeric;
begin
  v_actor := private.assert_staff(p_brewery, array['admin','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'create_recipe_version', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'recipe', p_recipe, 'mash_schedule', p_mash_schedule,
      'fermentation_schedule', p_fermentation_schedule, 'process', p_process,
      'brewhouse_efficiency', p_brewhouse_efficiency, 'yeast_attenuation', p_yeast_attenuation,
      'boil_minutes', p_boil_minutes, 'target_ibu', p_target_ibu, 'note', p_note, 'ingredients', p_ingredients));
  if v_replay is not null then return v_replay; end if;
  select * into v_recipe from public.recipes where id = p_recipe and brewery_id = p_brewery for update;
  if v_recipe.id is null then raise exception 'recipe not found'; end if;
  if jsonb_array_length(p_ingredients) = 0 then raise exception 'a recipe version needs at least one ingredient'; end if;
  if jsonb_array_length(p_mash_schedule) = 0 then raise exception 'a recipe version needs a mash schedule'; end if;
  if exists (select 1 from jsonb_array_elements(p_ingredients) line
             join public.materials m on m.id = (line->>'material_id')::uuid and m.brewery_id = p_brewery
             where line->>'pitch_rate' is not null and m.category <> 'yeast') then
    raise exception 'a pitch rate belongs on a yeast line';
  end if;

  -- The saccharification rest: the longest step between 144 and 162 °F
  -- (lib/mgr/recipe-schedule.ts says the same); none in range → null.
  select (s->>'tempF')::numeric into v_mash_temp from jsonb_array_elements(p_mash_schedule) s
  where (s->>'tempF')::numeric between 144 and 162 order by (s->>'minutes')::numeric desc limit 1;

  insert into public.recipe_versions (brewery_id, recipe_id, version, mash_temp_f, brewhouse_efficiency, yeast_attenuation,
    boil_minutes, target_ibu, note, created_by, mash_schedule, fermentation_schedule,
    pre_boil_bbl, whirlpool_minutes, whirlpool_temp_f, whirlpool_rest_minutes, knockout_temp_f,
    target_water_profile_id, source_water_profile_id, mash_water_gal, sparge_water_gal, target_mash_ph)
  select p_brewery, p_recipe, coalesce(max(rv.version), 0) + 1, v_mash_temp, p_brewhouse_efficiency, p_yeast_attenuation,
    p_boil_minutes, p_target_ibu, p_note, v_actor, p_mash_schedule, p_fermentation_schedule,
    (p_process->>'pre_boil_bbl')::numeric, (p_process->>'whirlpool_minutes')::int, (p_process->>'whirlpool_temp_f')::numeric,
    (p_process->>'whirlpool_rest_minutes')::int, (p_process->>'knockout_temp_f')::numeric,
    (p_process->>'target_water_profile_id')::uuid, (p_process->>'source_water_profile_id')::uuid,
    (p_process->>'mash_water_gal')::numeric, (p_process->>'sparge_water_gal')::numeric, (p_process->>'target_mash_ph')::numeric
  from public.recipe_versions rv where rv.recipe_id = p_recipe
  returning * into v_row;

  -- The material lookup moves from a scalar subquery to a left join so it can
  -- read two columns; the result is still one row per line.
  insert into public.recipe_ingredients (brewery_id, recipe_version_id, material_id, per_bbl_qty, stage, timing_minutes, sort,
    extract_snapshot, alpha_snapshot, pitch_rate)
  select p_brewery, v_row.id, (line->>'material_id')::uuid, (line->>'per_bbl_qty')::numeric,
    (line->>'stage')::public.ingredient_stage, (line->>'timing_minutes')::int, (ord - 1)::int,
    m.extract_potential, m.alpha_acid, (line->>'pitch_rate')::numeric
  from jsonb_array_elements(p_ingredients) with ordinality as t(line, ord)
  left join public.materials m on m.id = (line->>'material_id')::uuid and m.brewery_id = p_brewery;

  insert into public.recipe_water_additions (brewery_id, recipe_version_id, material_id, qty, unit, stage, sort)
  select p_brewery, v_row.id, (a->>'material_id')::uuid, (a->>'qty')::numeric, a->>'unit', a->>'stage', (ord - 1)::int
  from jsonb_array_elements(coalesce(p_process->'water_additions', '[]'::jsonb)) with ordinality as t(a, ord);

  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

-- upsert_material gains two parameters, so the old signature is dropped
-- (as 20260924160000 did). The body is 20260927050000's plus the two fields.
-- On an edit, an omitted value keeps the saved one, like extract_potential.
drop function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,uuid);
create function public.upsert_material(
  p_brewery uuid, p_material uuid, p_name text, p_category public.material_category, p_base_uom public.uom,
  p_purchase_uom public.uom, p_purchase_uom_factor numeric, p_lot_tracked boolean, p_default_vendor uuid,
  p_reorder_point numeric, p_active boolean, p_extract_potential numeric, p_alpha_acid numeric, p_cells_per_unit numeric,
  p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_row public.materials;
begin
  perform private.assert_staff(p_brewery, array['admin','warehouse','brewer']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_material', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'material', p_material, 'name', p_name, 'category', p_category,
      'base_uom', p_base_uom, 'purchase_uom', p_purchase_uom, 'purchase_uom_factor', p_purchase_uom_factor,
      'lot_tracked', p_lot_tracked, 'default_vendor', p_default_vendor, 'reorder_point', p_reorder_point, 'active', p_active,
      'extract_potential', p_extract_potential, 'alpha_acid', p_alpha_acid, 'cells_per_unit', p_cells_per_unit));
  if v_replay is not null then return v_replay; end if;
  if p_material is null then
    insert into public.materials (brewery_id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked,
      default_vendor_id, reorder_point, active, extract_potential, alpha_acid, cells_per_unit)
    values (p_brewery, p_name, p_category, p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, 1),
            coalesce(p_lot_tracked, false), p_default_vendor, p_reorder_point, coalesce(p_active, true),
            p_extract_potential, p_alpha_acid, p_cells_per_unit)
    returning * into v_row;
  else
    select * into v_row from public.materials where id = p_material and brewery_id = p_brewery for update;
    if v_row.id is null then raise exception 'material not found'; end if;
    if (v_row.base_uom, v_row.purchase_uom, v_row.purchase_uom_factor) is distinct from (p_base_uom, p_purchase_uom, coalesce(p_purchase_uom_factor, v_row.purchase_uom_factor))
       and (exists (select 1 from public.material_movements where material_id = p_material)
         or exists (select 1 from public.recipe_ingredients where material_id = p_material)
         or exists (select 1 from public.format_bom where material_id = p_material)
         or exists (select 1 from public.purchase_order_lines where material_id = p_material)
         or exists (select 1 from public.material_contracts where material_id = p_material)
         or exists (select 1 from public.stock_transfer_lines where material_id = p_material)) then
      raise exception 'material is in use: its units cannot change';
    end if;
    if not v_row.lot_tracked and p_lot_tracked
       -- per bin: unlotted amounts in different bins must not cancel out
       and exists (select 1 from public.material_movements
                   where brewery_id = p_brewery and material_id = p_material and lot_id is null
                   group by bin_id having sum(qty) <> 0) then
      raise exception 'material has stock without a lot: count it to zero before turning on lot tracking';
    end if;
    update public.materials set name = p_name, category = p_category, base_uom = p_base_uom, purchase_uom = p_purchase_uom,
      purchase_uom_factor = coalesce(p_purchase_uom_factor, purchase_uom_factor), lot_tracked = coalesce(p_lot_tracked, lot_tracked),
      default_vendor_id = p_default_vendor, reorder_point = coalesce(p_reorder_point, reorder_point), active = coalesce(p_active, active),
      extract_potential = coalesce(p_extract_potential, extract_potential),
      alpha_acid = coalesce(p_alpha_acid, alpha_acid), cells_per_unit = coalesce(p_cells_per_unit, cells_per_unit)
    where id = p_material returning * into v_row;
  end if;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;
revoke all on function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,numeric,uuid) from public, anon, authenticated;
grant execute on function public.upsert_material(uuid,uuid,text,public.material_category,public.uom,public.uom,numeric,boolean,uuid,numeric,boolean,numeric,numeric,numeric,uuid) to authenticated;

-- The brew plan carries each ingredient's cells per unit, so Brew day can
-- count packs and a recorded turn keeps the count it showed. to_jsonb(i)
-- already carries alpha_snapshot and pitch_rate. Same signature as
-- 20260928090000, so create or replace keeps its revokes.
create or replace function private.brew_plan_snapshot(p_batch uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('recipe',r.name,'version',to_jsonb(v),
    'units',jsonb_build_object('temperature','F','beerVolume','bbl','waterVolume','gal','duration','minutes','waterIons','ppm'),
    'sourceWater',to_jsonb(sw),'targetWater',to_jsonb(tw),
    'ingredients',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('materialName',m.name,'unit',m.base_uom,
        'cellsPerUnit',m.cells_per_unit) order by i.sort,i.id)
      from public.recipe_ingredients i join public.materials m on m.id=i.material_id where i.recipe_version_id=v.id),'[]'::jsonb),
    'waterAdditions',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('materialName',m.name,'baseUnit',m.base_uom) order by a.sort,a.id)
      from public.recipe_water_additions a join public.materials m on m.id=a.material_id where a.recipe_version_id=v.id),'[]'::jsonb))
  from public.batches b left join public.recipe_versions v on v.id=b.recipe_version_id
  left join public.recipes r on r.id=v.recipe_id left join public.water_profiles sw on sw.id=v.source_water_profile_id
  left join public.water_profiles tw on tw.id=v.target_water_profile_id where b.id=p_batch;
$$;
```

## Proof

Schema, RPCs and commands change, so the full step-4 proof runs on `mgr_test`:

```
MGR_TEST_DB_RESET=1 scripts/test-db.sh
bun run test && bunx tsc --noEmit && bun run lint
```

`bun run test` includes the pure inventory list, `api-docs`, `migrations-applied`, and every test naming
the three SQL functions (which `land-pr.sh` re-runs). Each task's `/browse` check runs in session
`feat-recipe-ibu-pitch` on the test stack.

## Docs

Task 13 lists the doc edits. `bun run docs:api` regenerates `content/docs/api/` in task 6.
Module or header comments change on `lib/recipe-ibu.ts` (new), `lib/recipe-gravity.ts`, `lib/volume.ts`, `components/mgr/views/ingredient.tsx` and the migration.

## Risks and open questions

1. **Cells per unit, not per package.** The decision says "cells per package".
   This plan stores billions per base unit.
   For a yeast stocked by `each` (all 160 imported yeast lines), that is a package.
   For a dry yeast stocked by `g`, it is a gram, and the count reads in grams.
   Is that acceptable, or should packs be counted only for yeasts stocked by `each`?
2. **A yeast line with a rate still needs a quantity per bbl.**
   `per_bbl_qty` is `not null check > 0`, and Planning demand reads it.
   This plan keeps it required and shows the rate in its place on the row.
   Should a rate make the quantity optional instead?
3. **Hop category is read live.** IBU counts a boil line whose material is a hop today.
   The category is not frozen. Category changes are rare, so this is accepted.

## Review notes

- Ingredient order (QW9) and `list_recipes q`: C's plan owns both (its "Decisions it implements" table), so they are attributed to C, not "unassigned".
- `IngredientMaterial.category` and `sheetMaterials`: A's task 13 adds them, and D reuses them.
  Task 8 asserts the wiring so a missed rebase fails loudly.
- `category` was dropped from `brew_plan_snapshot`. Pack rows pick lines by `pitch_rate`, so nothing reads it.
- `yeastPitch` was folded into B's `brewPlanRows`, which B's plan reserves for D's rows.
  A separate function would have had one caller.
  Pack rows print nothing at 0 bbl, matching B's totals, instead of "enter knockout barrels".
- `timingLabel` was inlined into IngredientView (one caller).
  `storedTiming` stays beside `typedTiming` as the tested inverse.
- `IngredientLine.pitchRate` is optional, not required.
  The fixture, test and A-mapper literals then compile unchanged, and older kept drafts parse.
- The fixture IBU is computed (15), not typed. The old 38 needed about 32% alpha acid.
- `bun run docs:api` runs once in task 6. That avoids two parallel tasks rewriting the same generated pages.
- Dry-hop minutes typed before this PR: a read-only query on dev (2026-10-15) found 0 of 584 dry-hop lines with timing.
  Hosted was not queried. A line whose minutes are not a whole day blocks the save and is named (task 10); it is never dropped.
- The pack golden is now computed from a plan (88), not a typed °P (80), because the function derives OG itself.
- The Material record keeps one frame (Citra, a hop). The yeast field is covered by its state and by
  `tests/purchasing-view.test.ts`; a second frame would only repeat the sheet.

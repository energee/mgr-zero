# Brew day recipe targets and Schedule batch from a recipe

Status: Phase 1 plan, never approved or built as written. Kept for its decisions, 2026-11-04.
Schedule batch on a saved recipe (QW14) shipped separately in #1581, and the Brew day revamp
(#1103) has since changed the plan rows. Re-check every task against `main` before use.
Original status: Phase 1 plan, awaiting approval. Branch `feat/brew-day-recipe-targets`, PR to `main`.
PR B of four from the recipe page review. Screen-only: no migration, RPC or command change.
B starts after PR A merges: rebase onto `main` first.
Line numbers are from `origin/main` 45257057. Names from A come from A's plan (`docs/plans/recipe-page-usability.md` on `feat/recipe-page-usability`).

## Goal

Brew day's pinned plan shows the recipe name, raw per-bbl amounts ("40.909091"), raw stages ("dry_hop") and the mash steps (`components/mgr/views/brew-day.tsx:82-91`).
It omits boil, whirlpool, knockout, water and fermentation, and it totals nothing for the batch.
The frozen snapshot already holds all of it: `brew_plan_snapshot` stores the whole `recipe_versions` row, both water profiles and every `recipe_ingredients` row (`supabase/migrations/20260928090000_brew_records.sql:80-92`).

New batch leaves the brand blank, though the recipe names one (`app/(app)/batches/new-batch-form.tsx:18`).
The command and the guide promise that pre-fill (`lib/commands/production.ts:53`, `content/docs/staff-guide.mdx:643`).
The recipe page cannot schedule a batch at all.

## Decisions it implements

| Source | What this PR does |
|---|---|
| QW13 | Picking a recipe version in New batch fills **Brand** from that recipe. |
| QW14 | A saved recipe shows **Schedule batch**, a link to `/batches?scheduleBatch=1&recipeVersionId=<id>` that opens New batch filled. |
| QW15 | Brew day's plan lists `<recipe> v<n>`, boil, the version's process facts, mash steps, fermentation stages and each ingredient through `ingredientDetail`. |
| Decision 3 | Each ingredient also shows its total for this turn's knockout barrels. The recipe page stays per bbl. |
| QW4 (Brew day part) | Per-bbl amounts and totals print with A's `perBblDisplay` (three significant digits). |

## Out of scope

| Item | Owner |
|---|---|
| Recipe page rounding, title row, headings, saved date, price-group row; `perBblDisplay` and `mashStepDetail` themselves | A |
| Batch outcomes on the recipe | C |
| IBU, pitch rate and packs, dry-hop day | D (it adds rows to `brewPlanRows` and `BrewPlanSheet`) |
| A Brew day link to `/recipes/<id>` | Not done: that page shows the newest version, not the pinned one |
| Scaling water additions (`brew-day.tsx:88`) | Not asked |
| Rescaling prefilled actuals when Knockout barrels changes (`app/(app)/batches/[id]/page.tsx:39`) | Not asked; existing behavior |

## Files touched (and overlap with other PRs)

| File | B's change | Also touched by |
|---|---|---|
| `lib/mgr/brew-day-view.ts` | `BrewPlan` types, `brewPlanRows` | C (`currentBrewRecords` parameter), D (`yeastPitch`; adds two assumption keys to B's `version` type) |
| `lib/mgr/recipe-process-view.ts` | `fermentationStageDetail` | A (`perBblDisplay`, `mashStepDetail`, "No source"), D (`ingredientDetail` day and rate, `dryHopDay` removal) |
| `components/mgr/views/brew-day.tsx` | `BrewPlanSheet` rows and `bbl` prop | D (pitch row) |
| `components/mgr/views/fermentation-schedule.tsx` | row detail through the helper | A (header slot, row tap), D (`dryHopDay` removal) |
| `lib/mgr/recipe-view.ts` | `scheduleHref`; stage rows in `toRecipePageModel` | A (creates `toRecipePageModel`), C (tape), D (IBU) |
| `components/mgr/views/recipe.tsx` | Schedule batch button | A (read-out, title row), C (tape), D (IBU line) |
| `app/(app)/recipes/[id]/page.tsx` | `scheduleHref`, if A leaves `createHref` here | A, C, D |
| `app/(app)/recipes/[id]/recipe-brand-picker.tsx` | info line names New batch | A (adds the line) |
| `lib/mgr/schedule-batch-view.ts`, `app/(app)/batches/page.tsx`, `app/(app)/batches/new-batch-form.tsx` | brand fill and handoff | none |
| `lib/mgr/fixtures/production.ts` | `brewDayHazy.plan` | A (moves `MASH_STEPS`, `FERM_STAGES`, `WATER_HAZY` here; `recipeHazyV4`), C (tape), D (yeast line on `brewDayHazy`) |
| `components/mgr/screens.tsx` | Brew day spec, Recipe spec, a Schedule batch state | A, C, D |
| `content/docs/staff-guide.mdx` | Recipes, Batches, Brew day | A and C (Recipes), D (Recipes, Brew day, Materials) |
| `tests/brew-day-actuals-view.test.ts`, `recipe-process-view`, `production-view`, `new-recipe` | new cases; three literals gain `timing_minutes` | A (`recipe-process-view`, `new-recipe`), D (`recipe-process-view`, `production-view`) |

## Tasks

Each task writes its named test first and watches it fail.
Rendering is checked with `agent-browser` (see Proof).
Order: 1, 3 and 5 in parallel. 2 after 1. 4 after 3. 6 last.

1. **`brewPlanRows` and `fermentationStageDetail`.**
   - Test first: `tests/brew-day-actuals-view.test.ts` (new `describe("brew plan rows")`) and `tests/recipe-process-view.test.ts`.
     - Recipe row "Hazy IPA v4"; "No recipe" and no version rows when `version` is null.
     - "Boil" "60 min" only when `boil_minutes` is set.
     - Every `processReadout` row, with profile names matched by id.
     - Mash rows through `mashStepDetail`; one row per stage, "68 °F · 4 days", and "1 day" for one day.
     - Lines "mash · 40.9 lb / bbl", "mash · 44 lb / bbl" and "dry hop · 1.2 lb / bbl · 17.5 lb for 14.6 bbl".
     - No total when `bbl` is 0 or NaN.
   - Files: `lib/mgr/brew-day-view.ts`, `lib/mgr/recipe-process-view.ts`. The other stage-text writers after the rebase: `components/mgr/views/fermentation-schedule.tsx:15`, `toRecipePageModel` in `lib/mgr/recipe-view.ts`, and `recipeHazyV4` in `lib/mgr/fixtures/production.ts` if A writes the text there.
   - Types:
     - `BrewPlan.version?: (ProcessColumns & { version: number; boil_minutes: number | null; mash_schedule: MashStep[]; fermentation_schedule: FermentationStage[] }) | null`. That is what `to_jsonb(v)` writes: every process column (`20260917100000_recipe_process_spec.sql:8-22`) predates the snapshot, so no key is ever absent.
     - The key stays optional so existing `plan_snapshot: {}` test literals still type.
     - The mash step's `temp_f` alternative goes. The command and the only migration that writes `mash_schedule` use `tempF` (`lib/commands/production.ts:23`, `20260917100000_recipe_process_spec.sql:69`).
     - Ingredients gain `timing_minutes: number | null`. The literals at `tests/brew-day-actuals-view.test.ts:8,9,35` add `timing_minutes: null`.
     - `BrewPlan` gains `sourceWater?` and `targetWater?: { id: string; name: string } | null`, so `processReadout`'s `profileName(id)` can match by id.
     - `brewPlanRows(plan: BrewPlan, bbl: number): [string, string][]` and `fermentationStageDetail(s: FermentationStage): string`.
   - Reuse: `ingredientDetail`, `processReadout` and `plural` as they are; A's `perBblDisplay` for amounts and totals; A's `mashStepDetail`. The stage text is written twice today (`app/(app)/recipes/[id]/page.tsx:67`, `fermentation-schedule.tsx:15`), and Brew day would be a third, so one helper replaces them all. `brewPlanActuals` (`brew-day-view.ts:49`) builds prefill drafts, not display text, so it does not fit.
   - Accept: vitest on both files and tsc; existing `brewPlanActuals` tests stay green; a grep for the stage template finds only the helper.

2. **Brew day draws the rows.**
   - Test first: `tests/production-view.test.ts` "Brew day view". The open form at `initialBbl: "14.6"` shows "Hazy IPA v4", "Boil", "Primary" and "for 14.6 bbl". `brewDayTurnsHazy` shows "for 7.3 bbl" and never "for 20 bbl".
   - `components/mgr/views/brew-day.tsx`: `BrewPlanSheet` props gain `bbl: number` and draw `brewPlanRows` with `E.fld`; water additions stay as they are. Callers pass `record.initial_bbl` (`:46`) and `Number(value.initialBbl)` (`:61`). Never `plannedBbl`, which is wrong on a second turn.
   - `lib/mgr/fixtures/production.ts`: `brewDayHazy.plan.recipe` becomes "Hazy IPA", since "Hazy v4" would read "Hazy v4 v4". The plan gains version 4 with `recipeHazyV4`'s numbers (pre-boil 16.8, boil 60, whirlpool 20 min at 180 °F with a 10 min rest, knockout 65) and `WATER_HAZY`'s water fields. It gains A's moved `MASH_STEPS` and `FERM_STAGES`, the Denver and Hazy target profiles, and Citra lines at boil (0.4 lb, 10 min) and dry hop (1.2 lb, no timing; D adds the day).
   - `components/mgr/screens.tsx` Brew day `spec` (`:1728`): the plan lists the targets and each ingredient's total for the knockout barrels. "The 18 lb Citra dry hop" becomes "the Citra dry hop (17.5 lb at 14.6 bbl)".
   - Accept: vitest (`tests/production-view.test.ts`, `tests/unstarted-plan-views.test.ts`), tsc, the pure screen list. Needs 1.

3. **`withRecipe`.**
   - Test first: `tests/production-view.test.ts` "Schedule batch view". A branded recipe sets the brand. An unbranded one keeps the current brand. "" and an unknown id clear the recipe and keep the brand.
   - File: `lib/mgr/schedule-batch-view.ts`. Types: `recipeOptions: { id: string; label: string; brandId?: string | null }[]`; `withRecipe(options, versionId: string, brandId: string): { recipeId: string; brandId: string }`.
   - It knows nothing of `NONE`. The client `optional()` wrapper (`new-batch-form.tsx:44`) already maps `NONE` to "", and `NONE` lives in the "use client" `components/ui/select.tsx`, which the server page must not import (#440).
   - Reuse: no recipe-to-brand helper exists (searched `lib/mgr` for `brand_id` and `brandId`). Two callers: the pick handler and the handoff seed.
   - Accept: vitest, tsc.

4. **New batch fills the brand, and the handoff opens it.**
   - Test first: extend the source assertion at `tests/production-view.test.ts:114-120`. The page maps `brand_id`, reads `scheduleBatch` and `recipeVersionId`, and seeds through `withRecipe`. The form calls `withRecipe` and passes `defaultOpen: autoOpen`. The brand picker's info line names New batch.
   - `app/(app)/batches/page.tsx`: the `Recipe` type gains `brand_id: string | null`; `list_recipes` already selects it (`lib/commands/production.ts:165`). Options carry `brandId`. The page reads `searchParams: Promise<{ scheduleBatch?: string; recipeVersionId?: string }>` as `packaging/page.tsx:32-33` does, and seeds `withRecipe(recipeVersions, recipeVersionId ?? "", "")`. A stale id opens the sheet with no recipe.
   - `app/(app)/batches/new-batch-form.tsx`: props `autoOpen?: boolean` and `initial?: { recipeId: string; brandId: string }`; `useState` seeds from `initial`; the recipe control calls `withRecipe`. `reset` still clears to blank, so **New batch** starts empty after the handoff sheet closes.
   - `app/(app)/recipes/[id]/recipe-brand-picker.tsx`: A's info line becomes "Saves when you pick. New batch fills it in; batches already scheduled keep theirs." A left the pre-fill out until this PR makes it true.
   - Reuse: the movement and repack handoffs (`autoOpen` plus `initial`, `inventory/movement-form.tsx:36,56-71`). `useCommandForm`'s `defaultOpen` opens without a reset (`lib/commands/use-command-form.ts:86-93`). `listParams` does not fit: it builds sort and filter links.
   - Accept: vitest, tsc, lint. Needs 3.

5. **Schedule batch on a saved recipe.**
   - Test first: `tests/new-recipe.test.ts`.
     - The inventory Recipe frame (`SCREENS` "Recipe") draws a "Schedule batch" button with no href.
     - A `readOnly` versioned model with `scheduleHref` draws a link to it beside Create recipe version.
     - An `empty` model and a draft (`controls`) draw none.
     - The page sets `scheduleHref` only when a version exists.
   - `lib/mgr/recipe-view.ts`: `scheduleHref?: string`, documented like `createHref`.
   - `components/mgr/views/recipe.tsx`: `E.btn("Schedule batch", "g", model.scheduleHref)` beside every Create recipe version on a saved, versioned model (`!controls && !model.empty`). That is A's title-row action, which A draws on every model without `controls` (live and inventory alike). The pair is one `flex gap-2` node, built once (the `packaging/page.tsx:47` layout).
   - The recipe page sets `scheduleHref` beside `createHref`: today `app/(app)/recipes/[id]/page.tsx:55`, after A wherever `toRecipePageModel` sets it. The fixture leaves it unset, so the explorer's button is inert (AGENTS: fixtures never default live paths).
   - `components/mgr/screens.tsx`: the Recipe `spec` names Schedule batch. Schedule batch `states` gains `["from a recipe", "opens with the recipe version and its brand filled"]`. No `to` entry: `resolveTap` already falls back to the exact screen name (`lib/mgr/screen-links.ts:431`).
   - Reuse: `E.back` takes one action node (`components/mgr/e.tsx:131`) and `E.btns` takes no hrefs (`:219`), so the pair is two `E.btn` in a flex row.
   - Accept: vitest, tsc, lint, the pure screen list (tap coverage must resolve the new button).

6. **Guide, comments, simplify, proof.**
   - Files: `content/docs/staff-guide.mdx` (see Docs). Module comments of `lib/mgr/brew-day-view.ts`, `lib/mgr/schedule-batch-view.ts`, `app/(app)/batches/page.tsx` and `components/mgr/views/recipe.tsx`. `app/(app)/batches/new-batch-form.tsx:1-4`: the recipe now fills the brand, and a handoff can open the sheet.
   - Test: `tests/docs.test.ts` and `tests/design-docs.test.ts` stay green.
   - Then `/simplify`, the Proof below, and `git diff` for stray bytes.
   - PR description: one progress line; `API: none`; no `DOCS:` line; no `TODO:` line (no `TODO.md` item matches at 45257057; re-check at PR time).
   - Needs 1-5.

## Proof

Screen-only: no operation, migration or schema change.
So no `tests/api-docs.test.ts`, `bun run docs:api`, `bun run migrations:lock` or generated types.

```
bunx tsc --noEmit && bun run lint
bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts
bunx vitest run tests/brew-day-actuals-view.test.ts tests/recipe-process-view.test.ts tests/production-view.test.ts tests/unstarted-plan-views.test.ts tests/new-recipe.test.ts tests/recipe-view.test.ts tests/interactive-view-slots.test.ts
```

`agent-browser`, session `feat-brew-day-recipe-targets`, against the test stack, phone and desk width:

- A recipe: Schedule batch opens New batch with the version and brand filled. Close it; New batch starts empty.
- New batch: picking a recipe fills Brand.
- A planned batch: totals follow Knockout barrels as it is typed.
- A two-turn batch: each turn totals its own knockout.
- `/docs/screens-explore`: Recipe shows Schedule batch, and the tap opens Schedule batch.

## Docs

`content/docs/staff-guide.mdx`, no em dashes:

1. Recipes (~643): on a saved recipe, **Schedule batch** opens **New batch** with the newest version and its brand filled.
2. Batches (~661): picking a recipe version fills **Brand** when the recipe has one. It replaces a brand already chosen and stays editable.
3. Brew day (~663): the pinned plan lists the recipe and version, the boil, and the version's process facts: pre-boil volume, whirlpool, knockout temperature, source and target water profiles, mash and sparge water, and target mash pH. Then the mash steps, the fermentation stages, and each ingredient per barrel with its total for **Knockout barrels**. The totals follow **Knockout barrels** as you type; the prefilled quantities do not. A recorded turn totals its own knockout.

Module comments are listed in task 6.

## Risks / open questions

Risks:

1. `?scheduleBatch=1` stays in the URL after Save, so a reload reopens the sheet. The repack handoff behaves the same; it is not changed here.
2. The pinned plan grows to about 20 rows inside an open `<details>`. The phone browse check decides whether that needs anything; nothing is planned.

Open questions:

1. Should a recipe pick replace a brand already chosen, or fill only a blank one? The plan replaces it.
2. Totals print three significant digits ("597 lb", "17.5 lb"). Should they print four-decimal ticks ("597.2727 lb") instead? The prefilled actuals start from planned barrels, so the two never had to match.

## Review notes

Every major issue is fixed above. Each minor issue:

- Per-bbl formatter (Task 1 duplicated A): fixed. The task is gone; B calls A's `perBblDisplay`, and the "44 lb / bbl" row covers the one new case.
- Screen-links task never red: fixed. No `to` entry; the tap check rides on task 5's frame assertion and tap coverage.
- Snapshot types: fixed, with one deviation. The `version` key stays optional (`?:`) so `plan_snapshot: {}` literals in existing tests still type; a present key always carries every column.
- `withRecipe` and `NONE`: fixed. It treats "" and unknown ids as no recipe; `NONE` stays in the client wrapper.
- Brew day guide undercounted rows: fixed. Docs item 3 lists every `processReadout` row.
- Totals equal prefilled actuals (wrong premise): fixed. Open question 2 is now a display choice, and the guide says the totals follow the field while the prefill does not.
- Fixture "Hazy v4 v4" and the 18 lb spec: fixed in task 2.
- Ordering, Accept lines, merged tasks: fixed. Every task has an Accept line, the old task 8 is folded into task 5, task 5 no longer waits on `withRecipe`, and the guide is the last task.
- Stale header comments and PR directives: fixed in task 6. The brand picker's pre-fill line is restored in task 4.
- `tests/unstarted-plan-views.test.ts` missing from the proof: fixed.
- Compaction: fixed. Shorter title, reuse notes folded into tasks, eight tasks down to six.

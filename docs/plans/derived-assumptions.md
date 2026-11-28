# Derived efficiency and attenuation

Status: approved 2026-11-28; in build.

## Problem

A recipe's two assumptions, brewhouse efficiency and yeast attenuation, are
typed by hand. Every imported recipe carries 75% and 75%. The brewery's own
batches say otherwise: Reptile finishes near 80% attenuation, and the brewery's
median efficiency is 73.8%.

The page already measures each brewed batch (Batch actuals). It states the gap
and gives no number to use.

## Decision

Suggest each assumption from the brewery's own finished batches. The brewer
accepts a suggestion with **Use**; nothing changes an assumption on its own.

Mash temperature is not put into a formula. It is one of the keys that decides
which past batches a recipe is compared with.

## Which batches count

A batch counts when all of these hold:

- It is brewed and closed.
- It was not started from a transfer (a split has no brew of its own).
- Its copy's mash lines all have an extract potential, so its efficiency can be measured.

Its efficiency counts when it has a first gravity reading and a knockout volume.

Its attenuation counts when its last gravity reading is at least 7 days after
brew day and below its first. A reading taken three days in is not a final gravity.

## How a suggestion is chosen

The mash rest is the saccharification rest of the copy's mash schedule
(`saccharificationRest`), the rest that sets fermentability.

Each assumption takes the first rule below that has at least two batches. The
value is the median, shown as a whole percent.

| Assumption | Rule | Batches compared |
| --- | --- | --- |
| Efficiency | 1 | Same grain bill (`gristKey`) |
| Efficiency | 2 | Every counted batch in the brewery |
| Attenuation | 1 | Same grain bill, same yeast, mash rest within 2 °F |
| Attenuation | 2 | Same yeast, mash rest within 2 °F |
| Attenuation | 3 | Same yeast |
| Attenuation | 4 | Every counted batch in the brewery |

"Same yeast" means the copies share a yeast material, on a line at any stage.

A suggestion is shown only when it differs from the number in the field. So an
imported recipe at 75% gets one without 75 being treated as special, and a
recipe already on the suggested number stays quiet.

## What the screen says

In the **Recipe numbers** sheet, under each of the two fields:

- *3 batches on this grain bill and yeast, mashed near 152 °F, finished at 80%.* **Use 80%**
- *197 batches across the brewery measured 74%.* **Use 74%**

**Use** fills the field as an unsaved change; **Save changes** commits it, as
for any other number. The suggestion follows the sheet as typed: change the
yeast or the grain bill and it is worked out again.

Batch actuals keeps its summary line. Its spec sentence "gives no advice, and
nothing changes an assumption for the brewer" becomes "the Recipe numbers sheet
offers the measured number; nothing changes an assumption until the brewer uses it".

## Tasks

1. **Measured batches query.**
   - Test first: `tests/batch-measurements.test.ts` (database).
   - Files: `lib/commands/production.ts`.
   - Add `list_batch_measurements` (Admin, Brewer): one row per counted batch with
     `batchNo`, `brewedOn`, `gristKey`, `yeastIds`, `mashRestF`, `brewhouseEfficiency`, `apparentAttenuation`.
   - Type: `BatchMeasurement` in `lib/mgr/recipe-assumptions.ts`.
   - Reuses `measuredGravity`, `gristKey`, `currentBrewRecords`, `transferStarts` and `saccharificationRest`.
     The batch read `get_recipe_outcomes` already does is shared, not copied.
   - Accept: the test seeds a finished batch, one read three days in, an open one and a
     transfer-started one, and gets attenuation only from the first; `vitest` green.
   - Depends on: nothing.

2. **Suggestion rule.**
   - Test first: `tests/recipe-assumptions.test.ts` (pure).
   - Files: `lib/mgr/recipe-assumptions.ts` (new).
   - `suggestAssumptions(sheet: { gristKey: string; yeastIds: string[]; mashRestF: number | null }, history: BatchMeasurement[])`
     returns `{ efficiency?: AssumptionSuggestion; attenuation?: AssumptionSuggestion }`,
     where `AssumptionSuggestion = { percent: number; batches: number; text: string }` and `text` is the sentence the sheet shows.
   - Accept: each rule in the table above has a case; under two batches falls to the next rule;
     an even count takes the mean of the middle two; `vitest` green.
   - Depends on: the `BatchMeasurement` type from task 1. Can be written in parallel with task 1.

3. **Recipe numbers sheet.**
   - Test first: `tests/recipe-assumptions.test.ts` (the sheet draws the line and Use; none when the field already holds the number).
   - Files: `components/mgr/views/recipe-numbers.tsx`, `app/(app)/recipes/[id]/schedule-sheets.tsx`,
     `app/(app)/recipes/[id]/recipe-version-form.tsx`, `app/(app)/recipes/[id]/page.tsx`, `app/(app)/recipes/new/page.tsx`.
   - `RecipeNumbersView` takes `suggestions?: Partial<Record<RecipeNumberKey, AssumptionOffer>>`, where `AssumptionOffer = { text: string; use: string }`; only the two assumptions ever get one.
     The editor works them out from the draft with `suggestAssumptions`; both pages load `list_batch_measurements`.
   - Use is a borderless button. No new control.
   - Accept: `tsc`, lint and the screen suites green; the rendered sheet looked at with `browse`.
   - Depends on: tasks 1 and 2.

4. **Screen inventory and docs.**
   - Files: `components/mgr/screens.tsx` (Recipe and Recipe numbers entries; the Recipe numbers frame draws one suggestion),
     `content/docs/staff-guide.mdx` (Recipes), `content/docs/api/` via `bun run docs:api`.
   - Accept: `tests/mgr-screens.test.ts`, `tests/docs.test.ts`, `tests/api-docs.test.ts` green.
   - Depends on: task 3.

Tasks 1 and 2 can run in parallel. Tasks 3 and 4 are sequential after them.

No database change: everything is read from existing tables.

## Not done

- No automatic change to a saved recipe. Existing recipes show the suggestion; a person accepts it.
- No mash-temperature formula.
- The seven days are counted on the brewery's calendar, as brew day is.
- A batch split across tanks is read as one batch: its last reading in any tank. Batch actuals reads each tank.
- A recipe on a yeast that has been set inactive loses the yeast rules in the editor, because the editor's
  material list leaves inactive materials out. It falls back to the brewery-wide number.
- A measurement keeps its batch number and brew day, though the sheet does not draw them: an API caller can
  say which batches a number came from.
- A new recipe is not pre-filled. It shows the suggestion like any other sheet.
- Knockout volume on imported batches equals the planned volume on 188 of 197 batches, which
  looks like an import default. Efficiency measured from them may read a little high.
  Batches brewed in MGR record a real knockout.
- The history is every counted batch in the brewery, read on page load. At a few hundred
  batches that is small. If it measures slow, store the keys on `recipe_versions` at save.

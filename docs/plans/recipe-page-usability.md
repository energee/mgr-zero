# Recipe page usability (PR A): read-out, copy-forward draft, kept draft

Status: Phase 1 plan, awaiting approval. Branch `feat/recipe-page-usability`,
worktree `.agents/worktrees/feat-recipe-page-usability`, PR to `main`. PR A
merges first; B (`feat/brew-day-recipe-targets`) and C (`feat/recipe-outcomes`)
rebase onto it, and D (`feat/recipe-ibu-pitch`) comes last.

Source: the verified usability review of `/recipes/<id>` (QWn = Quick win n,
BIGn = Bigger change n), checked against `origin/main` 45257057.

## Goal

A saved version reads as text with headings, and its one verb sits on the
title row. Create recipe version opens a copy of the current version, not a
blank draft. An unsaved draft survives leaving the page in the same tab. The
page says why a prediction or a save is missing. Nothing in this PR touches a
command, an RPC or the schema.

## Decisions it implements

| Decision | What this PR does | Review ids |
|---|---|---|
| 2. Version history | Show "Saved <date>". Fix the stale gate text. File the picker issue. | QW16, BIG2 |
| 6. Unsaved draft | Keep the draft in sessionStorage per recipe. Restore it with a notice and Start over. Clear it on save. | BIG6 |
| 7. Default price group | Hide the locked row on live pages. The inventory keeps its picker. File the wiring issue. | QW10, BIG8 |

Without a decision: QW1-8, QW11, QW12 (modified), QW17-26. QW12 is modified:
draw `E.tape` only when it has rows; there is no interim gated row. PR C draws
the tape and its heading.

## Out of scope

| Item | Owner |
|---|---|
| Batch actuals, `get_recipe_outcomes` (decision 1, BIG1) | C |
| Brewing order (QW9), recipe search (decision 9, BIG7) | C |
| Brand pre-fill on New batch (QW13), Schedule batch from the recipe (QW14), Brew day targets and totals (decision 3, QW15) | B |
| Dry-hop day, the dry-hop fixture row, `dryHopDay` (decision 4, QW25 part) | D |
| Yeast pitch rate (decision 5), IBU (decision 8) | D |
| Making every `E.note`/`E.info` a non-alert (225 calls, 91 files) | Issue filed in task 17 |

## Files touched

| File | Tasks | Also touched by |
|---|---|---|
| `lib/recipe-gravity.ts` | 1 | D (IBU) |
| `lib/mgr/recipe-process-view.ts` | 2 | B (`fermentationStageDetail`), D (`ingredientDetail` day, `fermentationSummary` param) |
| `lib/mgr/recipe-view.ts` | 3, 4 | B (`scheduleHref`), C (tape), D (IBU, pitch) |
| `lib/mgr/recipe-draft.ts` (new) | 5 | none |
| `components/mgr/views/pos-controls.tsx` | 6 | none |
| `components/mgr/search-pick.tsx` (new), `components/mgr/e.tsx`, `components/mgr/views/new-order.tsx` | 7 | none |
| `components/mgr/views/recipe.tsx` | 4, 8 | B (Schedule batch beside the title-row verb), C (tape heading), D (IBU line) |
| `app/(app)/recipes/[id]/page.tsx` | 3, 4, 9 | B (`scheduleHref`), C (outcomes read), D (IBU) |
| `app/(app)/recipes/[id]/recipe-brand-picker.tsx` | 4, 9 | none |
| `app/(app)/recipes/[id]/new/page.tsx` | 10 | D |
| `app/(app)/recipes/[id]/recipe-version-form.tsx` | 8, 10, 12, 13 | D (pitch rate, day) |
| `components/mgr/views/{mash-schedule,fermentation-schedule,water}.tsx` | 2, 11 | D (`fermentation-schedule.tsx` `dryHopDay`) |
| `app/(app)/recipes/[id]/schedule-sheets.tsx` | 11, 12 | D (ingredient sheet) |
| `components/mgr/views/ingredient.tsx`, `lib/mgr/screen-links.ts` | 13 | D (Day field, pitch rate) |
| `lib/mgr/recipes-view.ts`, `components/mgr/views/recipes.tsx`, `app/(app)/recipes/page.tsx` | 14 | C (search) |
| `lib/mgr/fixtures/production.ts`, `components/mgr/screens.tsx` | 11, 13, 14, 15 | B, C, D |
| `content/docs/staff-guide.mdx` (Recipes, ~639-647) | 16 | B, C, D |

`fermentation-schedule.tsx` changes only its header slot, row helper and empty
footer here. PR D owns its `dryHopDay` parameter.

## Tasks

Each task names its test first and starts by watching it fail. UI rendering
is the exception: TDD the logic below the component, then look at the page
with `/browse`. Every task that changes a type or prop updates all of its
callers in the same task, so `tsc --noEmit` passes after each one. Line
numbers are from 45257057 and may shift a little.

Dependencies are listed once, in each task's **Needs** line. Waves follow
from them:

- Wave 1: 1, 2, 6, 7, 14, 17.
- Wave 2: 3, 11.
- Wave 3: 4, 5.
- Wave 4: 8.
- Wave 5: 9, 10.
- Wave 6: 12, then 13; 15 runs beside them.
- Wave 7: 16, then 18.

1. **`gravityBlockers` (QW3).** Needs: none.
   - Test first: `tests/recipe-gravity.test.ts`. Cases: a missing potential, a volume unit, both, none. `recipeGravity` still returns null exactly when blockers exist.
   - Export `gravityBlockers(ingredients: RecipeGravityIngredient[]): GravityBlocker[]` from `lib/recipe-gravity.ts`. `GravityBlocker = { index: number; reason: "no_extract" | "no_weight" }`, over mash-stage lines only. `recipeGravity` calls it, so the null rule lives in one place. "No mash ingredient" stays `recipeGravity`'s own null.
   - Reuse: extends the existing function; no second copy of the rule.
   - Accept: vitest green, `tsc --noEmit` clean.

2. **Process-view helpers (QW4, QW18, QW19).** Needs: none.
   - Test first: `tests/recipe-process-view.test.ts`.
     - `perBblDisplay`: 40.909091 gives "40.9", 0.045455 gives "0.0455", 0.011364 gives "0.0114".
     - `mashRowSummary` for one and two steps.
     - `mashStepDetail` hides the kind when it equals the name.
     - Update the line at :28 to "No source".
   - In `lib/mgr/recipe-process-view.ts`:
     - `perBblDisplay(n: number): string` gives three significant digits (`toLocaleString("en-US", { maximumSignificantDigits: 3 })`). Never use two fraction digits; that is a 10-12% hop error. PR B calls it on Brew day. `ingredientDetail` itself is unchanged; callers pass it a formatted value.
     - `mashRowSummary(steps: MashStep[]): string` gives, for example, "Total 60 min · 152 °F saccharification rest". `mashSummary` stays the sheet footer.
     - `mashStepDetail(step: MashStep): string` drops the kind when it equals the name.
     - `processReadout` labels a null source "No source", not "Brewery default".
   - `fermentationSummary` is unchanged. `FermentationScheduleView` draws its `E.info` footer only when stages exist, so an empty sheet does not say "No stages yet" twice. The rows say "No stages yet" themselves (tasks 4 and 10).
   - Reuse: `plural()` from `lib/mgr/plural.ts` for every count, and `saccharificationRest` from `lib/mgr/recipe-schedule.ts`.
   - Accept: vitest, tsc.

3. **Version-to-draft mapper and draft blocker (QW1, QW11).** Needs: 2.
   - Test first: `tests/recipe-view.test.ts` (new).
     - A 0.725 efficiency seeds "72.5", and 0.07 seeds "7".
     - String numerics coerce; null timing seeds "".
     - Water additions map; the version note is copied.
     - Each blocker comes back in its order, and null when ready.
   - In `lib/mgr/recipe-view.ts`:
     - Move the `get_recipe` row types out of `page.tsx:17-26` as `RecipeSnapshot`: recipe, version, ingredients with `materials.base_uom`, water additions and predictions. Add `created_at` to the version type. `page.tsx` imports `RecipeSnapshot` in this same task.
     - `RecipeDraft = { numbers: Record<RecipeNumberKey, string>; notes: string; lines: IngredientLine[]; mashSchedule: MashStep[]; fermentationSchedule: FermentationStage[]; water: WaterDraft }`.
     - `versionToDraft(s: RecipeSnapshot): RecipeDraft | null` returns null when there is no version. A percent is `String(Number((f * 100).toPrecision(12)))`, never `Math.round`. Numeric strings are coerced with `Number`.
     - `versionNumbers(v)` gives the eight process strings. The read page and the mapper share it, so `pct` and `str` leave the page.
     - `draftBlocker(input): string | null` names the first unmet requirement in this order: name (when creating), an ingredient, a mash step, efficiency, attenuation. Task 8 wires it in.
   - Reuse: `IngredientLine`, `WaterDraft` and `EMPTY_WATER` from `recipe-process-view.ts`. No new list type.
   - Accept: vitest, tsc.

4. **Read-page model (QW2-5, QW8, QW16, QW18, QW19).** Needs: 1, 2, 3.
   - Test first: `tests/recipe-view.test.ts`. Cases:
     - The title carries the version.
     - A six-decimal line prints "40.9 lb / bbl".
     - The mash title says "1 step".
     - An empty fermentation schedule reads "No stages yet".
     - The water title is "Water".
     - The Saved date is in the brewery's zone.
     - A missing extract gives the saved-version warning instead of Predicted.
     - A gallon mash line gives the unit text.
     - The draft text is present tense.
   - Add `toRecipePageModel(s: RecipeSnapshot, ctx: { materials: RecipeMaterial[]; profiles: { id: string; name: string }[]; unit: GravityUnit; timeZone: string }): RecipeViewModel` to `lib/mgr/recipe-view.ts`, after `toRecipesViewProps`. The page stays a fetch and a render.
   - What the model does:
     - Ingredient rows: `ingredientDetail(stage, timing, perBblDisplay(Number(i.per_bbl_qty)), unit)`. The format is applied at the call site.
     - Mash: the title `Mash schedule · ${plural(n, "step")}`, the detail `mashRowSummary`, the rows `mashStepDetail`.
     - Fermentation: the title uses `plural(n, "stage")`, and the detail is `fermentationSummary`, or "No stages yet" when empty.
     - Water: the title is "Water", with no "N additions" detail. `processReadout` prints the target once.
     - `saved` is `formatDate(created_at, timeZone)` from `lib/date-format.ts`.
     - `note` is the recipe note.
     - `predicted`, or the blocker text when `gravityBlockers` names lines.
   - `gravityBlockerText(blockers, nameOf, unitOf, { saved: boolean }): string` names the first blocker. Two callers: this model and the draft (task 10). The texts:
     - Saved, missing value: "<name> had no extract potential when this version was saved; set it under Materials, then create the next version."
     - Draft, missing value: "<name> has no extract potential; set it under Materials."
     - Either, wrong unit: "<name> is stocked in <unit>, which has no weight, so nothing is predicted."
   - Contract change: delete `RecipeViewModel.parent` and add `saved?: string` and `note?: string`. In the same task:
     - Remove `parent` from `page.tsx`'s model literal.
     - Remove `parent` from `recipe-brand-picker.tsx`'s props.
     - Remove `model.parent` from `recipe.tsx:53`.
   - Accept: vitest, tsc.

5. **Kept draft storage (decision 6, BIG6).** Needs: 3.
   - Test first: `tests/recipe-draft.test.ts`. Cases:
     - A round trip.
     - Another version id gives `{ draft, stale: true }`.
     - A null base round-trips.
     - Malformed JSON throws.
     - The key names actor, brewery and recipe.
   - New `lib/mgr/recipe-draft.ts`, after the `lib/mgr/pick-counts.ts` pattern. Module comment.
     - `recipeDraftKey(context: CommandContextExpectation, recipeId: string)` gives `mgr:recipe-draft:<actor>:<brewery>:<recipe>`.
     - A zod schema for `{ baseVersionId: string | null; draft: RecipeDraft }`.
     - `readRecipeDraft(saved: string | null, baseVersionId: string | null): { draft: RecipeDraft; stale: boolean } | null` returns null when nothing is stored. A draft based on an older version comes back with `stale: true` rather than being dropped (negative 5).
     - `writeRecipeDraft(storage, key, baseVersionId, draft)`. It throws on a storage failure, and the form shows the error (`pick-form.tsx:50-55`). Clearing calls `storage.removeItem(key)` directly, as `pick-form.tsx` does. There is no wrapper.
   - A malformed record throws on parse. The form catches it, removes the key and says "Your saved draft could not be read; starting from the current version." Falling back to the server version is safe because that is the base the brewer started from. Write that reason beside the catch.
   - Reuse: `pick-counts.ts` is shaped for pick lines and cannot hold a recipe. `portal-working-cart` uses localStorage and portal scope. A recipe draft needs its own schema, so this is a sibling, not a copy.
   - Accept: vitest, tsc.

6. **Recipe and POS hints stop interrupting screen readers (QW24, narrowed).** Needs: none.
   - Test first: `tests/e-hint-roles.test.ts` (new, `renderToStaticMarkup`).
     - `RecipeView`'s Predicted renders inside `role="status"`.
     - The POS result renders inside an always-mounted `role="status"` container, and its error inside `role="alert"`.
   - Scope: `E.note` and `E.info` keep their `Alert` (`role="alert"`). A global `role="note"` would change 225 calls in 91 files. At least 11 of those show errors, which must stay assertive (`account-invitations.tsx:10`, `accounting.tsx:25,58`, `pos.tsx:39`, `chat.tsx:36,40,159,171`, `settings/accounting/page.tsx:20`, `format.tsx:71`). That sweep is the issue filed in task 17.
   - This PR changes three things:
     - The Predicted line on the recipe page (task 8).
     - `pos-controls.tsx` ~:60-62 and ~:100-101: the success text moves into an always-mounted `<div role="status">`, and errors keep `E.note`'s alert.
     - The draft blocker, which renders as plain `E.fld`/`E.info` text in a status region (task 8).
   - Accept: vitest, tsc, lint; `tests/pos-ui.test.ts` stays green.

7. **`E.searchPick` (QW22 step 2).** Needs: none.
   - Test first: `tests/search-pick.test.ts`. Cases:
     - The trigger shows the picked label, the placeholder when empty, and `selectedLabel` for a retained value.
     - Options carry their label as a keyword.
     - Pending feedback does not say "No matching".
   - These stay green: `tests/priced-sku-feedback.test.ts`, `tests/new-order-page.test.ts`, `tests/edit-draft-page.test.ts`.
   - New `components/mgr/search-pick.tsx` starts with `"use client"` and a module comment (the `qty.tsx:11` and `date-picker.tsx:3` pattern). `e.tsx` imports server-rendered pages, so without the directive only `next build` would catch it.
   - It holds the searchable core of `OrderSkuPicker` (`new-order.tsx:30-39`) as a function returning the `CommandForm` element. Props: `title`, `placeholder`, `searchPlaceholder`, `emptyMessage`, plus all of the current ones (`selectedLabel`, `feedback`, `optionsReady`, `errorId`).
   - `OrderSkuPicker` calls that function with the SKU copy, so it still returns the `CommandForm` element. `priced-sku-feedback.test.ts:76-106` keeps reading `props.trigger` and `props.children`. Its three callers are unchanged.
   - Add `E.searchPick(label, value, options, controls?)` to `e.tsx` beside `E.pick`.
   - Reuse:
     - This is the existing picker moved, not a new one.
     - The Entity picker does not fit, because `search_entities` has no material kind.
     - The shadcn `Combobox` (`brewery-settings-form.tsx:22-46`, `ai-model-settings.tsx:27-45`) was passed over. The SKU picker already runs inside a sheet on Edit draft order, so the `CommandForm` core is the only one proven in that spot.
   - Accept: vitest, tsc, lint.

8. **RecipeView read-out and draft blocker (QW2, QW5, QW6, QW8, QW10, QW11, QW12, QW16, QW24).** Needs: 3, 4, 6.
   - Test first: `tests/new-recipe.test.ts`. Cases:
     - A cut version renders `/<dt[^>]*>Pre-boil volume bbl<\/dt>/` and `<dd…>16.8</dd>`, with no `<input`.
     - An empty recipe and a versioned one each have exactly one "Create recipe version", in the title row, both with and without `readOnly`.
     - A live page has no "Default price group".
     - The `blocked` text shows and the submit is disabled.
     - There is no `<ol` without a tape.
     - The Recipe note row shows when `model.note` is set.
   - Also in `tests/mgr-screens.test.ts`: change "Notes" at :64 to "Version note", and check the headings are present.
   - `components/mgr/views/recipe.tsx`:
     - Read-only numbers: `RECIPE_NUMBERS.filter(([k]) => model[k]).map(([k, label]) => E.fld(label, model[k]))` replaces the disabled `E.cols` grid. Remove the `disabled` branch of `bind`.
     - Version note: `E.fld("Version note", …)` only when it has text. The draft field is labelled "Version note".
     - Headings: `E.ttl("Ingredients")` and `E.ttl("Process")` on every surface. The read-out of `schedule()` draws `E.ttl(s.title)`, then its rows, then `E.info(s.detail)` when there is a detail (the `MashScheduleView` order).
     - Title-row verb: every model without `controls` (the live read page and the inventory frame alike) passes `E.btn("Create recipe version", "p", model.createHref)` as `E.back`'s action, and draws no bottom copy. The draft (`controls` set) keeps its bottom submit. This keeps the explorer frame and the live page identical, and gives PR B one place to put Schedule batch.
     - Head:
       - `E.row("Recipe note", model.note)` when there is a note. Then the inventory frame shows it too.
       - Then `E.fld("Saved", model.saved)`.
       - Then `predicted`, inside an always-mounted `<div role="status">`.
     - Price group: the picker when `priceGroupOptions` is set, otherwise nothing (no `E.gated`).
     - Tape: `model.tape?.length ? E.tape(model.tape) : null`.
     - Contract change: `RecipeControls.ready` becomes `blocked?: string`, and disabled derives from it. `E.info(controls.blocked)` renders before `CommandFormMessage` (the `edit-draft-order.tsx:69` order). In the same task, `recipe-version-form.tsx:80,105` passes `blocked: draftBlocker(…)` in place of `ready`.
     - Header comments at `recipe.tsx:1-7` and `:38` describe the read-out, not "the same drawing read-only".
   - Accept: the pure inventory tests, tsc, lint.

9. **Read page and brand picker (QW7, QW8).** Needs: 4, 8.
   - Test first: a source assertion in `tests/recipe-view.test.ts`. The page imports `toRecipePageModel`, and the picker has no `disabled: busy`.
   - `app/(app)/recipes/[id]/page.tsx` calls `toRecipePageModel`. Its local `pct` and `str` go.
   - `recipe-brand-picker.tsx`:
     - Props become `{ recipeId, brandId, brands }`. The note now lives in `RecipeView` (task 8).
     - Drop `disabled: busy`. Ignore a pick while busy.
     - On success, `toast.success("Brand saved")` (the `ai-model-settings-form.tsx` pattern; Sonner's polite live region).
     - Add `E.info("Saves when you pick. Batches already scheduled keep their brand.")`. No pre-fill promise.
   - Leave the regex at `page.tsx:47` alone; it keeps process scalars out of the Water rows.
   - Accept: tsc, lint, vitest; `/browse` on a Example Brewing-imported recipe.

10. **Copy-forward draft and kept draft (QW1, QW3 draft, QW11, QW18, decision 6).** Needs: 3, 4, 5, 8.
    - Test first, two parts:
      - `tests/recipe-draft.test.ts`: `shouldKeepDraft(initial, current)` is false for an untouched copy, so no notice appears on return.
      - `tests/new-recipe.test.ts` source assertions: the new page passes `initial`, and the form imports `readRecipeDraft` and `writeRecipeDraft`.
    - `app/(app)/recipes/[id]/new/page.tsx` keeps the whole `get_recipe` result. It passes `initial={versionToDraft(snapshot)}` and `baseVersionId` (null when there is no version).
    - `RecipeEditor` (`recipe-version-form.tsx`):
      - An optional `initial?: RecipeDraft` seeds every `useState`. Without it (no version, or `/recipes/new`), the blank defaults stay.
      - On mount, read `sessionStorage` through `readRecipeDraft` in an effect (the `pick-form.tsx` order). A hit replaces the state.
      - The notice is `E.info("Restored your unsaved draft")`. A stale draft reads "Restored your unsaved draft, based on v<n>; the recipe is now on v<m>." Both come with `E.btn("Start over", "g", undefined, …)`, which removes the key and reseeds from `initial`, or from the blank defaults when there is none.
      - Write the draft from the state setters, not an effect (the `pick-form.tsx:76-81` pattern), so mounting never writes. A write failure sets the form error.
      - Remove the key in the `create_recipe_version` success callback, before `router.push`.
      - The preview shows `gravityBlockerText(…, { saved: false })` only when blockers exist.
      - Row titles use `plural()` and `mashRowSummary`. An empty fermentation schedule reads "No stages yet". The water row title is "Water".
    - `/recipes/new` (no recipe id yet) does not keep a draft. Decision 6 says per recipe, and there is no key until the recipe exists. This is stated in the guide.
    - The header comments of all three files say the draft starts as a copy of the current version.
    - Accept: tsc, lint, vitest. `/browse`:
      - Open the draft, change one dry hop, go back, return, and see the notice.
      - Start over.
      - Open and leave without editing: no notice.
      - Save, and confirm the key is gone.

11. **Schedule views: header slot, row tap, names (QW18-21).** Needs: 2.
    - Test first: `tests/interactive-view-slots.test.ts` and `tests/water-view.test.ts`.
      - `interactive-view-slots`: `back={null}` draws no header, and a passed node replaces it. The labels "Move Saccharification up" and sr-only "Edit Saccharification" are present.
      - `water-view`: with `sourceProfileId: ""`, the option reads "No source".
    - In `components/mgr/views/mash-schedule.tsx`, `fermentation-schedule.tsx` and `water.tsx`:
      - Contract change: replace `createAction` with `back?: ReactNode`, tested with `!== undefined` (the `price-group.tsx:39` pattern). The inventory keeps `E.back`. In the same task, `schedule-sheets.tsx:48,56` passes `back={p.add}` and the Water sheet passes `back={null}`.
      - `rowVerbs` becomes `listRow(title, detail, index, count, verbs)`. With `onEdit`, the row wrapper's `onClick` opens the editor and ignores clicks that land on a button. No buttons nest, and `TAP_ROW` is unchanged.
      - Edit carries an sr-only row title (the `app/(app)/pricing/barcode-form.tsx` pattern). The arrows are shadcn `Button variant="ghost" size="icon-sm"`, labelled "Move <title> up/down", with `data-row-index`.
      - Mash rows use `mashStepDetail`.
      - `WaterView`: delete the single-caller `sourceDefault` prop and its argument at `screens.tsx:2120` in the same task. The source option reads "No source". Fix the comment at `water.tsx:3`.
    - Accept: the pure inventory tests plus `water-view.test.ts`, tsc, lint.

12. **Focus after a move, ingredient Edit name (QW21).** Needs: 10, 11.
    - Test first: a source assertion in `tests/interactive-view-slots.test.ts` that `ListSheet` focuses through `data-row-index`. Focus itself is checked with `/browse`: move a step twice with the keyboard, and focus stays on it.
    - After a move, `ListSheet` (`schedule-sheets.tsx:38`) focuses the moved row's arrow, or its Edit when the arrow is gone. It does this through `data-row-index` and `requestAnimationFrame` (the `composer.tsx:110` precedent).
    - The ingredient Edit at `recipe-version-form.tsx:94` gets the same sr-only name.
    - Accept: tsc, lint, vitest.

13. **Ingredient sheet fields (QW22, QW23).** Needs: 7, 12.
    - Test first: `tests/new-recipe.test.ts`. Cases:
      - `IngredientView` with no material shows "Choose a material".
      - An option with a category reads `name · category`; one without reads `name`.
      - The label's `for` equals the input `id`, and the label names the unit.
      - `resolveTap` on the Ingredient record treats the material trigger as inert.
    - `components/mgr/views/ingredient.tsx`:
      - Material uses `E.searchPick` with the placeholder "Choose a material".
      - Options read `name`, plus ` · category` only when a category is present (the `cellar-addition.tsx:31` pattern).
      - `IngredientMaterial` gains `category?: string`. `sheetMaterials` (`recipe-version-form.tsx:82`) passes it. Give the `screens.tsx` Ingredient fixture categories.
      - `useId()` links `FieldLabel htmlFor` to the `id` control of `E.edit(…, "number")`. The label reads "Quantity per bbl (<unit>)" (the `volume-field.tsx` pattern).
      - Do not touch the timing field: PR D turns it into a Day for dry hop.
    - In `lib/mgr/screen-links.ts`, add an inert rule for the Ingredient material trigger, like `/^Line \d+ SKU$/` at :255. Otherwise "Material" resolves to the Material screen. Inventory rows without `onEdit` keep a plain "Edit", so the existing `to` keys still resolve.
    - Fallback: if the nested dialog fails the phone-width browse check, ship `E.pick` with a `{ value: "", label: "Choose a material" }` first option (the `water.tsx:62` pattern) and report it.
    - Accept: tsc, lint, vitest; `/browse` the sheet at phone and desk widths.

14. **Recipes list (QW17).** Needs: none.
    - Test first: `tests/production-view.test.ts:228-231`. The title is "Hazy IPA v1" with no `verb`, and a recipe with no version warns.
    - `lib/mgr/recipes-view.ts`:
      - `RecipesSnapshot.recipes` items gain `latest_version: number | null`.
      - The title is `<name> v<n>`, or the detail "no version yet" with the warning class.
      - Remove `verb` and `tone`.
    - `components/mgr/views/recipes.tsx` renders `E.nav(title, detail, warning ? "w" : "", undefined, href)`.
    - `app/(app)/recipes/page.tsx` passes `latest_version`, which `list_recipes` already returns.
    - Inventory:
      - Update the `recipesList` fixture (`lib/mgr/fixtures/production.ts:128-134`) and drop its "draft version" row.
      - In the Recipes record (`screens.tsx:2009-2014`), remove the dead `Review` and `Finish` keys. Replace the state "Finish is the next action" with "no version yet". The spec no longer says the row "names the next action".
      - Add `to` entries for the row titles if `tests/tap-coverage.test.ts` asks for them.
    - Update the header comments of `recipes.tsx` ("inventory draws Create recipe and Review") and `app/(app)/recipes/page.tsx` ("version-editing page").
    - Accept: the pure inventory tests, tsc, lint.

15. **Inventory Recipe frame (QW25 without the dry-hop part, QW16, decision 2).** Needs: 2, 4, 8, 11.
    - Test first: `tests/mgr-screens.test.ts`. Cases:
      - The frame's water row is "Water", and its source reads "Municipal · Denver" (:89).
      - Saved shows.
      - The spec no longer says "schema gate".
      - The states list the three new ones.
    - `tests/screen-links.test.ts` stays green.
    - Move `MASH_STEPS`, `FERM_STAGES` and `WATER_HAZY` (`screens.tsx:305-328`) into `lib/mgr/fixtures/production.ts`.
    - Build `recipeHazyV4`'s mash, fermentation and water rows with task 2's and task 4's helpers. The fermentation detail calls `fermentationSummary(FERM_STAGES, 4)` until PR D removes the parameter. The dry-hop ingredient row and `dryHopDay={4}` stay for PR D.
    - Set `WATER_HAZY.sourceProfileId` to `"denver"`.
    - Give the fixture `saved` (for example "Aug 28, 2026") and `note`.
    - Recipe record:
      - Rename the water `to` key to "Water".
      - Add the states `no version`, `draft` and `frozen`, and drop "no price group".
      - Replace "Versioning is disabled behind its schema gate" with "The page shows the newest version; each batch's Brew day keeps the plan it was brewed from."
    - Accept: the pure inventory tests, tsc, lint.

16. **Staff guide (QW26 and every visible change).** Needs: 8-15.
    - Test first: `tests/docs.test.ts` and `tests/design-docs.test.ts` stay green.
    - `content/docs/staff-guide.mdx`, Recipes section (~639-647). No em dashes.
    - Recipe page:
      - Replace "the recipe page is its editor". The page shows the newest version, read only, with section headings and its schedules listed inline. It shows when the version was saved. A batch's Brew day keeps the plan it was brewed from.
      - **Create recipe version** sits on the title row and opens a copy of the current version; change what you need and save.
      - The prediction names the ingredient that blocks it and how to fix it.
      - Quantities show three significant digits; the draft shows what you typed.
      - Brand: say "Saves when you pick" once (:643); a confirmation appears.
      - Default price group: drop it from the "locked for now" sentence.
      - Water: "No source" when none is set.
    - The draft:
      - A draft you leave is kept in that browser tab. Coming back shows "Restored your unsaved draft" and **Start over**. Saving clears it. A new recipe's first draft is not kept.
      - The draft names what is missing when **Create recipe version** is disabled.
      - Describe the "+ add ingredient" row and each ingredient's **Edit** (add, edit, delete). Steps, stages and additions also move. There are three sheet rows, not four.
      - Material search in the ingredient sheet; tap a schedule row to edit it.
    - Recipes list rows show the version; a recipe with no version says so.
    - Accept: those tests.

17. **File the three issues (decisions 2 and 7, task 6 scope).** Needs: none.
    - Search first and report duplicates instead of filing:
      - `gh issue list --state all --search "recipe version picker"` and `--search "recipe version history"`.
      - `gh issue list --state all --search "recipe default price group"` and `--search "default_price_group_id"`.
      - `gh issue list --state all --search "E.note role alert"` and `--search "screen reader hint"`.
    - File:
      - "Recipe page: view an older version". It needs a picker; `get_recipe` takes an optional version, and `list_recipes` already reads every version.
      - "Wire the recipe default price group picker and its packaging pre-fill together". See price-groups spec D6: the column exists, and nothing reads it.
      - "Static E.note/E.info hints announce as alerts". 225 calls, of which 98 are conditional. The error sites named in task 6 must stay assertive.
    - Link all three in the PR description.

18. **Simplify, prove, describe.** Needs: all.
    - Run `/simplify` over the diff, including the Haiku check on every changed function. Then re-run the proof, and check `git diff` for stray bytes.
    - The PR description has one progress line and `API: none`, since no command changed. It has no `TODO:` line, because no `TODO.md` item matches; re-check that at PR time.

## Proof

This PR is screen-only: no schema, RPC or command changes. No migration, no
`bun run migrations:lock`, no generated types, no `bun run docs:api`.

```
bunx tsc --noEmit && bun run lint
bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts \
  tests/recipe-gravity.test.ts tests/recipe-process-view.test.ts tests/recipe-view.test.ts tests/recipe-draft.test.ts tests/e-hint-roles.test.ts tests/search-pick.test.ts \
  tests/new-recipe.test.ts tests/interactive-view-slots.test.ts tests/water-view.test.ts tests/production-view.test.ts \
  tests/new-order-page.test.ts tests/edit-draft-page.test.ts tests/priced-sku-feedback.test.ts tests/pos-ui.test.ts
```

Then run `/browse` (session `feat-recipe-page-usability`) at phone and desk
width:

- `/recipes/<id>`: headings, read-out, Saved, the verb on the title row, no price-group row, no empty list, and a blocker reason when an ingredient lacks extract potential.
- `/recipes/<id>/new`: the draft is seeded from the version. Leaving and returning restores it. Start over works. An untouched visit shows no notice. Saving clears it.
- The ingredient sheet: material search inside the sheet; the label and unit.
- A schedule sheet: a row tap opens the editor; a keyboard move keeps focus.
- `/recipes`: the version in each title; the whole row is the link.
- `/docs/screens-explore`: the Recipe frame and its states.

CI runs the full suite on push.

## Docs

- `content/docs/staff-guide.mdx` (task 16).
- Module comments on the two new files.
- Header comments: `recipe.tsx`, `recipes.tsx`, `recipes/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `recipe-version-form.tsx`, `recipe-brand-picker.tsx`, `water.tsx`, `mash-schedule.tsx`, and the `OrderSkuPicker` comment in `new-order.tsx`.
- The Recipe and Recipes record specs and states in `screens.tsx` (tasks 14 and 15).
- No API docs: no operation changes.

## Open questions

None blocking. Task 13's browse check decides between `E.searchPick` and
the placeholder fallback; the PR reports which shipped.

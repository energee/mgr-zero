# Recipe as one brewsheet page

Status: Phase 1 plan, awaiting approval. Branch `feat/recipes`, worktree
`.agents/worktrees/feat-recipes`, PR to `main`. Checked against `origin/main`
fc6c7a9bc.

## Why

The owner asked for three things:

1. One page. Today `/recipes/<id>` is a read-out and `/recipes/<id>/new` is a
   separate form.
2. A version concept that needs no explaining. Today the page shows
   `v1 v2 (current)` links, "New recipe version", "Create recipe version" and
   "Older version · read only".
3. A page that reads like a brewsheet, in brew-day order. Today it is a flat
   ingredient list, then a grid of eight process numbers.

## What the brewer sees

**One page that is always the editor.** `/recipes/<id>` opens the recipe with
every field live. Nothing is written until **Save changes**. A bar with
**Save changes** and **Discard** appears only once the page differs from what
is saved. The bar also says what is still needed (`draftBlocker`). An unsaved
change survives leaving the page in the same tab, as it does today.

**No "version" on screen.** The brewer changes the recipe and saves. Each save
still writes a frozen copy underneath (`create_recipe_version`), so a batch
keeps exactly what it was brewed from. The page never says "version" or "v4".

**History is told by batches.** Under the sheet, **As brewed** lists each
earlier copy that a brewed batch used, newest first:
`BAT-0041 to BAT-0045 · 5 batches · Oct 1 – Nov 2`. A copy nobody brewed is not
listed. A row opens that copy read only at `?v=N`, with one action,
**Use this again**. That action opens the current page with the old copy
loaded as an unsaved change.

**Brew-day order.** The sheet runs top to bottom as the day does. Each
ingredient sits under the step that uses it, and each process number sits in
its step.

| Section | Process numbers | Ingredient stages | Opens |
|---|---|---|---|
| Header | Predicted OG, FG, ABV and IBU; Show totals at | | Brand picker |
| Water | | | Water sheet |
| Mash | Brewhouse efficiency | `mash` | Mash schedule sheet |
| Boil | Pre-boil volume, boil time | `boil` | |
| Whirlpool | Time, temperature, rest | `whirlpool` | |
| Knockout | Temperature | | |
| Fermentation | Yeast attenuation | `fermentation`, `dry_hop` | Fermentation schedule sheet |
| Packaging and other | | `packaging`, `other` | Drawn only when it has a line |
| Change note | | | |
| Batch actuals | | | |
| As brewed | | | |

## Wording changes

| Today | After |
|---|---|
| New recipe version (title row) | removed |
| Create recipe version (submit) | Save changes |
| Version note | Change note · optional |
| `Hazy IPA v4` (title) | `Hazy IPA` |
| Versions `v1 v2 (current)` | As brewed, one row per earlier brewed copy |
| Older version · read only | As brewed in BAT-0041 to BAT-0045 · read only |
| Batch actuals row `BAT-0041 · v3 · Oct 12` | `BAT-0041 · Oct 12`, plus `earlier recipe` when not the current copy |
| No version yet (recipe page) | the blank sheet, ready to fill |

Command names and the HTTP API keep "version". That is the integrator's word
and nothing there changes.

## Not in this PR

- No schema, RPC or command change. `DOCS` applies; `API: none`.
- No rename of `recipe-version-form.tsx`. The name goes stale; a rename is a
  move and needs its own approval.
- No editing of a recipe's name or note after creation. No command does that
  today.
- No compare view between two copies.

## Open questions for the owner

1. **Scheduled batches keep the copy they were scheduled with.** After a
   save, a batch already on the calendar still brews the earlier recipe. With
   versions hidden that will surprise. Fixing it means moving unbrewed batches
   to the new copy on save, which is an RPC change. Recommendation: do it as
   the next PR, not here.
2. **Recipe name and note are fixed after creation.** Should a follow-up add
   an edit for them?

## Known ceiling

Two people who edit one recipe at once both save. The later save is the
current recipe. The earlier one is kept but not listed unless a batch brewed
it. That is today's behavior.

## Files touched

| File | Tasks |
|---|---|
| `lib/mgr/recipe-view.ts` | 1, 2 |
| `components/mgr/views/recipe.tsx` | 3 |
| `app/(app)/recipes/[id]/recipe-version-form.tsx` | 4, 6 |
| `app/(app)/recipes/[id]/page.tsx` | 5, 6 |
| `app/(app)/recipes/[id]/new/page.tsx` (deleted) | 5 |
| `app/(app)/recipes/[id]/schedule-sheets.tsx` | 4 |
| `lib/mgr/recipe-draft.ts` | 4 (comment only) |
| `lib/mgr/recipes-view.ts`, `components/mgr/views/recipes.tsx`, `components/mgr/views/schedule-batch.tsx`, `lib/mgr/nav.ts` | 7 |
| `lib/mgr/fixtures/production.ts`, `components/mgr/screens.tsx`, `lib/mgr/screen-links.ts`, `lib/mgr/screen-routes.ts` | 8 |
| `content/docs/staff-guide.mdx` (Recipes, about lines 1033–1068) | 9 |

## Tasks

Each task names its test first and starts by watching it fail. UI rendering is
the exception: test the logic below the component, then look at the page with
`/browse`. Every task leaves `bunx tsc --noEmit` clean.

Order: 1 and 2 run in parallel. 3 needs both. 4 needs 3. 5 needs 4. 6 needs 5.
7 runs in parallel with 3–6. 8 needs 3 and 7. 9 and 10 come last.

1. **Sections.** Test first: `tests/recipe-view.test.ts`.
   - Types: `RECIPE_SECTIONS`, a constant list of
     `{ key, title, stages: IngredientStage[], numbers: RecipeNumberKey[] }` in
     the order of the table above. `RecipeIngredientView` gains
     `stage: IngredientStage`. The view groups lines by stage; no section is
     stored on a line.
   - Accept: every `INGREDIENT_STAGES` entry and every `RECIPE_NUMBERS` key
     belongs to exactly one section.

2. **History and titles.** Test first: `tests/recipe-view.test.ts`,
   `tests/recipe-outcomes-view.test.ts`.
   - `recipeHistory(outcomes, shownVersion, latestVersion)` returns
     `{ title, detail, href, selected }[]`: one row per earlier copy with a
     brewed batch, newest first, from `RecipeOutcome.version`, `batchNo` and
     `brewedOn`. It reuses `batNo`, `plural` and `formatDate`.
   - `RecipeViewModel`: `versions`, `historical`, `createHref` and `empty` go.
     `history` and `asBrewed` (the read-only note's text) arrive.
   - `recipePageTitle` returns the recipe's name. `outcomeTape` drops `vN` and
     marks a batch of another copy `earlier recipe`. `gravityBlockerText`'s
     saved wording loses "create the next version".
   - Accept: no batch gives no history; two copies with batches give one row
     for the earlier one; an unbrewed copy gives none.

3. **The sheet.** Test first: `tests/mgr-screens.test.ts` (drawn text).
   File: `components/mgr/views/recipe.tsx`.
   - Draw the sections from `RECIPE_SECTIONS`: heading, that section's numbers,
     its lines, its schedule row, and an add row that opens the Ingredient
     sheet on that stage.
   - `RecipeControls` gains `dirty: boolean` and `onDiscard`. The save bar is
     drawn only when `dirty`, or always while a recipe is being created.
   - Title row: **Schedule batch** when saved and not dirty. No other verb.
   - Read only (`?v=N`): the `asBrewed` note and **Use this again**.
   - Accept: the frame's text holds the section headings in order and no
     "version".

4. **Editor binds the sheet.** Test first: `tests/recipe-draft.test.ts`
   (`shouldKeepDraft` drives `dirty`; a draft loaded from an earlier copy is
   dirty). Files: `recipe-version-form.tsx`, `schedule-sheets.tsx`.
   - `RecipeEditor` takes the page's extra model parts (brand picker, saved
     date, tape, history, schedule link) and an optional `loaded` draft for
     **Use this again**.
   - Save runs `create_recipe_version`, clears the kept draft and refreshes the
     page. The page keys the editor by version id, so it remounts on the new
     copy.
   - The restored-draft notice drops "v4".
   - Accept: vitest, tsc.

5. **One route.** Test first: `tests/screen-links.test.ts`,
   `tests/tap-coverage.test.ts`.
   - `app/(app)/recipes/[id]/page.tsx` renders `RecipeEditor` on the current
     copy (`versionToDraft`), and the read-only `RecipeView` when `?v=N` names
     an earlier one.
   - Delete `app/(app)/recipes/[id]/new/page.tsx` and its entry in
     `screen-routes.ts`.
   - A recipe with no copy yet opens the blank sheet.
   - Accept: `/recipes/<id>/new` is not found; browse a save on the test stack.

6. **Use this again.** Test first: `tests/recipe-view.test.ts`
   (`versionToDraft` of the earlier copy is what loads).
   - `/recipes/<id>?from=N` reads copy N beside the current one and passes it
     as `loaded`. The page says which batches it came from.
   - Accept: browse: open an earlier copy, Use this again, Save changes, and
     the sheet shows the old amounts as current.

7. **Wording outside the page.** Test first: `tests/new-recipe.test.ts` and the
   test covering `toRecipesViewProps`.
   - Recipes list rows drop the version number. "No version yet" becomes
     "Not written yet".
   - New batch sheet: "No recipe versions available" becomes "No recipes
     available".
   - `nav.ts`: "Write recipes and their versions" becomes "Write and change
     recipes".

8. **Inventory.** Test first: `tests/mgr-screens.test.ts`,
   `tests/screen-links.test.ts`, `tests/screen-persona.test.ts`.
   - `recipeHazyV4` fixture gains stages and history, and loses versions.
   - The Recipe and Recipes records in `screens.tsx`: `to`, `job`, `states`
     and `spec` describe one page, Save changes and As brewed.
   - `screen-links.ts`: drop "New recipe version", the `v\d+` title pattern and
     the version links; add the As brewed rows.

9. **Staff guide.** Test first: `tests/docs.test.ts`, `tests/design-docs.test.ts`.
   Rewrite the Recipes section of `content/docs/staff-guide.mdx` for one page,
   Save changes, As brewed and Use this again.

10. **Proof and review.** `bunx tsc --noEmit`, `bun run lint`, the screen proof
    list in `AGENTS.md` plus `tests/recipe-view.test.ts`,
    `tests/recipe-draft.test.ts`, `tests/recipe-outcomes-view.test.ts` and
    `tests/new-recipe.test.ts`. Browse the page at desktop and phone width and
    check the save bar clears the phone's bottom navigation. Then `/simplify`,
    the Haiku check, and the proof again.

# Brew day revamp: Prep pull list, process timeline, pack quantities

Status: Phase 1 plan, awaiting approval. Branch `feat/brew-day-revamp`, PR to `main`.
Clickable prototype: https://claude.ai/artifact/Mnw4PUb8xVkFeRhW4SKs2o (private; shared by the owner).
Line numbers are from `origin/main` 802636c0.

## Goal

The batch page (`app/(app)/batches/[id]/page.tsx`, view `components/mgr/views/brew-day.tsx`) asks for the wrong things in the wrong order:

- Vessel, knockout barrels and date come first, though knockout is the last fact a brewer has.
- The pinned plan (per bbl, collapsed) and the actuals ("Material source 1…7", batch totals) are far apart.
- Every actual row has a Stage picker, though the recipe owns the stage.
- Nine process fields are one flat list, out of process order (`brew-day.tsx:11`).
- Picking lots (a warehouse task, done ahead) and logging the brew (live, on the deck) share one form.
- Quantities ignore the pack a material comes in, so 110 lb never reads "2 × 55 lb".

## Decisions (owner, 2026-10-22)

| Decision | What it means |
| --- | --- |
| Combine prototype options A, C and D | Two tabs, **Prep** and **Brew day**. Brew day is a timeline by stage with one-tap confirm. Phone stages fold so one is open. No step-by-step wizard. |
| Prep is the order pick format | Same layout as `PickView` (`components/mgr/views/pick.tsx`): stage headings, lines start at plan, touch only exceptions, amber when short, **Print pull list**, **Done pulling**. |
| Prep is saved | Lots and pulled amounts persist on the batch, so Brew day opens prefilled and the pull list can be done the day before. This needs a migration. |
| Pack size is the material's one purchase pack | `materials.purchase_uom` and `purchase_uom_factor` already hold it (8 dev materials are `each × 55 lb`). No pack label, no second pack size. |
| Decimals and loose pounds | A pull is entered as packs (decimals allowed, 4.4) plus optional loose pounds for a partly used bag. |
| No open-bag tracking | Inventory stays in base units. A partly used bag is just pounds; no per-bag records. |
| Recipes share the pack math | The recipe page shows batch totals in packs and offers rounding to whole packs in the draft editor. |

## Reuse

| Need | Existing piece |
| --- | --- |
| Pack size | `materials.purchase_uom_factor`; receiving already multiplies it (`app/(app)/purchase-orders/[id]/po-actions.tsx:66`, `lib/mgr/receipt-view.ts:104`) |
| Exact quantity arithmetic | `toTicks` / `fromTicks` (`lib/mgr/quantity-input.ts`) |
| Plan → actual prefill, exact sources | `brewPlanActuals`, `brewSourceKey`, `canRecordBrewDay` (`lib/mgr/brew-day-view.ts`) |
| Brew-day stages | `BREW_DAY_STAGES` (`lib/mgr/recipe-process-view.ts:15`) |
| Pick layout, stage group headings | `PickView`; the `group` heading per line comes from `feat/confirm-adjust-grouped-pick` (unmerged) |
| Recording | `record_brew_day`, `correct_brew_record` (`lib/commands/production.ts:316`, `:339`), unchanged |
| Plan read | `get_brew_day_plan` RPC (`supabase/migrations/20260928090000_brew_records.sql:85`), extended |
| Quantity input | `components/mgr/qty.tsx`, via `E` |

## Out of scope

| Item | Why |
| --- | --- |
| Pack label ("bag", "box") | Owner chose "2 × 55 lb"; add a column when asked |
| Several pack sizes per material | One `purchase_uom_factor` covers today |
| Open-bag inventory | Owner declined |
| Fermentation, dry-hop, packaging additions | Stay in cellar; Prep shows them as one "Later, in cellar" row |
| Brew plan sheet rows from `feat/brew-day-recipe-targets` (stale, no PR) | That plan's Brew day part is replaced by this timeline; its New batch brand fill and Schedule batch link stay its own work |
| Reserving stock when Prep is saved | Prep is a draft; stock moves only on **Record brew day** |

## Migration

File: `supabase/migrations/20261022120000_brew_pulls.sql` (later than main's newest, `20261022063300`).
Run `bun run migrations:lock` after adding it.

```sql
-- Prep: the lots and amounts pulled for a planned batch, and the tank it is meant for.
-- A draft only: nothing here moves stock; record_brew_day still consumes.
alter table public.batches add column planned_vessel_id uuid references public.vessels(id);

create table public.brew_pulls (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references public.breweries(id),
  batch_id uuid not null references public.batches(id) on delete cascade,
  recipe_ingredient_id uuid references public.recipe_ingredients(id),
  material_id uuid not null references public.materials(id),
  location_id uuid not null references public.locations(id),
  bin_id uuid not null references public.bins(id),
  lot_id uuid references public.material_lots(id),
  qty numeric not null check (qty >= 0),
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index brew_pulls_batch on public.brew_pulls (batch_id);
alter table public.brew_pulls enable row level security;
-- Staff read policy in the once-per-query auth.uid() shape the other staff tables use;
-- writes only through save_brew_pulls (security definer).

-- save_brew_pulls(p_brewery, p_batch, p_vessel, p_lines jsonb):
--   refuses a brewed or cancelled batch and a retired vessel;
--   checks each line's lot the way record_brew_day does (a lot exactly when lot-tracked, same material and brewery);
--   replaces the batch's rows and sets planned_vessel_id in one transaction.
-- get_brew_day_plan: each ingredient and source gains purchaseUomFactor;
--   the result gains pulls[] and plannedVesselId.
```

Shortness is derived (pulled < plan), not stored.

## Tasks

Each task writes its named test first and watches it fail. Rendering is checked by eye with `agent-browser` (AGENTS.md step 4).

1. **Pack math.** New `lib/mgr/pack-qty.ts`: `packText(qty, factor, unit)` → "4 × 50 lb + 20 lb"; `packsToQty(packs, loose, factor)` → base units, exact via ticks.
   - Test: `tests/pack-qty.test.ts`. 110/55 → "2 × 55 lb"; 220/50 → "4 × 50 lb + 20 lb"; factor 1 → "1650 lb"; 4.4 packs × 50 → 220.
   - Types: `number` in, `string` / `number` out.
   - Done when the test passes and `tsc` is clean. Depends on nothing. *In progress in this PR.*
2. **Inventory screens.** "Brew prep" (gated `SCHEMA-GATE` until task 4) and the revamped "Brew day" in `components/mgr/screens.tsx`, fixtures in `lib/mgr/fixtures/production.ts` (BAT-202 Mineral #6).
   - Test: the screen suite in AGENTS.md "Current focus: screens".
   - Depends on 1. *In progress in this PR.*
3. **Receiving uses the pack math.** Replace the inline factor multiply in `po-actions.tsx:66` and `receipt-view.ts:104` with `packsToQty`.
   - Test: existing `tests/purchasing-view.test.ts` stays green; add one case for a 55 lb factor.
   - Depends on 1.
4. **Migration and RPCs.** The SQL above, `save_brew_pulls`, extended `get_brew_day_plan`.
   - Test: `tests/brew-pulls.test.ts` (database). Save replaces rows; brewed or cancelled batch refused; retired vessel refused; a lot on an untracked material, or none on a tracked one, refused; another brewery's batch refused; plan returns pulls and factors.
   - Types: regenerate `lib/supabase/database.generated.ts`.
   - Depends on nothing.
5. **Command.** `save_brew_pulls` in `lib/commands/production.ts` (roles admin, brewer), input `{ batchId, vesselId, lines: { recipeIngredientId?, materialId, locationId, binId, lotId?, qty }[] }`; `bun run docs:api`.
   - Test: `tests/brew-pulls.test.ts` command case; `tests/api-docs.test.ts`.
   - Depends on 4.
6. **Prep view-model.** `lib/mgr/brew-prep-view.ts`: `toBrewPrepModel(plan, pulls, sources, plannedBbl)` groups brew-day lines by stage, starts each at its saved pull or the plan, splits it into packs + loose, marks short and unsourced lines.
   - Test: `tests/brew-prep-view.test.ts`.
   - Types: `BrewPlan`, `BrewMaterialSource` (extended with `purchaseUomFactor`), new `BrewPullView`.
   - Depends on 1; the snapshot shape from 4.
7. **Brew day timeline view-model.** In `lib/mgr/brew-day-view.ts`: `brewTimeline(model)` returns the five stages with their actuals, their regrouped process fields and a confirmed flag per actual; `canRecordBrewDay` also requires every actual confirmed; `brewPlanActuals` prefers saved pulls over plan.
   - Test: `tests/brew-day-actuals-view.test.ts`.
   - Depends on 1; 6 for the pull shape.
8. **Live Prep tab.** `app/(app)/batches/[id]/page.tsx` reads pulls; a new `prep-form.tsx` binds the shared Prep view to `save_brew_pulls`. Tabs via `E.tabs`. **Print pull list** uses the pick sheet's print pattern.
   - Test: view-model tests from 6; render checked by eye.
   - Depends on 2, 5, 6.
9. **Live Brew day timeline.** `record-brew-day-form.tsx` mounts the timeline view; vessel and date move to Knockout; the Stage picker goes.
   - Test: view-model tests from 7; render checked by eye.
   - Depends on 2, 7.
10. **Recipe pack totals and rounding.** `lib/mgr/recipe-view.ts` shows "22 bbl → 220 lb = 4 × 50 lb + 20 lb" per brew-day ingredient at a chosen batch size; the draft editor offers **Round to N × size**, which rewrites the per-bbl amount. Saved versions stay read-only.
    - Test: `tests/recipe-view.test.ts`, `tests/recipe-draft.test.ts`.
    - Types: recipe ingredient rows gain `purchase_uom_factor` from the materials read.
    - Depends on 1.
11. **Customer docs.** `content/docs/staff-guide.mdx` Brew day section (line 786) and Recipes (line 749): Prep, Done pulling, packs and loose pounds, the timeline, confirm, rounding. `<Screen name="Brew prep" />`.
    - Test: `tests/docs.test.ts`, `tests/design-docs.test.ts`.
    - Depends on 8, 9, 10.
12. **Ungate.** Remove `SCHEMA-GATE` from Brew prep's `writes`; point `lib/mgr/screen-routes.ts` at the live batch page.
    - Test: `tests/mgr-screens.test.ts`, `tests/screen-links.test.ts`.
    - Depends on 8.

## Parallelism

- Now: 1 and 2 (this PR, running), 4.
- After 1: 3, 6, 10 in parallel.
- After 4: 5.
- After 6: 7.
- After 5 + 6: 8. After 7: 9.
- Last: 11, then 12.

## Proof

`bun run test && bunx tsc --noEmit && bun run lint`, plus desktop and phone screenshots of Prep, Brew day and the recipe page on the test stack, posted to the PR.

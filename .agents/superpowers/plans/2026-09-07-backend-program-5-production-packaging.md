# Program 5 — Production and packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brewery can plan a recipe, schedule a batch without a brand, brew into a vessel, transfer/blend by occupancy, record a reading, plan a packaging run by brand before a tank exists, then start and close it against one occupancy.

**Architecture:** Tables already exist (`recipes`, `vessels`, `batches`, `occupancies`, `packaging_runs`). This program adds the SCHEMA-GATE columns and the command RPCs. `complete_batch` and `reattribute_loss` stay gated.

**Tech Stack:** Same as Program 1. New module `lib/commands/production.ts` and `lib/commands/packaging.ts`.

**Spec:** Schema §7–§10 (migrated tables). UI plan recipe SCHEMA-GATE (assumption columns). `.agents/superpowers/specs/2026-09-05-mgr-packaging-source-planning.md`. §16.9 `intended_brand_id` (already renamed in Program 3). Parent plan.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 0–4 merged (brands, formats, bins).
- Recipe OG/FG/ABV are **not stored**. One registry-layer function `recipeGravity(assumptions, ingredients)` used by the editor preview and `get_recipe_outcomes`. Snapshot `extract_potential` onto `recipe_ingredients` at version create.
- `packaging_runs.occupancy_id` nullable; `brand_id not null`; check `(started_at is null and closed_at is null) or occupancy_id is not null`.
- Occupancy promotion trigger: `vessel_occupancies.batch_id → batches.intended_brand_id` equals `packaging_runs.brand_id` when occupancy is set (allow null intended_brand, then the occupancy's batch brand must equal the run brand **or** the batch has no brand and the run brand is applied — **do not auto-write the batch**. Reject mismatch).
- Close packaging run: one RPC writes lot, `production_in` movements, `bbl_drawn`, consumptions from `format_bom`.
- `record_repack` one RPC, shared `ref`, `abs(sum(bbl)) < 0.000001`, one-level composition only.
- Parked: `complete_batch`, `reattribute_loss`, `get_loss_review`.
- TDD, docs:api, staff-guide, nav `planned` off for Batches / Packaging / Recipes / Cellar.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | recipe assumption columns; drop target_og/fg/abv; extract_potential on materials and recipe_ingredients; packaging_runs reshape; RPCs |
| `lib/recipe-gravity.ts` | pure OG/FG/ABV |
| `lib/commands/production.ts` | recipes, vessels, batches, brew day, cellar, readings |
| `lib/commands/packaging.ts` | schedule/update/close run, list runs, repack |
| `lib/commands/all.ts` | import both |
| `tests/recipe-gravity.test.ts`, `tests/production.test.ts`, `tests/packaging.test.ts` | Proof |
| `app/(app)/recipes/`, `app/(app)/cellar/`, `app/(app)/batches/`, `app/(app)/packaging/` | Live pages |

---

### Task 1: Recipe assumptions and pure gravity

**Files:**
- Create: `lib/recipe-gravity.ts`, `tests/recipe-gravity.test.ts`
- Modify: `materials.extract_potential numeric`, `recipe_versions` drop `target_og_plato,target_fg_plato,target_abv`; add `mash_temp_f, brewhouse_efficiency, yeast_attenuation`; `recipe_ingredients.extract_snapshot numeric`

**Interfaces:**
- Produces:

```ts
export function recipeGravity(input: {
  mashTempF: number; brewhouseEfficiency: number; yeastAttenuation: number;
  ingredients: { perBblQty: number; extractPotential: number; stage: string }[];
}): { ogPlato: number; fgPlato: number; abv: number }
```

Formula: use `brewing-domain.md` constants. If the domain doc does not spell the mash-extract equation, implement **points = sum(qty_lb * extract_potential * efficiency) / volume_bbl** converted to Plato via the standard Plato/SG relation already used in v1 knowledge — document the exact function body in the test's expected numbers (pin a golden example: 10 lb 2-row @ 1.037 potential, 75% eff, 1 bbl, 75% att → freeze those outputs in the test). Do not duplicate the formula in SQL.

- [ ] **Step 1:** Golden test with those inputs and explicit expected `{ ogPlato, fgPlato, abv }` you compute once by hand and pin.

- [ ] **Step 2:** FAIL — module missing.

- [ ] **Step 3:** Implement function + columns. No RPC yet.

- [ ] **Step 4–5:** PASS, commit `feat(recipes): assumption columns and one gravity function`

---

### Task 2: `create_recipe` and `create_recipe_version`

**Files:** `lib/commands/production.ts`, baseline RPCs, matrix

**Interfaces:**
- `create_recipe({ name, brandId?, note? }) => { id }` admin/brewer
- `create_recipe_version({ recipeId, mashTempF, brewhouseEfficiency, yeastAttenuation, boilMinutes?, ingredients: [{ materialId, perBblQty, stage, timingMinutes? }] })` — snapshots `materials.extract_potential` onto each ingredient. Immutable: never update a version.
- `get_recipe({ recipeId })` returns latest version + `recipeGravity(...)` as `ogPlato/fgPlato/abv` (not columns).
- `list_recipes`

- [ ] **Step 1:** Create recipe, two versions, assert version 1 ingredients unchanged after version 2, assert get_recipe gravity matches `recipeGravity`.

- [ ] **Step 2–5:** One RPC for version+ingredients. Commit `feat(recipes): immutable versions snapshot extract`

---

### Task 3: Vessels, schedule batch, brew day

**Files:** production.ts, baseline

**Interfaces:**
- `upsert_vessel({ id?, name, kind, capacityBbl })` admin/brewer
- `list_vessels`
- `schedule_batch({ intendedBrandId?, recipeVersionId?, plannedOn, plannedBbl, note? }) => { batchId }` — `intended_brand_id` nullable
- `record_brew_day({ batchId, vesselId, initialBbl, brewedOn })` — one RPC: `batches.brewed_on`, open `vessel_occupancies` (exclusion on vessel). Reject if vessel occupied.
- `get_brew_day({ batchId })`
- `list_batches`

- [ ] **Step 1:** Schedule without brand; brew into a fermenter; second brew into the same vessel while open raises; `list_batches` returns the row with null brand.

- [ ] **Step 2–5:** Occupancy exclusion already in baseline (`btree_gist`). Wire RPCs. Commit `feat(production): schedule batch and record brew day`

---

### Task 4: Cellar transfer and fermentation reading

**Files:** production.ts, baseline (`transfers` ledger already exists)

**Interfaces:**
- `record_cellar_transfer({ fromOccupancyId, toVesselId, volumeBbl, lossBbl })` — if to-vessel empty, create occupancy (initial_bbl 0) then transfer; if occupied, blend into surviving occupancy (batch identity stays the target's). Close source iff remaining volume 0. One RPC. Do not offer "new batch from two parents" (SCHEMA-GATE remains).
- `record_fermentation_reading({ occupancyId, at, tempF, gravityPlato?, ph?, note? })`
- `list_fermentation_readings({ occupancyId })`
- Add `fermentation_reading_overdue` to `today_live_reasons()` now that the reading page ships.

- [ ] **Step 1:** Transfer 5 bbl of 10, source stays open; transfer remaining, source `ended_at` set. Reading inserts. Today as brewer shows overdue when cadence passed (existing today test pattern).

- [ ] **Step 2–5:** Commit `feat(production): cellar transfer and fermentation readings`

---

### Task 5: Packaging run plan-by-brand

**Files:** reshape `packaging_runs`, `lib/commands/packaging.ts`

**Interfaces:**
- `packaging_runs.occupancy_id` nullable; add `brand_id not null` (FK brands). Check as spec.
- `schedule_packaging_run({ brandId, plannedOn, occupancyId?, outputs: [{ skuId, qtyPlanned }] })` — sku.brand_id must equal brandId. occupancy optional.
- `update_packaging_run({ runId, occupancyId?, outputs? })` — setting occupancy required to start; trigger checks occupancy batch brand vs run brand.
- `list_packaging_runs`, `list_occupancies`, `get_packaging_run`
- View `product_volume_requirements` as spec (demand from open runs × format bbl, supply from unbrewed batches.planned_bbl + occupancy_volumes).

- [ ] **Step 1:** Insert a run with no occupancy; starting (`started_at = now()`) without occupancy raises; picking a Pils occupancy on a Stout run raises; picking a matching occupancy succeeds.

- [ ] **Step 2–5:** Commit `feat(packaging): plan a run by brand before a tank exists`

---

### Task 6: `close_packaging_run`

**Files:** packaging.ts, baseline

**Interfaces:**
- `close_packaging_run({ runId, bblDrawn, outputs: [{ skuId, qtyActual }], lotCode, packagedOn, bestBy? })`
- One RPC: lot (`brand_id` from run), `production_in` movements at the occupancy's location's first bin (packaging location = the vessel's site — **vessels have no location today**. Spec does not add one. Post FG at a required `locationId`+`binId` on the close input so the movement has somewhere to land). Consumptions from `format_bom` × qty_actual as `material_movements` type `consumption` at that same location/bin. Set `closed_at`, `bbl_drawn`. Reject if occupancy null.

- [ ] **Step 1:** Close writes lot, production_in qty, consumption rows, occupancy volume decreases via existing `occupancy_volumes` view.

- [ ] **Step 2–5:** Commit `feat(packaging): close_packaging_run writes lot and production_in`

---

### Task 7: `record_repack`

**Files:** packaging.ts, `movement_type` += `'repack'`

**Interfaces:**
- `record_repack({ locationId, binId, parentSkuId, parentQty, childSkuId, childQty })`
- Parent and child formats related by one-level `format_components`. `abs(sum(bbl)) < 0.000001` over the shared `ref`. BOM `on_break` posts material consumption or return_to_stock. One RPC.

- [ ] **Step 1:** Break 1 case → 6 four-packs; bbl nets ~0; a tray with `on_break = return_to_stock` gets a return_to_stock movement.

- [ ] **Step 2–5:** Commit `feat(packaging): record_repack is volume-neutral at one level`

---

### Task 8: Pages, nav, ungate, docs

Routes: `/recipes`, `/batches`, `/cellar`, `/packaging`. Flip `planned` off on Recipes, Batches, Packaging, Cellar. Ungate the matching screen writes except `complete_batch` / `reattribute_loss`. `bun run docs:api`. Staff-guide. Browse schedule batch (no brand), schedule run (no tank), close run.

Commit `docs: production and packaging screens live`

---

## Validation

```bash
bunx vitest run tests/recipe-gravity.test.ts tests/production.test.ts tests/packaging.test.ts tests/commands-today.test.ts tests/rls-command-boundary.test.ts tests/schema-rules.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Storing OG/FG/ABV "for convenience" | High | Test that `recipe_versions` columns do not exist; gravity comes from `recipeGravity` |
| Closing a sourceless run | High | Check on `closed_at` requires occupancy |
| Posting FG with no location | High | Close input requires locationId+binId |
| Blend-as-new-batch UI | Medium | Stay gated |

## Acceptance

- [ ] Batch can be scheduled with null brand
- [ ] Packaging run can be planned without occupancy and cannot start/close without one
- [ ] Close is one RPC: lot + production_in + BOM consumption
- [ ] `complete_batch` still ungated? **No — still SCHEMA-GATE**

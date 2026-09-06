# MGR — Packaging run source: plan by product, execute against an occupancy

Date: 2026-09-05
Status: Decided with Ted; not yet implemented. Targets slice 5 (`schedule_packaging_run`).
Amends: `2026-08-31-mgr-schema-decisions.md` — the "FG lots" row ("one run draws from
exactly one vessel occupancy") now holds at **close**, not at insert.

## Problem

`packaging_runs.occupancy_id` is `not null` (`supabase/migrations/00001_baseline.sql:617`),
so a run cannot exist until the beer is physically in a vessel. That blocks the planning
case a brewery running many one-off beers lives in: booking a packaging run — and the cans,
labels and brew it implies — weeks before the beer has a batch record, let alone a tank.

The UI already assumes otherwise. `components/mgr/screens.tsx:2043` mocks a sourceless
planned run:

    E.row("RUN-0033 · Stout cans", "Thu 9/11 · no source yet", E.act("Pick source"))

That row is unrepresentable in the baseline. The mock is right; the column is wrong.

## Why the constraint looked load-bearing and is not

`screens.tsx:2062` justifies it: "One source occupancy, chosen exactly, is the rule that
lets close revalidate it later." True — at close. `:2061` gives the other reason: "the brand
comes from what is in the vessel, so only that brand's formats are offered." That one
resolves `vessel_occupancies.batch_id → batches.product_id (:460, not null) → skus.product_id`.

The format picker never needed the occupancy. It needed the **product**. Planning at product
level makes the picker simpler — `skus.product_id` is a direct filter instead of a two-hop
resolution. The constraint was carrying weight for a rule that sits one level coarser than
where it was enforced.

## Decision — two levels, not three

A run names a **product** while it is being planned, and an **occupancy** when it is executed.
There is no batch level; see "Why not a batch level" below.

| Level | When | What is knowable |
|---|---|---|
| product | "Stout cans, week of 9/11" | formats, BOM, planned qty, required bbl |
| occupancy | beer in a tank | + actual volume; required to start and close |

### Schema

    occupancy_id uuid,   -- was: not null
    product_id   uuid,
    check (num_nonnulls(occupancy_id, product_id) = 1),
    check (started_at is null or occupancy_id is not null)

Exactly one is set — the run's current commitment level. Composite FKs follow the existing
`(id, brewery_id)` pattern.

The second check preserves the close-revalidation rule intact: a run still cannot **start**
without an exact occupancy. It just no longer needs one to be **planned**. The transition is
the `E.act("Pick source")` affordance already drawn at `screens.tsx:2043`.

## Why not a batch level

An intermediate `batch_id` level was considered and rejected. It carries all of the ambiguity
and none of the forecasting value.

Nothing needs it:

- `material_requirements` (`:1355`) and `packaging_run_requirements` (`:1394`) join
  `packaging_runs → packaging_run_outputs → sku_bom` and never touch the source column.
  Product level is sufficient.
- `product_volume_requirements` (below) aggregates demand and supply **by product**. Per-run
  binding to a batch contributes nothing to that math.
- Starting a run already forces an exact occupancy via the `started_at` check, at the moment
  someone is standing in front of the tank. The binding that matters is enforced anyway.

And auto-binding a product-level run to a batch when one appears breaks whenever the mapping
is not 1:1: two planned Stout runs and one Stout batch silently claim the same barrels, with
nothing to catch it because `qty_planned` is deliberately unvalidated against volume; one run
and two Stout brews is simply ambiguous; a rescheduled or cancelled batch has no correct
silent behaviour. Dropping the level removes the question rather than answering it.

## Yield at product level is exact, not a guess

`skus.bbl_per_unit` is `not null` and lives on the SKU, not the batch (`:253`, "exact
fraction; basis of all TTB math"). So `qty_planned × bbl_per_unit` converts planned cases to
required barrels with no batch and no tank. `packaging_run_yields` (`:1407`) already computes
the identical expression with `qty_actual`; the planning number is the same multiply run
forward instead of after close.

Only **yield loss** (`bbl_drawn − bbl_packaged`) is unavailable before an occupancy exists,
and that was always a close-time actual, never a planning input.

## New view — `product_volume_requirements`

Today planning flows brew → package: `material_requirements` (`:1355`) starts from planned
batches and derives ingredient needs. Product-level runs let it also flow demand → brew:

    committed packaging (bbl)  −  planned + in-tank beer (bbl)  =  brew this much

Both sides exist already:

- demand — `sum(qty_planned × bbl_per_unit)` per product over runs where `closed_at is null`
- supply — `batches.planned_bbl` where `brewed_on is null`, plus `occupancy_volumes.bbl`
  where `ended_at is null` (`:1379`)

Same shape as `material_requirements`, one level up: beer instead of cans. For a brewery
cycling one-offs the beer is the long-lead item, so this is the shortfall that matters. It is
also the reason no batch level is needed — the supply side sums batches per product rather
than pairing them to runs.

## Existing views need no change

`material_requirements` (`:1355`) and `packaging_run_requirements` (`:1394`) both filter only
on `r.closed_at is null` — no `occupancy_id`, no `started_at`. Product-level runs feed
materials forecasting unchanged; they simply start contributing earlier. Dropping the NOT NULL
extends the forecasting horizon that is already built.

## Consequences and open points

- `lots.packaging_run_id` stays `not null unique` (`:636`) and `lots.product_id` stays — a lot
  is only created at close, when the occupancy is known. Single-product runs are unaffected.
- Blends are still modelled as transfers into a surviving occupancy, not as multi-source runs.
- `packaging_run_outputs.qty_planned` stays unvalidated against available volume at product
  level. Nothing moves in the ledger until close, so this is a plan, not a ledger entry.
- A product-level run offers formats from `skus.product_id` directly; an occupancy-level run
  resolves through `batch_id → product_id` first. Both end at the same filter.
- Nothing models seasonal / limited-release products; `skus.active` (`:258`) remains the only
  retirement lever, and the SKU list grows monotonically for one-off-heavy breweries.

## Affected, all still `[design]` in `screens.tsx`

`schedule_packaging_run`, `update_packaging_run`, `close_packaging_run`,
`list_packaging_runs`, `get_material_shortfalls`. The baseline migration is edited in place
until first deploy, so no second migration file is implied.

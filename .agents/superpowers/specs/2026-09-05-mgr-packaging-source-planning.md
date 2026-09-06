# MGR — Packaging run source: plan by product, execute against an occupancy

Date: 2026-09-05
Status: Decided with Ted; not yet implemented. Targets slice 5 (`schedule_packaging_run`).
Amends: `2026-08-31-mgr-schema-decisions.md` — the "FG lots" row ("one run draws from
exactly one vessel occupancy") now holds when a run **starts**, not at insert.

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

A run always names the **product** it is for, and gains an **occupancy** when it is executed.
The levels accumulate rather than replace: planning needs only the product, execution adds
the tank. There is no batch level; see "Why not a batch level" below.

| Level | When | What is knowable |
|---|---|---|
| product | "Stout cans, week of 9/11" | formats, BOM, planned qty, required bbl |
| occupancy | beer in a tank | + actual volume; required to start and close |

### Schema

    occupancy_id uuid,   -- was: not null
    product_id   uuid not null,
    check ((started_at is null and closed_at is null) or occupancy_id is not null)

    create index packaging_runs_product_idx on packaging_runs (product_id);

`product_id` is always set — it is what the run is *for*, and it stays set when an occupancy
is picked. Composite FKs follow the existing `(id, brewery_id)` pattern.

The check preserves the close-revalidation rule intact: a run still cannot **start** without
an exact occupancy. It just no longer needs one to be **planned**. The transition is the
`E.act("Pick source")` affordance already drawn at `screens.tsx:2043`.

`closed_at` is in the check for a reason. `packaging_runs` orders nothing between `started_at`
and `closed_at` — the table's only check is `bbl_drawn >= 0` (`:621`) — so guarding `started_at`
alone would still admit `(started_at null, closed_at set, occupancy_id null)`. That tuple is
not harmless: `occupancy_volumes` (`:1384`) subtracts a run's `bbl_drawn` through
`where r.occupancy_id = o.id`, which never matches NULL. A closed sourceless run would raise
finished goods with no tank deducted — beer from nothing in the TTB math. Guarding both
columns closes it without needing a separate ordering constraint.

An earlier draft made the two mutually exclusive (`num_nonnulls(...) = 1`, nulling
`product_id` on promotion). Rejected: it erases the planned product, so a run's planning
history is unrecoverable before `lots` exists at close, and — worse — it leaves nothing to
check the picked occupancy against. A Stout run could be bound to a Pils tank with no
constraint violated. Keeping both lets a trigger assert on promotion that

    vessel_occupancies.batch_id -> batches.product_id  =  packaging_runs.product_id

which is the guarantee `close_packaging_run` needs anyway before it writes a lot.

## Why not a batch level

An intermediate `batch_id` level was considered and rejected. It carries all of the ambiguity
and none of the forecasting value.

Nothing needs it:

- `material_requirements` (`:1352`) and `packaging_run_requirements` (`:1394`) join
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

`skus.bbl_per_unit` is `not null` and lives on the SKU, not the batch (`:254`, "exact
fraction; basis of all TTB math"). So `qty_planned × bbl_per_unit` converts planned cases to
required barrels with no batch and no tank. `packaging_run_yields` (`:1407`) already computes
the identical expression with `qty_actual`; the planning number is the same multiply run
forward instead of after close.

Only **yield loss** (`bbl_drawn − bbl_packaged`) is unavailable before an occupancy exists,
and that was always a close-time actual, never a planning input.

## New view — `product_volume_requirements`

Today planning flows brew → package: `material_requirements` (`:1352`) starts from planned
batches and derives ingredient needs. Product-level runs let it also flow demand → brew:

    committed packaging (bbl)  −  planned + in-tank beer (bbl)  =  brew this much

Both sides exist already:

- demand — `sum(qty_planned × bbl_per_unit)` per product over runs where `closed_at is null`
- supply — `batches.planned_bbl` where `brewed_on is null`, plus `occupancy_volumes.bbl`
  where `ended_at is null` (`:1379`)

Two things the naive form of that gets wrong.

**The supply legs overlap.** `brewed_on` is a nullable date nobody is required to fill in
(`:464`; its only other reader is `material_requirements` at `:1356`), and nothing couples it
to `vessel_occupancies`. A batch knocked out into a tank whose `brewed_on` was never set
counts twice — 42 bbl planned *and* 42 bbl in the tank — and the shortfall reads zero when the
brewery in fact needs to brew. **Set `brewed_on` when an occupancy opens.** An anti-join on
*open* occupancies looks cheaper but does not close the gap: once that occupancy ends
(`ended_at` set) the in-tank leg stops counting the beer — `occupancy_volumes` filters
`ended_at is null` — and the anti-join stops matching too, so `planned_bbl` counts as supply
forever for beer already brewed and packaged. Same failure, deferred until the tank empties.
An anti-join would have to exclude *every* occupancy ever opened for the batch; setting
`brewed_on` is both correct and simpler.

**The demand leg never expires.** It filters `closed_at is null` only, and `packaging_runs`
has no cancelled or void column. Under the old schema that was safe because every run was
anchored to a real occupancy; booking runs weeks out with no anchor is the entire point of
this change, so an abandoned or rescheduled product-level run inflates the shortfall forever,
telling the brewery to brew beer nobody will package. Either a `planned_on` horizon or a
cancellation state is needed — decide before the view ships.

Same shape as `material_requirements`, one level up: beer instead of cans. For a brewery
cycling one-offs the beer is the long-lead item, so this is the shortfall that matters. It is
also the reason no batch level is needed — the supply side sums batches per product rather
than pairing them to runs.

## Existing views need no change

`material_requirements` (`:1352`) and `packaging_run_requirements` (`:1394`) both filter only
on `r.closed_at is null` — no `occupancy_id`, no `started_at`. Product-level runs feed
materials forecasting unchanged; they simply start contributing earlier. Dropping the NOT NULL
extends the forecasting horizon that is already built.

## Consequences and open points

- `lots.packaging_run_id` stays `not null unique` (`:636`) and `lots.product_id` stays — a lot
  is only created at close, when the occupancy is known. Single-product runs are unaffected.
- Blends are still modelled as transfers into a surviving occupancy, not as multi-source runs.
- `packaging_run_outputs.qty_planned` stays unvalidated against available volume at product
  level. Nothing moves in the ledger until close, so this is a plan, not a ledger entry.
- The format picker always reads the run's own `product_id`, at either level — the two-hop
  `occupancy → batch → product` resolution the old column forced is gone entirely.
- `packaging_run_outputs.sku_id` FKs only to `skus` (`:654`), not to a SKU *of this run's
  product*. With `product_id` authoritative and the new view aggregating by it, a Stout run
  carrying a Pils output attributes Pils barrels to Stout demand, and the lot written at close
  carries the run's product while its movements carry the SKU's. The promotion assertion
  proposed under **Schema** above covers occupancy↔product only, and is itself not yet built;
  outputs↔product needs the same guard.
- No command owns the promotion. `update_packaging_run` is described at `screens.tsx:2060` as
  reopening a planned run until it starts — rescheduling, not binding a source. `Pick source`
  needs a home, and it is what calls the product-match assertion.
- Nothing models seasonal / limited-release products; `skus.active` (`:260`) remains the only
  retirement lever, and the SKU list grows monotonically for one-off-heavy breweries.

## Affected, all still `[design]` in `screens.tsx`

`schedule_packaging_run`, `update_packaging_run`, `close_packaging_run`,
`list_packaging_runs`, `get_material_shortfalls`, `get_packaging_run` (`screens.tsx:1990`,
`:2013`) and `list_formats`.

**Schedule packaging run needs redrawing, not just its commands.** `screens.tsx:2043` is the
one row on that sheet this design already matches; the rest of it still assumes an occupancy
is required to plan — `:2058` job "Plan a run against one source occupancy"; `:2059`
`list_formats [design; for the brand in the source]`; `:2061` state "no open occupancy —
nothing to package"; `:2062` "shows what is left in the vessel so a plan cannot exceed the
source". All four are wrong under product-level planning. AGENTS.md makes `screens.tsx` the
source of truth and the customer guides embed those frames, so implementing this spec without
redrawing the sheet leaves the inventory contradicting itself. The baseline migration is edited in place
until first deploy, so no second migration file is implied.

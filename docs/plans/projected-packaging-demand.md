# Projected packaging material demand on Planning (#869)

Status: Phases A and B approved by the owner on 2026-10-16 and implemented
in `20261017143500_projected_packaging_demand.sql`. The owner decision lifts
the 2026-10-13 deferral; it supersedes the earlier Phase-A-only suggestion.

## Why

Open packaging runs were the only packaging demand source on Planning.
Orders and planned batches could therefore leave long-lead labels invisible
until their runs were scheduled. Projection adds those missing quantities
without creating packaging runs, reservations, or stock.

## Approved decisions

### D1. Package split — both phases

Phase A projects order shortfall. Phase B uses `skus.batch_share`, the
optional fraction of a batch's planned volume normally packaged into that
SKU. A share must be greater than 0 and at most 1. All shares of one brand,
including inactive SKUs, total at most 1. They need not total exactly 1.
Only active SKUs with a share project batch units.

Staff configure **Batch package share (%)** on the shared Edit SKU sheet.
New SKU creation remains one atomic command and starts with no share. Staff
create first, then edit to configure its projection. Clearing the field
removes the share. `update_sku.batchShare` omits to keep and accepts null to
clear; omitted fields preserve accepted legacy request hashes and results.
A brand-row lock serializes share changes; the database trigger enforces
the total even for privileged writes outside the command.

### D2. Expected packaging date

`breweries.days_to_package` starts at 14 and accepts whole days from 1 to
120. Needed-by is `coalesce(brewed_on, planned_on) + days_to_package`.
Settings uses the same shared form in inventory and application.
`set_brewery_operating_defaults.daysToPackage` omits to keep the current
value and preserves the old reading-hours-only replay hash.

### D3. Replacement and double counting

Batch units are `floor(planned_bbl * batch_share / format_bbl_per_unit)`.
Zero-unit projections are excluded. Closed and cancelled batches never
project. Any non-cancelled packaging run referencing the batch directly
(`packaging_runs.batch_id`) or through its source occupancy
(`vessel_occupancies.batch_id`) removes the **whole batch projection**.
Closed runs continue suppressing it. Cancelling the last linked run restores
it while the batch remains active.

An unlinked tankless run cannot identify a batch and therefore cannot
replace a particular batch projection. This is the approved known gap, not
a same-SKU subtraction heuristic. Picking its source tank establishes the
link. A partial linked run also replaces the whole batch estimate, not only
its own units.

Order shortfall for each SKU is the smaller of negative ATP and its open
order-line allocation quantity, less all open run planned units and all
projected batch units of that SKU. Only positive remaining units project.
Finished-goods arrivals and planned supply therefore remove the order
projection rather than adding another copy of demand.

Taproom standing allocations hold stock ahead of orders but never project
alone. On hand 100, standing 50, orders 80 projects 30. On hand 0, standing
50, orders 10 projects 10, not 60.

### D4. Marking and drafting

Planning keeps one row per material. `required` includes firm and projected
demand; the appended numeric `projected` column is the projected part in
base units. The shared adapter adds **includes N projected** when positive.
Projected and firm demand draft identically through the existing purchase
order RPC. Missing suppliers and past buy-by dates still cannot draft.
Material on hand and sent, unreceived purchase orders reduce the gap.

### D5. Order needed-by

Order needed-by is the earliest requested ship date among the SKU's open
order allocations, falling back to today only when none has a date.
`order_packaging_shortfall_rows()` is a narrowly granted security-definer
row function because Brewers can read Planning but not orders. It returns
only brewery, SKU, quantity and date, with an explicit caller staff-brewery
predicate. It never returns a customer, price, order identity, or note.

## Implementation owners

| Owner | Responsibility |
|---|---|
| `projected_batch_packaging_units` | Security-invoker view owning the batch quantity/date/replacement formula once, reused by material demand and order netting. Explicit caller membership also applies inside the definer reader. |
| `order_packaging_shortfall_rows()` | Tenant-scoped order shortfall/date projection, net of stock and planned supply. |
| `material_requirements` | One `sku_units` stream (open runs, batch projections, order projections), one format BOM join, `ceil` per row for `each` materials, existing material/vendor/contract gap math, appended `projected`. |
| `lib/commands/catalog.ts` | Share mutation and nested SKU reads. |
| `lib/commands/settings.ts` | Days-to-package read and authorized mutation. |
| `lib/commands/purchasing.ts` | Numeric `projected` query result; existing draft command unchanged. |
| `lib/mgr/planning-view.ts` | Shared projected detail phrase. |
| Shared SKU/Settings views and live adapters | Percentage conversion, controlled E fields, validation, persistence and request recovery through existing commands. |
| `components/mgr/screens.tsx` and fixtures | The same views, explicit projected Planning state and editable defaults. |

No committed migration is modified. The replacement RPC signatures remove
the old overloads, retain trailing defaults for omitted fields, revoke
unintended execution grants and allow only authenticated calls. Existing
role assertions and the command request ledger remain the write boundary.

## Proof

`tests/projected-packaging-demand.test.ts` exercises stock/order/run/batch
replacement, standing caps, quantity rounding, date selection, projected
purchase-order drafting, authorization/isolation, share bounds and legacy
SKU replay against the real test database. `tests/settings.test.ts` covers
packaging-day persistence, bounds and reading-hours-only replay.

Pure Planning, SKU and Settings tests cover view models and payloads.
Required integration regressions include packaging, purchasing, one-way keg,
unstarted plans, RPC exposure, schema rules and command idempotency.
Application and inventory browser smoke cover Planning, Edit SKU and
Settings. API documentation is regenerated from the command registry.

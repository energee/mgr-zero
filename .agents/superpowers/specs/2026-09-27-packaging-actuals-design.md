# Packaging material actuals (#623)

Status: technically reviewed. Implementation follows #619 and #622 on
main. Migration reservation: `20260928100000`–`20260928105959`.

## Existing owners and v1 cross-check

`close_packaging_run` already owns one atomic close: a finished-goods lot,
output movements, tank draw and material consumption. Its latest definition
is `20260926010000_packaging_bom_fefo.sql`. That function rounds counted BOM
materials per output and draws tracked stock first-expiring-first. Keep its
output/tank guards, material-ledger lock and replay boundary.
`packaging_run_requirements` is the planned material requirement owner.
`record_repack` is a separate operation and is not changed by this issue.

V1 `00184_revise_packaging_session.sql` changed finished goods and allocation
quantities and applied BOM depletion deltas together. It explicitly left
previous loss allocations unrecomputed. V1's
`packaging-material-consumption.test.ts` proves counted materials round once
per requirement instead of accumulating floating-point unit errors. Preserve
that accounting lesson. Do not port mutable finished-goods corrections or
silent theoretical usage into the confirmed actual-usage record.

## Close inputs and durable facts

The close screen shows planned BOM quantities beside actual used, damaged/lost,
and unused returned quantities. Stock has not been deducted at schedule/start,
so unused returned material is an observation and posts no positive movement.
For example, 100 staged cans, 90 used, 3 damaged and 7 unused consume 90 and
post loss 3; stock falls by 93, never by 100 followed by another deduction.

Each actual source names material, location, bin, tracked lot or explicit null,
used quantity, loss quantity and unused quantity in the frozen base unit.
All quantities are finite and nonnegative at the material's supported precision.
Counted materials use whole units. The form prefills planned used quantities,
but confirmation is explicit and may differ from BOM. Require an explicit
zero for a planned material not used; omission never means theoretical usage.
An extra actual material is allowed when explicitly named and sourced.

Add run-linked immutable material usage rows with the frozen material name,
base unit, lot code, planned quantity, actual used, loss and unused quantities.
Each positive used/loss quantity points to its own existing material movement.
The row has no movement for zero use or for unused returned quantity.
Use one row per material/source bucket; split-source totals remain visible.
Capture the exact BOM plan reviewed at close so later BOM edits cannot change
historical planned-versus-actual comparisons.

Extend `close_packaging_run` to validate and write those actuals in the existing
transaction. Replace its theoretical deduction with confirmed usage/loss.
Retain the existing suggested FEFO ordering in the read model, but do not
silently choose different lots after the operator confirms sources.
Aggregate used plus loss per exact bucket before the stock check. Outputs,
material usage, loss, lot and tank draw either all commit or none do.

## Corrections

Reuse #622's exact `material_movements.compensates_id` pattern and append-only
revision/reason contract. A material-actual correction preserves the original
usage rows, reverses their consumption/loss movements, and writes replacement
actuals. Unused quantity remains informational and never creates stock.
Lock the cellar workflow, run and material ledger in the established order.
Validate stock after reversal/replacement before writing any revision.

Do not allow a corrected record to reinterpret downstream sold, transferred,
repacked or depleted finished goods, a completed batch, or a filed report.
Explain the dependency that prevents correction. Output quantity and tank-volume
corrections are outside #623. This issue corrects material actuals only and never
changes the original lot's production movements or tank draw.
No silent best-effort correction or generic stock-adjustment escape is offered.

## Reads, views and proof

Schedule and Close share the real `packaging_run_requirements` projection for
planned usage and shortages. Close adds current selectable source buckets and
confirmed actuals through a shared view. Inventory supplies fixtures to those
same fields. Run detail shows the frozen usage record and correction history.
Reuse E quantity, select and action controls, and document the timing in the
staff guide and generated API docs.

Tests first: planned versus actual, whole-unit rounding, two lots, insufficient
used-plus-loss stock with full rollback, unused quantity causing no movement,
duplicate replay, tenant/role denial, immutable history after BOM edits, and
unused-record correction with downstream refusal. Include a zero-output line
and zero-used material. Full suite, typecheck, lint, code-based parity, browser,
simplify/explain and independent review remain required.

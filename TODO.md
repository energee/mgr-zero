# TODO — work still gated from `/docs/screens-explore`

Refreshed 2026-09-26 against `main` at `45eabd41`. Counts are derived from
`SCREENS`, `isUngated`, and `SCREEN_ROUTES`: 174 MGR screens: 173 ungated and mapped, 1 gated, and 0 ungated without a live route.
Nine live screens carry a partial `SCHEMA-GATE`, listed below. Team's tenth
was a stale note (the taproom role is live) and PR #604 removes it.

Audit sources: `components/mgr/screens.tsx`, `lib/mgr/screen-routes.ts`,
`tests/app-screen-parity.test.ts`, and `tests/screen-command-gates.test.ts`.

An item leaves this file when its owner issue closes or a merged PR names its
unique checklist text with `TODO: <text>`. Completed programs and resolved
drift do not remain here; merged work is recorded by the dreaming workflow in
`.agents/PROGRESS.md`.

## Screen gates

The one gated screen is Schedule packaging run: its `get_material_shortfalls`
read is not a registered view yet. Its live dialog is tracked under the
PR #336 follow-ups below.

## Partial schema gates

These screens are live, but one part of each carries a `SCHEMA-GATE` tag in
`components/mgr/screens.tsx`. Each waits for backend work; do not start
database or migration work while screens are the current focus.

- [ ] Ship and invoice, Ship on delivery: persist the shortage reason.
- [ ] Variance by brand: a brand-by-period trend projection.
- [ ] Accounting: a missing-email count in connection health, and a recovery
  disconnect that works when the connection is not in the connected state.
- [ ] Invoices: a verified Open in QuickBooks link and email delivery state.
- [ ] Batches: the reading summary and direct reading action, which need
  occupancy and reading facts from `list_batches`.
- [ ] Brew day: lot consumption and a frozen process sheet.
- [ ] Receive PO: recent material lot suggestions from the purchase-order query.
- [ ] Cycle count: a lot allocation preview (the read returns bin totals only)
  and roll conversion (counts accept base units only).

## Release gate

- [ ] Issue #311 — map and complete the connected adversarial walkthrough,
  from `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`,
  then perform hosted release readiness. Hosted Supabase, Vercel, integration
  credentials, advisors, pruning, and scheduler setup remain ask-first.
  Owner-side dashboard tasks still open:
  - AI Gateway credits for Ask MGR (Issue #329).
  - Leaked-password protection in Supabase Auth.
  - Production deploys from `main` only.
  - A backup before each migration, and a tested restore.
  - SMTP sending domain: parked until there are pilot users.

## Parity follow-ups from the PR #336 review

Found reviewing the non-Catalog parity conversion. The P1s and the behavior
losses were fixed on that branch; these were left because each needs a design
decision, not a repair.

- [ ] Rebuild the live Schedule packaging run dialog on the shared model.
  `components/mgr/views/schedule-packaging-run.tsx` early-returns into a second
  JSX tree when `controls` is present, and `app/(app)/packaging/schedule-run-form.tsx`
  mounts it with a wholly empty model, so the live dialog shows none of the
  planned outputs, short materials, warning note, or closing info the explorer
  draws. The parity contract rejects a branch that selects an alternate layout.
  Because the fork is inside the view rather than a slot,
  `tests/screen-view-composition.test.ts` cannot see it and reports the screen
  as converted; the guard needs to reject in-view early returns too. The screen
  itself is still gated on `get_material_shortfalls` (see Screen gates).
- [ ] Settle the surface for Adjust lines. `components/mgr/views/adjust-lines.tsx`
  opens with a screen back-header, but `app/(app)/orders/[id]/adjust-lines-form.tsx`
  mounts it in a dialog, so the modal shows the title twice and offers a back
  link inside itself, while the inventory renders the same view full-page.
  Every comparable flow in that conversion became a full route instead.
  Decided (Ted, 2026-09-26): Adjust lines becomes a full route,
  `/orders/[id]/adjust`, like the other flows.
- [ ] Give New PO a way to remove a line, and let one owner decide which rows
  count. `components/mgr/views/new-po.tsx` requires a row once any field is
  touched, while `app/(app)/purchase-orders/new-po-form.tsx` submits only rows
  with a material and a positive quantity — so a row with just a unit cost is
  required but unsubmittable, and a row with quantity 0 is neither. The
  conditional `required` is a workaround for there being no Remove control;
  whether the explorer draws one is a screen-parity design call.
  Decided (Ted, 2026-09-26): add a per-row Remove control, and one shared
  "row counts" check that both the view and the form use.
- [ ] Batch the Cellar landing's reading lookup. `app/(app)/cellar/page.tsx`
  issues one `list_fermentation_readings` per open occupancy to fill a tile
  subtitle, unbounded by tank count; there is no latest-reading-per-occupancy
  query in `lib/commands/production.ts`.
## Cleanup follow-ups from the PR #404 review

- [ ] Move fixture-only state out of the shared views. `FormatView`,
  `SkuView`, and `CatalogCategoriesControl` each carry a second, preview-only
  implementation selected by a missing control; the preview wrapper in
  `components/mgr/screens.tsx` should own that state and the views take controls as props.
- [ ] Add a flat variant to `E.row` so `components/mgr/views/customer.tsx`
  stops restyling E internals with descendant selectors.
- [ ] Replace the `data-chat-preview`, `data-work-filter`, and
  `data-preview-action` explorer markers with one attribute stamped by
  `CommandForm`, and treat everything inside a dialog or sheet as in-place.
- [ ] Scope the raw-control lint to `app/**` and `components/mgr/views/**`
  so `components/mgr/qty.tsx` and `components/mgr/venue.tsx` need no inline disables, then retire the
  overlapping half of `tests/field-primitives.test.ts`.
- [ ] Merge `app/(app)/catalog/pour-form.tsx` into `SkuForm` so pour create and edit share one
  command choice and one validation path.
- [ ] Widen `format_volumes` (or add a catalog view) so `list_formats` is one
  read and `effective_bbl_per_unit` goes away. Waits for the backend push.
- [ ] Let `PackageBomView` render without a row verb by default so the format
  page drops `rowAction={null}`.

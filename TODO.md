# TODO — work still gated from `/docs/screens-explore`

Refreshed 2026-09-11 against `main` at `9045bd4`. Counts are derived from
`SCREENS`, `isUngated`, and `SCREEN_ROUTES`: 173 MGR screens: 172 ungated and mapped, 1 gated, and 0 ungated without a live route.

Audit sources: `components/mgr/screens.tsx`, `lib/mgr/screen-routes.ts`,
`tests/app-screen-parity.test.ts`, and `tests/screen-command-gates.test.ts`.

An item leaves this file when its owner issue closes or a merged PR names its
unique checklist text with `TODO: <text>`. Completed programs and resolved
drift do not remain here; merged work is recorded by the dreaming workflow in
`.agents/PROGRESS.md`.

## Screen gates

- [ ] Issue #278 — schema and missing-view gates (13 screens): Coming up,
  Cellar addition, Schedule packaging run, Mash schedule,
  Mash step, Fermentation schedule, Fermentation stage, Water, Water addition,
  Keg report, Water profiles, Water profile, and Repack. This owner is blocked
  on the product/schema decisions named in the issue; do not start database or
  migration work while screens are the current focus.
Programs 10, 13, 14, and 15 are complete on `main`; their screens are included
in the mapped records above. Cellar transfer now uses the existing occupancy and vessel queries.

## Release gate

- [ ] Issue #311 — map and complete the connected adversarial walkthrough,
  from `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`,
  then perform hosted release readiness. Hosted Supabase, Vercel, integration
  credentials, advisors, pruning, and scheduler setup remain ask-first.

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
  itself is also gated under Issue #278.
- [ ] Decide whether `.claude/project-remainder.plan.md` belongs in the repo.
  141 lines of whole-program roadmap arrived with the parity conversion, while
  plans otherwise live in `.agents/superpowers/plans/` and `.claude/` tracks
  only the `agents` and `skills` symlinks.
- [ ] Decide whether `/login?error=expired` should still render a sign-in form
  without JavaScript. It now returns only an open `CommandForm`, which portals
  client-side, and the `"expired"` entry was dropped from `ERRORS`, so the one
  URL a lapsed session lands on has no server-rendered way back in.
- [ ] Settle the surface for Adjust lines. `components/mgr/views/adjust-lines.tsx`
  opens with a screen back-header, but `app/(app)/orders/[id]/adjust-lines-form.tsx`
  mounts it in a dialog, so the modal shows the title twice and offers a back
  link inside itself, while the inventory renders the same view full-page.
  Every comparable flow in that conversion became a full route instead.
- [ ] Give New PO a way to remove a line, and let one owner decide which rows
  count. `components/mgr/views/new-po.tsx` requires a row once any field is
  touched, while `app/(app)/purchase-orders/new-po-form.tsx` submits only rows
  with a material and a positive quantity — so a row with just a unit cost is
  required but unsubmittable, and a row with quantity 0 is neither. The
  conditional `required` is a workaround for there being no Remove control;
  whether the explorer draws one is a screen-parity design call.
- [ ] Batch the Cellar landing's reading lookup. `app/(app)/cellar/page.tsx`
  issues one `list_fermentation_readings` per open occupancy to fill a tile
  subtitle, unbounded by tank count; there is no latest-reading-per-occupancy
  query in `lib/commands/production.ts`.
- [ ] Keep the portal cart's review verb consistent with its subtotal.
  `app/(portal)/portal/cart.tsx` overrides `subtotal` to the unavailable
  message for a pending request but leaves `reviewVerb` reading
  `Review order · $X`, so the button contradicts the line above it.
- [ ] Point the posted-receipt back link at the PO just received against.
  `app/(app)/purchase-orders/[id]/page.tsx` returns to the list instead.

## Cleanup follow-ups from the PR #404 review

- [ ] Move fixture-only state out of the shared views. `FormatView`,
  `SkuView`, and `CatalogCategoriesControl` each carry a second, preview-only
  implementation selected by a missing control; the preview wrapper in
  `screens.tsx` should own that state and the views take controls as props.
- [ ] Add a flat variant to `E.row` so `components/mgr/views/customer.tsx`
  stops restyling E internals with descendant selectors.
- [ ] Replace the `data-chat-preview`, `data-work-filter`, and
  `data-preview-action` explorer markers with one attribute stamped by
  `CommandForm`, and treat everything inside a dialog or sheet as in-place.
- [ ] Scope the raw-control lint to `app/**` and `components/mgr/views/**`
  so `qty.tsx` and `venue.tsx` need no inline disables, then retire the
  overlapping half of `tests/field-primitives.test.ts`.
- [ ] Merge `pour-form.tsx` into `SkuForm` so pour create and edit share one
  command choice and one validation path.
- [ ] Widen `format_volumes` (or add a catalog view) so `list_formats` is one
  read and `effective_bbl_per_unit` goes away. Waits for the backend push.
- [ ] Let `PackageBomView` render without a row verb by default so the format
  page drops `rowAction={null}`.

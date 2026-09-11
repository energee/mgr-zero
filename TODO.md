# TODO — work still gated from `/docs/screens-explore`

Refreshed 2026-09-11 against `main` at `848851e`. Counts are derived from
`SCREENS`, `isUngated`, and `SCREEN_ROUTES`: 169 MGR screens: 146 ungated and mapped, 23 gated, and 0 ungated without a live route.

Audit sources: `components/mgr/screens.tsx`, `lib/mgr/screen-routes.ts`,
`tests/app-screen-parity.test.ts`, and `tests/screen-command-gates.test.ts`.

An item leaves this file when its owner issue closes or a merged PR names its
unique checklist text with `TODO: <text>`. Completed programs and resolved
drift do not remain here; merged work is recorded by the dreaming workflow in
`.agents/PROGRESS.md`.

## Screen gates

- [ ] Issue #278 — schema and missing-view gates (14 screens): Coming up,
  Cellar addition, Cellar transfer, Schedule packaging run, Mash schedule,
  Mash step, Fermentation schedule, Fermentation stage, Water, Water addition,
  Keg report, Water profiles, Water profile, and Repack. This owner is blocked
  on the product/schema decisions named in the issue; do not start database or
  migration work while screens are the current focus.
- [ ] Issue #276 — deferred Square/POS remainder (9 screens): POS mapping,
  POS sale detail, Point of sale, Connect Square, Square locations,
  Square → QuickBooks connector, Disconnect Square, Menu, and POS item. The
  issue is intentionally labeled `wontfix`; reopen the Program 14 P5 decision
  in `.agents/superpowers/plans/2026-09-07-backend-program-14-square-pos.md`
  before implementing it.

The remaining planned navigation entry is More → Menu and belongs to #276.
Programs 10, 13, and 15 are complete on `main`; their screens are included in
the 146 mapped records above.

## Release gate

- [ ] Issue #311 — map and complete the connected adversarial walkthrough,
  from `.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`,
  then perform hosted release readiness. Hosted Supabase, Vercel, integration
  credentials, advisors, pruning, and scheduler setup remain ask-first.

# PROGRESS

Running log of what's done, in flight, and next. Newest at top. Keep entries to one line each; details belong in commits and docs.

## Now
- [ ] Slice 1B: orders → allocations → ship → invoices on the baseline schema.

## Done
- 2026-08-31 — Wireframes: 11 gap screens added (settings sub-pages, new order/PO, customer/product/price-list editors, recipe editor, portal account, keg return) → 59 total.
- 2026-08-31 — Wireframes for all 50 planned screens (`2026-08-31-mgr-wireframes.html`, published as artifact); UI plan rev 2 with 13 added flows and entry-first build order.
- 2026-08-31 — UI layout plan (mobile-first, composer + forms, all ten slices): `2026-08-31-mgr-ui-layout-plan.md`, draft awaiting Ted.
- 2026-08-31 — Docs reconciled to the baseline (README test list, rule count, stale skip notes, v1-review status, proxy migration).
- 2026-08-31 — `tests/schema-rules.test.ts` (pg_catalog gates), all rules active; definer fns revoked from anon/public in the baseline.
- 2026-08-31 — Single baseline migration `00001_baseline.sql` (58 tables, all ten slices) replaces the two slice-1A migrations; design in `2026-08-31-mgr-schema-design.md`; `tests/schema-conventions.test.ts` proves composite FKs, lot trigger, append-only ledgers.
- 2026-08-31 — Reviewed MGR v1; adopted iron rule 5 (multi-write = one plpgsql fn, `tests/write-atomicity.test.ts`) and `brewing-domain.md`. Remaining pulls listed in the review doc §3.
- 2026-08-31 — Schema design decisions doc for the single-baseline migration.
- 2026-08-31 — Slice 1A (foundation) complete on `slice1a-foundation`: auth, app shell, catalog, inventory ledger/ATP, CSV import, invitations, CI. PR #1 open, CI green.

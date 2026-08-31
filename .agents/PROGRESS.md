# PROGRESS

Running log of what's done, in flight, and next. Newest at top. Keep entries to one line each; details belong in commits and docs.

## Now
- [ ] Slice 1B starts with UI-plan rev-3 Step 1 contracts/schema gates, then orders → allocations → ship → invoices.

## Done
- 2026-08-31 — Wireframes: phone/desk toggle renders all 50 frames as desktop views from the same bodies (rail/top-nav shells, dialog sheets, 32 px cursor-density controls); plan §1 reference updated.
- 2026-08-31 — Fresh-eyes UI plan rev 3 + rendered artifact: honest persona tap audits, proposal safety, exact registry/atomicity contracts, complete portal/nav/state coverage, wet-phone tokens, entry-first build order, and explicit implementation/schema gates; v1 CONFLICT/REPEAT cross-check folded in; PR #3's 11 gap screens reconciled: consolidated into rev-3 frames or dropped per plan decisions (Notifications history, portal writes).
- 2026-08-31 — Wireframes: 11 gap screens added (settings sub-pages, new order/PO, customer/product/price-list editors, recipe editor, portal account, keg return); later subsumed by rev 3.
- 2026-08-31 — Pi `/simplify` alias and harness-compatible `.agents/skills/simplify` workflow for behavior-preserving cleanup of recently modified code.
- 2026-08-31 — Harness-neutral multi-model workflow in `.agents/orchestration/`: tiered Grok/Codex/Claude routing, hard run budgets, approval gates, read-only reviewers, run artifacts, and dependency-free tests.
- 2026-08-31 — Wireframes for all 50 planned screens (`2026-08-31-mgr-wireframes.html`, published as artifact); UI plan rev 2 with 13 added flows and entry-first build order.
- 2026-08-31 — UI layout plan (mobile-first, composer + forms, all ten slices): `2026-08-31-mgr-ui-layout-plan.md`, draft awaiting Ted.
- 2026-08-31 — Docs reconciled to the baseline (README test list, rule count, stale skip notes, v1-review status, proxy migration).
- 2026-08-31 — `tests/schema-rules.test.ts` (pg_catalog gates), all rules active; definer fns revoked from anon/public in the baseline.
- 2026-08-31 — Single baseline migration `00001_baseline.sql` (58 tables, all ten slices) replaces the two slice-1A migrations; design in `2026-08-31-mgr-schema-design.md`; `tests/schema-conventions.test.ts` proves composite FKs, lot trigger, append-only ledgers.
- 2026-08-31 — Reviewed MGR v1; adopted iron rule 5 (multi-write = one plpgsql fn, `tests/write-atomicity.test.ts`) and `brewing-domain.md`. Remaining pulls listed in the review doc §3.
- 2026-08-31 — Schema design decisions doc for the single-baseline migration.
- 2026-08-31 — Slice 1A (foundation) complete on `slice1a-foundation`: auth, app shell, catalog, inventory ledger/ATP, CSV import, invitations, CI. PR #1 open, CI green.

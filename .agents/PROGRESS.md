# PROGRESS

Running log of what's done, in flight, and next. Newest at top. Keep entries to one line each; details belong in commits and docs.

## Now
- [ ] Slice 1B starts with UI-plan rev-3 Step 1 contracts/schema gates, then orders → allocations → ship → invoices.

## Done
- 2026-08-31 — Customer user guide established as the complete plain-language manual for every available screen/action; post-merge Claude audit enforces action steps, fields/options, permissions, results, corrections, and errors.
- 2026-08-31 — Read-only Claude Code post-merge documentation agent audits each merged PR against the owning docs and opens one idempotent follow-up issue for high-confidence drift; review tools are denied common runner secret paths and credential dotfiles.
- 2026-08-31 — `http-api` agent keeps README § HTTP API in lockstep with registered commands (`/http-api`).
- 2026-08-31 — Public API is the existing command endpoint; Bearer Supabase access tokens accepted alongside cookie sessions (`tests/api-command.test.ts`).
- 2026-08-31 — Slice 1B orders design spec (`2026-08-31-mgr-slice1b-orders-design.md`) and slice 1C implementation plan (`2026-08-31-slice1c-qbo-ai-chat.md`: QBO invoices-out/payments-back + AI chat composer, 11 TDD tasks in two independent tracks) written; PR #11.
- 2026-08-31 — Dreaming: post-merge CI curation of agent docs via dreaming/main PR (spec: superpowers/specs/2026-08-31-dreaming-design.md). Live run pending.
- 2026-08-31 — Rev-3 simplification pass on latest main: actionable Today/Work ordering, Beer as a landing page, complete movement intents, simpler order state, separated taproom tasks, explicit cellar reading/remainder semantics, richer irreversible previews, and filing copy that does not imply transmission.
- 2026-08-31 — Recipe development loop designed: version snapshots assumptions + per-ingredient extract; OG/FG/ABV computed by one registry-layer formula (live preview + server reads; never stored, no view); per-batch actuals derived from readings via get_recipe_outcomes shown as deltas. Derived-values principle recorded in schema-decisions.
- 2026-08-31 — Wireframes + plan corrected per frontend review: frames draw only user-visible UI (state chips, gate names, tap audits moved to under-frame annotations), human copy for gated actions, named row verbs replace universal "Open", Today redrawn role-filtered as full-size 16px exemplar with ship-scale callout, hairline surfaces, cellar tiles lead with fill/occupancy, portal Order is a buyer catalog ("Ships from Warehouse", 48×48 steppers), composer proposal leads with signed effect, desk rail hierarchy + one-column default, safe-area on both shells, header Search/Me controls; plan §preamble/§3/§4/§5/§5b updated in step.
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

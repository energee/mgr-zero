# PROGRESS

Running log of what's done, in flight, and next. Newest at top. Keep entries to one line each; details belong in commits and docs.

## Now
- [ ] Replace the two existing migrations with the single baseline schema (all ten slices).

## Done
- 2026-08-31 — Reviewed MGR v1; adopted iron rule 5 (multi-write = one plpgsql fn, `tests/write-atomicity.test.ts`) and `brewing-domain.md`. Remaining pulls listed in the review doc §3.
- 2026-08-31 — Schema design decisions doc for the single-baseline migration.
- 2026-08-31 — Slice 1A (foundation) complete on `slice1a-foundation`: auth, app shell, catalog, inventory ledger/ATP, CSV import, invitations, CI. PR #1 open, CI green.

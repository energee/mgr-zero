# MEMORY

Durable facts and decisions for agents working on mgr. Update when a decision is made; delete when it stops being true. Not a changelog — see PROGRESS.md.

## Project
- mgr (github.com/energee/mgr-zero): multi-brewery operations SaaS. Next.js App Router + Supabase.
- Nothing is deployed. No hosted Supabase or Vercel project exists; deployment needs Ted's go-ahead.
- Setup, ports, dev login: `README.md`. Ownership + iron rules: `ARCHITECTURE.md`.

## Decisions
- One baseline migration covering all ten slices (~55 tables) instead of accumulating migrations. Pre-deploy, the baseline is edited in place. Details: `docs/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.
- Product spec: `docs/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`.
- Schema conventions live in `ARCHITECTURE.md`; the quote behind "no status columns" is Ted's: "if it won't be accurate I don't want it".

## Process
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Operating loop and authority boundaries are in `AGENTS.md`; don't repeat them here.

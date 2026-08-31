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

## Gotchas (carried from MGR v1)
- PostgREST caches the schema: after DDL, errors naming a column/enum that plainly exists are a stale cache — `NOTIFY pgrst, 'reload schema'` or restart the stack before debugging.
- `Unregistered API key` / `Invalid API key` with no Postgres error code means the key was rejected before PostgREST: URL and key are from different Supabase instances. Check `NEXT_PUBLIC_SUPABASE_URL` first; `curl -sD- -H "apikey: $KEY" "$URL/rest/v1/"` gives the real answer.
- `security definer` functions get PUBLIC execute by default; revoke from `public, anon` or the RLS helpers are callable unauthenticated (`tests/schema-rules.test.ts`, currently skipped pending the baseline).

## Process
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Operating loop and authority boundaries are in `AGENTS.md`; don't repeat them here.

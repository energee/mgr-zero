# MEMORY

Durable facts and decisions for agents working on mgr. Update when a decision is made; delete when it stops being true. Not a changelog — see PROGRESS.md.

## Project
- mgr (github.com/energee/mgr-zero): multi-brewery operations SaaS. Next.js App Router + Supabase.
- Nothing is deployed. No hosted Supabase or Vercel project exists; deployment needs Ted's go-ahead.
- Setup, ports, dev login: `README.md`. Ownership + iron rules: `.agents/ARCHITECTURE.md`.

## Decisions
- One baseline migration covering all ten slices (58 tables) instead of accumulating migrations. Pre-deploy, the baseline is edited in place. Details: `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.
- Product spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`.
- Schema conventions live in `.agents/ARCHITECTURE.md`; the quote behind "no status columns" is Ted's: "if it won't be accurate I don't want it".
- Cross-provider agent work is harness-neutral and owned by `.agents/orchestration/`: Codex is the sole writer, Grok plans/critiques, Claude reviews high-risk work, and complex/high-risk implementation requires a separate approval command.
- Every merged PR gets one read-only Claude Code documentation audit; high-confidence omissions or contradictions are tracked in one follow-up issue rather than committed directly to `main` by a bot. The Claude review job has read-only repo permissions, only Read/Grep/Glob tools, and Claude Code permission denies for common runner secret paths and credential dotfiles.
- `docs/user-guide.md` is the customer-facing owner for the entire available application. It documents every screen/action in customer language (steps, fields/options, permissions, results, corrections, and errors) and never exposes development phases or internals.
- UI source of truth is UI plan rev 3 plus the exactly 50-frame
  `2026-08-31-mgr-wireframes.html`; change navigation/flows and the `SCREENS`
  array together. Staff uses Today/Beer/Work/More; the wholesale portal has its
  own Order/Orders/Invoices/Account shell. Frames draw only user-visible UI —
  the annotation, gate-copy, and Today-exemplar rules live in the plan
  preamble and §5, not here.
- Every AI mutation is proposal-only: registry-owned server preview,
  canonical effects, explicit user confirmation, same `requestId` +
  `previewToken`, and stale revalidation. There is no generic Undo. Replay and
  offline outbox stay disabled until durable server dedupe/result replay exists;
  voice and server chat history are deferred.
- Before affected UI work, close the explicit rev-3 gates: pre-tenant
  provisioning, invite compensation, import per-row RPC/dedupe, FG correction
  identity/report semantics, durable taproom count snapshots, shipment invoice
  timing, portal-safe fulfillment source, exact QBO payload persistence, and
  typed batch-completion/loss reconciliation. A registry name or client-held ID
  does not prove a gate is met.
- The public HTTP API is `POST /api/command` (the command registry). Auth is
  the existing Supabase user session: browser cookies, or
  `Authorization: Bearer <access_token>` from password grant against the
  Supabase Auth URL. No resource REST routes, no API keys, until a non-user
  machine client exists.

## Gotchas (carried from MGR v1)
- PostgREST caches the schema: after DDL, errors naming a column/enum that plainly exists are a stale cache — `NOTIFY pgrst, 'reload schema'` or restart the stack before debugging.
- `Unregistered API key` / `Invalid API key` with no Postgres error code means the key was rejected before PostgREST: URL and key are from different Supabase instances. Check `NEXT_PUBLIC_SUPABASE_URL` first; `curl -sD- -H "apikey: $KEY" "$URL/rest/v1/"` gives the real answer.
- `security definer` functions get PUBLIC execute by default; revoke from `public, anon` or the RLS helpers are callable unauthenticated (gated by `tests/schema-rules.test.ts`).

## Process
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Operating loop and authority boundaries are in `AGENTS.md`; don't repeat them here.

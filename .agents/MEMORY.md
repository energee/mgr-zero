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
- UI source of truth is UI plan rev 3 plus the exactly 63-frame
  `2026-08-31-mgr-wireframes.html`; change navigation/flows and the `SCREENS`
  array together (the count is not sacred — a real operator job gets a real
  body, never an annotation chip). Staff uses Today/Beer/Work/More; the wholesale portal has its
  own Order/Orders/Invoices/Account shell. Frames draw only user-visible UI —
  the annotation, gate-copy, and Today-exemplar rules live in the plan
  preamble and §5, not here.
- Every merged PR gets one read-only Claude Code documentation audit; high-confidence omissions or contradictions are tracked in one follow-up issue rather than committed directly to `main` by a bot. The Claude review job has read-only repo permissions, only Read/Grep/Glob tools, and Claude Code permission denies for common runner secret paths and credential dotfiles.
- `docs/user-guide.md` is the customer-facing owner for the entire available application. It documents every screen/action in customer language (steps, fields/options, permissions, results, corrections, and errors) and never exposes development phases or internals.
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
- Public-schema table DML is revoked from `anon` and `authenticated`; writes use
  explicitly granted `security definer` RPCs that derive actor/tenant/role and
  bind `(actor, requestId)` to brewery, command, canonical payload, and result
  in `private.command_requests`. Local Supabase disables automatic Data API
  grants so the baseline ACL is self-contained.
- Until the durable Task 13 import workflow lands, each import row operation
  derives a deterministic UUIDv8 from SHA-256 of the complete top-level
  `requestId`, row number, and operation number. This is replay-safe but not
  durable job state.

- Staff writes are authorized in SQL, not only in the registry: each mutation
  RPC is `security definer`, calls `private.assert_staff(brewery, roles)` (or
  `private.assert_customer`) first, then claims its `p_request_id` in the
  ledger. Application roles hold no table DML, so raw Data API writes fail with
  42501 for every browser JWT. (2026-09-01 merge decision: PR #27's
  `security invoker` + `require_authorized_staff_rpc` + `request.path`
  policies were superseded by this model; only its additive work was kept.)
  New writers must be granted explicitly in the baseline's Data API grants
  section and pinned in `tests/data-api-boundary.test.ts` /
  `tests/rls-command-boundary.test.ts` (nothing is auto-exposed).
- Integration credentials never sit in a public table. `private.integration_tokens`
  is reachable only through `lib/supabase/integration-tokens.ts` (server-only,
  admin/sales, visible-connection check, then service-only RPC that rechecks
  membership); connection delete/identity change purges the token row.
- `import_csv`, `invite_staff`, `invite_customer_user` stay registered but fail
  closed (P1.9) until the durable external-write gate exists; the Import screen
  and invite forms are removed rather than hidden.
- Chat notifications are staff-only and Slack-first but provider-neutral (schema
  and contracts never name Slack): one active installation per brewery/provider,
  personal App Home/DM plus one admin-approved digest channel, no quiet-hours
  bypass in the first release, and Slack→MGR writes stay projection-only until
  the trust/replay gates close. `lib/chat/jobs.ts` is the one additional
  iron-rule-4 service-role owner (scan/lease/deliver/cleanup), gated by a
  constant-time bearer check, never a user token. Design:
  `.agents/superpowers/specs/2026-09-01-mgr-chat-notifications-design.md`;
  plan and current task status: `.agents/PROGRESS.md`.

## Gotchas (carried from MGR v1)
- PostgREST caches the schema: after DDL, errors naming a column/enum that plainly exists are a stale cache — `NOTIFY pgrst, 'reload schema'` or restart the stack before debugging.
- `Unregistered API key` / `Invalid API key` with no Postgres error code means the key was rejected before PostgREST: URL and key are from different Supabase instances. Check `NEXT_PUBLIC_SUPABASE_URL` first; `curl -sD- -H "apikey: $KEY" "$URL/rest/v1/"` gives the real answer.
- `security definer` functions get PUBLIC execute by default; revoke from `public, anon` or the RLS helpers are callable unauthenticated (gated by `tests/schema-rules.test.ts`).
- One local Supabase stack serves every worktree. A `supabase db reset` in another session silently swaps the loaded baseline; the tell is a burst of "relation does not exist" / undefined-column failures across suites. Reset from your own worktree and run the suite immediately; if it flips mid-run, check `docker ps` for a freshly restarted `supabase_db_mgr`.
- Worktrees don't inherit `.env.local` (gitignored, per-checkout) — `npm test`/`npm run dev`/`npm run test:e2e` in a fresh worktree fail silently with `supabaseKey is required` until it's copied in from the main checkout.
- `claude-code-action` rejects non-human PR authors unless `allowed_bots` is set. Dream PRs (`dreaming/main`) skip the `claude-review` job entirely so the check is skipped, not failed — do not allowlist the bot just to review its own doc PR.

## Process
- Reviewers that verify by execution (writing to the live DB) find real bugs; read-only reviews find style.
- Visually check rendered UI before calling UI work done (a serif-font regression went unnoticed).
- Operating loop and authority boundaries are in `AGENTS.md`; don't repeat them here.

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
- UI source of truth is UI plan rev 4 plus the exactly 73-frame
  `2026-08-31-mgr-wireframes.html`; change navigation/flows and the `SCREENS`
  array together (the count is not sacred — a real operator job gets a real
  body, never an annotation chip). Staff uses Today/Beer/Work/More; the wholesale portal has its
  own Order/Orders/Invoices/Account shell. Frames draw only user-visible UI —
  the annotation, gate-copy, and Today-exemplar rules live in the plan
  preamble and §5, not here.
- Every merged PR gets a full customer-documentation pass, with `workflow_dispatch` on `main` as the recovery path. Claude has read-only GitHub permissions and may edit only the master, staff, and portal guide HTML files; a separate deterministic job rejects any wider or active-content diff and maintains one reviewable `documentation/user-guide` PR. The agent never commits directly to `main`.
- `docs/user-guide.html` is the documentation master linking audience-separated `staff-guide.html` and `portal-guide.html`. Together they cover every current screen/action in customer language (steps, fields/options/defaults/limits, permissions, connected effects, corrections, empty/error states, and unavailable controls) without mixing staff and portal instructions or exposing internals.
- Customer guides stay visually neutral and close to browser defaults for now. A future MGR design language will be developed once and carried across the application, API documentation, and customer documentation rather than designed separately in any one surface.
- Every AI mutation is proposal-only: registry-owned server preview,
  canonical effects, explicit user confirmation, same `requestId` +
  `previewToken`, and stale revalidation. There is no generic Undo. Replay and
  offline outbox stay disabled until durable server dedupe/result replay exists;
  voice and server chat history are deferred.
- Before affected UI work, close the explicit rev-4 gates: pre-tenant
  provisioning, invite compensation, import per-row RPC/dedupe, FG correction
  identity/report semantics, durable taproom count snapshots, shipment invoice
  timing, exact QBO payload persistence, and typed batch-completion/loss
  reconciliation. Portal fulfillment source is closed
  (`set_portal_fulfillment_source`, PR #29). A registry name or client-held ID
  does not prove a gate is met.
- The public HTTP API is `POST /api/command` (the command registry). Auth is
  the existing Supabase user session: browser cookies, or
  `Authorization: Bearer <access_token>` from password grant against the
  Supabase Auth URL. No resource REST routes, no API keys, until a non-user
  machine client exists.
- Public-schema table DML is revoked from `anon` and `authenticated`; local
  Supabase also disables automatic Data API grants so the baseline ACL is
  self-contained. Staff writes are authorized in SQL, not only in the
  registry: each mutation RPC is `security definer`, calls
  `private.assert_staff(brewery, roles)` (or `private.assert_customer`)
  first, then claims `(actor, requestId)` against brewery, command, canonical
  payload, and result in `private.command_requests`. Raw Data API writes fail
  42501 for every browser JWT. (2026-09-01 merge decision: PR #27's
  `security invoker` + `require_authorized_staff_rpc` + `request.path`
  policies were superseded by this model; only its additive work was kept.)
  New writers must be granted explicitly in the baseline's Data API grants
  section and pinned in `tests/data-api-boundary.test.ts` /
  `tests/rls-command-boundary.test.ts` (nothing is auto-exposed).
- Until the durable Task 13 import workflow lands, each import row operation
  derives a deterministic UUIDv8 from SHA-256 of the complete top-level
  `requestId`, row number, and operation number. This is replay-safe but not
  durable job state.
- Integration credentials never sit in a public table. `private.integration_tokens`
  is reachable only through `lib/supabase/integration-tokens.ts` (server-only,
  admin/sales, visible-connection check, then service-only RPC that rechecks
  membership); connection delete/identity change purges the token row.
- `import_csv`, `invite_staff`, `invite_customer_user` stay registered but fail
  closed (P1.9) until the durable external-write gate exists; the Import screen
  and invite forms are removed rather than hidden.

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
- Tests never read design docs. `tests/chat-preview.test.ts` once grepped the wireframes HTML as a drift guard; the wireframe moved and the test went red for the wrong reason. Code-to-code assertions (fixtures ↔ renderer) carry the guarantee; docs drift by design (2026-09-02).

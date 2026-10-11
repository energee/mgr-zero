# MGR

MGR is a multi-tenant brewery operations system built on Next.js (App
Router, TypeScript) and Supabase (Postgres, Auth, RLS): catalog, immutable
inventory ledger, allocations/ATP, staged CSV import, staff and buyer
invitations (existing accounts accept a pending invitation after signing in),
orders, shipments, invoicing, the customer portal, brewing, purchasing,
compliance, QuickBooks (manual payment sync), Square POS, Slack notifications,
and Ask MGR chat. The staff and portal guides under `content/docs/` describe
what exists today.

- Documentation: [`content/docs/`](content/docs/) — Fumadocs MDX served at `/docs` (`index.mdx` chooses between the staff and customer-portal guides and the HTTP API reference at `/docs/api`, whose operations are generated from the command registry and the screens by `bun run docs:api`; search at `/api/search`)
- Spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`
- Historical plan (superseded): `.agents/superpowers/plans/2026-08-30-slice1a-foundation.md`
- Schema: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why)

## Iron rules

See `.agents/ARCHITECTURE.md` for the ownership map and the five iron rules
(commands-only, append-only ledger, RLS everywhere, admin client confined,
multi-row writes are one Postgres function)
and what enforces each one. Agents start at `AGENTS.md`.

## Local development

Requires Node.js 24.x and Bun 1.3.x. The repository pins Node in `.node-version`
and `package.json`, and Bun in `.bun-version` / `packageManager`; use Bun for
installs and scripts, and Node 24 as the Next.js runtime.

Local Supabase runs on non-default ports (54341/54342/54343) configured
in the committed `supabase/config.toml`. These ports are used by every
developer and in CI — they were chosen to avoid colliding with a
default-port Supabase project running alongside locally. Verify the live
values with `bunx supabase status`:

```
API URL:  http://127.0.0.1:54341
DB URL:   postgresql://postgres:postgres@127.0.0.1:54342/postgres
Studio:   http://127.0.0.1:54343
```

CI (`.github/workflows/ci.yml`) derives env vars from
`bunx supabase status -o env` rather than hardcoding them, so the setup
automatically adapts to the values in `config.toml`.

### Setup

```bash
bun install
bunx supabase start        # starts the local Postgres/Auth/Studio stack
bunx supabase status -o env | node scripts/supabase-env.mjs > .env.local
```

The mapper converts the Supabase CLI's local key labels into the application's
modern environment contract; nothing else is needed in `.env.local`.
`/api/command` refuses excess requests with `429 rate_limited` and a
`Retry-After` header.

`VERCEL_ENV` is optional; when set it must be `production`, `preview`, or
`development` (`lib/env/server-parser.ts`). Vercel sets it on deploys; locally
it is normally absent.

`vercel.json` pins functions to `iad1` (Virginia), alongside the production
Supabase project `uogrvqmrbmolvtftotsf` in `us-east-1`. Recheck this pairing if the database moves:
sequential Auth and Data API requests otherwise pay cross-region latency.

QuickBooks setup uses server-only `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`,
`QBO_REDIRECT_URI`, and `QBO_API_BASE`. The example API base is Intuit sandbox;
production must use `https://quickbooks.api.intuit.com`. The redirect must
exactly match the callback registered with Intuit.

### Slack notifications

Slack setup uses `APP_URL`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
`SLACK_SIGNING_SECRET`, `CHAT_SDK_ENCRYPTION_KEY`, `CHAT_STATE_DATABASE_URL`,
and `CHAT_JOB_SECRET`. Keep all but `APP_URL` server-only. `APP_URL` is the
public HTTPS origin used for OAuth, events, and interactivity callbacks; use an
owned preview or tunnel origin, not localhost, an IP address, or a reserved
placeholder domain.

Create the Chat SDK login interactively as a database administrator. It is a
login member of only the migration-owned `mgr_chat_sdk` role and defaults to
the private `chat_sdk` schema:

```sql
create role mgr_chat_runtime login;
grant mgr_chat_sdk to mgr_chat_runtime;
alter role mgr_chat_runtime set search_path = chat_sdk;
\password mgr_chat_runtime
```

Set `CHAT_STATE_DATABASE_URL` to that dedicated login, never the database owner.
On the hosted pooler only, also set `CHAT_STATE_DATABASE_CA` to the PEM
certificate from Supabase Database Settings; leave it unset locally.
Its password is entered at the `psql` prompt and is not committed. Generate the
Slack manifest after setting the public origin:

```bash
bun run render:slack-manifest
```

Import `.local/slack-app-manifest.yml` in Slack, then confirm the generated
OAuth redirect, events URL, and interactivity URL use the same tunnel or
preview origin. Rotate Slack client/signing secrets and `CHAT_JOB_SECRET` in
the deployment secret store. To rotate `CHAT_SDK_ENCRYPTION_KEY`, disconnect
installations and finish credential cleanup first, replace the key, then
reauthorize each workspace; old encrypted installation tokens cannot be read
with a new key. The scheduled chat-state cleanup endpoint is
`POST /api/chat/jobs/cleanup`, authenticated with `CHAT_JOB_SECRET`.

`MGR_DEDICATED=1` hides the hosted-web **Create brewery** page and makes brewery
creation refuse (403) for every caller, web or API. The database function is
service-role only, so signed-in accounts cannot bypass the server through
PostgREST (#467). Omit it for the hosted web entry.

Accounts are invitation-only: local Auth sets `enable_signup = false`, and the
invite path (`inviteUserByEmail`) and admin-created accounts still work. Hosted
Supabase Auth keeps its own signup setting; turn off **Allow new users to sign
up** in the hosted project separately.

Local Auth configs allow password-recovery callbacks on localhost and 127.0.0.1,
ports 3000 and 3002, under `/auth/confirm`. Restart the relevant local Supabase
stack after changing its redirect allowlist. Hosted Auth needs its own approved
origin and invitation template when deployment is configured.

Apply migrations and seed a dev user/brewery:

```bash
bunx supabase db reset             # applies supabase/migrations/*.sql
bun --env-file=.env.local scripts/seed-dev.ts   # idempotent; creates "Demo Brewing" + dev@mgr.local
```

Seeded dev login: `dev@mgr.local` / `dev-password-1` (dev-only credential —
never used outside local development). A customer-only account (a
`customer_users` row with no `brewery_users` row) lands on `/portal` instead
of `/` after login — that's the wholesale customer portal, not a bug.

Working in a worktree: create it with `scripts/worktree.sh <branch> [base]`.
It checks out `.agents/worktrees/<branch>`, symlinks the gitignored
`.env.local` and `.env.test.local` from the main checkout, and runs
`bun install`. A plain `git worktree add` has neither, so Supabase calls fail
with `supabaseKey is required`.

```bash
bun run dev   # http://localhost:3000
```

## Tests

```bash
bun run test       # vitest run — real local Supabase, not mocks
bun run lint       # eslint, incl. the admin-client import guard
bunx tsc --noEmit  # typecheck
bun run build      # production build
bun run test:e2e   # agent-browser smoke — local only, not run in CI
bun tests-e2e/mobile-command-surface.ts # fixture-only overlay regression; no seed or writes
```

`bun tests-e2e/mobile-command-surface.ts [screenshot-directory]` checks Reading and Count actions, Count's Location Select, and minimized-composer Tabs. It starts its own server on an available port; stop this worktree's dev server first because Next permits only one `.next/dev` owner. It never stops an existing server or seeds data. A leftover lock from a crashed server is also refused; inspect it yourself rather than having the runner delete an unknown lock. The 390×500 viewport is a short-viewport proxy, not proof of a real phone soft keyboard.

`bun run test:e2e` drives the browser with `agent-browser` (Vercel's browser
automation CLI) instead of Playwright. It runs agent-browser's bundled Chrome
by default; `E2E_ENGINES=lightpanda,chrome` re-enables the engine-fallback
chain (each engine gets freshly seeded data; the script prints which engine
passed). Lightpanda renders the app but is currently blocked by
engine/adapter gaps: Lightpanda currently cannot drive React controlled inputs (checked 2026-08-31); retest after
`brew upgrade lightpanda` or an agent-browser release. The script starts its own `next dev` on port
3100 (not 3000, so it never collides with another worktree's dev server on
the same repo), reusing one already running there, and stops what it
started on both success and failure. It needs `bunx supabase start` and a
`.env.local` in place, same as the vitest suite. See `tests-e2e/portal-smoke.ts`.

Each `tests/*.test.ts` opens with a header comment stating what it gates; `ls tests/` is the index. The `rls-*` and `schema-*` suites read pg_catalog and are the schema's merge gate; `commands-import` and `commands-invites` cover staged import rows and staff/buyer invitations.

Tests run against a real local Supabase stack (not a mock), but **their own
throwaway one**: `bash scripts/test-db.sh` starts a second stack (project
`mgr_test`, config in `tests/supabase/`, API 54351 / DB 54352, same baseline
via a migrations symlink), resets its database, and writes `.env.test.local`,
which vitest pins over inherited Bun/app settings. Local tests fail before setup unless this file names localhost ports 54351/54352 and test credentials. Re-run the script after adding a
migration; it resets automatically when the migrations change. The app stack (`bunx supabase start`,
5434x) is never touched by tests, so the brewery you are clicking in `next dev`
survives a test run and stale test rows (see `chat-jobs`) cannot pile up there.
Without `.env.test.local`, local vitest refuses to run. CI keeps its separately provisioned disposable configuration.

### Database types

Supabase clients use `lib/supabase/database.generated.ts`, generated from the
committed migrations. After applying migrations to the disposable test stack,
run `bun run types:database`. Pass a local disposable database URL as the first
argument when using a separate stack. Do not generate from a hosted or stale
application database. CI checks the generated file against its fresh stack.

`lib/supabase/database.ts` records facts the generator cannot infer: nullable
RPC arguments, trigger-populated insert fields, and non-null stock views.
JSON RPC result shapes live in `lib/supabase/rpc-results.ts`; retain integration
coverage when changing those contracts. Unknown external data still needs
validation before use. Tests may use `tests/raw-database.ts` solely for arbitrary
fixtures and deliberate invalid/private requests; its results remain unknown.

## Deployment

Hosted deployments exist; this does not establish release readiness. See the
[2026-09-18 release evidence](docs/operations/release-readiness-2026-09-18.md)
for the observed revision and outstanding gates. Before creating or changing
hosted projects, obtain the approvals in the release checklist. Configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in Vercel, plus
`POSTGRES_URL_NON_POOLING` in Production. Production builds run
`scripts/vercel-build.sh` (the `vercel.json` build command), which pushes
migrations with `supabase db push` before `next build`; a manual
`bunx supabase db push` is only for a preview project or recovery. Then verify
login → catalog → inventory on the deployed URL. Follow the full [hosted release checklist](docs/operations/release-checklist.md)
for approvals, environment separation, hosted advisors, smoke tests, and rollback evidence.

## CI

Enable the tracked pre-push check once per clone:

```bash
git config core.hooksPath .githooks
```

For code changes it runs lint, the typecheck, and the pure-screen vitest
files — about a minute. `next build` and the database-backed suites are left
to CI, which runs them in parallel jobs against a database built from scratch
and is the merge gate; locally they took ten minutes and reset a database
other worktrees share. Run them by hand with `bash scripts/test-db.sh && bunx
vitest run`. Documentation-only pushes skip the gate.

`.github/workflows/ci.yml` runs on every push and pull request: installs
deps, starts a local Supabase stack with only the services the tests use
(Postgres, Auth, PostgREST, Kong, and the mailpit SMTP sink Auth sends
invites to — `supabase start -x …` excludes the rest),
which applies migrations on the fresh stack, runs the full vitest suite
against it, then
`bun run lint`, `tsc --noEmit` and `bun run build`. This is the merge gate — RLS and
command-registry correctness are enforced here, not just locally.

After a pull request merges—or when manually dispatched on `main`—
`.github/workflows/documentation-agent.yml` audits every current user-facing
route, not only the triggering change, and updates the
staff and portal field manuals linked from `content/docs/index.mdx` when behavior has drifted. The
Claude job has read-only GitHub permissions and may edit only those three MDX files. A separate
deterministic job rejects wider or active-content changes, then maintains one
reviewable `documentation/user-guide` pull request; the bot never commits directly
to `main`. The validated guide changes travel as a binary patch, applied
three-way to fresh `main` with full history. Unrelated intervening guide updates
are preserved; conflicting edits fail publication before any commit or push.
An empty audit or an already-applied correction produces no commit and leaves
any existing maintenance PR unchanged. The App-token push still runs CI on the documentation PR, and human review remains required.

### Buyer order-confirmation email

Wholesale confirmation queues mail for the customer's currently linked portal
buyers. No linked buyers produces a blocked `no_recipient` record. Admin/Sales
can read order email states through the [Orders API](/docs/api/orders). The
status `accepted` means Resend accepted it, not that it reached an inbox.

The internal `POST /api/email/jobs/deliver` worker requires a bearer token
matching `ORDER_EMAIL_JOB_SECRET`. It uses `RESEND_API_KEY` and
`ORDER_EMAIL_FROM`; missing configuration refuses the job before any lease.
Each call processes at most ten emails. A scheduler must call it regularly;
this repository change does not configure one or enable hosted sending.
Domain, provider credentials and scheduler setup require user approval (#311).
Tests mock the provider and send no real mail.

### Data retention and closing a brewery (#766)

`POST /api/retention/jobs/prune` requires a bearer token matching
`RETENTION_JOB_SECRET`. It removes command replay records
(`private.command_requests`) older than 90 days, keeping unfinished ones and any
that QuickBooks/Square sync history or portal quotes still reference. A
scheduler must call it (daily is enough); this repository does not configure one.

Closing a brewery and exporting its records are admin-run, with a direct
service-role `DATABASE_URL`:

- `bun scripts/brewery-lifecycle.ts export <breweryId> <dir>` writes one CSV per
  business table (integration and chat plumbing excluded) from one consistent snapshot.
- `bun scripts/brewery-lifecycle.ts close <breweryId>` ends every staff and buyer
  login, revokes open invitations and stamps `breweries.closed_at`. Disconnect
  QuickBooks, Square and Slack in Settings first; close refuses otherwise. No
  record is removed. Keep records for 3 years from the printed date; removing
  them after that is a manual step.

Worker failures emit `Order email delivery failure` with sanitized `stage` and
`category` fields. Provider failures include `providerStatus` when an HTTP
response exists. A validated opaque `deliveryId` identifies a leased delivery;
logs never include recipients, message contents, credentials, raw provider
payloads, or exception messages. The status API keeps its existing generic
`provider_uncertain` / `provider_rejected` codes; detailed causes are operator
logs, not customer-facing fields. Provider retries still return HTTP 200 with a
retry count; fatal worker failures still return a generic HTTP 500.

Use the log category to recover before the saved 23-hour cutoff:
- `configuration` at the configuration stage: restore the worker's provider,
  sender, or service-client settings before the next scheduled run.
- `authentication` with HTTP 401/403: investigate the Resend key and sending
  domain authorization. Fix approved configuration promptly; these still retry.
- `rate_limit` (429), `outage` (5xx), `concurrent_request` (idempotent 409),
  `network`, or `malformed_response` at send: investigate provider health or
  response handling and let scheduled retries reuse the frozen request.
- `rejected` at send: investigate the definitive provider rejection using its
  HTTP status and delivery identity; the existing delivery stays blocked.
- `database` at lease or record_result: restore database access. A record_result
  failure may follow provider acceptance; never create a replacement send.
- `malformed_response` at lease: investigate the lease RPC contract before
  restarting. No provider call occurs for an invalid leased batch.
- `lease_lost` at record_result or `lease_expired` at send: investigate worker
  timing/concurrency; let the lease workflow recover with the same identity.
- `retry_window_expired`: the lease RPC normally blocks expired deliveries
  before returning them, so inspect this code through the status API. The worker
  logs it only when the cutoff passes after leasing. Investigate the provider's
  outcome; do not reset the window, change the provider key, or automatically
  resend a blocked delivery.

Retries preserve the original recipient, body, sender and provider key.
[Resend retains idempotency keys for 24 hours](https://resend.com/changelog/idempotency-keys);
MGR stops after 23 hours from the first attempt. A blocked uncertain delivery
requires provider investigation and never automatically receives a new key.
Removed buyers or changed addresses suppress pending mail. Existing historical
confirmations are not backfilled, and a confirmed order is not undone by a
failed email.

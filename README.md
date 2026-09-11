# MGR

MGR is a multi-tenant brewery operations system: catalog, immutable
inventory ledger, allocations/ATP, CSV import, and staff/customer
invitations, built on Next.js (App Router, TypeScript) and Supabase
(Postgres, Auth, RLS). This repo currently covers **Slice 1A — Foundation**
(tenancy, ledger, catalog; import and invites registered but fail closed) and **Slice 1B — Orders**
(orders, shipments, invoicing, customer portal). QBO integration and AI
chat are Slice 1C.

- Documentation: [`content/docs/`](content/docs/) — Fumadocs MDX served at `/docs` (`index.mdx` chooses between the staff and customer-portal guides and the HTTP API reference at `/docs/api`, whose operations are generated from the command registry and the screens by `bun run docs:api`; search at `/api/search`)
- Spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`
- Plan: `.agents/superpowers/plans/2026-08-30-slice1a-foundation.md`
- Schema: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why)

## Iron rules

See `.agents/ARCHITECTURE.md` for the ownership map and the five iron rules
(commands-only, append-only ledger, RLS everywhere, admin client confined,
multi-row writes are one Postgres function)
and what enforces each one. Agents start at `AGENTS.md`.

## Local development

Requires Node.js 22.x and Bun 1.3.x. The repository pins Node in `.node-version`
and `package.json`, and Bun in `.bun-version` / `packageManager`; use Bun for
installs and scripts, and Node 22 as the Next.js runtime.

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
modern environment contract; nothing else is needed in `.env.local`. Rate
limiting on `/api/command`: not yet implemented (authz audit A1).

`VERCEL_ENV` is optional; when set it must be `production`, `preview`, or
`development` (`lib/env/server-parser.ts`). Vercel sets it on deploys; locally
it is normally absent.

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

`MGR_DEDICATED=1` hides and rejects the hosted-web **Create brewery** page and action.
It does not block authenticated API provisioning or database bootstrap. Omit it
for the hosted web entry.

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

Working in a worktree (`.agents/worktrees/<branch>`): `.env.local` is
gitignored and **not** inherited from the main checkout — copy it in
(`cp ../../../.env.local .env.local` or similar) before running `bun run test`
or `bun run dev` there, or Supabase calls fail with `supabaseKey is
required`.

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
```

`bun run test:e2e` drives the browser with `agent-browser` (Vercel's browser
automation CLI) instead of Playwright. It runs agent-browser's bundled Chrome
by default; `E2E_ENGINES=lightpanda,chrome` re-enables the engine-fallback
chain (each engine gets freshly seeded data; the script prints which engine
passed). Lightpanda renders the app but is currently blocked by
engine/adapter gaps — benchmark + status in
`.ecc/benchmarks/e2e-engines-2026-08-31.json`; retest after
`brew upgrade lightpanda` or an agent-browser release. The script starts its own `next dev` on port
3100 (not 3000, so it never collides with another worktree's dev server on
the same repo), reusing one already running there, and stops what it
started on both success and failure. It needs `bunx supabase start` and a
`.env.local` in place, same as the vitest suite. See `tests-e2e/portal-smoke.ts`.

Each `tests/*.test.ts` opens with a header comment stating what it gates; `ls tests/` is the index. The `rls-*` and `schema-*` suites read pg_catalog and are the schema's merge gate; `commands-import` and `commands-invites` prove those commands stay blocked.

Tests run against a real local Supabase stack (not a mock), but **their own
throwaway one**: `bash scripts/test-db.sh` starts a second stack (project
`mgr_test`, config in `tests/supabase/`, API 54351 / DB 54352, same baseline
via a migrations symlink), resets its database, and writes `.env.test.local`,
which vitest pins over inherited Bun/app settings. Local tests fail before setup unless this file names localhost ports 54351/54352 and test credentials. Re-run the script after editing
`supabase/migrations/00001_baseline.sql`. The app stack (`bunx supabase start`,
5434x) is never touched by tests, so the brewery you are clicking in `next dev`
survives a test run and stale test rows (see `chat-jobs`) cannot pile up there.
Without `.env.test.local`, local vitest refuses to run. CI keeps its separately provisioned disposable configuration.

## Deployment

**Not yet provisioned.** No hosted Supabase project or Vercel project exists
for this repo yet. When that is set up, create the hosted Supabase and Vercel
projects and configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in Vercel.
Then run `bunx supabase db push` against
the hosted project, deploy, and verify login → catalog → inventory on the
preview URL. Follow the full [hosted release checklist](docs/operations/release-checklist.md)
for approvals, environment separation, hosted advisors, smoke tests, and rollback evidence.

## CI

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
to `main`.

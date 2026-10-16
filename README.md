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

Each `tests/*.test.ts` opens with a header comment stating what it gates; `ls tests/` is the index. The `rls-*` and `schema-*` suites read pg_catalog and are the schema's merge gate; `commands-import` and `commands-invites` cover staged import rows and staff/buyer invitations. The docs path check recognizes tracked repository roots, not generated build directories, so it does not require a dev-server run after a production build.

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

## Operations runbooks

Operator procedures live in `docs/operations/`:

- [Hosted release checklist](docs/operations/release-checklist.md) — approvals, environment separation, advisors, smoke tests, rollback evidence.
- [Hosted configuration](docs/operations/hosted-config.md) — function region, QuickBooks credentials, `MGR_DEDICATED`, invitation-only signup, recovery redirects.
- [Slack notifications](docs/operations/slack-setup.md) — environment, Chat SDK database login, manifest, secret rotation, cleanup job.
- [Buyer order-confirmation email](docs/operations/order-email-worker.md) — delivery worker, schedule, failure log categories, retries.
- [Data retention and closing a brewery](docs/operations/brewery-retention.md) — command-record prune job, brewery export and close.
- [E2E runners](docs/operations/e2e-runners.md) — `bun run test:e2e` and the mobile command-surface regression.
- [Documentation agent](docs/operations/documentation-agent.md) — post-merge audit of the staff and portal field manuals.

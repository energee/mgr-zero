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

`bunx tsc --noEmit` uses TypeScript 7 through the `@typescript/native` alias.
ESLint, Next.js tooling, and screen-composition tests still need the TypeScript
6 compiler API, supplied by Microsoft's `@typescript/typescript6` compatibility
package under the `typescript` name. It uses the official npm tarball because
Bun 1.3.10 resolves the nested npm alias back to the compatibility package
when the compatibility package itself is installed through an npm alias.
See [Microsoft's side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).
Node type definitions stay on the latest 24.x release to match the runtime.

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
modern environment contract; nothing else is needed in `.env.local` to sign in
with a password and use the app. `APP_URL` is optional locally: it is the
public MGR origin (for example `http://localhost:3000`) that passwordless
sign-in and password-reset emails, Slack, and portal invoice payment build
their links from, so set it before using those. Browser calls to
`/api/command` and `/api/chat` pass the Origin check when their Origin matches
the host the request was sent to, so a second dev port or a Vercel preview
host needs no matching `APP_URL`.
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

To repair a PR conflict before its review workflow can run, use
`scripts/land-pr.sh <pr> --sync-only` from its clean worktree. It synchronizes
`origin/main` and regenerates the migration lock and API reference. Non-lock
conflicts remain in progress for manual resolution. This mode does not run
proof, push, or merge the PR; normal landing still requires review and CI.

Browser setup is explicit in each worktree: after the frozen install, run
`bunx agent-browser install`, then follow the
[browse skill](.agents/skills/browse/SKILL.md). The native CLI is bundled in the
locked npm tarball; do not trust or manually run its postinstall download hook.

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

When upgrading Zod, run `bun run docs:api` and the API-reference tests: numeric
examples derive bounds from core check definitions and must pass their schemas.
Slack OAuth tests intercept the Chat SDK adapter's own Web API client, not a
separately installed version, while exercising real credential persistence and
database locking.

Tests run against a real local Supabase stack (not a mock), but **their own
throwaway one**: `bash scripts/test-db.sh` starts a second stack (project
`mgr_test`, config in `tests/supabase/`, API 54351 / DB 54352, same baseline
via a migrations symlink), resets its database, and writes `.env.test.local`,
which vitest pins over inherited Bun/app settings. Local tests fail before setup unless this file names localhost ports 54351/54352 and test credentials. Re-run the script after adding a
migration; it resets automatically when the migrations change. The app stack (`bunx supabase start`,
5434x) is never touched by tests, so the brewery you are clicking in `next dev`
survives a test run and stale test rows (see `chat-jobs`) cannot pile up there.
Without `.env.test.local`, local vitest refuses to run. CI keeps its separately provisioned disposable configuration.

Every database-project run takes the shared `/tmp/mgr-test-db.lock`, then checks
the newest local migration against SQL history. Local runs also compare the existing migration/config
fingerprint and a per-reset identity through SQL and REST, before and after the suite.
Reset readiness executes the newly installed identity RPC; an old readable table is
not proof of a fresh PostgREST cache. These harness-only functions are installed only
on the disposable local stack, never by an application migration or on hosted.
Their reserved `mgr_test_identity_<nonce>` signatures are removed structurally by
`types:database`, so a local readiness probe never enters the committed app types.
The diagnostic names expected/actual identities and the pinned DB/API endpoints.
The exhaustive service-RPC RLS matrix admits only the exact verified reset probe,
checks its signature and grants, and still exercises anonymous/authenticated denial
plus a service-role identity positive control. Unexpected RPCs remain failures.

The explicit pure project in `vitest.config.mts` keeps the existing screen-only
gates and pure harness regressions independent of the running database. Vitest
routes the actual selected files: any mixed selection or unlisted/DB file still
initializes the database project's lock and identity guard. There is no user-set
flag to skip that protection.

For an uninterrupted reset plus proof, keep the same exclusive lock throughout:

```bash
perl scripts/test-db-lock.pl ex bash -c 'MGR_TEST_DB_RESET=1 bash scripts/test-db.sh --locked-reset && node_modules/.bin/vitest run'
```

Use the direct Vitest executable inside this outer lock. Bunx drops the inherited
descriptor on the tested local runtime; that launch is rejected, not silently
accepted with a different lock. Normal standalone `bun run test` still takes its
own shared lock.

The child inherits and validates the actual lock descriptor; do **not** override
`MGR_TEST_DB_LOCK` to avoid a recursive lock. An override gives up protection from
other worktrees. `--locked-reset` now refuses an unprotected invocation. Startup,
reset and env publication all hold the exclusive lock; each checkout replaces its
own env symlink instead of rewriting another worktree's configuration. Direct
`supabase db reset` / stop/start bypass this cooperative lock and must not run while
another proof owns the stack. Parallel full proofs need separately configured
isolated stacks (for example 5436x), not alternate lock files on the same 5435x DB.

### Database types

Supabase clients use `lib/supabase/database.generated.ts`, generated from the
committed migrations. After applying migrations to the disposable test stack,
run `bun run types:database`. Pass a local disposable database URL as the first
argument when using a separate stack. Do not generate from a hosted or stale
application database. CI checks the generated file against its fresh stack.
Generation removes disposable readiness RPC signatures and normalizes space/tab-only
lines to empty lines; the rest of the generated file is emitted unchanged.
Do not hand-edit the generated file. CI requires an exact regeneration match.

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

### CI provenance and updates

External `uses:` entries are pinned to 40-character commits (version comments
are for humans); all checkouts use v6. Weekly GitHub Actions Dependabot PRs
update those pins. Review the upstream commit/release diff, especially token
handling and composite actions' own downloads, before merging; CI must pass.
The workflow-contract test rejects mutable action references.

The review marketplace is checked out separately at an immutable commit and
passed as a local directory. The pinned action's
[installer](https://github.com/anthropics/claude-code-action/blob/374f254f5efaf968abfe15d399fd90972e8138b9/base-action/src/install-plugins.ts)
accepts local directories but rejects `https://…git#commit`; inventing such a
URL would fail setup. The
[marketplace manifest](https://github.com/anthropics/claude-code/blob/03b5892ee77de289bcd5dfa39f541525ade74aff/.claude-plugin/marketplace.json)
points `code-review` at a relative directory in that same checkout, not another
floating repository. Dependabot does not update checkout's `with.ref`: review
this pin manually with action updates, inspect the manifest and plugin diff,
and keep its source local. Do not enable marketplace auto-update.
The workflow renames only the checked-out catalog to `mgr-reviewed-plugins`:
Claude Code reserves Anthropic's original catalog name for GitHub installs.
The plugin files and immutable checkout pin remain unchanged.

`agent-browser` 0.39.1's
[npm distribution](https://registry.npmjs.org/agent-browser/0.39.1) bundles the
native binaries for all supported platforms. Bun's frozen install verifies
the npm tarball against the independently committed `bun.lock` SHA-512
(`sha512-0zdIq0v2r9Gio7K5wIe/e2W9nyLoVC6tUGpGV+btuynBQT9aCgOk5IEIyK+6OtfKRzQjp96DQ/3akBqxccigTQ==`).
Removing it from `trustedDependencies` prevents its unchecked GitHub-release
fallback from running. On updates, review the new recorded integrity and
confirm the tarball still contains the native binaries before accepting it.
`tests/installer-integrity.test.ts` uses an isolated local fixture and fresh
Bun caches to prove a valid tarball installs without its hook and a substituted
tarball fails against the recorded digest.

**Boundary, not an end-to-end vendor guarantee:** `bunx agent-browser install`
installs Chrome, not the agent CLI, and does not validate a recorded digest.
The upstream
[Chrome installer](https://github.com/vercel-labs/agent-browser/blob/v0.39.1/cli/src/install.rs)
fetches Chrome for Testing Stable metadata over HTTPS, then downloads the ZIP
without an independently recorded checksum unless that version is cached.
That explicit local opt-in is outside CI (CI does not run browser tests).
Do not describe this as verified Chrome provenance. Pinning an action also
does not pin every vendor runtime it installs (including Claude Code).
No real review/model/provider operation is needed for local setup proof.

Credential/permission inventory (unspecified scopes are denied wherever an
explicit `permissions` mapping is present):

| Action / job | Credentials and granted authority | Reason / boundary |
| --- | --- | --- |
| `actions/checkout` in CI | `GITHUB_TOKEN`: contents read | CI has an explicit read-only workflow default; no app key or provider secret. |
| `actions/checkout` in review / doc / dream maintenance | Contents read; persisted credentials disabled | Read source only; marketplace checkout also disables persistence. |
| `actions/checkout` in publication | Repository-scoped MGR App token: contents and pull requests write (dream also issues read) | Deterministic publication after validation, separate from the model. |
| `actions/checkout` in `@claude` | Job token: contents, pull requests and issues write | User-requested code changes; intentionally not a read-only reviewer. |
| `actions/setup-node`, `oven-sh/setup-bun`, [Supabase CLI setup](https://github.com/supabase/setup-cli) | Runner job context; no explicit application/provider secret input | Install pinned runtime versions; same job scopes, never elevated independently. |
| `anthropics/claude-code-action` review | `CLAUDE_CODE_OAUTH_TOKEN`; contents / pull requests / issues read, id-token write | OIDC obtains the Claude GitHub App identity for review comments; model tool allowlist remains narrow. |
| `anthropics/claude-code-action` doc / API maintenance | OAuth secret; explicit read-only `github.token`, id-token write | Model does not receive the publication App token. |
| `anthropics/claude-code-action` dream maintenance | OAuth secret; explicit `github.token`, contents / pull requests / issues read | No publication permissions in the model job. |
| `anthropics/claude-code-action` `@claude` | OAuth secret; contents / pull requests / issues write, actions read, id-token write | Intentional interactive write workflow; actions read supports CI inspection. |
| `actions/create-github-app-token` | `MGR_APP_PRIVATE_KEY` and App ID | Dream identity requests metadata read only; publication tokens explicitly request contents / PR write and dream issues read, scoped to the current repository. |
| `actions/upload-artifact`, `actions/download-artifact` | GitHub runner artifact runtime token | Same-run patch/bundle transport; neither gets the App key or OAuth secret as an input. |
| Watcher (no third-party action except read-only checkout) | `github.token`: issues write; stale-dream job also contents read | Creates diagnostic issues only. |
| Hosted jobs (no external actions) | Order-email / retention bearer secrets; `permissions: {}` | Existing operator-authorized service calls, never exercised by provenance verification. |

## Operations runbooks

Operator procedures live in `docs/operations/`:

- [Hosted release checklist](docs/operations/release-checklist.md) — approvals, environment separation, advisors, smoke tests, rollback evidence.
- [Hosted configuration](docs/operations/hosted-config.md) — function region, QuickBooks credentials, `MGR_DEDICATED`, invitation-only signup, recovery redirects.
- [Slack notifications](docs/operations/slack-setup.md) — environment, Chat SDK database login, manifest, secret rotation, cleanup job.
- [Buyer order-confirmation email](docs/operations/order-email-worker.md) — delivery worker, schedule, failure log categories, retries.
- [Data retention and closing a brewery](docs/operations/brewery-retention.md) — command-record prune job, brewery export and close.
- [E2E runners](docs/operations/e2e-runners.md) — `bun run test:e2e` and the mobile command-surface regression.
- [Documentation agent](docs/operations/documentation-agent.md) — post-merge audit of the staff and portal field manuals, integration of newly added Markdown, and one `Docs gaps:` issue per agent for what it overlooks.

## Design evidence

Screen redesigns keep their mockups and rendered synthetic captures in `docs/design/`:

- [New purchase order form](docs/design/purchase-order-new/README.md) — flat form wireframes, synthetic screenshots, and verification notes.

Public fixtures use fictional customers, suppliers and permit `BR-PA-12345`.
The COLA HTML fixture is generated sample data, not a downloaded brewery roster.
`public/mock/*.jpg` are generated geometric avatars, not photographs.
Keep tenant workbooks, CSV exports, backups, keys and local agent state untracked.
The refreshed packaging screenshot shows seeded Demo Brewing's empty live page;
COLA screenshots show that tenant's live brand page and approval editor.
Their lookup response is a browser-only synthetic fixture; the generated labels
are served from the local tenant's saved-image cache. No TTB request was made.
These captures do not establish an actual TTB approval or erase Git history.

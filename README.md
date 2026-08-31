# MGR

MGR is a multi-tenant brewery operations system: catalog, immutable
inventory ledger, allocations/ATP, CSV import, and staff/customer
invitations, built on Next.js (App Router, TypeScript) and Supabase
(Postgres, Auth, RLS). This repo currently covers **Slice 1A — Foundation**
(tenancy, ledger, catalog, import, invites). Orders/shipments/portal are
Slice 1B; QBO integration and AI chat are Slice 1C.

- Spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`
- Plan: `.agents/superpowers/plans/2026-08-30-slice1a-foundation.md`
- Schema: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why)

## Iron rules

See `ARCHITECTURE.md` for the ownership map and the five iron rules
(commands-only, append-only ledger, RLS everywhere, admin client confined,
multi-row writes are one Postgres function)
and what enforces each one. Agents start at `AGENTS.md`.

## Local development

Local Supabase runs on non-default ports (54341/54342/54343) configured
in the committed `supabase/config.toml`. These ports are used by every
developer and in CI — they were chosen to avoid colliding with a
default-port Supabase project running alongside locally. Verify the live
values with `npx supabase status`:

```
API URL:  http://127.0.0.1:54341
DB URL:   postgresql://postgres:postgres@127.0.0.1:54342/postgres
Studio:   http://127.0.0.1:54343
```

CI (`.github/workflows/ci.yml`) derives env vars from
`supabase status -o env` rather than hardcoding them, so the setup
automatically adapts to the values in `config.toml`.

### Setup

```bash
npm install
npx supabase start        # starts the local Postgres/Auth/Studio stack
npx supabase status       # prints the real local URL + anon/service keys
```

Create `.env.local` with the values `supabase status` printed:

```
NEXT_PUBLIC_SUPABASE_URL=<API URL from supabase status>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
DEPLOYMENT_MODE=saas
```

`DEPLOYMENT_MODE` is `saas` (multi-brewery, with a brewery switcher) or
`dedicated` (single-tenant deployment, switcher hidden). The schema is
identical in both modes — deployment mode is config, not schema.

Apply migrations and seed a dev user/brewery:

```bash
npx supabase db reset             # applies supabase/migrations/*.sql
npx tsx --env-file=.env.local scripts/seed-dev.ts   # idempotent; creates "Demo Brewing" + dev@mgr.local
```

Seeded dev login: `dev@mgr.local` / `dev-password-1` (dev-only credential —
never used outside local development).

Run the app:

```bash
npm run dev   # http://localhost:3000
```

### Tests

```bash
npm test          # vitest run — 47 tests across 9 files
npm run lint       # eslint, incl. the admin-client import guard
npx tsc --noEmit   # typecheck
npm run build      # production build
```

Test files: `tests/rls-tenancy.test.ts`, `tests/rls-ledger.test.ts` (RLS
isolation, ledger immutability, CHECK constraints, ATP math),
`tests/registry.test.ts` (command registry validation/permissions),
`tests/commands-inventory.test.ts` (catalog/inventory commands),
`tests/commands-import.test.ts` (CSV import), `tests/commands-invites.test.ts`
(invitations), `tests/schema-rules.test.ts` (pg_catalog gates: RLS on every
table, `security_invoker` views, `search_path` on functions, no anon-executable
definer functions), `tests/schema-conventions.test.ts` (composite FKs, lot
trigger, append-only ledgers), `tests/write-atomicity.test.ts` (iron rule 5). Tests run against the real local Supabase stack (not a
mock) — `npx supabase start` must be running first.

## Deployment

**Not yet provisioned.** No hosted Supabase project or Vercel project
exists for this repo yet. When that's set up: create the hosted Supabase
project and Vercel project, set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
`DEPLOYMENT_MODE=saas` as Vercel env vars, run `supabase db push` against
the hosted project, deploy, and verify login → catalog → inventory on the
preview URL.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: installs
deps, starts a local Supabase stack, applies migrations
(`supabase db reset`), runs the full vitest suite against it, then
`npm run lint`, `tsc --noEmit` and `npm run build`. This is the merge gate — RLS and
command-registry correctness are enforced here, not just locally.

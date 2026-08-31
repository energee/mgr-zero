# MGR2

MGR2 is a multi-tenant brewery operations system: catalog, immutable
inventory ledger, allocations/ATP, CSV import, and staff/customer
invitations, built on Next.js (App Router, TypeScript) and Supabase
(Postgres, Auth, RLS). This repo currently covers **Slice 1A — Foundation**
(tenancy, ledger, catalog, import, invites). Orders/shipments/portal are
Slice 1B; QBO integration and AI chat are Slice 1C.

- Spec: `docs/superpowers/specs/2026-08-30-mgr2-slice1-core-orders-design.md`
- Plan: `docs/superpowers/plans/2026-08-30-slice1a-foundation.md`
- SDD task briefs/reports (planning artifacts, not app source, gitignored): `.superpowers/sdd/2026-08-30-slice1a-foundation/`

## Iron rules

These are non-negotiable and enforced by tests and/or the database, not
just convention:

1. **Every operation is a command.** All mutations and queries the UI (and,
   later, AI chat) perform go through the registry in
   `lib/commands/registry.ts` via `defineCommand`/`defineQuery` and the
   single endpoint `app/api/command/route.ts`. No route handler contains
   inline business logic. Handlers that need to signal a user-facing error
   throw `CommandError`; anything else that escapes a handler is treated as
   unexpected and surfaces to the client as a generic 500 (the real error is
   logged server-side, never leaked). `lib/commands/all.ts` is the single
   side-effecting import that registers every command module.
2. **`inventory_movements` is never mutated.** The table is append-only —
   `UPDATE`/`DELETE` grants are revoked at the database level for
   `authenticated`/`anon`. Corrections are new reversal rows, never edits.
   `bbl` (barrels) is computed and frozen at write time by a database
   trigger from `qty * sku.bbl_per_unit`; callers never supply `bbl`
   directly.
3. **Every tenant table carries `brewery_id` with RLS.** Row-level security
   is enabled on every table and derives access from `brewery_users` /
   `customer_users` membership (see `supabase/migrations/00001_tenancy.sql`
   helpers `my_brewery_ids()`, `is_staff_of()`, `staff_role()`). Tenant
   isolation is never trusted to application code alone — it's proven by
   the RLS test suite (`tests/rls-tenancy.test.ts`, `tests/rls-ledger.test.ts`).
4. **`createAdminClient()` (service-role, RLS-bypassing) is restricted to
   `lib/commands/invites.ts`.** Inviting a user requires
   `auth.admin.inviteUserByEmail`, which needs the service role, and the
   resulting membership row must be inserted for a user who isn't the
   caller yet. Both handlers there permission-check via the normal RLS-bound
   `Ctx` *first*, then use the admin client only for the parts that require
   it. No other request path uses the admin client.

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
npm test          # vitest run — 19 tests across 6 files
npx tsc --noEmit   # typecheck
npm run build      # production build
```

Test files: `tests/rls-tenancy.test.ts`, `tests/rls-ledger.test.ts` (RLS
isolation, ledger immutability, CHECK constraints, ATP math),
`tests/registry.test.ts` (command registry validation/permissions),
`tests/commands-inventory.test.ts` (catalog/inventory commands),
`tests/commands-import.test.ts` (CSV import), `tests/commands-invites.test.ts`
(invitations). Tests run against the real local Supabase stack (not a
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
`tsc --noEmit` and `npm run build`. This is the merge gate — RLS and
command-registry correctness are enforced here, not just locally.

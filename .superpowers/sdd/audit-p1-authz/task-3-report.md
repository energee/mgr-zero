# Task 3 — P1.3 Integration token isolation report

## Root cause

`public.qbo_connections` and `public.pos_connections` contained `access_token` and
`refresh_token`. The authenticated role has the public read surface, and the
connection RLS policy let an administrator read its brewery's rows. Consequently,
an administrator browser JWT could select both credential columns.

## Red / green proof

- **Red:** `npx vitest run tests/rls-integration-secrets.test.ts`
  - 2 failures: the QBO and POS denial assertions received `{ name: "admin",
    error: null }`, proving the administrator browser client could select the
    token columns.
- **Reset:** `npx supabase db reset --local`
  - Completed after applying `00001_baseline.sql`.
- **Green:** `npx vitest run tests/rls-integration-secrets.test.ts`
  - 1 file, 5 tests passed. Covers admin, sales, warehouse, brewer, customer,
    and anon clients; public token reads/writes, private-schema access, and both
    token RPCs are denied. It also proves admin/sales can use the server boundary
    only after its RLS-bound metadata lookup, while warehouse and a forged
    cross-tenant context are denied.
- **Schema catalog:** `npx vitest run tests/schema-rules.test.ts`
  - 1 file, 10 tests passed. Pins the private relation ACL/RLS state, public
    token-column absence, and exact service-only token-RPC signatures.
- **Task 1 boundary regression:**
  `npx vitest run --hookTimeout 30000 tests/rls-tenancy.test.ts tests/rls-command-boundary.test.ts`
  - 2 files, 28 tests passed.

## Schema and server API decisions

- Public `qbo_connections` and `pos_connections` retain only connection metadata.
  Their RLS read policy is limited to `admin` and `sales` integration operators.
- `private.integration_tokens` is keyed by `(brewery_id, provider)`, references
  `public.breweries`, has RLS enabled with no browser grants, and lives in the
  existing non-API `private` schema.
- `public.store_integration_tokens(uuid,text,text,text)` and
  `public.read_integration_tokens(uuid,text)` are `SECURITY DEFINER` functions
  with `search_path = ''`. They validate that the provider has matching public
  metadata in the requested brewery. `PUBLIC`, `anon`, and `authenticated` are
  explicitly revoked; only `service_role` receives execute.
- `lib/supabase/integration-tokens.ts` is the narrow server boundary. It accepts
  `Ctx`, allows only `admin`/`sales`, queries the relevant metadata through
  `ctx.db` under RLS, and only then creates the service client to call the
  service-only RPC. It has no integration workflow or caller. ESLint permits the
  service-role import only in this boundary, the existing invite handler, and the
  admin-client module itself.

## Files

- `supabase/migrations/00001_baseline.sql`
- `lib/supabase/integration-tokens.ts`
- `lib/supabase/admin.ts`
- `eslint.config.mjs`
- `tests/rls-integration-secrets.test.ts`
- `tests/schema-rules.test.ts`
- `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`
- `.superpowers/sdd/audit-p1-authz/task-3-report.md`

## Self-review

- PostgREST exposes only `public`/`graphql_public`; `private` remains outside the
  configured API schemas and has no API-role schema/table grants.
- No public connection column retains access or refresh tokens.
- Both definer functions pin an empty search path and schema-qualify every
  relation; catalog tests cover the invariant across public functions.
- The server lookup and token RPC both bind provider selection to the requested
  brewery; browser test coverage includes a cross-tenant forged context denial.
- `SUPABASE_SERVICE_ROLE_KEY` remains confined to `createAdminClient()`; no
  public environment variable, browser client, log statement, or surfaced error
  contains token material. Boundary errors are generic and do not interpolate
  token values.
- There is no broad ESLint allowlist, no authenticated token RPC, and no added
  QBO/POS/OAuth/sync behavior.

## Commit

`audit: isolate integration tokens behind server boundary`

## Concerns

Vitest emits the existing Vite native-config-loader deprecation warning. The
unmodified Task 1 boundary setup exceeds Vitest's default 10-second hook timeout
on this local stack; it passed with the focused command's 30-second hook timeout.
No formatter, lint, typecheck, full suite, dependency, hosted-project, OAuth, or
integration-workflow operation was run or added.

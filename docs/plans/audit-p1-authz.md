# Audit P1 Authorization Remediation Plan

> Approved execution plan for the P1 authorization findings demonstrated at audit snapshot `96ba05c`. Execute in `audit-p1-authz`; keep the schema as `supabase/migrations/00001_baseline.sql`.

**Goal:** Make the database enforce MGR's command roles, Data API exposure, integration-secret isolation, portal invariants, counter isolation, and blocked import/invite release gates.

**Architecture:** Browser sessions retain RLS-filtered reads. Writes move behind explicitly granted, role-checking RPCs; raw Data API mutations are denied. Integration token material lives outside exposed schemas. Portal RPCs derive all trusted fields from authenticated database relationships.

**Tech stack:** Next.js App Router, TypeScript, Vitest, Supabase PostgREST, PostgreSQL 17/RLS.

## Global constraints

- Edit `supabase/migrations/00001_baseline.sql` in place; never add another migration.
- Preserve registered-command ownership, append-only ledgers, `security_invoker` views/functions, pinned empty `search_path`, composite tenant FKs, and one RPC per multi-row action.
- No Slice 1C implementation, QBO/POS/AI code, deployment, hosted provisioning, dependencies, or P2/P3 remediation.
- Every behavior change starts red against the real local Supabase stack and ends with its focused test green.

### Task 1: P1.1 — Database command-role boundary

**Test first:** Extend `tests/rls-tenancy.test.ts` and add `tests/rls-command-boundary.test.ts` to prove each registry-disallowed staff role cannot mutate through `.from()` or `.rpc()`, while registry-allowed calls still succeed.

**Modify:** `supabase/migrations/00001_baseline.sql`; `lib/commands/catalog.ts`; `lib/commands/customers.ts`; `lib/commands/inventory.ts`; `lib/commands/orders.ts`; `tests/schema-conventions.test.ts`; any existing command test that currently writes through staff `.from()`.

**Types/interfaces:** Keep `Role`, `Ctx`, and registered command inputs from `lib/commands/registry.ts`; introduce explicit SQL RPC signatures corresponding one-to-one with existing registered mutations rather than a generic dispatcher.

**Acceptance:** Brewer cannot insert `products`; warehouse cannot invoke sales/admin RPCs; allowed admin/sales/warehouse commands remain green. Depends on no later task.

### Task 2: P1.2 — Explicit Data API grants

**Test first:** Extend `tests/schema-rules.test.ts` with catalog assertions for exact `anon`, `authenticated`, and `service_role` table/view/sequence/function privileges and revoked default privileges.

**Modify:** `supabase/config.toml`; `supabase/migrations/00001_baseline.sql`; `tests/schema-rules.test.ts`.

**Types/interfaces:** PostgreSQL ACL catalog rows are normalized to stable strings in Vitest; no application API changes.

**Acceptance:** `auto_expose_new_tables = false`; `anon` has no domain-object access; `authenticated` has explicit reads and only the DML/EXECUTE needed by authorized RPCs; `service_role` has explicit server access. Depends on Task 1's final RPC surface.

### Task 3: P1.3 — Integration token isolation

**Test first:** Add `tests/rls-integration-secrets.test.ts` proving admin, sales, warehouse, brewer, customer, and anon Data API clients cannot select access tokens or refresh tokens; service-only token storage/retrieval remains possible through the explicit server boundary.

**Modify:** `supabase/migrations/00001_baseline.sql`; `eslint.config.mjs` only if an actual server token accessor requires a narrow allowlist; relevant schema tests.

**Types/interfaces:** Public connection metadata must not contain token fields. Private token records key by `(brewery_id, provider)` and expose no browser-granted relation or authenticated RPC.

**Acceptance:** No browser JWT can read token material, including admin. No blanket admin/service client exemption is added. Depends on Task 2 ACL conventions.

### Task 4: P1.4 — Hardened portal order RPCs

**Test first:** Extend `tests/commands-portal.test.ts` and `tests/rls-orders.test.ts` for raw order/line/event denial, forged price rejection, authenticated actor derivation, configured fulfillment source, foreign ship-to/SKU rejection, and create/update/submit success through portal commands.

**Modify:** `supabase/migrations/00001_baseline.sql`; `lib/commands/portal.ts`; the existing admin settings/command owner chosen for portal fulfillment configuration; `tests/commands-portal.test.ts`; `tests/rls-orders.test.ts`.

**Types/interfaces:** Portal line input remains `{ skuId: string; qty: number }`; trusted `unit_price_cents`, `customer_id`, `brewery_id`, `from_location_id`, `created_by`, status, and events are derived in SQL. A configured portal fulfillment location must belong to the brewery and be a warehouse.

**Acceptance:** Customer `.from()` writes fail; portal RPCs use current price-list prices and `auth.uid()`; an unset fulfillment source fails closed; no `min(uuid)`/first-warehouse inference remains. Depends on Tasks 1–2.

### Task 5: P1.5 — Tenant-safe document counters

**Test first:** Extend `tests/rls-command-boundary.test.ts` to prove direct and cross-tenant `next_no` calls fail for authenticated users, while legitimate order/invoice numbering through authorized lifecycle RPCs still advances the owning brewery's permitted key.

**Modify:** `supabase/migrations/00001_baseline.sql`; focused lifecycle tests if their expected setup changes.

**Types/interfaces:** `next_no(b uuid, k text) -> bigint` remains an internal helper signature only if direct authenticated execution is impossible; keys are restricted to committed document counter kinds.

**Acceptance:** No authenticated user can advance another brewery's counter or call `next_no` as a public mutation. Depends on Tasks 1–2 and portal/lifecycle RPC callers.

### Task 6: P1.9 — Blocked import and invitations

**Test first:** Replace success expectations in `tests/commands-import.test.ts` and `tests/commands-invites.test.ts` with `CommandError` fail-closed assertions; verify the rendered Team, Customer, navigation, and Import surfaces offer no invite/import action.

**Modify:** `lib/commands/import.ts`; `lib/commands/invites.ts`; `app/(app)/layout.tsx`; `app/(app)/settings/team/page.tsx`; `app/(app)/customers/[id]/page.tsx`; remove the now-unused invite/import form modules and import route; `public/docs/user-guide.html`.

**Types/interfaces:** Keep registered names and input validation contracts so direct `/api/command` posts fail with controlled `CommandError` instead of becoming unknown commands.

**Acceptance:** `import_csv`, `invite_staff`, and `invite_customer_user` always fail before external/database writes; UI exposes none of them; customer guide does not claim availability. Depends only on registry stability.

### Task 7: Slice 1C rewrite, backlog, review, and verification

**Plan-only change:** Rewrite `.agents/superpowers/plans/2026-08-31-slice1c-qbo-ai-chat.md` with all nine audit corrections and explicit merged-Slice-1B ownership; do not add QBO, OAuth, POS, or composer implementation.

**Documentation:** Update `.agents/PROGRESS.md` with completed P1 scope and the intact P1.6–P1.8, P1.10/P1.11, P2/P3 backlog supplied in the audit. Update `.agents/MEMORY.md` only if implementation establishes a new durable decision.

**Review:** Run database and security reviewers over the SQL, grants, direct Data API paths, token boundary, and portal RPCs; resolve every legitimate finding.

**Acceptance:** Focused tests pass, then `bun run test && bunx tsc --noEmit && bun run lint`; Supabase advisors are recorded without chasing out-of-scope index findings; branch/status are rechecked before logical commits; nothing is pushed.

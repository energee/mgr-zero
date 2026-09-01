# Architecture

Ownership map and iron rules for MGR. `AGENTS.md` routes here; `README.md`
covers setup. When a concept needs changing, change it at its owner below —
never copy it into a second place.

## Ownership

| Path | Owns |
| --- | --- |
| `supabase/migrations/*.sql` | Schema, RLS policies, triggers, grants, and the transactional command-request ledger. The only source of truth for data rules. Pre-deploy, the baseline is edited in place (see `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`). Application roles have read-only table access; every mutation enters through an explicitly granted, idempotent `security definer` RPC with `search_path = ''`, database-derived actor/tenant/role checks, and a canonical request hash. Private helpers and implementation functions are not executable by application roles. |
| `lib/commands/registry.ts` | `defineCommand` / `defineQuery`, `Ctx`, role checks, `CommandError`. Every domain operation the app performs is registered here. |
| `lib/commands/<area>.ts` | Business logic per area (catalog, inventory, orders, customers, portal; `import.ts` and `invites.ts` are registered fail-closed stubs). Handlers read through the RLS-bound `ctx.db`; public-schema writes call the narrow RPC boundary and forward `CommandExecution.requestId`. `orders.ts` owns order lifecycle (create/submit/confirm/adjust/cancel), allocations, pick/ship, per-shipment invoices, credit memos, and replenishment. `customers.ts` owns customer/ship-to/price-list CRUD and the portal fulfillment source. `portal.ts` owns the customer-role commands (`portal_create_order`, `portal_submit_order`, `portal_catalog`, `portal_orders`, `portal_order`, `portal_invoices`) — the only commands a `customer` role may call. |
| `lib/commands/all.ts` | The one side-effecting import that registers every command module. |
| `app/api/command/route.ts` | The single HTTP entry point. Dispatches to the registry; contains no business logic. Cookie session or `Authorization: Bearer <supabase access_token>`. |
| `lib/commands/client.ts`, `use-command-form.ts` | How the UI calls commands. |
| `lib/supabase/server.ts` | RLS-bound client for request paths. |
| `lib/supabase/admin.ts` | Service-role client. Import restricted by eslint (see rule 4). |
| `lib/brewery.ts`, `app/(app)/brewery-provider.tsx` | Current-brewery resolution and switching across the signed-in user's memberships. |
| `lib/portal.ts` | `getActiveCustomer()`: resolves which customer account the session operates as from `customer_users`, mirroring `lib/brewery.ts`. Redirects to `/login` with no membership. |
| `proxy.ts`, `app/(auth)/` | Session refresh and login. Customer-only accounts (a `customer_users` row, no `brewery_users` row) land on `/portal` instead of `/`. |
| `app/(app)/<area>/` | Staff pages and forms. Thin: read via queries, mutate via commands. |
| `app/(portal)/` | Wholesale customer portal route group (own layout, `/portal` shop + cart, `/portal/orders`, `/portal/invoices`) — reads/writes only through the `portal.ts` customer-role commands above. |
| `components/ui/` | shadcn primitives. Don't hand-edit; re-add with the shadcn CLI. |
| `tests/` | Proof. Runs against the real local Supabase stack, never mocks. |
| `scripts/seed-dev.ts` | Idempotent dev seed. |
| `docs/user-guide.md` | Complete customer-facing manual for every available screen and action: prerequisites, permissions, steps, fields/options, results, corrections, and errors. Uses customer language only and never exposes implementation phases or internals. |
| `.agents/superpowers/specs/` | Product and schema design decisions (why). |
| `.agents/orchestration/` | Cross-provider model roles, routing, budgets, prompts, approval gates, and run artifacts. |
| `.agents/agents/documentation-maintainer.md`, `.github/workflows/documentation-agent.yml`, `.github/scripts/upsert-documentation-issue.mjs` | Post-merge documentation review criteria, GitHub trigger, structured-output handling, and deterministic issue upsert. The Claude reviewer is read-only; actionable drift becomes one follow-up issue per merged PR. |
| `.agents/skills/` | Project-local, harness-compatible agent workflows loaded on demand. |
| `.pi/prompts/` | Thin Pi slash-command aliases; workflow instructions remain owned by the corresponding skill. |
| `.agents/` | This file, agent memory and progress; worktrees live under `.agents/worktrees/`. |

## Iron rules

Each rule names what enforces it. If a rule is only enforced by prose, that is
a gap to close, not a convention to trust.

1. **Every domain operation is a command.** All public-schema mutations and
   queries go through `lib/commands/registry.ts` via
   `defineCommand`/`defineQuery` and the single
   endpoint `app/api/command/route.ts` (cookie session or Bearer access token).
   No route handler or page contains
   inline business logic. There is no resource REST API and no API-key table —
   new operations are registered commands, not new routes. Handlers signal user-facing failures by throwing
   `CommandError`; anything else surfaces as a generic 500 with the real error
   logged server-side. Supabase Auth session primitives (sign-up, sign-in/out, magic-link
   exchange, password reset/update, session refresh) are the sole non-domain
   exception; they never authorize direct public-schema access. SaaS tenant
   provisioning is domain work: `provision_brewery` remains blocked until the
   registry has an explicit pre-tenant context, then invokes one
   narrow `security definer` RPC for the brewery + first admin membership — never a fake
   `breweryId` or an RLS bypass. AI write tools only propose registered commands;
   an explicit user confirmation is required before execution. *Enforced by:*
   `tests/registry.test.ts` (validation and role checks); structure by review.
2. **`inventory_movements` is append-only.** `UPDATE`/`DELETE` are revoked at
   the database for `authenticated`/`anon`. A correction appends new rows through
   a declared compensating command; there is no generic Undo. A compensation is
   available only when the schema can link it structurally to the original and
   downstream reports preserve the original classification. Compound writes own
   their compensation — a shipped order is corrected through the
   return/credit-memo command, never by reversing one movement.
   `bbl` is computed by trigger from `qty * sku.bbl_per_unit`; callers never
   supply it. *Enforced by:* grants and trigger in `supabase/migrations/`,
   proven by `tests/rls-ledger.test.ts`.
3. **Every tenant table carries `brewery_id` with RLS.** Access derives from
   `brewery_users` / `customer_users` via `my_brewery_ids()`, `is_staff_of()`,
   `staff_role()`, `my_customer_ids()` (the only RLS helpers; defined once in the baseline). Cross-tenant FKs are composite so a row can't reference
   another brewery's data. Portal customers never `SELECT` the `breweries` base
   table (`ttb_registry_no`, `pa_license_no`, `settings` stay staff-only); they
   read `portal_brewery` (`id`, `name`, `timezone`, `portal_fulfillment_location_id`).
   *Enforced by:* RLS policies in migrations, proven by
   `tests/rls-tenancy.test.ts`; `tests/schema-rules.test.ts` reads `pg_catalog`
   to assert RLS on every table, `security_invoker` on every view,
   `search_path` on every function, and an `RLS-EXCEPTION:` comment on any
   permissive policy.
4. **`createAdminClient()` is restricted to `lib/supabase/integration-tokens.ts`.**
   The token boundary is the sole credential path: it admits only `admin`/`sales`,
   proves the concrete connection is visible through `ctx.db`, then passes the
   verified actor to a service-only RPC that rechecks current membership and role
   in the same token read/write statement. Integration modules must use this
   boundary; they never receive a service-client allowlist. `invite_staff` and
   `invite_customer_user` (which needed `auth.admin.inviteUserByEmail` plus a
   membership insert) are registered but fail closed until the external-write
   gate below is implemented; their working handlers are in git history.
   *Enforced by:* `no-restricted-imports` in `eslint.config.mjs`, run in CI.
5. **Every mutation is one idempotent Postgres transaction.**
   Application roles have no direct table DML. A write handler calls one
   explicitly granted `security definer` RPC (`ctx.db.rpc(...)`) that asserts
   `auth.uid()`-derived tenant/role access, claims the actor/request ID against
   the canonical payload, performs all dependent writes, and stores the result
   before commit. An identical replay returns that result; changed command,
   brewery, or payload conflicts. Private implementation helpers retain the
   multi-row transaction rule and are not application-callable. Per-row
   independent bulk work (CSV import, currently fail-closed) is the one
   exemption and says so with an `// atomic-exempt:` comment. MGR v1
   learned this after real data loss
   (`.agents/superpowers/specs/2026-08-31-mgr-v1-review.md`). *Enforced
   by:* `tests/data-api-boundary.test.ts`,
   `tests/command-idempotency.test.ts`, `tests/schema-rules.test.ts`, and
   `tests/write-atomicity.test.ts`.

## Pre-implementation gates

- **Replayable commands are idempotent at the server.** `/api/command` carries
  one stable `requestId` per write action. `private.command_requests` binds it
  to the authenticated actor, brewery, command, and canonical payload, commits
  the first result with the domain effect, returns that result on replay, and
  rejects mismatched reuse. This permits transport retries for current write
  RPCs. It does not by itself enable the AI composer or an offline outbox;
  registry-owned preview/version contracts and explicit eligibility remain
  required below.
- **AI proposals are registry-owned contracts.** Before composer writes ship,
  registry metadata must declare each write command's risk, preview/canonicalize
  hook, compensation, and offline/replay eligibility. The language layer emits
  only a candidate command name + input. An internal registered
  `preview_command` operation (not AI-exposed) calls that hook and returns
  canonical effects, warnings, and a version token. Commit sends the same
  `requestId` + preview token, re-resolves and revalidates server-side, and
  rejects stale state; it never trusts model output or a cached proposal. This
  is a design prerequisite, not a claim about the current registry.
- **Inventory correction and taproom counts need durable identity.** The current
  FG ledger has neither a structured reversal link nor sign rules/report semantics
  for an exact opposite entry, so `reverse_inventory_movement` remains disabled.
  The current schema also has no FG count header/lines; a zero-variance weekly
  count would disappear entirely. Before either UI ships, the baseline must add
  auditable correction identity and a durable taproom count occurrence/snapshot,
  and their registered one-RPC commands must have real-Postgres/report proofs.
- **Auth invitations need a durable external-write workflow.** The former
  invite handlers called Supabase Auth before inserting membership, so a failed
  DB write could leave an invited Auth user without the intended access; they
  now fail closed (audit P1.9) and no invite UI exists.
  Before either invite ships again, retries must reuse one durable request identity
  and an incomplete second step must be recoverable or compensate the created
  Auth account. Tests must force failure after Auth success for staff and customer
  invites; an implemented registry name alone is not evidence that this gate is met.
- **CSV exemption stops between logical rows.** `import_csv` may continue after
  one independent CSV row fails, but dependent writes inside a logical row still
  require one Postgres function. The implemented importer currently sequences
  some parent/child writes and has no durable per-row request/result identity;
  opening-balance reruns can append twice. The import UI remains blocked until
  each logical row is atomic and reruns return its first durable result.

## Schema conventions

Append-only ledgers over mutable counters; triggers for derived values;
no status columns that won't be kept accurate. Full rationale:
`.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.

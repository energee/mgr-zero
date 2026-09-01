# Architecture

Ownership map and iron rules for MGR. `AGENTS.md` routes here; `README.md`
covers setup. When a concept needs changing, change it at its owner below —
never copy it into a second place.

## Ownership

| Path | Owns |
| --- | --- |
| `supabase/migrations/*.sql` | Schema, RLS policies, triggers, grants. The only source of truth for data rules. Pre-deploy, the baseline is edited in place (see `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`). Order lifecycle (`create_order`, `submit_order`, `confirm_order`, `adjust_order_lines`, `cancel_order`, `record_pick`, `ship_order`, `create_credit_memo`, `create_replenishment_order`) lives here as one `security invoker` plpgsql function per transition (iron rule 5); each appends to `order_events`, the append-only per-order change log (staff + customer RLS read/insert policies, no update/delete). |
| `lib/commands/registry.ts` | `defineCommand` / `defineQuery`, `Ctx`, role checks, `CommandError`. Every domain operation the app performs is registered here. |
| `lib/commands/<area>.ts` | Business logic per area (catalog, inventory, import, invites, orders, customers, portal). Handlers get an RLS-bound `ctx.db`. `orders.ts` owns order lifecycle (create/submit/confirm/adjust/cancel), allocations, pick/ship, per-shipment invoices, credit memos, and replenishment — each multi-row transition is a thin caller into the one plpgsql function per iron rule 5. `customers.ts` owns customer/ship-to/price-list CRUD. `portal.ts` owns the customer-role commands (`portal_create_order`, `portal_submit_order`, `portal_catalog`, `portal_orders`, `portal_order`, `portal_invoices`) — the only commands a `customer` role may call. |
| `lib/commands/all.ts` | The one side-effecting import that registers every command module. |
| `app/api/command/route.ts` | The single HTTP entry point. Dispatches to the registry; contains no business logic. Cookie session or `Authorization: Bearer <supabase access_token>`. |
| `lib/commands/client.ts`, `use-command-form.ts` | How the UI calls commands. |
| `lib/supabase/server.ts` | RLS-bound client for request paths. |
| `lib/supabase/admin.ts` | Service-role client. Import restricted by eslint (see rule 4). |
| `lib/brewery.ts`, `app/(app)/brewery-provider.tsx` | Current-brewery resolution and switching (`DEPLOYMENT_MODE` saas vs dedicated). |
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
   `security invoker` RPC for the brewery + first admin membership — never a fake
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
   another brewery's data. *Enforced by:* RLS policies in migrations, proven by
   `tests/rls-tenancy.test.ts`; `tests/schema-rules.test.ts` reads `pg_catalog`
   to assert RLS on every table, `security_invoker` on every view,
   `search_path` on every function, and an `RLS-EXCEPTION:` comment on any
   permissive policy.
4. **`createAdminClient()` is restricted to `lib/commands/invites.ts`.**
   Inviting requires `auth.admin.inviteUserByEmail` and a membership insert for
   a user who isn't the caller. Both handlers permission-check via the
   RLS-bound `Ctx` first. Because Auth and Postgres cannot share a transaction,
   the current invite-then-membership handlers are not UI-ready until the
   external-write gate below is implemented. *Enforced by:* `no-restricted-imports` in
   `eslint.config.mjs`, run in CI. Integration sync modules (`qbo.ts`, `pos.ts`,
   slices 1C/7) will need the same client for token storage; each is added to the
   eslint allowlist explicitly with its own permission check — never a blanket exemption.
5. **A command that writes more than one row is one Postgres function.**
   supabase-js cannot span a transaction across statements, so a handler that
   does `insert` then `update` can half-commit. Such commands call a single
   `security invoker` plpgsql function (`ctx.db.rpc(...)`); the handler is a
   thin caller. One committed user action cannot be split across dependent
   commands to evade this boundary. Per-row-independent bulk work (CSV import)
   is the one exemption and says so with an `// atomic-exempt:` comment. MGR v1
   learned this after real data loss
   (`.agents/superpowers/specs/2026-08-31-mgr-v1-review.md`). *Enforced by:*
   `tests/write-atomicity.test.ts`.

## Pre-implementation gates

- **Replayable commands are idempotent at the server.** Before the composer or
  any offline outbox may replay a write, `/api/command` must carry a stable
  `requestId` end to end and the server must durably return the first result for
  repeats of that ID. The server binds the ID to the authenticated actor, tenant
  context, and full submitted write envelope; mismatched reuse is rejected.
  Keeping an ID only in IndexedDB is not deduplication. The persistence shape is
  deliberately deferred; replay stays disabled until the contract and its
  real-Postgres proof exist.
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
- **Auth invitations need a durable external-write workflow.** The implemented
  invite handlers call Supabase Auth before inserting membership. A failed DB
  write can therefore leave an invited Auth user without the intended access.
  Before either invite UI ships, retries must reuse one durable request identity
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

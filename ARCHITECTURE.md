# Architecture

Ownership map and iron rules for MGR. `AGENTS.md` routes here; `README.md`
covers setup. When a concept needs changing, change it at its owner below —
never copy it into a second place.

## Ownership

| Path | Owns |
| --- | --- |
| `supabase/migrations/*.sql` | Schema, RLS policies, triggers, grants. The only source of truth for data rules. Pre-deploy, the baseline is edited in place (see `docs/superpowers/specs/2026-08-31-mgr-schema-decisions.md`). |
| `lib/commands/registry.ts` | `defineCommand` / `defineQuery`, `Ctx`, role checks, `CommandError`. Every operation the app performs is registered here. |
| `lib/commands/<area>.ts` | Business logic per area (catalog, inventory, import, invites). Handlers get an RLS-bound `ctx.db`. |
| `lib/commands/all.ts` | The one side-effecting import that registers every command module. |
| `app/api/command/route.ts` | The single HTTP entry point. Dispatches to the registry; contains no business logic. |
| `lib/commands/client.ts`, `use-command-form.ts` | How the UI calls commands. |
| `lib/supabase/server.ts` | RLS-bound client for request paths. |
| `lib/supabase/admin.ts` | Service-role client. Import restricted by eslint (see rule 4). |
| `lib/brewery.ts`, `app/(app)/brewery-provider.tsx` | Current-brewery resolution and switching (`DEPLOYMENT_MODE` saas vs dedicated). |
| `middleware.ts`, `app/(auth)/` | Session refresh and login. |
| `app/(app)/<area>/` | Pages and forms. Thin: read via queries, mutate via commands. |
| `components/ui/` | shadcn primitives. Don't hand-edit; re-add with the shadcn CLI. |
| `tests/` | Proof. Runs against the real local Supabase stack, never mocks. |
| `scripts/seed-dev.ts` | Idempotent dev seed. |
| `docs/superpowers/specs/` | Product and schema design decisions (why). |
| `.agents/` | Agent memory and progress; worktrees live under `.agents/worktrees/`. |

## Iron rules

Each rule names what enforces it. If a rule is only enforced by prose, that is
a gap to close, not a convention to trust.

1. **Every operation is a command.** All mutations and queries go through
   `lib/commands/registry.ts` via `defineCommand`/`defineQuery` and the single
   endpoint `app/api/command/route.ts`. No route handler or page contains
   inline business logic. Handlers signal user-facing failures by throwing
   `CommandError`; anything else surfaces as a generic 500 with the real error
   logged server-side. *Enforced by:* `tests/registry.test.ts` (validation and
   role checks); structure by review.
2. **`inventory_movements` is append-only.** `UPDATE`/`DELETE` are revoked at
   the database for `authenticated`/`anon`. Corrections are new reversal rows.
   `bbl` is computed by trigger from `qty * sku.bbl_per_unit`; callers never
   supply it. *Enforced by:* grants and trigger in `supabase/migrations/`,
   proven by `tests/rls-ledger.test.ts`.
3. **Every tenant table carries `brewery_id` with RLS.** Access derives from
   `brewery_users` / `customer_users` via `my_brewery_ids()`, `is_staff_of()`,
   `staff_role()`. Cross-tenant FKs are composite so a row can't reference
   another brewery's data. *Enforced by:* RLS policies in migrations, proven by
   `tests/rls-tenancy.test.ts`.
4. **`createAdminClient()` is restricted to `lib/commands/invites.ts`.**
   Inviting requires `auth.admin.inviteUserByEmail` and a membership insert for
   a user who isn't the caller. Both handlers permission-check via the
   RLS-bound `Ctx` first. *Enforced by:* `no-restricted-imports` in
   `eslint.config.mjs`, run in CI.
5. **A command that writes more than one row is one Postgres function.**
   supabase-js cannot span a transaction across statements, so a handler that
   does `insert` then `update` can half-commit. Such commands call a single
   `security invoker` plpgsql function (`ctx.db.rpc(...)`); the handler is a
   thin caller. Per-row-independent bulk work (CSV import) is the one exemption
   and says so with an `// atomic-exempt:` comment. MGR v1 learned this after
   real data loss (`docs/superpowers/specs/2026-08-31-mgr-v1-review.md`).
   *Enforced by:* `tests/write-atomicity.test.ts`.

## Schema conventions

Append-only ledgers over mutable counters; triggers for derived values;
no status columns that won't be kept accurate. Full rationale:
`docs/superpowers/specs/2026-08-31-mgr-schema-decisions.md`.

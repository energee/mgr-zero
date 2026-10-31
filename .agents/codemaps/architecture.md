<!-- Generated: 2026-10-31 | Commit: b8cb91afd | Tracked files scanned: 1878 -->
# Architecture

Multi-tenant brewery operations SaaS. Single Next.js App Router app plus Supabase
(Postgres, Auth, RLS). Not a monorepo. Why and ownership rules live in
`.agents/ARCHITECTURE.md`; this map holds only paths and flow.

## Request flow
```
browser ──proxy.ts (session refresh, customer→/portal)──┐
                                                       ▼
 app/(app) staff pages ─┐   server read: lib/mgr/page-query.ts → runCommand(query)
 app/(portal) portal  ──┤   client write: lib/commands/client.ts command()
                        ▼
              POST /api/command  (cookie | Bearer token)
                        │ consumeAdmission → buildContext → runCommand
                        ▼
        lib/commands/registry.ts  (defineCommand/defineQuery, role check)
                        │
         lib/commands/<area>.ts handler
            read: ctx.db (RLS-bound) │ write: security-definer RPC + requestId
                        ▼
        Postgres: public tables (read-only to app roles), private.* helpers and ledgers
```

## Side channels
```
POST /api/chat ── Ask MGR: ai.streamText(gateway(model)) + composer tools → runCommand
Slack ─▶ /api/webhooks/slack, /api/chat/slack/* ─▶ lib/chat/jobs.ts (service-role, named RPCs)
GH Actions hosted-jobs.yml (*/5, daily) ─▶ /api/email/jobs/deliver, /api/retention/jobs/prune
/api/chat/jobs/{scan,deliver,cleanup} ─▶ notification fan-out (no scheduler wired)
QBO / Square OAuth ─▶ /api/integrations/{qbo,square}/oauth ─▶ lib/qbo.ts, lib/pos.ts
Website ─▶ GET /api/public/menus/[publicId] ─▶ lib/supabase/public-menu.ts
```

## Boundaries
| Layer | Path | Size |
|---|---|---|
| Pages | `app/` | 106 pages, 4 layouts |
| Commands | `lib/commands/` | 38 files, 308 commands/queries |
| Screen views | `components/mgr/views/`, `lib/mgr/*-view.ts` | 170 views + 119 adapters |
| UI primitives | `components/ui/` (shadcn, don't hand-edit) | 31 files |
| Schema | `supabase/migrations/` | 233 immutable files, hash-locked |
| Proof | `tests/` (pure + real local Supabase), `tests-e2e/` | 519 test files + 13 runtime scripts |

## Roles
Staff: admin, sales, warehouse, brewer, taproom (`lib/mgr/enums.ts`); memberships hold a role set.
Customer: portal-only, via `lib/commands/portal.ts`.

## Deploy
Vercel `iad1`, build `scripts/vercel-build.sh`. CI `.github/workflows/ci.yml` is the
merge gate; `scripts/land-pr.sh` lands PRs.

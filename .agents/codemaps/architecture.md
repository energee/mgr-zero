<!-- Generated: 2026-10-16 | Commit: 239c3929 | Files scanned: 1541 | Token estimate: ~600 -->
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
        Postgres: public tables (read-only to app roles), private.*, ~486 functions
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
| Pages | `app/` | 113 pages, 3 layouts |
| Commands | `lib/commands/` | 37 files, ~282 commands/queries |
| Screen views | `components/mgr/views/`, `lib/mgr/*-view.ts` | 154 + 162 files |
| UI primitives | `components/ui/` (shadcn, don't hand-edit) | 31 files |
| Schema | `supabase/migrations/` | 142 immutable files, hash-locked |
| Proof | `tests/` (real local Supabase), `tests-e2e/` | 387 + 6 |

## Roles
Staff: admin, sales, warehouse, brewer, taproom (`lib/commands/registry.ts:11`).
Customer: portal-only, via `lib/commands/portal.ts`.

## Deploy
Vercel `iad1`, build `scripts/vercel-build.sh`. CI `.github/workflows/ci.yml` is the
merge gate; `scripts/land-pr.sh` lands PRs.

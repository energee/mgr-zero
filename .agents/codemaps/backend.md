<!-- Generated: 2026-10-16 | Commit: 239c3929 | Files scanned: 1541 | Token estimate: ~860 -->
# Backend

## HTTP routes
```
POST /api/command                 → consumeAdmission → buildRouteContext|buildContextFromBearer → runCommand
POST /api/chat                    → consumeAdmission → streamText(gateway) + lib/chat/agent.ts tools
GET  /api/search                  → fumadocs createFromSource (docs search)
GET  /api/public/menus/[publicId] → lib/supabase/public-menu.ts (service RPC get_published_pos_menu), +OPTIONS
GET  /api/chat/slack/{install,oauth}     → lib/chat/oauth.ts
POST /api/webhooks/slack                 → lib/chat (events, App Home, actions)
POST /api/chat/jobs/{scan,deliver,cleanup} → lib/chat/jobs.ts      (Bearer job secret, lib/jobs/auth.ts)
POST /api/email/jobs/deliver             → lib/email/jobs.ts → Resend
POST /api/retention/jobs/prune           → lib/retention/jobs.ts
GET  /api/integrations/qbo/oauth         → lib/commands/qbo.ts, lib/qbo.ts
GET  /api/integrations/square/oauth      → lib/commands/pos.ts, lib/pos.ts
GET  /auth/confirm                       → app/(auth)/auth/confirm/route.ts
GET  /portal/invoices/[id]/pay           → app/(portal)/portal/invoices/[id]/pay/route.ts
```

## Command registry
`lib/commands/registry.ts` — `defineCommand`, `defineQuery`, `definePreTenant*`,
`runCommand`, `unwrap`, `CommandError`, shared zod (`cents`, `stateCode`, `phone`).
`lib/commands/all.ts` imports every area (side-effect registration).
`lib/commands/context.ts` — `buildContext` (identity + one `brewery_users` role).
`lib/commands/admission.ts` — per-user budget, fail-closed 503 / 429.

## Areas (file → commands+queries)
```
catalog.ts     29  products, SKUs, formats, locations, bins
orders.ts      29  order lifecycle, allocations, pick/ship, invoices, credit memos
production.ts  26  recipes, batches, vessels, cellar, fermentation, completion
taproom.ts     21  keg pools/events, taproom counts, tap intervals, variance
purchasing.ts  19  vendors, materials, contracts, POs, receipts, counts
pos.ts         18  Square connect, mappings, catalog publish, sales
chat.ts        17  staff chat linking, notification settings
inventory.ts   15  movement ledger at bin grain
packaging.ts   15  packaging runs: schedule/start/close/repack
compliance.ts  13  TTB reports, lot trace, filings, COLA search
portal.ts      13  customer-role commands only
qbo.ts         12  QuickBooks connect, mapping, invoice push, payments
settings.ts    11  brewery, team roles, revoke
customers.ts   10  customers, ship-tos, price lists
delivery.ts     8  routes: save/depart/leave/return
invites.ts      8  staff/customer invitations
transfers.ts    7  stock transfers (not priced orders)
preview.ts      5  dry-run previews
landings.ts 2 | today.ts 2 | search.ts 1 | import.ts 1
```

## Service-role owners (eslint-restricted `lib/supabase/admin.ts`)
`lib/chat/jobs.ts`, `lib/email/jobs.ts`, `lib/retention/jobs.ts`,
`lib/supabase/{provision,invites,public-menu,integration-tokens}.ts`.

## Large server modules
lib/qbo.ts (937, QBO transport) · lib/pos.ts (842, Square transport) ·
lib/supabase/integration-tokens.ts (783, credential CAS) · lib/chat/jobs.ts (418) ·
lib/composer/outbox.ts (335, offline command outbox in localStorage)

## Generated
`lib/supabase/database.generated.ts` (5658, `bun run types:database`) ·
`content/docs/api/*.mdx` blocks (`bun run docs:api`, from `lib/mgr/api-operations.ts`).

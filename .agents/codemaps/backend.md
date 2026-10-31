<!-- Generated: 2026-10-31 | Commit: b8cb91afd | Tracked files scanned: 1878 -->
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
`lib/commands/context.ts` — `buildContext` (identity + one `brewery_users` membership with a role set).
`lib/commands/admission.ts` — per-user budget, fail-closed 503 / 429.

## Areas (file → commands+queries)
```
catalog.ts     29  products, SKUs, formats, locations, bins
orders.ts      32  order lifecycle, allocations, pick/ship, invoices, credit memos
production.ts  28  recipes, batches, vessels, cellar, fermentation, completion
taproom.ts     21  keg pools/events, taproom counts, tap intervals, variance
purchasing.ts  21  vendors, materials, contracts, POs, receipts, counts
pos.ts         20  Square connect, mappings, catalog publish, sales
chat.ts        17  staff chat linking, notification settings
inventory.ts   16  movement ledger at bin grain
packaging.ts   15  packaging runs: schedule/start/close/repack
compliance.ts  19  TTB reports, lot trace, filings, COLA search
portal.ts      13  customer-role commands only
qbo.ts         17  QuickBooks connect, mapping, invoice push, payments, receipt bills
settings.ts    11  gravity unit, brewery profile, AI model, operating defaults, books opened on, one-way keg fee
customers.ts   11  customers, ship-tos, price lists
delivery.ts     8  routes: save/depart/leave/return
invites.ts     12  staff/customer memberships, roles, invitations
transfers.ts    6  stock transfers (not priced orders)
preview.ts      5  dry-run previews
landings.ts 2 | today.ts 2 | search.ts 1 | import.ts 1 | tenancy.ts 1
```

## Service-role owners (eslint-restricted `lib/supabase/admin.ts`)
`lib/chat/jobs.ts`, `lib/email/jobs.ts`, `lib/retention/jobs.ts`,
`lib/supabase/{provision,invites,public-menu,integration-tokens,cola-label-images}.ts`.

## Large server modules
lib/qbo.ts (1281, QBO transport) · lib/pos.ts (883, Square transport) ·
lib/supabase/integration-tokens.ts (870, credential CAS) · lib/chat/jobs.ts (438) ·
lib/composer/outbox.ts (363, offline command outbox in localStorage)

## Generated
`lib/supabase/database.generated.ts` (5930 lines, `bun run types:database`) ·
`content/docs/api/*.mdx` blocks (`bun run docs:api`, from `lib/mgr/api-operations.ts`).

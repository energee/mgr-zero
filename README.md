# MGR

MGR is a multi-tenant brewery operations system: catalog, immutable
inventory ledger, allocations/ATP, CSV import, and staff/customer
invitations, built on Next.js (App Router, TypeScript) and Supabase
(Postgres, Auth, RLS). This repo currently covers **Slice 1A — Foundation**
(tenancy, ledger, catalog, import, invites) and **Slice 1B — Orders**
(orders, shipments, invoicing, customer portal). QBO integration and AI
chat are Slice 1C.

- Customer user guide: [`docs/user-guide.md`](docs/user-guide.md)
- Spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`
- Plan: `.agents/superpowers/plans/2026-08-30-slice1a-foundation.md`
- Schema: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why)

## Iron rules

See `.agents/ARCHITECTURE.md` for the ownership map and the five iron rules
(commands-only, append-only ledger, RLS everywhere, admin client confined,
multi-row writes are one Postgres function)
and what enforces each one. Agents start at `AGENTS.md`.

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
never used outside local development). A customer-only account (a
`customer_users` row with no `brewery_users` row) lands on `/portal` instead
of `/` after login — that's the wholesale customer portal, not a bug.

Working in a worktree (`.agents/worktrees/<branch>`): `.env.local` is
gitignored and **not** inherited from the main checkout — copy it in
(`cp ../../../.env.local .env.local` or similar) before running `npm test`
or `npm run dev` there, or Supabase calls fail with `supabaseKey is
required`.

```bash
npm run dev   # http://localhost:3000
```

## HTTP API

One endpoint: `POST /api/command`. You authenticate as a brewery user, name the
command, and pass its input. Data is always scoped to `breweryId` — you only
see that brewery, and only if you are a member.

### Auth

Send a user access token:

```
Authorization: Bearer <access_token>
```

Exchange email/password for a token at the project's Auth URL (`/auth/v1/token?grant_type=password`, header `apikey` = the project's anon key). Tokens expire; use the `refresh_token` from the same response when you need a new one. A logged-in browser session (cookies) also works.

```bash
TOKEN=$(curl -sS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"you@brewery.example","password":"..."}' \
  | jq -r .access_token)

curl -sS http://localhost:3000/api/command \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"breweryId":"<brewery uuid>","name":"list_products","input":{}}'
```

Staff roles: `admin`, `sales`, `warehouse`, `brewer`. Each command lists who may call it. Customer-portal users are `customer` and currently have no commands.

### Request / response

```json
{ "breweryId": "<uuid>", "name": "list_products", "input": {} }
```

Success: `{ "ok": true, "data": ... }` (HTTP 200). Failure: `{ "ok": false, "error": "..." }`.

| HTTP | Meaning |
| --- | --- |
| 401 | Missing, malformed, expired, or revoked token |
| 403 | Authenticated, but not a member of `breweryId`, or your role cannot run this command |
| 400 | Unknown command, invalid `input`, or a data rule rejected the write |
| 500 | Server error (message is generic) |

### Catalog

| Command | Roles | `input` |
| --- | --- | --- |
| `list_products` | admin, sales, warehouse | `{}` — products with nested SKUs, A–Z |
| `list_skus` | admin, sales, warehouse | `{}` — `{ id, name, products: { name } }` |
| `list_locations` | admin, sales, warehouse | `{}` — `{ id, name, kind }` |
| `create_product` | admin, sales | `{ name, style?, abv? }` |
| `create_sku` | admin, sales | `{ productId, name, packageType, bblPerUnit, unitsPerCase? }` — `packageType` is `keg`, `can`, or `bottle`; `bblPerUnit` is a numeric string (`"0.5"`) |
| `create_location` | admin | `{ name, kind }` — `kind` is `warehouse` or `taproom` |

### Inventory

On-hand is the sum of an append-only movement ledger. You never send `bbl`; it is computed from `qty × sku.bbl_per_unit`. Corrections are new movements, not edits.

| Command | Roles | `input` |
| --- | --- | --- |
| `get_on_hand` | admin, sales, warehouse | `{ skuId? }` — qty per SKU/location |
| `get_atp` | admin, sales, warehouse | `{ skuId? }` — on-hand minus open allocations |
| `list_movements` | admin, sales, warehouse | `{ skuId?, limit? }` — newest first; `limit` default 50, max 200 |
| `record_movement` | admin, warehouse | `{ skuId, locationId, qty, type, channel?, destState?, note? }` — `qty` ≠ 0; `destState` is a 2-letter code |
| `set_taproom_par` | admin, sales | `{ locationId, skuId, parQty }` |

`record_movement` `type`: `opening_balance`, `production_in`, `adjustment`, `sale_removal`, `taproom_transfer`, `depletion`, `return_in`, `destruction`, `loss`, `sample`, `festival_removal`.

`channel` (when the movement is a removal): `wholesale`, `taproom`, `dtc`, `export`.

### Import

`import_csv` (admin). `{ kind, rows }` — at most 5000 rows per call. Each row is a string map. Per-row failures are returned, not thrown: `{ inserted, errors: [{ row, message }] }` (`row` is 0-based).

| `kind` | Required columns | Optional |
| --- | --- | --- |
| `customers` | `name`, `state` | `type`, `license_no`, `payment_terms` |
| `ship_tos` | `customer_name`, `label`, `address1`, `city`, `state`, `zip` | |
| `products_skus` | `product`, `sku_name`, `package_type`, `bbl_per_unit` | `style`, `abv`, `units_per_case` |
| `price_list_items` | `product`, `sku_name`, `price_list`, `unit_price_cents` | |
| `opening_balances` | `product`, `sku_name`, `location`, `qty` | |

Names resolve within the brewery. Missing products/price lists are created; missing SKUs, locations, and customers are errors.

### Team

| Command | Roles | `input` |
| --- | --- | --- |
| `list_team_members` | admin, sales, warehouse | `{}` — `{ user_id, role }` (no emails) |
| `invite_staff` | admin | `{ email, role }` — `role` is `admin`, `sales`, `warehouse`, or `brewer` |
| `invite_customer_user` | admin, sales | `{ email, customerId }` |

## Tests

```bash
npm test          # vitest run — real local Supabase, not mocks
npm run lint       # eslint, incl. the admin-client import guard
npx tsc --noEmit   # typecheck
npm run build      # production build
npm run test:e2e   # agent-browser smoke — local only, not run in CI
```

`npm run test:e2e` drives the browser with `agent-browser` (Vercel's browser
automation CLI) instead of Playwright. It runs agent-browser's bundled Chrome
by default; `E2E_ENGINES=lightpanda,chrome` re-enables the engine-fallback
chain (each engine gets freshly seeded data; the script prints which engine
passed). Lightpanda renders the app but is currently blocked by
engine/adapter gaps — benchmark + status in
`.ecc/benchmarks/e2e-engines-2026-08-31.json`; retest after
`brew upgrade lightpanda` or an agent-browser release. The script starts its own `next dev` on port
3100 (not 3000, so it never collides with another worktree's dev server on
the same repo), reusing one already running there, and stops what it
started on both success and failure. It needs `npx supabase start` and a
`.env.local` in place, same as the vitest suite. See `tests-e2e/portal-smoke.ts`.

Test files: `tests/api-command.test.ts` (Bearer auth on `/api/command`),
`tests/rls-tenancy.test.ts`, `tests/rls-ledger.test.ts` (RLS
isolation, ledger immutability, CHECK constraints, ATP math),
`tests/registry.test.ts` (command registry validation/permissions),
`tests/commands-inventory.test.ts` (catalog/inventory commands),
`tests/commands-import.test.ts` (CSV import), `tests/commands-invites.test.ts`
(invitations), `tests/schema-rules.test.ts` (pg_catalog gates: RLS on every
table, `security_invoker` views, `search_path` on functions, no anon-executable
definer functions), `tests/schema-conventions.test.ts` (composite FKs, lot
trigger, append-only ledgers), `tests/write-atomicity.test.ts` (iron rule 5). Tests run against the real local Supabase stack (not a
mock) — `npx supabase start` must be running first.

## HTTP API

All reads and writes go through one endpoint:

```
POST /api/command
Content-Type: application/json

{ "breweryId": "<uuid>", "name": "<command name>", "input": { ... } }
```

Authentication is the Supabase cookie session of the logged-in user
(established by the app's login flow). The caller must be a member of the
brewery named by `breweryId`: either staff (a `brewery_users` row with role
`admin`, `sales`, `warehouse`, or `brewer`) or a portal user (a
`customer_users` row linked to one of the brewery's customers, which gives
the `customer` role). Each command lists the roles allowed to call it.

Responses:

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `{ "ok": true, "data": ... }` | success; `data` is the command's result |
| 400 | `{ "ok": false, "error": "<message>" }` | any expected failure: unauthenticated, not a member, permission denied, unknown command, input validation, or a domain rule (e.g. wrong order status) |
| 500 | `{ "ok": false, "error": "internal error" }` | unexpected failure |

Input fields are camelCase; ids are UUIDs; money is integer cents; dates
are `YYYY-MM-DD` strings. `limit` parameters default to 50 (max 200).

### Catalog

| Command | Roles | Purpose |
| --- | --- | --- |
| `create_product` | admin, sales | Create a beer brand/product (`name`, optional `style`, `abv`) |
| `create_sku` | admin, sales | Create a sellable format (`productId`, `name`, `packageType` keg/can/bottle, optional `unitsPerCase`, `bblPerUnit` as a numeric string) |
| `create_location` | admin | Create a `warehouse` or `taproom` location |
| `list_products` | admin, sales, warehouse | Products with their SKUs, alphabetical |
| `list_skus` | admin, sales, warehouse | SKUs with product name, alphabetical |
| `list_locations` | admin, sales, warehouse | Warehouses and taprooms, alphabetical |

### Inventory

| Command | Roles | Purpose |
| --- | --- | --- |
| `record_movement` | admin, warehouse | Append an inventory movement (`skuId`, `locationId`, non-zero `qty`, `type`, optional `channel`, `destState`, `note`). The ledger is immutable — corrections are new opposite movements, not edits. `bbl` is computed server-side; don't send it |
| `set_taproom_par` | admin, sales | Set the par level for a SKU at a taproom |
| `get_on_hand` | admin, sales, warehouse | On-hand quantity per SKU/location (optional `skuId` filter) |
| `get_atp` | admin, sales, warehouse | Available-to-promise (on-hand minus open allocations) per SKU |
| `list_movements` | admin, sales, warehouse | Recent movements, newest first (optional `skuId`, `limit`) |

### Customers & pricing

| Command | Roles | Purpose |
| --- | --- | --- |
| `upsert_customer` | admin, sales | Create or update a customer (`name`, `type` distributor/retailer/brewery/other, two-letter `state`, optional `priceListId`, `licenseNumber`, `paymentTerms`). Pass `id` to update, omit to create |
| `upsert_ship_to` | admin, sales | Create or update a ship-to address (`customerId`, `label`, `address1`, optional `address2`, `city`, `state`, `zip`); the state drives excise destination reporting |
| `upsert_price_list` | admin, sales | Create or rename a price list |
| `set_price` | admin, sales | Set a SKU's price on a price list (`unitPriceCents`, integer) |
| `list_customers` | admin, sales, warehouse | Customers alphabetical with price list name |
| `get_customer` | admin, sales, warehouse | One customer with its ship-tos |
| `list_price_lists` | admin, sales | Price lists with their per-SKU prices |

### Orders & fulfillment

An order moves `draft → submitted → confirmed → picked → shipped` (or
`cancelled` any time before shipping). Line items are
`{ skuId, qty }`; prices are snapshotted from the customer's price list at
creation. Mutations return `{ order_id }` unless noted.

| Command | Roles | Purpose |
| --- | --- | --- |
| `create_order` | admin, sales | Create a draft order (`kind` wholesale/taproom_transfer, `fromLocationId`, `lines`, optional `customerId`, `shipToId`, `toLocationId`, `requestedShipDate`, `poNumber`, `note`) |
| `update_draft_order` | admin, sales | Replace a draft order's header fields and lines |
| `submit_order` | admin, sales | Submit a draft order for confirmation |
| `confirm_order` | admin, sales | Confirm a submitted order and create allocations. Returns `{ order_id, warnings }` where `warnings` is `[{ sku_id, atp }]` for any SKU whose ATP went negative — soft warnings, the confirm still succeeds |
| `adjust_order_lines` | admin, sales | Replace lines on a confirmed/picked order (`reason` required); re-syncs allocations and flags restocking if already picked |
| `cancel_order` | admin, sales | Cancel an unshipped order (`reason` required) and release its allocations |
| `record_pick` | admin, warehouse | Record picked quantities per line (`picks: [{ lineId, qty }]`); order becomes picked |
| `ship_order` | admin, warehouse | Ship a picked order (`ship: [{ lineId, qty }]` must cover every line; optional `carrier`, `tracking`). One transaction: inventory movements, allocation fulfillment, and the invoice. Returns `{ order_id, invoice_id }` |
| `create_credit_memo` | admin, sales | Credit an invoice (`invoiceId`, `locationId`, `reason`, `lines: [{ invoiceLineId, qty }]`): negative invoice lines at original prices plus return-in movements. Returns `{ invoice_id }` |
| `create_replenishment_order` | admin, sales | Create an already-confirmed taproom transfer from par-gap quantities (`fromLocationId`, `toLocationId`, `lines`) |
| `list_orders` | admin, sales, warehouse | Orders newest first, optional `status` filter |
| `get_order` | admin, sales, warehouse | One order with lines, event history, shipment, and per-SKU ATP |
| `daily_pick_sheet` | admin, sales, warehouse | Confirmed/picked orders with lines, ordered by requested ship date (optional `date` filter) |
| `list_invoices` | admin, sales, warehouse | Invoices and credit memos, newest first (optional `customerId`, `limit`) |
| `get_invoice` | admin, sales, warehouse | One invoice with its lines |
| `replenishment_suggestions` | admin, sales, warehouse | Per-taproom par gap: par − on-hand and suggested transfer qty (`locationId`) |

### Import

| Command | Roles | Purpose |
| --- | --- | --- |
| `import_csv` | admin | Bulk-import parsed CSV rows (`kind`: customers, ship_tos, products_skus, price_list_items, opening_balances; `rows`: array of string-keyed objects, max 5000 per batch). Referenced entities are resolved by name; products and price lists are created on the fly. Returns `{ inserted, errors: [{ row, message }] }` — a bad row is reported, not fatal to the batch |

### Invitations & team

| Command | Roles | Purpose |
| --- | --- | --- |
| `invite_staff` | admin | Invite an email to join the brewery's staff with a role. Returns `{ userId }` |
| `invite_customer_user` | admin, sales | Invite an email to a customer's portal (`customerId`). Returns `{ userId }` |
| `list_team_members` | admin, sales, warehouse | Staff memberships (user id + role) |

### Customer portal

Callers with the `customer` role (portal users) see only their own
customer's data; these are the only commands that role can call. Portal
orders are wholesale orders shipped from the brewery's warehouse.

| Command | Roles | Purpose |
| --- | --- | --- |
| `portal_create_order` | customer | Create a draft order for the caller's account (`shipToId`, `lines`, optional `poNumber`, `note`) |
| `portal_update_draft_order` | customer | Replace a draft order's lines/fields |
| `portal_submit_order` | customer | Submit a draft order |
| `portal_catalog` | customer | Orderable SKUs with the caller's prices and an availability badge |
| `portal_orders` | customer | The caller's orders with lines, newest first |
| `portal_order` | customer | One order with lines and event history |
| `portal_invoices` | customer | The caller's invoices and credit memos, newest first |

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
`npm run lint`, `tsc --noEmit` and `npm run build`. This is the merge gate — RLS and
command-registry correctness are enforced here, not just locally.

After a pull request merges, `.github/workflows/documentation-agent.yml` runs a
read-only Claude Code review and opens or refreshes a follow-up issue when the
merged behavior is missing from its owning documentation or contradicts it. The
Claude job uses the same `CLAUDE_CODE_OAUTH_TOKEN` secret as the existing Claude
workflows, has only repository read permissions, may use only Read, Grep, and
Glob, and carries Claude Code permission denies for common runner secret locations
and credential dotfiles outside the checked-out repository. A separate
deterministic job with issue-write permission turns Claude's schema-validated
`DOCS_GAP` output into one idempotent issue per merged PR; the bot never commits
documentation directly to `main`.

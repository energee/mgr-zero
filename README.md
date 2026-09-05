# MGR

MGR is a multi-tenant brewery operations system: catalog, immutable
inventory ledger, allocations/ATP, CSV import, and staff/customer
invitations, built on Next.js (App Router, TypeScript) and Supabase
(Postgres, Auth, RLS). This repo currently covers **Slice 1A — Foundation**
(tenancy, ledger, catalog; import and invites registered but fail closed) and **Slice 1B — Orders**
(orders, shipments, invoicing, customer portal). QBO integration and AI
chat are Slice 1C.

- Documentation: [`content/docs/`](content/docs/) — Fumadocs MDX served at `/docs` (`index.mdx` chooses between the staff and customer-portal guides; search at `/api/search`)
- Spec: `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md`
- Plan: `.agents/superpowers/plans/2026-08-30-slice1a-foundation.md`
- Schema: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` (tables) and `2026-08-31-mgr-schema-decisions.md` (why)

## Iron rules

See `.agents/ARCHITECTURE.md` for the ownership map and the five iron rules
(commands-only, append-only ledger, RLS everywhere, admin client confined,
multi-row writes are one Postgres function)
and what enforces each one. Agents start at `AGENTS.md`.

## Local development

Requires Node.js 22.x and Bun 1.3.x. The repository pins Node in `.node-version`
and `package.json`, and Bun in `.bun-version` / `packageManager`; use Bun for
installs and scripts, and Node 22 as the Next.js runtime.

Local Supabase runs on non-default ports (54341/54342/54343) configured
in the committed `supabase/config.toml`. These ports are used by every
developer and in CI — they were chosen to avoid colliding with a
default-port Supabase project running alongside locally. Verify the live
values with `bunx supabase status`:

```
API URL:  http://127.0.0.1:54341
DB URL:   postgresql://postgres:postgres@127.0.0.1:54342/postgres
Studio:   http://127.0.0.1:54343
```

CI (`.github/workflows/ci.yml`) derives env vars from
`bunx supabase status -o env` rather than hardcoding them, so the setup
automatically adapts to the values in `config.toml`.

### Setup

```bash
bun install
bunx supabase start        # starts the local Postgres/Auth/Studio stack
bunx supabase status -o env | node scripts/supabase-env.mjs > .env.local
```

The mapper converts the Supabase CLI's local key labels into the application's
modern environment contract. Add a separate random HMAC secret of at least 32
characters to `.env.local`:

```dotenv
COMMAND_RATE_LIMIT_HMAC_SECRET=<random secret of at least 32 characters>
```

Apply migrations and seed a dev user/brewery:

```bash
bunx supabase db reset             # applies supabase/migrations/*.sql
bun --env-file=.env.local scripts/seed-dev.ts   # idempotent; creates "Demo Brewing" + dev@mgr.local
```

Seeded dev login: `dev@mgr.local` / `dev-password-1` (dev-only credential —
never used outside local development). A customer-only account (a
`customer_users` row with no `brewery_users` row) lands on `/portal` instead
of `/` after login — that's the wholesale customer portal, not a bug.

Working in a worktree (`.agents/worktrees/<branch>`): `.env.local` is
gitignored and **not** inherited from the main checkout — copy it in
(`cp ../../../.env.local .env.local` or similar) before running `bun run test`
or `bun run dev` there, or Supabase calls fail with `supabaseKey is
required`.

```bash
bun run dev   # http://localhost:3000
```

## Tests

```bash
bun run test       # vitest run — real local Supabase, not mocks
bun run lint       # eslint, incl. the admin-client import guard
bunx tsc --noEmit  # typecheck
bun run build      # production build
bun run test:e2e   # agent-browser smoke — local only, not run in CI
```

`bun run test:e2e` drives the browser with `agent-browser` (Vercel's browser
automation CLI) instead of Playwright. It runs agent-browser's bundled Chrome
by default; `E2E_ENGINES=lightpanda,chrome` re-enables the engine-fallback
chain (each engine gets freshly seeded data; the script prints which engine
passed). Lightpanda renders the app but is currently blocked by
engine/adapter gaps — benchmark + status in
`.ecc/benchmarks/e2e-engines-2026-08-31.json`; retest after
`brew upgrade lightpanda` or an agent-browser release. The script starts its own `next dev` on port
3100 (not 3000, so it never collides with another worktree's dev server on
the same repo), reusing one already running there, and stops what it
started on both success and failure. It needs `bunx supabase start` and a
`.env.local` in place, same as the vitest suite. See `tests-e2e/portal-smoke.ts`.

Test files: `tests/api-command.test.ts` (Bearer auth on `/api/command`),
`tests/rls-tenancy.test.ts`, `tests/rls-ledger.test.ts` (RLS
isolation, ledger immutability, CHECK constraints, ATP math),
`tests/registry.test.ts` (command registry validation/permissions),
`tests/commands-inventory.test.ts` (catalog/inventory commands),
`tests/commands-import.test.ts` (CSV import blocked), `tests/commands-invites.test.ts` (invitations blocked)
(invitations), `tests/schema-rules.test.ts` (pg_catalog gates: RLS on every
table, `security_invoker` views, `search_path` on functions, no anon-executable
definer functions), `tests/schema-conventions.test.ts` (composite FKs, lot
trigger, append-only ledgers), `tests/write-atomicity.test.ts` (iron rule 5). Tests run against the real local Supabase stack (not a
mock) — `bunx supabase start` must be running first.

## HTTP API

All reads and writes go through one endpoint. Registered operations are
classified as queries (side-effect-free reads) or commands (writes):

```
POST /api/command
Content-Type: application/json

{ "breweryId": "<uuid>", "name": "<operation name>", "input": { ... }, "requestId": "<uuid for commands>" }
```

`breweryId`, `name`, and `input` are required. A query may omit `requestId`; a
command must submit a client-generated RFC 9562/4122 UUID `requestId` before
the handler can run.

Authentication is either the Supabase cookie session established by the app's
login flow or `Authorization: Bearer <supabase access_token>`. The caller must be a member of the
brewery named by `breweryId`: either staff (a `brewery_users` row with role
`admin`, `sales`, `warehouse`, or `brewer`) or a portal user (a
`customer_users` row linked to one of the brewery's customers, which gives
the `customer` role). Each command lists the roles allowed to call it.

Every response includes a server-generated `correlationId`. Success is
`{ "ok": true, "data": ..., "correlationId": "<uuid>" }`; command successes
also include the submitted `requestId`. Failures use the structured public
envelope `{ "ok": false, "error": { "code": "...", "message": "..." },
"correlationId": "<uuid>" }` and include a submitted `requestId` when present.

| Status | Meaning |
| --- | --- |
| 200 | Success; `data` is the operation result |
| 400 | Non-JSON body, invalid request, missing/malformed command `requestId`, invalid input, or a domain rule |
| 401 | Unauthenticated |
| 403 | Not a member of the brewery or permission denied |
| 409 | `requestId` reused with a different payload (`conflict`) |
| 404 | Unknown operation (`unknown_command`), or a `get_*` id that matches no record the caller may see (`not_found`) |
| 500 | Unexpected failure; database errors surface as `db_error` with a generic message and are logged server-side |

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
| `set_standing_allocation` | admin, sales | Set or release a standing taproom allocation (`locationId`, `skuId`, nonnegative `qty`; zero releases it) |
| `get_on_hand` | admin, sales, warehouse | On-hand quantity per SKU/location (optional `skuId` filter) |
| `get_atp` | admin, sales, warehouse | Available-to-promise (on-hand minus open allocations) per SKU |
| `list_movements` | admin, sales, warehouse | Recent movements, newest first (optional `skuId`, `limit`) |
| `list_standing_allocations` | admin, sales, warehouse | Open standing taproom allocations, optionally filtered by `locationId` |

### Customers & pricing

| Command | Roles | Purpose |
| --- | --- | --- |
| `upsert_customer` | admin, sales | Create or update a customer (`name`, `type` distributor/retailer/brewery/other, two-letter `state`, optional `priceListId`, `licenseNumber`, `paymentTerms`). Pass `id` to update, omit to create |
| `upsert_ship_to` | admin, sales | Create or update a ship-to address (`customerId`, `label`, `address1`, optional `address2`, `city`, `state`, `zip`); the state drives excise destination reporting |
| `upsert_price_list` | admin, sales | Create or rename a price list |
| `set_price` | admin, sales | Set a SKU's price on a price list (`unitPriceCents`, integer) |
| `set_portal_fulfillment_source` | admin | Set the warehouse customer portal orders ship from (must be one of the brewery's warehouses; portal ordering fails until it is set) |
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
| `import_csv` | admin | Not available in this release: validates `{ kind, rows }` then fails closed with a `CommandError`; nothing is written |

### Invitations & team

| Command | Roles | Purpose |
| --- | --- | --- |
| `invite_staff` | admin | Not available in this release: validates then fails closed with a `CommandError` |
| `invite_customer_user` | admin, sales | Not available in this release: validates then fails closed with a `CommandError` |
| `list_team_members` | admin, sales, warehouse | Staff memberships (user id + role) |

### Chat notifications & Today

| Command | Roles | Purpose |
| --- | --- | --- |
| `get_today` | admin, sales, warehouse, brewer | Role-filtered work assigned, due, or overdue now (`{ now? }`, an offset-aware ISO timestamp) |
| `set_notification_preference` | admin, sales, warehouse, brewer | Enable or mute one notification reason (`{ reason, enabled, quietHours? }`); quiet hours use `HH:MM` start/end and an optional timezone |
| `set_brewery_quiet_hours` | admin | Set or clear brewery-wide quiet hours (`{ installationId, start, end }`; times are `HH:MM` or both null) |
| `set_notification_destination` | admin | Choose the private operations destination for scheduled digests (`{ installationId, externalDestinationId }`) |
| `consume_chat_link_proof` | admin, sales, warehouse, brewer | Link the current staff account using `{ proof }` from a single-use link |
| `unlink_chat_user` | admin, sales, warehouse, brewer | Unlink your own Slack account by `linkId`; admins may unlink any staff account |
| `get_chat_link_status` | admin, sales, warehouse, brewer | Return the current user's link status for an `installationId` |

Notification `reason` is `submitted_order`, `pick_due`, `delivery_next`,
`fermentation_reading_overdue`, or `operations_digest`.

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

**Not yet provisioned.** No hosted Supabase project or Vercel project exists
for this repo yet. When that is set up, create the hosted Supabase and Vercel
projects and configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and
`COMMAND_RATE_LIMIT_HMAC_SECRET` in Vercel. Then run `bunx supabase db push` against
the hosted project, deploy, and verify login → catalog → inventory on the
preview URL.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: installs
deps, starts a local Supabase stack with only the services the tests use
(Postgres, Auth, PostgREST, Kong, and the mailpit SMTP sink Auth sends
invites to — `supabase start -x …` excludes the rest),
which applies migrations on the fresh stack, runs the full vitest suite
against it, then
`bun run lint`, `tsc --noEmit` and `bun run build`. This is the merge gate — RLS and
command-registry correctness are enforced here, not just locally.

After a pull request merges—or when manually dispatched on `main`—
`.github/workflows/documentation-agent.yml` audits every current user-facing
route, not only the triggering change, and updates the
staff and portal field manuals linked from `content/docs/index.mdx` when behavior has drifted. The
Claude job has read-only GitHub permissions and may edit only those three MDX files. A separate
deterministic job rejects wider or active-content changes, then maintains one
reviewable `documentation/user-guide` pull request; the bot never commits directly
to `main`.

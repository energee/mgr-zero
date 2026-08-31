# MGR

MGR is a multi-tenant brewery operations system: catalog, immutable
inventory ledger, allocations/ATP, CSV import, and staff/customer
invitations, built on Next.js (App Router, TypeScript) and Supabase
(Postgres, Auth, RLS). This repo currently covers **Slice 1A — Foundation**
(tenancy, ledger, catalog, import, invites). Orders/shipments/portal are
Slice 1B; QBO integration and AI chat are Slice 1C.

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
never used outside local development).

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
```

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

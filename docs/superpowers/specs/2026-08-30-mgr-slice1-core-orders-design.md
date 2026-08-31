# MGR — Slice 1 Design: Core + Orders

Date: 2026-08-30
Status: Approved by Ted (in-chat design review)

## Product context

MGR is a multi-brewery SaaS for brewery operations. Full capability map (each its own spec → plan → build cycle):

| # | Slice | Contents |
|---|-------|----------|
| 1 | **Core + Orders (this spec)** | Tenancy/auth/roles, product catalog, FG inventory movement ledger, wholesale portal + internal order entry + taproom transfers, invoicing, QBO invoices-out/payments-back |
| 2 | Raw materials | Vendors, POs, receiving, lot management, materials inventory (own movement ledger mirroring slice 1's), packaging materials as first-class per-SKU materials, PO-draft-from-requirements engine (shortfall = required − on-hand − open POs, so returned leftovers automatically suppress reorders), cycle counts with adjustment movements to keep material on-hand honest, unit-of-measure conversions (lbs/kg/oz/each) for BOMs and POs, hop/malt contracts as committed quantities drawn down over time, **receiving approval**: expected vs. actual counted qty per PO line, over/short recorded, partial receipts (`partially_received`), only counted quantities post to the materials ledger, discrepancies flagged for vendor follow-up |
| 3 | Recipes | Recipe dev against materials, versions, scaling, costing |
| 4 | Batches + cellar | Brew scheduling, vessels (barrels count as vessels for aging programs), fermentation logs (temp/pH/gravity), transfers, batch→FG conversion (replaces slice 1's manual FG entry). Mobile-first forms tolerant of flaky brewery-floor wifi |
| 5 | Packaging | Packaging runs (keg/bottle/can), lot codes, yields/losses; runs declare material requirements via per-SKU packaging BOM (cans, ends, labels, trays, 4-pack holders …); pre-run checklist from requirements engine (required / on hand / incoming / short); run close records actual consumption + returns (leftover labels → `return_to_stock`, damage → `loss`). Keg SKUs declare container source: `owned_fleet` (asset move, slice 9 ledger) \| `per_fill_rental` (per-fill cost + vendor billing) \| `one_way_material` (consumed like cans) |
| 6 | Compliance reporting | TTB Brewer's Report of Operations + pluggable per-state excise (PA first, OH next) as pure functions over the movement ledger; CBMA reduced-rate table; COLA/formula approval tracking per product + state brand registrations per destination state |
| 7 | POS reconciliation | Square ingest, taproom depletion vs. transfer reconciliation (other POS later) |
| 8 | Planning | Order demand vs. planned brew/packaging schedule; feeds requirements engine ("Sept 12 packaging day short 4,000 labels, 10-day lead time — draft PO?") |
| 9 | Keg fleet | Owned-keg asset ledger: states (empty/filled/shipped/at-customer/lost), which customer holds how many, deposit balances, loss rates. Integrates with packaging (fill = asset state change) and orders (ship/return). Per-fill rental and one-way kegs are handled in slices 2/5, not here |
| 10 | Deliveries | Self-distribution logistics: routes, truck loading, delivery confirmation, invoice-on-delivery |

### Compliance research findings (constrain the ledger design)

- Wholesale into other states: destination-state supplier registration required; most states have the distributor remit excise, but **Ohio and Wisconsin require the out-of-state brewery to register and remit excise on volume shipped in**. Per-state excise reports with per-state rules are a launch-relevant requirement (PA brewery shipping to OH).
- DTC beer shipping: only ~11 states + DC allow interstate DTC (2026), each with destination-state licenses, per-customer annual volume caps, and periodic shipment reports. PA requires more than a manufacturing license to ship.
- Therefore: every inventory removal records channel + destination state + barrel volume in an **immutable ledger**; report generators (TTB BRO, PA, OH, …) are pure functions over it. DTC is schema-ready (channel enum + dest_state) but has no v1 flow.

## Stack

Next.js (App Router) + Supabase (Postgres, RLS, Auth) + Vercel. Chosen over app-layer tenancy (Neon/Drizzle) and a separate API backend: RLS gives database-enforced tenant isolation, which a compliance-grade multi-tenant ledger demands; no non-web consumers exist yet to justify a separate API.

### AI-first architecture

Every operation is implemented exactly once as a typed **command** (Zod input schema, permission check, business logic, typed result) in a command/query registry. The web UI calls commands; the AI chat calls the same commands as tools, with tool definitions generated from the command schemas — the AI capability surface is automatically complete and never drifts. Reads are typed named queries exposed the same way.

- The AI executes as the logged-in user: RLS + role checks apply identically; no separate AI permission model.
- High-stakes commands (ship order, QBO push) carry `requiresConfirmation`; chat presents intent, user confirms.
- The immutable ledger makes AI mistakes reversals, never corruption.
- Chat: Vercel AI SDK v6 via AI Gateway, tool loop over the registry, chat surface on every page with page-scoped context, per-user history.
- Voice is a future transport (STT → same loop → TTS); nothing built now, nothing changes later.
- Mandatory pattern from the first line of code: no route handlers with inline business logic.

### Engineering principles

- YAGNI by default; extension points only with named future consumers (ledger enums, command registry).
- DRY at the business-logic layer (one command per operation, ever); UI may repeat until the rule of three triggers abstraction.
- Atomic design for UI: shadcn/ui primitives → small composed components (SkuPicker, QtyInput+UoM, MovementBadge) → feature views. Reuse emerges from the design system, not premature abstraction.
- Cohesion and intuitiveness outrank reusability when they conflict.
- **Consistency beats local perfection**: solve a problem the same way everywhere, even when a locally "better" design exists — as long as user-facing behavior is right. One table pattern, one form pattern, one command pattern; a new pattern must justify replacing the old one *everywhere*, or it doesn't come in.

### Performance budget

Everything loads instantly; the app should feel like a local tool, not a website.

- Server Components by default; client JS only where interactivity demands it. No heavy client state library — server is the source of truth.
- Every list view paginated + indexed from day one; indexes are part of each migration, not an afterthought. On-hand/ATP views must be measured at realistic row counts before shipping.
- Optimistic UI on every mutation (command result reconciles); navigation prefetch on hover; no full-page spinners — skeletons only where data genuinely can't be instant, and that list should be near-empty.
- Budget: p75 page navigation < 300ms perceived, mutations reflected < 100ms (optimistic). Regressions are bugs, not backlog items.
- Fewest clicks: common tasks (record depletion, confirm order, check ATP) reachable in ≤2 interactions from anywhere — the chat surface and command palette both help here.

### Deployment modes

The same codebase and schema support two modes; the schema never differs between them:
- **SaaS**: one Supabase project, many breweries, RLS isolation, self-serve tenant provisioning.
- **Dedicated**: a customer's own Supabase project + deployment with a single `breweries` row. An instance setting (`deployment_mode`) disables tenant signup and pins the app to the one brewery; nothing else changes.

Rules: `brewery_id` + RLS everywhere in both modes; no "only one tenant" shortcuts; migrations identical; SaaS-only provisioning/billing code isolated in one module. Identical data shape makes migrating a brewery between SaaS and dedicated a row move, not a transformation.

## 1. Tenancy, auth, roles

- `breweries` is the tenant root: name, TTB registry number, PA license info, timezone, settings JSONB.
- Every table carries `brewery_id`; RLS on every table. Isolation is enforced in Postgres, never trusted to app code.
- One Supabase Auth instance, two audiences:
  - **Staff**: `brewery_users` (user_id, brewery_id, role). Slice-1 roles: `admin`, `sales`, `warehouse`. (Brewer/cellar roles arrive with slice 4.)
  - **Wholesale customers**: `customer_users` (user_id, customer_id). A customer belongs to one brewery. RLS grants them their own orders/invoices and the brewery's orderable catalog with their assigned price list only.
- JWT claims carry no tenant info; RLS derives access from membership tables, so one email can be staff at one brewery and a customer of another.
- Invitation flow for both audiences: admin invites staff by email/role; sales invites customer users tied to a customer account. Basic transactional email (invites + order confirmations) is in slice-1 scope; nothing more.

## 2. Product catalog

- `products` — the beer as a brand ("Hazy IPA"): style, ABV, TTB tax class.
- `skus` — sellable format of a product: package type (keg/can/bottle), units-per-case, `bbl_per_unit` (exact fraction, numeric — the field that makes every ledger event convertible to barrels for TTB/state excise), `qbo_item_id`.
  - Slice 5 will attach a packaging BOM (materials-per-unit) to `skus`; SKU is the anchor for it.
- `price_lists` + `price_list_items` — tiered pricing; each customer is assigned a price list. Keg deposits are a separate line-item type, not baked into SKU price.

## 3. FG inventory — movement ledger

Inventory is never a mutable quantity column; it is the sum of an append-only ledger.

`inventory_movements` (immutable — no UPDATE/DELETE grants):
- `brewery_id`, `sku_id`, `location_id`, `qty` (signed units), `bbl` (qty × sku.bbl_per_unit, stored at write time for audit stability)
- `type`: `opening_balance` (migration starting truth) | `production_in` (manual FG entry until slice 4) | `adjustment` | `sale_removal` | `taproom_transfer` | `depletion` | `return_in` | `destruction` | `loss` | `sample` | `festival_removal` — samples/donations/festival removals carry distinct TTB tax treatment and must be classifiable from day one
- `lot_id` (nullable): forward-compat reference for slice 5 lot codes — recall traceability without a ledger migration
- `channel`: `wholesale` | `taproom` | `dtc` | `export` — required on removals, null otherwise (CHECK constraint)
- `dest_state`: required on removals leaving the brewery
- `ref` (order_id etc.), `note`, `created_by`, `created_at`

Corrections are reversal entries, never edits. On-hand = view summing movements per sku/location; materialize only if it measurably slows.

`locations` — warehouse(s) + taprooms per brewery. Taproom transfer = a location move (not the taxpaid removal); the removal is recorded when beer is sold at the taproom via a `depletion` movement with `channel=taproom` — manual entry in slice 1 (weekly count / keg-blown), automated by Square ingest in slice 7. This is the TTB-correct treatment: taxpaid removal happens at sale, not at transfer.

DTC readiness: channel enum + dest_state already captured; per-customer annual volume is a query, not new schema.

## 4. Orders & invoicing

- `customers` — accounts with `type` (`distributor` | `retailer` | `brewery` | `other`; PA self-distribution means retailers/bars are direct customers), license number/class, price_list_id, `qbo_customer_id`, payment terms.
- `ship_tos` — multiple ship-to addresses per customer; each order references one, and `dest_state` on removals derives from it (load-bearing for per-state excise).
- `orders` → `order_lines` (sku, qty, unit_price snapshot at order time).
- Status: `draft → submitted → confirmed → picked → shipped → invoiced → paid`, plus `cancelled`. Portal customers create up to `submitted`; staff advance from there.
- **Pick lists**: per-order pick list (printable/phone-friendly) and a daily pick sheet grouping confirmed orders by ship date. Warehouse records actual picked qty per line — the input feeding short-ship reconciliation, so shortages are captured at pick time. Picking is allowed any time after confirm (early staging is fine — the allocation already holds the product out of ATP); if a picked order is later adjusted or cancelled, the release is reflected in a "staged, needs restocking" indicator. No barcodes, bin locations, or wave picking in v1 (route grouping arrives with slice 10).
- **Partial shipments & short-ship reconciliation**: order lines track ordered vs. shipped qty. At pick/ship, staff record actual shipped quantities; a shortage either adjusts the line down (with reason) or leaves a backordered remainder. Invoices are **per shipment** (billing shipped quantities only), not per order; an order is `shipped` when all lines are fulfilled or adjusted. Unshipped allocations release; the portal shows the adjusted order.
- Availability check at confirm is a soft warning, not a hard block (breweries deliberately oversell against planned production; slice 8 makes this smart).
- Shipping atomically writes `sale_removal` movements (channel=wholesale, dest_state from ship-to) in the same transaction as the status change — ledger and order state cannot drift.
- Invoices are generated per shipment; MGR records until pushed to QBO. Credit memos = negative-line invoice + `return_in` movements.
- **Migration/import**: CSV import for customers, ship-tos, SKUs, price lists; opening FG inventory via `opening_balance` movements. Day-one blocking for a real launch (existing Ekos-class system + live QBO).
- Taproom transfers use the same order machinery with an internal order type, producing `taproom_transfer` movements.

## 4b. Allocation & taproom demand

A reservation layer between the ledger (physical truth) and orders (demand):

- `allocations`: brewery_id, sku_id, qty, source (`order_line` | `taproom_standing`), ref (order_line_id or location_id), status (`open → fulfilled | released`), created_at.
- **Available-to-promise (ATP)** = on-hand − open allocations; shown wherever quantities are entered. Confirming an order creates its allocations; shipping fulfills them (writing ledger movements in the same transaction); cancelling releases them.
- Overallocation is allowed but loud: ATP can go negative; a shortfall view shows which orders/taprooms compete for the same beer. Priority resolution is a staff decision the system surfaces, never one it makes.
- **Taproom pars**: `taproom_pars` (location_id, sku_id, par_qty). Taproom on-hand is computed from the ledger (transfers in − depletions). A replenishment view compares on-hand vs. par → suggested transfer quantities → one click creates the internal transfer order, which allocates like any other order.
- **Standing taproom allocations** (`taproom_standing`) protect taproom supply from wholesale overselling in advance.

## 5. QBO boundary

QBO is the book of record for money; MGR for inventory/orders. Direction: invoices out, payment status back.

- OAuth2 per brewery (`qbo_connections` table; server-side token refresh). Each brewery links its own QBO company.
- Mapping via `customers.qbo_customer_id` and `skus.qbo_item_id`. Unmapped entities block the push with a clear error and a pick-from-QBO mapping UI. Never auto-create QBO customers/items in v1.
- Push on invoice creation via server job; stores `qbo_invoice_id` + sync status. Failures → `push_failed` with retry; idempotency key prevents duplicates.
- Payments back via QBO webhooks + daily reconciliation poll as backstop. Payment marks invoice/order `paid`.

## 6. Error handling & testing

- Ledger integrity at DB level: no UPDATE/DELETE grants on `inventory_movements`; CHECK constraints on type/channel/dest_state combinations; FKs everywhere.
- RLS tests are first-class CI: per table, assert tenant A cannot read/write tenant B; customer users cannot see staff data.
- vitest against local Supabase for data-layer flows (order lifecycle → movements → invoice); QBO client against recorded fixtures; one Playwright smoke for portal ordering.
- Currency in integer cents; volume math in numeric (no floats).

## Out of scope for slice 1

Raw materials, POs, recipes, batches, cellar, packaging runs, compliance report generation (ledger only feeds it), Square ingest, planning, DTC flows, auto-creating QBO entities, multi-currency.

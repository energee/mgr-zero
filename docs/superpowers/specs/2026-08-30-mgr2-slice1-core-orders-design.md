# MGR2 — Slice 1 Design: Core + Orders

Date: 2026-08-30
Status: Approved by Ted (in-chat design review)

## Product context

MGR2 is a multi-brewery SaaS for brewery operations. Full capability map (each its own spec → plan → build cycle):

| # | Slice | Contents |
|---|-------|----------|
| 1 | **Core + Orders (this spec)** | Tenancy/auth/roles, product catalog, FG inventory movement ledger, wholesale portal + internal order entry + taproom transfers, invoicing, QBO invoices-out/payments-back |
| 2 | Raw materials | Vendors, POs, receiving, lot management, materials inventory (own movement ledger mirroring slice 1's), packaging materials as first-class per-SKU materials, PO-draft-from-requirements engine |
| 3 | Recipes | Recipe dev against materials, versions, scaling, costing |
| 4 | Batches + cellar | Brew scheduling, vessels, fermentation logs (temp/pH/gravity), transfers, batch→FG conversion (replaces slice 1's manual FG entry) |
| 5 | Packaging | Packaging runs (keg/bottle/can), lot codes, yields/losses; runs declare material requirements via per-SKU packaging BOM (cans, ends, labels, trays, 4-pack holders …); pre-run checklist from requirements engine (required / on hand / incoming / short); run close records actual consumption + returns (leftover labels → `return_to_stock`, damage → `loss`). Keg SKUs declare container source: `owned_fleet` (asset move, slice 9 ledger) \| `per_fill_rental` (per-fill cost + vendor billing) \| `one_way_material` (consumed like cans) |
| 6 | Compliance reporting | TTB Brewer's Report of Operations + pluggable per-state excise (PA first, OH next) as pure functions over the movement ledger |
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
- `type`: `production_in` (manual FG entry until slice 4) | `adjustment` | `sale_removal` | `taproom_transfer` | `depletion` | `return_in` | `destruction` | `loss` | `sample` | `festival_removal` — samples/donations/festival removals carry distinct TTB tax treatment and must be classifiable from day one
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
- Availability check at confirm is a soft warning, not a hard block (breweries deliberately oversell against planned production; slice 8 makes this smart).
- Shipping atomically writes `sale_removal` movements (channel=wholesale, dest_state from ship-to) in the same transaction as the status change — ledger and order state cannot drift.
- Invoices are generated at ship, one per order; MGR records until pushed to QBO. Credit memos = negative-line invoice + `return_in` movements.
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

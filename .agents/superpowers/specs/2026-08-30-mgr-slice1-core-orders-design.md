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
| 4 | Batches + cellar | Brew scheduling, vessels (barrels count as vessels for aging programs), fermentation logs (temp/pH/gravity), transfers, batch→FG conversion (replaces slice 1's manual FG entry). A transfer to an empty vessel creates its zero-baseline occupancy in the same RPC and closes the source occupancy only when fully emptied; no vessel status is stored. Mobile-first forms tolerate flaky brewery-floor wifi |
| 5 | Packaging | Packaging runs (keg/bottle/can), lot codes, yields/losses; scheduling selects one exact open source occupancy and creates the run + planned outputs atomically, and runs declare material requirements via per-SKU packaging BOM (cans, ends, labels, trays, 4-pack holders …); pre-run checklist from requirements engine (required / on hand / incoming / short); run close revalidates that source, requires the explicit finished-goods destination, and records actual consumption + returns (leftover labels → `return_to_stock`, damage → `loss`). Keg SKUs declare container source: `owned_fleet` (asset move, slice 9 ledger) \| `per_fill_rental` (per-fill cost + vendor billing) \| `one_way_material` (consumed like cans) |
| 6 | Compliance reporting | TTB Brewer's Report of Operations + pluggable per-state excise (PA first, OH next) as pure functions over the movement ledger; CBMA reduced-rate table; COLA/formula approval tracking per product + state brand registrations per destination state |
| 7 | POS reconciliation | Square ingest, exact package-SKU + `qty_per_sale` mapping (for example 16 oz draft = 1/124 of a ½-bbl keg), taproom depletion vs. transfer reconciliation (other POS later); reconciliation stays disabled until both mapping fields validate |
| 8 | Planning | Order demand vs. planned brew/packaging schedule; feeds requirements engine ("Sept 12 packaging day short 4,000 labels, 10-day lead time — draft PO?") |
| 9 | Keg fleet | Owned-keg asset ledger: acquired/retired/shipped/returned/lost/found events, with empty/filled/at-customer balances derived from those events plus FG inventory. Packaging fill lands FG; once this slice is enabled, order ship/beer-return appends the matching owned-fleet keg events in the same RPC as the FG/money effects. Empty-asset-only returns remain explicit keg events. Per-fill rental and one-way kegs are handled in slices 2/5, not here |
| 10 | Deliveries | Self-distribution logistics: routes and a derived truck load list. `ship_order` creates the shipment/removal rows and persists explicit invoice-on-delivery intent; `confirm_delivery` marks that existing shipment delivered and atomically creates its deferred invoice. Loading has no persisted status |

### Compliance research findings (constrain the ledger design)

- Wholesale into other states: destination-state supplier registration required; most states have the distributor remit excise, but **Ohio and Wisconsin require the out-of-state brewery to register and remit excise on volume shipped in**. Per-state excise reports with per-state rules are a launch-relevant requirement (PA brewery shipping to OH).
- DTC beer shipping: only ~11 states + DC allow interstate DTC (2026), each with destination-state licenses, per-customer annual volume caps, and periodic shipment reports. PA requires more than a manufacturing license to ship.
- Therefore: every inventory removal records channel + destination state + barrel volume in an **immutable ledger**; report generators (TTB BRO, PA, OH, …) are pure functions over it. DTC is schema-ready (channel enum + dest_state) but has no v1 flow.

**SCHEMA-GATE — batch completion and cellar loss review:** do not enable
`complete_batch`, automatic completion reconciliation, or its review/re-attribution
in slices 4/6 against the current `volume_adjustments` shape.
It cannot structurally distinguish a system-created completion reconciliation from a manual loss,
and it cannot classify cellar samples, taproom pours, and destruction as the distinct TTB
removal types required by `brewing-domain.md`. Before that flow lands, the schema must define immutable,
queryable reconciliation origin and cellar-removal classifications; a registered
atomic command must compensate and reclassify the exact original amount without updating
or deleting ledger rows. `note` remains display text, never identity, idempotency, queue
membership, or correction linkage. The storage shape is deliberately unresolved here.

## Stack

Next.js (App Router) + Supabase (Postgres, RLS, Auth) + Vercel. Chosen over app-layer tenancy (Neon/Drizzle) and a separate API backend: RLS gives database-enforced tenant isolation, which a compliance-grade multi-tenant ledger demands; no non-web consumers exist yet to justify a separate API.

### AI-first architecture

Every domain operation is implemented exactly once as a typed **command** (Zod input
schema, permission check, business logic, typed result) in a command/query registry. The
web UI calls commands. AI definitions are generated from registry metadata: eligible
reads call registered queries, while eligible writes can only yield a candidate command
name + input for the proposal path below. Internal operations such as `preview_command`
are never AI-exposed. The AI surface therefore cannot become a second implementation.
Supabase Auth session primitives are the explicit non-domain exception (§1).

- The AI executes as the logged-in user: RLS + role checks apply identically; no separate AI permission model.
- Every AI write is proposal-only. The model emits a candidate command name +
  input; the internal, non-AI-exposed `preview_command` contract canonicalizes
  effects and warnings and returns a version token. Chat executes nothing until
  the user explicitly confirms with the same `requestId` + token, when the
  server revalidates and rejects stale state. There is no AI auto-commit;
  high-stakes writes such as ship and QBO push still receive the strongest
  visual treatment.
- Ledger-entry mistakes use a declared compensating command that appends a
  reversal. Compound writes use their own compensation workflow (for example,
  ship → return + credit memo); there is no generic Undo.
- Chat: Vercel AI SDK v6 via AI Gateway, tool loop over the registry, and a chat
  surface on every page with page-scoped context. Initial history is device-local;
  durable per-user history is blocked until it has an explicit schema, RLS policy,
  and registered read/write operations.
- Queued or retried writes remain disabled until `.agents/ARCHITECTURE.md`'s
  server-enforced idempotency gate is implemented; a client-held key alone is
  not retry safety.
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

Self-serve provisioning is a target capability, not a current write path. It
ships only after the command registry has a pre-tenant context; one registered
`provision_brewery` command then creates the brewery and first admin membership
through one `security invoker` Postgres function. Supabase Auth session calls
are the non-domain exception to the registry, not permission to write these
tables directly.

## 1. Tenancy, auth, roles

- `breweries` is the tenant root: name, TTB registry number, PA license info, timezone, settings JSONB.
- Every table carries `brewery_id`; RLS on every table. Isolation is enforced in Postgres, never trusted to app code.
- One Supabase Auth instance, two audiences:
  - **Staff**: `brewery_users` (user_id, brewery_id, role). Baseline roles:
    `admin`, `sales`, `warehouse`, `brewer`; brewer-facing workflows arrive
    with slice 4. These are permission bundles, not job-title enums: a taproom
    lead who records counts and a delivery driver each receive `warehouse`
    access (or `admin`), so no separate taproom/driver role is introduced.
    Driver route reads/writes additionally require
    `routes.driver_user_id = auth.uid()` unless the caller is an admin.
  - **Wholesale customers**: `customer_users` (user_id, customer_id). A customer belongs to one brewery. RLS grants them their own orders/invoices and the brewery's orderable catalog with their assigned price list only.
- JWT claims carry no tenant info; RLS derives access from membership tables, so one email can be staff at one brewery and a customer of another.
- Invitation flow for both audiences: admin invites staff by email/role; sales invites customer users tied to a customer account. Basic transactional email (invites + order confirmations) is in slice-1 scope; nothing more.
- **IMPLEMENTATION-GATE — invitations:** the current Auth-invite-then-membership
  handlers cross an external/DB boundary without durable intent or compensation.
  Do not expose their UI until staff and customer invite workflows reuse one
  durable request identity and recover or compensate an Auth success followed by
  a membership failure.

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

Corrections are new ledger entries, never edits. **SCHEMA-GATE:** the current
ledger cannot yet support a generic `reverse_inventory_movement`: most movement
types prohibit the opposite sign, there is no structured link to the original,
and a generic `adjustment` would not undo the original TTB classification. Keep
that command disabled until the schema and report generators define auditable
correction identity and category-preserving semantics; compound events continue
to use their named domain compensation. On-hand = a view summing movements per
SKU/location; materialize only if it measurably slows.

`locations` — warehouse(s) + taprooms per brewery. Taproom transfer = a location move (not the taxpaid removal); the removal is recorded when beer is sold at the taproom via a `depletion` movement with `channel=taproom` — manual entry in slice 1 (weekly count / keg-blown), automated by Square ingest in slice 7. This is the TTB-correct treatment: taxpaid removal happens at sale, not at transfer.

**SCHEMA-GATE — weekly taproom counts:** movement deltas alone do not prove that a
count happened. An exact-as-expected count writes no movement, and changed rows
cannot be grouped into one observation. Before `record_taproom_count`, its due
state, or `get_taproom_count_snapshot` ships, add a durable count occurrence with
expected/observed lines and optional linked adjustment movements. The entire
count and all nonzero depletion/adjustment effects commit through one Postgres
function; the movement ledger remains append-only.

DTC readiness: channel enum + dest_state already captured; per-customer annual volume is a query, not new schema.

## 4. Orders & invoicing

- `customers` — accounts with `type` (`distributor` | `retailer` | `brewery` | `other`; PA self-distribution means retailers/bars are direct customers), license number/class, price_list_id, `qbo_customer_id`, payment terms.
- `ship_tos` — multiple ship-to addresses per customer; each order references one, and `dest_state` on removals derives from it (load-bearing for per-state excise).
- `orders` → `order_lines` (sku, qty, unit_price snapshot at order time).
- Every order names its fulfillment source (`from_location_id`). Staff choose it
  explicitly; no client silently assumes a location named “Warehouse.”
  **SCHEMA/RLS-GATE — portal source:** before portal submit ships, define a
  customer-safe configured allowlist/default source and expose only that contract
  through registered portal reads. Repeat order must revalidate the prior source.
- Status: `draft → submitted → confirmed → picked → shipped`, plus `cancelled`. Portal customers create up to `submitted`; staff advance from there. "Invoiced" and "paid" are not order statuses — they are derived from `invoices` (`shipment_id`, `paid_at`); the order closes on ship (schema decisions: short-ship remainder cancelled, no backorder state).
- **Pick lists**: per-order pick list (printable/phone-friendly) and a daily pick sheet grouping confirmed orders by ship date. Warehouse records actual picked qty per line — the input feeding short-ship reconciliation, so shortages are captured at pick time. Picking is allowed any time after confirm (early staging is fine — the allocation already holds the product out of ATP); if a picked order is later adjusted or cancelled, the release is reflected in a "staged, needs restocking" indicator. No barcodes, bin locations, or wave picking in v1 (route grouping arrives with slice 10).
- **Short-ship reconciliation**: order lines track ordered vs. shipped qty. At
  pick/ship, staff record actual shipped quantities and a reason for any
  shortage. Shipping always cancels the remainder — there is no backorder
  state — fulfils the shipped quantity, releases the remainder's allocation,
  bills only shipped quantities, and closes the order as `shipped`. The portal
  shows the final adjusted quantities.
- Availability check at confirm is a soft warning, not a hard block (breweries deliberately oversell against planned production; slice 8 makes this smart).
- Shipping atomically creates the shipment, writes `sale_removal` movements
  (`channel=wholesale`, destination state from ship-to), fulfils/releases
  allocations, and advances the order — ledger and order state cannot drift.
- **SCHEMA-GATE — invoice timing:** ordinary versus self-delivery must be an
  explicit, persisted shipment intent chosen before `ship_order` commits. The
  current schema has no such field, so the command cannot yet safely decide
  invoice-now versus invoice-on-delivery. Do not infer it from a null carrier or
  a route that may be assigned later.
- Invoices are generated per shipment; ordinary shipping creates one in that
  transaction. Self-delivery deliberately defers it: `confirm_delivery` only marks
  an existing shipment delivered and atomically creates its invoice; it never
  ships or writes removal rows again. MGR records invoices until pushed to QBO.
  Credit memos = negative-line invoice + `return_in` movements.
- **Migration/import**: CSV import for customers, ship-tos, SKUs, price lists;
  opening FG inventory via `opening_balance` movements. Day-one blocking for a
  real launch (existing Ekos-class system + live QBO). **IMPLEMENTATION-GATE:**
  the existing importer is not yet safe to expose: dependent writes within one
  logical CSV row must move into one RPC, and every row—including an opening
  balance—must persist one stable request identity/result so reruns cannot append
  again. Independence between logical rows is the only bulk exemption.
- Taproom transfers use the same order machinery with an internal order type, producing `taproom_transfer` movements.

## 4b. Allocation & taproom demand

A reservation layer between the ledger (physical truth) and orders (demand):

- `allocations`: brewery_id, sku_id, qty, source (`order_line` | `taproom_standing`), ref (order_line_id or location_id), status (`open → fulfilled | released`), created_at.
- **Available-to-promise (ATP)** = on-hand − open allocations; shown wherever quantities are entered. Confirming an order creates its allocations; shipping fulfills them (writing ledger movements in the same transaction); cancelling releases them.
- Overallocation is allowed but loud: ATP can go negative; a shortfall view
  shows which orders/taprooms compete for the same beer. There is no stored
  priority field: staff resolve the conflict through explicit release/adjust
  commands; the system never ranks it as data.
- **Taproom pars**: `taproom_pars` (location_id, sku_id, par_qty). Taproom
  on-hand is computed from the ledger (transfers in − depletions). A
  replenishment view compares on-hand vs. par and suggests quantities. Staff
  must select/review the explicit source and destination; only then does one
  commit create the internal transfer order, which allocates like any other
  order. Multiple warehouses make an implicit “Warehouse” default unsafe.
- **Standing taproom allocations** (`taproom_standing`) protect taproom supply from wholesale overselling in advance.

## 5. QBO boundary

QBO is the book of record for money; MGR for inventory/orders. Direction: invoices out, payment status back.

- OAuth2 per brewery (`qbo_connections` table; server-side token refresh). Each
  brewery links its own QBO company through registered `connect_qbo` and
  `get_qbo_connection` operations; mapping/push stays disabled until connection
  health is valid. The sync module receives the narrow service-client exception
  described by ARCHITECTURE rule 4, never a general bypass.
- Mapping via `customers.qbo_customer_id` and `skus.qbo_item_id`. Unmapped entities block the push with a clear error and a pick-from-QBO mapping UI. Never auto-create QBO customers/items in v1.
- QBO create is blocked until the integration can durably persist the exact
  outbound payload before POST and retry that payload with the invoice's same
  request ID. The key alone is insufficient. Once that gate exists, the server
  job stores `qbo_invoice_id` + sync status; failures become `push_failed` and
  retry with the original payload and ID.
- Payments back via QBO webhooks + daily reconciliation poll as backstop. Payment sets `invoices.paid_at`; the order is not re-stated.

## 6. Error handling & testing

- Ledger integrity at DB level: no UPDATE/DELETE grants on `inventory_movements`; CHECK constraints on type/channel/dest_state combinations; FKs everywhere.
- RLS tests are first-class CI: per table, assert tenant A cannot read/write tenant B; customer users cannot see staff data.
- vitest against local Supabase for data-layer flows (order lifecycle → movements → invoice); QBO client against recorded fixtures; one Playwright smoke for portal ordering.
- Currency in integer cents; volume math in numeric (no floats).

## Out of scope for slice 1

Raw materials, POs, recipes, batches, cellar, packaging runs, compliance report generation (ledger only feeds it), Square ingest, planning, DTC flows, auto-creating QBO entities, multi-currency.

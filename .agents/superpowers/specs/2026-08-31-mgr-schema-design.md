# MGR — Baseline Schema Design (all ten slices)

Date: 2026-08-31
Status: §1–§15 approved 2026-08-31 (with `brewer` added); implemented as
`supabase/migrations/00001_baseline.sql`. Newly discovered blockers are marked
**SCHEMA-GATE** and are not implemented.
**§16 is revision 2 — designed 2026-09-02, NOT migrated.** Nothing in §16 exists
in the database. It is written here rather than as migrations deliberately: the
interface is still moving, and a schema spec is cheaper to change than a
migration chain. Sections above that §16 supersedes say so inline.
Phase-2 deltas from the reviewed draft are marked **(impl)**.
Inputs: `2026-08-31-mgr-schema-decisions.md` (decisions + conventions),
`2026-08-30-mgr-slice1-core-orders-design.md` (product), `brewing-domain.md` (units), and the
slice-1A migrations this baseline replaced (semantics that the 29 existing tests pin).

## 0. Conventions (stated once, applied to every table below)

Per-table entries only list what deviates from or adds to this section.

**Columns.** Every tenant table: `id uuid primary key default gen_random_uuid()`,
`brewery_id uuid not null references breweries(id)`, `created_at timestamptz not null
default now()`. Money `int` cents; volumes/quantities `numeric`; dates `date`; instants
`timestamptz`; US states 2-letter `text` with `check (state ~ '^[A-Z]{2}$')`.

**Composite tenant FKs.** Every tenant table gets `unique (id, brewery_id)`. Every
cross-table reference is `foreign key (x_id, brewery_id) references x (id, brewery_id)`.
Written as `→ table` below. Rows referencing a different brewery are structurally impossible.

**Ledgers (append-only).** `inventory_movements`, `material_movements`, `keg_events`,
`transfers`, `volume_adjustments`: `revoke update, delete from authenticated, anon`;
RLS `staff_read` (select) + `staff_insert` (insert, `is_staff_of(brewery_id) and
created_by = auth.uid()`). A declared compensating command corrects a ledger entry with a
reversal row; there is no generic Undo. Domain rows point *at* their ledger row
(`movement_id unique`), never the reverse, so a ledger row is never edited to attach
context. Compound writes use their domain compensation instead (shipment → return and
credit memo).

**Immutable definitions.** `recipe_versions`, `recipe_ingredients`: same revoke; a change
is a new version.

**Derived values are triggers or views.** `bbl` on FG movements, document numbers, PO
receipt status, lot requirement, allocation `ref` validity. On-hand, ATP, occupancy
volume, keg balances, deposit balances, contract balances, invoice totals, requirements —
views (`security_invoker = true`). No column exists that a human must remember to update.

**Status columns** exist only where a command owns every transition and tests cover them:
`orders.status`, `allocations.status`, `purchase_orders.status` (trigger-assisted), and
`invoices.qbo_sync_status`. No new priority, loading, or generic workflow status is stored;
urgency and every other state are timestamps (`closed_at`, `delivered_at`) or derived.

**RLS policy templates.**
- `P-staff`: `staff_all for all using (is_staff_of(brewery_id))`.
- `P-ledger`: `staff_read` select + `staff_insert` (see Ledgers).
- `P-customer`: portal customers `select` where the row's `customer_id in (select
  my_customer_ids())`.
- `P-admin`: `admin_all for all using (staff_role(brewery_id) = 'admin')`.
Default is `P-staff`. Customer-facing tables list `P-customer` explicitly.

**Document numbers.** `brewery_counters (brewery_id, key text, next bigint, pk
(brewery_id, key))` + `next_no(brewery uuid, key text) returns bigint` (security definer,
`insert … on conflict do update set next = next + 1 returning`). `before insert` triggers set
`orders.order_no`, `invoices.invoice_no`, `purchase_orders.po_no`, `batches.batch_no`,
`packaging_runs.run_no` when null. Per-brewery, gap-free within a transaction.

**Indexes.** Every FK column gets an index unless it is the leading column of the PK or of
a listed unique. Every list view has a covering index listed under `idx`.

**Extensions.** `btree_gist` (vessel occupancy exclusion).

**Helper functions carried forward unchanged:** `my_brewery_ids()`, `my_customer_ids()`,
`is_staff_of(b)`, `staff_role(b)`. **(impl)** Every function sets `search_path = ''` and
schema-qualifies its references (decisions doc, iron rule 5 follow-on).

**Units (impl, per `brewing-domain.md`):** volume bbl, temperature °F, gravity °Plato,
money cents.

## 1. Enums

| Enum | Values | Notes |
|---|---|---|
| `staff_role` | `admin, sales, warehouse, brewer` | `brewer` added at review **· `taproom` added by §16.13** |
| `customer_type` | `distributor, retailer, brewery, other` | unchanged |
| `package_type` | `keg, can, bottle` | unchanged |
| `keg_size` | `half_bbl, quarter_bbl, sixth_bbl, fifty_l, thirty_l, twenty_l` | physical set; safe as enum |
| `keg_container_source` | `owned_fleet, per_fill_rental, one_way_material` | slice 5 decision |
| `location_kind` | `warehouse, taproom` | unchanged |
| `movement_type` | `opening_balance, production_in, adjustment, sale_removal, taproom_transfer, depletion, return_in, destruction, loss, sample, festival_removal` | unchanged |
| `sale_channel` | `wholesale, taproom, dtc, export` | unchanged |
| `allocation_source` / `allocation_status` | unchanged | |
| `order_kind` | `wholesale, taproom_transfer` | |
| `order_status` | `draft, submitted, confirmed, picked, shipped, cancelled` | `invoiced`/`paid` derive from invoices (§14) |
| `invoice_kind` | `invoice, credit_memo` | |
| `invoice_line_kind` | `sku, keg_deposit, keg_deposit_refund, adjustment` | deposits are a line type, not SKU price |
| `qbo_sync_status` | `pending, pushed, push_failed` | |
| `material_category` | `malt, hop, yeast, adjunct, chemical, packaging, other` | |
| `uom` | `lb, kg, oz, g, each, l, gal, ml` | mass↔mass and vol↔vol convert by constant; each↔mass is per-material |
| `material_movement_type` | `opening_balance, receipt, consumption, return_to_stock, loss, adjustment, count_adjustment` | |
| `po_status` | `draft, sent, partially_received, received, cancelled` | |
| `ingredient_stage` | `mash, boil, whirlpool, fermentation, dry_hop, packaging, other` | |
| `vessel_kind` | `fermenter, brite, barrel, kettle, other` | |
| `volume_adjustment_reason` | `loss, dump, gain, measurement` | |
| `keg_pool_kind` | `owned, leased, pay_per_fill` | |
| `keg_event_reason` | `acquired, retired, shipped, returned, lost, found` | |
| `approval_kind` | `cola, formula` | |

## 2. Core (tenancy)

### `breweries` — unchanged
`name, ttb_registry_no, pa_license_no, timezone default 'America/New_York', settings jsonb
default '{}'`. Premises = brewery (one per). RLS: `staff_read` select `is_staff_of(id)`;
`admin_update` update `staff_role(id)='admin'`. No `unique(id, brewery_id)` (it is the root).

### `brewery_users` — unchanged
pk `(brewery_id, user_id)`, `role staff_role`. RLS unchanged (`member_read`, `admin_write`).
The current brewery-bound command context cannot bootstrap these two rows, and the listed
policies intentionally expose no client insert path. SaaS provisioning remains blocked
until a registered pre-tenant `provision_brewery` command and narrow RLS bootstrap path can
invoke one `security invoker` function for brewery + first-admin creation. No provisioning
schema is added by this document pass.

### `customers` — unchanged + composite parent key
Adds `unique (id, brewery_id)`; `price_list_id` composite FK → `price_lists` (added after
`price_lists`). `unique (brewery_id, name)`. RLS: `staff_all`, `customer_read_own`.

### `customer_users` — unchanged
### `ship_tos` — unchanged, but `customer_id` becomes composite → `customers`
`state` check 2-letter. Adds `unique (id, customer_id, brewery_id)` so orders can pin a
ship-to to its customer. idx `(customer_id)`. RLS: `staff_all`, `customer_own` select.

### `brewery_counters` — new (see §0)
RLS enabled, no policies for `authenticated` — only touched through `next_no()`
(security definer).

## 3. Catalog

### `products` — unchanged **· superseded by §16.1 (`brands`)**
`name, style, abv numeric(4,2), ttb_tax_class text default 'beer'`. unique `(brewery_id,
name)` (decisions doc lists it; the current index is non-unique — tightening is intended).

### `skus` — carried forward + keg/UPC fields **· revised by §16.2 (`format_id`)**
Existing: `product_id → products, name, package_type, units_per_case, bbl_per_unit
numeric(12,8) > 0, qbo_item_id, active`. New:
- `upc text` — barcode; unique `(brewery_id, upc)` where not null.
- `keg_size keg_size`, `container_source keg_container_source`, `keg_pool_id → keg_pools`.
- check **(impl)**: `package_type <> 'keg'` ⇒ `keg_size` and `container_source` are null; kegs
  may leave them unset until slice 5 (the slice-1A tests create bare keg SKUs).
  `container_source in ('owned_fleet','per_fill_rental')` ⇔ `keg_pool_id is not null`.
  One-way kegs need no pool: they are a `sku_bom` line.
- unique `(product_id, name)`; idx `(brewery_id, product_id)`.
RLS: `staff_all`; `customer_read` select `active and brewery_id in (customer's brewery)`.

### `price_lists` — + `unique (brewery_id, name)`
### `price_list_items` — + `srp_cents int check (>= 0)` (suggested retail, nullable) **· revised by §16.4**
pk `(price_list_id, sku_id)`, both composite. RLS: `staff_all`, `customer_own_prices`.

### `sku_bom` — new (slice 5 packaging BOM) **· superseded by §16.12 (`format_bom`)**
`sku_id → skus, material_id → materials, qty_per_unit numeric check (> 0)` (in the
material's `base_uom`, per single SKU unit). pk `(sku_id, material_id)`. idx `(material_id)`.

## 4. FG ledger

### `locations` — unchanged
### `inventory_movements` — unchanged semantics; `lot_id` becomes a real FK
All existing columns, `removal_shape` check, `bbl` trigger, revoke, indexes, and
policies carried forward verbatim. `lot_id → lots` composite FK added after `lots` exists
(nullable). `ref uuid` stays (order id / pos sale id / run id; typed context lives on the
domain row's `movement_id`).

**SCHEMA-GATE — FG correction identity:** this shape cannot implement a generic
`reverse_inventory_movement`. `removal_shape` rejects the opposite sign for most
types, and there is no structured relationship to the original row. Posting a
generic `adjustment` would restore on-hand while leaving the original TTB removal
classified. Before a named FG correction ships, define an auditable original ↔
compensation relationship, legal sign/type rules, and report-generator semantics;
prove that all correction writes append and that the corrected report cross-foots.
No generic correction command exists in the implemented baseline.

### `lots` — new (slice 5)
`packaging_run_id → packaging_runs unique not null` (1:1), `product_id → products`,
`code text`, `packaged_on date not null`, `best_by date`. unique `(brewery_id, code)`.
Recall = `inventory_movements where lot_id = …`. FK added after `packaging_runs`.

### `allocations` — unchanged columns; `ref` gains a trigger
`ref uuid` is polymorphic (`order_line_id` | `location_id`), which the existing test uses.
Rather than rename, `before insert or update` trigger `validate_allocation_ref()` asserts
the referenced `order_lines`/`locations` row exists in the same `brewery_id`. idx
`(brewery_id, sku_id) where status='open'` unchanged; add `(ref)`.

### `taproom_pars` — unchanged

**SCHEMA-GATE — taproom count observations:** the implemented baseline has no FG
count header/lines. Nonzero movement deltas alone cannot preserve a count's time,
expected values, observed values, or zero-variance completion, so weekly-due and
prior-snapshot queries are not currently implementable. Before the count UI ships,
add a durable count occurrence and per-SKU expected/observed lines with optional
links to their resulting movements. `record_taproom_count` must write the complete
observation plus every required depletion/adjustment movement in one
security-invoker function. The exact table shape remains a baseline-migration
decision; no status column or mutable inventory quantity is required.

### Views
- `on_hand`, `atp` — unchanged definitions.
- `taproom_replenishment` — taproom on-hand vs `taproom_pars`, `suggested_qty = greatest(par − on_hand, 0)`.
- `lot_on_hand` — `sum(qty)` by `(brewery_id, lot_id, sku_id, location_id)`.

## 5. Orders, shipments, invoices

### `orders`
`order_no bigint` (trigger), `kind order_kind default 'wholesale'`, `status order_status
default 'draft'`, `customer_id → customers`, `ship_to_id` (FK `(ship_to_id, customer_id,
brewery_id) → ship_tos (id, customer_id, brewery_id)` so a ship-to always belongs to the
order's customer), `from_location_id → locations not null` (where removals post),
`to_location_id → locations`, `price_list_id → price_lists` (snapshot of the list used),
`requested_ship_date date`, `po_number text`, `note text`, `created_by`, `shipped_at`.
- check: `kind='wholesale'` ⇒ `customer_id, ship_to_id not null and to_location_id is null`;
  `kind='taproom_transfer'` ⇒ `to_location_id not null and customer_id, ship_to_id null`.
- unique `(brewery_id, order_no)`. idx `(brewery_id, status, requested_ship_date)`,
  `(customer_id, created_at desc)`.
- RLS: staff lifecycle paths and customer reads remain separate. Customer writes
  happen only inside the definer `portal_create_order` / `update_draft_order` /
  `submit_order` RPCs, which assert the caller's customer membership and act
  only on that customer's wholesale order; app roles hold no table DML.

**Portal fulfillment source:** `breweries.portal_fulfillment_location_id` is a
brewery-scoped `(location_id, brewery_id)` FK. Admin-only
`set_portal_fulfillment_source` accepts only a same-brewery warehouse.
`portal_create_order` and `portal_update_draft_order` derive that source at
execution time and fail closed when it is unset or invalid; they never choose a
first warehouse. Customers need no direct read of the source location: the
definer RPC resolves it server-side.

### `order_lines`
`order_id → orders, sku_id → skus, qty_ordered numeric > 0, qty_picked numeric >= 0,
qty_shipped numeric >= 0 check (<= qty_ordered), unit_price_cents int >= 0` (snapshot),
`short_reason text`. unique `(order_id, sku_id)`. idx `(sku_id)`. RLS:
`P-customer` read via `order_id in (orders the customer may see)`; customer
line replacement happens only through the definer portal/draft RPCs on a draft
order. Remainder after ship is
always cancelled (decision): no backorder columns.

### `shipments`
`order_id → orders unique` (one shipment per order; short-ship cancels the remainder),
`shipped_at timestamptz not null default now()`, `carrier text`, `tracking text`,
`created_by`. Ship command writes `sale_removal`/`taproom_transfer` movements with
`ref = order_id`, fulfils/releases allocations, and advances the order in the same
transaction. Ordinary shipping also creates the invoice. Self-delivery defers that
invoice until `confirm_delivery`; it does not defer or repeat shipment/removal effects. Route
stops reference shipments (§13). RLS: `staff_all`; `P-customer` select via the order.

**SCHEMA-GATE — invoice timing:** the implemented shipment shape has no durable
fact that distinguishes ordinary invoice-at-ship from self-delivery
invoice-at-delivery, and route assignment happens later. Before either branch
ships, add explicit immutable-at-ship intent (for example
`invoice_on_delivery boolean not null`) and require `ship_order` to persist it.
`confirm_delivery` may create an invoice only for a shipment carrying that intent;
never infer it from `carrier`, `tracking`, or later route membership. This is a
fulfillment mode, not a workflow status.

### `invoices`
`invoice_no bigint` (trigger), `kind invoice_kind`, `customer_id → customers`,
`shipment_id → shipments unique` (null for credit memos), `issued_on date`, `due_on date`,
`qbo_invoice_id text`, `qbo_sync_status default 'pending'`, `qbo_sync_error text`,
`qbo_idempotency_key uuid not null default gen_random_uuid() unique`,
`qbo_tax_cents int`, `qbo_total_cents int`, `qbo_balance_cents int`, `paid_at timestamptz`
(all five QBO fields written only by the sync job; tax is QBO's — decision). unique
`(brewery_id, invoice_no)`. idx `(customer_id, issued_on desc)`, `(brewery_id,
qbo_sync_status) where qbo_sync_status <> 'pushed'`. RLS: `staff_all`; `P-customer` select.
`qbo_idempotency_key` is the stable external request identity, not durable intent storage.
QBO create remains blocked until its slice defines how the exact outbound payload is saved
before POST and replayed with this same key; this pass deliberately adds no storage shape.

### `invoice_lines`
`invoice_id → invoices, kind invoice_line_kind, sku_id → skus, order_line_id →
order_lines, keg_pool_id → keg_pools, keg_size, description text not null, qty numeric
not null <> 0, unit_price_cents int not null, amount_cents int generated always as
(round(qty * unit_price_cents))`.
- check: `kind='sku'` ⇒ `sku_id not null`; `kind in ('keg_deposit','keg_deposit_refund')`
  ⇒ `keg_pool_id and keg_size not null`; refunds have `qty < 0`.
- idx `(invoice_id)`, `(keg_pool_id) where keg_pool_id is not null`.

### Views
- `invoice_totals` — `subtotal_cents = sum(amount_cents)` per invoice, plus the QBO columns.
- `keg_deposit_balances` — per `(customer_id, keg_pool_id, keg_size)`: sum of deposit
  lines − refunds, in cents and in kegs.

## 6. Integrations

### `qbo_connections`
connection `id`, pk `brewery_id`, `realm_id text not null`,
`access_expires_at`, `refresh_expires_at`, `connected_by`, `updated_at`; no
credential columns. RLS: integration operators (`admin`/`sales`) may read their
brewery's non-secret metadata. `connect_qbo` owns OAuth completion/upsert through
the narrow integration-client exception; `get_qbo_connection` returns
health/realm/timestamps only. Invoice mapping/push is unavailable until that
health read is connected.

### `pos_connections`
`provider text not null default 'square' check provider='square'`, `merchant_id`,
`expires_at`, `connected_by`, `updated_at`; no credential columns. One Square
connection is allowed per `(brewery_id, provider)`. RLS: integration-operator
metadata read.

`private.integration_tokens` owns `access_token` and `refresh_token`, keyed by
`(brewery_id, provider)` and bound to the concrete public `connection_id`, with
RLS/no browser grants in an unexposed schema. Deletes always purge credentials;
guarded updates purge only when the brewery key or external identity actually
changes (QBO `id`/realm, Square `id`/provider/merchant), so no-op metadata updates
retain the current token row. Empty-search-path service-role RPCs recheck the
actor's current `admin`/`sales` membership and the exact connection in the same
token statement; the RLS-checking server boundary is their only application caller.

### `pos_locations`
`connection_id → pos_connections, external_location_id text, location_id → locations`.
pk `(connection_id, external_location_id)`.

### `pos_item_mappings` **· revised by §16.5 (variation-level)**
`connection_id → pos_connections, external_item_id text, external_item_name text, sku_id
→ skus, qty_per_sale numeric > 0` (SKU units depleted per one sold — a pint from a
half-bbl keg is `1/124`). pk `(connection_id, external_item_id)`. Unmapped = no row.

### `pos_sales`
`connection_id → pos_connections, external_order_id text, external_line_id text,
external_item_id text, external_location_id text, sold_at timestamptz, qty numeric,
gross_cents int, ingested_at default now(), movement_id → inventory_movements unique`
(the `depletion` this line posted; null = not yet reconciled/unmapped). unique
`(connection_id, external_line_id)` (idempotent ingest). idx `(brewery_id, sold_at)`,
`(brewery_id) where movement_id is null`. Rows are raw facts from Square: revoke `update`
except `movement_id` (column-level grant), revoke `delete`.
`sync_square_sales` inserts each fetched page through one security-invoker batch
function and relies on the unique external line ID for row dedupe. The current schema
stores no sync cursor, so neither the command nor UI may claim cursor durability.

### View `pos_unmapped_items` — distinct `(connection_id, external_item_id, external_item_name)` in `pos_sales` without a mapping.

## 7. Materials and purchasing

### `vendors`
`name text, contact_name, email, phone, address text, payment_terms text default 'net30',
qbo_vendor_id text, active bool default true`. unique `(brewery_id, name)`.

### `materials`
`name, category material_category, base_uom uom, purchase_uom uom, purchase_uom_factor
numeric > 0 default 1` (base units per purchase unit: a 50 lb bag = `each`→`lb`, 50),
`lot_tracked bool default false`, `default_vendor_id → vendors`, `lead_time_days int`,
`reorder_point numeric` (base uom), `active bool`. unique `(brewery_id, name)`.

### `material_lots`
`material_id → materials, lot_code text, vendor_id → vendors, received_on date, best_by
date`. unique `(material_id, lot_code)`; `unique (id, material_id, brewery_id)` so a
movement's lot must belong to its material.

### `material_movements` — ledger
`material_id, lot_id, qty numeric <> 0` (base uom, signed), `type
material_movement_type, unit_cost_cents int` (receipts only), `note, created_by`.
- FK `(material_id, brewery_id) → materials`; FK `(lot_id, material_id, brewery_id) →
  material_lots (id, material_id, brewery_id)`.
- Lot rule (decision): `before insert` trigger `enforce_material_lot()` — if
  `materials.lot_tracked` then `lot_id` must be not null for every type except
  `opening_balance`; if not `lot_tracked` then `lot_id` must be null. Receipts on tracked
  materials name the lot they create (`receipt_lines` creates the lot first, same
  transaction). Tested by writing to the live DB.
- Sign check by type: `receipt, opening_balance, return_to_stock ⇒ qty > 0`;
  `consumption, loss ⇒ qty < 0`; `adjustment, count_adjustment` either.
- idx `(brewery_id, material_id)`, `(brewery_id, material_id, lot_id) where lot_id is not
  null`, `(brewery_id, created_at)`.

### `material_contracts`
`vendor_id → vendors, material_id → materials, contract_no text, qty_committed numeric
> 0` (purchase uom), `unit_cost_cents int, starts_on date, ends_on date`. idx
`(material_id)`.

### `purchase_orders`
`po_no bigint` (trigger), `vendor_id → vendors, status po_status default 'draft',
ordered_on date, expected_on date, note, created_by`. unique `(brewery_id, po_no)`. idx
`(brewery_id, status, expected_on)`. `received`/`partially_received` are set by the
`receipt_lines` trigger (compare `sum(qty_counted)` to `qty_ordered` per line);
`draft/sent/cancelled` by commands.

### `purchase_order_lines`
`po_id → purchase_orders, material_id → materials, qty_ordered numeric > 0` (purchase
uom), `unit_cost_cents int, contract_id → material_contracts` (drawdown). idx `(po_id)`,
`(material_id)`, `(contract_id)`.

### `receipts`
`po_id → purchase_orders, received_on date, received_by, note`. idx `(po_id)`.

### `receipt_lines`
`receipt_id → receipts, po_line_id → purchase_order_lines, qty_expected numeric >= 0,
qty_counted numeric >= 0, variance numeric generated (qty_counted − qty_expected),
lot_id → material_lots, movement_id → material_movements unique`. Only counted qty
posts: the receive command inserts the movement with `qty = qty_counted *
purchase_uom_factor` and links it; `after insert` trigger updates PO status. Discrepancy
view = `variance <> 0`. idx `(po_line_id)`.

### `material_counts` / `material_count_lines`
Counts: `counted_on date, counted_by, note`. Lines: `count_id, material_id, lot_id
(composite as above), qty_expected numeric` (snapshot at count), `qty_counted numeric >=
0, movement_id → material_movements unique` (the `count_adjustment`, null when no
variance). idx `(count_id)`, `(material_id)`.

### Views
- `material_on_hand` — `sum(qty)` by `(brewery_id, material_id)`; `material_lot_on_hand`
  by lot (FIFO assist: order by `received_on`).
- `material_on_order` — open PO lines: `qty_ordered * factor − received` per material.
- `material_last_cost` — latest receipt `unit_cost_cents` per material.
- `contract_balances` — committed − ordered against the contract.
- `material_requirements` — union of planned batch needs (recipe × `planned_bbl`, for
  batches with `brewed_on is null`) and planned packaging needs (`packaging_run_outputs.
  qty_planned × sku_bom`, for runs with `closed_at is null`); `short = required − on_hand
  − on_order`.

## 8. Recipes

### `recipes`
`product_id → products` (nullable — dev before a product exists), `name text`, `note`.
unique `(brewery_id, name)`.

### `recipe_versions` — immutable
`recipe_id → recipes, version int, target_og_plato numeric(5,2), target_fg_plato numeric(5,2),
target_abv numeric(4,2), target_ibu numeric(5,1), boil_minutes int, note text,
created_by`. unique `(recipe_id, version)`. Revoke update/delete.

### `recipe_ingredients` — immutable
`recipe_version_id → recipe_versions, material_id → materials, per_bbl_qty numeric > 0`
(base uom per bbl; scaled at brew time), `stage ingredient_stage, timing_minutes int,
sort int`. idx `(recipe_version_id)`, `(material_id)`. Revoke update/delete.

### View `recipe_version_costs` — `sum(per_bbl_qty × material_last_cost)` per bbl.

## 9. Production (batches + cellar)

### `vessels`
`name, kind vessel_kind, capacity_bbl numeric > 0, active bool`. **No status column**
(decision). unique `(brewery_id, name)`.

### `batches`
`batch_no bigint` (trigger), `product_id → products, recipe_version_id →
recipe_versions, planned_on date not null, planned_bbl numeric > 0, brewed_on date,
closed_at timestamptz, note, created_by`. State is derived: planned (`brewed_on null`),
active (open occupancy), closed. unique `(brewery_id, batch_no)`. idx `(brewery_id,
planned_on)`, `(product_id)`.

### `vessel_occupancies`
`vessel_id → vessels, batch_id → batches, started_at timestamptz not null, ended_at
timestamptz, initial_bbl numeric >= 0` (wort/beer put in directly; 0 when filled by
transfer). Exclusion: `exclude using gist (vessel_id with =, tstzrange(started_at,
ended_at) with &&)` — one open occupancy per vessel; blends are transfers *into* an
occupancy, so the trail is in `transfers`. idx `(batch_id)`, `(brewery_id) where ended_at
is null`.

### `transfers` — ledger
`from_occupancy_id → vessel_occupancies, to_occupancy_id → vessel_occupancies, bbl
numeric > 0, loss_bbl numeric >= 0 default 0, at timestamptz, note, created_by`. check
`from <> to`. The transfer's contemporaneous loss is represented once in `loss_bbl`; the
command must not also insert a `volume_adjustments` loss row. A transfer to an empty
vessel first creates its target occupancy with `initial_bbl = 0` in the same function;
after appending the transfer, that function sets the source occupancy's `ended_at` only
when its derived remainder is zero. A transfer into an existing compatible occupancy
reuses it. These dependent rows are one RPC; no vessel status column or ledger mutation
is involved. idx on both occupancy columns.

### `volume_adjustments` — ledger
`occupancy_id → vessel_occupancies, bbl numeric <> 0, reason volume_adjustment_reason,
at, note, created_by`. Cellar losses/dumps feed TTB.

**SCHEMA-GATE — batch completion, reconciliation, and re-attribution:** this current
shape is not sufficient for the planned `complete_batch` or loss-review flow.
`reason='loss'` plus free-text `note` cannot
reliably distinguish a system-created Completion Reconciliation from an ordinary manual
loss, and `volume_adjustment_reason` cannot express cellar sample, taproom-pour, and
destruction removals as distinct TTB classifications. Before slice 4 writes automatic
reconciliation rows or slice 6 offers review/re-attribution, the schema must provide:

- immutable, queryable system origin for a reconciliation row (not `note`);
- the required distinct cellar-removal classifications; and
- an auditable link to the exact original row plus one registered atomic compensating
  command that reverses/reclassifies the selected amount with new rows.

Once resolved, `complete_batch` owns `batches.closed_at`, closes the appropriate
remaining occupancy state, and appends any threshold-qualified completion
reconciliation in one function after verifying no packaging run remains open.

No update/delete of `volume_adjustments` is permitted. This pass intentionally does not
choose a new column or table; the database design, migration, TTB projection, and
real-Postgres proofs are a blocking follow-up.

### `fermentation_readings`
`occupancy_id, at timestamptz, temp_f numeric(5,1), ph numeric(4,2), gravity_plato
numeric(5,2), note, created_by`. Manual entry only (decision). idx `(occupancy_id, at)`.
Mutable (typo fixes), staff only.

### `batch_additions`
`batch_id → batches, occupancy_id → vessel_occupancies, recipe_ingredient_id →
recipe_ingredients, stage ingredient_stage, at timestamptz, movement_id →
material_movements unique not null`. Trigger asserts the movement `type =
'consumption'`. idx `(batch_id)`.

### View `occupancy_volumes`
`initial_bbl + transfers_in − transfers_out − transfer losses + adjustments − bbl_drawn
by closed packaging runs` per occupancy; `vessel_contents` joins open occupancies to
vessels (this replaces a vessel status column).

## 10. Packaging

### `packaging_runs`
`run_no bigint` (trigger), `occupancy_id → vessel_occupancies not null` (exactly one —
decision), `planned_on date not null, started_at, closed_at, bbl_drawn numeric >= 0`
(recorded at close), `note, created_by`. State derived from timestamps. unique
`(brewery_id, run_no)`. idx `(brewery_id, planned_on)`, `(occupancy_id)`. Close command,
in one transaction: sets `closed_at, bbl_drawn`; inserts the `lots` row; inserts
`production_in` movements per output (with `lot_id`); inserts consumption/return/loss
material movements. Owned-keg fills are FG inventory, not keg events (§12).
`schedule_packaging_run` creates the run plus all planned output rows in one
function; the client never inserts the parent and planned outputs separately.

### `packaging_run_outputs`
`run_id → packaging_runs, sku_id → skus, qty_planned numeric >= 0, qty_actual numeric
>= 0, movement_id → inventory_movements unique`. unique `(run_id, sku_id)`. Yield view
below.

### `packaging_run_consumptions`
`run_id → packaging_runs, movement_id → material_movements unique not null`. The
movement's `type` says consumed / `return_to_stock` / `loss`. idx `(run_id)`.

### Views
- `packaging_run_requirements` — per open run × `sku_bom`: `required, on_hand, on_order,
  short`. The pre-run checklist.
- `packaging_run_yields` — `bbl_packaged = sum(qty_actual × bbl_per_unit)`, `loss_bbl =
  bbl_drawn − bbl_packaged`.

## 11. Compliance

### `product_approvals`
`product_id → products, kind approval_kind, ttb_id text not null, approved_on date,
expires_on date, note`. unique `(product_id, kind, ttb_id)`.

### `state_registrations`
`product_id → products, state, registration_no text, approved_on, expires_on`. unique
`(product_id, state)`.

### `brewery_state_licenses`
`state, kind text not null` ('supplier', 'dtc', …), `license_no text, expires_on, note`.
unique `(brewery_id, state, kind)`. Destination-state supplier registrations (OH, WI …).

### `report_filings`
`jurisdiction text not null` (`'TTB'`, `'US-PA'`, `'US-OH'` — check `^[A-Z-]+$`),
`period_start date, period_end date, figures jsonb not null, filed_at timestamptz,
filed_by, note`. unique `(brewery_id, jurisdiction, period_start, period_end)`. The
ledger stays recomputable; this is the snapshot that was actually filed (decision).
Report generators are code, not schema; CBMA rates are code (§14).

## 12. Kegs (owned / leased / pay-per-fill fleets)

### `keg_pools`
`name, kind keg_pool_kind, vendor_id → vendors, per_fill_cents int, deposit_cents int
not null default 0, contract_note text, active bool`. check: `kind = 'owned'` ⇔
`vendor_id is null`; `kind = 'pay_per_fill'` ⇒ `per_fill_cents not null`. unique
`(brewery_id, name)`.

### `keg_events` — ledger (counts, not serials)
`pool_id → keg_pools, keg_size keg_size, qty int > 0, reason keg_event_reason,
customer_id → customers, shipment_id → shipments, at timestamptz, note, created_by`.
- check: `shipped, returned ⇒ customer_id not null`; `acquired, retired ⇒ customer_id
  null`; `lost, found` either (lost at a customer vs. at the brewery).
- idx `(brewery_id, pool_id, keg_size)`, `(customer_id) where customer_id is not null`,
  `(shipment_id)`.
Fill = FG `production_in` of a keg SKU; empty-at-brewery is derived, never stored:
`fleet_total − at_customers − filled_on_hand`.
When an order ships or returned beer includes an `owned_fleet` keg SKU, the owning
`ship_order`/`return_shipment` RPC also appends the matching keg event linked to the
shipment. A separate client command may not post the container effect later; the FG and
asset ledgers must not drift. Empty-asset-only return/lost/found remains
`record_keg_event`.

### Views
- `keg_fleet_totals` — per `(pool, size)`: `acquired − retired − lost + found`.
- `keg_customer_balances` — per `(customer, pool, size)`: `shipped − returned − lost@customer`.
- `keg_loss_rates` — lost / shipped per pool over trailing 12 months.

## 13. Deliveries (self-distribution)

### `routes`
`name text, delivery_date date not null, driver_user_id uuid references auth.users,
vehicle text, departed_at, returned_at, note`. idx `(brewery_id, delivery_date)`.

### `deliveries`
`route_id → routes, shipment_id → shipments unique, stop_no int, delivered_at
timestamptz, signed_by text, note`. unique `(route_id, stop_no)`. Truck load is derived
from the route's shipments' order lines (`route_loads`); load checkmarks are transient UI,
with no persisted loaded, priority, or delivery status. `confirm_delivery` sets `delivered_at`
and `signed_by` and creates the invoice in one function. It references the shipment that
the earlier ship command already created and never ships, changes the order, or writes
removal rows again. It must also reject a shipment that lacks the persisted
invoice-on-delivery intent from §5. RLS: `staff_all`; `P-customer` select via the
shipment's order.

## 14. Open choices (decisions doc silent; conservative option taken)

1. ~~`staff_role` stays `admin, sales, warehouse`~~ — resolved: `brewer` added.
2. **`order_status`** stops at `shipped`; "invoiced"/"paid" are read from `invoices`
   (`shipment_id`, `paid_at`) — resolved 2026-08-31: product spec updated to match.
3. **Keg deposits** are `invoice_lines` (`keg_deposit` / `keg_deposit_refund`) with
   `keg_pool_id + keg_size`, not order lines; balance is a view. Alternative was a
   `keg_deposits` ledger.
4. **QBO/Square tokens** live only in unexposed `private.integration_tokens`, keyed
   by brewery/provider and bound to a concrete connection identity. Deletes and
   actual identity/tenant-key changes purge credentials; no-op metadata updates
   retain them. Public connection tables retain non-secret metadata for
   `admin`/`sales`; service-only RPCs recheck current membership and connection
   identity, and are reachable only through the RLS-checking server token boundary.
   Future sync modules use that boundary and never receive a service-client eslint
   allowlist.
5. **Payments** have no table; `invoices.paid_at / qbo_balance_cents` from QBO is enough
   while QBO is the book of record.
6. **Materials have no locations**; one store per brewery. `material_movements` gains a
   `location_id` later if multi-site materials appear.
7. **`transfers` and `volume_adjustments` are append-only** like the named ledgers —
   they are volume ledgers in all but name.
8. **One open occupancy per vessel** (exclusion constraint); blending is a transfer into
   the surviving occupancy, so a batch's lineage is the `transfers` chain.
9. **Planning / slice 8** adds no tables: demand = open orders + pars; supply =
   `batches.planned_on` + `packaging_runs.planned_on`; shortfalls are views.
10. **CBMA rate table and report generators** are code, not tables.
11. **`allocations.ref`** stays polymorphic (existing test inserts it) and is validated
    by trigger instead of being split into two FK columns.
12. **`pos_sales`** is treated as a ledger of external facts: no delete, `update` only
    on `movement_id`.
13. **Portal write policies** on `orders`/`order_lines` are limited to `draft`/`submitted`
    wholesale orders; staff advance everything else.
14. **`uom` is an enum** with conversion by constant inside a family; cross-family
    (`each`↔`lb`) is `materials.purchase_uom_factor`. No conversion table.

## 15. Table count

Core 6 · Catalog 5 · FG 5 · Orders 5 · Integrations 5 · Materials 11 · Recipes 3 ·
Production 7 · Packaging 3 · Compliance 4 · Kegs 2 · Deliveries 2 = **58 tables**,
~18 views, 5 append-only ledgers, 2 immutable definition tables.

## 16. Revision 2 — brands, formats, bins, channels (designed 2026-09-02, not migrated)

**Nothing in this section exists in the database.** It is deliberately held as a
spec rather than a migration chain: the interface is still being drawn (see
`2026-08-31-mgr-wireframes.html`, vocabulary note at the top of that file), and
every table below would otherwise be migrated two or three times before the
first screen ships. Build it in one pass when the interface settles.

Conventions of §0 apply unchanged: composite `(id, brewery_id)` parents, RLS on
every table, `security_invoker` views, pinned `search_path`.

### 16.1 `products` → `brands`

A **brand** is the sellable identity — "Lupula", "Waves". A **batch** is a
production instance — "Lupula 3". They were conflated because a batch usually
becomes one brand, but a blend of two batches may ship as a third brand, and a
batch's identity is not knowable at brew time.

Rename `products` → `brands` and every `product_id` → `brand_id` (`skus`,
`lots`, recipes, compliance). No column semantics change for those. Do it as a
rename, not an alias — two names for one table is how drift starts.

**`batches` is the one exception.** Its column becomes `intended_brand_id` and
loses `NOT NULL`, because the semantics genuinely change — see §16.9.

`brand` is preferred over `product` because TTB label approval is granted
against a brand, it is what gets renamed when batches blend, and it does not
collide with `sku` in conversation. `label` was rejected: it collides with
packaging materials (`material_category = 'packaging'`).

### 16.2 `formats` — new

The sellable shape: glass, four-pack, case, sixtel, half. Today these facts are
restated on every SKU row (`package_type`, `keg_size`, `units_per_case`,
`bbl_per_unit`), so 20 brands × 5 formats is 100 rows each re-typing
`bbl_per_unit` — which §0 calls the basis of all TTB math. One typo is one
brand's excise numbers wrong.

```
formats (
  id, brewery_id, name,
  basis format_basis not null,              -- 'packaged' | 'poured'
  package_type package_type,                -- container; null for poured
  keg_size keg_size,
  units_per_case int,
  bbl_per_unit numeric(12,8),               -- packaged: absolute size
  draws_from_format_id uuid,                -- poured: the packaged format it comes out of
  qty_per_serving numeric(12,6),            -- poured: fraction of one packaged unit
  check ((basis = 'packaged') = (bbl_per_unit is not null)),
  check ((basis = 'poured')   = (draws_from_format_id is not null and qty_per_serving is not null))
)
```

- **packaged** — its own inventory unit. What `packaging_runs` output, what a
  bin holds, what a SKU is.
- **poured** — never held. A glass is not stock; it is a ratio back to the keg
  it is drawn from. This is exactly what a Square *variation* is, which is why
  `skus.square_item_id` alone cannot map a sale (see §16.5).

New enum: `format_basis as enum ('packaged','poured')`.

`skus` gains `format_id` and stops carrying its own `bbl_per_unit`; the trigger
`enforce_bbl_integrity()` reads it through the format. **Safe for history** —
`inventory_movements.bbl` is frozen at write time, so correcting a format later
cannot move past movements.

### 16.2a `format_components` — composition (decided 2026-09-02)

Formats compose. A four-pack is four cans plus a PakTech; a 16oz case is six
four-packs plus a case tray. And a 16oz pour is 1/124 of a half bbl — **the same
relation with a fractional quantity**, so `draws_from_format_id` and
`qty_per_serving` retire into one table and `basis` shrinks to meaning only
"does this hold stock".

```
format_components (parent_format_id, child_format_id, qty numeric(12,6))
format_bom        (format_id, material_id, qty_per_unit,
                   on_break format_material_disposition not null)
```

New enum: `format_material_disposition as enum ('consumed','return_to_stock')`.

**`bbl_per_unit` is strictly derived.** Only *atomic* formats — a 16oz can, a
half bbl keg — carry a typed volume; anything composed computes it from its
children. This removes a whole class of typo from the number the design doc
calls the basis of all TTB math, and it is stronger than merely moving
`bbl_per_unit` off the SKU (§16.2). A composed format cannot be created before
its children exist, which is the intended constraint.

**Repack (§16.10) becomes validated rather than asserted.** Composition already
knows that breaking one case yields exactly six four-packs, so the app offers
the repack instead of asking someone to enter both halves and hoping they
balance. **One level only** — case → four-packs, never case → cans in a step.
That keeps material accounting honest: breaking a case releases the case tray
and nothing else, because PakTechs are only released when a four-pack is broken.

**Materials on break.** Each BOM line carries `on_break`, so a PakTech defaults
to `consumed` and a case tray to `return_to_stock`; the repack sheet shows the
default and allows a per-repack override. A question asked once, not every time
— a brewery breaking twenty cases a week would click through a mandatory prompt
without reading it. `material_movement_type` already has both `consumption` and
`return_to_stock`, so no enum change is needed. The whole repack is one RPC
sharing one `ref`, so beer and materials cannot disagree.

**Build-direction repack is out of scope** — assembling four-packs from loose
cans in inventory is YAGNI; packaging runs already produce composed formats with
their own BOM. Partial material recovery (a tray damaged on break) is likewise
left out; the cycle count handles it.

**OPEN:** is a format fully sized (`case · 24×16oz`) or shape-only (`case`)?
Fully sized keeps `bbl_per_unit` on the format and is the assumption above; it
means more format rows and no "case" abstraction above them.

### 16.3 `sale_channels` — see `docs/plans/sale-channels-customizable.md` (#42, merged)

**Superseded by #42, which is merged and is the authority.** This section
originally proposed `sale_channels (… is_removal, ttb_category)`, moving removal
classification from the `removal_shape` CHECK onto the channel row. That was
wrong and #42 is right: `brewing-domain.md` classifies removals by *type* —
"samples, donations, festival pours, destructions and losses are distinct
removal types with distinct tax treatment; classify at the ledger" — so channel
columns would have duplicated what `movement_type` already carries, and
duplicated classification is how two sources drift apart. #42 had already
rejected a `requires_dest_state` column for the same underlying reason.

Take #42's shape as given: brewery-scoped table modelled on `locations`, the
`channel = 'taproom'` literal dropped from the depletion CHECK,
`on delete restrict` so "removable only if unused" is enforced by Postgres, and
a trigger on `breweries` insert seeding the four defaults.

Two things #42 leaves to slice 7, which belong here:

**POS channel assignment.** `pos_locations.sale_channel_id` with an optional
per-item override, per #42's own table of where a movement gets its channel.

**Tax treatment (decided 2026-09-02).** With four fixed channels, `export`
implicitly meant an untaxpaid removal. Once a brewery names its own channels,
nothing distinguishes an export channel from a taxpaid one — `movement_type` is
`sale_removal` for both. So the channel carries a **default tax treatment**
(`taxable`), and a customer may override or inherit it:

```
sale_channels + tax_treatment      not null default 'taxable'
customers     + tax_treatment      null = inherit from the channel
inventory_movements + tax_treatment  resolved and frozen at write time
```

**The resolved value is stored on the movement, never looked up at report
time.** `brewing-domain.md` requires that a filed month is never rewritten by a
later change; a live lookup would mean editing a customer in March silently
restates January's excise. This is the same discipline the schema already
applies to `bbl`, frozen by trigger on insert. Resolution order is customer
override → channel default; a movement with no customer (a taproom depletion)
takes the channel default.

**Value set (decided 2026-09-02): the full TTB vocabulary** of removals without
payment of tax — `taxable`, `export`, `vessel_supplies`, `research`,
`transfer_in_bond` — rather than starting with `export` alone.

### 16.4 Price tiers scoped to a channel; formats priced

`price_lists` are already tiers and `customers.price_list_id` already assigns
them. Two gaps: a tier has no channel, and `price_list_items` is keyed
`(price_list_id, sku_id)` so a taproom pour — which is not a SKU — cannot be
priced at all.

```
price_lists    + channel_id
price_list_formats (price_list_id, format_id, unit_price_cents)     -- tier default
price_list_items   (price_list_id, sku_id,  unit_price_cents, srp_cents)  -- brand × format override
```

Format-level price with a per-SKU override collapses most data entry — "all
halves are $185, except the barrel-aged one" — and matches how a wholesale sheet
reads.

**OPEN:** whether format-level pricing is the default and SKU the override, or
the reverse.

### 16.5 `pos_item_mappings` — variation level

`pos_item_mappings (connection_id, external_item_id) → sku_id + qty_per_sale`
maps an *item*. A live Square library shows items carry no price and no
quantity; **variations** do. A pint and a crowler off one keg are two variations
of one item, so the current key collapses them into one depletion number.

Add `external_variation_id` to the key and let `qty_per_sale` derive from the
poured format rather than being hand-entered.

### 16.6 `bins` — new, one per location minimum (decided 2026-09-02)

**Every location gets a default bin**, created with it and named for it. `bin_id`
is therefore `NOT NULL` everywhere it appears — movements, pars, menus — and
there is no nullable branch anywhere downstream. A brewery that never subdivides
sees one bin it can ignore; one that does adds bins beside the default.

This supersedes the earlier "nullable, required once a location has bins"
proposal. That version was correct but bought a permanent "or null" in every
on-hand, availability and par query to avoid one setup artifact. Trading a bin
nobody asked for against deleting a class of null-handling is worth it.

`taproom_pars` re-keys on bin for the same reason: "keep 4 cases in the to-go
fridge" becomes expressible, and a brewery that does not care sets it on the
default bin.

Physical subdivisions of a location: cooler, walk-in, to-go fridge. Menus read
them, so availability is derived from stock rather than hand-flipped.

```
bins (id, brewery_id, location_id, name, kind)
inventory_movements + bin_id not null
```

**Not tap lines.** Tap assignment is hand-maintained state that nothing
downstream validates and that a bartender changes for optics; modelling it as a
bin would create twelve setup rows per bar and a foreign key that silently goes
stale. See §16.8.

### 16.7 `pos_menus` — new

A menu is a binding, not a price list: `bin × location × channel × destination`.
Its lines are the formats available from what is physically in that bin, priced
through the channel's tier. The menu authors nothing.

```
pos_menus (id, brewery_id, connection_id, location_id, bin_id, channel_id, price_list_id)
```

**Destinations are plural.** Square is one; QuickBooks is another; the brewery's
own website is a third. Building a bespoke web feed instead would produce three
different answers to "what are we selling right now". A published menu is also
the ownership boundary: MGR's catalog holds test batches and unannounced beer,
so a public site must consume a menu, never the catalog.

### 16.8 `keg_taps` — new, optional

Two events bracketing an interval. **Neither posts a movement** — tapping opens
an interval, kicking closes it, and nothing reaches the ledger either way
(§16.15). Depletion comes from the physical count.

```
keg_taps (
  id, brewery_id, sku_id, lot_id, bin_id,
  opened_at, closed_at, close_reason,        -- 'blown' | 'dumped' | 'returned'
  open_fill  numeric(3,2) default 1.00,      -- coarse: 1, .75, .5, .25, heel
  close_fill numeric(3,2) default 0.00,
  tap_label text                             -- free text, unvalidated, never an FK
)
```

Yield = poured bbl ÷ (`nominal_bbl` × (`open_fill` − `close_fill`)). A half bbl
is 124 × 16oz on paper and 112–120 in life; a keg reading 95 has a problem.

**Fill levels are estimates for a report, never ledger quantities.** They must
never reach `inventory_movements`, because `bbl` feeds excise math and a rough
eyeball has no business in a federal filing. A yield derived from a non-default
fill renders as *estimated*.

**Why fractions live here and not in the ledger:** `inventory_movements.qty` is
`numeric(12,2)`. A 16oz pour of a half bbl is 1/124 = 0.008065, which rounds to
0.01 — post one movement per pint and 124 pints deplete **1.24 kegs**, a 24%
over-depletion that propagates into `bbl` via the trigger. Keeping pours out of
the ledger entirely keeps it exact; `qty_per_serving` is `numeric(12,6)` and
sums without rounding in a view. §16.15 settles this by making the count the only
thing that posts — the rounding hazard is why fill fractions and serving sizes
must never become ledger quantities, which still holds.

Attribution when two kegs of one SKU are open: split proportionally, and label
the number as split. `tap_label` does not improve attribution — Square has no
concept of a line — it enables *diagnosis*, by grouping yields across many kegs
to find a bad line.

### 16.9 `batches.product_id` → `intended_brand_id`, nullable

Identity is optional at brew and required at packaging. The gate already exists:
`lots.brand_id` is `NOT NULL`, so packaging cannot produce a finished good
without an identity. `batches.product_id NOT NULL` was enforcing nothing the lot
did not already enforce — it only forced the decision earlier than the business
makes it.

Referenced by exactly one index and no function, view or TypeScript. Keep it as
*intent* rather than dropping it: planning wants "this is meant to be Lupula",
and the gap between intent and outcome becomes queryable.

Batches then need their own `code`, because "Lupula 3" is today derived from the
brand and that derivation breaks the moment a batch ships as something else.

### 16.10 `repack` — new movement type

Breaking bulk is a real conversion: a sealed case and six loose four-packs are
different things to a picker. `adjustment` cannot express it — it has no way to
pair the two halves, so a break reads as an unexplained loss and an unexplained
gain.

A repack is a paired, **bbl-conserving** movement: `−1 case`, `+6 four-packs`,
same location and bin, sharing a `ref`. TTB never sees a repack; nothing left
the brewery.

**Conservation is by construction, not by coincidence.** Rounding each leg
independently does not cancel: a 24×16oz case is 3/31 bbl → `0.09677419` at
`numeric(12,8)`, a four-pack is 1/62 → `0.01612903`, and −1×case + 6×four-pack
leaves `−0.00000001`. So the outbound leg's `bbl` is derived from the inbound
leg's frozen total — §16.2a composition already gives the ratio — rather than
recomputed from `bbl_per_unit`. The constraint then carries a tolerance,
`abs(sum(bbl)) < 0.000001` over a `ref`, to catch a hand-entered repack without
rejecting a legitimate one.

Breakage stays named: `−1 case, +5 four-packs, +1 loss`, so the repack invariant
stays absolute.

**Superseded in part by §16.2a:** composition now derives the other side of a
repack, so this is validated rather than asserted, and it is one level only.
Materials released or consumed on a break follow each BOM line's `on_break`.

Line cleaning likewise wants a named `loss` reason, or it lands in yield
variance and makes every keg look slightly bad.

### 16.11 Invoice drift — `qbo_sync_token`, `qbo_remote_state`

QuickBooks has no read-only invoice. Once pushed, an accountant can edit, void
or delete it and no API setting prevents that, so MGR detects rather than
prevents. `SyncToken` increments on every modification and already rides the
response the sync job reads for balance — drift costs one column and no extra
call.

```
invoices + qbo_sync_token text
         + qbo_remote_state  ('live' | 'voided' | 'deleted')  default 'live'
```

**A voided invoice is not a paid invoice.** Voiding zeroes the amounts, so any
logic inferring paid from `qbo_balance_cents = 0` books cancelled revenue as
collected.

**The guarantee lives on the read side, not in a CHECK (decided 2026-09-02).** An
earlier draft proposed `check (paid_at is null or qbo_remote_state = 'live')`.
That constraint prevents the very drift it exists to detect: push → paid → an
accountant voids it in QuickBooks, and the sync job's `set qbo_remote_state =
'voided'` now violates the check unless it first nulls `paid_at` — exactly the
rule the constraint claimed to abolish, and a contradiction of
`2026-08-31-mgr-schema-decisions.md`'s *detect drift, do not prevent it*.
Paid-then-voided is real history and must stay representable. Instead, nothing
infers paid from balance: collected revenue reads
`qbo_remote_state = 'live' and qbo_balance_cents = 0`, expressed once in the
reporting view so no call site can forget it.

A failing test is drafted at `tests/invoice-remote-state.test.ts`; it lands with
§16.11's implementation, since it cannot go green before these columns exist.

Also rename `qbo_idempotency_key` in spirit: Intuit's mechanism is a `requestid`
query parameter, not a body field. The column name is MGR-side and may stay, but
the docs should stop calling it an idempotency key.

### 16.12 `sku_bom` → `format_bom` (decided 2026-09-02)

**The packaging BOM belongs to the format, not the SKU.** A case box, a divider,
a can end and a keg cap are properties of the shape, identical across every
brand packaged in it. Keying the BOM per SKU means re-entering the same bill for
every brand, which is the same duplication `formats` exists to remove.

```
format_bom (format_id, material_id, qty_per_unit)   -- was sku_bom (sku_id, ...)
```

**Consequence to watch:** brand-specific print — labels, printed cans, keg
collars — is materially brand-dependent, and a format-level BOM cannot express
it. Two ways that resolves, and this does not need deciding now: treat print as
a generic material line on the format and let cost roll up at the material
level, or add a narrow per-SKU override table later for print only. The second
is a strictly additive change, so starting format-only is safe.

`packaging_run_consumptions` already records what was actually consumed, so
history is unaffected either way — the BOM is a plan, not a fact of record.

### 16.13 Tap events: swap is the primitive (decided 2026-09-02)

A bartender changing a keg performs **one** act, but a kick-then-tap model asks
for two records. The gap between them is where data goes missing, and it is
worst exactly when it matters — a follow keg of the same beer, where nothing
looks wrong afterwards.

So the primitive is the swap:

| Command | Effect |
| --- | --- |
| `tap_keg` | opens an interval |
| `swap_keg` | closes A and opens B **in one RPC**, defaulting to the same SKU |
| `kick_keg` | closes A with a reason; tap goes empty |

`swap_keg` being one transaction is the same discipline as the keg-return RPC:
an interval can never be left open by a half-finished swap.

**This is also why tap lines were the wrong model.** The follow-keg ambiguity is
not about where a keg is plugged in — it is about whether the handoff was
recorded atomically. Model the swap and the ambiguity disappears with zero
knowledge of physical lines.

Two kegs of one SKU open at once still happens (two taps of the flagship).
Sales split proportionally across open intervals, and any per-keg yield derived
from an overlap is labelled *split*, never presented as measured.

**Two writers, one truth.** MGR stores tap state; the brewery website drives it
through `tap_keg` / `swap_keg` / `kick_keg` and reads `list_open_taps`. The
website is a client, not a second store, so nothing can diverge — unlike
`tap_label` (§16.8), where two systems would each keep their own copy. MGR's own
tap board issues the same commands.

**`taproom` role — new.** `staff_role` gains `taproom`. It is the first role that
maps to a shift rather than a function: a bartender needs the tap board and POS
reconciliation and nothing else.

**The enum value alone does not narrow anything.** §0's `P-staff` template is
role-agnostic — `staff_all for all using (is_staff_of(brewery_id))` — so a
`taproom` user added today inherits full staff read *and write* on customers,
price lists, invoices, production and compliance. Narrowing that surface needs
per-role policies which are **not designed yet** and are not in §16.17's build
order. Do not ship the role without them; see §16.16 item 4.

**Tapping a keg that is not in taproom stock is allowed.** The interval is
flagged `not_in_inventory`. No special ledger rule is needed — tapping posts
nothing either way (§16.15) — so the flag exists solely to exclude the keg from
variance, since it was never counted into taproom stock. An event keg or one
carried over still gets a yield number from its nominal size.

**Concurrency.** The realistic failure is not two simultaneous clicks; it is a
duplicate action from uncertainty — the website posts a swap, the bartender does
not see it land, and swaps again on the board a minute later, producing two
intervals or a phantom keg. Two guards:

1. **Compare-and-swap.** The command carries the open interval's id and the RPC
   requires `closed_at is null`. The second call fails with copy a human can act
   on: *"Hazy IPA was already swapped out at 7:42pm."* No infrastructure, and it
   makes the duplicate impossible rather than merely visible.
2. **Recent tap events on the board** — last few actions with who and when. This
   does not prevent anything; it is the correction path.

**Live updates.** Subscribe to `keg_taps` filtered by brewery via Supabase
Realtime, on the tap board page only, unsubscribed on navigate away. RLS applies
to the subscription. One socket per open page in one taproom is single-digit
connections. A 30-second poll of `list_open_taps` is an adequate fallback — the
data changes a handful of times a day. Realtime is a nicety here; guard 1 is what
prevents the bug, so if Realtime ever becomes a burden it can be deleted with
nothing else breaking. Do not build a general realtime layer for it.

**Still open:** `request_id` makes a retry safe but does not stop
two people acting at once. A swap should carry the open interval's id and fail
loudly if it is already closed, rather than opening a second interval.

**Tap board.** One row per open keg, showing what is on, since when, and an
estimated remaining percentage derived from POS sales against nominal volume,
with `Swap` and `Kicked` actions. The estimate is what makes the screen worth
opening — a screen that only takes data from people gets ignored; one that says
what is about to run out gets used. Frame drawn in the wireframes.

### 16.14 POS reconciliation: partial contribution, archived in Square (decided 2026-09-02)

**What an unmapped item actually costs.** Under §16.15 POS never posts to the
ledger, so an unmapped item is not an inventory error — the count already caught
the beer leaving. It is a *measurement* error: fifteen pints sold under an item
MGR cannot translate leave expected consumption fifteen pints short, and the
variance report shows fifteen pints of loss that never happened. A mapping gap
and theft look identical. Keeping the variance number honest is the only reason
this list exists.

That also gives the discriminator: an item matters **if and only if it draws
from a keg**. A pretzel sold two hundred times moves no beer and cannot affect
variance at any volume.

**A mapped line contributes its expected consumption even if another line on the
same sale is unmapped.** Three pints and an unmapped pretzel: the pints count
toward expected, the pretzel does not hold the sale. Partial contribution keeps
the variance figure as good as the mapping allows instead of discarding a whole
sale.

**Nothing is auto-ignored by provenance.** Classifying by *where an item came
from* re-creates the failure it is meant to solve: a beer typed straight into
Square by a bartender is “created in Square” and would be filed away unread,
which is the genuinely-unmapped beer hiding in the list all over again. Two
human-driven escape hatches instead, neither of which can hide a beer by
accident:

1. **Archive it in Square (decided 2026-09-02).** For an item that should no
   longer sell at all — a guest tap that is gone, a one-off, a retired beer —
   retire it where it lives, through the same Square Catalog write MGR already
   uses to hide a SKU that has come out of inventory. MGR reads Square's archive
   state and never lists an archived item, so Square stays the source of truth
   for its own catalog and no MGR-side mirror can drift. The unmapped list
   offers the action directly; a taproom archiving in Square by hand gets the
   same result with no MGR involvement.
2. **Ignore, set by a person.** For an item that is legitimately sold forever
   and is simply not beer — food, merch — one click, permanent. `ignored` is
   therefore a statement that *someone looked at it*, never an inference.

The list is sorted by sales volume, so the item costing the most variance is at
the top and the forty pretzels are cleared once at connect.

`pos_unmapped_items` keys on variation and means *needs attention*, not
*everything Square sells that is not ours*.

**Open:** confirm the Square Catalog field for archive/hide against the live API
before building — the same call §16.7's publish path needs.

### 16.15 The count posts depletion; POS is the variance check (decided 2026-09-02)

**This inverts a rule drawn in the wireframes** — the POS frames say "when Square
is connected the weekly count posts no depletion, it is a variance check against
POS". The opposite is correct and those frames need amending.

| | Source | Posts to the ledger |
| --- | --- | --- |
| **Actual** | physical count | yes — `depletion`, channel `taproom` |
| **Expected** | POS sales × serving size | no |
| **Variance** | expected − actual | nothing; it is a report |

**POS is not the source of truth for inventory.** It is the tool for seeing
expected consumption against actual, and the gap is the product: bad pours,
theft, staff drinks, comps, line cleaning. That number only exists because both
halves are kept, and it is what a taproom manager will act on.

**A keg moving warehouse → taproom is not a removal.** It stays on the books as
taproom stock until a count says it is gone. `taproom_transfer` keeps
`channel null`, unchanged. This keeps taproom on-hand a real number, which bins
and menu availability need anyway, and a month-end count yields the month's
removal cleanly — satisfying the domain rule that a removal belongs to the month
the beer left.

Three consequences worth stating:

1. **`inventory_movements.qty` does not need widening.** The `numeric(12,2)`
   rounding problem only existed if fractional pours became movements. Counts
   are in kegs and cases. Earlier text in §16.8 arguing for whole-keg depletion
   to dodge the rounding still holds for its own reason, but the rounding itself
   is now moot.
2. **Tap and kick have no ledger effect whatsoever.** They open and close an
   interval and nothing else, so a mis-tap corrupts nothing and both the website
   and MGR can write them freely. This is the property that makes two writers
   safe (§16.13).
3. **A keg tapped that is not in taproom stock** needs no special ledger rule —
   depletion never came from tapping in the first place. The
   `not_in_inventory` flag remains useful only for excluding it from variance.

**Yield (§16.8) is unaffected**: it was always a report over POS data against
nominal volume, never a ledger write.

### 16.16 Open questions

**Resolved 2026-09-02:** BOM belongs to the format (§16.12); every location has
a default bin and `bin_id` is `NOT NULL` (§16.6); a COLA attaches to a **brand**,
so `product_approvals` becomes `brand_approvals` keyed by `brand_id` — a blend
shipping as a new brand needs its own approval, which is correct because it is a
different label; swap is the tap primitive and `staff_role` gains `taproom`
(§16.13); partial contribution, and unmapped items archived in Square or ignored
by a person rather than by provenance (§16.14); the paid/voided guarantee moves
to the read side instead of a CHECK (§16.11).

Still open:

1. Formats fully sized, or shape-only? (§16.2) — note §16.2a makes this narrower:
   only *atomic* formats carry a size at all.
2. Tiers priced by format with SKU override, or the reverse? (§16.4)
3. Does a poured format bind to one packaged format, or to a brand? Binding to a
   format makes bin-derived availability exact. (§16.2)
4. What RLS does `taproom` get? The role itself is decided (§16.13), but §0's
   `P-staff` is role-agnostic, so adding the enum value grants full staff
   read/write. The per-role policies that make the surface narrow are undesigned
   and unscheduled — this blocks shipping the role. (§16.13)
5. Quarters or eighths for fill — and do you weigh kegs? Tare weights are known
   per keg size, so weighing turns an estimate into a measurement. (§16.8)
6. *(resolved 2026-09-02 — see §16.15.)*

### 16.17 Build order when this is migrated

`brands` rename → `formats` + `skus.format_id` + `format_bom` → `bins` → `sale_channels`
(per #42's plan, plus tax treatment — needs movement tests green) → price tiers → `pos_menus` →
`keg_taps` → `repack` → invoice drift. The `taproom` role ships only once its
per-role RLS policies exist (§16.16 item 4) — it is not a step in this order
until they are designed.

`AGENTS.md` authorises editing the baseline in place, so this lands as one
revised `00001_baseline.sql` rather than a migration chain — which is the whole
reason for holding it as a spec until the interface settles.

**Verification note:** at the time of writing, `npx supabase start` fails
locally on `staff_role already exists` and the test suite dies at import from
`.env.local` key drift (`ANON_KEY`/`SERVICE_ROLE_KEY` vs the
`PUBLISHABLE_KEY`/`SECRET_KEY` the code now reads). CI is green on the same
commit, so both are local. None of §16 should be migrated until the database
runs locally and `npx vitest run` passes.

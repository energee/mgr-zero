# MGR — Baseline Schema Design (all ten slices)

Date: 2026-08-31
Status: Approved 2026-08-31 (with `brewer` added); implemented as
`supabase/migrations/00001_baseline.sql`. Newly discovered blockers are marked
**SCHEMA-GATE** and are not implemented.
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
| `staff_role` | `admin, sales, warehouse, brewer` | `brewer` added at review |
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

### `products` — unchanged
`name, style, abv numeric(4,2), ttb_tax_class text default 'beer'`. unique `(brewery_id,
name)` (decisions doc lists it; the current index is non-unique — tightening is intended).

### `skus` — carried forward + keg/UPC fields
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
### `price_list_items` — + `srp_cents int check (>= 0)` (suggested retail, nullable)
pk `(price_list_id, sku_id)`, both composite. RLS: `staff_all`, `customer_own_prices`.

### `sku_bom` — new (slice 5 packaging BOM)
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
  are possible only inside the exact `portal_*` RPC request paths and only on
  the caller's own wholesale order; raw Data API DML is denied.

**Portal fulfillment source:** `breweries.portal_fulfillment_location_id` is a
brewery-scoped `(location_id, brewery_id)` FK. Admin-only
`set_portal_fulfillment_source` accepts only a same-brewery warehouse.
`portal_create_order` and `portal_update_draft_order` derive that source at
execution time and fail closed when it is unset or invalid; they never choose a
first warehouse. The portal source is the only location row customers may read
to support these security-invoker RPCs.

### `order_lines`
`order_id → orders, sku_id → skus, qty_ordered numeric > 0, qty_picked numeric >= 0,
qty_shipped numeric >= 0 check (<= qty_ordered), unit_price_cents int >= 0` (snapshot),
`short_reason text`. unique `(order_id, sku_id)`. idx `(sku_id)`. RLS:
`P-customer` read via `order_id in (orders the customer may see)`; customer
line replacement is limited to the exact `portal_create_order` and
`portal_update_draft_order` RPC paths on a draft order. Remainder after ship is
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

### `pos_item_mappings`
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

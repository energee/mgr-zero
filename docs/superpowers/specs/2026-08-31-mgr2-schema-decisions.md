# MGR2 — Schema Design Decisions (input to the baseline migration)

Date: 2026-08-31
Status: Decided with Ted; the schema design doc and baseline migration follow from this.

## Goal

Replace the two existing migrations with **one complete baseline** covering every
entity the ten-slice spec implies (~55 tables), so that migrations after first
deploy are rare and additive. Until first deploy the baseline is edited in place.
Enums stay conservative: adding a value later is one line; a wrong one is forever.

## Decisions

| Area | Decision | Consequence for schema |
|---|---|---|
| Batches | A batch can split across vessels and blend with other batches | `batches` → `vessel_occupancies` (volume) → `transfers` between occupancies carry volume; blends are traceable |
| FG lots | Packaging run = lot; one run draws from exactly one vessel occupancy | `packaging_runs.occupancy_id`; `lots` 1:1 with runs; `inventory_movements.lot_id` |
| Kegs | Counts per customer, not serials. Pools by ownership: owned / leased / pay-per-fill. One-way kegs are materials | `keg_pools` (kind, vendor, contract terms), `keg_events` append-only count ledger (pool, size, delta, counterparty, reason); deposits reference pool |
| Readings | Manual entry only | `fermentation_readings` (occupancy, at, temp, ph, gravity, note, by); no devices table |
| Premises | One per brewery | TTB registry no. stays on `breweries` |
| Material lots | Per-material `lot_tracked` flag. Tracked → receipts create `material_lots`, consumption must name a lot (trigger-enforced, FIFO-assisted). Untracked → `lot_id` null | `materials.lot_tracked`; `material_movements.lot_id` nullable + trigger |
| Consumption | Actual lots at brew time where tracked | `batch_additions` reference `material_movements` |
| Tax | QuickBooks computes | No tax tables; invoices store QBO totals after sync |
| Recipes | Immutable versions; amounts per bbl, scaled at brew time | `recipes`, `recipe_versions`, `recipe_ingredients (per_bbl_qty)` |
| Pricing | Price lists ARE the tiers (Taproom / Wholesale / Retail…). No per-customer override table | `price_list_items.srp_cents`; `skus.upc` |
| POS | Per-item sales lines from Square | `pos_connections`, `pos_sales` (external item id → sku mapping, qty, sold_at); unmapped flagged |
| Filings | Store the filed snapshot | `report_filings` (jurisdiction, period, figures jsonb, filed_at); ledger stays recomputable |
| Short-ship | Remainder always cancelled | `order_lines.qty_ordered / qty_shipped`; order closes on ship; no backorder state |
| Vessels | Capacity, **no status column** (unmaintained state is worse than none) | `vessels.capacity_bbl`; occupancy derived from open `vessel_occupancies` |
| Deliveries | Both own-truck routes and carrier/distributor shipments | `routes`, `deliveries` for self-distribution; `shipments` for everything |

## Conventions applied uniformly (learned the hard way in slice 1A)

- Every tenant table: `brewery_id uuid not null`, RLS enabled, policies via `is_staff_of()` / `my_customer_ids()`.
- **Composite tenant FKs** on every cross-table reference: `unique (id, brewery_id)` on the parent, `foreign key (x_id, brewery_id) references parent (id, brewery_id)` on the child. Cross-brewery rows must be structurally impossible, not merely reviewable.
- Ledgers (`inventory_movements`, `material_movements`, `keg_events`) are append-only: `revoke update, delete`; corrections are reversal rows.
- Derived quantities are triggers, never client-supplied (`bbl` from `skus.bbl_per_unit`; lot requirement from `materials.lot_tracked`).
- Indexes ship in the same migration as the table; every list view has a covering index.
- Currency in integer cents; volumes and quantities `numeric`; never float.
- Unique-by-name where lookups happen by name: `customers (brewery_id, name)`, `products (brewery_id, name)`, `locations (brewery_id, name)`, `skus (product_id, name)`.
- Views use `security_invoker = true`.

## Existing tables to carry forward unchanged in intent

`breweries`, `brewery_users`, `customers`, `customer_users`, `ship_tos`, `products`, `skus`,
`price_lists`, `price_list_items`, `locations`, `inventory_movements`, `allocations`,
`taproom_pars` — see `supabase/migrations/00001_tenancy.sql` and `00002_catalog_ledger.sql`
for the current shape, CHECK constraints and trigger; the baseline must preserve their
semantics so the 29 existing tests keep passing.

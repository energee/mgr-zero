# MGR — Schema Design Decisions (input to the baseline migration)

Date: 2026-08-31
Status: Decided with Ted; implemented as `2026-08-31-mgr-schema-design.md` (58 tables) and `supabase/migrations/00001_baseline.sql`.

## Goal

One complete baseline migration covering every
entity the ten-slice spec implies (58 tables; it replaced the two slice-1A migrations), so that migrations after first
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

- Every tenant table: `brewery_id uuid not null`, RLS enabled, policies via the helpers named in `.agents/ARCHITECTURE.md` rule 3.
- **Composite tenant FKs** on every cross-table reference: `unique (id, brewery_id)` on the parent, `foreign key (x_id, brewery_id) references parent (id, brewery_id)` on the child. Cross-brewery rows must be structurally impossible, not merely reviewable.
- Ledgers (`inventory_movements`, `material_movements`, `keg_events`) are append-only: `revoke update, delete`; corrections are reversal rows.
- Derived quantities are triggers, never client-supplied (`bbl` from `skus.bbl_per_unit`; lot requirement from `materials.lot_tracked`).
- Indexes ship in the same migration as the table; every list view has a covering index.
- Currency in integer cents; volumes and quantities `numeric`; never float.
- Unique-by-name where lookups happen by name: `customers (brewery_id, name)`, `products (brewery_id, name)`, `locations (brewery_id, name)`, `skus (product_id, name)`.
- Views use `security_invoker = true`.
- Multi-row writes (confirm order, ship, close packaging run) are one `security invoker` plpgsql function each; the command handler only calls it. Functions `set search_path = ''`. Rationale and v1 evidence: `2026-08-31-mgr-v1-review.md` §1.1.
- Post-deploy, destructive DDL is guarded: `if exists (select 1 from <table>) then raise` — a migration must refuse to drop data it didn't expect.

## Derived values: views for state, snapshots for inputs, storage for facts of record

Decided 2026-08-31 during the recipe-development design (UI plan rev 3):

- **Current state derives in views** (`v_on_hand`, `v_atp`, `v_occupancy`, `v_keg_balances`):
  never store a value the database can recompute — stored copies drift.
- **Facts of record are stored**, because there drift prevention runs the other way: a
  movement's `bbl`, an invoice total, a `report_filings` snapshot, a price on an order line
  must say what was true at commit time, not track later edits to their inputs.
- **Mutable inputs to immutable records get snapshotted at commit** (extract potential onto
  `recipe_ingredients`, like price onto order lines); the derived output (OG/FG/ABV) is then
  computed from immutable inputs and never stored.
- **Row-local arithmetic lives in one registry-layer pure function, not SQL**, when the value
  is consumed only through registered queries and the UI needs it live pre-commit (the recipe
  editor previews OG/FG/ABV as the grain bill is typed). A view earns its place only when SQL
  itself consumes the value — joins, filters, RLS, or ledger-scale aggregation. Two
  implementations of one formula are drift between codebases.

Consequence for the baseline: `recipe_versions.target_og_plato / target_fg_plato /
target_abv` are drop candidates once assumption columns and the ingredient extract snapshot
land (the rev-3 SCHEMA-GATE).

## Slice-1A tables carried forward unchanged in intent

`breweries`, `brewery_users`, `customers`, `customer_users`, `ship_tos`, `products`, `skus`,
`price_lists`, `price_list_items`, `locations`, `inventory_movements`, `allocations`,
`taproom_pars` — see the slice-1A history (`git show 2802ae5:supabase/migrations/`)
for the pre-baseline shape; the baseline preserved their semantics so the slice-1A tests kept passing.

## Revision 2 decisions (2026-09-02) — why, for the tables in §16 of the design doc

These came out of drawing the QuickBooks and Square surfaces accurately
(`components/mgr/venue.tsx`, published at `/docs/integrations`). Drawing someone else's product honestly is
what exposed what was wrong in ours — each decision below traces to a specific
live screenshot, not to a preference.

**Held as a spec, not migrated.** The interface is still moving. Every table in
§16 would otherwise be migrated two or three times before the first screen
ships, and `AGENTS.md` allows editing the baseline in place, so there is no cost
to deciding late and building once.

**`product` → `brand`.** A batch is a production instance ("Lupula 3"); a brand
is what you sell ("Lupula", and "Waves" when two batches blend). They were one
word for two things. `brand` is what TTB grants label approval against, it is
what actually gets renamed on a blend, and it does not collide with `sku` in
speech. Rejected `label` — it collides with packaging materials.

**Identity optional at brew, required at packaging.** `lots.brand_id NOT NULL`
already enforced the real constraint; `batches.product_id NOT NULL` only forced
the decision earlier than the business makes it. Dropping a redundant constraint
buys flexibility without losing a guarantee.

**Formats exist because `bbl_per_unit` was being re-typed per SKU.** 20 brands ×
5 formats is 100 rows each restating the number the design doc calls the basis
of all TTB math. The pricing win is real but secondary; the compliance argument
is what makes it necessary.

**Poured formats are not stock.** A tapped keg does not become 124 pints of
inventory — nothing is created, the keg is consumed. This also happens to be
what a Square *variation* is, discovered from a live item library where price
reads as a range because the item carries no price at all.

**Whole-keg depletion, fractional reporting.** `inventory_movements.qty` is
`numeric(12,2)`; a 1/124 pour rounds to 0.01 and over-depletes a keg by 24%.
Fractions belong in a view where `qty_per_serving` is `numeric(12,6)` and
nothing rounds. The ledger stays exact and the yield report stays precise —
neither model achieves both alone.

**Fill levels never enter the ledger.** They are eyeball estimates. `bbl` feeds
excise math, and a guess has no place in a federal filing. Keeping them on the
keg event means they can be as rough as they are.

**Tap lines are enrichment, never a dependency.** Hand-maintained state that
nothing downstream validates, that Square has no concept of, and that a
bartender changes for optics. Modelled as a bin it would be a stale foreign key;
modelled as free text it is an honest note. It does not improve attribution — it
enables diagnosis, by grouping yields across many kegs to find a bad line.

**Push, not pull, for tap events.** The command API already exists with
`request_id` idempotency and rate limiting, so a push is one new command; a pull
would need a scheduler, credential storage and an adapter — to poll for an event
that happens when a human changes a keg. Push's weakness is silent staleness,
which lands harmlessly on the one field designed to gate nothing.

**The website is a menu destination, not an integration.** It is the third
consumer of the same catalog after Square and QuickBooks. A bespoke web feed
would produce a third answer to "what are we selling right now", and would leak
unannounced beer — the same ownership boundary Square's item library taught us,
where MGR may only touch rows it published.

**Detect drift, do not prevent it.** QuickBooks has no read-only invoice and no
setting that makes one. `SyncToken` already rides the response the sync job
reads, so detection is one column. Re-pushing over an accountant's correction
would be hostile and needs their token anyway.

**The packaging BOM belongs to the format.** A case box and a can end are
properties of the shape, not of the beer in it — keying the BOM per SKU
re-enters the same bill for every brand, the same duplication `formats` exists
to remove. Brand-specific print is the exception, and it is left unresolved on
purpose: a per-SKU override for print only is strictly additive, so
format-only is safe to start from, and `packaging_run_consumptions` records what
was actually used regardless.

**Sale channels: defer to #42, and add tax treatment.** §16.3 originally moved
removal classification onto the channel row. That was wrong — `brewing-domain.md`
classifies removals by *type*, so channel columns would duplicate what
`movement_type` carries, and #42 had already rejected a semantic column for the
same underlying reason. What #42 does not answer: with four fixed channels,
`export` implicitly meant an untaxpaid removal, and once a brewery names its own
channels nothing distinguishes an export channel from a taxpaid one. So the
channel carries a default `tax_treatment` and a customer may override or inherit
it.

**The resolved treatment is frozen on the movement.** A live lookup would mean
that editing a customer in March silently restates January's excise, which
`brewing-domain.md` forbids — a filed month is never rewritten. Same discipline
as `bbl`, frozen by trigger at write. Resolution is customer override → channel
default, once, at write time.

**Detection belongs on the read side, not in a CHECK.** A draft of §16.11 carried
`check (paid_at is null or qbo_remote_state = 'live')`. It contradicted the rule
directly above: push → paid → an accountant voids it, and the sync job cannot
record the void without first nulling `paid_at`. A constraint that forces the
sync job to remember a write order is the rule it claimed to replace, and
paid-then-voided is real history that must stay representable. The guarantee —
never read a voided invoice as collected — is stated once in the reporting view
instead, where it costs nothing and forbids nothing.

**A role in the enum is not a permission boundary.** `staff_role` gains
`taproom` (§16.13), but §0's `P-staff` template is role-agnostic, so the enum
value on its own hands a bartender full staff write on customers, invoices and
compliance. The narrow surface a taproom role implies is per-role policy work
that has not been done. Naming the gap in the spec is the cheap part; the role
does not ship until the policies exist.

**Unmapped POS items are a measurement problem, so a person clears them.** POS
posts nothing to the ledger (§16.15), so an unmapped item does not lose
inventory — it makes expected consumption too low, and the variance report shows
loss that never happened. Auto-ignoring anything MGR did not publish would file
away a beer a bartender typed straight into Square, which is the same silent
failure in a new place. Two human acts instead: archive it in Square, through
the same Catalog write that retires a SKU out of inventory — Square owns its own
catalog, so MGR reads that state rather than mirroring it — or mark it ignored
by hand. `ignored` then means someone looked, never that something was inferred.

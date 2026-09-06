# MGR — Locations, bins, and internal stock transfers

Date: 2026-09-06
Status: Decided with Ted; not yet implemented. Three phases, each its own PR.
Amends: `2026-08-31-mgr-schema-design.md` — `locations` is no longer a flat two-kind
list, `material_movements` / `keg_events` stop being location-blind, and decision #6
("materials have no locations") is reversed. Adopts §16.6 (bins, decided 2026-09-02)
in spirit — `bin_id NOT NULL`, every location always has at least one bin — but with a
seeded trio and a minimum-of-one rule instead of one undeletable default. Defers §16.6's
`taproom_pars` re-key to a later phase.

## Problem

A brewery tracks kegs like this:

    keg fleet   1/6  28
    keg fleet   1/2  20
    Microstar   1/6  36  (40 in storage)
    Microstar   1/2  12  (32 in storage)
    Lolev       1/6   3
    Lolev       1/2   7
    One way     1/6  11

Pool × size is already the ledger grain — `keg_events (pool_id, keg_size, qty, reason)`
at `supabase/migrations/00001_baseline.sql:950`. The first two columns of that list drop
straight in. The **parenthetical does not**: `keg_events` has `pool_id`, `customer_id` and
`shipment_id`, but no location. A keg is either "out at a customer" or "in", one
undifferentiated bucket. "36 here, 40 in storage" is unrepresentable.

Raw materials are worse: `material_movements` (`:540`) has no location column at all, so
malt is brewery-wide no matter how many buildings it sits in.

Only finished goods know where they are. `inventory_movements` (`:322`) carries
`location_id not null` and indexes on-hand as `(brewery_id, sku_id, location_id)`.

Three ledgers, three different answers to "where". This spec gives them one.

## What "where" means — two levels, one of which is a dimension

The two words in the request, *bins* and *locations*, are not the same idea at different
scales. They differ in whether a delivery can happen:

| Level | Grain | Moving between them |
| --- | --- | --- |
| **Location** | a building | a `stock_transfer`; may become a route stop |
| **Bin** | a shelf, rack, corner within one building | a relabel; never a delivery |

Ted's rule, and it is exactly right: *"if a transfer between 2 bins happens in one
location, it would not require a delivery."* Nobody drives across the warehouse.

That rule is made structural rather than conventional by putting
`check (to_location_id <> from_location_id)` on the transfer document. A `stock_transfer`
is by definition cross-location, so it is always potentially deliverable, and a bin move
cannot become one because it has no transfer document to hang a delivery on.

**Location is a ledger dimension** — balances are per location, movements name a source and
a destination. **Bin is the finer grain inside it** — required everywhere (§16.6), which a
guaranteed minimum of one bin per location makes free: no on-hand, availability or par
query ever carries an `or null`.

## Decision 1 — `bins`, and the invariant that keeps them honest

`location_kind` gains `'storage'`, a third kind alongside `warehouse` and `taproom`. Offsite
storage is a location, not a flag: you drive to it, which is precisely what makes it a
location under the rule above.

```sql
create table bins (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  location_id uuid not null,
  name text not null,                      -- "Walk-in", "To-go fridge", "Rack 3"
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (location_id, name),
  unique (id, location_id, brewery_id),    -- target of the composite FK below
  foreign key (location_id, brewery_id) references locations (id, brewery_id)
);
create index bins_brewery_idx on bins (brewery_id, location_id);
```

**Every location is born with a preset trio** — `Walk-in`, `Cold`, `Dry` — created inside
`create_location` in the same transaction. They are ordinary bins: rename any of them,
delete the ones that don't match the building. Two guards make "remove" safe, both
enforced in `delete_bin` under a row lock on the location:

- **a location keeps a minimum of one bin** — deleting the last one is refused. There is no
  special "default" row; whichever bin remains is the one, and it can be renamed like any
  other;
- **a bin that has ever recorded stock cannot be deleted** — refused when any of the three
  ledgers has a row for that bin. The ledgers are append-only and reference the bin, so
  moving the stock out does not make it deletable (a net-zero balance still leaves the
  rows behind). Rename it instead; only a never-used bin can be removed.

The minimum-of-one rule is a count, so it lives in the RPC rather than a constraint; the
row lock is what stops two concurrent deletes from emptying a location between them.

Bins are brewery-configured — the brewery names them. There is deliberately **no `kind`**
column yet: nothing in these phases reads one, and the Bin sheet's Kind picker (Packaged /
Cold / Dry) stays gated until §16.7 menus actually consume it. An enum is trivial to add and
painful to rename.

The invariant that matters is **a ledger row's bin must belong to that row's location**.
Filing a keg into bin D4 at the taproom, when D4 is a warehouse bin, must be impossible —
not merely unlikely. Every ledger enforces it with a composite foreign key rather than
application code:

```sql
foreign key (bin_id, location_id, brewery_id) references bins (id, location_id, brewery_id)
```

This is the same tenancy trick the schema already uses throughout — `ship_tos` is reached as
`(id, customer_id, brewery_id)` at `:821`, `material_lots` as `(id, material_id, brewery_id)`
at `:553`. Nothing new to learn.

`bins` deliberately has no capacity, no dimensions, and no pick-sequence ordering. A bin is
a name for a place. Add more when something needs it.

Commands: `list_bins`, `create_bin`, `update_bin` (rename), `delete_bin`. The three
mutations are admin and warehouse, the roles the Location bins screen already names;
`list_bins` also grants sales, like `list_locations`, since order screens pick a bin.

## Decision 2 — location on all three ledgers

| Ledger | Line | Change |
| --- | --- | --- |
| `inventory_movements` | `:322` | add `bin_id not null` (already has `location_id not null`) |
| `material_movements` | `:540` | add `location_id not null`, `bin_id not null` |
| `keg_events` | `:950` | add `location_id not null`, `bin_id not null` |

On-hand indexes end in `bin_id` so per-bin on-hand is an index prefix, not a filter over
the location (§16.6):

```sql
-- movements_onhand_idx becomes:
  on inventory_movements (brewery_id, sku_id, location_id, bin_id);
create index material_movements_onhand_idx
  on material_movements (brewery_id, material_id, location_id, bin_id);
-- keg_events_pool_idx becomes:
  on keg_events (brewery_id, pool_id, keg_size, location_id, bin_id);
```

`record_inventory_movement` gains a required `p_bin`, and `record_movement`'s input a
required `binId`. There is no default to fall back to, so the column is required at the
boundary too; the Record movement form preselects the location's first bin. The two
existing tests that call `record_movement` name a bin.

The opening list then reads as balances per pool × size × location — `Microstar /
sixth_bbl / Warehouse = 36` and `Microstar / sixth_bbl / Storage = 40`, two real rows
summing to 76. The parenthetical stops being a note in someone's head.

### Why `not null` on all of them

`inventory_movements.location_id` is already `not null` and the two new columns match it.
A nullable location would mean "somewhere", which is the state being fixed; every on-hand
query would then need a coalesce and every count screen a "no location" bucket.

`keg_events.location_id` stays `not null` even for the customer-facing reasons. For
`shipped` it is the location the kegs left from; for `returned`, the one they came back
into. The existing per-reason check on `customer_id` (`:967`) is unchanged.

This is the one genuinely invasive edit in the spec: every test that writes a
`material_movements`, `keg_events` or `inventory_movements` row directly must now name a
location and a bin. The work is mechanical, and it is the bulk of phase 1's churn.

### Why this is cheap to do at all

AGENTS.md authorises editing `00001_baseline.sql` in place, and nothing is deployed. These
are edits to the baseline plus `supabase db reset` — no second migration file, no backfill,
no versioning. Adding a location dimension to a live ledger would be a far larger piece of
work; doing it now costs almost nothing.

## Decision 3 — `stock_transfers`, not a third order kind

Kegs and raw materials must be able to ride a driver's route, same as finished goods. The
obstacle is a strict chain: `deliveries.shipment_id → shipments.order_id →
order_lines.sku_id`. All three FKs are `not null`, `shipment_id` and `order_id` are
additionally `unique`. To be a delivery stop today, a thing must first be an order line, and
order lines are SKUs.

Finished goods already have an internal-move path — `orders.kind = 'taproom_transfer'`
carries `from_location_id → to_location_id` with no customer, and `create_order_impl`
posts the paired movements in one RPC (`:1662-1665`). The tempting move is to add a third
`order_kind` and teach `order_lines` about materials and kegs.

**Rejected.** `orders` is a *priced customer document*: it carries `price_list_id`, snapshots
line prices, generates invoices, and feeds allocations and ATP. Every one of those paths
assumes a line resolves to a SKU with `bbl_per_unit`. Malt has no price list and an empty
keg has no ATP. Extending `order_lines` puts an "unless it's a material" branch into
invoicing, pricing, allocation, and TTB volume math — four places that have no business
knowing malt exists.

The line worth defending is *priced customer document* versus *internal move of stuff*. So
internal moves get their own document.

```sql
create type stock_transfer_status as enum
  ('draft','submitted','picked','in_transit','received','cancelled');

create table stock_transfers (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  transfer_no bigint,                                  -- trigger
  status stock_transfer_status not null default 'draft',
  from_location_id uuid not null,
  to_location_id uuid not null,
  requested_date date,
  note text,
  created_by uuid not null references auth.users(id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, transfer_no),
  foreign key (from_location_id, brewery_id) references locations (id, brewery_id),
  foreign key (to_location_id, brewery_id) references locations (id, brewery_id),
  check (to_location_id <> from_location_id)
);
create trigger stock_transfers_no before insert on stock_transfers
  for each row execute function private.set_doc_no('transfer_no','transfer');
```

Document numbering reuses `private.set_doc_no` (`:116`). `brewery_counters.key` has a check
constraint listing the committed document kinds (`:107`) — it gains `'transfer'`.

```sql
create table stock_transfer_lines (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references breweries(id),
  transfer_id uuid not null,
  sku_id uuid,
  material_id uuid,
  keg_pool_id uuid,
  keg_size keg_size,
  qty numeric(14,4) not null check (qty > 0),
  from_bin_id uuid not null,
  to_bin_id uuid not null,
  note text,
  unique (id, brewery_id),
  foreign key (transfer_id, brewery_id) references stock_transfers (id, brewery_id),
  foreign key (sku_id, brewery_id) references skus (id, brewery_id),
  foreign key (material_id, brewery_id) references materials (id, brewery_id),
  foreign key (keg_pool_id, brewery_id) references keg_pools (id, brewery_id),
  check (num_nonnulls(sku_id, material_id, keg_pool_id) = 1),
  check ((keg_pool_id is null) = (keg_size is null))
);
```

`num_nonnulls(...) = 1` is how the schema already writes "exactly one of these"; the
polymorphism stays in the database rather than in a service layer.

Bins on lines are `from_bin_id` / `to_bin_id` rather than one column, because a transfer
moves stock out of a bin at the source and into a different bin at the destination. The UI
defaults both to the location's first bin; the column is `not null` per §16.6.

### Posting

One RPC, `receive_stock_transfer`, walks the lines and posts **paired** ledger rows — negative
at the source location, positive at the destination — into whichever of the three ledgers the
line addresses. This is the shape `create_order_impl` already uses for taproom transfers, so
the pattern is established rather than invented.

Enum additions fall out:

- `movement_type` gains `'location_transfer'`. `'taproom_transfer'` stays as-is for the
  existing order-driven path; the new value keeps the two sources of truth distinguishable
  in the ledger. Both are volume-neutral: stock changes place, not ownership, so nothing is
  a TTB removal.
- `keg_event_reason` gains `'transferred_out'` and `'transferred_in'`. Two reasons rather than
  one, because `keg_events.qty` is `check (qty > 0)` with direction carried by `reason`.
- `material_movement_type` gains `'transfer_out'` / `'transfer_in'` for the same reason — its
  `material_sign` check (`:554`) keys sign off type.

Volume-neutrality is worth stating explicitly: a transfer must never touch the TTB removal
figures. `inventory_movements` freezes `bbl` on write via `enforce_bbl_integrity` (`:361`),
and a paired ±qty nets to zero bbl across the two rows. Phase 2 gets a test asserting exactly
that.

## Decision 4 — deliveries carry either kind of document

```sql
alter table deliveries alter column shipment_id drop not null;
-- + stock_transfer_id uuid unique
--   foreign key (stock_transfer_id, brewery_id) references stock_transfers (id, brewery_id)
check (num_nonnulls(shipment_id, stock_transfer_id) = 1)
```

`routes`, stop numbering, and `delivered_at` / `signed_by` are untouched. A stop becomes
"a shipment to a customer" **or** "a transfer between our buildings", and a driver's day can
mix the two.

`deliveries.shipment_id` losing `not null` is the only weakening of an existing constraint in
this spec, and the `num_nonnulls` check replaces exactly the guarantee that is lost: every
delivery still points at precisely one document.

## Decision 5 — bin moves are not transfers

Moving stock between bins inside one location is **not** a `stock_transfer` and can never
produce a delivery. It gets its own small RPC, `move_stock_bin`, writing the paired ledger
rows with the same `location_id` and different `bin_id`. No document, no number, no route,
no status.

The `check (to_location_id <> from_location_id)` on `stock_transfers` is what makes this
structural: a same-location move is not merely discouraged, it cannot be written as a
transfer.

## Consequences worth naming

Carrying `bin_id` on every ledger row yields per-bin balances for free. The stated need was
*finding things* — "which corner do I walk to". The ledger-row approach is strictly more
capable, and §16.6 chose it for a different reason: a required column with a default row
deletes a class of null handling. Bin-level *counting* is still a workflow nobody has asked
for; the balances exist, the screens for them do not, and that is fine.

**`taproom_pars` re-key on bin (§16.6) is deferred.** Pars keep `(location_id, sku_id)`
through all three phases here; the Bin sheet's Par field stays gated. It is a mechanical
change (`set_taproom_par` takes a bin, `taproom_replenishment` joins through it, the
replenishment page picks a bin) that belongs with pars work, not with "where things are".

Two smaller notes:

- **Lolev** — another brewery's empties held in your building — has no clean home. It would
  be a `keg_pools` row of `kind = 'leased'` with Lolev as a `vendor`, which works but reads
  oddly, since nothing is leased *to* you. Out of scope here; flagged so it is not
  rediscovered.
- **One-way kegs** (`One way 1/6 11`) still cannot appear on the keg fleet screen. The `skus`
  check at `:268` requires `keg_pool_id is null` for `container_source = 'one_way_material'`,
  deliberately: a returnable keg is an asset with a deposit liability, a one-way keg is COGS.
  The operator's question is "how many do I have", which crosses that line. Out of scope
  here; wants its own decision.

## Phases

Each phase is a PR, checkpointed before the next begins.

**Phase 1 — where things are.** `bins` table with the seeded trio and minimum-of-one
rule (Decision 1), bin commands, `location_kind = 'storage'`, `location_id` and `bin_id`
on `material_movements` and `keg_events`, `bin_id` on `inventory_movements`, index
changes. Existing on-hand views keep their columns and grain; three bin-grain views
(`bin_on_hand`, `material_bin_on_hand`, `keg_bin_totals`) are added beside them. The
affected screens (Locations, Location detail, Location bins, Bin, Keg fleet, Record
movement) lose their gates. Tests updated to carry locations and bins. No transfers, no
deliveries.

**Phase 2 — moving things.** `stock_transfers`, `stock_transfer_lines`,
`receive_stock_transfer`, `move_stock_bin`, the enum additions, `brewery_counters` key
`'transfer'`. Moves work and post correctly; nothing rides a route yet. Includes the
volume-neutrality test.

**Phase 3 — driving things.** `deliveries` polymorphism, route and driver screens, the
customer guides.

## Testing

Per AGENTS.md, every behaviour starts with a failing vitest against the real database.

- **Invariant:** a ledger row whose `bin_id` belongs to another location is rejected by the
  database, not by app code. One test per ledger.
- **Minimum of one:** `create_location` yields the trio; deleting down to one succeeds;
  deleting the last bin is refused; deleting a bin with non-zero stock is refused; renaming
  the last bin succeeds.
- **Balances:** two pools × two sizes × two locations produce four independent on-hand rows
  that sum correctly, and the `Microstar 36 / 40` case reads back as written.
- **Volume neutrality:** a transfer of finished goods leaves total `bbl` unchanged and posts
  no removal.
- **Same-location rejection:** `stock_transfers` with equal from/to is rejected; the same
  move succeeds through `move_stock_bin`.
- **Delivery exclusivity:** a `deliveries` row with both documents, or neither, is rejected.
- **Pairing:** `receive_stock_transfer` posts both halves or neither (one RPC, one
  transaction), across all three line kinds.

Screens are verified by eye per AGENTS.md step 4, not by test.

## Open questions

None blocking. The two flagged items — Lolev-style foreign kegs, and one-way kegs on the
fleet screen — are separate decisions that do not gate any phase here.

# Lolev orders: customers, export, pickups, one-way kegs, history

Status: plan, awaiting approval. Branch `docs/lolev-orders-plan` for the plan;
implementation on `feat/lolev-orders`, PR to `main`.

## Why

The user wants Lolev's orders in MGR (2026-10-15). The orders are not in the
Lolev dump: its `orders` collection holds 39 rows ending 2025-07. They are in
the Google Sheet export `~/Downloads/Beer orders (2).xlsx`, one tab per canning
week. `Pricing - Beer.csv` is that sheet's price tab. `import-lolev.ts
--prices` already loads it.

Five things the orders need, which MGR does not have today:

| Need | Today | Where |
| --- | --- | --- |
| A foreign customer address | `customers.state` and `ship_tos.state` must match `^[A-Z]{2}$`; there is no country | `00001_baseline.sql:235`, `:265`; zod `stateCode`, `lib/commands/registry.ts:164` |
| An export removal to a country | a `sale_removal` needs `dest_state` (`removal_shape`, `00001_baseline.sql:664`); ship copies the ship-to state into it | `private.ship_order_impl`, `20261012110100_adjust_after_pick_repicks.sql:198` |
| A pickup order | every wholesale order needs a ship-to, and `list_routes` lists every unrouted shipment | `00001_baseline.sql:1627`; `lib/commands/delivery.ts:45` |
| A non-refundable one-way keg fee | deposits only, which are refunded by `create_credit_memo_impl` | `order_deposit_lines` (`20260910120847:82`); `20261012101000_ship_and_return_keg_events.sql:212` |
| Orders and invoices before the books opened, with no stock | an invoice is created only by shipping, which writes movements; every invoice can be pushed to QuickBooks | `ship_order_impl`; `start_qbo_push` (`20261015120000:120`) |

A customer alias is the sixth gap: `customers` has no alias. The brand alias
(`20261014100500_brand_alias.sql`) is the pattern.

## Decisions (user, 2026-10-15)

Customers:
- Only the customers with orders are imported (16, below). The other ~825
  Lolev customers are not.
- Every Sarene block or record is one customer.
- One customer per company. The sheet's country and color suffixes are dropped.
- Each customer has one optional staff-only **alias**, like `brands.alias`
  (example: Tavour = "Nano Wine 'N Beer").
- Every customer has a **country**. A US customer also has a state. Street,
  city and zip are optional until known.

Export:
- The seven international customers are on the built-in `Export` channel
  (`tax_treatment = 'export'`, `00001_baseline.sql:588`).
- Export prices are the Wholesale sixtel and case prices. The Export half cell
  stays empty, so an export half cannot be ordered.

Kegs:
- The only one-way keg is the sixtel. It is a format of its own (staff guide,
  one-way kegs; `tests/one-way-keg.test.ts`), priced in its own cells, today
  equal to the returnable sixtel on each channel.
- **Each one-way sixtel shipped carries a $10 fee, never refunded.** The fee
  follows the format, not the channel.
- Returnable halves and sixtels are on **Lolev kegs** with a **$30 deposit**,
  both sizes. No customer uses Kegfleet today. A customer that does later gets
  separate Kegfleet formats (the pool lives on the SKU), created then.
- In history, export sixtels were one-way and domestic sixtels returnable.

Orders:
- An order has a **pickup** flag. A pickup order is never routed. It still
  names a destination, for TTB.
- One sheet block (customer × week) is one order.
- `books_opened_on` moves to **2026-10-15**. Orders picked up before it are
  **historical**: an order and an invoice at the grid price, with no stock,
  no finished goods, no TTB month, and never pushed to QuickBooks. Orders on
  or after it are live.
- Every order line gets a SKU. A missing brand × format SKU is created with
  `create_sku`'s defaults.

Beers: the 141 sheet names map to brands. 85 match exactly, 21 match by name
plus series number, and 19 were mapped by the user. 16 new brands are needed
(Vindobona, DDH Lupula, DDH Rubico, and 13 placeholders). `Luminis Brassarie
Collab` is renamed `Luminis`, with the alias `Brasserie DB Collab`. The full
map is the import's input (Import, below).

## Source (`Beer orders (2).xlsx`, 2026-10-14)

- 74 week tabs, 4-24-24 to 11-25-26, plus `Price Tiers` and `Collabs`.
- **To 1-22-25 (13 tabs):** one grid with `east-*` and `west-*` columns. Each
  tab is one Sarene order.
- **From 2-12-25 (61 tabs):** one block per customer, headed `can date |
  pickup date | <customer> | type | price tier | half | sixtel | case`. The
  `In House` and `Customer TOTALS` blocks are not orders.
- **Result:** about 261 historical and 34 live orders, 1,521 lines. 118 blocks
  have no pickup date; they take the tab's can date. One cell reads
  `Check Invo` (Sixth City, 2-11-26); the import reports it and uses the can
  date.

| Customer | Destination | Channel | History | Live |
| --- | --- | --- | --- | --- |
| Sarene | US · PA | Wholesale | 107 | 7 |
| Sixth City | US · OH | Wholesale | 33 | 7 |
| Lake Beverage | US · NY | Wholesale | 14 | 0 |
| Tavour (alias Nano Wine 'N Beer) | US · WA | Wholesale | 5 | 4 |
| Allied Craft Distribution | US · VA | Wholesale | 2 | 2 |
| Proof Wines & Spirits | US · SC | Wholesale | 3 | 0 |
| One Stop Brew Shop | US · NY | Wholesale | 0 | 2 |
| Crafted Imports | US · NY | Wholesale | 2 | 0 |
| Majestic Bar and Grille | US · PA | Resale | 1 (Lolev dump) | 0 |
| Odyssey Club | China | Export | 30 | 6 |
| Interbeer | Netherlands | Export | 29 | 4 |
| Brew Export | United Kingdom | Export | 12 | 0 |
| Hops Express | Hong Kong | Export | 11 | 0 |
| Unusual Holdings | Japan | Export | 5 | 0 |
| Coolship International | South Korea | Export | 4 | 2 |
| DGB Import | Norway | Export | 4 | 0 |

In the source, export customers ordered only sixtels and cases, never a half.

## Schema — `20261016100000_customer_country_alias.sql`

```sql
alter table public.customers
  add column alias text check (alias is null or length(trim(alias)) > 0),
  add column country text not null default 'US' check (country ~ '^[A-Z]{2}$');
-- A US customer keeps its required state; any other country has none.
alter table public.customers alter column state drop not null;
alter table public.customers add constraint customers_state_by_country
  check ((country = 'US') = (state is not null and state ~ '^[A-Z]{2}$'));

alter table public.ship_tos
  add column country text not null default 'US' check (country ~ '^[A-Z]{2}$'),
  alter column address1 drop not null, alter column city drop not null,
  alter column zip drop not null, alter column state drop not null;
alter table public.ship_tos add constraint ship_tos_state_by_country
  check ((country = 'US') = (state is not null and state ~ '^[A-Z]{2}$'));
```

`country` is the ISO 3166-1 alpha-2 code (`CN`, `NL`, `GB`, `HK`, `JP`,
`KR`, `NO`), validated against a list in `lib/mgr/enums.ts` (`COUNTRY_CODES`)
by zod and against the shape by the check. `upsert_customer` and
`upsert_ship_to` take trailing `p_alias text default null` and `p_country
text default 'US'`, so `import_csv_row`'s positional calls stay valid
(`20261012100700_import_resolve_names.sql:86,89`), as `upsert_brand` did.

## Schema — `20261016100100_export_destination.sql`

```sql
alter table public.inventory_movements add column dest_country text
  check (dest_country is null or dest_country ~ '^[A-Z]{2}$');
-- A sale removal names a US state, or (export only) a foreign country.
```

`removal_shape` is replaced so a `sale_removal` needs exactly one of
`dest_state` and `dest_country`, and `dest_country` only with
`tax_treatment = 'export'`. `ship_order_impl` reads the ship-to's country:
US gives `dest_state` as today; anything else gives `dest_country`, and is
refused unless the frozen treatment is `export` ("only an export order can
ship outside the US"). `destination_state_facts` skips rows with
`dest_country` (they have no state), so they stop raising `Unassigned`
(`20260928236000_destination_state_facts_on_ledger.sql:34`). The removals total
already files them under `export` (`20261013100000_file_cellar_taproom_removals.sql:28`).

## Schema — `20261016100200_pickup_orders.sql`

```sql
alter table public.orders add column pickup boolean not null default false;
```

`create_order`, `update_draft_order` and the portal path take `p_pickup
boolean default false`. `save_route_impl` refuses a pickup order's shipment,
and `list_routes` leaves pickup shipments out of the unrouted list, in the
query (AGENTS.md negative 12).

## Schema — `20261016100300_one_way_keg_fee.sql`

```sql
alter type public.invoice_line_kind add value 'one_way_keg_fee';
alter table public.breweries add column one_way_keg_fee_cents int not null default 0
  check (one_way_keg_fee_cents >= 0);
```

One fee for the brewery (Lolev: 1000). A one-way keg is a SKU whose format is
a keg (`formats.package_type = 'keg'`) with `container_source is null`
(`tests/one-way-keg.test.ts:41`; `one_way_material` is never written). At
ship, `ship_order_impl` adds one `one_way_keg_fee` invoice line per shipped
one-way keg line (qty = shipped qty, price = the brewery fee frozen then).
`create_credit_memo_impl` never credits it: it copies only `sku` and
`keg_deposit` lines (`20261012101000…:212`). `start_qbo_push` allows the new
kind and maps it to a new `qbo_connections.qbo_one_way_fee_item_id`, which
needs a mapping like the deposit item. Without a mapping the push is refused
with "map the one-way keg fee item".

## Schema — `20261016100400_historical_orders.sql`

```sql
alter type public.qbo_sync_status add value 'not_synced';
```

New RPC `record_historical_order(p_brewery, p_customer, p_ship_to,
p_picked_up_on date, p_lines jsonb, p_note text, p_request_id)`, admin only,
like `record_historical_batch` (`20261014100300_history_without_tanks.sql:73`):

- refused unless `books_opened_on` is set and `p_picked_up_on < books_opened_on`;
- writes an order (`status shipped`, `shipped_at` = the pickup day), its
  lines (`qty_shipped = qty_ordered`), a shipment, and an invoice issued that
  day with `sku` lines at the given unit prices, `paid_at` = the pickup day
  and `qbo_sync_status = 'not_synced'`;
- writes **no** `inventory_movements`, allocations, deposit lines, fee lines
  or keg events;
- each line is `{ skuId, qty, unitPriceCents }`. The caller supplies the price,
  the grid price frozen at import.

`start_qbo_push` refuses a `not_synced` invoice ("historical invoices are not
sent to QuickBooks"). Return and credit memo refuse a historical invoice
(no stock left with it to return). A paid `paid_at` with a null QBO balance
reads as **paid** (`lib/mgr/invoice-state.ts:12`), so history never shows as
owed or overdue in the staff or portal lists.

## What reads the changed things today

| Reader | Where | Effect of the change | Change? |
| --- | --- | --- | --- |
| `upsert_customer`, `upsert_ship_to` | `20260926000000…:33`, `00001_baseline.sql:3830` | must take alias/country, allow null state | **yes** |
| `import_csv_row` | `20261012100700…:86,89` | positional calls; trailing defaults keep it valid | no |
| `customers` / `ship_tos` zod | `lib/commands/customers.ts:19-56` | country, alias, state required only for US | **yes** |
| CSV `customers` / `ship_tos` fields | `lib/import-csv.ts:9-10` | country and alias optional columns | **yes** |
| Customer and ship-to views | `components/mgr/views/customer.tsx:68`, `ship-to.tsx:27` | country pick, alias field, US-only state | **yes** |
| `ship_order_impl` | `20261012110100…:198` | foreign ship-to: `dest_country`; fee lines | **yes** |
| `removal_shape` | `00001_baseline.sql:662` | one of state or country | **yes** |
| `destination_state_facts` | `20260928236000…:34` | skip `dest_country` rows | **yes** |
| `report_movements`, compliance totals | `20261014100100…`, `20261013100000…:28` | export already totals by treatment | no |
| `save_route_impl`, `list_routes` | `00001_baseline.sql:4481`, `lib/commands/delivery.ts:45` | exclude pickup | **yes** |
| `create_credit_memo_impl` | `20261012101000…:212` | copies `sku`/`keg_deposit` only; refuse historical | **yes** (refusal) |
| `start_qbo_push` | `20261015120000…:120` | fee kind + mapping; refuse `not_synced` | **yes** |
| `begin_qbo_invoice_sync` | `20261008190000…:39` | reads `pushed` only | no |
| invoice list/detail, portal invoices | `lib/mgr/invoices-view.ts:16`, `app/(portal)/portal/invoices/` | historical reads paid; fee line needs a label | **yes** (label) |
| `ensure_order_deposit_lines` | `20260923130000…:8` | deposits unchanged; one-way already has none | no |

## Tasks

Each task starts by writing its failing test, named in the task. DB tests run
on the `mgr_test` stack (`scripts/test-db.sh`). Every migration task ends with
`bun run migrations:lock`, adds new RPCs to `tests/rpc-allowlist.test.ts` and
`tests/rls-taproom.test.ts`, and runs `bash scripts/generate-db-types.sh`.

1. **Customer country and alias (schema + RPC).** `tests/customer-country-alias.test.ts`.
   - Test first:
     - a customer in `JP` with no state saves; a `US` one without a state is refused;
     - a `JP` ship-to with only a label and country saves;
     - the alias saves, clears on omit, and `''` is refused;
     - `import_csv_row` still creates a US customer (positional call).
   - Migration `20261016100000`; types `Customer`, `ShipTo` gain `alias: string | null`, `country: string`, nullable `state`.
   - Deps: none.
2. **Customer commands, CSV and search.** `tests/commands-customers.test.ts` (extend), `tests/import-csv.test.ts` (extend).
   - Test first: zod accepts `{ country: "CN" }` without `state`, refuses
     `{ country: "US" }` without `state`, refuses an unknown country code;
     `list_customers({ q })` matches the alias; CSV takes optional `country`
     and `alias`.
   - Add `COUNTRY_CODES` (ISO alpha-2) to `lib/mgr/enums.ts`; the `q` filter in
     the query (`name.ilike,alias.ilike`), as `list_brands` does
     (`lib/commands/catalog.ts:349`).
   - Then `bun run docs:api`.
   - Deps: 1.
3. **Customer screens.** Logic test `tests/customers-view.test.ts` (extend); render checked by eye.
   - Customer detail and ship-to form: an `E.pick` country (default United
     States), state shown only for US, an `Alias` `E.edit` ("Staff only"), as
     the brand view does (`components/mgr/views/brand.tsx:75`). The customer
     list shows `name · alias` (reuse `brandLabel`'s shape, `lib/mgr/brand-view.ts:13`).
   - Inventory and live share the views (`.agents/skills/screen-parity/SKILL.md`).
   - Staff guide: customers (country, optional address, alias).
   - Deps: 2.
4. **Export destination.** `tests/export-destination.test.ts`.
   - Test first:
     - an Export-channel order to a `JP` ship-to ships with `dest_country = 'JP'`, `dest_state` null;
     - a Wholesale (taxable) order to a `JP` ship-to is refused;
     - a US export (ship-to `PA`) ships with `dest_state = 'PA'` as today;
     - the compliance removals total counts the `JP` removal under export, and
       `stateTransactions` has no `Unassigned` row for it.
   - Existing `tests/compliance.test.ts`, `tests/destination-state-*.test.ts` stay green.
   - Migration `20261016100100`. Deps: 1.
5. **Pickup orders.** `tests/pickup-orders.test.ts`.
   - Test first: `create_order({ pickup: true })` saves it; its shipment is not
     in `list_routes`' unrouted list; `save_route` with it is refused; a
     non-pickup shipment still routes.
   - Migration `20261016100200`; zod `pickup: z.boolean().optional()` on
     `create_order` and `update_draft_order`; `E.sw` "Pickup" on New order and
     Order draft; order detail says "Pickup". Staff guide: orders and routes.
   - Then `bun run docs:api`. Deps: none.
6. **One-way keg fee.** `tests/one-way-keg-fee.test.ts`.
   - Test first:
     - with `one_way_keg_fee_cents = 1000`, shipping 3 one-way sixtels adds a
       `one_way_keg_fee` line, qty 3, $10.00, and no deposit line;
     - a returnable sixtel line gets its deposit and no fee;
     - a full return credits the beer and leaves the fee uncredited;
     - fee 0 adds no line;
     - `start_qbo_push` with the fee line and no fee mapping is refused with the message.
   - Migration `20261016100300`; a settings field "One-way keg fee"
     (`set_one_way_keg_fee`, admin); the QuickBooks mapping row; invoice
     views label the line "One-way keg fee". Staff guide: kegs, invoices,
     accounting mappings. Portal guide: invoices (the fee line is not refunded).
   - Existing `tests/keg-deposit*.test.ts`, `tests/one-way-keg.test.ts`,
     `tests/qbo-push.test.ts` stay green. Then `bun run docs:api`.
   - Deps: none.
7. **Historical orders.** `tests/historical-orders.test.ts`.
   - Test first:
     - writes a shipped order, lines, shipment and paid invoice, with **zero**
       `inventory_movements`, allocations, deposit and fee lines;
     - the invoice is `not_synced` and `start_qbo_push` refuses it;
     - it reads paid in `toInvoiceListRow` (no overdue);
     - refused: no books date, on/after `books_opened_on`, a ship-to of another
       customer, a SKU of another brewery, `qty <= 0`, a non-admin;
     - `return_shipment` and `create_credit_memo` refuse its invoice;
     - a replay returns the first result.
   - Migration `20261016100400`; command `record_historical_order` (admin,
     `lib/commands/orders.ts`). Staff guide: history (orders before the books
     opened: invoiced, paid, not in QuickBooks, no stock). Then `bun run docs:api`.
   - Deps: 4 and 6, for migration order only (all three replace
     `ship_order_impl` or `create_credit_memo_impl`; each must copy the latest).
8. **Docs and schema design.** `tests/docs.test.ts`, `tests/api-docs.test.ts`.
   - Schema design: `customers.alias`, `customers.country`, `ship_tos.country`,
     `inventory_movements.dest_country`, `orders.pickup`,
     `breweries.one_way_keg_fee_cents`, the two enum values.
   - Brewing domain: an export removal names a country.
   - Deps: 1–7.

Then the full proof (`bun run test && bunx tsc --noEmit && bun run lint`), a
look at the changed screens (`browse`), `/simplify`, and the PR.

Parallelism: {1, 5} → {2, 4} → {3, 6} → 7 → 8. Tasks 4, 6 and 7 each replace
`ship_order_impl` or `create_credit_memo_impl`, so they run one after another,
each copying the previous migration's version.

## Import (local only, git-ignored; after merge)

A new `--orders` pass in `scripts/import-lolev.ts`, with the mapping in
`lib/import/lolev.ts`, through `runCommand` as the other passes do:

1. **Setup.** `set_books_opened_on` 2026-10-15 (refused if a period before it
   is filed). The `$30` deposit on Lolev kegs (`upsert_keg_pool`). The `$10`
   one-way fee. The one-way sixtel format and shell material. The Export
   cells (Wholesale sixtel and case per tier) and the one-way sixtel cells
   (= the returnable sixtel cell, per channel and tier).
2. **Beers.** Rename `Luminis Brassarie Collab` → `Luminis`, alias
   `Brasserie DB Collab`. Create the 16 new brands on the tier the sheet's
   `price tier` column gives. The sheet-name → brand map is a table in
   `lib/import/lolev.ts`, reviewed by the user.
3. **Customers.** The 16 above, with country, state, alias, channel; one
   ship-to each, label `Main`, country and state only (no street) unless
   known.
4. **SKUs.** For each brand × format a line needs: `create_sku` with defaults
   (Half and Sixtel on Lolev kegs; one-way Sixtel and Case with no pool).
5. **History.** One `record_historical_order` per block picked up before
   2026-10-15, lines at the grid price for the customer's channel, the
   brand's price group and the format. The 13 pre-2-12-25 tabs are one
   Sarene order each (east and west summed). Majestic's one order comes from
   the Lolev dump.
6. **Live.** One `create_order` (pickup, submitted) per block on or after
   2026-10-15. Placeholder beers have SKUs but no stock, so ATP warns; the
   orders do not confirm until the beer is packaged.
7. **Reported, not imported:** `In House` and `Customer TOTALS` blocks, empty
   blocks, any line with no price cell (for example an Export half), the
   `Check Invo` cell.

## Appendix: beer names decided by the user (2026-10-15)

The import matches a sheet name to a brand by name or alias first, then by
name plus series number. "Amphibian" in the sheet is MGR's "Dart Frog" series,
and "Rock/Mineral" is "Mineral". Misspellings are corrected to MGR's
spelling. These were mapped by hand:

| Sheet name | MGR brand |
| --- | --- |
| DDH Taupo | DDH Taupō |
| Taupo II, Taupo III | Taupō II |
| Double Lupula Eggers | Double Lupula |
| Double Priam | Double Priam UHA |
| Origen III - Ultra Hopped Ale | Origen III |
| Rubico III - Ultra Hopped Ale | Rubico III |
| Tides III | Tides II |
| Blue Axureus Amphibian #1 | Blue Azureus |
| Amphibian #4 | Mint Golden |
| Amphibian #5 | Dart Frog #5 |
| Saphire (changed from Opal) | Sapphire |
| Bluejay | Blue Jay |
| Luminis Braserie Collab | Luminis (renamed; alias Brasserie DB Collab) |
| Wet Hop West Coast IPA | Mosaic WC IPA Fresh Hop |
| Pumpkin Stout | Sever |
| Zues | Zeus |
| Hudson Edo | Edo |
| Sonnen ll | Sonnen II |
| Bad Bones TBD Double or Tripple UHA | Bonebreaker |
| Vindobana | Vindobona (new brand) |

New brands: DDH Lupula, DDH Rubico, Vindobona, and placeholders under the
sheet's names, for the user to rename once brewed: Amphibian #6, Amphibian #7,
Animal #31 to #34, Reptile #6, Mineral #7, Mineral #8, TBD UHA, TBD Triple
UHA, BDB x Bad Bones x Offscript (an unnamed pale ale), and ONE DROP COLLAB
Sour.

## Open questions (defaults chosen; say if wrong)

- **Historical invoices read paid.** Default: `paid_at` = pickup day, so none
  shows as owed or overdue. The alternative is unpaid, which would flag 261
  overdue invoices to staff and buyers.
- **Price on a historical line.** Default: today's grid price for the
  customer's channel and the brand's tier. The sheet has no prices, and the
  Lolev dump's are all $0.
- **One brewery-wide one-way fee.** Default: a single setting, $10. A fee per
  format or channel is not needed while the sixtel is the only one-way keg.
- **Historical orders' deposits and fees.** Default: none recorded. Those kegs
  are already settled outside MGR; recording deposits would put $30 per keg
  on each customer's keg balance.
- **Live orders' state.** Default: submitted, not confirmed, so staff confirm
  each week as they do today.
- **Country list.** Default: the full ISO alpha-2 list, shown by name ("Japan"),
  stored as the code.
- **Unverified (user, "I think"):** all seven international customers are
  untaxpaid exports. Check against export paperwork before the first live
  export order ships; history is unaffected either way.

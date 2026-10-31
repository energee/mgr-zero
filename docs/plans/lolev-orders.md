# Historical orders: customers, export, pickups, one-way kegs

Status: plan, awaiting approval. Branch `docs/lolev-orders-plan` for the plan;
implementation on `feat/lolev-orders`, PR to `main`.

## Why

Import customer orders from a private spreadsheet export rather than assuming
the legacy application's order collection is complete.
Keep source workbooks, price files and tenant-specific mappings outside the
public repository. The local import runner already supports price loading.

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
- Import only customers with orders.
- Treat each distributor's regional blocks as one customer where appropriate.
- Keep one customer per company, without spreadsheet country or color suffixes.
- Each customer has one optional staff-only **alias**, like `brands.alias`.
  A fictional example is Cedar Trading = "Evergreen Beer".
- Every customer has a **country**. A US customer also has a state. Street,
  city and zip are optional until known.

Export:
- International customers use the built-in `Export` channel
  (`tax_treatment = 'export'`, `00001_baseline.sql:588`).
- Export prices are configured independently for each supported format.
  Leave an unsupported format's price empty so it cannot be ordered.

Kegs:
- The only one-way keg is the sixtel. It is a format of its own (staff guide,
  one-way kegs; `tests/one-way-keg.test.ts`), priced in its own cells, today
  equal to the returnable sixtel on each channel.
- Each one-way keg shipment carries the configured non-refundable fee.
  The fee follows the format, not the channel.
- A returnable SKU keeps its configured keg pool.
  A customer using another pool needs the corresponding SKU.
  Tenant fee amounts, deposits and lessor assignments stay in private import
  configuration, not this plan.
- In history, export sixtels were one-way and domestic sixtels returnable.

Orders:
- An order has a **pickup** flag. A pickup order is never routed. It still
  names a destination, for TTB.
- **One order per customer per pickup date** (user, 2026-10-15). Every block a
  customer picks up that day merges into it, and lines of the same brand and
  format add up. A block with no pickup date takes its tab's can date.
- Where a source contains regional blocks plus a combined total, verify the
  reconciliation and import the combined total only.
- Some tabs have no `price tier` column, which shifts the quantity columns
  left. The export reads each block's columns by header name.
- Orders picked up before `books_opened_on` are **historical**: an order and
  an invoice at the configured grid price, with no stock, no finished goods,
  no TTB month, and never pushed to QuickBooks.
  Orders on or after that date are live.
- Every order line gets a SKU. A missing brand × format SKU is created with
  `create_sku`'s defaults.

Map spreadsheet beer names to brands using names and aliases.
Keep the tenant's actual mapping, roster, destinations, prices, source dates
and aggregate volumes in private operator files.

## Source shape

The import accepts weekly tabs with either a combined regional grid or
customer blocks headed `can date | pickup date | customer | type | price tier |
half | sixtel | case`.
Internal totals are not orders.
Resolve columns by header name because optional columns can shift quantities.
Report ambiguous date cells rather than silently inventing a pickup date.


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
text default 'US'`, as `upsert_brand` did.

`import_csv_row` (`20261012100700_import_resolve_names.sql:53-90`) is replaced
too. It refuses any field outside a fixed list, and requires `state` for both
kinds. The new version allows `country` and `alias` on customers and
`country` on ship-tos. It requires `state` only when the country is `US`
(the default), and passes `v_row->>'alias'` and `coalesce(v_row->>'country',
'US')` to the two upserts.

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
ship outside the US"). The removals total already files them under `export`
(`20261013100000_file_cellar_taproom_removals.sql:28`).

`private.destination_state_facts`
(`20260928236000_destination_state_facts_on_ledger.sql:54-78`) has two branches:

- **Movements:** an outgoing removal with a null `dest_state` is already
  dropped (line 63). But a `return_in` or `adjustment` row is kept whatever
  its state, and takes `coalesce(m.dest_state, original.dest_state,
  'Unassigned')` (lines 59-63). Its writers (`create_credit_memo_impl`, the
  refused check-in) point at the original removal and set no state. So a
  return, credit or refusal on an export shipment would read `Unassigned`.
  The fix also leaves out `return_in` and `adjustment` rows whose original
  removal carries a `dest_country`.
- **Invoice lines:** each `sku` line takes its state from `shipped_state`
  (line 54), which ignores nulls. So an export line gets no state and becomes
  `Unassigned`, which raises the compliance warning. The fix leaves out
  invoice lines whose shipment's removals carry a `dest_country`.
  `shipped_state` also returns a `has_country` flag, and the branch filters
  on it.

Historical invoices never reach this function. It reads invoices `issued_on`
inside the period (line 78), and no period may start before `books_opened_on`
(`private.assert_period_after_books_opened`, `20261014100100…:38`).

## Schema — `20261016100200_pickup_orders.sql`

```sql
alter table public.orders add column pickup boolean not null default false;
```

`create_order`, `update_draft_order` and the portal path take `p_pickup
boolean default false`. `save_route_impl` refuses a pickup order's shipment,
and `list_routes` leaves pickup shipments out of the unrouted list, in the
query (AGENTS.md negative 12).

A pickup order is invoiced when it ships. `ship_order_impl` refuses
`invoiceTiming: "on_delivery"` for it ("a pickup order is invoiced when it
ships"). Without this, nothing could ever invoice it: only
`confirm_delivery` invoices an on-delivery shipment, and that needs a route
delivery, which a pickup cannot have
(`20261012120300_leave_delivery_for_later.sql:39-50`). This migration is
the first of this plan to replace `ship_order_impl`. Tasks 4, 6 and 7 copy
from it.

## Schema — `20261016100300_one_way_keg_fee.sql`

```sql
alter type public.invoice_line_kind add value 'one_way_keg_fee';
alter table public.breweries add column one_way_keg_fee_cents int not null default 0
  check (one_way_keg_fee_cents >= 0);
alter table public.order_lines add column one_way_fee_cents int
  check (one_way_fee_cents is null or one_way_fee_cents > 0);
```

One fee is configured for the brewery. A one-way keg is a SKU whose format is
a keg (`formats.package_type = 'keg'`) with `container_source is null`
(`tests/one-way-keg.test.ts:41`; `one_way_material` is never written).

An invoice is written in one of two places, and both add the fee line:

- **`ship_order_impl`** when `invoice_timing = 'now'`. Quantity is the shipped
  quantity.
- **`confirm_delivery`** when `invoice_timing = 'on_delivery'`
  (`20261012120300_leave_delivery_for_later.sql:78-88`). Quantity is shipped
  minus refused, as for the `sku` and deposit lines there.

The fee is frozen when the order is shipped. `order_lines` gains
`one_way_fee_cents int`, set at ship to the brewery fee for one-way keg lines
when that fee is > 0, and null otherwise. Both invoice writers read it, so a
fee changed between ship and delivery does not change the invoice.
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
- writes an order (`status shipped`, `pickup = true`, `shipped_at` = the
  pickup day), its lines (`qty_shipped = qty_ordered`), a shipment, and an
  invoice issued that
  day with `sku` lines at the given unit prices, `paid_at` = the pickup day
  and `qbo_sync_status = 'not_synced'`;
- writes **no** `inventory_movements`, allocations, deposit lines, fee lines
  or keg events;
- each line is `{ skuId, qty, unitPriceCents }`. The caller supplies the price,
  the grid price frozen at import.

`start_qbo_push` refuses a `not_synced` invoice ("historical invoices are not
sent to QuickBooks"). Mark a historical pickup explicitly so the routes screen
does not list its shipment as unrouted (`lib/commands/delivery.ts:57-60`).

The staff presentation must name the new status, or it falls through to
"pushed to QuickBooks" (`lib/mgr/qbo-ui.ts:95`). `qboInvoicePresentation`
returns "not in QuickBooks (before the books opened)" with no actions for
`not_synced`. The `syncStatus` unions in `lib/mgr/qbo-ui.ts`,
`lib/mgr/invoices-view.ts` and `app/(app)/invoices/[id]/page.tsx` gain
`"not_synced"`. Return and credit memo refuse a historical invoice
(no stock left with it to return). A paid `paid_at` with a null QBO balance
reads as **paid** (`lib/mgr/invoice-state.ts:12`), so history never shows as
owed or overdue in the staff or portal lists.

## What reads the changed things today

| Reader | Where | Effect of the change | Change? |
| --- | --- | --- | --- |
| `upsert_customer`, `upsert_ship_to` | `20260926000000…:33`, `00001_baseline.sql:3830` | must take alias/country, allow null state | **yes** |
| `import_csv_row` | `20261012100700…:53-90` | fixed field allowlist refuses `country`/`alias`; `state` always required; positional upsert calls | **yes**: allow `country`, `alias`; `state` required only for US; pass both to the upserts |
| `customers` / `ship_tos` zod | `lib/commands/customers.ts:19-56` | country, alias, state required only for US | **yes** |
| CSV `customers` / `ship_tos` fields | `lib/import-csv.ts:9-10` | country and alias optional columns | **yes** |
| Customer and ship-to views | `components/mgr/views/customer.tsx:68`, `ship-to.tsx:27` | country pick, alias field, US-only state | **yes** |
| `ship_order_impl` | `20261012110100…:198` | foreign ship-to: `dest_country`; fee lines | **yes** |
| `removal_shape` | `00001_baseline.sql:662` | one of state or country | **yes** |
| `destination_state_facts` (invoice-line branch) | `20260928236000…:54-78` | export lines read `Unassigned` | **yes**: leave out lines whose removals carry `dest_country` |
| `confirm_delivery` (on-delivery invoice) | `20261012120300_leave_delivery_for_later.sql:78-88` | copies only `sku` and `keg_deposit` | **yes**: add the fee line, shipped − refused |
| `qboInvoicePresentation`, `syncStatus` unions | `lib/mgr/qbo-ui.ts:95`, `lib/mgr/invoices-view.ts:8`, `app/(app)/invoices/[id]/page.tsx` | `not_synced` falls through to "pushed to QuickBooks" | **yes** |
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
     - `import_csv_row` still creates a US customer with no `country` column;
     - `import_csv_row` creates a `JP` customer with `country`, `alias` and no
       `state`, and refuses a `US` row with no `state`;
     - the QuickBooks customer push sends the country and no state for a
       `JP` customer (find the push with `grep -rn bill_state lib/qbo*.ts`
       first; v1 sent `Country`, `sync-utils.ts:220-227`).
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
     - the compliance removals total counts the `JP` removal under export;
     - a credit memo returning part of the `JP` shipment adds no `Unassigned`
       row either;
     - `stateTransactions` has no `Unassigned` row, from either the movement
       or the invoice line of the `JP` shipment, and the report has no
       unassigned warning.
   - Existing `tests/compliance.test.ts`, `tests/destination-state-*.test.ts` stay green.
   - Migration `20261016100100`. Deps: 1.
5. **Pickup orders.** `tests/pickup-orders.test.ts`.
   - Test first: `create_order({ pickup: true })` saves it; its shipment is not
     in `list_routes`' unrouted list; `save_route` with it is refused; a
     non-pickup shipment still routes; shipping it with `invoiceTiming:
     "on_delivery"` is refused, and with `"now"` it ships and invoices.
   - Migration `20261016100200`; zod `pickup: z.boolean().optional()` on
     `create_order` and `update_draft_order`; `E.sw` "Pickup" on New order and
     Order draft; order detail says "Pickup". Staff guide: orders and routes.
   - Then `bun run docs:api`. Deps: none.
6. **One-way keg fee.** `tests/one-way-keg-fee.test.ts`.
   - Test first:
     - with `one_way_keg_fee_cents = 1000`, shipping 3 one-way sixtels adds a
       `one_way_keg_fee` line, qty 3, $10.00, and no deposit line;
     - with `invoiceTiming: "on_delivery"`, 3 shipped and 1 refused gives a
       fee line of qty 2 on the invoice `confirm_delivery` writes;
     - the fee changed to $12 between ship and delivery still invoices $10;
     - a returnable sixtel line gets its deposit and no fee;
     - a full return credits the beer and leaves the fee uncredited;
     - fee 0 adds no line;
     - `start_qbo_push` with the fee line and no fee mapping is refused with the message.
   - Migration `20261016100300` replaces `ship_order_impl` (copied from task 4's
     migration) and `confirm_delivery` (copied from
     `20261012120300_leave_delivery_for_later.sql`); a settings field "One-way keg fee"
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
     - it reads paid in `toInvoiceListRow` (no overdue), and its QuickBooks
       detail reads "not in QuickBooks", not "pushed to QuickBooks", with
       QuickBooks connected;
     - the order is a pickup, and its shipment is not in `list_routes`'
       unrouted list;
     - refused: no books date, on/after `books_opened_on`, a ship-to of another
       customer, a SKU of another brewery, `qty <= 0`, a non-admin;
     - `return_shipment` and `create_credit_memo` refuse its invoice;
     - no notification row (order, invoice, chat) is written;
     - a replay returns the first result.
   - Migration `20261016100400`; command `record_historical_order` (admin,
     `lib/commands/orders.ts`). Staff guide: history (orders before the books
     opened: invoiced, paid, not in QuickBooks, no stock). Then `bun run docs:api`.
   - Also `qboInvoicePresentation` and the three `syncStatus` unions
     (`lib/mgr/qbo-ui.ts`, `lib/mgr/invoices-view.ts`,
     `app/(app)/invoices/[id]/page.tsx`); a pure test in
     `tests/qbo-sync-status.test.ts` (extend) for the `not_synced` text.
   - Deps: 4 and 6, for migration order only (all three replace
     `ship_order_impl` or `create_credit_memo_impl`; each must copy the latest).
     Also 5: it writes `orders.pickup`.
8. **Docs and schema design.** `tests/docs.test.ts`, `tests/api-docs.test.ts`.
   - Schema design: `customers.alias`, `customers.country`, `ship_tos.country`,
     `inventory_movements.dest_country`, `orders.pickup`,
     `breweries.one_way_keg_fee_cents`, the two enum values.
   - Brewing domain: an export removal names a country.
   - Deps: 1–7.

Then the full proof (`bun run test && bunx tsc --noEmit && bun run lint`), a
look at the changed screens (`browse`), `/simplify`, and the PR.

Parallelism: {1, 5} → {2, 4} → {3, 6} → 7 → 8. Tasks 5, 4, 6 and 7 each
replace `ship_order_impl` (and 6 and 7 `create_credit_memo_impl`), so they
run in that order, each copying the previous migration's version. Tasks 1
and 5 both regenerate `lib/supabase/database.ts` and the migration lock, so
they also run one after the other.

## Import (local only, git-ignored; after merge)

A new `--orders` pass in `scripts/import-lolev.ts`, with the mapping in
`lib/import/lolev.ts`, through `runCommand` as the other passes do:

1. **Setup.** Set the approved `books_opened_on`, deposits, non-refundable
   fee, formats and channel prices from private configuration.
   Refuse a books date that would exclude an already filed period.
2. **Beers.** Apply the owner-reviewed private name/alias mapping and create
   unmatched approved brands at their source price group.
3. **Customers.** Import country, state, alias and channel for each approved
   customer. Add a ship-to with known address fields only.
4. **SKUs.** Create each required brand × format with its approved keg pool.
   Do not overwrite the pool of an existing SKU.
5. **History.** Use `record_historical_order` before `books_opened_on`.
   Consolidate verified regional totals without importing them twice.
6. **Live.** Use `create_order` on or after `books_opened_on`.
   Leave orders submitted until staff confirm available stock.
7. **Reported, not imported:** `In House` and `Customer TOTALS` blocks, empty
   blocks, any line with no price cell (for example an Export half), the
   `Check Invo` cell.

Import safety, from v1's import of the same workbook
(`~/Repos/mgr/scripts/migration/reconcile_beer_orders.py`):

- **Deterministic request ids.** Each order's request id is derived from
  (customer, pickup day), so a rerun replays instead of duplicating
  (v1: `XLSX-<date>-<slug>`, `:577`).
- **Dry run by default.** The pass prints what it would write. `--apply`
  writes.
- **Fail closed.** An unmapped customer or beer name stops the pass. It is not
  skipped (v1 README: "unresolved workbook names fail closed").
- **Refuse bad blocks.** Two blocks for one customer and day stop the pass
  (v1 `:456-461`), as does a block with mixed pickup dates (v1 `:331`).

## v1 cross-check (2026-10-15)

v1 imported this workbook too. Nothing conflicts with a v1 decision. The
findings:

- **Historical orders.** Fulfilling old orders through the live workflow
  would fabricate inventory transactions.
  Keep their customer-visible sale history without writing stock movements.
- **Notification noise.** Cancelling those orders sent one high-priority
  broadcast per order to every user (`PROGRESS.md:401`).
  `record_historical_order` sends no order, invoice or chat notification.
  Task 7 tests that no notification row is written.
- **Customer names.** Keep the company name and move destination suffixes to
  country and state. Preserve a staff-only alias where the source uses a
  different trading name.
- **Keg pools.** Reconcile imported pool assignments with the owner rather
  than inheriting a legacy default.
- **QuickBooks customer push.** v1 sends `Country` with the address
  (`src/integrations/quickbooks/sync-utils.ts:220-227`). v2's customer
  push must send the country and allow no state. Task 1 tests it.

## Brand mapping

Match a sheet name to a brand by name or alias first, then by series number.
Have the owner resolve misspellings, renamed brands and unmatched rows.
Keep that mapping outside the public repository.


## Open questions (defaults chosen; say if wrong)

- **Historical invoices read paid.** Default: `paid_at` = pickup day, so
  historical imports do not create artificial overdue balances.
- **Price on a historical line.** Default: the configured grid price for the
  customer's channel and brand tier; reconcile privately if the source lacks prices.
- **One brewery-wide one-way fee.** Default: a single configurable setting.
  No per-channel or per-format fee model is needed for this import.
- **Historical orders' deposits and fees.** Default: none recorded when
  already settled outside MGR; importing them would create artificial balances.
- **Live orders' state.** Default: submitted, not confirmed, so staff confirm
  each week as they do today.
- **Country list.** Default: the full ISO alpha-2 list, shown by name ("Japan"),
  stored as the code.
- **Export classification.** Verify each international customer's treatment
  against export paperwork before the first live export shipment.
  Historical imports remain outside filed periods.

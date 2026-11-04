# Data rows like Today

Status: approved, waiting for the Today/density PR to merge.
Branch: `docs/rows-like-today` (this plan only); each task below gets its own branch from `main`.

## Goal

The owner asked for every data row in the app to look and work like Today's.

## The Today pattern

Today's rows are a table (`TodayTable` in `components/mgr/views/today.tsx`, on `ux/density-and-reach`, commit `f1def2d0c` and later). Each row draws, in this order:

- the kind icon, with its warning dot on the corner (`RowMedia` in `components/mgr/e.tsx`);
- the item, which opens the order sheet when the row is an order;
- Customer, State, Ships and Amount columns, each drawn only when some row fills it;
- State as a badge, and Overdue as a second badge beside it, not as words in the detail;
- the detail, cut short with an ellipsis instead of wrapping;
- the verb, at the trailing edge.

The desk heads the columns. A phone shares one truncating line for everything before the verb. The rows are dense (`[&_td]:py-1 [&_th]:h-8`) and keep their query's order.

Most of the work is in the view model, not the component. Today split one joined `detail` string into `customer`, `state` (from `TODAY_STATE`), `overdue`, `ships` and `amount`. Every list below needs the same split.

## Decisions

These were approved by the owner on 2026-11-04.

1. **Phone rows.** A queue keeps Today's one truncating line, because its reader comes to act and the item, state and verb stay visible. A register keeps two lines (density plan task 4), because its reader comes to compare facts, and a phone has no hover to show text an ellipsis hid.
2. **Two components, one look.** The queue table has a fixed order and leads with its verb. `RecordTable` sorts and leads with its facts. Folding them together would need switches for sort, phone layout and verb placement. Both tables share the dense row classes and the State/Overdue badge cell, so the look cannot drift.
3. **This plan ships alone.** The conversions start after the Today/density PR merges, because `TodayTable` exists only on that branch.

## Where the rows are

### Group A: queues with Today's row shape

These are `E.row` lists of a title, a joined detail, a verb and a warning. They move onto the queue table.

| Screen | The joined `detail` now | Columns after the split |
| --- | --- | --- |
| Work | mostly `get_today` rows (`lib/commands/landings.ts`), plus POs and routes | as Today; POs add Due, routes add Stops and Date |
| Transfers | `from to · n lines · status` | From → To, Lines, State |
| Purchase orders | status · due | Vendor, State, Due |
| Routes, Return route | stops · date · awaiting check-in | Stops, Date, State |
| Portal orders | `status · total` | State, Amount |
| Licenses | number · expires · "expired" | Number, Expires, Expired badge |
| SKU list | volume · active · barcode · no keg pool | Volume, Active badge, Barcode, warning dot |
| Locations, Location bins | location facts | their facts |
| Water profiles, Package BOM, Sale channels | short facts | their facts |
| Planning (one table per vendor group), Replenishment reviews | material, shortfall, quantity | Shortfall, Quantity |
| Keg history | event · pool · customer | Event, Pool, Customer |
| POS sales and menu items, QBO mapping | sale or mapping facts | their facts, State badge |
| Brand price rows, Team members | price or role facts | their facts |

Contracts is not a queue: its facts are four quantities to compare. It moves to `RecordTable` instead (task 15).

### Group B: the RecordTable registers

These are Orders, Invoices, Batches, Catalog, Formats, Finished goods, Materials, Packaging runs, Recipes, Vendors, Replenishment and Monthly compliance. They are tables on the desk already. One change to `components/mgr/views/record-table.tsx` gives all of them the shared look (task 16).

### Group C: line items inside a record

Pick, Pick sheet, Receive PO, Confirm and Review order, Shop, New and Edit order, Ship, Short pick, Put back, the return, transfer and count screens, Invoice and Order lines, and Brew prep pulls. Many hold quantity inputs, so a table does not fit. Density plan tasks 8 and 9 cover them.

A later phase may turn these read-only lists into tables: Keg fleet bins, Keg report, inventory on-hand and movements, Lot trace, vessel readings, beer stock, vendor materials, transfer lines and portal order lines. This plan does not task them.

### Group D: not data rows

These stay as `E.row`:

- settings switches (Accounting, Chat, POS connection, COLA selects, Ship-to default, Reporting basis);
- checklists (First run, the Monthly compliance steps);
- identity rows (Me, Account invitations, Session expired);
- single facts (Portal invoice status, Ships from, Recipe note);
- the Settings and More menus.

## Tasks

Each task begins by writing its named test and watching it fail. The proof for each task is the AGENTS.md screen-only proof (`bunx tsc --noEmit && bun run lint` and the eight screen suites), plus phone and desk screenshots of the touched frames. Each task updates the staff or portal guide section for its screen and its spec in `components/mgr/screens.tsx`.

| # | Task | Files | Types | Test (written first, red) | Acceptance | Deps | Parallel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Move `TodayTable` out of Today as the queue table. Export its dense row classes and an `E.state(state, overdue)` badge cell, so `RecordTable` can share them. Today draws through it unchanged. | `components/mgr/views/queue-table.tsx` (new), `views/today.tsx`, `components/mgr/e.tsx` | `QueueRow` (`TodayRowView`'s display fields, without `dueAt`) | `tests/today-view.test.ts` still passes; `tests/mgr-screens.test.ts`: the Today frames render one `<table>` | tsc; Today screenshots match before and after | Today/density PR merged | none |
| 2 | **Work** draws through the queue table. Its `get_today` rows get `customer`, `state`, `overdue` and `ships` the way Today's do, reusing the `today-view.ts` helpers. PO rows get Due, and route rows get Stops and Date. | `views/work.tsx`, `lib/mgr/work-view.ts`, `lib/commands/landings.ts` | `WorkRowView` extends `QueueRow` | `tests/work-ux.test.ts`: a pick row has State "Pick due" and no state words left in its detail | tsc; Work fits ≥8 rows on a phone | 1 | none |
| 3 | **Transfers** | `lib/mgr/transfers-view.ts`, `views/transfers.tsx` | `TransferRowView` adds `route`, `lines`, `state` | `tests/transfers-view.test.ts`: the detail no longer holds the status | tsc; screenshots | 1 | yes |
| 4 | **Purchase orders**: a past expected day draws the Overdue badge. | `lib/mgr/purchase-orders-view.ts`, `views/purchase-orders.tsx` | adds `vendor`, `state`, `due`, `overdue` | new `tests/purchase-orders-view.test.ts` | tsc; screenshots | 1 | yes |
| 5 | **Routes** and **Return route** | `lib/mgr/routes-view.ts`, `lib/mgr/return-route-view.ts`, `views/routes.tsx`, `views/return-route.tsx` | adds `stops`, `date`, `state` | new `tests/routes-view.test.ts` | tsc; screenshots | 1 | yes |
| 6 | **Portal orders** | `lib/mgr/portal-orders-view.ts`, `views/portal-orders.tsx` | adds `state`, `amount` | `tests/portal-orders-view.test.ts`: the detail no longer holds the total | tsc; portal screenshots | 1 | yes |
| 7 | **Licenses**: an expired license draws the Expired badge. | `lib/mgr/licenses-view.ts`, `views/licenses.tsx` | adds `number`, `expires`, `state` | new `tests/licenses-view.test.ts` | tsc; screenshots | 1 | yes |
| 8 | **SKU list** | `lib/mgr/sku-list-view.ts`, `views/sku-list.tsx` | adds `volume`, `state`, `barcode` | new `tests/sku-list-view.test.ts` | tsc; screenshots | 1 | yes |
| 9 | **Locations** and **Location bins** | `lib/mgr/locations-view.ts`, `views/locations.tsx`, `views/location-bins.tsx` | their facts as fields | `tests/locations-view.test.ts` | tsc; screenshots | 1 | yes |
| 10 | **Water profiles**, **Package BOM** and **Sale channels** | their `views/*.tsx` and `lib/mgr/*-view.ts` | their facts as fields | `tests/water-profiles-view.test.ts`, `tests/sale-channels.test.ts` | tsc; screenshots | 1 | yes |
| 11 | **Planning** (one table per vendor group) and **Replenishment** reviews | `lib/mgr/planning-view.ts`, `views/planning.tsx`, `views/replenishment.tsx` | `PlanningRowView` adds `shortfall` | `tests/planning-view.test.ts`, `tests/replenishment-view.test.ts` | tsc; screenshots | 1 | yes |
| 12 | **Keg history** | `lib/mgr/keg-history-view.ts`, `views/keg-history.tsx` | adds `event`, `pool`, `customer` | new `tests/keg-history-view.test.ts` | tsc; screenshots | 1 | yes |
| 13 | **POS** sales and menu items, and **QBO mapping** | `views/pos.tsx`, `views/qbo-mapping.tsx` and their view files | their facts as fields, `state` | `tests/pos-ui.test.ts`, `tests/qbo-mapping-view.test.ts` | tsc; screenshots | 1 | yes |
| 14 | **Brand** price rows and **Team** members | `views/brand.tsx`, `views/team.tsx` and their view files | their facts as fields | `tests/brand-sells-view.test.ts`, `tests/team-view.test.ts` | tsc; screenshots | 1 | yes |
| 15 | **Contracts** moves to `RecordTable`, with Committed, Received, On order and Available as numeric columns. | `lib/mgr/contracts-view.ts`, `views/contracts.tsx` | `ContractRowView` adds the four quantities | new `tests/contracts-view.test.ts` | tsc; screenshots | 16 | after 16 |
| 16 | **RecordTable** takes the shared look: the dense row classes, `E.state` in place of the Overdue fragments (Batches, Invoices, Packaging runs), and a status dot. This lands with density plan task 4, which sets the two-line phone row. | `views/record-table.tsx`, `views/batches.tsx`, `views/invoices.tsx`, `views/packaging-runs.tsx` | `RecordTableRow` unchanged | `tests/record-table.test.ts`: an overdue cell renders its badge through `E.state`; the rows carry the dense classes | tsc; Orders fits ≥7 records on a phone | 1, density task 4 | yes |

## Parallelism

- Task 1 comes first. It needs the Today/density PR on `main`.
- Task 2 follows task 1, because Work proves the queue table works for a second caller.
- Tasks 3–14 and 16 touch disjoint files, so they run in parallel after task 1.
- Task 15 waits for task 16.

## No schema change

No task changes a table, RPC or command result. Each split is made in the view model from facts the query already returns. If a task finds a fact missing from its query, it stops and asks before adding it.

## Out of scope

- Group C line items, which the density plan covers, and its read-only lists, which are a later phase.
- Group D rows.
- Sorting the queue table: queues keep their query's order.

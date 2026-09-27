# Failed and partial delivery — design (#618)

Decided 2026-09-27. It implements the agreed decisions D2, D17 and
D18 and the adopted defaults in `2026-09-27-v1-completeness-audit.md`: a stop
records an honest outcome, invoice-on-delivery bills only accepted quantities,
refused quantities close on the order, and stock comes back only through a
recorded physical check-in. The source of truth for the screens stays
`components/mgr/screens.tsx`. This supersedes the "every stop delivered before
return" rule in `plans/2026-09-07-backend-program-8-delivery-routes.md`.

## Today (main at aeab9349)

- `ship_order` posts a `sale_removal` per source bin and lot at ship time. The row carries
  taxable treatment and `dest_state`, whatever the invoice timing. A shipment with
  timing `on_delivery` has no invoice yet.
- `confirm_delivery` stamps `deliveries.delivered_at`. For `on_delivery` it
  invoices `qty_shipped × order_lines.unit_price_cents`, plus keg deposits.
  There is no parameter for accepted quantities.
- A stop's only state is `delivered_at`. A departed route cannot be edited. A
  shipment can sit on only one route (`deliveries.shipment_id` is unique).
  `return_route` requires every stop delivered.
- `return_shipment` / `create_credit_memo_impl` need an invoice and admin or
  sales. A never-confirmed on-delivery shipment has no invoice, so it cannot be
  returned at all.
- Dead end: a refused on-delivery stop can only close by being falsely
  confirmed, which invoices the full quantity. `tests/delivery.test.ts:187`
  pins the current "leave it open" state. The staff guide (:488) and the
  Route screen spec (:2256) promise a re-route that the code refuses.

## Design

### 1. A stop records an outcome, not just a timestamp

- `deliveries.outcome text check (outcome in ('delivered','partial','refused'))`,
  null until the stop closes. Existing delivered rows are backfilled
  `'delivered'`. `delivered_at` keeps meaning "closed at".
- `deliveries.refusal_reason text` (a key from decision 1) and `refusal_note text`.
  The reason is required when the outcome is `partial` or `refused`.
- `order_lines.qty_refused numeric not null default 0`, with
  `check (qty_refused >= 0 and qty_refused <= qty_shipped)`. One shipment per
  order and one stop per shipment, so the order line is where ordered, shipped,
  refused and (derived) accepted live side by side (D18). Accepted =
  `qty_shipped − qty_refused`; it is not stored.

### 2. `confirm_delivery` takes refused quantities

Same RPC, one new optional input: `refused: [{ orderLineId, qty }]` plus
`reason`. There is no new command, so the driver's one verb stays one verb.

- The outcome is derived: no refused lines → `delivered`; every shipped unit refused →
  `refused`; otherwise `partial`.
- `signedBy` is required when anything was accepted and optional for a full refusal.
- **Invoice on delivery:** invoice lines at accepted quantity × the order
  line's frozen price. Keg deposit lines are for accepted units only. A full refusal
  creates no invoice.
- **Invoice now:** the invoice already exists and is not changed here.
  Crediting the refused units happens when they are checked in (section 4).
- **The order:** refused quantities close on it. There is no backorder and no status
  change (it stays `shipped`), and an `order_events` row records the refusal
  (D18).
- **Stock:** nothing moves. Refusal alone restores no warehouse stock (D17).
- **Retries:** the existing `claim_command_request` replay, and `delivered_at`
  already set, make a retried confirm harmless.

### 3. The route can finish honestly

`return_route` requires every stop to have an outcome, where it used to require every stop
delivered. A route can return with refused units still on the truck. Those units
are an outstanding stock return, visible until checked in (default "Route
versus stock return").

### 4. Physical check-in restores stock

Outstanding return per order line = `qty_refused − units already returned`
through a `return_in` whose `source_movement_id` is one of the order's
`sale_removal` rows. Both return paths write such rows, so one number covers both:

- **Invoice on delivery (no invoice for the refused units):** a new
  `check_in_refused_return(deliveryId, locationId, lines: [{ orderLineId,
  sources: [{ movementId, binId, qty, damaged }] }])`. It runs as warehouse or
  admin and needs no second approval. It writes `return_in` rows pointing at the original
  `sale_removal`, so the existing `enforce_bbl_integrity` trigger keeps the
  SKU and lot and caps returns at what shipped. Damaged units get the paired
  `loss`, as `return_shipment_impl` does. The command refuses more than is outstanding. Replay-safe.
- **Invoice now:** the existing **Return and credit** (`return_shipment`,
  admin and sales) is the check-in. It already writes `return_in` with source
  and lot and credits at the invoiced price. No second path.

Good units go to the chosen bin and become available; damaged units post as a loss.

### 5. Compliance and keg facts

- A refused unit was removed at ship (`sale_removal`, taxable, to the
  customer's state). When it comes back it is a `return_in` in the month it is
  checked in: beer returned to the brewery, which `report_movements` already
  counts as "in". The state totals and export must net these returns by
  the original `dest_state`, reached through `source_movement_id`. That is
  #626's job (D1), and this design only guarantees the link exists.
- Keg custody is recorded by hand (`record_keg_event`); ship and confirm write no
  keg events. A refused keg therefore needs no keg reversal. Only its deposit is
  not invoiced (section 2).

## Out of scope

- Re-delivery: the customer's replacement is a new order (D18).
- Rerouting an undelivered stop to a later route. A stop now closes with an outcome,
  so there is nothing to move.
- A vendor-returns or backorder engine.

## Decisions (2026-09-27)

1. **Refusal reasons:** a pick list (*customer refused*, *closed / no access*,
   *damaged in transit*, *wrong item*, *other*) plus an optional note. It is stored as
   `refusal_reason` (the key) and `refusal_note`. The note is required for *other*.
2. **Transfer stops:** they may close with outcome `refused` too, so the route
   can return. The transfer stays `in_transit` until **Cancel transfer** (#578)
   or a later receipt resolves it. No stock moves at the stop.
3. **Invoice-now refusals:** the existing **Return and credit** (admin and
   sales) is the check-in and the credit. Warehouse never creates credits.
4. **Docs:** the "confirmed when it is delivered later" text (staff guide :488)
   and the Route spec line (:2256) are replaced by the outcome flow.

## Tasks

Each task starts with its failing test (TDD); UI tasks prove the logic in
a test and the render with the browse skill. Migration:
`supabase/migrations/<next stamp>_delivery_outcomes.sql`, then
`bun run migrations:lock` and `bun run types:database`.

| # | Task | Test first | Depends |
|---|---|---|---|
| 1 | Migration: `deliveries.outcome`, `refusal_reason`, backfill; `order_lines.qty_refused` with its check | `tests/delivery.test.ts`: columns, backfill, check refuses refused > shipped | — |
| 2 | `confirm_delivery_impl`: refused input, outcome derivation, accepted-only invoice and deposit lines, order event | `tests/orders-fulfillment.test.ts`: 10 shipped / 2 refused → invoice for 8; full refusal → no invoice; retry replays; no stock movement | 1 |
| 3 | `return_route`: every stop has an outcome | `tests/delivery.test.ts`: replace the :187 "blocks return" test with "returns with a refused stop"; still refuses an open stop | 1 |
| 4 | `check_in_refused_return` RPC + command (warehouse/admin), damaged → loss, outstanding cap, replay | `tests/delivery-returns.test.ts` (new): partial check-in, damaged, over-return refused, lot preserved, duplicate retry harmless | 2 |
| 5 | Outstanding-returns query (per delivery and a list for Today/warehouse), shared by both return paths | same file: invoice-now refusal + Return and credit clears the outstanding | 4 |
| 6 | `confirm_delivery` command input + `bun run docs:api` | `tests/api-docs.test.ts` | 2 |
| 7 | Driver stop screen: accepted/refused per line (`E.edit` stepper), reason (`E.pick`), shared view in screens.tsx + live | view-model test; browse the stop page | 2, 6 |
| 8 | Route and Return route screens: return enabled with outcomes; outstanding check-ins listed | view-model test; browse | 3, 5 |
| 9 | Check-in screen (warehouse): sources from the order's shipped rows, bin, damaged | view-model test; browse | 4, 5 |
| 10 | Today row "Refused beer to check in" for warehouse | `tests/today*.test.ts` | 5 |
| 11 | Portal: order shows refused units and the invoice only accepted | `portal-order-view` test | 2 |
| 12 | Docs: staff guide delivery sections (:388, :393, :476–488), portal guide, screens.tsx Route spec | `tests/docs.test.ts`, `tests/design-docs.test.ts` | 7–11 |

Tasks 1–3 are sequential. Once 2 lands, 4–6 can run in parallel, and 7–11 can run in parallel once
their dependencies land.

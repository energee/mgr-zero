# MGR — Slice 1B Design: Orders → Allocations → Ship → Invoices (+ Portal)

Builds the order lifecycle on the baseline schema (`00001_baseline.sql`) and the
slice-1A command registry. Parent spec: `2026-08-30-mgr-slice1-core-orders-design.md`
§4/§4b — this doc records the decisions that spec left open, plus 1B's exact scope.

## Scope

**In:** wholesale order lifecycle (draft → submitted → confirmed → picked →
shipped, plus cancelled), allocations/ATP flows, pick lists + daily pick sheet,
partial shipment + short-ship reconciliation, per-shipment invoices, returns as
invoice-linked credit memos, taproom replenishment (pars → internal transfer
orders) with standing taproom allocations, customer/ship-to/price-list CRUD,
customer portal (order entry to `submitted`, history, invoices, availability
hints), order change tracking (`order_events`), vitest data-layer coverage,
one agent-browser portal smoke.

**Out (deferred):** keg deposit invoice lines and `keg_events` (keg slice),
the shortfall/competing-demand view (ATP may still go negative — it just isn't
given its own screen yet), QBO push and AI chat (1C), barcodes/bins/waves/routes
(slice 10), smart availability (slice 8).

## Decisions

1. **Portal onboarding** — staff invite by email against a customer, reusing
   the 1A invitation machinery (`invite_customer_user` already exists). No
   self-signup. 1B adds the portal routes and login redirect for customer users.
2. **Edit rules** — staff may adjust/add/remove lines while `confirmed` or
   `picked`; allocations adjust in the same transaction. Adjusting or cancelling
   a `picked` order sets `orders.needs_restock` (the spec's "staged, needs
   restocking" indicator), cleared on re-pick or ship. The portal is read-only
   after submit; portal users edit only their own `draft` orders.
3. **Change tracking** — `order_events`, an append-only per-order log written
   inside the same command functions that make each change. Not a generic audit
   system; orders only.
4. **Pick/ship** — two steps. Pick records `qty_picked` per line (order →
   `picked`); shortage is captured at pick time. Ship pre-fills from picked
   quantities; staff adjust, add carrier/tracking, confirm.
5. **Invoice timing** — the ship command creates the invoice (shipped qty ×
   snapshot prices) in the same transaction as the shipment, ledger movements,
   allocation fulfillment, and remainder cancellation. No separate invoicing
   step to forget.
6. **Returns** — credit memo against an original invoice: select lines and
   quantities to credit → one transaction writes a `credit_memo` invoice with
   negative lines at original prices plus `return_in` movements. No free-form
   credit memos in 1B.
7. **Portal surface** — beyond ordering: read-only invoices/credit memos,
   their price-list catalog, and in/low/out availability badges derived from
   ATP (never raw quantities).
8. **Supporting CRUD** — full create/edit screens for customers (ship-tos
   inline) and price lists, alongside the existing CSV import.

## Schema changes (edit `00001_baseline.sql` in place, `supabase db reset`)

- `order_events`: `id, brewery_id, order_id (composite FK), actor references
  auth.users, event text, payload jsonb not null default '{}', created_at`.
  Append-only like `inventory_movements`: no UPDATE/DELETE grants; inserts only
  via security-definer command functions. RLS: staff read within brewery;
  customer users read events of their own orders. Payload holds the minimal
  diff (e.g. `{"line": …, "sku": …, "qty": [24, 18], "reason": …}`).
- `orders.needs_restock boolean not null default false`.
- Everything else 1B needs already exists: `orders`, `order_lines`
  (`qty_ordered/qty_picked/qty_shipped`, price snapshots), `allocations`
  (incl. `taproom_standing`), `shipments` (one per order; remainder cancelled),
  `invoices`/`invoice_lines` + `brewery_counters` numbering, `taproom_pars`,
  `customer_users` + portal RLS, ATP view.

## Commands (registry; every multi-row write is one plpgsql function — iron rule 5)

Order lifecycle: `create_order` / `update_draft_order` (staff + portal; portal
constrained to own customer, own price list), `submit_order`, `confirm_order`
(creates order-line allocations; returns ATP soft warnings, never blocks),
`adjust_order_lines` (staff; atomic re-allocation; sets `needs_restock` when
`picked`), `cancel_order` (releases allocations), `record_pick`, `ship_order`
(shipment + `sale_removal`/`taproom_transfer` movements with channel and
`dest_state` from the ship-to + allocation fulfillment + invoice + remainder
cancellation, one transaction; `taproom_transfer` orders write transfer
movements only — no invoice, no `sale_removal`), `create_credit_memo`,
`create_replenishment_order` (par gap → internal `taproom_transfer` order).
Each writes its `order_events` rows in the same function.

Supporting CRUD: customers, ship-tos, price lists (+ items), taproom pars,
standing taproom allocations — plain registry commands.

Queries: orders list/detail (with events + allocation state), daily pick sheet
(confirmed orders grouped by `requested_ship_date`), invoices list/detail,
replenishment view (ledger on-hand vs. par → suggested quantities), portal
catalog (price-list prices + availability badge tiers).

## UI

Staff (per the UI-layout plan and wireframes — keep wireframes in step):
orders list + detail with event timeline and ATP badges, order form, pick list
(printable/phone) + daily pick sheet, ship screen, invoices list/detail +
credit-memo flow, customers + price-lists CRUD, taproom replenishment view.

Portal: separate route group; customer users land there after login. Catalog →
cart → draft → submit; order history with status and adjustment notices;
read-only invoices.

## Testing

vitest against local Supabase: full lifecycle (order → confirm → allocations →
pick → ship → movements + invoice, remainder cancelled), adjust-after-pick →
`needs_restock` + re-allocation, cancel → allocations released, credit memo →
negative invoice + `return_in`, replenishment order creation,
`order_events` written for every transition, RLS (tenant isolation; customer
users see only their own orders/invoices/events; no staff data). Agent-browser:
one portal ordering smoke (login → catalog → cart → submit). CI unchanged.

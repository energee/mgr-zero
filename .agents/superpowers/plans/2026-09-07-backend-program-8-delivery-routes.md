# Program 8 — Delivery routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A warehouse admin can build a route of stops, a driver can depart, confirm each stop (reusing Program 1 `confirm_delivery`), and return the truck. A stop is a customer shipment **or** a stock transfer.

**Architecture:** `routes` and `deliveries` exist. Program 1 already invoices on-delivery via `confirm_delivery`. This program adds route CRUD, depart/return, and Decision 4 polymorphism (`stock_transfer_id`). `get_route_load` is a `[view]` — implement as a registered query `list_route_stops` plus a derived load object, **or** keep it `[view]` and do not publish it on `/docs/api` (api-operations already drops `[view]`). Prefer `list_routes` + `get_delivery_stop` (already designed).

**Tech Stack:** Same as Program 1. Commands live in `lib/commands/orders.ts` or new `lib/commands/delivery.ts` — **new file** so orders.ts does not grow.

**Spec:** Locations spec Decision 4 (phase 3). Confirm delivery / Routes / Driver route / Return route screens. Parent plan. Program 1 `confirm_delivery`. Program 2 `stock_transfers`.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Programs 1 and 2 required.
- `deliveries.shipment_id` becomes nullable; add `stock_transfer_id uuid unique`; `check (num_nonnulls(shipment_id, stock_transfer_id) = 1)`.
- `confirm_delivery` on a transfer stop sets `delivered_at` and does **not** create an invoice.
- `depart_route` sets `departed_at`; `return_route` sets `returned_at` only when every stop has `delivered_at`.
- Assigned driver **or** admin may confirm/depart/return. Other warehouse members are denied.
- TDD, docs:api, staff-guide, nav Deliveries `planned` off.
- Parked: signature images, truck-loaded flag (UI plan forbids it).

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | deliveries polymorphism, RPCs |
| `lib/commands/delivery.ts` | save_route, list_routes, get_delivery_stop, depart_route, return_route |
| `lib/commands/all.ts` | import |
| `lib/commands/orders.ts` | leave `confirm_delivery` here (already shipped) or re-export — do not duplicate |
| `app/(app)/work/deliveries/` | list + confirm (confirm page may already exist from Program 1) |
| `app/(app)/routes/` | builder + driver view |
| `tests/delivery.test.ts` | Proof |

---

### Task 1: Deliveries carry a shipment or a transfer

**Files:** baseline, `tests/delivery.test.ts`

**Interfaces:**
- Produces: nullable `shipment_id`, `stock_transfer_id`, check `num_nonnulls = 1`.

- [ ] **Step 1:**

```ts
it("a delivery must reference exactly one document", async () => {
  const { error: neither } = await admin.from("deliveries").insert({
    brewery_id: b.id, route_id: route.id, stop_no: 1,
  });
  expect(neither).not.toBeNull();
  const { error: both } = await admin.from("deliveries").insert({
    brewery_id: b.id, route_id: route.id, stop_no: 2,
    shipment_id: sh.id, stock_transfer_id: tr.id,
  });
  expect(both).not.toBeNull();
  const { error: ok } = await admin.from("deliveries").insert({
    brewery_id: b.id, route_id: route.id, stop_no: 3, stock_transfer_id: tr.id,
  });
  expect(ok).toBeNull();
});
```

- [ ] **Step 2–5:** Alter in baseline (rewrite `create table deliveries`). Commit `feat(schema): a delivery is a shipment or a stock transfer`

---

### Task 2: `save_route` and `list_routes`

**Files:** delivery.ts, RPCs

**Interfaces:**
- `save_route({ id?, name?, deliveryDate, driverUserId?, vehicle?, note?, stops: [{ shipmentId?, stockTransferId?, stopNo }] })` — one RPC replaces stops. Reject duplicate documents. Reject a shipment already on another open route.
- `list_routes({ date? })`
- `get_delivery_stop({ deliveryId })` — header + line qtys from the shipment's order_lines or the transfer lines.

- [ ] **Step 1:** Save a 3-stop route; list by date; second save of the same shipment on another route raises.

- [ ] **Step 2–5:** Commit `feat(delivery): save and list routes`

---

### Task 3: `depart_route` and `return_route`

**Files:** delivery.ts

**Interfaces:**
- `depart_route({ routeId })` — sets `departed_at` if null; requires at least one stop; roles admin or `driver_user_id = auth.uid()`.
- `return_route({ routeId })` — requires `departed_at` and every stop `delivered_at`; sets `returned_at`.
- Add `delivery_next` to `today_live_reasons()` (href already `/work/deliveries/:id`).

- [ ] **Step 1:** Depart; Today for that driver shows stop 1; confirm_delivery (Program 1 command) on stop 1; Today shows stop 2; return before last stop raises; after all confirmed, return succeeds.

- [ ] **Step 2–5:** Commit `feat(delivery): depart, confirm, and return a route`

---

### Task 4: Pages, ungate, docs

Routes builder (Routes screen), Driver route, Return route. Confirm delivery page from Program 1 stays. Nav Deliveries. Ungate `save_route`, `depart_route`, `return_route`, `list_routes`, `get_delivery_stop`. `bun run docs:api`. Browse as warehouse driver vs admin.

Commit `docs: delivery routes live`

---

## Validation

```bash
bunx vitest run tests/delivery.test.ts tests/orders-fulfillment.test.ts tests/commands-today.test.ts tests/rls-command-boundary.test.ts tests/nav-ready-links.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Re-implementing confirm_delivery | High | Call the Program 1 command; transfer stops skip invoice inside that RPC (extend it: if `stock_transfer_id` is set, only stamp delivered_at) |
| Driver who is not warehouse | Medium | `driver_user_id` must be a warehouse or admin membership; enforce in `save_route` |
| Returning with an open stop | High | Test in Task 3 |

## Acceptance

- [ ] Mixed shipment + transfer route is legal
- [ ] Transfer stop confirm does not invoice
- [ ] `delivery_next` is live on Today for the assigned driver

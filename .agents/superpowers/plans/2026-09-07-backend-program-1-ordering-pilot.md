# Program 1 — Ordering pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brewery can run wholesale end-to-end against real data on the current schema: Today shows the work, short picks and restocks resolve, ship can defer the invoice until delivery, returns credit and optionally write loss, portal account/invoice reads match the screens.

**Architecture:** No §16 rename. Add the missing order RPCs and two small columns (`shipments.invoice_timing`, a `restock_due` Today reason). Live pages that this program touches are rewritten to the screen records using `E.*` + `CommandForm`. Screens stay fixtures.

**Tech Stack:** Postgres plpgsql `security definer` RPCs, zod command registry, vitest against `mgr_test` (Program 0), Next.js App Router, `agent-browser`.

**Spec:** Parent `.agents/superpowers/plans/2026-09-07-backend-database-integration.md` (D1A, D2A, D3A). Screen contracts: Today, Today empty, Sales, Short pick, Pick, Put back, Ship and invoice, Ship on delivery, Confirm delivery, Return and credit, Pars and allocation, Account, Pay invoice in `components/mgr/screens.tsx`. Existing RPCs: `private.ship_order_impl`, `private.record_pick_impl`, `private.create_credit_memo_impl`, `private.today_candidates`.

## Global Constraints

- Worktree `.agents/worktrees/backend`, branch `backend`. `pwd && git branch --show-current` before every edit.
- Program 0 is merged first (`mgr_test`, `seedCatalog` / `seedLocation` / `seedCustomer`).
- Edit `supabase/migrations/00001_baseline.sql` in place. No second migration.
- Every mutation: `private.assert_staff` → `private.claim_command_request` → domain work → `private.complete_command_request`. Mirror `create_location` at baseline ~2093.
- Pin new RPCs on the `grant execute` list at baseline ~3575 and in `tests/rls-command-boundary.test.ts`.
- TDD: failing vitest in the same PR as the RPC. UI eyeball via browse skill.
- Do not edit `.agents/PROGRESS.md`, `.agents/MEMORY.md`, `.agents/DRIFT.md`.
- After commands or screen `reads`/`writes` change: `bun run docs:api`.
- Customer-visible behavior updates `content/docs/staff-guide.mdx` and/or `portal-guide.mdx` in the same task that ships the page.
- No `Co-Authored-By`. No new fail-closed command names.
- Parked in this program (do not invent tables): `raise_invoice_question`, `list_invoice_questions`, `resolve_invoice_question`, `write_off_invoice`, `get_qbo_connection`, Pay-invoice Intuit redirect.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00001_baseline.sql` | `invoice_timing` on shipments; Today `restock_due` + pick-still-owed; new RPCs; grants |
| `lib/commands/orders.ts` | restock, short pick, ship timing, return_shipment, release_allocation, get_shortfalls, confirm_delivery |
| `lib/commands/today.ts` | `restock_due` on `TodayItem["reason"]` |
| `lib/commands/portal.ts` | `get_portal_account`, `portal_invoice` |
| `lib/commands/catalog.ts` | `update_location` |
| `app/(app)/page.tsx` | Live Today |
| `app/(app)/orders/[id]/` | Put back, short pick sheet, ship timing chip, return shipment |
| `app/(app)/work/deliveries/[id]/page.tsx` | Confirm delivery (href already used by `today_candidates`) |
| `app/(app)/locations/[id]/page.tsx` | Location detail (`update_location`) |
| `app/(portal)/portal/account/page.tsx` | Ship-tos + deposits via `get_portal_account` |
| `app/(portal)/portal/invoices/[id]/page.tsx` | `portal_invoice` |
| `components/mgr/screens.tsx` | Ungate writes this program ships |
| `lib/mgr/nav.ts` | Flip Deliveries `planned` when the confirm-delivery route exists |
| `tests/orders-fulfillment.test.ts`, `tests/commands-today.test.ts`, `tests/commands-portal.test.ts`, `tests/commands-catalog.test.ts`, `tests/rls-command-boundary.test.ts` | Proof |

**Interfaces Program 0 produced (required):**

```ts
seedCatalog(breweryId: string): Promise<{ productId: string; skuId: string }>
seedLocation(breweryId: string, opts?: { name?: string; kind?: "warehouse" | "taproom" }): Promise<{ id: string }>
seedCustomer(breweryId: string): Promise<{ customerId: string; shipToId: string; priceListId: string }>
```

---

### Task 1: Today live page and `restock_due`

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (`private.today_candidates` ~2988, `today_live_reasons` ~3035)
- Modify: `lib/commands/today.ts:8-9`
- Modify: `app/(app)/page.tsx`
- Test: `tests/commands-today.test.ts`

**Interfaces:**
- Consumes: `get_today` (already registered).
- Produces: `TodayItem.reason` includes `"restock_due"`; `today_live_reasons()` returns `{submitted_order, pick_due, restock_due}`; `/` renders role-filtered rows from `get_today`.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/commands-today.test.ts
it("shows restock_due to warehouse when needs_restock is set, including cancelled orders", async () => {
  const id = await createOrder("2026-09-07", true, true);
  const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
  await adminCtx.db.rpc("record_pick", {
    p_order: id, p_picks: [{ line_id: line!.id, qty_picked: 1 }], p_request_id: crypto.randomUUID(),
  });
  await adminCtx.db.rpc("adjust_order_lines", {
    p_order: id, p_lines: [{ sku_id: skuId, qty: 1 }], p_reason: "cut", p_request_id: crypto.randomUUID(),
  });
  // adjust after pick sets needs_restock; cancel must keep it
  await adminCtx.db.rpc("cancel_order", { p_order: id, p_reason: "customer dropped", p_request_id: crypto.randomUUID() });
  const rows = await today(warehouse, "2026-09-07T12:00:00Z");
  const restock = rows.find((i) => i.reason === "restock_due" && i.subjectId === id);
  expect(restock).toBeDefined();
  expect(restock!.href).toBe(`/orders/${id}/restock`);
  expect(restock!.recipientRoles).toEqual(["admin", "warehouse"]);
  expect(await today(sales, "2026-09-07T12:00:00Z")).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ reason: "restock_due", subjectId: id })]),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/commands-today.test.ts`
Expected: FAIL — `reason === "restock_due"` is not in the union / no such row (live reasons are only `submitted_order` and `pick_due`).

- [ ] **Step 3: Write minimal implementation**

In `today_live_reasons`:

```sql
create function today_live_reasons() returns text[]
language sql immutable set search_path = '' as $$
  select array['submitted_order','pick_due','restock_due']
$$;
```

Add a union arm to `private.today_candidates` immediately after the `pick_due` select:

```sql
  union all
  select o.brewery_id, 'restock_due', 'order', o.id::text,
         md5(concat_ws('|', o.status, o.needs_restock)),
         'ORD-' || lpad(o.order_no::text, 4, '0'),
         'restock staged beer',
         o.shipped_at,  -- null is fine; restock is standing work, not date-due
         '/orders/' || o.id || '/restock',
         array['admin','warehouse']::text[],
         null::uuid
    from orders o
    where o.needs_restock = true
```

In `lib/commands/today.ts` add `"restock_due"` to the `reason` union.

Replace `app/(app)/page.tsx` with a server page that `runCommand("get_today", {}, ctx)` and draws `E.hd("Today", …)` plus one `E.row` per item (label = `safeLabel`, detail = `detail`, verb from reason: Confirm / Pick / Put back). Empty state: `E.blank("Nothing waiting")` and `E.btn("Record movement", "g")` linking `/inventory`. Do not import `SCREENS`.

Also extend `pick_due` so a picked order with any `coalesce(qty_picked,0) < qty_ordered` still appears (needed by Task 3; add the test in Task 3).

- [ ] **Step 4: Run tests**

Run: `bunx vitest run tests/commands-today.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00001_baseline.sql lib/commands/today.ts app/\(app\)/page.tsx tests/commands-today.test.ts
git commit -m "feat(today): restock_due rows and a live Today page

tests/commands-today.test.ts"
```

---

### Task 2: `confirm_restock`

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (new functions + grant list ~3575)
- Modify: `lib/commands/orders.ts`
- Modify: `tests/rls-command-boundary.test.ts` (matrix row)
- Create: `app/(app)/orders/[id]/restock/page.tsx` (or a `CommandForm` on the order page)
- Test: `tests/orders-fulfillment.test.ts`

**Interfaces:**
- Consumes: `orders.needs_restock` (already set by adjust-after-pick and cancel-when-picked).
- Produces: `confirm_restock({ orderId: uuid }) => { orderId: string }`. Roles: admin, warehouse. Clears `needs_restock`, appends `order_events.event = 'restocked'`. No inventory movement.

- [ ] **Step 1: Write the failing test**

```ts
it("confirm_restock clears needs_restock and writes an order event; no movement", async () => {
  const id = await confirmedOrder(4);
  const line = await lineOf(id);
  await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() });
  await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 2 }], p_reason: "cut", p_request_id: crypto.randomUUID() });
  const before = await admin.from("inventory_movements").select("id").eq("ref", id);
  const { data, error } = await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
  expect(error).toBeNull();
  expect((data as { order_id: string }).order_id).toBe(id);
  const { data: o } = await admin.from("orders").select("needs_restock").eq("id", id).single();
  expect(o!.needs_restock).toBe(false);
  const { data: ev } = await admin.from("order_events").select("event").eq("order_id", id).eq("event", "restocked");
  expect(ev!.length).toBe(1);
  const after = await admin.from("inventory_movements").select("id").eq("ref", id);
  expect(after.data!.length).toBe(before.data!.length);
});

it("confirm_restock is a no-op conflict when the flag is already clear", async () => {
  const id = await confirmedOrder(2);
  const { error } = await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
  expect(error).not.toBeNull();
  expect(error!.message).toMatch(/not waiting for restock/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run tests/orders-fulfillment.test.ts`
Expected: FAIL — function `confirm_restock` does not exist.

- [ ] **Step 3: Implementation**

```sql
create function private.confirm_restock_impl(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.needs_restock is not true then raise exception 'order is not waiting for restock'; end if;
  update public.orders set needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'restocked', '{}'::jsonb);
  return jsonb_build_object('order_id', p_order);
end $$;

create function confirm_restock(p_order uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_brewery uuid;
begin
  v_brewery := private.assert_order_staff(p_order, array['admin','warehouse']::public.staff_role[]);
  v_replay := private.claim_command_request(v_brewery, 'confirm_restock', p_request_id,
    jsonb_build_object('order', p_order));
  if v_replay is not null then return v_replay; end if;
  return private.complete_command_request(p_request_id, private.confirm_restock_impl(p_order));
end $$;
```

Add `confirm_restock(uuid,uuid)` to the grant list. Register:

```ts
defineCommand({
  name: "confirm_restock",
  description: "Confirm staged quantities were put back; clears needs_restock; no ledger movement",
  roles: ["admin", "warehouse"],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("confirm_restock", {
    p_order: i.orderId, p_request_id: execution.requestId,
  })),
});
```

Matrix row: `allowed: ["admin", "warehouse"]`. Put-back page: `CommandForm` primary "Put back N cases" calling `confirm_restock`.

- [ ] **Step 4: Run**

Run: `bunx supabase db reset` is **forbidden on the app database**. After Program 0: re-apply baseline to `mgr_test` via `scripts/test-db.sh`, then `bunx vitest run tests/orders-fulfillment.test.ts tests/rls-command-boundary.test.ts tests/data-api-boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00001_baseline.sql lib/commands/orders.ts tests/orders-fulfillment.test.ts tests/rls-command-boundary.test.ts app/\(app\)/orders/
git commit -m "feat(orders): confirm_restock clears the staged-beer flag

tests/orders-fulfillment.test.ts"
```

---

### Task 3: `resolve_short_pick`

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql`, `lib/commands/orders.ts`, `tests/rls-command-boundary.test.ts`, `private.today_candidates` pick_due predicate
- Modify: `app/(app)/orders/[id]/` pick UI so a qty below ordered opens the short-pick sheet
- Test: `tests/orders-fulfillment.test.ts`

**Interfaces:**
- Produces: `resolve_short_pick({ orderId, lineId, qtyPicked, reason, resolution: "adjust_down" | "keep_owed" }) => { orderId: string }`. Roles: admin, warehouse. `reason` min length 1. `adjust_down` sets `qty_ordered = qtyPicked` and shrinks the open allocation. `keep_owed` sets `qty_picked` only; order stays pickable. Both write `order_events`.

- [ ] **Step 1: Failing tests**

```ts
it("adjust_down shrinks the line and allocation to the counted qty", async () => {
  const id = await confirmedOrder(10);
  const line = await lineOf(id);
  const { error } = await staffDb.rpc("resolve_short_pick", {
    p_order: id, p_line: line.id, p_qty_picked: 7, p_reason: "short in pick face",
    p_resolution: "adjust_down", p_request_id: crypto.randomUUID(),
  });
  expect(error).toBeNull();
  const after = await lineOf(id);
  expect(Number(after.qty_ordered)).toBe(7);
  expect(Number(after.qty_picked)).toBe(7);
  expect(after.short_reason).toBe("short in pick face");
  const { data: alloc } = await admin.from("allocations").select("qty,status").eq("ref", line.id).single();
  expect(Number(alloc!.qty)).toBe(7);
  expect(alloc!.status).toBe("open");
});

it("keep_owed records the count and leaves the order on Today pick_due", async () => {
  const id = await confirmedOrder(10);
  const line = await lineOf(id);
  await staffDb.rpc("resolve_short_pick", {
    p_order: id, p_line: line.id, p_qty_picked: 7, p_reason: "will finish tomorrow",
    p_resolution: "keep_owed", p_request_id: crypto.randomUUID(),
  });
  const after = await lineOf(id);
  expect(Number(after.qty_ordered)).toBe(10);
  expect(Number(after.qty_picked)).toBe(7);
  const { data: o } = await admin.from("orders").select("status").eq("id", id).single();
  expect(o!.status).toBe("picked");
});
```

Add in `tests/commands-today.test.ts`: a picked order with `qty_picked < qty_ordered` still returns `pick_due`.

- [ ] **Step 2: Run** — FAIL, `resolve_short_pick` does not exist.

- [ ] **Step 3: Implementation**

```sql
create function private.resolve_short_pick_impl(p_order uuid, p_line uuid, p_qty numeric, p_reason text, p_resolution text)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l public.order_lines;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason is required'; end if;
  if p_qty < 0 then raise exception 'qty_picked cannot be negative'; end if;
  o := private.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  select * into l from public.order_lines where id = p_line and order_id = p_order for update;
  if not found then raise exception 'order line not found'; end if;
  if p_qty >= l.qty_ordered then raise exception 'line is not short'; end if;
  if p_resolution = 'adjust_down' then
    update public.order_lines
      set qty_ordered = p_qty, qty_picked = p_qty, short_reason = p_reason
      where id = p_line;
    update public.allocations set qty = p_qty
      where source = 'order_line' and ref = p_line and status = 'open';
  elsif p_resolution = 'keep_owed' then
    update public.order_lines set qty_picked = p_qty, short_reason = p_reason where id = p_line;
  else
    raise exception 'unknown resolution';
  end if;
  update public.orders set status = 'picked' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'short_pick',
          jsonb_build_object('line_id', p_line, 'qty_picked', p_qty, 'reason', p_reason, 'resolution', p_resolution));
  return jsonb_build_object('order_id', p_order);
end $$;
```

Public wrapper `resolve_short_pick(p_order uuid, p_line uuid, p_qty_picked numeric, p_reason text, p_resolution text, p_request_id uuid)` with `assert_order_staff(..., admin/warehouse)`.

Widen `pick_due` in `today_candidates`:

```sql
    where (
      (o.status = 'confirmed' and o.requested_ship_date is not null)
      or (o.status = 'picked' and exists (
        select 1 from public.order_lines ol
        where ol.order_id = o.id and coalesce(ol.qty_picked, 0) < ol.qty_ordered
      ))
    )
```

Command input: `{ orderId, lineId, qtyPicked, reason, resolution: z.enum(["adjust_down","keep_owed"]) }`.

- [ ] **Step 4: Run** `bunx vitest run tests/orders-fulfillment.test.ts tests/commands-today.test.ts tests/rls-command-boundary.test.ts` — PASS.

- [ ] **Step 5: Commit** `feat(orders): resolve_short_pick adjusts or keeps the owed remainder`

---

### Task 4: Persist `invoice_timing` on ship

**Files:**
- Modify: `shipments` table, `private.ship_order_impl`, `ship_order(...)` signature, `lib/commands/orders.ts` `ship_order` input, `app/(app)/orders/[id]/ship-form.tsx`, every existing `ship_order` caller in tests
- Test: `tests/orders-fulfillment.test.ts`

**Interfaces:**
- Produces: `shipments.invoice_timing text not null default 'now' check (invoice_timing in ('now','on_delivery'))`. `ship_order` input gains `invoiceTiming: z.enum(["now","on_delivery"]).default("now")`. Wholesale + `now` creates the invoice (current behavior). Wholesale + `on_delivery` writes the shipment and movements, **no invoice**. Short ship (`qty_shipped < qty_picked`) sets `needs_restock = true` (screen Ship and invoice spec).

- [ ] **Step 1: Failing tests**

```ts
it("on_delivery ship posts movements and no invoice", async () => {
  const id = await confirmedOrder(4);
  const line = await lineOf(id);
  await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() });
  const { data, error } = await staffDb.rpc("ship_order", {
    p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 4 }],
    p_carrier: null, p_tracking: null, p_invoice_timing: "on_delivery",
    p_request_id: crypto.randomUUID(),
  });
  expect(error).toBeNull();
  expect((data as { invoice_id: string | null }).invoice_id).toBeNull();
  const { data: sh } = await admin.from("shipments").select("invoice_timing").eq("order_id", id).single();
  expect(sh!.invoice_timing).toBe("on_delivery");
  const { data: invs } = await admin.from("invoices").select("id").eq("shipment_id", (await admin.from("shipments").select("id").eq("order_id", id).single()).data!.id);
  expect(invs!.length).toBe(0);
  const { data: mv } = await admin.from("inventory_movements").select("type").eq("ref", id);
  expect(mv!.map((m) => m.type)).toEqual(["sale_removal"]);
});

it("short ship below picked sets needs_restock", async () => {
  const id = await confirmedOrder(10);
  const line = await lineOf(id);
  await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }], p_request_id: crypto.randomUUID() });
  await staffDb.rpc("ship_order", {
    p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 9 }],
    p_carrier: null, p_tracking: null, p_invoice_timing: "now",
    p_request_id: crypto.randomUUID(),
  });
  const { data: o } = await admin.from("orders").select("needs_restock").eq("id", id).single();
  expect(o!.needs_restock).toBe(true);
});
```

- [ ] **Step 2: Run** — FAIL, `p_invoice_timing` unknown / restock stays false (`ship_order_impl` currently sets `needs_restock = false`).

- [ ] **Step 3: Implementation**

```sql
alter table public.shipments
  add column invoice_timing text not null default 'now'
  check (invoice_timing in ('now','on_delivery'));
```

In `ship_order_impl`, add parameter `p_invoice_timing text`. Insert it on the shipment row. Wrap the invoice insert:

```sql
  if o.kind = 'wholesale' and coalesce(p_invoice_timing, 'now') = 'now' then
    -- existing empty-invoice guard + insert
  end if;
```

Replace the final order update:

```sql
  update public.orders
     set status = 'shipped', shipped_at = now(),
         needs_restock = exists (
           select 1 from jsonb_array_elements(p_ship) e
           join public.order_lines ol on ol.id = (e->>'line_id')::uuid
           where (e->>'qty_shipped')::numeric < coalesce(ol.qty_picked, ol.qty_ordered)
         )
   where id = p_order;
```

Public `ship_order` gains `p_invoice_timing text` (default `'now'` in the SQL default argument). Update the grant signature. Command input adds `invoiceTiming`. Existing tests that call `ship_order` without the new arg keep working if the SQL default is `'now'`; TypeScript rpc calls from tests that list arguments positionally must be updated to named args (they already are named).

Ungate the Ship on delivery screen `writes` to drop SCHEMA-GATE once this column exists.

- [ ] **Step 4: Run** `bunx vitest run tests/orders-fulfillment.test.ts tests/orders-lifecycle.test.ts tests/rls-command-boundary.test.ts` — PASS.

- [ ] **Step 5: Commit** `feat(orders): persist invoice timing on ship; short-ship restocks`

---

### Task 5: `confirm_delivery`

**Files:**
- Modify: baseline (new RPC + grant), `lib/commands/orders.ts`, matrix test
- Create: `app/(app)/work/deliveries/[id]/page.tsx`
- Modify: `lib/mgr/nav.ts` Deliveries child: drop `planned`, href `/work/deliveries` list or keep the confirm route only
- Test: `tests/orders-fulfillment.test.ts`

**Interfaces:**
- Produces: `confirm_delivery({ deliveryId, signedBy }) => { deliveryId, invoiceId: string | null }`. Roles: admin, warehouse. Sets `deliveries.delivered_at = now()`, `signed_by`. If the shipment's `invoice_timing = 'on_delivery'` and no invoice exists, creates the invoice + lines from `qty_shipped` (same prices as `ship_order_impl`). Never inserts movements (ship already did). Idempotent via request ledger.

- [ ] **Step 1: Failing test**

```ts
it("confirm_delivery invoices an on_delivery shipment and is a no-op on replay of movements", async () => {
  const id = await confirmedOrder(3);
  const line = await lineOf(id);
  await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
  await staffDb.rpc("ship_order", {
    p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }],
    p_carrier: null, p_tracking: null, p_invoice_timing: "on_delivery",
    p_request_id: crypto.randomUUID(),
  });
  const { data: sh } = await admin.from("shipments").select("id").eq("order_id", id).single();
  const { data: route } = await admin.from("routes").insert({
    brewery_id: b.id, delivery_date: "2026-09-08", driver_user_id: staffId, name: "A",
  }).select().single();
  const { data: del } = await admin.from("deliveries").insert({
    brewery_id: b.id, route_id: route!.id, shipment_id: sh!.id, stop_no: 1,
  }).select().single();
  const mvBefore = await admin.from("inventory_movements").select("id").eq("ref", id);
  const { data, error } = await staffDb.rpc("confirm_delivery", {
    p_delivery: del!.id, p_signed_by: "Dana", p_request_id: crypto.randomUUID(),
  });
  expect(error).toBeNull();
  expect((data as { invoice_id: string }).invoice_id).toMatch(/^[0-9a-f-]{36}$/i);
  const { data: d2 } = await admin.from("deliveries").select("signed_by,delivered_at").eq("id", del!.id).single();
  expect(d2!.signed_by).toBe("Dana");
  expect(d2!.delivered_at).not.toBeNull();
  const mvAfter = await admin.from("inventory_movements").select("id").eq("ref", id);
  expect(mvAfter.data!.length).toBe(mvBefore.data!.length);
});
```

- [ ] **Step 2: FAIL** — `confirm_delivery` does not exist.

- [ ] **Step 3:** `private.confirm_delivery_impl` locks the delivery row (`delivered_at is null` else raise `'already delivered'`), writes `delivered_at`/`signed_by`, and if `shipments.invoice_timing = 'on_delivery'` and no `invoices.shipment_id` row, copies the invoice insert from `ship_order_impl` using `order_lines.qty_shipped`. Public wrapper `assert_staff` admin/warehouse. Command `confirm_delivery`. Page at `/work/deliveries/[id]` matches Confirm delivery screen (`E.edit("Received by")`, primary "Delivered").

- [ ] **Step 4: PASS** `tests/orders-fulfillment.test.ts tests/rls-command-boundary.test.ts tests/nav-ready-links.test.ts`

- [ ] **Step 5: Commit** `feat(orders): confirm_delivery invoices on-delivery shipments`

---

### Task 6: `return_shipment`

**Files:**
- Modify: baseline, `lib/commands/orders.ts`, matrix, `app/(app)/invoices/[id]/credit-memo-form.tsx` or a Return shipment form on the order
- Test: `tests/orders-fulfillment.test.ts`

**Interfaces:**
- Produces: `return_shipment({ invoiceId, locationId, reason: "damaged" | "wrong_item" | "unsold", lines: [{ invoiceLineId, qty }] }) => { creditMemoId: string }`. Roles: admin, sales. Always writes credit-memo lines at the **invoiced** unit price (reuse `create_credit_memo_impl` logic). Always `return_in` at `locationId`. If `reason = "damaged"`, also appends a `loss` movement for the same qty at the same location in the **same** function (iron rule 5). Does not invent keg events (slice 9 not enabled).

- [ ] **Step 1: Failing tests**

```ts
it("unsold return credits and restocks; damaged also posts loss", async () => {
  const id = await confirmedOrder(5);
  const line = await lineOf(id);
  await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 5 }], p_request_id: crypto.randomUUID() });
  const shipped = await staffDb.rpc("ship_order", {
    p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 5 }],
    p_carrier: null, p_tracking: null, p_invoice_timing: "now", p_request_id: crypto.randomUUID(),
  });
  const invId = (shipped.data as { invoice_id: string }).invoice_id;
  const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();

  await staffDb.rpc("return_shipment", {
    p_invoice: invId, p_location: whId, p_reason: "unsold",
    p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_request_id: crypto.randomUUID(),
  });
  let { data: mvs } = await admin.from("inventory_movements").select("type,qty").eq("sku_id", skuId).order("created_at");
  expect(mvs!.filter((m) => m.type === "return_in").length).toBe(1);

  await staffDb.rpc("return_shipment", {
    p_invoice: invId, p_location: whId, p_reason: "damaged",
    p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_request_id: crypto.randomUUID(),
  });
  ({ data: mvs } = await admin.from("inventory_movements").select("type,qty").eq("sku_id", skuId));
  expect(mvs!.filter((m) => m.type === "loss").length).toBe(1);
  expect(mvs!.filter((m) => m.type === "return_in").length).toBe(2);
});
```

- [ ] **Step 2: FAIL** — function missing.

- [ ] **Step 3:** Implement `private.return_shipment_impl` by calling the same credit + `return_in` path as `create_credit_memo_impl`, then if `p_reason = 'damaged'` insert `inventory_movements` type `loss`, qty negative, same sku/location. Keep `create_credit_memo` working (invoice page). Register `return_shipment`. Screen "Return and credit" writes stay as `return_shipment` and drop `[design;…]`.

- [ ] **Step 4: PASS** including existing credit-memo tests.

- [ ] **Step 5: Commit** `feat(orders): return_shipment credits and optionally writes loss`

---

### Task 7: `release_allocation` and `get_shortfalls`

**Files:**
- Modify: baseline (`release_allocation` RPC), `lib/commands/orders.ts` (command + query)
- Test: `tests/orders-fulfillment.test.ts`

**Interfaces:**
- Produces:
  - `release_allocation({ allocationId }) => { allocationId }` — sets `status = 'released'` only when `status = 'open'`. Roles: admin, sales.
  - `get_shortfalls({}) => { skuId, skuName, atp, allocated, onHand }[]` where `atp < 0`. Roles: admin, sales, warehouse. Pure query over `atp` + `on_hand` + open allocations. No new table.

- [ ] **Step 1:**

```ts
it("release_allocation frees ATP; get_shortfalls lists negative ATP skus", async () => {
  const id = await confirmedOrder(1000); // opening balance is 100
  const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
  const { data: alloc } = await admin.from("allocations").select("id").eq("ref", line!.id).single();
  const short = await runCommand("get_shortfalls", {}, adminCtx) as { skuId: string; atp: number }[];
  expect(short.some((s) => s.skuId === skuId && s.atp < 0)).toBe(true);
  await runCommand("release_allocation", { allocationId: alloc!.id }, adminCtx);
  const { data: a2 } = await admin.from("allocations").select("status").eq("id", alloc!.id).single();
  expect(a2!.status).toBe("released");
  const after = await runCommand("get_shortfalls", {}, adminCtx) as { skuId: string }[];
  expect(after.some((s) => s.skuId === skuId)).toBe(false);
});
```

Import `runCommand` and a staff `Ctx` in this file if not present; otherwise call the RPC directly and query `atp`.

- [ ] **Step 2: FAIL**

- [ ] **Step 3:** `release_allocation` definer RPC with `assert_staff` admin/sales, `update allocations set status = 'released' where id = p_alloc and status = 'open' returning *`. Raise if not found. Query `get_shortfalls` in `orders.ts` reads `atp` where `qty < 0` joined to `skus(name)`.

- [ ] **Step 4–5:** PASS, commit `feat(orders): release_allocation and get_shortfalls`

---

### Task 8: Portal account and invoice queries

**Files:**
- Modify: `lib/commands/portal.ts`
- Modify: `app/(portal)/portal/account/page.tsx`
- Create: `app/(portal)/portal/invoices/[id]/page.tsx`
- Test: `tests/commands-portal.test.ts`

**Interfaces:**
- Produces:
  - `get_portal_account({}) => { customer: { id, name }, shipTos: { id, label, city, state }[], membership: { userId }, deposits: { kegsOnDeposit, depositCents }[] }`
  - `portal_invoice({ invoiceId }) => { invoice, lines }` — 404 via `orNotFound` for another customer's id
- Roles: `customer` only. No new tables; deposits from `keg_deposit_balances` view.

- [ ] **Step 1:** Extend `tests/commands-portal.test.ts`:

```ts
it("get_portal_account returns ship-tos and hides other customers", async () => {
  const acct = await runCommand("get_portal_account", {}, customerCtx) as {
    customer: { name: string }; shipTos: { label: string }[];
  };
  expect(acct.customer.name).toBeDefined();
  expect(acct.shipTos.length).toBeGreaterThan(0);
});

it("portal_invoice returns own invoice and not_found for a foreign one", async () => {
  // use the existing portal order/invoice seed in this file
  const list = await runCommand("portal_invoices", {}, customerCtx) as { id: string }[];
  if (list.length === 0) return; // seed an invoice the same way other tests in this file do
  const one = await runCommand("portal_invoice", { invoiceId: list[0].id }, customerCtx) as { invoice: { id: string } };
  expect(one.invoice.id).toBe(list[0].id);
  await expect(runCommand("portal_invoice", { invoiceId: crypto.randomUUID() }, customerCtx))
    .rejects.toMatchObject({ code: "not_found" });
});
```

If this file has no invoice yet, create one through the existing portal order → staff confirm/pick/ship path already used in `commands-portal.test.ts` / `orders-fulfillment`.

- [ ] **Step 2: FAIL** — unknown command.

- [ ] **Step 3:** Queries only (no RPC): `ship_tos` where `customer_id = ctx.customerId`; `keg_deposit_balances` for that customer; `invoices` + `invoice_lines` filtered by `customer_id` and id. Wrap detail with the same `.single()` that `portal_order` uses so PGRST116 → `not_found`. Rewrite Account page to list ship-tos and deposit row. Invoice detail page shows lines, due, paid_at; **do not** add a Pay button that calls Intuit (`get_qbo_connection` is parked). If `paid_at` is null, show copy "Contact the brewery to pay" matching Payment unavailable's floor, not a dead Pay.

- [ ] **Step 4–5:** PASS, commit `feat(portal): account and invoice reads`

---

### Task 9: `update_location`

**Files:**
- Modify: baseline, `lib/commands/catalog.ts`, matrix, `app/(app)/settings/team/` or new `app/(app)/locations/[id]/page.tsx`
- Test: `tests/commands-catalog.test.ts`

**Interfaces:**
- Produces: `update_location({ locationId, name, kind }) => location row`. Roles: admin. Kind change is allowed; history stays on movements (no rewrite). Unique `(brewery_id, name)` still holds.

- [ ] **Step 1:**

```ts
it("admin renames a location; sales is denied", async () => {
  const loc = await runCommand("create_location", { name: "Old WH", kind: "warehouse" }, adminCtx) as { id: string };
  const row = await runCommand("update_location", { locationId: loc.id, name: "Main WH", kind: "warehouse" }, adminCtx) as { name: string };
  expect(row.name).toBe("Main WH");
  await expect(runCommand("update_location", { locationId: loc.id, name: "Nope", kind: "warehouse" }, salesCtx))
    .rejects.toMatchObject({ code: "permission_denied" });
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3:** Definer RPC mirroring `create_location` with `update public.locations set name = p_name, kind = p_kind where id = p_id and brewery_id = p_brewery returning *`. Live Location detail: name input, kind select (warehouse/taproom only until Program 2 adds storage), Save → `update_location`. Bins nav stays gated until Program 2.

- [ ] **Step 4–5:** PASS, commit `feat(catalog): update_location`

---

### Task 10: Ungate screens, docs, browse

**Files:**
- Modify: `components/mgr/screens.tsx` writes for Put back, Short pick, Pick, Ship on delivery, Return and credit, Pars and allocation (`release_allocation` already named), Location detail, Account, Pay invoice (`portal_invoice` — keep QBO pay gated)
- Run: `bun run docs:api`
- Modify: `content/docs/staff-guide.mdx`, `content/docs/portal-guide.mdx` — Today, put back, short pick, ship on delivery, return, portal account
- Test: `tests/screen-command-gates.test.ts`, `tests/api-docs.test.ts`, `tests/mgr-screens.test.ts` (if copy rules fail, fix the screen string)

- [ ] **Step 1:** Change each shipped write from `name [design; …]` to `name`. Ship on delivery: remove SCHEMA-GATE. Pay invoice reads: `portal_invoice` available; leave `get_qbo_connection` designed.

- [ ] **Step 2:** `bunx vitest run tests/screen-command-gates.test.ts tests/api-docs.test.ts tests/mgr-screens.test.ts` — if api-docs backlog still lists a now-registered name, `bun run docs:api` regenerates it.

- [ ] **Step 3:** Browse skill: session `backend`. Open `/`, `/orders`, an order pick, ship (both chips), put-back, `/portal`, `/portal/account`, `/portal/invoices`. Phone and desk. Empty Today as a role with no work.

- [ ] **Step 4:** Commit `docs: ungate ordering-pilot screens and refresh API + guides`

---

## Validation

```bash
pwd && git branch --show-current   # .../backend and backend
bash scripts/test-db.sh
bunx vitest run tests/orders-fulfillment.test.ts tests/commands-today.test.ts tests/commands-portal.test.ts tests/commands-catalog.test.ts tests/rls-command-boundary.test.ts tests/data-api-boundary.test.ts tests/schema-rules.test.ts tests/api-docs.test.ts tests/screen-command-gates.test.ts tests/nav-ready-links.test.ts
bunx tsc --noEmit
bun run lint
bun run docs:api
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `ship_order` signature change breaks grant list and matrix | High | Named args + SQL default `'now'`; update the grant line in the same commit |
| Today href `/orders/:id/restock` 404 | Medium | Task 2 page must exist before Task 1 is demoed; land Task 2 immediately after Task 1 |
| `keep_owed` drops off Today | High | Task 3 widens `pick_due` |
| Inventing invoice_questions | Medium | Parked. Sales Today question row stays a fixture. |
| Confirm delivery without a route UI | Low | Tests insert `routes`/`deliveries`; live page is `/work/deliveries/[id]` |

## Acceptance

- [ ] Today is live `get_today` including `restock_due`
- [ ] Short pick and put-back are real commands
- [ ] On-delivery ship persists timing; `confirm_delivery` invoices later
- [ ] `return_shipment` credits; damaged posts loss in the same RPC
- [ ] Portal account lists ship-tos; invoice detail reads `portal_invoice`
- [ ] Parked QBO pay / invoice questions still designed
- [ ] Validation commands pass

# Slice 1B — Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wholesale order lifecycle (draft → submitted → confirmed → picked → shipped/cancelled) with allocations, per-shipment invoices, credit memos, taproom replenishment, supporting CRUD, and a customer portal.

**Architecture:** Every lifecycle transition is one plpgsql function (iron rule 5) called via `.rpc()` from a registry command; RLS does tenancy (functions are invoker-rights — do NOT mark them `security definer` except where this plan says so). UI is server-component pages + `useCommandForm` dialogs, mirroring slice 1A's catalog/inventory pages. Portal is a new route group re-using the same registry with `roles: "customer"`.

**Tech Stack:** Next.js App Router, Supabase (local), Zod registry (`lib/commands/registry.ts`), vitest against the real DB, Playwright (new devDependency — approved in spec).

**Spec:** `.agents/superpowers/specs/2026-08-31-mgr-slice1b-orders-design.md` (decisions 1–8 there govern; read it first).

## Global Constraints

- Work ONLY in worktree `.agents/worktrees/slice1b-orders`, branch `slice1b-orders`. Never commit to main. Verify with `pwd` + `git branch --show-current` before edits.
- `npx supabase start` must be running; after any edit to `supabase/migrations/00001_baseline.sql` run `npx supabase db reset` before testing. Edit the baseline in place — no second migration file.
- Prove every task: `npx vitest run && npx tsc --noEmit && npm run lint`.
- Iron rule 5: any command writing ≥2 rows goes through one plpgsql fn (`tests/write-atomicity.test.ts` enforces this — it scans `lib/commands/*.ts` for multi-`.insert/.update` blocks without `.rpc(`).
- All SQL functions: `language plpgsql set search_path = ''` (schema-qualify every table as `public.x`); invoker-rights unless the plan marks one `security definer` (then revoke from public/anon — `tests/schema-rules.test.ts` audits definer fns).
- Money in integer cents; quantities `numeric(12,2)`.
- Registry command names are snake_case verbs; every command gets a `description` (AI-first registry).
- Docs are part of each commit: module-level comment on every new file; `.agents/ARCHITECTURE.md` ownership map updates land with the code that changes ownership (Task 12 collects the rest).

---

### Task 1: Schema — `order_events` + `needs_restock`

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (orders section ~line 767; RLS section ~line 1230)
- Test: `tests/rls-orders.test.ts` (new)

**Interfaces:**
- Produces: table `order_events (id, brewery_id, order_id, actor, event text, payload jsonb, created_at)`; column `orders.needs_restock boolean not null default false`. Later tasks' plpgsql fns insert into `order_events`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/rls-orders.test.ts — order_events RLS + append-only; customer scoping for 1B tables.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeCustomerUser, asUser } from "./helpers";

let b1: { id: string }, b2: { id: string };
let staff1: { id: string; email: string }, staff2: { id: string; email: string };
let customer: { id: string }, custUser: { id: string; email: string };
let order: { id: string };

beforeAll(async () => {
  b1 = await makeBrewery(); b2 = await makeBrewery();
  staff1 = await makeStaff(b1.id); staff2 = await makeStaff(b2.id);
  const { data: c } = await admin.from("customers").insert({ brewery_id: b1.id, name: "Bar X", type: "retailer" }).select().single();
  customer = c!;
  custUser = await makeCustomerUser(customer.id);
  const { data: loc } = await admin.from("locations").insert({ brewery_id: b1.id, name: "WH", kind: "warehouse" }).select().single();
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b1.id, customer_id: customer.id, label: "main", address1: "1 St", city: "Phila", state: "PA", zip: "19100" }).select().single();
  const { data: o } = await admin.from("orders").insert({ brewery_id: b1.id, kind: "wholesale", customer_id: customer.id, ship_to_id: st!.id, from_location_id: loc!.id, created_by: staff1.id }).select().single();
  order = o!;
  await admin.from("order_events").insert({ brewery_id: b1.id, order_id: order.id, actor: staff1.id, event: "created" });
});

describe("order_events", () => {
  it("staff read own brewery; other brewery sees nothing", async () => {
    const db1 = await asUser(staff1.email);
    const { data } = await db1.from("order_events").select().eq("order_id", order.id);
    expect(data!.length).toBe(1);
    const db2 = await asUser(staff2.email);
    const { data: cross } = await db2.from("order_events").select().eq("order_id", order.id);
    expect(cross!.length).toBe(0);
  });
  it("customer reads events for own orders only", async () => {
    const db = await asUser(custUser.email);
    const { data } = await db.from("order_events").select().eq("order_id", order.id);
    expect(data!.length).toBe(1);
  });
  it("is append-only even for staff", async () => {
    const db1 = await asUser(staff1.email);
    const { error: upd } = await db1.from("order_events").update({ event: "tampered" }).eq("order_id", order.id);
    expect(upd).not.toBeNull();
    const { error: del } = await db1.from("order_events").delete().eq("order_id", order.id);
    expect(del).not.toBeNull();
  });
  it("orders.needs_restock exists and defaults false", async () => {
    const { data } = await admin.from("orders").select("needs_restock").eq("id", order.id).single();
    expect(data!.needs_restock).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`relation "order_events" does not exist`): `npx vitest run tests/rls-orders.test.ts`

- [ ] **Step 3: Edit the baseline.** After the `order_lines` block add:

```sql
-- Append-only per-order change log (spec 1B decision 3). Written inside the
-- same plpgsql command functions that make each change; payload is the
-- minimal diff, e.g. {"sku": "...", "qty": [24, 18], "reason": "..."}.
create table order_events (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  order_id uuid not null,
  actor uuid not null references auth.users(id),
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (id, brewery_id),
  foreign key (order_id, brewery_id) references orders (id, brewery_id)
);
create index order_events_order_idx on order_events (order_id, created_at);
```

Add to `orders`: `needs_restock boolean not null default false,` (after `note text,`).

In the RLS section: add `order_events` to `alter table ... enable row level security` and to the revoke-update/delete treatment that keeps `inventory_movements` append-only (find how the baseline does it and mirror exactly). Policies:

```sql
create policy staff_read on order_events for select using (is_staff_of(brewery_id));
create policy staff_insert on order_events for insert
  with check (is_staff_of(brewery_id) and actor = auth.uid());
create policy customer_read on order_events for select
  using (order_id in (select id from orders where customer_id in (select my_customer_ids())));
-- Portal users write events only through their own lifecycle transitions
-- (create/update/submit on their own draft/submitted orders).
create policy customer_insert on order_events for insert
  with check (actor = auth.uid() and order_id in
    (select id from orders where customer_id in (select my_customer_ids())));
```

Also check `tests/schema-conventions.test.ts` and `tests/schema-rules.test.ts` — if either enumerates tables (append-only list, composite-FK list), add `order_events`.

- [ ] **Step 4: `npx supabase db reset`, then `npx vitest run` — all green, plus `npx tsc --noEmit && npm run lint`**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(schema): order_events log + orders.needs_restock"`

---

### Task 2: Schema — order lifecycle plpgsql functions

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (add a `-- order lifecycle commands` section after the shipments/invoices DDL and before the RLS section)
- Test: `tests/orders-lifecycle.test.ts` (new)

**Interfaces:**
- Produces (all `returns jsonb`, invoker-rights, callable via `.rpc(name, {...})`):
  - `create_order(p_brewery uuid, p_kind order_kind, p_customer uuid, p_ship_to uuid, p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb)` → `{order_id}`. `p_lines`: `[{"sku_id": uuid, "qty": n}]`. Unit price resolved from the customer's price list (`taproom_transfer`: price 0, customer/ship_to null). Raises if a wholesale line has no price. Writes event `created`.
  - `update_draft_order(p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb)` → `{order_id}`; full line replacement; only while `draft`. Event `updated`.
  - `submit_order(p_order uuid)` → `{order_id}`; `draft → submitted`. Event `submitted`.
  - `confirm_order(p_order uuid)` → `{order_id, warnings: [{sku_id, atp}]}`; `submitted → confirmed`; inserts one open allocation per line; warnings list SKUs whose ATP is now negative (soft — never blocks).
  - `adjust_order_lines(p_order uuid, p_lines jsonb, p_reason text)` → `{order_id}`; full line replacement while `confirmed`/`picked`; re-syncs open allocations atomically; when `picked`, sets `needs_restock = true`. Event `lines_adjusted` with before-quantities and reason.
  - `cancel_order(p_order uuid, p_reason text)` → `{order_id}`; any status except `shipped`/`cancelled`; releases open allocations; if it was `picked`, sets `needs_restock = true`. Event `cancelled`.

All functions: lock the order row first (`select ... for update` — serializes concurrent transitions); raise `order not found` if no row (covers RLS-invisible rows), `order is <status>` on wrong status.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orders-lifecycle.test.ts — create → submit → confirm → adjust → cancel via rpc.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

let b: { id: string }, staffDb: SupabaseClient, staffId: string;
let customerId: string, shipToId: string, whId: string, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  const staff = await makeStaff(b.id); staffId = staff.id; staffDb = await asUser(staff.email);
  const { data: wh } = await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" }).select().single();
  whId = wh!.id;
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA 1/2bbl", bbl_per_unit: 0.5 }).select().single();
  skuId = s!.id;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 12000 });
  const { data: c } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", price_list_id: pl!.id }).select().single();
  customerId = c!.id;
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
  shipToId = st!.id;
  // on-hand: 100 units
  await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, qty: 100, type: "opening_balance", created_by: staffId });
});

async function createOrder(qty = 10) {
  const { data, error } = await staffDb.rpc("create_order", {
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: "2026-09-05", p_po: null, p_note: null,
    p_lines: [{ sku_id: skuId, qty }],
  });
  expect(error).toBeNull();
  return (data as { order_id: string }).order_id;
}

describe("order lifecycle", () => {
  it("create snapshots the price-list price and logs an event", async () => {
    const id = await createOrder();
    const { data: line } = await admin.from("order_lines").select().eq("order_id", id).single();
    expect(line!.unit_price_cents).toBe(12000);
    const { data: ev } = await admin.from("order_events").select().eq("order_id", id);
    expect(ev!.map(e => e.event)).toEqual(["created"]);
  });
  it("confirm creates allocations and returns no warning when ATP covers it", async () => {
    const id = await createOrder(10);
    await staffDb.rpc("submit_order", { p_order: id });
    const { data, error } = await staffDb.rpc("confirm_order", { p_order: id });
    expect(error).toBeNull();
    expect((data as { warnings: unknown[] }).warnings).toEqual([]);
    const { data: allocs } = await admin.from("allocations").select().eq("brewery_id", b.id).eq("status", "open");
    expect(allocs!.some(a => Number(a.qty) === 10)).toBe(true);
  });
  it("confirm warns (but does not block) when overselling", async () => {
    const id = await createOrder(500);
    await staffDb.rpc("submit_order", { p_order: id });
    const { data, error } = await staffDb.rpc("confirm_order", { p_order: id });
    expect(error).toBeNull();
    const warnings = (data as { warnings: { sku_id: string; atp: number }[] }).warnings;
    expect(warnings.length).toBe(1);
    expect(Number(warnings[0].atp)).toBeLessThan(0);
  });
  it("adjust re-syncs allocations; cancel releases them", async () => {
    const id = await createOrder(10);
    await staffDb.rpc("submit_order", { p_order: id });
    await staffDb.rpc("confirm_order", { p_order: id });
    const { error: adjErr } = await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 4 }], p_reason: "short week" });
    expect(adjErr).toBeNull();
    const { data: line } = await admin.from("order_lines").select().eq("order_id", id).single();
    expect(Number(line!.qty_ordered)).toBe(4);
    const { data: alloc } = await admin.from("allocations").select().eq("ref", line!.id).eq("status", "open").single();
    expect(Number(alloc!.qty)).toBe(4);
    await staffDb.rpc("cancel_order", { p_order: id, p_reason: "closed" });
    const { data: released } = await admin.from("allocations").select().eq("ref", line!.id).single();
    expect(released!.status).toBe("released");
    const { data: o } = await admin.from("orders").select("status").eq("id", id).single();
    expect(o!.status).toBe("cancelled");
  });
  it("rejects wrong-status transitions", async () => {
    const id = await createOrder();
    const { error } = await staffDb.rpc("confirm_order", { p_order: id }); // still draft
    expect(error!.message).toMatch(/draft/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`function create_order does not exist`).

- [ ] **Step 3: Add the functions to the baseline.** The complete section:

```sql
-- ------------------------------------------------- order lifecycle commands
-- One function per transition (iron rule 5). Invoker-rights: RLS does
-- tenancy; each starts by locking the order row. p_lines is a full
-- replacement: [{"sku_id": uuid, "qty": n}].

-- Resolves the unit price for a sku from a price list; raises if missing.
create function order_line_price(p_brewery uuid, p_price_list uuid, p_sku uuid) returns int
language plpgsql stable set search_path = '' as $$
declare v int;
begin
  select unit_price_cents into v from public.price_list_items
    where brewery_id = p_brewery and price_list_id = p_price_list and sku_id = p_sku;
  if v is null then raise exception 'no price for sku % on price list', p_sku; end if;
  return v;
end $$;

create function create_order(
  p_brewery uuid, p_kind public.order_kind, p_customer uuid, p_ship_to uuid,
  p_from_location uuid, p_to_location uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_order uuid; v_pl uuid; l record;
begin
  if p_kind = 'wholesale' then
    select price_list_id into v_pl from public.customers where id = p_customer and brewery_id = p_brewery;
    if v_pl is null then raise exception 'customer has no price list'; end if;
  end if;
  insert into public.orders (brewery_id, kind, customer_id, ship_to_id, from_location_id, to_location_id,
                             price_list_id, requested_ship_date, po_number, note, created_by)
  values (p_brewery, p_kind, p_customer, p_ship_to, p_from_location, p_to_location,
          v_pl, p_requested, p_po, p_note, auth.uid())
  returning id into v_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (p_brewery, v_order, l.sku_id, l.qty,
            case when p_kind = 'wholesale' then public.order_line_price(p_brewery, v_pl, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (p_brewery, v_order, auth.uid(), 'created', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', v_order);
end $$;

-- Shared guard: lock the order, check status, return the row.
create function lock_order(p_order uuid, p_allowed public.order_status[]) returns public.orders
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if not (o.status = any(p_allowed)) then raise exception 'order is %', o.status; end if;
  return o;
end $$;

create function update_draft_order(
  p_order uuid, p_ship_to uuid, p_requested date, p_po text, p_note text, p_lines jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare o public.orders; l record;
begin
  o := public.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set ship_to_id = coalesce(p_ship_to, ship_to_id),
    requested_ship_date = coalesce(p_requested, requested_ship_date),
    po_number = coalesce(p_po, po_number), note = coalesce(p_note, note)
    where id = p_order;
  delete from public.order_lines where order_id = p_order;
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then public.order_line_price(o.brewery_id, o.price_list_id, l.sku_id) else 0 end);
  end loop;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'updated', jsonb_build_object('lines', p_lines));
  return jsonb_build_object('order_id', p_order);
end $$;

create function submit_order(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  o := public.lock_order(p_order, array['draft']::public.order_status[]);
  update public.orders set status = 'submitted' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'submitted');
  return jsonb_build_object('order_id', p_order);
end $$;

create function confirm_order(p_order uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; w jsonb;
begin
  o := public.lock_order(p_order, array['submitted']::public.order_status[]);
  insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
  select o.brewery_id, sku_id, qty_ordered, 'order_line', id, 'open'
  from public.order_lines where order_id = p_order;
  update public.orders set status = 'confirmed' where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event)
  values (o.brewery_id, p_order, auth.uid(), 'confirmed');
  select coalesce(jsonb_agg(jsonb_build_object('sku_id', a.sku_id, 'atp', a.qty)), '[]') into w
  from public.atp a join public.order_lines ol on ol.sku_id = a.sku_id and ol.order_id = p_order
  where a.brewery_id = o.brewery_id and a.qty < 0;
  return jsonb_build_object('order_id', p_order, 'warnings', w);
end $$;

create function adjust_order_lines(p_order uuid, p_lines jsonb, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; l record; v_line uuid; v_before jsonb;
begin
  o := public.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  select jsonb_object_agg(ol.sku_id, ol.qty_ordered) into v_before
  from public.order_lines ol where ol.order_id = p_order;
  -- Drop lines (and their open allocations) not present in the new set.
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order
                and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e));
  delete from public.order_lines where order_id = p_order
    and sku_id not in (select (e->>'sku_id')::uuid from jsonb_array_elements(p_lines) e);
  for l in select (e->>'sku_id')::uuid as sku_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.order_lines (brewery_id, order_id, sku_id, qty_ordered, unit_price_cents)
    values (o.brewery_id, p_order, l.sku_id, l.qty,
            case when o.kind = 'wholesale' then public.order_line_price(o.brewery_id, o.price_list_id, l.sku_id) else 0 end)
    on conflict (order_id, sku_id) do update set qty_ordered = excluded.qty_ordered
    returning id into v_line;
    update public.allocations set qty = l.qty
      where source = 'order_line' and ref = v_line and status = 'open';
    insert into public.allocations (brewery_id, sku_id, qty, source, ref, status)
    select o.brewery_id, l.sku_id, l.qty, 'order_line', v_line, 'open'
    where not exists (select 1 from public.allocations where source = 'order_line' and ref = v_line and status = 'open');
  end loop;
  update public.orders set needs_restock = needs_restock or (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'lines_adjusted',
          jsonb_build_object('before', v_before, 'lines', p_lines, 'reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $$;

create function cancel_order(p_order uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  o := public.lock_order(p_order, array['draft','submitted','confirmed','picked']::public.order_status[]);
  update public.allocations set status = 'released'
  where source = 'order_line' and status = 'open'
    and ref in (select id from public.order_lines where order_id = p_order);
  update public.orders set status = 'cancelled', needs_restock = (o.status = 'picked') where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'cancelled', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('order_id', p_order);
end $$;
```

Note: `order_lines` has `unique (order_id, sku_id)` — the `on conflict` in `adjust_order_lines` relies on it. The `allocations.ref` validation trigger already guards line refs.

- [ ] **Step 4: `npx supabase db reset && npx vitest run tests/orders-lifecycle.test.ts` — green; then full `npx vitest run && npx tsc --noEmit && npm run lint`.**

- [ ] **Step 5: Commit** — `git commit -am "feat(schema): order lifecycle functions (create/submit/confirm/adjust/cancel)"`

---

### Task 3: Schema — pick, ship, credit memo, replenishment functions

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (same section as Task 2)
- Test: `tests/orders-fulfillment.test.ts` (new)

**Interfaces:**
- Produces:
  - `record_pick(p_order uuid, p_picks jsonb)` → `{order_id}`. `p_picks`: `[{"line_id": uuid, "qty_picked": n}]`. `confirmed|picked → picked`; clears `needs_restock`. Event `picked` (payload: the picks).
  - `ship_order(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text)` → `{order_id, invoice_id}` (`invoice_id` null for transfers). `p_ship`: `[{"line_id": uuid, "qty_shipped": n}]`. `picked → shipped`, one transaction: shipment row; per line `qty_shipped`; wholesale: `sale_removal` movement per shipped line (qty negative, channel `wholesale`, `dest_state` from the ship-to, `ref` = order id) + invoice (kind `invoice`, one `sku` line per shipped line at snapshot price); transfer: paired `taproom_transfer` movements (−qty at `from_location_id`, +qty at `to_location_id`), no invoice; allocations `fulfilled` (shipped lines) / `released` (zero-shipped); `shipped_at` + `needs_restock=false`. Event `shipped`.
  - `create_credit_memo(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text)` → `{invoice_id}`. `p_lines`: `[{"invoice_line_id": uuid, "qty": n}]` (positive return qty). Writes `credit_memo` invoice with negative-qty lines at original unit price + `return_in` movements (+qty) at `p_location`.
  - `create_replenishment_order(p_from uuid, p_to uuid, p_lines jsonb)` → `{order_id}`. Creates a `taproom_transfer` order already `confirmed` with allocations (delegates to `create_order` + `submit_order` + `confirm_order`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/orders-fulfillment.test.ts — pick → ship → movements + invoice; credit memo; replenishment; needs_restock.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

let b: { id: string }, staffDb: SupabaseClient, staffId: string;
let customerId: string, shipToId: string, whId: string, tapId: string, skuId: string;

beforeAll(async () => {
  // identical seed to tests/orders-lifecycle.test.ts, plus a taproom location:
  b = await makeBrewery();
  const staff = await makeStaff(b.id); staffId = staff.id; staffDb = await asUser(staff.email);
  const { data: wh } = await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" }).select().single();
  whId = wh!.id;
  const { data: tap } = await admin.from("locations").insert({ brewery_id: b.id, name: "Taproom", kind: "taproom" }).select().single();
  tapId = tap!.id;
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA 1/2bbl", bbl_per_unit: 0.5 }).select().single();
  skuId = s!.id;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 12000 });
  const { data: c } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", price_list_id: pl!.id }).select().single();
  customerId = c!.id;
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
  shipToId = st!.id;
  await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, qty: 100, type: "opening_balance", created_by: staffId });
});

async function confirmedOrder(qty = 10) {
  const { data } = await staffDb.rpc("create_order", {
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
    p_lines: [{ sku_id: skuId, qty }],
  });
  const id = (data as { order_id: string }).order_id;
  await staffDb.rpc("submit_order", { p_order: id });
  await staffDb.rpc("confirm_order", { p_order: id });
  return id;
}
async function lineOf(orderId: string) {
  const { data } = await admin.from("order_lines").select().eq("order_id", orderId).single();
  return data!;
}

describe("pick and ship", () => {
  it("short ship writes movement + invoice for shipped qty and fulfills allocations", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 8 }] });
    const { data, error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 8 }], p_carrier: "self", p_tracking: null });
    expect(error).toBeNull();
    const inv = (data as { invoice_id: string }).invoice_id;
    const { data: mv } = await admin.from("inventory_movements").select().eq("ref", id);
    expect(mv!.length).toBe(1);
    expect(Number(mv![0].qty)).toBe(-8);
    expect(mv![0].type).toBe("sale_removal");
    expect(mv![0].dest_state).toBe("PA");
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", inv);
    expect(Number(il![0].qty)).toBe(8);
    expect(il![0].unit_price_cents).toBe(12000);
    const { data: alloc } = await admin.from("allocations").select().eq("ref", line.id).single();
    expect(alloc!.status).toBe("fulfilled");
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.status).toBe("shipped");
  });
  it("adjust after pick sets needs_restock; re-pick clears it", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }] });
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 6 }], p_reason: "cut" });
    let { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.needs_restock).toBe(true);
    const l2 = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: l2.id, qty_picked: 6 }] });
    ({ data: o } = await admin.from("orders").select().eq("id", id).single());
    expect(o!.needs_restock).toBe(false);
  });
});

describe("credit memo", () => {
  it("writes negative invoice lines and return_in movements", async () => {
    const id = await confirmedOrder(5);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 5 }] });
    const { data: shipped } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 5 }], p_carrier: null, p_tracking: null });
    const invId = (shipped as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();
    const { data: cm, error } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 2 }], p_location: whId, p_reason: "damaged",
    });
    expect(error).toBeNull();
    const cmId = (cm as { invoice_id: string }).invoice_id;
    const { data: cmLines } = await admin.from("invoice_lines").select().eq("invoice_id", cmId);
    expect(Number(cmLines![0].qty)).toBe(-2);
    expect(cmLines![0].unit_price_cents).toBe(12000);
    const { data: ret } = await admin.from("inventory_movements").select().eq("type", "return_in").eq("brewery_id", b.id);
    expect(ret!.some(m => Number(m.qty) === 2)).toBe(true);
  });
});

describe("replenishment", () => {
  it("creates a confirmed taproom_transfer order; shipping it moves stock between locations, no invoice", async () => {
    const { data, error } = await staffDb.rpc("create_replenishment_order", {
      p_from: whId, p_to: tapId, p_lines: [{ sku_id: skuId, qty: 3 }],
    });
    expect(error).toBeNull();
    const id = (data as { order_id: string }).order_id;
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.kind).toBe("taproom_transfer");
    expect(o!.status).toBe("confirmed");
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }] });
    const { data: shipRes } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }], p_carrier: null, p_tracking: null });
    expect((shipRes as { invoice_id: string | null }).invoice_id).toBeNull();
    const { data: mv } = await admin.from("inventory_movements").select().eq("ref", id).eq("type", "taproom_transfer");
    expect(mv!.length).toBe(2);
    expect(Number(mv!.find(m => m.location_id === tapId)!.qty)).toBe(3);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`function record_pick does not exist`).

- [ ] **Step 3: Add the functions** (same baseline section). Read the actual `invoices`/`invoice_lines` DDL (baseline lines 844–895) first — column names there win over this plan:

```sql
create function record_pick(p_order uuid, p_picks jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; pk record;
begin
  o := public.lock_order(p_order, array['confirmed','picked']::public.order_status[]);
  for pk in select (e->>'line_id')::uuid as line_id, (e->>'qty_picked')::numeric as qty from jsonb_array_elements(p_picks) e loop
    update public.order_lines set qty_picked = pk.qty where id = pk.line_id and order_id = p_order;
  end loop;
  update public.orders set status = 'picked', needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'picked', jsonb_build_object('picks', p_picks));
  return jsonb_build_object('order_id', p_order);
end $$;

create function ship_order(p_order uuid, p_ship jsonb, p_carrier text, p_tracking text) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; sp record; v_state text; v_invoice uuid; v_shipment uuid;
begin
  o := public.lock_order(p_order, array['picked']::public.order_status[]);
  insert into public.shipments (brewery_id, order_id, carrier, tracking, created_by)
  values (o.brewery_id, p_order, p_carrier, p_tracking, auth.uid()) returning id into v_shipment;
  if o.kind = 'wholesale' then
    select state into v_state from public.ship_tos where id = o.ship_to_id;
    insert into public.invoices (brewery_id, kind, customer_id, shipment_id, issued_on, created_by)
    values (o.brewery_id, 'invoice', o.customer_id, v_shipment, current_date, auth.uid())
    returning id into v_invoice;
  end if;
  for sp in select (e->>'line_id')::uuid as line_id, (e->>'qty_shipped')::numeric as qty from jsonb_array_elements(p_ship) e loop
    update public.order_lines set qty_shipped = sp.qty where id = sp.line_id and order_id = p_order;
    if sp.qty > 0 then
      if o.kind = 'wholesale' then
        insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, channel, dest_state, ref, created_by)
        select o.brewery_id, ol.sku_id, o.from_location_id, -sp.qty, 'sale_removal', 'wholesale', v_state, p_order, auth.uid()
        from public.order_lines ol where ol.id = sp.line_id;
        insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents)
        select o.brewery_id, v_invoice, 'sku', ol.sku_id, sp.qty, ol.unit_price_cents
        from public.order_lines ol where ol.id = sp.line_id;
      else
        insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, ref, created_by)
        select o.brewery_id, ol.sku_id, o.from_location_id, -sp.qty, 'taproom_transfer', p_order, auth.uid()
        from public.order_lines ol where ol.id = sp.line_id;
        insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, ref, created_by)
        select o.brewery_id, ol.sku_id, o.to_location_id, sp.qty, 'taproom_transfer', p_order, auth.uid()
        from public.order_lines ol where ol.id = sp.line_id;
      end if;
      update public.allocations set status = 'fulfilled'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    else
      update public.allocations set status = 'released'
        where source = 'order_line' and ref = sp.line_id and status = 'open';
    end if;
  end loop;
  update public.orders set status = 'shipped', shipped_at = now(), needs_restock = false where id = p_order;
  insert into public.order_events (brewery_id, order_id, actor, event, payload)
  values (o.brewery_id, p_order, auth.uid(), 'shipped',
          jsonb_build_object('ship', p_ship, 'carrier', p_carrier, 'invoice_id', v_invoice));
  return jsonb_build_object('order_id', p_order, 'invoice_id', v_invoice);
end $$;

create function create_credit_memo(p_invoice uuid, p_lines jsonb, p_location uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_inv public.invoices; v_cm uuid; cl record;
begin
  select * into v_inv from public.invoices where id = p_invoice;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.kind <> 'invoice' then raise exception 'can only credit an invoice'; end if;
  insert into public.invoices (brewery_id, kind, customer_id, issued_on, created_by)
  values (v_inv.brewery_id, 'credit_memo', v_inv.customer_id, current_date, auth.uid())
  returning id into v_cm;
  for cl in select (e->>'invoice_line_id')::uuid as line_id, (e->>'qty')::numeric as qty from jsonb_array_elements(p_lines) e loop
    insert into public.invoice_lines (brewery_id, invoice_id, kind, sku_id, qty, unit_price_cents)
    select v_inv.brewery_id, v_cm, 'sku', il.sku_id, -cl.qty, il.unit_price_cents
    from public.invoice_lines il where il.id = cl.line_id and il.invoice_id = p_invoice;
    insert into public.inventory_movements (brewery_id, sku_id, location_id, qty, type, note, created_by)
    select v_inv.brewery_id, il.sku_id, p_location, cl.qty, 'return_in', p_reason, auth.uid()
    from public.invoice_lines il where il.id = cl.line_id and il.invoice_id = p_invoice;
  end loop;
  return jsonb_build_object('invoice_id', v_cm);
end $$;

-- Par-gap replenishment: a taproom_transfer order born confirmed (allocations held).
create function create_replenishment_order(p_from uuid, p_to uuid, p_lines jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare v_brewery uuid; v jsonb;
begin
  select brewery_id into v_brewery from public.locations where id = p_to;
  if v_brewery is null then raise exception 'location not found'; end if;
  v := public.create_order(v_brewery, 'taproom_transfer', null, null, p_from, p_to, null, null, null, p_lines);
  perform public.submit_order((v->>'order_id')::uuid);
  perform public.confirm_order((v->>'order_id')::uuid);
  return v;
end $$;
```

- [ ] **Step 4: `npx supabase db reset && npx vitest run` — green; `npx tsc --noEmit && npm run lint`.**

- [ ] **Step 5: Commit** — `git commit -am "feat(schema): pick/ship/credit-memo/replenishment functions"`

---

### Task 4: Registry commands — orders (`lib/commands/orders.ts`)

**Files:**
- Create: `lib/commands/orders.ts`
- Modify: `lib/commands/all.ts` (add `import "./orders";`)
- Test: `tests/commands-orders.test.ts` (new)

**Interfaces:**
- Consumes: rpc fns from Tasks 2–3; `defineCommand/defineQuery/unwrap/Ctx` from `./registry`.
- Produces commands: `create_order`, `update_draft_order`, `submit_order`, `confirm_order`, `adjust_order_lines`, `cancel_order`, `record_pick`, `ship_order`, `create_credit_memo`, `create_replenishment_order`; queries: `list_orders`, `get_order`, `daily_pick_sheet`, `list_invoices`, `get_invoice`, `replenishment_suggestions`.

- [ ] **Step 1: Write the failing test.** Registry layer only (the SQL is already tested): role gating, input validation, one happy path.

```ts
// tests/commands-orders.test.ts — registry wiring for order commands: roles, validation, rpc passthrough.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>, brewerCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let customerId: string, shipToId: string, whId: string, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  brewerCtx = await makeStaffCtx(b.id, "brewer");
  const { data: wh } = await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" }).select().single();
  whId = wh!.id;
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", bbl_per_unit: 0.0645 }).select().single();
  skuId = s!.id;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 3600 });
  const { data: c } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", price_list_id: pl!.id }).select().single();
  customerId = c!.id;
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
  shipToId = st!.id;
});

describe("order commands", () => {
  it("create_order → submit → confirm → get_order shows lines + events", async () => {
    const created = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId,
      lines: [{ skuId, qty: 5 }],
    }, adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId: created.order_id }, adminCtx);
    await runCommand("confirm_order", { orderId: created.order_id }, adminCtx);
    const full = await runCommand("get_order", { orderId: created.order_id }, adminCtx) as
      { order: { status: string }; lines: unknown[]; events: { event: string }[] };
    expect(full.order.status).toBe("confirmed");
    expect(full.lines.length).toBe(1);
    expect(full.events.map(e => e.event)).toEqual(["created", "submitted", "confirmed"]);
  });
  it("brewer role cannot create orders", async () => {
    await expect(runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 1 }],
    }, brewerCtx)).rejects.toThrow(/permission denied/);
  });
  it("rejects empty lines", async () => {
    await expect(runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [],
    }, adminCtx)).rejects.toThrow(/validation failed/);
  });
  it("list_orders filters by status", async () => {
    const rows = await runCommand("list_orders", { status: "confirmed" }, adminCtx) as { status: string }[];
    expect(rows.every(r => r.status === "confirmed")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`unknown command: create_order`).

- [ ] **Step 3: Implement `lib/commands/orders.ts`.**

```ts
// lib/commands/orders.ts — order lifecycle commands. Every mutation delegates
// to one plpgsql function (00001_baseline.sql, iron rule 5); this layer does
// zod validation, role gating, and camelCase→p_* argument mapping.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

const lines = z.array(z.object({ skuId: z.string().uuid(), qty: z.number().positive() })).min(1);
const salesRoles = ["admin", "sales"] as const;
const warehouseRoles = ["admin", "warehouse"] as const;
const readRoles = ["admin", "sales", "warehouse"] as const;
const toLines = (ls: z.infer<typeof lines>) => ls.map(l => ({ sku_id: l.skuId, qty: l.qty }));

defineCommand({
  name: "create_order", description: "Create a draft order (wholesale or taproom transfer) with price-snapshot lines",
  roles: [...salesRoles],
  input: z.object({
    kind: z.enum(["wholesale", "taproom_transfer"]),
    customerId: z.string().uuid().optional(), shipToId: z.string().uuid().optional(),
    fromLocationId: z.string().uuid(), toLocationId: z.string().uuid().optional(),
    requestedShipDate: z.string().date().optional(), poNumber: z.string().optional(), note: z.string().optional(),
    lines,
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("create_order", {
    p_brewery: ctx.breweryId, p_kind: i.kind, p_customer: i.customerId ?? null, p_ship_to: i.shipToId ?? null,
    p_from_location: i.fromLocationId, p_to_location: i.toLocationId ?? null,
    p_requested: i.requestedShipDate ?? null, p_po: i.poNumber ?? null, p_note: i.note ?? null,
    p_lines: toLines(i.lines),
  })),
});

defineCommand({
  name: "update_draft_order", description: "Replace a draft order's header fields and lines",
  roles: [...salesRoles],
  input: z.object({
    orderId: z.string().uuid(), shipToId: z.string().uuid().optional(),
    requestedShipDate: z.string().date().optional(), poNumber: z.string().optional(), note: z.string().optional(),
    lines,
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("update_draft_order", {
    p_order: i.orderId, p_ship_to: i.shipToId ?? null, p_requested: i.requestedShipDate ?? null,
    p_po: i.poNumber ?? null, p_note: i.note ?? null, p_lines: toLines(i.lines),
  })),
});

defineCommand({
  name: "submit_order", description: "Submit a draft order for confirmation",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("submit_order", { p_order: i.orderId })),
});

defineCommand({
  name: "confirm_order", description: "Confirm a submitted order; creates allocations and returns ATP soft warnings",
  roles: [...salesRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("confirm_order", { p_order: i.orderId })),
});

defineCommand({
  name: "adjust_order_lines", description: "Replace lines on a confirmed/picked order; re-syncs allocations; flags restocking when picked",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1), lines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("adjust_order_lines", { p_order: i.orderId, p_lines: toLines(i.lines), p_reason: i.reason })),
});

defineCommand({
  name: "cancel_order", description: "Cancel an unshipped order and release its allocations",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({ orderId: z.string().uuid(), reason: z.string().min(1) }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("cancel_order", { p_order: i.orderId, p_reason: i.reason })),
});

const pickLines = z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative() })).min(1);

defineCommand({
  name: "record_pick", description: "Record picked quantities per line; order becomes picked",
  roles: [...warehouseRoles],
  input: z.object({ orderId: z.string().uuid(), picks: pickLines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("record_pick", {
    p_order: i.orderId, p_picks: i.picks.map(p => ({ line_id: p.lineId, qty_picked: p.qty })),
  })),
});

defineCommand({
  name: "ship_order", description: "Ship a picked order: movements + allocation fulfillment + invoice, one transaction",
  roles: [...warehouseRoles], requiresConfirmation: true,
  input: z.object({
    orderId: z.string().uuid(), carrier: z.string().optional(), tracking: z.string().optional(),
    ship: pickLines,
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("ship_order", {
    p_order: i.orderId, p_ship: i.ship.map(s => ({ line_id: s.lineId, qty_shipped: s.qty })),
    p_carrier: i.carrier ?? null, p_tracking: i.tracking ?? null,
  })),
});

defineCommand({
  name: "create_credit_memo", description: "Credit an invoice: negative lines at original prices + return_in movements",
  roles: [...salesRoles], requiresConfirmation: true,
  input: z.object({
    invoiceId: z.string().uuid(), locationId: z.string().uuid(), reason: z.string().min(1),
    lines: z.array(z.object({ invoiceLineId: z.string().uuid(), qty: z.number().positive() })).min(1),
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("create_credit_memo", {
    p_invoice: i.invoiceId, p_lines: i.lines.map(l => ({ invoice_line_id: l.invoiceLineId, qty: l.qty })),
    p_location: i.locationId, p_reason: i.reason,
  })),
});

defineCommand({
  name: "create_replenishment_order", description: "Create a confirmed taproom transfer order from par-gap quantities",
  roles: [...salesRoles],
  input: z.object({ fromLocationId: z.string().uuid(), toLocationId: z.string().uuid(), lines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("create_replenishment_order", {
    p_from: i.fromLocationId, p_to: i.toLocationId, p_lines: toLines(i.lines),
  })),
});

// ---- queries ----

defineQuery({
  name: "list_orders", description: "Orders newest-first, optionally by status",
  roles: [...readRoles],
  input: z.object({ status: z.enum(["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"]).optional(), limit: z.number().int().max(200).default(50) }),
  handler: (ctx, i) => {
    let q = ctx.db.from("orders").select("*, customers(name)")
      .eq("brewery_id", ctx.breweryId).order("created_at", { ascending: false }).limit(i.limit);
    if (i.status) q = q.eq("status", i.status);
    return unwrap(q);
  },
});

defineQuery({
  name: "get_order", description: "One order with lines, events, shipment, and per-SKU ATP",
  roles: [...readRoles],
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const order = await unwrap(ctx.db.from("orders").select("*, customers(name), ship_tos(label, city, state)").eq("id", i.orderId).single());
    const [ln, events, shipment, atp] = await Promise.all([
      unwrap(ctx.db.from("order_lines").select("*, skus(name)").eq("order_id", i.orderId)),
      unwrap(ctx.db.from("order_events").select().eq("order_id", i.orderId).order("created_at")),
      unwrap(ctx.db.from("shipments").select().eq("order_id", i.orderId).maybeSingle()),
      unwrap(ctx.db.from("atp").select().eq("brewery_id", ctx.breweryId)),
    ]);
    return { order, lines: ln, events, shipment, atp };
  },
});

defineQuery({
  name: "daily_pick_sheet", description: "Confirmed/picked orders grouped by requested ship date with lines",
  roles: [...readRoles],
  input: z.object({ date: z.string().date().optional() }),
  handler: (ctx, i) => {
    let q = ctx.db.from("orders")
      .select("*, customers(name), order_lines(*, skus(name))")
      .eq("brewery_id", ctx.breweryId).in("status", ["confirmed", "picked"])
      .order("requested_ship_date", { ascending: true });
    if (i.date) q = q.eq("requested_ship_date", i.date);
    return unwrap(q);
  },
});

defineQuery({
  name: "list_invoices", description: "Invoices and credit memos, newest first",
  roles: [...readRoles],
  input: z.object({ customerId: z.string().uuid().optional(), limit: z.number().int().max(200).default(50) }),
  handler: (ctx, i) => {
    let q = ctx.db.from("invoices").select("*, customers(name)").eq("brewery_id", ctx.breweryId)
      .order("created_at", { ascending: false }).limit(i.limit);
    if (i.customerId) q = q.eq("customer_id", i.customerId);
    return unwrap(q);
  },
});

defineQuery({
  name: "get_invoice", description: "One invoice with its lines",
  roles: [...readRoles],
  input: z.object({ invoiceId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const invoice = await unwrap(ctx.db.from("invoices").select("*, customers(name)").eq("id", i.invoiceId).single());
    const invLines = await unwrap(ctx.db.from("invoice_lines").select("*, skus(name)").eq("invoice_id", i.invoiceId));
    return { invoice, lines: invLines };
  },
});

defineQuery({
  name: "replenishment_suggestions", description: "Per-taproom par gap: par − on-hand, suggested transfer qty",
  roles: [...readRoles],
  input: z.object({ locationId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const [pars, onHand] = await Promise.all([
      unwrap(ctx.db.from("taproom_pars").select("*, skus(name)").eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId)),
      unwrap(ctx.db.from("on_hand").select().eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId)),
    ]);
    const oh = new Map(onHand.map((r: { sku_id: string; qty: number }) => [r.sku_id, Number(r.qty)]));
    return pars.map((p: { sku_id: string; par_qty: number; skus: { name: string } }) => ({
      skuId: p.sku_id, sku: p.skus.name, par: Number(p.par_qty), onHand: oh.get(p.sku_id) ?? 0,
      suggested: Math.max(0, Number(p.par_qty) - (oh.get(p.sku_id) ?? 0)),
    }));
  },
});
```

Add `import "./orders";` to `lib/commands/all.ts`.

- [ ] **Step 4: `npx vitest run` (write-atomicity passes: every mutation is a single `.rpc(`); `npx tsc --noEmit && npm run lint`.**

- [ ] **Step 5: Commit** — `git commit -am "feat(commands): order lifecycle + fulfillment + invoice commands"`

---

### Task 5: Registry commands — customers, ship-tos, price lists (`lib/commands/customers.ts`)

**Files:**
- Create: `lib/commands/customers.ts`
- Modify: `lib/commands/all.ts` (add `import "./customers";`)
- Test: `tests/commands-customers.test.ts` (new)

**Interfaces:**
- Produces commands: `upsert_customer`, `upsert_ship_to`, `upsert_price_list`, `set_price`; queries: `list_customers`, `get_customer`, `list_price_lists`.

- [ ] **Step 1: Failing test**

```ts
// tests/commands-customers.test.ts — customer/ship-to/price-list CRUD commands.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, ctx: Awaited<ReturnType<typeof makeStaffCtx>>, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "sales");
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", bbl_per_unit: 0.0645 }).select().single();
  skuId = s!.id;
});

describe("customer CRUD", () => {
  it("creates a price list, prices a sku, creates a customer on it, adds a ship-to", async () => {
    const pl = await runCommand("upsert_price_list", { name: "2026 wholesale" }, ctx) as { id: string };
    await runCommand("set_price", { priceListId: pl.id, skuId, unitPriceCents: 3400 }, ctx);
    const cust = await runCommand("upsert_customer", {
      name: "Green Bar", type: "retailer", priceListId: pl.id,
    }, ctx) as { id: string };
    await runCommand("upsert_ship_to", {
      customerId: cust.id, label: "Main", address1: "1 Main St", city: "Phila", state: "PA", zip: "19107",
    }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as
      { customer: { name: string }; shipTos: unknown[] };
    expect(got.customer.name).toBe("Green Bar");
    expect(got.shipTos.length).toBe(1);
  });
  it("update via same command with id", async () => {
    const cust = await runCommand("upsert_customer", { name: "Old Name", type: "retailer" }, ctx) as { id: string };
    await runCommand("upsert_customer", { id: cust.id, name: "New Name", type: "retailer" }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as { customer: { name: string } };
    expect(got.customer.name).toBe("New Name");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`unknown command: upsert_price_list`).

- [ ] **Step 3: Implement.** Single-row upserts — no rpc needed. Read the `customers` DDL (baseline ~line 102) for exact columns first; the license/terms field names below are guesses to correct against it:

```ts
// lib/commands/customers.ts — customer / ship-to / price-list CRUD. Single-row
// writes; RLS scopes tenancy. Upsert style: pass `id` to update, omit to create.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

const roles = ["admin", "sales"] as const;

defineCommand({
  name: "upsert_customer", description: "Create or update a customer account",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().min(1),
    type: z.enum(["distributor", "retailer", "brewery", "other"]),
    priceListId: z.string().uuid().optional(), licenseNumber: z.string().optional(),
    paymentTerms: z.string().optional(),
  }),
  handler: (ctx, i) => unwrap(ctx.db.from("customers").upsert({
    ...(i.id ? { id: i.id } : {}), brewery_id: ctx.breweryId, name: i.name, type: i.type,
    price_list_id: i.priceListId ?? null, license_number: i.licenseNumber ?? null,
    payment_terms: i.paymentTerms ?? null,
  }).select().single()),
});

defineCommand({
  name: "upsert_ship_to", description: "Create or update a ship-to address (state drives excise dest_state)",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), customerId: z.string().uuid(), label: z.string().min(1),
    address1: z.string().min(1), address2: z.string().optional(),
    city: z.string().min(1), state: z.string().regex(/^[A-Z]{2}$/), zip: z.string().min(1),
  }),
  handler: (ctx, i) => unwrap(ctx.db.from("ship_tos").upsert({
    ...(i.id ? { id: i.id } : {}), brewery_id: ctx.breweryId, customer_id: i.customerId,
    label: i.label, address1: i.address1, address2: i.address2 ?? null,
    city: i.city, state: i.state, zip: i.zip,
  }).select().single()),
});

defineCommand({
  name: "upsert_price_list", description: "Create or rename a price list",
  roles: [...roles],
  input: z.object({ id: z.string().uuid().optional(), name: z.string().min(1) }),
  handler: (ctx, i) => unwrap(ctx.db.from("price_lists").upsert({
    ...(i.id ? { id: i.id } : {}), brewery_id: ctx.breweryId, name: i.name,
  }).select().single()),
});

defineCommand({
  name: "set_price", description: "Set a SKU's price on a price list (integer cents)",
  roles: [...roles],
  input: z.object({ priceListId: z.string().uuid(), skuId: z.string().uuid(), unitPriceCents: z.number().int().nonnegative() }),
  handler: (ctx, i) => unwrap(ctx.db.from("price_list_items").upsert({
    brewery_id: ctx.breweryId, price_list_id: i.priceListId, sku_id: i.skuId, unit_price_cents: i.unitPriceCents,
  }).select().single()),
});

defineQuery({
  name: "list_customers", description: "Customers alphabetical with price list name",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("customers").select("*, price_lists(name)").eq("brewery_id", ctx.breweryId).order("name")),
});

defineQuery({
  name: "get_customer", description: "One customer with ship-tos",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({ customerId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const customer = await unwrap(ctx.db.from("customers").select("*, price_lists(name)").eq("id", i.customerId).single());
    const shipTos = await unwrap(ctx.db.from("ship_tos").select().eq("customer_id", i.customerId).order("label"));
    return { customer, shipTos };
  },
});

defineQuery({
  name: "list_price_lists", description: "Price lists with their per-SKU prices",
  roles: ["admin", "sales"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("price_lists").select("*, price_list_items(sku_id, unit_price_cents, skus(name))").eq("brewery_id", ctx.breweryId).order("name")),
});
```

`price_list_items` upsert conflicts on its PK `(price_list_id, sku_id)` — that is the update path.

- [ ] **Step 4: `npx vitest run && npx tsc --noEmit && npm run lint`**
- [ ] **Step 5: Commit** — `git commit -am "feat(commands): customer/ship-to/price-list CRUD"`

---

### Task 6: Portal commands + RLS coverage

**Files:**
- Create: `lib/commands/portal.ts`
- Modify: `lib/commands/all.ts`; `lib/commands/context.ts` (expose `customerId` on Ctx); `lib/commands/registry.ts` (add `customerId?: string` to `Ctx`); `supabase/migrations/00001_baseline.sql` (`portal_availability` fn)
- Test: extend `tests/rls-orders.test.ts`; new `tests/commands-portal.test.ts`

**Interfaces:**
- Consumes: Task 2 rpc fns; customer RLS policies (already in baseline).
- Produces: `Ctx.customerId` (set when role is `customer`); commands `portal_create_order`, `portal_update_draft_order`, `portal_submit_order` (roles `"customer"`); queries `portal_catalog`, `portal_orders`, `portal_order`, `portal_invoices` (roles `"customer"`). Availability badge `"in" | "low" | "out"`.

- [ ] **Step 1: Failing tests.** In `tests/commands-portal.test.ts`, with the Task 4 seed shape plus `makeCustomerUser` + `asUser`, build a customer ctx `{ db, userId, breweryId, role: "customer", customerId }`:
  - `portal_create_order` with `{ shipToId, lines }` creates a draft for *their* customer (no customerId in the input — it comes from ctx).
  - `portal_submit_order` moves it to `submitted`; a second call rejects (`order is submitted`).
  - `portal_catalog` returns skus with `unitPriceCents` from their price list and a `badge` of `"in" | "low" | "out"`; assert raw ATP numbers are NOT in the payload (`expect(Object.keys(row)).not.toContain("qty")`).
  - `portal_orders` lists only their orders; `portal_invoices` only their invoices.
  - Staff-only command with customer ctx rejects: `runCommand("list_orders", {}, custCtx)` → `/permission denied/`.
  - In `tests/rls-orders.test.ts` add: a customer's direct `db.from("orders").update({ note: "x" })` on a `confirmed` order affects 0 rows.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - `registry.ts`: `export type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: StaffRole | "customer"; customerId?: string }`.
  - `context.ts`: the customer branch already selects `customer_id` — return it: `return { db, userId: user.id, breweryId, role: "customer", customerId: cust[0].customer_id }`.
  - Baseline — availability tiers for customers (they cannot read `atp`: its `security_invoker` chain needs `inventory_movements`, which has no customer policy). Deliberate `security definer` with a self-check; mirror the baseline's existing revoke pattern for definer fns (`tests/schema-rules.test.ts` audits this):

```sql
-- Availability badge tiers for portal customers: coarse tiers only, never raw
-- quantities (spec 1B decision 7). security definer on purpose — customers
-- cannot read the ledger; the where-clause pins the caller to their own account.
create function portal_availability(p_customer uuid) returns table (sku_id uuid, badge text)
language sql stable security definer set search_path = '' as $$
  select a.sku_id, case when a.qty <= 0 then 'out' when a.qty < 20 then 'low' else 'in' end
  from public.atp a
  join public.customers c on c.brewery_id = a.brewery_id
  where c.id = p_customer and c.id in (select public.my_customer_ids());
$$;
```

  (Threshold 20 units is deliberate and fixed — `-- ponytail: fixed low-stock threshold, per-brewery setting when someone asks`.)

  - `lib/commands/portal.ts`:

```ts
// lib/commands/portal.ts — customer-portal commands. role: "customer" only;
// ctx.customerId scopes everything. Mutations reuse the same plpgsql fns as
// staff (RLS lets customers write only their own draft/submitted orders).
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError, Ctx } from "./registry";

const lines = z.array(z.object({ skuId: z.string().uuid(), qty: z.number().positive() })).min(1);

function requireCustomer(ctx: Ctx): string {
  if (!ctx.customerId) throw new CommandError("not a portal customer");
  return ctx.customerId;
}

defineCommand({
  name: "portal_create_order", description: "Portal: create a draft order for the caller's account",
  roles: "customer",
  input: z.object({ shipToId: z.string().uuid(), poNumber: z.string().optional(), note: z.string().optional(), lines }),
  handler: async (ctx, i) => {
    const customerId = requireCustomer(ctx);
    // The brewery's default shipping origin: its first warehouse.
    const wh = await unwrap(ctx.db.from("locations").select("id").eq("brewery_id", ctx.breweryId).eq("kind", "warehouse").limit(1).single());
    return unwrap(ctx.db.rpc("create_order", {
      p_brewery: ctx.breweryId, p_kind: "wholesale", p_customer: customerId, p_ship_to: i.shipToId,
      p_from_location: wh.id, p_to_location: null, p_requested: null,
      p_po: i.poNumber ?? null, p_note: i.note ?? null,
      p_lines: i.lines.map(l => ({ sku_id: l.skuId, qty: l.qty })),
    }));
  },
});

defineCommand({
  name: "portal_update_draft_order", description: "Portal: replace a draft order's lines/fields",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid(), shipToId: z.string().uuid().optional(), poNumber: z.string().optional(), note: z.string().optional(), lines }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("update_draft_order", {
    p_order: i.orderId, p_ship_to: i.shipToId ?? null, p_requested: null,
    p_po: i.poNumber ?? null, p_note: i.note ?? null,
    p_lines: i.lines.map(l => ({ sku_id: l.skuId, qty: l.qty })),
  })),
});

defineCommand({
  name: "portal_submit_order", description: "Portal: submit a draft order",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("submit_order", { p_order: i.orderId })),
});

defineQuery({
  name: "portal_catalog", description: "Portal: orderable SKUs with the caller's prices and an availability badge",
  roles: "customer",
  input: z.object({}),
  handler: async (ctx) => {
    const customerId = requireCustomer(ctx);
    // RLS limits price_list_items to the caller's list and skus to active.
    const [prices, avail] = await Promise.all([
      unwrap(ctx.db.from("price_list_items").select("sku_id, unit_price_cents, skus(id, name, products(name))")),
      unwrap(ctx.db.rpc("portal_availability", { p_customer: customerId })),
    ]);
    const badges = new Map((avail as { sku_id: string; badge: string }[]).map(a => [a.sku_id, a.badge]));
    return prices.map((p: { sku_id: string; unit_price_cents: number; skus: { name: string; products: { name: string } } }) => ({
      skuId: p.sku_id, name: p.skus.name, product: p.skus.products.name,
      unitPriceCents: p.unit_price_cents, badge: badges.get(p.sku_id) ?? "out",
    }));
  },
});

defineQuery({
  name: "portal_orders", description: "Portal: the caller's orders, newest first",
  roles: "customer",
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("orders").select("*, order_lines(*, skus(name))").eq("customer_id", requireCustomer(ctx)).order("created_at", { ascending: false })),
});

defineQuery({
  name: "portal_order", description: "Portal: one order with lines and its event history",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    requireCustomer(ctx);
    const order = await unwrap(ctx.db.from("orders").select("*, ship_tos(label, city, state)").eq("id", i.orderId).single());
    const [ln, events] = await Promise.all([
      unwrap(ctx.db.from("order_lines").select("*, skus(name)").eq("order_id", i.orderId)),
      unwrap(ctx.db.from("order_events").select().eq("order_id", i.orderId).order("created_at")),
    ]);
    return { order, lines: ln, events };
  },
});

defineQuery({
  name: "portal_invoices", description: "Portal: the caller's invoices and credit memos",
  roles: "customer",
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("invoices").select("*, invoice_lines(*, skus(name))").eq("customer_id", requireCustomer(ctx)).order("created_at", { ascending: false })),
});
```

- [ ] **Step 4: `npx supabase db reset && npx vitest run && npx tsc --noEmit && npm run lint`**
- [ ] **Step 5: Commit** — `git commit -am "feat(commands): portal ordering, catalog with availability badges, portal RLS coverage"`

---

### Task 7: Staff UI — customers & price lists

**Files:**
- Create: `app/(app)/customers/page.tsx`, `app/(app)/customers/[id]/page.tsx`, `app/(app)/customers/customer-form.tsx`, `app/(app)/customers/ship-to-form.tsx`, `app/(app)/customers/[id]/invite-portal-user-form.tsx`, `app/(app)/pricing/page.tsx`, `app/(app)/pricing/price-list-form.tsx`, `app/(app)/pricing/price-form.tsx`
- Modify: `app/(app)/layout.tsx` (nav: add Customers, Pricing, Orders, Pick, Invoices, Replenishment links)

**Interfaces:**
- Consumes: Task 5 commands via `useCommandForm` + server-side `runCommand` (mirror `app/(app)/catalog/page.tsx` exactly — same imports and `buildContext` pattern); existing `invite_customer_user` command (input: read `lib/commands/invites.ts` for its exact shape).

- [ ] **Step 1: Build the pages.** No component tests (1A precedent: data layer is covered; UI is verified by looking at it). Each page is a server component (`const ctx = await buildContext(brewery.id); const customers = await runCommand("list_customers", {}, ctx);`) rendered as a table; forms are client dialogs with `useCommandForm("upsert_customer", ...)` following `movement-form.tsx` field-for-field. Customer detail: ship-tos with inline `ship-to-form.tsx`, plus "Invite portal user" dialog calling `invite_customer_user` (spec decision 1). Pricing: price lists + items; `price-form.tsx` takes dollars, sends `Math.round(dollars * 100)`.
- [ ] **Step 2: Look at the rendered pages** (`npm run dev`, `/customers`, `/pricing`): create a customer, add a ship-to, set a price, invite a portal user. Fix what looks broken.
- [ ] **Step 3: `npx vitest run && npx tsc --noEmit && npm run lint`, commit** — `git commit -am "feat(ui): customers, portal invites, price-list management"`

---

### Task 8: Staff UI — orders list, detail, order form

**Files:**
- Create: `app/(app)/orders/page.tsx`, `app/(app)/orders/[id]/page.tsx`, `app/(app)/orders/order-form.tsx`, `app/(app)/orders/[id]/lifecycle-buttons.tsx`, `app/(app)/orders/[id]/adjust-lines-form.tsx`

**Interfaces:**
- Consumes: `list_orders`, `get_order`, `create_order`, `submit_order`, `confirm_order`, `adjust_order_lines`, `cancel_order` (Task 4 shapes).

- [ ] **Step 1: Orders list page** — server component, status filter via `searchParams` (`?status=confirmed`), table: order no, customer, status, requested date, `needs_restock` badge ("staged — needs restocking"). `order-form.tsx`: customer select (loads their ship-tos), from-location select, line editor (sku select + qty rows, add/remove), builds `create_order` input.
- [ ] **Step 2: Order detail page** — header (status, customer, ship-to, PO), lines table (ordered/picked/shipped, price, per-sku ATP badge from `get_order().atp`), event timeline (`events` as "15:04 — confirmed — <actor>"; `lines_adjusted` payload rendered as before→after quantities + reason), `lifecycle-buttons.tsx`: Submit (draft), Confirm (submitted — when the response's `warnings` is non-empty, show "ATP negative for <sku>" inline), Cancel-with-reason (any pre-ship), Adjust lines (confirmed/picked → `adjust-lines-form.tsx` pre-filled with current lines + required reason).
- [ ] **Step 3: Look at the rendered flow end-to-end** in the browser: create → submit → confirm (oversell one to see the warning) → adjust → cancel. Fix what's broken.
- [ ] **Step 4: `npx vitest run && npx tsc --noEmit && npm run lint`, commit** — `git commit -am "feat(ui): orders list/detail with lifecycle actions and event timeline"`

---

### Task 9: Staff UI — pick, ship, invoices, replenishment

**Files:**
- Create: `app/(app)/pick/page.tsx`, `app/(app)/orders/[id]/pick-form.tsx`, `app/(app)/orders/[id]/ship-form.tsx`, `app/(app)/invoices/page.tsx`, `app/(app)/invoices/[id]/page.tsx`, `app/(app)/invoices/[id]/credit-memo-form.tsx`, `app/(app)/replenishment/page.tsx`, `app/(app)/replenishment/replenish-form.tsx`

**Interfaces:**
- Consumes: `daily_pick_sheet`, `record_pick`, `ship_order`, `list_invoices`, `get_invoice`, `create_credit_memo`, `replenishment_suggestions`, `create_replenishment_order` (Task 4 shapes); `invoice_totals` view for totals.

- [ ] **Step 1: Pick sheet** (`/pick`): `daily_pick_sheet` grouped by `requested_ship_date`, orders expandable to lines; print-friendly (one `@media print` rule in `globals.css` hiding the nav). Pick form on order detail: qty-picked inputs pre-filled with ordered qty → `record_pick`.
- [ ] **Step 2: Ship form** on order detail (status picked): qty-shipped inputs pre-filled from `qty_picked`, carrier/tracking → `ship_order`; success shows a link to the created invoice when present.
- [ ] **Step 3: Invoices** list (no, kind badge, customer, total via `invoice_totals`, paid), detail (lines; credit-memo dialog: qty per line + return location select + reason).
- [ ] **Step 4: Replenishment** (`/replenishment?location=<id>`): taproom select; table par / on-hand / suggested (editable qty); one button → `create_replenishment_order`.
- [ ] **Step 5: Look at all four rendered pages; run the full flow** pick → ship → invoice → credit memo, plus a replenishment order. Fix breakage.
- [ ] **Step 6: `npx vitest run && npx tsc --noEmit && npm run lint`, commit** — `git commit -am "feat(ui): pick sheet, ship flow, invoices, taproom replenishment"`

---

### Task 10: Portal UI

**Files:**
- Create: `app/(portal)/layout.tsx`, `app/(portal)/portal/page.tsx` (catalog + cart), `app/(portal)/portal/cart.tsx`, `app/(portal)/portal/orders/page.tsx`, `app/(portal)/portal/orders/[id]/page.tsx`, `app/(portal)/portal/invoices/page.tsx`, `lib/portal.ts`
- Modify: `app/(auth)/actions.ts` (post-login redirect); `proxy.ts` if it routes by path (read it first)

**Interfaces:**
- Consumes: Task 6 portal commands; `buildContext` (role `customer` works already).
- Produces: `lib/portal.ts` → `getActiveCustomer(): Promise<{ customerId: string; breweryId: string; customerName: string }>` (reads `customer_users` for the signed-in user, first row, joined to `customers`; throws if none — mirror `lib/brewery.ts`).

- [ ] **Step 1: `lib/portal.ts` + portal layout** — minimal chrome (customer name, nav: Shop, Orders, Invoices, sign out). Portal pages are server components calling `runCommand` with `buildContext(breweryId)` (which resolves role `customer`).
- [ ] **Step 2: Login redirect** — read `app/(auth)/actions.ts`; after sign-in, if the user has no `brewery_users` row but has a `customer_users` row, redirect to `/portal` instead of `/`. Patch only the redirect.
- [ ] **Step 3: Catalog + cart** — `portal_catalog` table (product, sku, price, badge chip; "out" rows disabled), client cart (`useState`, qty per sku), ship-to select, Submit → `portal_create_order` then `portal_submit_order` (draft hop invisible; a separate "Save draft" button stops after the first). Orders page: `portal_orders` with status chips; detail: lines + timeline (`lines_adjusted` shown as "The brewery adjusted this order: <before→after>"). Invoices page: `portal_invoices` with totals.
- [ ] **Step 4: Look at the rendered portal** as a seeded customer user end-to-end. Fix breakage.
- [ ] **Step 5: `npx vitest run && npx tsc --noEmit && npm run lint`, commit** — `git commit -am "feat(portal): customer ordering portal"`

---

### Task 11: Playwright portal smoke

**Files:**
- Create: `playwright.config.ts`, `tests-e2e/portal-smoke.spec.ts`
- Modify: `package.json` (devDependency `@playwright/test`, script `"test:e2e": "playwright test"`)

**Interfaces:**
- Consumes: running `next dev` + local Supabase; seeds via `tests/helpers.ts` admin client.

- [ ] **Step 1: Install** — `npm i -D @playwright/test && npx playwright install chromium` (dependency approved in the spec; CI stays unchanged — the smoke runs locally via `npm run test:e2e`).
- [ ] **Step 2: Config** — `testDir: "tests-e2e"`, `use: { baseURL: "http://localhost:3000" }`, `webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true }`. Exclude `tests-e2e` from vitest if `vitest.config.ts` would pick it up.
- [ ] **Step 3: The smoke** — `beforeAll`: seed brewery/product/sku/price list/customer/ship-to/opening balance and a customer user with the helpers' known password. Test: goto `/login` → sign in → lands on `/portal` → add the sku, qty 2 → choose ship-to → Submit → orders page shows the order with status `submitted`.
- [ ] **Step 4: `npm run test:e2e` green; `npx vitest run && npx tsc --noEmit && npm run lint` still green.**
- [ ] **Step 5: Commit** — `git commit -am "test(e2e): portal ordering smoke"`

---

### Task 12: Docs + progress + PR

**Files:**
- Modify: `.agents/ARCHITECTURE.md` (ownership: orders/customers/portal command files, portal route group, `order_events`), `.agents/PROGRESS.md` (1B done, 1C next), `README.md` (portal login note, `test:e2e` script), `.agents/MEMORY.md` (only if a durable decision changed during implementation)
- Verify: the screen inventory (`components/mgr/screens.tsx`) still matches what was built; if any screen deviated during Tasks 7–10, update the `SCREENS` array in the same commit (standing rule: the frames move with the plan).

- [ ] **Step 1: Update the docs; `git diff` review; commit** — `git commit -am "docs: slice 1B shipped — architecture map, progress, portal notes"`
- [ ] **Step 2: Full gate: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`.**
- [ ] **Step 3: Push `slice1b-orders`, open PR** to main titled "Slice 1B — Orders: lifecycle, fulfillment, invoices, portal".

---

## Self-review notes (already applied)

- Spec coverage: decisions 1–8 land in Tasks 1–10 (decision 1's invite UI = Task 7's invite dialog over the existing `invite_customer_user`); Playwright = Task 11; docs = Task 12.
- `ship_order`: `sale_removal` satisfies `removal_shape` (negative qty + channel + dest_state); `taproom_transfer` pair satisfies it (no channel/dest_state); `ref` column exists on movements.
- Type consistency: rpc arg names (`p_*`) in Tasks 4/6 match the SQL in Tasks 2–3; command input shapes in Tasks 4/5/6 are what Tasks 7–10 build against.
- Executors: read the actual DDL for `customers` and `invoices` before Tasks 3/5 — column names in the baseline win over this plan's guesses.

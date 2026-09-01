// tests/commands-portal.test.ts — portal (customer role) command registry wiring:
// scoping to the caller's own customer, availability badges never leak raw ATP,
// and staff-only commands reject a customer ctx.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, makeCustomerUser, asUser } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let customerId: string, shipToId: string, skuId: string;
let custCtx: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" });
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", package_type: "can", bbl_per_unit: 0.0645 }).select().single();
  skuId = s!.id;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 3600 });
  const { data: c } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl!.id }).select().single();
  customerId = c!.id;
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
  shipToId = st!.id;
  // Put stock on hand so the "in" badge tier is reachable.
  const { data: loc } = await admin.from("locations").select("id").eq("brewery_id", b.id).eq("kind", "warehouse").single();
  await admin.from("inventory_movements").insert({
    brewery_id: b.id, sku_id: skuId, location_id: loc!.id, qty: 100, bbl: 100 * 0.0645,
    type: "production_in", created_by: adminCtx.userId,
  });
  const custUser = await makeCustomerUser(customerId);
  const db = await asUser(custUser.email);
  custCtx = { db, userId: custUser.id, breweryId: b.id, role: "customer", customerId };
});

describe("portal commands", () => {
  it("portal_create_order creates a draft for the caller's own customer, then portal_submit_order submits it", async () => {
    const created = await runCommand("portal_create_order", {
      shipToId, lines: [{ skuId, qty: 3 }],
    }, custCtx) as { order_id: string };
    const { data: order } = await admin.from("orders").select("customer_id, status").eq("id", created.order_id).single();
    expect(order!.customer_id).toBe(customerId);
    expect(order!.status).toBe("draft");

    await runCommand("portal_submit_order", { orderId: created.order_id }, custCtx);
    const { data: after } = await admin.from("orders").select("status").eq("id", created.order_id).single();
    expect(after!.status).toBe("submitted");

    // R3: once submitted, the order is locked from customer writes — the row
    // is no longer visible to the customer's UPDATE policy (SELECT ... FOR
    // UPDATE inside lock_order enforces the UPDATE policy's USING clause), so
    // a second submit surfaces as "not found" rather than "order is submitted".
    await expect(runCommand("portal_submit_order", { orderId: created.order_id }, custCtx))
      .rejects.toThrow(/order not found/);
  });

  it("portal_catalog returns priced skus with a coarse badge and never raw ATP quantities", async () => {
    const rows = await runCommand("portal_catalog", {}, custCtx) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find(r => r.skuId === skuId)!;
    expect(row.unitPriceCents).toBe(3600);
    expect(["in", "low", "out"]).toContain(row.badge);
    expect(Object.keys(row)).not.toContain("qty");
  });

  it("portal_orders lists only the caller's own orders; portal_invoices only their invoices", async () => {
    const otherCustomer = await admin.from("customers").insert({ brewery_id: b.id, name: "Other Bar", type: "retailer", state: "PA" }).select().single();
    const otherSt = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: otherCustomer.data!.id, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
    await admin.from("orders").insert({ brewery_id: b.id, kind: "wholesale", customer_id: otherCustomer.data!.id, ship_to_id: otherSt.data!.id, created_by: adminCtx.userId });

    const orders = await runCommand("portal_orders", {}, custCtx) as { customer_id: string }[];
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every(o => o.customer_id === customerId)).toBe(true);

    const { data: inv } = await admin.from("invoices").insert({ brewery_id: b.id, customer_id: customerId, kind: "invoice" }).select().single();
    await admin.from("invoices").insert({ brewery_id: b.id, customer_id: otherCustomer.data!.id, kind: "invoice" });

    const invoices = await runCommand("portal_invoices", {}, custCtx) as { id: string; customer_id: string }[];
    expect(invoices.some(i => i.id === inv!.id)).toBe(true);
    expect(invoices.every(i => i.customer_id === customerId)).toBe(true);
  });

  it("staff-only commands reject a customer ctx", async () => {
    await expect(runCommand("list_orders", {}, custCtx)).rejects.toThrow(/permission denied/);
  });

  it("replays an identical portal order before re-resolving the default warehouse", async () => {
    const input = {
      shipToId,
      poNumber: `replay-${crypto.randomUUID()}`,
      lines: [{ skuId, qty: 1 }],
    };
    const execution = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    };
    const first = await runCommand("portal_create_order", input, custCtx, execution) as { order_id: string };

    await admin.from("locations").insert({
      id: "00000000-0000-4000-8000-000000000000",
      brewery_id: b.id,
      name: "Earlier warehouse",
      kind: "warehouse",
    });
    const replay = await runCommand("portal_create_order", input, custCtx, execution);

    expect(replay).toEqual(first);
    const orders = await admin.from("orders").select("id").eq("id", first.order_id);
    expect(orders.data).toHaveLength(1);
  });

  it("portal_create_order still succeeds when the brewery has more than one warehouse", async () => {
    // Nothing constrains a brewery to a single warehouse; the lookup must
    // tolerate multiple rows (.single() would throw PGRST116 without a limit).
    await admin.from("locations").insert({ brewery_id: b.id, name: "WH2", kind: "warehouse" });
    const created = await runCommand("portal_create_order", {
      shipToId, lines: [{ skuId, qty: 1 }],
    }, custCtx) as { order_id: string };
    const { data: order } = await admin.from("orders").select("status").eq("id", created.order_id).single();
    expect(order!.status).toBe("draft");
  });
});

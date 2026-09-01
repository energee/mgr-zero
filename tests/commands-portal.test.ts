// tests/commands-portal.test.ts — portal (customer role) command registry wiring:
// scoping to the caller's own customer, availability badges never leak raw ATP,
// and staff-only commands reject a customer ctx.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx, makeCustomerUser, asUser } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let customerId: string, shipToId: string, skuId: string, warehouseId: string;
let custCtx: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  const { data: warehouse } = await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" }).select().single();
  warehouseId = warehouse!.id;
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
  const { data: loc } = await admin.from("locations").select("id").eq("id", warehouseId).single();
  await admin.from("inventory_movements").insert({
    brewery_id: b.id, sku_id: skuId, location_id: loc!.id, qty: 100, bbl: 100 * 0.0645,
    type: "production_in", created_by: adminCtx.userId,
  });
  const custUser = await makeCustomerUser(customerId);
  const db = await asUser(custUser.email);
  custCtx = { db, userId: custUser.id, breweryId: b.id, role: "customer", customerId };
});

describe("portal commands", () => {
  it("derives trusted order fields from the configured fulfillment source and the authenticated customer", async () => {
    const { data: configured } = await admin.from("locations").insert({ brewery_id: b.id, name: "Configured WH", kind: "warehouse" }).select().single();
    await runCommand("set_portal_fulfillment_source", { locationId: configured!.id }, adminCtx);
    const created = await runCommand("portal_create_order", {
      shipToId, poNumber: "PO-1", note: "dock after 9", lines: [{ skuId, qty: 3 }],
    }, custCtx) as { order_id: string };
    const { data: order } = await admin.from("orders")
      .select("brewery_id, customer_id, ship_to_id, from_location_id, price_list_id, created_by, kind, status, po_number, note")
      .eq("id", created.order_id).single();
    const { data: line } = await admin.from("order_lines").select("unit_price_cents").eq("order_id", created.order_id).single();
    const { data: event } = await admin.from("order_events").select("actor, event").eq("order_id", created.order_id).eq("event", "created").single();
    expect(order).toMatchObject({
      brewery_id: b.id, customer_id: customerId, ship_to_id: shipToId, from_location_id: configured!.id,
      created_by: custCtx.userId, kind: "wholesale", status: "draft", po_number: "PO-1", note: "dock after 9",
    });
    expect(order!.price_list_id).not.toBeNull();
    expect(line!.unit_price_cents).toBe(3600);
    expect(event).toEqual({ actor: custCtx.userId, event: "created" });

    await runCommand("portal_update_draft_order", {
      orderId: created.order_id, poNumber: "PO-2", note: "revised", lines: [{ skuId, qty: 4 }],
    }, custCtx);
    const { data: updated } = await admin.from("orders").select("po_number, note, status").eq("id", created.order_id).single();
    expect(updated).toEqual({ po_number: "PO-2", note: "revised", status: "draft" });

    // Omitted fields are left alone; only what the caller sends changes.
    await runCommand("portal_update_draft_order", { orderId: created.order_id, lines: [{ skuId, qty: 5 }] }, custCtx);
    const { data: kept } = await admin.from("orders").select("po_number, note").eq("id", created.order_id).single();
    expect(kept).toEqual({ po_number: "PO-2", note: "revised" });

    await runCommand("portal_submit_order", { orderId: created.order_id }, custCtx);
    const { data: after } = await admin.from("orders").select("status").eq("id", created.order_id).single();
    expect(after!.status).toBe("submitted");
  });

  it("rejects a ship-to that belongs to another customer", async () => {
    const { data: other } = await admin.from("customers").insert({ brewery_id: b.id, name: "Foreign Bar", type: "retailer", state: "PA" }).select().single();
    const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: other!.id, label: "o", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
    await expect(runCommand("portal_create_order", { shipToId: st!.id, lines: [{ skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/ship-to not found/);
  });

  it("rejects a sku that is not priced on the caller's list or is inactive", async () => {
    const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "Unpriced" }).select().single();
    const { data: unpriced } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "keg", package_type: "keg", bbl_per_unit: 0.5 }).select().single();
    await expect(runCommand("portal_create_order", { shipToId, lines: [{ skuId: unpriced!.id, qty: 1 }] }, custCtx))
      .rejects.toThrow(/not active and priced/);
    await admin.from("skus").update({ active: false }).eq("id", skuId);
    await expect(runCommand("portal_create_order", { shipToId, lines: [{ skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/not active and priced/);
    await admin.from("skus").update({ active: true }).eq("id", skuId);
  });

  it("ignores any client-supplied price: the line price is always the list price", async () => {
    const created = await runCommand("portal_create_order", {
      shipToId, lines: [{ skuId, qty: 1, unitPriceCents: 1 } as unknown as { skuId: string; qty: number }],
    }, custCtx) as { order_id: string };
    const { data: line } = await admin.from("order_lines").select("unit_price_cents").eq("order_id", created.order_id).single();
    expect(line!.unit_price_cents).toBe(3600);
  });

  it("fails closed when the brewery has no portal fulfillment source", async () => {
    const { data: b2 } = await admin.from("breweries").select("portal_fulfillment_location_id").eq("id", b.id).single();
    await admin.from("breweries").update({ portal_fulfillment_location_id: null }).eq("id", b.id);
    await expect(runCommand("portal_create_order", { shipToId, lines: [{ skuId, qty: 1 }] }, custCtx))
      .rejects.toThrow(/fulfillment source is not configured/);
    await admin.from("breweries").update({ portal_fulfillment_location_id: b2!.portal_fulfillment_location_id }).eq("id", b.id);
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

  it("replays an identical portal order without re-running it", async () => {
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

  it("uses the configured warehouse rather than an arbitrary warehouse", async () => {
    const created = await runCommand("portal_create_order", {
      shipToId, lines: [{ skuId, qty: 1 }],
    }, custCtx) as { order_id: string };
    const { data: brewery } = await admin.from("breweries").select("portal_fulfillment_location_id").eq("id", b.id).single();
    const { data: order } = await admin.from("orders").select("from_location_id").eq("id", created.order_id).single();
    expect(brewery!.portal_fulfillment_location_id).not.toBe(warehouseId);
    expect(order!.from_location_id).toBe(brewery!.portal_fulfillment_location_id);
  });
});

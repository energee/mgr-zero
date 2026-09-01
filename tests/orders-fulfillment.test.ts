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
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA 1/2bbl", package_type: "keg", bbl_per_unit: 0.5 }).select().single();
  skuId = s!.id;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 12000 });
  const { data: c } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl!.id }).select().single();
  customerId = c!.id;
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
  shipToId = st!.id;
  await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, qty: 100, type: "opening_balance", created_by: staffId });
});

async function confirmedOrder(qty = 10) {
  const { data, error } = await staffDb.rpc("create_order", {
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
    p_lines: [{ sku_id: skuId, qty }],
    p_request_id: crypto.randomUUID(),
  });
  expect(error).toBeNull();
  const id = (data as { order_id: string }).order_id;
  await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
  await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
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
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 8 }], p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 8 }], p_carrier: "self", p_tracking: null, p_request_id: crypto.randomUUID() });
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
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 6 }], p_reason: "cut", p_request_id: crypto.randomUUID() });
    let { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.needs_restock).toBe(true);
    const l2 = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: l2.id, qty_picked: 6 }], p_request_id: crypto.randomUUID() });
    ({ data: o } = await admin.from("orders").select().eq("id", id).single());
    expect(o!.needs_restock).toBe(false);
  });
  it("ship with all lines qty_shipped 0 creates no invoice and releases allocations", async () => {
    const id = await confirmedOrder(4);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 0 }], p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 0 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    expect((data as { invoice_id: string | null }).invoice_id).toBeNull();
    const { data: shipment } = await admin.from("shipments").select().eq("order_id", id).single();
    const { data: invs } = await admin.from("invoices").select().eq("shipment_id", shipment!.id);
    expect(invs!.length).toBe(0);
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.status).toBe("shipped");
    const { data: alloc } = await admin.from("allocations").select().eq("ref", line.id).single();
    expect(alloc!.status).toBe("released");
  });
  it("ship rejects when p_ship omits an order line", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    const { error } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/ship list must cover/);
  });
});

describe("credit memo", () => {
  it("writes negative invoice lines and return_in movements, and logs an order_events row", async () => {
    const id = await confirmedOrder(5);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 5 }], p_request_id: crypto.randomUUID() });
    const { data: shipped, error: shipErr } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 5 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(shipErr).toBeNull();
    const invId = (shipped as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();
    const { data: cm, error } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 2 }], p_location: whId, p_reason: "damaged", p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const cmId = (cm as { invoice_id: string }).invoice_id;
    const { data: cmLines } = await admin.from("invoice_lines").select().eq("invoice_id", cmId);
    expect(Number(cmLines![0].qty)).toBe(-2);
    expect(cmLines![0].unit_price_cents).toBe(12000);
    const { data: ret } = await admin.from("inventory_movements").select().eq("type", "return_in").eq("brewery_id", b.id);
    expect(ret!.some(m => Number(m.qty) === 2)).toBe(true);
    const { data: events } = await admin.from("order_events").select().eq("order_id", id).eq("event", "credit_memo");
    expect(events!.length).toBe(1);
    const payload = events![0].payload as { invoice_id: string; credit_memo_id: string; reason: string };
    expect(payload.invoice_id).toBe(invId);
    expect(payload.credit_memo_id).toBe(cmId);
    expect(payload.reason).toBe("damaged");

    // Over-credit guard: 2 of 5 already credited above; 4 more would exceed
    // the remaining 3, 3 more exactly exhausts it.
    const { error: overErr } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 4 }], p_location: whId, p_reason: "damaged again", p_request_id: crypto.randomUUID(),
    });
    expect(overErr).not.toBeNull();
    expect(overErr?.message).toMatch(/credit exceeds remaining creditable qty/);
    const { error: exactErr } = await staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 3 }], p_location: whId, p_reason: "rest", p_request_id: crypto.randomUUID(),
    });
    expect(exactErr).toBeNull();
  });
});

describe("replenishment", () => {
  it("creates a confirmed taproom_transfer order; shipping it moves stock between locations, no invoice", async () => {
    const { data, error } = await staffDb.rpc("create_replenishment_order", {
      p_from: whId, p_to: tapId, p_lines: [{ sku_id: skuId, qty: 3 }], p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const id = (data as { order_id: string }).order_id;
    const { data: o } = await admin.from("orders").select().eq("id", id).single();
    expect(o!.kind).toBe("taproom_transfer");
    expect(o!.status).toBe("confirmed");
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    const { data: shipRes, error: shipErr } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    expect(shipErr).toBeNull();
    expect((shipRes as { invoice_id: string | null }).invoice_id).toBeNull();
    const { data: mv } = await admin.from("inventory_movements").select().eq("ref", id).eq("type", "taproom_transfer");
    expect(mv!.length).toBe(2);
    expect(Number(mv!.find(m => m.location_id === tapId)!.qty)).toBe(3);
  });
});

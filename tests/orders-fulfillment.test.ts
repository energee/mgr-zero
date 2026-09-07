// tests/orders-fulfillment.test.ts — pick → ship → movements + invoice; credit memo; replenishment; needs_restock.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser, seedCatalog, seedLocation, seedCustomer } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string }, staffDb: SupabaseClient, staffId: string;
let customerId: string, shipToId: string, whId: string, whBinId: string, tapId: string, skuId: string;

beforeAll(async () => {
  // identical seed to tests/orders-lifecycle.test.ts, plus a taproom location:
  b = await makeBrewery();
  const staff = await makeStaff(b.id); staffId = staff.id; staffDb = await asUser(staff.email);
  ({ id: whId, binId: whBinId } = await seedLocation(b.id));
  tapId = (await seedLocation(b.id, { name: "Taproom", kind: "taproom" })).id;
  ({ skuId } = await seedCatalog(b.id, { sku: "IPA 1/2bbl", packageType: "keg", bblPerUnit: 0.5 }));
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: cust.priceListId, sku_id: skuId, unit_price_cents: 12000 });
  await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: staffId });
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

describe("credit memo concurrency", () => {
  it("two concurrent credit memos for the full qty produce exactly one credit", async () => {
    const id = await confirmedOrder(4);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 4 }], p_request_id: crypto.randomUUID() });
    const { data: shipped } = await staffDb.rpc("ship_order", { p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 4 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
    const invId = (shipped as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();
    const memo = () => staffDb.rpc("create_credit_memo", {
      p_invoice: invId, p_lines: [{ invoice_line_id: il!.id, qty: 4 }], p_location: whId, p_reason: "race", p_request_id: crypto.randomUUID(),
    });
    const results = await Promise.all([memo(), memo()]);
    expect(results.filter(r => r.error === null).length).toBe(1);
    const { data: credits } = await admin.from("invoice_lines").select("qty").eq("credited_invoice_line_id", il!.id);
    expect(credits!.reduce((sum, c) => sum + Number(c.qty), 0)).toBe(-4);
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

describe("confirm_restock", () => {
  it("clears needs_restock and writes an order event; no movement", async () => {
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

  it("is a conflict when the flag is already clear", async () => {
    const id = await confirmedOrder(2);
    const { error } = await staffDb.rpc("confirm_restock", { p_order: id, p_request_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not waiting for restock/);
  });
});

describe("resolve_short_pick", () => {
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

  it("keep_owed records the count and leaves the order picked but still owed", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    const { error } = await staffDb.rpc("resolve_short_pick", {
      p_order: id, p_line: line.id, p_qty_picked: 7, p_reason: "will finish tomorrow",
      p_resolution: "keep_owed", p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const after = await lineOf(id);
    expect(Number(after.qty_ordered)).toBe(10);
    expect(Number(after.qty_picked)).toBe(7);
    const { data: o } = await admin.from("orders").select("status").eq("id", id).single();
    expect(o!.status).toBe("picked");
    const { data: ev } = await admin.from("order_events").select("payload").eq("order_id", id).eq("event", "short_pick").single();
    expect(ev!.payload).toMatchObject({ resolution: "keep_owed", qty_picked: 7 });
  });

  it("rejects a count that is not short, and an empty reason", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    const full = await staffDb.rpc("resolve_short_pick", { p_order: id, p_line: line.id, p_qty_picked: 3, p_reason: "x", p_resolution: "keep_owed", p_request_id: crypto.randomUUID() });
    expect(full.error?.message).toMatch(/not short/);
    const blank = await staffDb.rpc("resolve_short_pick", { p_order: id, p_line: line.id, p_qty_picked: 1, p_reason: " ", p_resolution: "keep_owed", p_request_id: crypto.randomUUID() });
    expect(blank.error?.message).toMatch(/reason/);
  });
});

describe("ship invoice timing", () => {
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
    const { data: sh } = await admin.from("shipments").select("id, invoice_timing").eq("order_id", id).single();
    expect(sh!.invoice_timing).toBe("on_delivery");
    const { data: invs } = await admin.from("invoices").select("id").eq("shipment_id", sh!.id);
    expect(invs!.length).toBe(0);
    const { data: mv } = await admin.from("inventory_movements").select("type").eq("ref", id);
    expect(mv!.map((m) => m.type)).toEqual(["sale_removal"]);
  });

  it("short ship below picked sets needs_restock", async () => {
    const id = await confirmedOrder(10);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 10 }], p_request_id: crypto.randomUUID() });
    const { error } = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 9 }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "now",
      p_request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    const { data: o } = await admin.from("orders").select("needs_restock").eq("id", id).single();
    expect(o!.needs_restock).toBe(true);
  });
});

describe("confirm_delivery", () => {
  it("invoices an on_delivery shipment once, signs the stop, and moves nothing", async () => {
    const id = await confirmedOrder(3);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 3 }], p_request_id: crypto.randomUUID() });
    await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 3 }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "on_delivery", p_request_id: crypto.randomUUID(),
    });
    const { data: sh } = await admin.from("shipments").select("id").eq("order_id", id).single();
    const { data: route } = await admin.from("routes").insert({ brewery_id: b.id, delivery_date: "2026-09-08", driver_user_id: staffId, name: "A" }).select().single();
    const { data: del } = await admin.from("deliveries").insert({ brewery_id: b.id, route_id: route!.id, shipment_id: sh!.id, stop_no: 1 }).select().single();
    const mvBefore = await admin.from("inventory_movements").select("id").eq("ref", id);
    const { data, error } = await staffDb.rpc("confirm_delivery", { p_delivery: del!.id, p_signed_by: "Dana", p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    const invoiceId = (data as { invoice_id: string }).invoice_id;
    expect(invoiceId).toMatch(/^[0-9a-f-]{36}$/i);
    const { data: d2 } = await admin.from("deliveries").select("signed_by,delivered_at").eq("id", del!.id).single();
    expect(d2!.signed_by).toBe("Dana");
    expect(d2!.delivered_at).not.toBeNull();
    const { data: il } = await admin.from("invoice_lines").select("qty, unit_price_cents").eq("invoice_id", invoiceId);
    expect(il).toEqual([{ qty: 3, unit_price_cents: 12000 }]);
    const mvAfter = await admin.from("inventory_movements").select("id").eq("ref", id);
    expect(mvAfter.data!.length).toBe(mvBefore.data!.length);
    const again = await staffDb.rpc("confirm_delivery", { p_delivery: del!.id, p_signed_by: "Dana", p_request_id: crypto.randomUUID() });
    expect(again.error?.message).toMatch(/already delivered/);
    const stop = await runCommand("get_delivery_stop", { deliveryId: del!.id }, { db: staffDb, userId: staffId, breweryId: b.id, role: "admin" }) as
      { delivery: { signed_by: string; shipments: { invoice_timing: string } }; lines: { qty_shipped: number }[]; invoice: { id: string } | null };
    expect(stop.delivery.signed_by).toBe("Dana");
    expect(stop.delivery.shipments.invoice_timing).toBe("on_delivery");
    expect(stop.lines.map((l) => Number(l.qty_shipped))).toEqual([3]);
    expect(stop.invoice?.id).toBe(invoiceId);
  });
});

describe("return_shipment", () => {
  it("unsold return credits at the invoiced price and restocks; damaged also posts loss", async () => {
    const id = await confirmedOrder(5);
    const line = await lineOf(id);
    await staffDb.rpc("record_pick", { p_order: id, p_picks: [{ line_id: line.id, qty_picked: 5 }], p_request_id: crypto.randomUUID() });
    const shipped = await staffDb.rpc("ship_order", {
      p_order: id, p_ship: [{ line_id: line.id, qty_shipped: 5 }],
      p_carrier: null, p_tracking: null, p_invoice_timing: "now", p_request_id: crypto.randomUUID(),
    });
    const invId = (shipped.data as { invoice_id: string }).invoice_id;
    const { data: il } = await admin.from("invoice_lines").select().eq("invoice_id", invId).single();

    const unsold = await staffDb.rpc("return_shipment", {
      p_invoice: invId, p_location: whId, p_reason: "unsold",
      p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(unsold.error).toBeNull();
    const memoId = (unsold.data as { credit_memo_id: string }).credit_memo_id;
    const { data: memoLines } = await admin.from("invoice_lines").select("qty, unit_price_cents").eq("invoice_id", memoId);
    expect(memoLines).toEqual([{ qty: -1, unit_price_cents: 12000 }]); // credited at the invoiced price
    const { data: back } = await admin.from("inventory_movements").select("type,qty,location_id").eq("ref", memoId);
    expect(back).toEqual([{ type: "return_in", qty: 1, location_id: whId }]);

    const damaged = await staffDb.rpc("return_shipment", {
      p_invoice: invId, p_location: whId, p_reason: "damaged",
      p_lines: [{ invoice_line_id: il!.id, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(damaged.error).toBeNull();
    const memo2 = (damaged.data as { credit_memo_id: string }).credit_memo_id;
    const { data: mvs } = await admin.from("inventory_movements").select("type,qty").eq("ref", memo2);
    expect(mvs!.sort((a, b) => a.type.localeCompare(b.type))).toEqual([{ type: "loss", qty: -1 }, { type: "return_in", qty: 1 }]);
  });
});

describe("release_allocation and get_shortfalls", () => {
  it("get_shortfalls lists negative-ATP skus; release_allocation frees the reservation", async () => {
    const ctx = { db: staffDb, userId: staffId, breweryId: b.id, role: "admin" as const };
    const id = await confirmedOrder(1000); // opening balance is 100
    const line = await lineOf(id);
    const { data: alloc } = await admin.from("allocations").select("id").eq("ref", line.id).single();
    const short = await runCommand("get_shortfalls", {}, ctx) as { skuId: string; skuName: string; atp: number }[];
    const row = short.find((s) => s.skuId === skuId);
    expect(row).toBeDefined();
    expect(row!.atp).toBeLessThan(0);
    expect(row!.skuName).toBe("IPA 1/2bbl");
    await runCommand("release_allocation", { allocationId: alloc!.id }, ctx);
    const { data: a2 } = await admin.from("allocations").select("status").eq("id", alloc!.id).single();
    expect(a2!.status).toBe("released");
    const after = await runCommand("get_shortfalls", {}, ctx) as { skuId: string }[];
    expect(after.some((s) => s.skuId === skuId)).toBe(false);
    await expect(runCommand("release_allocation", { allocationId: alloc!.id }, ctx)).rejects.toThrow(/not open/);
  });
});

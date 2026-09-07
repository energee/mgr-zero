// tests/orders-lifecycle.test.ts — create → submit → confirm → adjust → cancel via rpc.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser, seedCatalog, seedLocation, seedCustomer } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

let b: { id: string }, staffDb: SupabaseClient, staffId: string;
let customerId: string, shipToId: string, whId: string, whBinId: string, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  const staff = await makeStaff(b.id); staffId = staff.id; staffDb = await asUser(staff.email);
  ({ id: whId, binId: whBinId } = await seedLocation(b.id));
  ({ skuId } = await seedCatalog(b.id, { sku: "IPA 1/2bbl", packageType: "keg", bblPerUnit: 0.5 }));
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  const { error: pliErr } = await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: cust.priceListId, sku_id: skuId, unit_price_cents: 12000 });
  if (pliErr) throw new Error(`Failed to create price list item: ${pliErr.message}`);
  // on-hand: 100 units
  const { error: imErr } = await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: staffId });
  if (imErr) throw new Error(`Failed to create inventory movement: ${imErr.message}`);
});

async function createOrder(qty = 10) {
  const { data, error } = await staffDb.rpc("create_order", {
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: "2026-09-05", p_po: null, p_note: null,
    p_lines: [{ sku_id: skuId, qty }],
    p_request_id: crypto.randomUUID(),
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
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    expect((data as { warnings: unknown[] }).warnings).toEqual([]);
    const { data: allocs } = await admin.from("allocations").select().eq("brewery_id", b.id).eq("status", "open");
    expect(allocs!.some(a => Number(a.qty) === 10)).toBe(true);
  });
  it("confirm warns (but does not block) when overselling", async () => {
    const id = await createOrder(500);
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const { data, error } = await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
    expect(error).toBeNull();
    const warnings = (data as { warnings: { sku_id: string; atp: number }[] }).warnings;
    expect(warnings.length).toBe(1);
    expect(Number(warnings[0].atp)).toBeLessThan(0);
  });
  it("adjust re-syncs allocations; cancel releases them", async () => {
    const id = await createOrder(10);
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const { error: adjErr } = await staffDb.rpc("adjust_order_lines", { p_order: id, p_lines: [{ sku_id: skuId, qty: 4 }], p_reason: "short week", p_request_id: crypto.randomUUID() });
    expect(adjErr).toBeNull();
    const { data: line } = await admin.from("order_lines").select().eq("order_id", id).single();
    expect(Number(line!.qty_ordered)).toBe(4);
    const { data: alloc } = await admin.from("allocations").select().eq("ref", line!.id).eq("status", "open").single();
    expect(Number(alloc!.qty)).toBe(4);
    await staffDb.rpc("cancel_order", { p_order: id, p_reason: "closed", p_request_id: crypto.randomUUID() });
    const { data: released } = await admin.from("allocations").select().eq("ref", line!.id).single();
    expect(released!.status).toBe("released");
    const { data: o } = await admin.from("orders").select("status").eq("id", id).single();
    expect(o!.status).toBe("cancelled");
  });
  it("update_draft_order replaces lines, re-snapshots price, and updates order fields", async () => {
    const id = await createOrder(10);
    // Update: reduce qty 10 → 7, change po_number
    const { error: updErr } = await staffDb.rpc("update_draft_order", {
      p_order: id,
      p_ship_to: null,
      p_requested: null,
      p_po: "PO-123",
      p_note: null,
      p_lines: [{ sku_id: skuId, qty: 7 }],
      p_request_id: crypto.randomUUID(),
    });
    expect(updErr).toBeNull();
    // Assert line qty_ordered is 7 with price re-snapshotted (12000)
    const { data: line } = await admin.from("order_lines").select().eq("order_id", id).single();
    expect(Number(line!.qty_ordered)).toBe(7);
    expect(line!.unit_price_cents).toBe(12000);
    // Assert orders.po_number updated
    const { data: order } = await admin.from("orders").select("po_number").eq("id", id).single();
    expect(order!.po_number).toBe("PO-123");
    // Assert events are ["created", "updated"]
    const { data: events } = await admin.from("order_events").select().eq("order_id", id).order("created_at", { ascending: true });
    expect(events!.map(e => e.event)).toEqual(["created", "updated"]);
  });
  it("update_draft_order rejects when order is submitted", async () => {
    const id = await createOrder(10);
    await staffDb.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() });
    const { error } = await staffDb.rpc("update_draft_order", {
      p_order: id,
      p_ship_to: null,
      p_requested: null,
      p_po: "PO-456",
      p_note: null,
      p_lines: [{ sku_id: skuId, qty: 5 }],
      p_request_id: crypto.randomUUID(),
    });
    expect(error!.message).toMatch(/order is/);
  });
  it("rejects wrong-status transitions", async () => {
    const id = await createOrder();
    const { error } = await staffDb.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() }); // still draft
    expect(error!.message).toMatch(/draft/);
  });
});

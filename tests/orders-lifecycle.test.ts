// tests/orders-lifecycle.test.ts — create → submit → confirm → adjust → cancel via rpc.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, asUser } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

let b: { id: string }, staffDb: SupabaseClient, staffId: string;
let customerId: string, shipToId: string, whId: string, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  const staff = await makeStaff(b.id); staffId = staff.id; staffDb = await asUser(staff.email);
  const { data: wh, error: whErr } = await admin.from("locations").insert({ brewery_id: b.id, name: "WH", kind: "warehouse" }).select().single();
  if (whErr) throw new Error(`Failed to create location: ${whErr.message}`);
  whId = wh!.id;
  const { data: p, error: pErr } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  if (pErr) throw new Error(`Failed to create product: ${pErr.message}`);
  const { data: s, error: sErr } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA 1/2bbl", package_type: "keg", bbl_per_unit: 0.5 }).select().single();
  if (sErr) throw new Error(`Failed to create SKU: ${sErr.message}`);
  skuId = s!.id;
  const { data: pl, error: plErr } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  if (plErr) throw new Error(`Failed to create price list: ${plErr.message}`);
  const { error: pliErr } = await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 12000 });
  if (pliErr) throw new Error(`Failed to create price list item: ${pliErr.message}`);
  const { data: c, error: cErr } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl!.id }).select().single();
  if (cErr) throw new Error(`Failed to create customer: ${cErr.message}`);
  customerId = c!.id;
  const { data: st, error: stErr } = await admin.from("ship_tos").insert({ brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" }).select().single();
  if (stErr) throw new Error(`Failed to create ship_to: ${stErr.message}`);
  shipToId = st!.id;
  // on-hand: 100 units
  const { error: imErr } = await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, qty: 100, type: "opening_balance", created_by: staffId });
  if (imErr) throw new Error(`Failed to create inventory movement: ${imErr.message}`);
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

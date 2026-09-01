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
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", package_type: "can", bbl_per_unit: 0.0645 }).select().single();
  skuId = s!.id;
  const { data: pl } = await admin.from("price_lists").insert({ brewery_id: b.id, name: "std" }).select().single();
  await admin.from("price_list_items").insert({ brewery_id: b.id, price_list_id: pl!.id, sku_id: skuId, unit_price_cents: 3600 });
  const { data: c } = await admin.from("customers").insert({ brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl!.id }).select().single();
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

describe("standing taproom allocations", () => {
  it("set creates an open allocation, shows in list, and reduces ATP; qty 0 releases it", async () => {
    const { data: tap } = await admin.from("locations").insert({ brewery_id: b.id, name: "Tap", kind: "taproom" }).select().single();
    const tapId = tap!.id;
    await admin.from("inventory_movements").insert({
      brewery_id: b.id, sku_id: skuId, location_id: tapId, qty: 20, type: "opening_balance", created_by: adminCtx.userId,
    });
    const atpBefore = await runCommand("get_atp", { skuId }, adminCtx) as { sku_id: string; qty: number }[];
    const before = atpBefore.find(r => r.sku_id === skuId)!.qty;

    const set = await runCommand("set_standing_allocation", { locationId: tapId, skuId, qty: 6 }, adminCtx) as { allocation_id: string; status: string };
    expect(set.status).toBe("open");

    const list = await runCommand("list_standing_allocations", { locationId: tapId }, adminCtx) as { id: string; sku_id: string; qty: number }[];
    expect(list.some(a => a.id === set.allocation_id && a.sku_id === skuId && Number(a.qty) === 6)).toBe(true);

    const atpAfter = await runCommand("get_atp", { skuId }, adminCtx) as { sku_id: string; qty: number }[];
    const after = atpAfter.find(r => r.sku_id === skuId)!.qty;
    expect(Number(after)).toBe(Number(before) - 6);

    // Setting again updates the same row rather than creating a second one.
    const setAgain = await runCommand("set_standing_allocation", { locationId: tapId, skuId, qty: 9 }, adminCtx) as { allocation_id: string; status: string };
    expect(setAgain.allocation_id).toBe(set.allocation_id);
    const listAgain = await runCommand("list_standing_allocations", { locationId: tapId }, adminCtx) as { id: string; qty: number }[];
    expect(listAgain.length).toBe(1);
    expect(Number(listAgain[0].qty)).toBe(9);

    const released = await runCommand("set_standing_allocation", { locationId: tapId, skuId, qty: 0 }, adminCtx) as { status: string };
    expect(released.status).toBe("released");
    const listAfterRelease = await runCommand("list_standing_allocations", { locationId: tapId }, adminCtx) as unknown[];
    expect(listAfterRelease.length).toBe(0);
  });

  it("brewer role cannot set standing allocations", async () => {
    const { data: tap } = await admin.from("locations").insert({ brewery_id: b.id, name: "Tap2", kind: "taproom" }).select().single();
    await expect(runCommand("set_standing_allocation", { locationId: tap!.id, skuId, qty: 1 }, brewerCtx)).rejects.toThrow(/permission denied/);
  });
});

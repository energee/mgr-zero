// tests/pickup-orders.test.ts — a pickup order is collected at the brewery, so
// it never goes on a delivery route (docs/plans/lolev-orders.md, task 5). It
// still names a ship-to: that is its destination for TTB. A pickup is
// invoiced when it ships, because only a route delivery invoices on_delivery.
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { admin, asUser, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string, whId: string, customerId: string, shipToId: string, skuId: string;

beforeAll(async () => {
  const b = await makeBrewery();
  breweryId = b.id;
  adminCtx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id);
  whId = wh.id;
  const cat = await seedCatalog(b.id, { sku: "IPA case" });
  skuId = cat.skuId;
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  await priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 4000 });
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: wh.binId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

const create = async (pickup?: boolean) => (await runCommand("create_order", {
  kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 2 }], pickup,
}, adminCtx) as { order_id: string }).order_id;

const pickupOf = async (orderId: string) =>
  (await admin.from("orders").select("pickup").eq("id", orderId).single()).data!.pickup;

/** Submit, confirm and pick a draft order; returns its one line id. */
async function pick(orderId: string) {
  await runCommand("submit_order", { orderId }, adminCtx);
  await runCommand("confirm_order", { orderId }, adminCtx);
  const { data: line } = await admin.from("order_lines").select("id").eq("order_id", orderId).single();
  await runCommand("record_pick", { orderId, picks: [{ lineId: line!.id, qty: 2 }] }, adminCtx);
  return line!.id as string;
}

/** Ship a draft order whole; returns its shipment id. */
async function ship(orderId: string) {
  const lineId = await pick(orderId);
  await runCommand("ship_order", { orderId, ship: [{ lineId, qty: 2 }], invoiceTiming: "now" }, adminCtx);
  return (await admin.from("shipments").select("id").eq("order_id", orderId).single()).data!.id as string;
}

const unrouted = async () =>
  (await runCommand("list_routes", {}, adminCtx) as { unassigned: { id: string }[] }).unassigned.map((d) => d.id);

describe("pickup orders", () => {
  it("create_order saves pickup, and an order created without it is not a pickup", async () => {
    expect(await pickupOf(await create(true))).toBe(true);
    expect(await pickupOf(await create())).toBe(false);
  });

  it("a shipped pickup order is not in list_routes' unrouted shipments", async () => {
    const shipmentId = await ship(await create(true));
    expect(await unrouted()).not.toContain(shipmentId);
  });

  it("save_route refuses a pickup order's shipment", async () => {
    const shipmentId = await ship(await create(true));
    await expect(runCommand("save_route", { deliveryDate: "2026-10-20", stops: [{ shipmentId, stopNo: 1 }] }, adminCtx))
      .rejects.toThrow(/a pickup order is not delivered on a route/);
  });

  it("a shipped order that is not a pickup is unrouted and routes", async () => {
    const shipmentId = await ship(await create(false));
    expect(await unrouted()).toContain(shipmentId);
    const saved = await runCommand("save_route", { deliveryDate: "2026-10-20", stops: [{ shipmentId, stopNo: 1 }] }, adminCtx) as { routeId: string };
    expect(saved.routeId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("update_draft_order keeps pickup when omitted and changes it when given", async () => {
    const orderId = await create(true);
    const edit = { orderId, shipToId, lines: [{ skuId, qty: 3 }] };
    await runCommand("update_draft_order", edit, adminCtx);
    expect(await pickupOf(orderId)).toBe(true);
    await runCommand("update_draft_order", { ...edit, pickup: false }, adminCtx);
    expect(await pickupOf(orderId)).toBe(false);
  });

  it.each(["draft", "submitted", "confirmed", "picked"] as const)("staff can change pickup on a %s order without changing its fulfillment work", async status => {
    const orderId = await create();
    if (status !== "draft") await runCommand("submit_order", { orderId }, adminCtx);
    if (status === "confirmed" || status === "picked") await runCommand("confirm_order", { orderId }, adminCtx);
    if (status === "picked") {
      const { data: line } = await admin.from("order_lines").select("id").eq("order_id", orderId).single();
      await runCommand("record_pick", { orderId, picks: [{ lineId: line!.id, qty: 2 }] }, adminCtx);
    }
    const snapshot = async () => {
      const { data, error } = await admin.from("orders").select("status, needs_restock, repick_since, order_lines(*), order_deposit_lines(*)").eq("id", orderId).single();
      expect(error).toBeNull();
      const { data: allocations, error: allocationError } = await admin.from("allocations").select("*").in("ref", data!.order_lines.map(line => line.id)).order("id");
      expect(allocationError).toBeNull();
      return { order: data, allocations };
    };
    const before = await snapshot();
    const input = { orderId, pickup: true };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const result = await runCommand("set_order_pickup", input, adminCtx, execution);
    expect(await pickupOf(orderId)).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(await runCommand("set_order_pickup", input, adminCtx, execution)).toEqual(result);
    await runCommand("set_order_pickup", input, adminCtx);
    await expect(runCommand("set_order_pickup", { ...input, pickup: false }, adminCtx, execution)).rejects.toMatchObject({ code: "conflict" });
    expect((await admin.from("order_events").select("payload").eq("order_id", orderId).eq("event", "pickup_changed")).data)
      .toEqual([{ payload: { before: false, pickup: true } }]);
    await runCommand("set_order_pickup", { orderId, pickup: false }, adminCtx);
    expect(await pickupOf(orderId)).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("marks a submitted portal order for collection before staff ships and invoices it", async () => {
    await runCommand("set_portal_fulfillment_source", { locationId: whId }, adminCtx);
    const buyer = await asUser((await makeCustomerUser(customerId)).email);
    const created = await buyer.rpc("portal_create_order", {
      p_brewery: breweryId, p_customer: customerId, p_ship_to: shipToId, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 2 }], p_request_id: crypto.randomUUID(),
    });
    expect(created.error).toBeNull();
    const { order_id: orderId } = z.object({ order_id: z.string().uuid() }).parse(created.data);
    const submitted = await buyer.rpc("submit_order", {
      p_order: orderId, p_expected_brewery: breweryId, p_expected_customer: customerId, p_request_id: crypto.randomUUID(),
    });
    expect(submitted.error).toBeNull();
    await runCommand("set_order_pickup", { orderId, pickup: true }, adminCtx);
    await runCommand("confirm_order", { orderId }, adminCtx);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", orderId).single();
    await runCommand("record_pick", { orderId, picks: [{ lineId: line!.id, qty: 2 }] }, adminCtx);
    await expect(runCommand("ship_order", { orderId, ship: [{ lineId: line!.id, qty: 2 }], invoiceTiming: "on_delivery" }, adminCtx))
      .rejects.toThrow(/a pickup order is invoiced when it ships/);
    await runCommand("ship_order", { orderId, ship: [{ lineId: line!.id, qty: 2 }], invoiceTiming: "now" }, adminCtx);
    const { data: shipment } = await admin.from("shipments").select("id, invoices(id)").eq("order_id", orderId).single();
    expect(shipment?.invoices).toHaveLength(1);
    expect(await unrouted()).not.toContain(shipment!.id);
  });

  it("refuses pickup changes after shipping or cancellation, but replays a completed change after shipping", async () => {
    const orderId = await create();
    const input = { orderId, pickup: true };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const result = await runCommand("set_order_pickup", input, adminCtx, execution);
    await ship(orderId);
    expect(await runCommand("set_order_pickup", input, adminCtx, execution)).toEqual(result);
    await expect(runCommand("set_order_pickup", { orderId, pickup: false }, adminCtx)).rejects.toThrow(/order is shipped/);
    expect(await pickupOf(orderId)).toBe(true);
    const cancelled = await create();
    await runCommand("cancel_order", { orderId: cancelled, reason: "No longer needed" }, adminCtx);
    await expect(runCommand("set_order_pickup", { orderId: cancelled, pickup: true }, adminCtx)).rejects.toThrow(/order is cancelled/);
    expect(await pickupOf(cancelled)).toBe(false);
  });

  it("refuses setting pickup on a taproom transfer", async () => {
    const taproom = await seedLocation(breweryId, { name: "Transfer destination", uses: ["taproom"] });
    const { order_id: orderId } = await runCommand("create_order", {
      kind: "taproom_transfer", fromLocationId: whId, toLocationId: taproom.id, lines: [{ skuId, qty: 1 }],
    }, adminCtx) as { order_id: string };
    await expect(runCommand("set_order_pickup", { orderId, pickup: true }, adminCtx))
      .rejects.toMatchObject({ status: 400, code: "invalid_input" });
    expect(await pickupOf(orderId)).toBe(false);
  });

  it("a pickup order is invoiced when it ships, so on_delivery is refused", async () => {
    const refused = await create(true);
    const lineId = await pick(refused);
    await expect(runCommand("ship_order", { orderId: refused, ship: [{ lineId, qty: 2 }], invoiceTiming: "on_delivery" }, adminCtx))
      .rejects.toThrow(/a pickup order is invoiced when it ships/);
    const shipped = await create(true);
    const shipmentId = await ship(shipped);
    const { data: invoice } = await admin.from("invoices").select("id").eq("shipment_id", shipmentId).eq("kind", "invoice").single();
    expect(invoice?.id).toBeTruthy();
  });

  it("refuses a missing pickup value at the RPC boundary without changing the order", async () => {
    const orderId = await create();
    const { error } = await adminCtx.db.rpc("set_order_pickup", { p_order: orderId, p_pickup: null, p_request_id: crypto.randomUUID() });
    expect(error).toMatchObject({ code: "22023", message: "pickup is required" });
    expect(await pickupOf(orderId)).toBe(false);
    expect((await admin.from("order_events").select("id").eq("order_id", orderId).eq("event", "pickup_changed")).data).toEqual([]);
  });

  it("only a wholesale order can be a pickup", async () => {
    const taproom = await seedLocation(breweryId, { name: "Taproom", uses: ["taproom"] });
    const { error } = await adminCtx.db.rpc("create_order", {
      p_brewery: breweryId, p_kind: "taproom_transfer", p_customer: null, p_ship_to: null, p_from_location: whId, p_to_location: taproom.id,
      p_requested: null, p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 1 }], p_request_id: crypto.randomUUID(), p_pickup: true,
    });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/orders_pickup_wholesale/);
  });

  it("a buyer editing a draft cannot mark it a pickup", async () => {
    const orderId = await create();
    const buyer = await asUser((await makeCustomerUser(customerId)).email);
    const { error } = await buyer.rpc("update_draft_order", {
      p_order: orderId, p_ship_to: null, p_requested: null, p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 1 }],
      p_request_id: crypto.randomUUID(), p_clear_requested: false, p_expected_brewery: breweryId, p_expected_customer: customerId, p_pickup: true,
    });
    expect(error?.code).toBe("42501");
    expect(await pickupOf(orderId)).toBe(false);
  });
});

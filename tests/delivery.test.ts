// tests/delivery.test.ts — Program 8: delivery routes. A stop is a customer
// shipment or a stock transfer (locations spec Decision 4); save_route
// replaces a route's stops in one RPC; depart/confirm/return walk the route
// and Today's delivery_next follows the assigned driver.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, priceSku } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let whId: string, whBinId: string, storageId: string, storageBinId: string;
let customerId: string, shipToId: string, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  ({ id: whId, binId: whBinId } = await seedLocation(b.id));
  ({ id: storageId, binId: storageBinId } = await seedLocation(b.id, { name: "Storage", kind: "storage" }));
  const cat = await seedCatalog(b.id, { sku: "IPA 1/2bbl", packageType: "keg", bblPerUnit: 0.5 });
  skuId = cat.skuId;
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  await priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
  await admin.from("inventory_movements").insert({ brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

/** A shipped wholesale order; returns its shipment id. */
async function shipment(qty = 2, invoiceTiming: "now" | "on_delivery" = "now") {
  const { order_id: id } = await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty }],
  }, adminCtx) as { order_id: string };
  await runCommand("submit_order", { orderId: id }, adminCtx);
  await runCommand("confirm_order", { orderId: id }, adminCtx);
  const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
  await runCommand("record_pick", { orderId: id, picks: [{ lineId: line!.id, qty }] }, adminCtx);
  await runCommand("ship_order", { orderId: id, ship: [{ lineId: line!.id, qty }], invoiceTiming }, adminCtx);
  const { data: sh } = await admin.from("shipments").select("id").eq("order_id", id).single();
  return sh!.id as string;
}

/** A picked stock transfer warehouse → storage; returns its id. */
async function transfer(qty = 1) {
  const { transferId } = await runCommand("create_stock_transfer", {
    fromLocationId: whId, toLocationId: storageId, lines: [{ skuId, qty, fromBinId: whBinId, toBinId: storageBinId }],
  }, adminCtx) as { transferId: string };
  await runCommand("submit_stock_transfer", { transferId }, adminCtx);
  const { data: line } = await admin.from("stock_transfer_lines").select("id").eq("transfer_id", transferId).single();
  await runCommand("record_stock_transfer_pick", { transferId, picks: [{ lineId: line!.id, qty }] }, adminCtx);
  return transferId;
}

describe("deliveries schema", () => {
  it("a delivery must reference exactly one document", async () => {
    const { data: route } = await admin.from("routes").insert({ brewery_id: b.id, delivery_date: "2026-09-10", name: "Schema" }).select().single();
    const sh = await shipment();
    const tr = await transfer();
    const { error: neither } = await admin.from("deliveries").insert({ brewery_id: b.id, route_id: route!.id, stop_no: 1 });
    expect(neither).not.toBeNull();
    const { error: both } = await admin.from("deliveries").insert({ brewery_id: b.id, route_id: route!.id, stop_no: 2, shipment_id: sh, stock_transfer_id: tr });
    expect(both).not.toBeNull();
    const { error: ok } = await admin.from("deliveries").insert({ brewery_id: b.id, route_id: route!.id, stop_no: 3, stock_transfer_id: tr });
    expect(ok).toBeNull();
  });
});

describe("save_route and list_routes", () => {
  it("saves a mixed route, lists it by date, and refuses a shipment already on an open route", async () => {
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    const [sh1, sh2, tr] = [await shipment(), await shipment(), await transfer()];
    const saved = await runCommand("save_route", {
      name: "Route A", deliveryDate: "2026-09-11", driverUserId: warehouse.userId, vehicle: "Box truck 2",
      stops: [{ shipmentId: sh1, stopNo: 1 }, { stockTransferId: tr, stopNo: 2 }, { shipmentId: sh2, stopNo: 3 }],
    }, adminCtx) as { routeId: string };
    expect(saved.routeId).toMatch(/^[0-9a-f-]{36}$/i);

    const listed = await runCommand("list_routes", { date: "2026-09-11" }, warehouse) as {
      routes: { id: string; name: string; driver_user_id: string; stops: { stop_no: number; shipment_id: string | null; stock_transfer_id: string | null; label: string }[] }[];
      unassigned: { id: string; kind: string }[];
      drivers: { user_id: string; role: string }[];
    };
    const route = listed.routes.find((r) => r.id === saved.routeId)!;
    expect(route.name).toBe("Route A");
    expect(route.stops.map((s) => s.stop_no)).toEqual([1, 2, 3]);
    expect(route.stops[1].stock_transfer_id).toBe(tr);
    expect(route.stops[1].label).toMatch(/TRF-\d{4}/);
    expect(route.stops[0].label).toMatch(/ORD-\d{4}/);
    expect(listed.unassigned.map((d) => d.id)).not.toContain(sh1);
    expect(listed.unassigned.map((d) => d.id)).not.toContain(tr);
    expect(listed.drivers.map((d) => d.user_id)).toContain(warehouse.userId);
    // an empty date lists nothing; no date lists every route that has not returned
    expect((await runCommand("list_routes", { date: "2030-01-01" }, warehouse) as { routes: unknown[] }).routes).toEqual([]);

    // re-saving replaces the stops: drop stop 3 and it becomes unassigned again
    await runCommand("save_route", {
      id: saved.routeId, name: "Route A", deliveryDate: "2026-09-11", driverUserId: warehouse.userId,
      stops: [{ shipmentId: sh1, stopNo: 1 }, { stockTransferId: tr, stopNo: 2 }],
    }, adminCtx);
    const again = await runCommand("list_routes", { date: "2026-09-11" }, adminCtx) as typeof listed;
    expect(again.routes.find((r) => r.id === saved.routeId)!.stops.length).toBe(2);
    expect(again.unassigned.map((d) => d.id)).toContain(sh2);
    // one route by id, returned or not
    expect((await runCommand("list_routes", { id: saved.routeId }, adminCtx) as typeof listed).routes.map((r) => r.id)).toEqual([saved.routeId]);

    // the same shipment cannot sit on a second open route
    await expect(runCommand("save_route", { deliveryDate: "2026-09-12", stops: [{ shipmentId: sh1, stopNo: 1 }] }, adminCtx))
      .rejects.toThrow(/already on route/i);
    // a stop names exactly one document, and no document twice
    await expect(runCommand("save_route", { deliveryDate: "2026-09-12", stops: [{ shipmentId: sh2, stockTransferId: tr, stopNo: 1 }] }, adminCtx))
      .rejects.toThrow();
    await expect(runCommand("save_route", { deliveryDate: "2026-09-12", stops: [{ shipmentId: sh2, stopNo: 1 }, { shipmentId: sh2, stopNo: 2 }] }, adminCtx))
      .rejects.toThrow(/twice/i);
    // the driver must be a warehouse or admin member
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("save_route", { deliveryDate: "2026-09-12", driverUserId: sales.userId, stops: [{ shipmentId: sh2, stopNo: 1 }] }, adminCtx))
      .rejects.toThrow(/driver/i);
    // a route cannot be empty (Routes says New route is the only action when there is nothing to deliver)
    await expect(runCommand("save_route", { deliveryDate: "2026-09-12", stops: [] }, adminCtx)).rejects.toThrow();
  });

  it("get_delivery_stop describes a transfer stop by its destination and picked lines", async () => {
    const tr = await transfer(3);
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-13", stops: [{ stockTransferId: tr, stopNo: 1 }] }, adminCtx) as { routeId: string };
    const { data: d } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const stop = await runCommand("get_delivery_stop", { deliveryId: d!.id }, adminCtx) as {
      delivery: { stock_transfers: { transfer_no: number; to_location: { name: string } } | null; shipments: unknown };
      lines: { qty: number }[]; invoice: unknown;
    };
    expect(stop.delivery.shipments).toBeNull();
    expect(stop.delivery.stock_transfers?.to_location.name).toBe("Storage");
    expect(stop.lines.map((l) => l.qty)).toEqual([3]);
    expect(stop.invoice).toBeNull();
  });
});

describe("depart, confirm, and return a route", () => {
  it("walks a mixed route: the driver departs, Today names the next stop, a transfer stop confirms without an invoice, return waits for the last stop", async () => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const other = await makeStaffCtx(b.id, "warehouse");
    const sh = await shipment(2, "on_delivery");
    const tr = await transfer();
    const { routeId } = await runCommand("save_route", {
      name: "Route D", deliveryDate: "2026-09-14", driverUserId: driver.userId,
      stops: [{ stockTransferId: tr, stopNo: 1 }, { shipmentId: sh, stopNo: 2 }],
    }, adminCtx) as { routeId: string };

    // only the assigned driver or an admin runs the route
    await expect(runCommand("depart_route", { routeId }, other)).rejects.toThrow(/permission|driver/i);
    await expect(runCommand("return_route", { routeId }, driver)).rejects.toThrow(/depart/i);
    await runCommand("depart_route", { routeId }, driver);
    const { data: r1 } = await admin.from("routes").select("departed_at").eq("id", routeId).single();
    expect(r1!.departed_at).not.toBeNull();
    const { data: t1 } = await admin.from("stock_transfers").select("status").eq("id", tr).single();
    expect(t1!.status).toBe("in_transit");
    // a departed route cannot be re-planned
    await expect(runCommand("save_route", { id: routeId, deliveryDate: "2026-09-14", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx)).rejects.toThrow(/departed/i);

    const { data: stops } = await admin.from("deliveries").select("id, stop_no").eq("route_id", routeId).order("stop_no");
    const ids = stops!.map((s) => s.id);
    const today = async (ctx: typeof driver) => (await runCommand("get_today", { now: "2026-09-14T12:00:00Z" }, ctx) as { reason: string; subjectId: string; href: string }[])
      .filter((t) => t.reason === "delivery_next" && ids.includes(t.subjectId));
    expect(await today(driver)).toMatchObject([{ subjectId: stops![0].id, href: `/work/deliveries/${stops![0].id}` }]);
    expect(await today(other)).toEqual([]);

    // the transfer stop is stamped, nothing is invoiced, and stock has not moved (receiving does that)
    await expect(runCommand("confirm_delivery", { deliveryId: stops![0].id, signedBy: "Sam" }, other)).rejects.toThrow(/permission|driver/i);
    const c1 = await runCommand("confirm_delivery", { deliveryId: stops![0].id, signedBy: "Sam" }, driver) as { invoice_id: string | null };
    expect(c1.invoice_id).toBeNull();
    // the on_delivery shipment on stop 2 is still uninvoiced: stop 1 raised nothing
    expect((await admin.from("invoices").select("id").eq("shipment_id", sh)).data).toEqual([]);
    expect((await admin.from("deliveries").select("delivered_at, signed_by").eq("id", stops![0].id).single()).data).toMatchObject({ signed_by: "Sam" });
    expect(await today(driver)).toMatchObject([{ subjectId: stops![1].id }]);

    await expect(runCommand("return_route", { routeId }, driver)).rejects.toThrow(/stop/i);
    const c2 = await runCommand("confirm_delivery", { deliveryId: stops![1].id, signedBy: "Dana" }, adminCtx) as { invoice_id: string | null };
    expect(c2.invoice_id).not.toBeNull();
    await runCommand("return_route", { routeId }, driver);
    const { data: r2 } = await admin.from("routes").select("returned_at").eq("id", routeId).single();
    expect(r2!.returned_at).not.toBeNull();
    expect(await today(driver)).toEqual([]);
    await expect(runCommand("return_route", { routeId }, adminCtx)).rejects.toThrow(/returned/i);
    await expect(runCommand("depart_route", { routeId }, adminCtx)).rejects.toThrow(/departed/i);
  });
});

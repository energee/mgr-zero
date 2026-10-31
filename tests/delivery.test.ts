// tests/delivery.test.ts — Program 8: delivery routes. A stop is a customer
// shipment or a stock transfer (locations spec Decision 4); save_route
// replaces a route's stops in one RPC; depart/confirm/return walk the route
// and Today's delivery_next follows the assigned driver.
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDeliveryView } from "@/components/mgr/views/confirm-delivery";
import type { ShipToSnapshot } from "@/lib/mgr/ship-to-view";
import { DB, admin, channelId, ins, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, priceSku, sql } from "./helpers";
import { runCommand, type StaffRole } from "@/lib/commands/registry";
import type { TodayItem } from "@/lib/commands/today";
import type { WorkRow } from "@/lib/commands/landings";
import "@/lib/commands/all";

let b: { id: string };
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let whId: string, whBinId: string, storageId: string, storageBinId: string;
let customerId: string, shipToId: string, skuId: string, lotId: string;
let exportCustomerId: string;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  ({ id: whId, binId: whBinId } = await seedLocation(b.id));
  ({ id: storageId, binId: storageBinId } = await seedLocation(b.id, { name: "Storage", uses: ["storage"] }));
  const cat = await seedCatalog(b.id, { sku: "IPA 1/2bbl", packageType: "keg", bblPerUnit: 0.5 });
  skuId = cat.skuId;
  const pool = await ins("keg_pools", { brewery_id: b.id, name: "Return fleet", kind: "owned", deposit_cents: 2500 });
  const { error: poolError } = await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.id }).eq("id", skuId);
  if (poolError) throw poolError;
  const run = await ins("packaging_runs", { brewery_id: b.id, brand_id: cat.brandId, planned_on: "2026-09-01", created_by: adminCtx.userId });
  const lot = await ins("lots", { brewery_id: b.id, packaging_run_id: run.id, brand_id: cat.brandId, code: "REFUSED-LOT", packaged_on: "2026-09-01" });
  lotId = lot.id;
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, lot_id: lotId, qty: 20, type: "opening_balance", created_by: adminCtx.userId });
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  await priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
  const exportChannelId = await channelId(b.id, "Export");
  const exporter = await runCommand("upsert_customer", {
    name: "Fictional Export Account", type: "retailer", country: "JP", saleChannelId: exportChannelId,
  }, adminCtx) as { id: string };
  exportCustomerId = exporter.id;
  await priceSku(b.id, { saleChannelId: exportChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

/** A shipped wholesale order for its customer and destination; returns its shipment id. */
async function shipment(qty = 2, invoiceTiming: "now" | "on_delivery" = "now", sourceLotId?: string, destination = { customerId, shipToId }) {
  const { order_id: id } = await runCommand("create_order", {
    kind: "wholesale", ...destination, fromLocationId: whId, lines: [{ skuId, qty }],
  }, adminCtx) as { order_id: string };
  await runCommand("submit_order", { orderId: id }, adminCtx);
  await runCommand("confirm_order", { orderId: id }, adminCtx);
  const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
  await runCommand("record_pick", { orderId: id, picks: [{ lineId: line!.id, qty }] }, adminCtx);
  await runCommand("ship_order", { orderId: id, ship: [{ lineId: line!.id, qty, ...(sourceLotId ? { sources: [{ binId: whBinId, lotId: sourceLotId, qty }] } : {}) }], invoiceTiming }, adminCtx);
  const { data: sh } = await admin.from("shipments").select("id").eq("order_id", id).single();
  return sh!.id as string;
}

/** A picked stock transfer warehouse → storage; returns its id. */
async function transfer(qty = 1) {
  const { transferId } = await runCommand("create_stock_transfer", {
    fromLocationId: whId, toLocationId: storageId, lines: [{ skuId, qty, fromBinId: whBinId, toBinId: storageBinId }],
  }, adminCtx) as { transferId: string };
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
  it("lists eligible multi-role drivers once and excludes members without warehouse or admin", async () => {
    const combined = await makeStaffCtx(b.id, ["sales", "warehouse"]);
    const nonDriver = await makeStaffCtx(b.id, ["sales", "brewer"]);
    const listed = await runCommand("list_routes", { date: "2030-01-01" }, combined) as {
      drivers: { user_id: string; roles: StaffRole[] }[];
    };
    const email = (await admin.auth.admin.getUserById(combined.userId)).data.user!.email;
    expect(listed.drivers.filter(driver => driver.user_id === combined.userId))
      .toEqual([{ user_id: combined.userId, email, roles: ["sales", "warehouse"] }]);
    expect(listed.drivers.some(driver => driver.user_id === nonDriver.userId)).toBe(false);
  });

  // #1124: a route names its driver by roster email; a driver no longer on the team has none.
  it("names each route's driver by roster email, and none once the driver leaves the team", async () => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const email = (await admin.auth.admin.getUserById(driver.userId)).data.user!.email;
    const { routeId } = await runCommand("save_route", {
      name: "Named driver", deliveryDate: "2030-02-01", driverUserId: driver.userId, stops: [{ shipmentId: await shipment(), stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    const driverOf = async () => (await runCommand("list_routes", { id: routeId }, adminCtx) as { routes: { driver_user_id: string; driver_email: string | null }[] }).routes[0];
    expect(await driverOf()).toMatchObject({ driver_user_id: driver.userId, driver_email: email });
    await runCommand("revoke_staff", { userId: driver.userId }, adminCtx);
    expect(await driverOf()).toMatchObject({ driver_user_id: driver.userId, driver_email: null });
  });

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
      drivers: { user_id: string; roles: StaffRole[] }[];
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

  it.each([
    {
      name: "US street, second line and postal code",
      address: { label: "Dock", country: "US", address1: "123 Fictional Lane", address2: "Suite 4", city: "Phoenixville", state: "PA", zip: "19460" },
      missing: false,
    },
    {
      name: "foreign street and postal code without a US state",
      address: { label: "Receiving", country: "JP", address1: "2-3 Fictional Street", address2: "Floor 5", city: "Tokyo", state: null, zip: "100-0001" },
      missing: false,
    },
    {
      name: "US destination with unrecorded street and postal code",
      // Each case adds a ship-to to one customer, so labels differ (ship_tos_customer_label_key).
      address: { label: "Side dock", country: "US", address1: null, address2: null, city: "Phoenixville", state: "PA", zip: null },
      missing: true,
    },
    {
      name: "foreign destination with only its label and country",
      address: { label: "Back receiving", country: "JP", address1: null, address2: null, city: null, state: null, zip: null },
      missing: true,
    },
  ])("hands off the $name through the assigned driver's authorized stop query", async ({ address, missing }) => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const destinationCustomerId = address.country === "US" ? customerId : exportCustomerId;
    const shipTo = await runCommand("upsert_ship_to", {
      customerId: destinationCustomerId, label: address.label, country: address.country,
      address1: address.address1 ?? undefined, address2: address.address2 ?? undefined,
      city: address.city ?? undefined, state: address.state ?? undefined, zip: address.zip ?? undefined,
    }, adminCtx) as { id: string };
    const sh = await shipment(1, "on_delivery", undefined, { customerId: destinationCustomerId, shipToId: shipTo.id });
    const { routeId } = await runCommand("save_route", {
      deliveryDate: "2026-09-13", driverUserId: driver.userId, stops: [{ shipmentId: sh, stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, driver);
    const listed = await runCommand("list_routes", { id: routeId }, driver) as { routes: { stops: { id: string }[] }[] };
    const deliveryId = listed.routes[0].stops[0].id;
    const detail = await runCommand("get_delivery_stop", { deliveryId }, driver) as {
      delivery: { shipments: { orders: { customers: { name: string }; ship_tos: ShipToSnapshot } }; stock_transfers: null };
      lines: { id: string; name: string; qty: number }[];
    };
    // Exact authorized projection: no billing/provider fields and no invented address parts.
    expect(detail.delivery.shipments.orders.ship_tos).toEqual(address);
    expect(detail.delivery.stock_transfers).toBeNull();
    const html = renderToStaticMarkup(createElement(ConfirmDeliveryView, { model: {
      title: "Driver stop", heading: detail.delivery.shipments.orders.customers.name,
      shipTo: detail.delivery.shipments.orders.ship_tos, invoiceTiming: "On delivery · saved",
      lines: detail.lines.map((line) => ({ key: line.id, title: line.name, qty: String(line.qty) })),
    } }));
    for (const part of [address.label, address.address1, address.address2, address.city, address.state, address.zip]) {
      if (part) expect(html).toContain(part);
    }
    if (address.country === "JP") expect(html).toContain("Japan");
    expect(html.includes('role="alert"')).toBe(missing);
    if (missing) {
      const notice = html.match(/data-slot="alert-description"[^>]*>([^<]*)</)?.[1] ?? "";
      expect(notice).toMatch(/street/i);
      expect(notice).toMatch(/postal/i);
      expect(html).not.toContain("1 Main St");
      expect(html).not.toContain("19460");
    }
    expect(html).not.toContain("null");
    const brewer = await makeStaffCtx(b.id, "brewer");
    await expect(runCommand("get_delivery_stop", { deliveryId }, brewer)).rejects.toMatchObject({ code: "permission_denied" });
    const otherBrewery = await makeBrewery();
    const outsider = await makeStaffCtx(otherBrewery.id, "warehouse");
    await expect(runCommand("get_delivery_stop", { deliveryId }, outsider)).rejects.toThrow();
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
  it("rejects invalid refused quantities without closing the stop, then records a valid refusal (#1386)", async () => {
    const sh = await shipment(2, "on_delivery");
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-10-25", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const stop = (await admin.from("deliveries").select("id").eq("route_id", routeId).single()).data!;
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop.id }, adminCtx) as { lines: { id: string }[] };
    const orderLineId = detail.lines[0].id;
    for (const qty of [-1, 0, 0.5, 3]) {
      await expect(runCommand("confirm_delivery", {
        deliveryId: stop.id, signedBy: "Pat", reason: "customer_refused", refused: [{ orderLineId, qty }],
      }, adminCtx)).rejects.toThrow();
      expect((await admin.from("order_lines").select("qty_refused").eq("id", orderLineId).single()).data?.qty_refused).toBe(0);
      expect((await admin.from("deliveries").select("outcome, delivered_at").eq("id", stop.id).single()).data).toEqual({ outcome: null, delivered_at: null });
      expect((await admin.from("invoices").select("id").eq("shipment_id", sh)).data).toEqual([]);
    }
    await runCommand("confirm_delivery", {
      deliveryId: stop.id, signedBy: "Pat", reason: "customer_refused", refused: [{ orderLineId, qty: 1 }],
    }, adminCtx);
    expect((await admin.from("order_lines").select("qty_refused").eq("id", orderLineId).single()).data?.qty_refused).toBe(1);
    expect((await admin.from("deliveries").select("outcome").eq("id", stop.id).single()).data?.outcome).toBe("partial");
    const invoice = (await admin.from("invoices").select("id").eq("shipment_id", sh).single()).data!;
    expect((await admin.from("invoice_lines").select("qty").eq("invoice_id", invoice.id).eq("kind", "sku")).data).toEqual([{ qty: 1 }]);
  });

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
    const invoiceDates = (await admin.from("invoices").select("issued_on,due_on").eq("id", c2.invoice_id!).single()).data!;
    const expectedDue = new Date(`${invoiceDates.issued_on}T12:00:00Z`);
    expectedDue.setUTCDate(expectedDue.getUTCDate() + 30);
    expect(invoiceDates.due_on).toBe(expectedDue.toISOString().slice(0, 10));
    await runCommand("return_route", { routeId }, driver);
    const { data: r2 } = await admin.from("routes").select("returned_at").eq("id", routeId).single();
    expect(r2!.returned_at).not.toBeNull();
    expect(await today(driver)).toEqual([]);
    await expect(runCommand("return_route", { routeId }, adminCtx)).rejects.toThrow(/returned/i);
    await expect(runCommand("depart_route", { routeId }, adminCtx)).rejects.toThrow(/departed/i);
  });
});

describe("leave deliveries for later (#813)", () => {
  it("replays a completed legacy closed refusal but rejects a fresh closed refusal", async () => {
    const sh = await shipment(2, "on_delivery");
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-18", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const input = { deliveryId: stop!.id, transferRefused: false, refused: [] as { orderLineId: string; qty: number }[], reason: "closed", note: "", signedBy: "" };
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop!.id }, adminCtx) as { lines: { id: string }[] };
    input.refused = [{ orderLineId: detail.lines[0].id, qty: 2 }];
    const requestId = crypto.randomUUID();
    const stored = { delivery_id: stop!.id, invoice_id: null, outcome: "refused" };
    sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
      values('${adminCtx.userId}','${b.id}','${requestId}','confirm_delivery',
      extensions.digest(jsonb_build_object('delivery','${stop!.id}'::uuid,'signed_by','','refused',jsonb_build_array(jsonb_build_object('order_line_id','${detail.lines[0].id}','qty',2)),'reason','closed','note','','transfer_refused',false)::text,'sha256'),
      '${JSON.stringify(stored)}'::jsonb)`);
    expect(await runCommand("confirm_delivery", input, adminCtx, { requestId, correlationId: requestId })).toEqual(stored);
    const freshId = crypto.randomUUID();
    await expect(runCommand("confirm_delivery", input, adminCtx, { requestId: freshId, correlationId: freshId })).rejects.toThrow(/closed|refusal reason/i);
    expect(sql(`select count(*) from private.command_requests where actor_id='${adminCtx.userId}' and request_id='${freshId}'`)).toEqual(["0"]);
    expect((await admin.from("deliveries").select("outcome").eq("id", stop!.id).single()).data?.outcome).toBeNull();
  });
  it.each(["now", "on_delivery"] as const)("frees an unattempted %s shipment without refusal, money, stock, or keg changes", async (invoiceTiming) => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const sh = await shipment(2, invoiceTiming);
    const { data: shipped } = await admin.from("shipments").select("order_id").eq("id", sh).single();
    const orderId = shipped!.order_id;
    const { routeId } = await runCommand("save_route", {
      deliveryDate: "2026-09-18", driverUserId: driver.userId, stops: [{ shipmentId: sh, stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, driver);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const invoicesBefore = await admin.from("invoices").select("*").eq("shipment_id", sh).order("id");
    const movementsBefore = await admin.from("inventory_movements").select("id, type, qty").eq("ref", orderId).order("id");
    const kegsBefore = await admin.from("keg_events").select("id, qty, reason").eq("shipment_id", sh).order("id");
    expect(invoicesBefore.error).toBeNull();
    expect(movementsBefore.error).toBeNull();
    expect(kegsBefore.error).toBeNull();

    const requestId = crypto.randomUUID();
    const input = { routeId, deliveryId: stop!.id };
    const result = await runCommand("leave_delivery_for_later", input, driver, { requestId, correlationId: requestId });
    expect(result).toMatchObject({ delivery_id: stop!.id, route_id: routeId, shipment_id: sh, stock_transfer_id: null });
    expect((await admin.from("deliveries").select("id").eq("id", stop!.id)).data).toEqual([]);
    expect((await admin.from("orders").select("status").eq("id", orderId).single()).data?.status).toBe("shipped");
    expect((await admin.from("order_lines").select("qty_shipped, qty_refused").eq("order_id", orderId)).data).toEqual([{ qty_shipped: 2, qty_refused: 0 }]);
    expect((await admin.from("invoices").select("*").eq("shipment_id", sh).order("id")).data).toEqual(invoicesBefore.data);
    expect((await admin.from("inventory_movements").select("id, type, qty").eq("ref", orderId).order("id")).data).toEqual(movementsBefore.data);
    expect((await admin.from("inventory_movements").select("id").eq("ref", stop!.id)).data).toEqual([]);
    expect((await admin.from("keg_events").select("id, qty, reason").eq("shipment_id", sh).order("id")).data).toEqual(kegsBefore.data);
    expect((await admin.from("refused_delivery_returns").select("delivery_id").eq("delivery_id", stop!.id)).data).toEqual([]);
    expect((await admin.from("order_events").select("actor, payload").eq("order_id", orderId).eq("event", "delivery_not_attempted")).data)
      .toEqual([{ actor: driver.userId, payload: { delivery_id: stop!.id, route_id: routeId } }]);
    const today = await runCommand("get_today", { now: "2026-09-18T12:00:00Z" }, driver) as { subjectId: string; reason: string }[];
    expect(today.filter((task) => task.subjectId === stop!.id)).toEqual([]);
    const listed = await runCommand("list_routes", { id: routeId }, driver) as { unassigned: { id: string }[] };
    expect(listed.unassigned.map((doc) => doc.id)).toContain(sh);

    await runCommand("return_route", { routeId }, driver);
    expect(await runCommand("leave_delivery_for_later", input, driver, { requestId, correlationId: requestId })).toEqual(result);
    await expect(runCommand("leave_delivery_for_later", { ...input, deliveryId: crypto.randomUUID() }, driver, { requestId, correlationId: requestId }))
      .rejects.toThrow(/different payload/i);
    expect((await admin.from("order_events").select("id").eq("order_id", orderId).eq("event", "delivery_not_attempted")).data).toHaveLength(1);
    const { routeId: laterRoute } = await runCommand("save_route", {
      deliveryDate: "2026-09-19", driverUserId: driver.userId, stops: [{ shipmentId: sh, stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId: laterRoute }, driver);
    const { data: laterStop } = await admin.from("deliveries").select("id").eq("route_id", laterRoute).single();
    await runCommand("confirm_delivery", { deliveryId: laterStop!.id, signedBy: "Pat" }, driver);
    expect((await admin.from("invoices").select("id").eq("shipment_id", sh)).data).toHaveLength(1);
  });

  it("frees an unattempted transfer without receiving stock or creating an order event", async () => {
    const tr = await transfer();
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-18", stops: [{ stockTransferId: tr, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const before = await admin.from("inventory_movements").select("id, type, qty").eq("ref", tr).order("id");
    expect(before.error).toBeNull();
    const requestId = crypto.randomUUID();
    const input = { routeId, deliveryId: stop!.id };
    const result = await runCommand("leave_delivery_for_later", input, adminCtx, { requestId, correlationId: requestId });
    expect(result).toMatchObject({ shipment_id: null, stock_transfer_id: tr });
    expect((await admin.from("deliveries").select("id").eq("id", stop!.id)).data).toEqual([]);
    expect((await admin.from("stock_transfers").select("status").eq("id", tr).single()).data?.status).toBe("in_transit");
    expect((await admin.from("inventory_movements").select("id, type, qty").eq("ref", tr).order("id")).data).toEqual(before.data);
    expect((await admin.from("order_events").select("id").contains("payload", { delivery_id: stop!.id })).data).toEqual([]);
    await runCommand("return_route", { routeId }, adminCtx);
    expect(await runCommand("leave_delivery_for_later", input, adminCtx, { requestId, correlationId: requestId })).toEqual(result);
    const { routeId: laterRoute } = await runCommand("save_route", { deliveryDate: "2026-09-19", stops: [{ stockTransferId: tr, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId: laterRoute }, adminCtx);
  });

  it("rejects undeparted, returned, closed, wrong-route, non-driver, wrong-role, and foreign stops", async () => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const otherDriver = await makeStaffCtx(b.id, "warehouse");
    const sales = await makeStaffCtx(b.id, "sales");
    const foreign = await makeStaffCtx((await makeBrewery()).id, "admin");
    const sh = await shipment(2, "on_delivery");
    const { routeId } = await runCommand("save_route", {
      deliveryDate: "2026-09-18", driverUserId: driver.userId, stops: [{ shipmentId: sh, stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const input = { routeId, deliveryId: stop!.id };
    await expect(runCommand("leave_delivery_for_later", input, driver)).rejects.toThrow(/depart/i);
    await runCommand("depart_route", { routeId }, driver);
    await expect(runCommand("leave_delivery_for_later", input, otherDriver)).rejects.toThrow(/permission|driver/i);
    await expect(runCommand("leave_delivery_for_later", input, sales)).rejects.toThrow(/permission|allowed/i);
    await expect(runCommand("leave_delivery_for_later", input, foreign)).rejects.toThrow(/permission/i);
    const { routeId: wrongRoute } = await runCommand("save_route", {
      deliveryDate: "2026-09-19", stops: [{ stockTransferId: await transfer(), stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId: wrongRoute }, adminCtx);
    await expect(runCommand("leave_delivery_for_later", { ...input, routeId: wrongRoute }, adminCtx)).rejects.toThrow(/delivery not found/i);
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop!.id }, driver) as { lines: { id: string }[] };
    await expect(runCommand("confirm_delivery", { deliveryId: stop!.id, refused: [{ orderLineId: detail.lines[0].id, qty: 2 }], reason: "closed" }, driver)).rejects.toThrow(/closed|refusal reason/i);
    await runCommand("confirm_delivery", { deliveryId: stop!.id, signedBy: "Pat" }, driver);
    await expect(runCommand("leave_delivery_for_later", input, driver)).rejects.toThrow(/delivered|refused|closed/i);
    await runCommand("return_route", { routeId }, driver);
    expect((await admin.from("deliveries").select("id").eq("id", stop!.id)).data).toEqual([{ id: stop!.id }]);
    const returnedRoute = await ins("routes", {
      brewery_id: b.id, delivery_date: "2026-09-19", departed_at: "2026-09-19T12:00:00Z", returned_at: "2026-09-19T13:00:00Z",
    });
    const returnedStop = await ins("deliveries", { brewery_id: b.id, route_id: returnedRoute.id, stop_no: 1, shipment_id: await shipment() });
    await expect(runCommand("leave_delivery_for_later", { routeId: returnedRoute.id, deliveryId: returnedStop.id }, adminCtx)).rejects.toThrow(/returned/i);
    expect((await admin.from("deliveries").select("id").eq("id", returnedStop.id)).data).toEqual([{ id: returnedStop.id }]);
    const { data: wrongStop } = await admin.from("deliveries").select("id").eq("route_id", wrongRoute).single();
    await runCommand("confirm_delivery", { deliveryId: wrongStop!.id, transferRefused: true, reason: "customer_refused" }, adminCtx);
    await expect(runCommand("leave_delivery_for_later", { routeId: wrongRoute, deliveryId: wrongStop!.id }, adminCtx)).rejects.toThrow(/delivered|refused|closed/i);
    expect((await admin.from("deliveries").select("id").eq("id", wrongStop!.id)).data).toEqual([{ id: wrongStop!.id }]);
  });
});

describe("route edges", () => {
  it("replays a completed pre-outcome request without changing the original payload identity", async () => {
    const sh = await shipment(2, "on_delivery");
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-17", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const requestId = crypto.randomUUID();
    const input = { deliveryId: stop!.id, signedBy: "Pat" };
    const saved = await runCommand("confirm_delivery", input, adminCtx, { requestId, correlationId: requestId }) as { delivery_id: string; invoice_id: string };
    const legacy = { delivery_id: saved.delivery_id, invoice_id: saved.invoice_id };
    // A completed request persisted by the old three-argument RPC.
    sql(`update private.command_requests set payload_hash = extensions.digest(jsonb_build_object('delivery','${stop!.id}'::uuid,'signed_by','Pat')::text,'sha256'),
      result = '${JSON.stringify(legacy)}'::jsonb where actor_id='${adminCtx.userId}' and request_id='${requestId}'`);
    expect(await runCommand("confirm_delivery", input, adminCtx, { requestId, correlationId: requestId })).toEqual(legacy);
    expect(await runCommand("confirm_delivery", { ...input, note: "" }, adminCtx, { requestId, correlationId: requestId })).toEqual(legacy);
    await expect(runCommand("confirm_delivery", { ...input, transferRefused: true }, adminCtx, { requestId, correlationId: requestId })).rejects.toThrow(/different payload/i);
    expect((await admin.from("invoices").select("id").eq("shipment_id", sh)).data).toHaveLength(1);
  });

  it("keeps invoice-now money until physical Return and credit clears the refusal", async () => {
    const sh = await shipment(4, "now");
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-17", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop!.id }, adminCtx) as { lines: { id: string }[]; invoice: { id: string } };
    await runCommand("confirm_delivery", { deliveryId: stop!.id, signedBy: "Pat", refused: [{ orderLineId: detail.lines[0].id, qty: 2 }], reason: "customer_refused" }, adminCtx);
    const { data: billed } = await admin.from("invoice_lines").select("id, qty").eq("invoice_id", detail.invoice.id).eq("kind", "sku").single();
    expect(billed!.qty).toBe(4);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toMatchObject([{ outstanding_qty: 2 }]);
    const sales = await makeStaffCtx(b.id, "sales");
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    const creditHref = `/invoices/${detail.invoice.id}/return?refusedDeliveryId=${stop!.id}`;
    const refusalTask = async (ctx: typeof adminCtx) => (await runCommand("get_today", {}, ctx) as TodayItem[])
      .filter(item => item.subjectId === stop!.id);
    const expectedTask = {
      reason: "refused_credit", subjectType: "delivery", subjectId: stop!.id,
      href: creditHref,
      recipientRoles: ["admin", "sales"], dueAt: null,
    };
    expect(await refusalTask(sales)).toEqual([expect.objectContaining(expectedTask)]);
    expect(await refusalTask(adminCtx)).toEqual([expect.objectContaining(expectedTask)]);
    expect(await refusalTask(warehouse)).toEqual([]);
    expect(await runCommand("list_work", {}, sales)).toContainEqual(expect.objectContaining({
      kind: "orders", id: stop!.id, href: creditHref,
    }));
    await runCommand("return_route", { routeId }, adminCtx);
    expect(await refusalTask(sales)).toEqual([expect.objectContaining(expectedTask)]);
    // An accepted unit returned later is distinct from the two refused units.
    const acceptedInput = { invoiceId: detail.invoice.id, locationId: whId, reason: "unsold", lines: [{ invoiceLineId: billed!.id, qty: 1 }] };
    const acceptedRequest = crypto.randomUUID();
    const acceptedResult = await runCommand("return_shipment", acceptedInput, adminCtx, { requestId: acceptedRequest, correlationId: acceptedRequest });
    // Preserve completed requests written by the original five-argument RPC.
    sql(`update private.command_requests set payload_hash=extensions.digest(jsonb_build_object('invoice','${detail.invoice.id}'::uuid,'lines',jsonb_build_array(jsonb_build_object('invoice_line_id','${billed!.id}','qty',1)),'location','${whId}'::uuid,'reason','unsold')::text,'sha256') where actor_id='${adminCtx.userId}' and request_id='${acceptedRequest}'`);
    expect(await runCommand("return_shipment", acceptedInput, adminCtx, { requestId: acceptedRequest, correlationId: acceptedRequest })).toEqual(acceptedResult);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toMatchObject([{ outstanding_qty: 2 }]);
    expect(await refusalTask(sales)).toEqual([expect.objectContaining(expectedTask)]);
    const input = { invoiceId: detail.invoice.id, refusedDeliveryId: stop!.id, locationId: whId, reason: "unsold", lines: [{ invoiceLineId: billed!.id, qty: 2 }] };
    await expect(runCommand("return_shipment", { ...input, refusedDeliveryId: crypto.randomUUID() }, adminCtx)).rejects.toThrow(/closed refused delivery/i);
    const otherShipment = await shipment(1, "now");
    const { data: otherInvoice } = await admin.from("invoices").select("id").eq("shipment_id", otherShipment).single();
    await expect(runCommand("return_shipment", { ...input, invoiceId: otherInvoice!.id }, adminCtx)).rejects.toThrow(/does not belong to this invoice/i);
    const foreignStaff = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("return_shipment", input, foreignStaff)).rejects.toThrow();
    expect(await refusalTask(foreignStaff)).toEqual([]);
    await expect(runCommand("return_shipment", input, warehouse)).rejects.toMatchObject({ status: 403, code: "permission_denied" });
    await expect(runCommand("return_shipment", { ...input, lines: [{ invoiceLineId: billed!.id, qty: 3 }] }, adminCtx)).rejects.toThrow(/outstanding refusal/i);
    const requestId = crypto.randomUUID();
    const result = await runCommand("return_shipment", input, sales, { requestId, correlationId: requestId });
    expect(await runCommand("return_shipment", input, sales, { requestId, correlationId: requestId })).toEqual(result);
    await expect(runCommand("return_shipment", { ...input, refusedDeliveryId: undefined }, sales, { requestId, correlationId: requestId })).rejects.toThrow(/different payload/i);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toEqual([]);
    expect(await refusalTask(sales)).toEqual([]);
    expect(await refusalTask(adminCtx)).toEqual([]);
    expect((await runCommand("list_work", {}, sales) as WorkRow[]).filter(row => row.href === creditHref)).toEqual([]);
  });

  it.each(["now", "on_delivery"] as const)("does not deadlock %s refusal check-in with an accepted return", async (invoiceTiming) => {
    const sh = await shipment(4, invoiceTiming);
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-17", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop!.id }, adminCtx) as { lines: { id: string }[] };
    await runCommand("confirm_delivery", { deliveryId: stop!.id, signedBy: "Pat", refused: [{ orderLineId: detail.lines[0].id, qty: 2 }], reason: "customer_refused" }, adminCtx);
    const { data: invoice } = await admin.from("invoices").select("id").eq("shipment_id", sh).single();
    const { data: billed } = await admin.from("invoice_lines").select("id").eq("invoice_id", invoice!.id).eq("kind", "sku").single();
    const sources = await runCommand("get_invoice_return_sources", { invoiceId: invoice!.id }, adminCtx) as { id: string }[];
    const ordinary = new Client({ connectionString: DB });
    const refusal = new Client({ connectionString: DB });
    await Promise.all([ordinary.connect(), refusal.connect()]);
    let pending: Promise<unknown> | undefined;
    try {
      await ordinary.query("begin; set local statement_timeout='8s'");
      await ordinary.query("select id from public.invoices where id=$1 for update", [invoice!.id]);
      await refusal.query("set statement_timeout='8s'; set role authenticated");
      await refusal.query("select set_config('request.jwt.claim.sub',$1,false)", [adminCtx.userId]);
      const pid = (await refusal.query("select pg_backend_pid() pid")).rows[0].pid;
      pending = invoiceTiming === "now"
        ? refusal.query("select public.return_shipment($1,$2::jsonb,$3,'unsold',$4,$5)", [invoice!.id, JSON.stringify([{ invoice_line_id: billed!.id, qty: 2 }]), whId, crypto.randomUUID(), stop!.id])
        : refusal.query("select public.check_in_refused_return($1,$2,$3::jsonb,$4)", [stop!.id, whId, JSON.stringify([{ order_line_id: detail.lines[0].id, sources: [{ movement_id: sources[0].id, bin_id: whBinId, qty: 2, damaged: false }] }]), crypto.randomUUID()]);
      // Observe the refusal waiting on our invoice, after it has locked the order.
      pending.catch(() => {});
      await expect.poll(async () => (await ordinary.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type, { timeout: 3000 }).toBe("Lock");
      await ordinary.query("select set_config('request.jwt.claim.sub',$1,true)", [adminCtx.userId]);
      await ordinary.query("set local role authenticated");
      // This inserts an order event, whose FK must coexist with the refusal lock.
      await ordinary.query("select public.return_shipment($1,$2::jsonb,$3,'unsold',$4)", [invoice!.id, JSON.stringify([{ invoice_line_id: billed!.id, qty: 1 }]), whId, crypto.randomUUID()]);
      await ordinary.query("commit");
      await pending;
      expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toEqual([]);
    } finally {
      // Roll back first so an unsuccessful assertion cannot strand the waiter.
      await ordinary.query("rollback");
      await Promise.allSettled([pending, ordinary.end(), refusal.end()]);
    }
  });

  it("closes a refused transfer without receiving its stock", async () => {
    const tr = await transfer();
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-17", stops: [{ stockTransferId: tr, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    await expect(runCommand("confirm_delivery", { deliveryId: stop!.id, transferRefused: true, reason: "other" }, adminCtx)).rejects.toThrow(/note/i);
    expect(await runCommand("confirm_delivery", { deliveryId: stop!.id, transferRefused: true, reason: "customer_refused" }, adminCtx)).toMatchObject({ outcome: "refused", invoice_id: null });
    await runCommand("return_route", { routeId }, adminCtx);
    expect((await admin.from("stock_transfers").select("status").eq("id", tr).single()).data?.status).toBe("in_transit");
  });

  it("names the shortfall when a shipped source or a removal asks for more than the bin holds (#1385)", async () => {
    const { data: sku } = await admin.from("skus").select("brand_id").eq("id", skuId).single();
    const brandId = sku!.brand_id;
    const run = await ins("packaging_runs", { brewery_id: b.id, brand_id: brandId, planned_on: "2026-09-01", created_by: adminCtx.userId });
    const short = await ins("lots", { brewery_id: b.id, packaging_run_id: run.id, brand_id: brandId, code: "SHORT-LOT", packaged_on: "2026-09-01" });
    const bin = await ins("bins", { brewery_id: b.id, location_id: whId, name: "Short shelf" });
    await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: bin.id, lot_id: short.id, qty: 2, type: "opening_balance", created_by: adminCtx.userId });
    const { order_id: id } = await runCommand("create_order", { kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 3 }] }, adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId: id }, adminCtx);
    await runCommand("confirm_order", { orderId: id }, adminCtx);
    const { data: line } = await admin.from("order_lines").select("id").eq("order_id", id).single();
    await runCommand("record_pick", { orderId: id, picks: [{ lineId: line!.id, qty: 3 }] }, adminCtx);
    await expect(runCommand("ship_order", { orderId: id, ship: [{ lineId: line!.id, qty: 3, sources: [{ binId: bin.id, lotId: short.id, qty: 3 }] }] }, adminCtx))
      .rejects.toThrow("Not enough stock in the selected bin and lot: 2 on hand. Reduce the quantity or choose another source.");
    // Once the bin's only lot is used up, an untracked removal has no lot to choose; it names the shortfall instead.
    await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: bin.id, lot_id: short.id, qty: -2, type: "adjustment", created_by: adminCtx.userId });
    await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: bin.id, qty: 1, type: "opening_balance", created_by: adminCtx.userId });
    await expect(runCommand("record_movement", { skuId, locationId: whId, binId: bin.id, qty: -99, type: "loss" }, adminCtx))
      .rejects.toThrow("Not enough stock in the selected bin and lot: 1 on hand. Reduce the quantity or choose another source.");
  });

  it("invoices accepted quantities and checks refused beer into its source lot once", async () => {
    const sh = await shipment(10, "on_delivery", lotId);
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-17", stops: [{ shipmentId: sh, stopNo: 1 }] }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, adminCtx);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop!.id }, adminCtx) as { lines: { id: string }[] };
    const orderLineId = detail.lines[0].id;
    const result = await runCommand("confirm_delivery", { deliveryId: stop!.id, signedBy: "Pat", refused: [{ orderLineId, qty: 2 }], reason: "damaged" }, adminCtx) as { invoice_id: string };
    expect((await admin.from("invoice_lines").select("qty, unit_price_cents").eq("invoice_id", result.invoice_id).eq("kind", "sku")).data).toEqual([{ qty: 8, unit_price_cents: 12000 }]);
    expect((await admin.from("invoice_lines").select("qty, unit_price_cents").eq("invoice_id", result.invoice_id).eq("kind", "keg_deposit")).data).toEqual([{ qty: 8, unit_price_cents: 2500 }]);
    const { data: line } = await admin.from("order_lines").select("order_id").eq("id", orderLineId).single();
    // A partly refused stop reads as delivered on the order page and in the Delivered filter (#1483).
    const delivered = await runCommand("list_orders", { status: "delivered" }, adminCtx) as { rows: { id: string; shipments: { deliveries: { outcome: string }[] }[] }[] };
    expect(delivered.rows.find((o) => o.id === line!.order_id)?.shipments[0].deliveries[0].outcome).toBe("partial");
    expect((await runCommand("list_orders", { status: "shipped" }, adminCtx) as { rows: { id: string }[] }).rows.map((o) => o.id)).toContain(line!.order_id);
    expect((await runCommand("get_order", { orderId: line!.order_id }, adminCtx) as { shipment: { deliveries: { outcome: string }[] } }).shipment.deliveries[0].outcome).toBe("partial");
    const { data: source } = await admin.from("inventory_movements").select("id, lot_id").eq("ref", line!.order_id).eq("type", "sale_removal").single();
    const { data: billed } = await admin.from("invoice_lines").select("id").eq("invoice_id", result.invoice_id).eq("kind", "sku").single();
    await runCommand("return_shipment", { invoiceId: result.invoice_id, locationId: whId, reason: "unsold", lines: [{ invoiceLineId: billed!.id, qty: 1, sources: [{ movementId: source!.id, binId: whBinId, qty: 1 }] }] }, adminCtx);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toMatchObject([{ outstanding_qty: 2 }]);
    // The check-in page defaults its return location to where the beer shipped from (#1504).
    expect(await runCommand("get_invoice_return_sources", { deliveryId: stop!.id }, adminCtx)).toEqual([expect.objectContaining({ id: source!.id, location_id: whId })]);
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    const input = { deliveryId: stop!.id, locationId: whId, lines: [{ orderLineId, sources: [{ movementId: source!.id, binId: whBinId, qty: 1, damaged: true }] }] };
    const requestId = crypto.randomUUID();
    const checked = await runCommand("check_in_refused_return", input, warehouse, { requestId, correlationId: requestId });
    expect(await runCommand("check_in_refused_return", input, warehouse, { requestId, correlationId: requestId })).toEqual(checked);
    const { data: returned } = await admin.from("inventory_movements").select("qty, lot_id").eq("source_movement_id", source!.id).eq("type", "return_in").eq("ref", stop!.id);
    expect(returned).toEqual([{ qty: 1, lot_id: lotId }]);
    // #815: accepted beer returned by credit and refused damaged beer each
    // return one shell; exact replay must not add another physical event.
    const shellEvents = await admin.from("keg_events").select("reason,qty").eq("shipment_id", sh);
    expect(shellEvents.error).toBeNull();
    expect(shellEvents.data).toHaveLength(3);
    expect(shellEvents.data?.filter(event => event.reason === "shipped")).toEqual([{ reason: "shipped", qty: 10 }]);
    expect(shellEvents.data?.filter(event => event.reason === "returned")).toEqual([{ reason: "returned", qty: 1 }, { reason: "returned", qty: 1 }]);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, warehouse)).toMatchObject([{ outstanding_qty: 1 }]);
    expect(await runCommand("get_today", {}, warehouse)).toContainEqual(expect.objectContaining({ reason: "refused_return", subjectId: stop!.id }));
    const stranger = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("check_in_refused_return", input, stranger)).rejects.toThrow();
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, stranger)).toEqual([]);
    expect((await admin.from("inventory_movements").select("qty").eq("ref", stop!.id).eq("type", "loss")).data).toEqual([{ qty: -1 }]);
    await expect(runCommand("check_in_refused_return", { ...input, lines: [{ orderLineId, sources: [{ movementId: source!.id, binId: whBinId, qty: 2, damaged: false }] }] }, warehouse)).rejects.toThrow(/outstanding/i);
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("check_in_refused_return", input, sales)).rejects.toThrow(/permission|allowed/i);
  });

  it("closes a refused stop without invoicing or restoring stock, then returns the route", async () => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const sh = await shipment(4, "on_delivery");
    const { routeId } = await runCommand("save_route", {
      deliveryDate: "2026-09-17", driverUserId: driver.userId,
      stops: [{ shipmentId: sh, stopNo: 1 }],
    }, adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, driver);
    const { data: stop } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const detail = await runCommand("get_delivery_stop", { deliveryId: stop!.id }, driver) as { lines: { id: string }[] };
    const input = { deliveryId: stop!.id, refused: [{ orderLineId: detail.lines[0].id, qty: 4 }], reason: "customer_refused" };
    await expect(runCommand("confirm_delivery", { ...input, refused: [{ orderLineId: detail.lines[0].id, qty: 5 }] }, driver)).rejects.toThrow(/quantity/i);
    await expect(runCommand("confirm_delivery", { ...input, reason: undefined }, driver)).rejects.toThrow(/reason/i);
    const requestId = crypto.randomUUID();
    const result = await runCommand("confirm_delivery", input, driver, { requestId, correlationId: requestId });
    expect(result).toMatchObject({ outcome: "refused", invoice_id: null });
    expect(await runCommand("confirm_delivery", input, driver, { requestId, correlationId: requestId })).toEqual(result);
    expect((await admin.from("invoices").select("id").eq("shipment_id", sh)).data).toEqual([]);
    expect((await admin.from("inventory_movements").select("id").eq("ref", stop!.id)).data).toEqual([]);
    await runCommand("return_route", { routeId }, driver);
    expect((await admin.from("routes").select("returned_at").eq("id", routeId).single()).data?.returned_at).not.toBeNull();
  });

  it("keeps stop ids across a re-save, refuses removing a delivered stop, a duplicate stop number, and a foreign document", async () => {
    const driver = await makeStaffCtx(b.id, "warehouse");
    const [sh1, sh2] = [await shipment(), await shipment()];
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-09-15", driverUserId: driver.userId, stops: [{ shipmentId: sh1, stopNo: 1 }] }, adminCtx) as { routeId: string };
    const { data: before } = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    // a stop is not confirmable before the route departs, and is not the driver's next stop yet
    await expect(runCommand("confirm_delivery", { deliveryId: before!.id, signedBy: "Early" }, driver)).rejects.toThrow(/depart/i);
    const today = (await runCommand("get_today", { now: "2026-09-15T12:00:00Z" }, driver) as { subjectId: string }[]).map((t) => t.subjectId);
    expect(today).not.toContain(before!.id);
    // re-saving with the stop kept leaves its id alone (Today rows and open Confirm pages point at it)
    await runCommand("save_route", { id: routeId, deliveryDate: "2026-09-15", driverUserId: driver.userId, name: "Renamed", stops: [{ shipmentId: sh2, stopNo: 1 }, { shipmentId: sh1, stopNo: 2 }] }, adminCtx);
    const { data: after } = await admin.from("deliveries").select("id, stop_no").eq("route_id", routeId).order("stop_no");
    expect(after!.find((d) => d.id === before!.id)?.stop_no).toBe(2);
    // two stops cannot share a number
    await expect(runCommand("save_route", { id: routeId, deliveryDate: "2026-09-15", stops: [{ shipmentId: sh2, stopNo: 1 }, { shipmentId: sh1, stopNo: 1 }] }, adminCtx)).rejects.toThrow(/stop number/i);
    // another brewery's shipment is not found here, and says nothing about where it is
    const other = await makeBrewery();
    const otherCtx = await makeStaffCtx(other.id, "admin");
    await expect(runCommand("save_route", { deliveryDate: "2026-09-15", stops: [{ shipmentId: sh2, stopNo: 1 }] }, otherCtx)).rejects.toThrow(/shipment not found/i);
    await expect(runCommand("depart_route", { routeId }, otherCtx)).rejects.toThrow(/permission/i);
    // a delivered stop stays put
    await runCommand("depart_route", { routeId }, driver);
    await runCommand("confirm_delivery", { deliveryId: after![0].id, signedBy: "Pat" }, driver);
    await expect(runCommand("save_route", { id: routeId, deliveryDate: "2026-09-15", stops: [{ shipmentId: sh1, stopNo: 1 }] }, adminCtx)).rejects.toThrow(/departed|delivered/i);
  });

  it("replays save_route on the same request id and rejects a changed payload", async () => {
    const sh = await shipment();
    const requestId = crypto.randomUUID();
    const input = { p_brewery: b.id, p_id: null, p_name: "Replay", p_delivery_date: "2026-09-16", p_driver: null, p_vehicle: null, p_note: null, p_stops: [{ shipment_id: sh, stock_transfer_id: null, stop_no: 1 }] };
    const first = await adminCtx.db.rpc("save_route", { ...input, p_request_id: requestId });
    expect(first.error).toBeNull();
    const again = await adminCtx.db.rpc("save_route", { ...input, p_request_id: requestId });
    expect(again.data).toEqual(first.data);
    expect((await admin.from("routes").select("id").eq("name", "Replay").eq("brewery_id", b.id)).data!.length).toBe(1);
    const changed = await adminCtx.db.rpc("save_route", { ...input, p_name: "Other", p_request_id: requestId });
    expect(changed.error?.code).toBe("MG409");
  });
});

// #1486: a returned route left /routes for good; the Returned filter lists them newest first.
describe("list_routes status", () => {
  it("lists open routes by default and returned routes newest first under returned", async () => {
    const own = await makeBrewery();
    const ctx = await makeStaffCtx(own.id, "warehouse");
    const listed = async (input: object) => await runCommand("list_routes", input, ctx) as { routes: { name: string }[]; anyReturned: boolean };
    expect(await listed({})).toMatchObject({ routes: [], anyReturned: false });
    const done = { departed_at: "2026-09-01T08:00:00Z", returned_at: "2026-09-01T17:00:00Z" };
    const { error } = await admin.from("routes").insert([
      { brewery_id: own.id, delivery_date: "2026-09-03", name: "Open" },
      { brewery_id: own.id, delivery_date: "2026-09-01", name: "Older", ...done },
      { brewery_id: own.id, delivery_date: "2026-09-02", name: "Newer", ...done },
    ]);
    expect(error).toBeNull();
    expect((await listed({})).routes.map((r) => r.name)).toEqual(["Open"]);
    expect((await listed({ status: "open" })).anyReturned).toBe(true);
    expect((await listed({ status: "returned" })).routes.map((r) => r.name)).toEqual(["Newer", "Older"]);
  });
});

// #473: list_routes read every shipment and delivery of the brewery in one
// unpaged request, so past PostgREST's 1000-row cap new shipped orders fell
// out of "unassigned" and stops fell off long routes.
describe("list_routes past one PostgREST page", () => {
  it("still offers a new shipped order and every stop of a long route", async () => {
    const big = await makeBrewery();
    const ctx = await makeStaffCtx(big.id, "admin");
    const { id: locationId } = await seedLocation(big.id);
    const cust = await seedCustomer(big.id);
    const n = 1001;
    const { data: orders, error: oErr } = await admin.from("orders").insert(Array.from({ length: n }, () => ({
      brewery_id: big.id, status: "shipped" as const, customer_id: cust.customerId, ship_to_id: cust.shipToId,
      from_location_id: locationId, sale_channel_id: cust.saleChannelId, created_by: ctx.userId, shipped_at: "2026-01-02T00:00:00Z",
    }))).select("id");
    expect(oErr).toBeNull();
    const { data: old, error: sErr } = await admin.from("shipments")
      .insert(orders!.map((o) => ({ brewery_id: big.id, order_id: o.id, created_by: ctx.userId }))).select("id");
    expect(sErr).toBeNull();
    const { data: done } = await admin.from("routes").insert({
      brewery_id: big.id, delivery_date: "2026-01-02", name: "History", departed_at: "2026-01-02T08:00:00Z", returned_at: "2026-01-02T17:00:00Z",
    }).select().single();
    const { error: dErr } = await admin.from("deliveries").insert(old!.map((s, k) => ({
      brewery_id: big.id, route_id: done!.id, shipment_id: s.id, stop_no: k + 1, delivered_at: "2026-01-02T12:00:00Z",
    })));
    expect(dErr).toBeNull();

    const { data: fresh } = await admin.from("orders").insert({
      brewery_id: big.id, status: "shipped", customer_id: cust.customerId, ship_to_id: cust.shipToId,
      from_location_id: locationId, sale_channel_id: cust.saleChannelId, created_by: ctx.userId,
    }).select("id").single();
    const { data: sh } = await admin.from("shipments").insert({ brewery_id: big.id, order_id: fresh!.id, created_by: ctx.userId }).select("id").single();
    // a thousand rows in one statement outruns autovacuum; stale stats pick a nested-loop plan hosted never sees
    sql("analyze public.orders; analyze public.shipments; analyze public.deliveries;", true);

    const listed = await runCommand("list_routes", {}, ctx) as { unassigned: { id: string }[] };
    expect(listed.unassigned.map((d) => d.id)).toEqual([sh!.id]);
    const history = await runCommand("list_routes", { id: done!.id }, ctx) as { routes: { stops: { stop_no: number; label: string }[] }[] };
    expect(history.routes[0].stops).toHaveLength(n);
    expect(history.routes[0].stops.map((s) => s.stop_no)).toEqual(Array.from({ length: n }, (_, k) => k + 1));
    expect(history.routes[0].stops.every((s) => s.label.startsWith("ORD-"))).toBe(true);
  }, 60_000);
});

// #1505: Received by was blank at every stop. get_delivery_stop names who
// signed earlier deliveries to the same ship-to, newest first, once each.
describe("get_delivery_stop earlier signers", () => {
  it("lists distinct earlier signers at this ship-to, newest first, and none from another ship-to", async () => {
    const own = await makeBrewery();
    const ctx = await makeStaffCtx(own.id, "admin");
    const { id: locationId } = await seedLocation(own.id);
    const here = await seedCustomer(own.id);
    const elsewhere = await seedCustomer(own.id, { name: "Elsewhere" });
    const { data: route } = await admin.from("routes").insert({ brewery_id: own.id, delivery_date: "2026-09-01", name: "History" }).select("id").single();
    let stopNo = 0;
    const stop = async (cust: typeof here, signedBy: string | null, deliveredAt: string | null) => {
      const { data: order } = await admin.from("orders").insert({
        brewery_id: own.id, status: "shipped", customer_id: cust.customerId, ship_to_id: cust.shipToId,
        from_location_id: locationId, sale_channel_id: cust.saleChannelId, created_by: ctx.userId,
      }).select("id").single();
      const { data: sh } = await admin.from("shipments").insert({ brewery_id: own.id, order_id: order!.id, created_by: ctx.userId }).select("id").single();
      const { data: d, error } = await admin.from("deliveries").insert({
        brewery_id: own.id, route_id: route!.id, shipment_id: sh!.id, stop_no: ++stopNo, signed_by: signedBy, delivered_at: deliveredAt,
      }).select("id").single();
      expect(error).toBeNull();
      return d!.id as string;
    };
    await stop(here, "Chris", "2026-08-01T12:00:00Z");
    await stop(here, "Dana", "2026-08-03T12:00:00Z");
    await stop(here, "Chris", "2026-08-02T12:00:00Z");
    await stop(here, null, "2026-08-04T12:00:00Z");
    await stop(elsewhere, "Robin", "2026-08-05T12:00:00Z");
    const open = await stop(here, null, null);
    const detail = await runCommand("get_delivery_stop", { deliveryId: open }, ctx) as { signers: string[] };
    expect(detail.signers).toEqual(["Dana", "Chris"]);
  });
});

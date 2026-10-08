// tests/delivery.test.ts — Program 8: delivery routes. A stop is a customer
// shipment or a stock transfer (locations spec Decision 4); save_route
// replaces a route's stops in one RPC; depart/confirm/return walk the route
// and Today's delivery_next follows the assigned driver.
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DB, admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, priceSku, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let whId: string, whBinId: string, storageId: string, storageBinId: string;
let customerId: string, shipToId: string, skuId: string, lotId: string;

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
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

/** A shipped wholesale order; returns its shipment id. */
async function shipment(qty = 2, invoiceTiming: "now" | "on_delivery" = "now", sourceLotId?: string) {
  const { order_id: id } = await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty }],
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
    // An accepted unit returned later is distinct from the two refused units.
    const acceptedInput = { invoiceId: detail.invoice.id, locationId: whId, reason: "unsold", lines: [{ invoiceLineId: billed!.id, qty: 1 }] };
    const acceptedRequest = crypto.randomUUID();
    const acceptedResult = await runCommand("return_shipment", acceptedInput, adminCtx, { requestId: acceptedRequest, correlationId: acceptedRequest });
    // Preserve completed requests written by the original five-argument RPC.
    sql(`update private.command_requests set payload_hash=extensions.digest(jsonb_build_object('invoice','${detail.invoice.id}'::uuid,'lines',jsonb_build_array(jsonb_build_object('invoice_line_id','${billed!.id}','qty',1)),'location','${whId}'::uuid,'reason','unsold')::text,'sha256') where actor_id='${adminCtx.userId}' and request_id='${acceptedRequest}'`);
    expect(await runCommand("return_shipment", acceptedInput, adminCtx, { requestId: acceptedRequest, correlationId: acceptedRequest })).toEqual(acceptedResult);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toMatchObject([{ outstanding_qty: 2 }]);
    const input = { invoiceId: detail.invoice.id, refusedDeliveryId: stop!.id, locationId: whId, reason: "unsold", lines: [{ invoiceLineId: billed!.id, qty: 2 }] };
    await expect(runCommand("return_shipment", { ...input, refusedDeliveryId: crypto.randomUUID() }, adminCtx)).rejects.toThrow(/closed refused delivery/i);
    const otherShipment = await shipment(1, "now");
    const { data: otherInvoice } = await admin.from("invoices").select("id").eq("shipment_id", otherShipment).single();
    await expect(runCommand("return_shipment", { ...input, invoiceId: otherInvoice!.id }, adminCtx)).rejects.toThrow(/does not belong to this invoice/i);
    const foreignStaff = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("return_shipment", input, foreignStaff)).rejects.toThrow();
    await expect(runCommand("return_shipment", { ...input, lines: [{ invoiceLineId: billed!.id, qty: 3 }] }, adminCtx)).rejects.toThrow(/outstanding refusal/i);
    const requestId = crypto.randomUUID();
    const result = await runCommand("return_shipment", input, adminCtx, { requestId, correlationId: requestId });
    expect(await runCommand("return_shipment", input, adminCtx, { requestId, correlationId: requestId })).toEqual(result);
    await expect(runCommand("return_shipment", { ...input, refusedDeliveryId: undefined }, adminCtx, { requestId, correlationId: requestId })).rejects.toThrow(/different payload/i);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toEqual([]);
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
    expect(await runCommand("confirm_delivery", { deliveryId: stop!.id, transferRefused: true, reason: "closed" }, adminCtx)).toMatchObject({ outcome: "refused", invoice_id: null });
    await runCommand("return_route", { routeId }, adminCtx);
    expect((await admin.from("stock_transfers").select("status").eq("id", tr).single()).data?.status).toBe("in_transit");
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
    const { data: source } = await admin.from("inventory_movements").select("id, lot_id").eq("ref", line!.order_id).eq("type", "sale_removal").single();
    const { data: billed } = await admin.from("invoice_lines").select("id").eq("invoice_id", result.invoice_id).eq("kind", "sku").single();
    await runCommand("return_shipment", { invoiceId: result.invoice_id, locationId: whId, reason: "unsold", lines: [{ invoiceLineId: billed!.id, qty: 1, sources: [{ movementId: source!.id, binId: whBinId, qty: 1 }] }] }, adminCtx);
    expect(await runCommand("list_refused_returns", { deliveryId: stop!.id }, adminCtx)).toMatchObject([{ outstanding_qty: 2 }]);
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    const input = { deliveryId: stop!.id, locationId: whId, lines: [{ orderLineId, sources: [{ movementId: source!.id, binId: whBinId, qty: 1, damaged: true }] }] };
    const requestId = crypto.randomUUID();
    const checked = await runCommand("check_in_refused_return", input, warehouse, { requestId, correlationId: requestId });
    expect(await runCommand("check_in_refused_return", input, warehouse, { requestId, correlationId: requestId })).toEqual(checked);
    const { data: returned } = await admin.from("inventory_movements").select("qty, lot_id").eq("source_movement_id", source!.id).eq("type", "return_in").eq("ref", stop!.id);
    expect(returned).toEqual([{ qty: 1, lot_id: lotId }]);
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
    const input = { deliveryId: stop!.id, refused: [{ orderLineId: detail.lines[0].id, qty: 4 }], reason: "closed" };
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

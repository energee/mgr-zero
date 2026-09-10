import { beforeEach, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { admin, asUser, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";

describe("portal order deposit adjustments", () => {
  let f: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { f = await setup(); });

  it("adds, changes, removes, and replays exact deposit rows with the staff adjustment", async () => {
    const orderId = await submitted(f);
    expect((await admin.from("keg_pools").update({ deposit_cents: 3100 }).eq("id", f.poolId)).error).toBeNull();
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    await runCommand("adjust_order_lines", { orderId, reason: "buyer changed quantities", lines: [
      { skuId: f.first.skuId, qty: 3 }, { skuId: f.second.skuId, qty: 1 },
    ] }, f.adminCtx, execution);
    const adjustedDeposits = await deposits(orderId);
    expect(adjustedDeposits).toEqual(expect.arrayContaining([
      { sku_id: f.first.skuId, qty_ordered: 3, unit_price_cents: 2500 },
      { sku_id: f.second.skuId, qty_ordered: 1, unit_price_cents: 3100 },
    ]));
    expect(adjustedDeposits).toHaveLength(2);

    await runCommand("adjust_order_lines", { orderId, reason: "buyer changed quantities", lines: [
      { skuId: f.first.skuId, qty: 3 }, { skuId: f.second.skuId, qty: 1 },
    ] }, f.adminCtx, execution);
    expect(await deposits(orderId)).toHaveLength(2);

    await runCommand("adjust_order_lines", { orderId, reason: "remove second keg", lines: [
      { skuId: f.first.skuId, qty: 2 },
    ] }, f.adminCtx);
    expect(await deposits(orderId)).toEqual([
      { sku_id: f.first.skuId, qty_ordered: 2, unit_price_cents: 2500 },
    ]);
  });

  it("accepts a configured zero deposit through submit, adjustment, replay, and invoice", async () => {
    const quote = await runCommand("portal_quote_order", {
      shipToId: f.customer.shipToId, lines: [{ skuId: f.zeroDeposit.skuId, qty: 2 }],
    }, f.portalCtx) as any;
    expect(quote.depositCents).toBe(0);
    const submittedOrder = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, f.portalCtx) as any;
    const orderId = submittedOrder.order_id as string;
    await runCommand("confirm_order", { orderId }, f.adminCtx);
    expect(await deposits(orderId)).toEqual([]);
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const adjustment = { orderId, reason: "increase no-charge returnables", lines: [{ skuId: f.zeroDeposit.skuId, qty: 3 }] };
    await runCommand("adjust_order_lines", adjustment, f.adminCtx, execution);
    await runCommand("adjust_order_lines", adjustment, f.adminCtx, execution);
    expect(await deposits(orderId)).toEqual([]);
    const invoiceId = await ship(f, orderId, "now");
    const rows = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });

  it("rejects a returnable SKU missing keg format configuration before changing the order", async () => {
    const orderId = await submitted(f);
    const beforeLines = await admin.from("order_lines").select("sku_id,qty_ordered,unit_price_cents").eq("order_id", orderId).order("sku_id");
    const beforeDeposits = await deposits(orderId);
    const beforeEvents = await admin.from("order_events").select("id").eq("order_id", orderId);
    const adjustment = { orderId, reason: "invalid deposit", lines: [
      { skuId: f.first.skuId, qty: 2 }, { skuId: f.missingFormat.skuId, qty: 1 },
    ] };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    await expect(runCommand("adjust_order_lines", adjustment, f.adminCtx, execution)).rejects.toThrow(/deposit.*configured/i);
    expect((await admin.from("order_lines").select("sku_id,qty_ordered,unit_price_cents").eq("order_id", orderId).order("sku_id")).data).toEqual(beforeLines.data);
    expect(await deposits(orderId)).toEqual(beforeDeposits);
    expect((await admin.from("order_events").select("id").eq("order_id", orderId)).data).toEqual(beforeEvents.data);
    expect((await admin.from("formats").update({ package_type: "keg", keg_size: "half_bbl" }).eq("id", f.missingFormat.formatId)).error).toBeNull();
    await expect(runCommand("adjust_order_lines", adjustment, f.adminCtx, execution)).resolves.toMatchObject({ order_id: orderId });
    expect(await deposits(orderId)).toEqual(expect.arrayContaining([
      { sku_id: f.first.skuId, qty_ordered: 2, unit_price_cents: 2500 },
      { sku_id: f.missingFormat.skuId, qty_ordered: 1, unit_price_cents: 2500 },
    ]));
  });

  it.each(["now", "on_delivery"] as const)("invoices every adjusted returnable-keg line with %s timing", async (timing) => {
    const orderId = await submitted(f);
    expect((await admin.from("keg_pools").update({ deposit_cents: 3100 }).eq("id", f.poolId)).error).toBeNull();
    await runCommand("adjust_order_lines", { orderId, reason: "add another keg", lines: [
      { skuId: f.first.skuId, qty: 2 }, { skuId: f.second.skuId, qty: 1 },
    ] }, f.adminCtx);
    expect((await admin.from("keg_pools").update({ deposit_cents: 4100 }).eq("id", f.poolId)).error).toBeNull();
    const invoiceId = await ship(f, orderId, timing);
    const rows = await admin.from("invoice_lines").select("kind,order_line_id,qty,unit_price_cents").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").order("order_line_id");
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(2);
    expect(rows.data?.map(row => ({ qty: Number(row.qty), cents: row.unit_price_cents }))).toEqual(expect.arrayContaining([
      { qty: 2, cents: 2500 }, { qty: 1, cents: 3100 },
    ]));
  });
});

async function setup() {
  const brewery = await makeBrewery();
  const adminCtx = await makeStaffCtx(brewery.id);
  const source = await seedLocation(brewery.id, { name: "Deposit warehouse" });
  const first = await seedCatalog(brewery.id, { product: "First keg", sku: "First keg half", packageType: "keg", bblPerUnit: 0.5 });
  const second = await seedCatalog(brewery.id, { product: "Second keg", sku: "Second keg half", packageType: "keg", bblPerUnit: 0.5 });
  const zeroDeposit = await seedCatalog(brewery.id, { product: "No-charge keg", sku: "No-charge keg half", packageType: "keg", bblPerUnit: 0.5 });
  const missingFormat = await seedCatalog(brewery.id, { product: "Missing keg format", sku: "Missing keg format case", packageType: "can", bblPerUnit: 0.5 });
  const customer = await seedCustomer(brewery.id);
  const pool = await admin.from("keg_pools").insert({ brewery_id: brewery.id, name: "Returnable fleet", kind: "owned", deposit_cents: 2500 }).select("id").single();
  const zeroPool = await admin.from("keg_pools").insert({ brewery_id: brewery.id, name: "No-charge fleet", kind: "owned", deposit_cents: 0 }).select("id").single();
  expect(pool.error).toBeNull(); expect(zeroPool.error).toBeNull();
  for (const skuId of [first.skuId, second.skuId]) expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.data!.id }).eq("id", skuId)).error).toBeNull();
  expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: zeroPool.data!.id }).eq("id", zeroDeposit.skuId)).error).toBeNull();
  expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.data!.id }).eq("id", missingFormat.skuId)).error).toBeNull();
  for (const catalog of [first, second, zeroDeposit, missingFormat]) {
    await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 3600 });
    await ins("inventory_movements", { brewery_id: brewery.id, sku_id: catalog.skuId, location_id: source.id, bin_id: source.binId, qty: 20, type: "opening_balance", created_by: adminCtx.userId });
  }
  await runCommand("set_portal_fulfillment_source", { locationId: source.id }, adminCtx);
  const buyer = await makeCustomerUser(customer.customerId);
  const db = await asUser(buyer.email);
  return { brewery, adminCtx, source, first, second, zeroDeposit, missingFormat, customer, poolId: pool.data!.id as string,
    portalCtx: { db, userId: buyer.id, breweryId: brewery.id, role: "customer" as const, customerId: customer.customerId } };
}

async function submitted(f: Awaited<ReturnType<typeof setup>>) {
  const quote = await runCommand("portal_quote_order", { shipToId: f.customer.shipToId, lines: [{ skuId: f.first.skuId, qty: 2 }] }, f.portalCtx) as any;
  const result = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, f.portalCtx) as any;
  await runCommand("confirm_order", { orderId: result.order_id }, f.adminCtx);
  return result.order_id as string;
}

async function deposits(orderId: string) {
  const rows = await admin.from("order_deposit_lines").select("qty_ordered,unit_price_cents,order_lines!inner(sku_id)").eq("order_id", orderId).order("order_line_id");
  expect(rows.error).toBeNull();
  return (rows.data ?? []).map((row: any) => ({ sku_id: row.order_lines.sku_id, qty_ordered: Number(row.qty_ordered), unit_price_cents: row.unit_price_cents })).sort((a, b) => a.sku_id.localeCompare(b.sku_id));
}

async function ship(f: Awaited<ReturnType<typeof setup>>, orderId: string, timing: "now" | "on_delivery") {
  const lines = (await admin.from("order_lines").select("id,qty_ordered").eq("order_id", orderId)).data!;
  await runCommand("record_pick", { orderId, picks: lines.map(line => ({ lineId: line.id, qty: Number(line.qty_ordered) })) }, f.adminCtx);
  const shipped = await runCommand("ship_order", { orderId, invoiceTiming: timing, ship: lines.map(line => ({ lineId: line.id, qty: Number(line.qty_ordered) })) }, f.adminCtx) as any;
  if (timing === "now") return shipped.invoice_id as string;
  const shipment = (await admin.from("shipments").select("id").eq("order_id", orderId).single()).data!;
  const route = await runCommand("save_route", { deliveryDate: "2026-10-20", driverUserId: f.adminCtx.userId, stops: [{ shipmentId: shipment.id, stopNo: 1 }] }, f.adminCtx) as any;
  await runCommand("depart_route", { routeId: route.routeId }, f.adminCtx);
  const delivery = (await admin.from("deliveries").select("id").eq("route_id", route.routeId).single()).data!;
  return ((await runCommand("confirm_delivery", { deliveryId: delivery.id, signedBy: "Buyer" }, f.adminCtx)) as any).invoice_id as string;
}

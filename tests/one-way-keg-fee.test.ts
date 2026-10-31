// tests/one-way-keg-fee.test.ts — a one-way keg (a keg SKU with no container
// source) carries the brewery's one-way keg fee on its invoice, never a
// deposit, and the fee is never refunded (docs/plans/lolev-orders.md task 6).
// The fee is frozen onto the order line at submit, like a keg deposit, so the
// staff order page and either invoice writer (ship_order now, confirm_delivery
// on delivery) show and bill the price the order was submitted with.
import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, priceSku, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Fixture = Awaited<ReturnType<typeof setup>>;

/** A brewery with a one-way sixtel and a returnable sixtel, both priced and stocked. */
async function setup(feeCents: number) {
  const brewery = await makeBrewery();
  const adminCtx = await makeStaffCtx(brewery.id, "admin");
  const wh = await seedLocation(brewery.id);
  const customer = await seedCustomer(brewery.id);
  const brand = await ins("brands", { brewery_id: brewery.id, name: "Export Pils" });
  const sku = async (formatName: string, poolId: string | null) => {
    const format = await ins("formats", { brewery_id: brewery.id, name: formatName, basis: "packaged", package_type: "keg", keg_size: "sixth_bbl", bbl_per_unit: 0.1667 });
    const row = await ins("skus", { brewery_id: brewery.id, brand_id: brand.id, format_id: format.id, name: `Pils ${formatName}`,
      keg_pool_id: poolId, container_source: poolId ? "owned_fleet" : null });
    await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: brand.id, formatId: format.id, cents: 9000 });
    await ins("inventory_movements", { brewery_id: brewery.id, sku_id: row.id, location_id: wh.id, bin_id: wh.binId, qty: 50, type: "opening_balance", created_by: adminCtx.userId });
    return row.id as string;
  };
  const pool = await ins("keg_pools", { brewery_id: brewery.id, name: "Sixtel fleet", kind: "owned", deposit_cents: 3000 });
  const oneWaySku = await sku("One-way sixtel", null);
  const returnableSku = await sku("Sixtel", pool.id);
  await runCommand("set_one_way_keg_fee", { feeCents }, adminCtx);
  return { brewery, adminCtx, wh, customer, oneWaySku, returnableSku };
}

/** Create, confirm, pick and ship an order in full; returns its ids. */
async function ship(f: Fixture, lines: { skuId: string; qty: number }[], invoiceTiming: "now" | "on_delivery" = "now") {
  const { order_id: orderId } = await runCommand("create_order", {
    kind: "wholesale", customerId: f.customer.customerId, shipToId: f.customer.shipToId, fromLocationId: f.wh.id, lines,
  }, f.adminCtx) as { order_id: string };
  await runCommand("submit_order", { orderId }, f.adminCtx);
  await runCommand("confirm_order", { orderId }, f.adminCtx);
  const orderLines = (await admin.from("order_lines").select("id, sku_id, qty_ordered").eq("order_id", orderId)).data!;
  await runCommand("record_pick", { orderId, picks: orderLines.map(l => ({ lineId: l.id, qty: Number(l.qty_ordered) })) }, f.adminCtx);
  const shipped = await runCommand("ship_order", { orderId, invoiceTiming, ship: orderLines.map(l => ({ lineId: l.id, qty: Number(l.qty_ordered) })) }, f.adminCtx) as { invoice_id: string | null };
  const lineFor = (skuId: string) => orderLines.find(l => l.sku_id === skuId)!.id as string;
  return { orderId, invoiceId: shipped.invoice_id, lineFor };
}

async function invoiceLines(invoiceId: string) {
  const { data, error } = await admin.from("invoice_lines").select("kind, order_line_id, qty, unit_price_cents, description").eq("invoice_id", invoiceId).order("kind");
  if (error) throw error;
  return data.map(l => ({ ...l, qty: Number(l.qty) }));
}

describe("one-way keg fee", () => {
  it("bills one fee line per one-way keg line at ship, and no deposit", async () => {
    const f = await setup(1000);
    const s = await ship(f, [{ skuId: f.oneWaySku, qty: 3 }]);
    const lines = await invoiceLines(s.invoiceId!);
    expect(lines.filter(l => l.kind !== "sku")).toEqual([
      { kind: "one_way_keg_fee", order_line_id: s.lineFor(f.oneWaySku), qty: 3, unit_price_cents: 1000, description: "One-way keg fee" },
    ]);
    const frozen = await admin.from("order_lines").select("one_way_fee_cents").eq("id", s.lineFor(f.oneWaySku)).single();
    expect(frozen.data).toEqual({ one_way_fee_cents: 1000 });
  });

  it("freezes the fee on the line at submit, before the order ships", async () => {
    const f = await setup(1000);
    const { order_id: orderId } = await runCommand("create_order", {
      kind: "wholesale", customerId: f.customer.customerId, shipToId: f.customer.shipToId, fromLocationId: f.wh.id,
      lines: [{ skuId: f.oneWaySku, qty: 2 }, { skuId: f.returnableSku, qty: 1 }],
    }, f.adminCtx) as { order_id: string };
    const fees = async () => (await admin.from("order_lines").select("sku_id, one_way_fee_cents").eq("order_id", orderId)).data!
      .map(l => [l.sku_id === f.oneWaySku ? "one-way" : "returnable", l.one_way_fee_cents]).sort();
    expect(await fees()).toEqual([["one-way", null], ["returnable", null]]);
    await runCommand("submit_order", { orderId }, f.adminCtx);
    expect(await fees()).toEqual([["one-way", 1000], ["returnable", null]]);
    // A fee changed after submit does not reprice the order.
    await runCommand("set_one_way_keg_fee", { feeCents: 1500 }, f.adminCtx);
    await runCommand("confirm_order", { orderId }, f.adminCtx);
    const lines = (await admin.from("order_lines").select("id, qty_ordered").eq("order_id", orderId)).data!;
    await runCommand("record_pick", { orderId, picks: lines.map(l => ({ lineId: l.id, qty: Number(l.qty_ordered) })) }, f.adminCtx);
    const shipped = await runCommand("ship_order", { orderId, invoiceTiming: "now", ship: lines.map(l => ({ lineId: l.id, qty: Number(l.qty_ordered) })) }, f.adminCtx) as { invoice_id: string };
    expect((await invoiceLines(shipped.invoice_id)).filter(l => l.kind === "one_way_keg_fee").map(l => [l.qty, l.unit_price_cents])).toEqual([[2, 1000]]);
  });

  it("gives a returnable sixtel its deposit and no fee", async () => {
    const f = await setup(1000);
    const s = await ship(f, [{ skuId: f.returnableSku, qty: 2 }]);
    const lines = await invoiceLines(s.invoiceId!);
    expect(lines.map(l => l.kind)).toEqual(["sku", "keg_deposit"]);
    const frozen = await admin.from("order_lines").select("one_way_fee_cents").eq("id", s.lineFor(f.returnableSku)).single();
    expect(frozen.data).toEqual({ one_way_fee_cents: null });
  });

  it("credits the beer on a full return and leaves the fee uncredited", async () => {
    const f = await setup(1000);
    const s = await ship(f, [{ skuId: f.oneWaySku, qty: 3 }]);
    const beer = await admin.from("invoice_lines").select("id").eq("invoice_id", s.invoiceId!).eq("kind", "sku").single();
    await runCommand("return_shipment", { invoiceId: s.invoiceId, locationId: f.wh.id, reason: "unsold", lines: [{ invoiceLineId: beer.data!.id, qty: 3 }] }, f.adminCtx);
    const memo = await admin.from("invoices").select("id").eq("customer_id", f.customer.customerId).eq("kind", "credit_memo").single();
    expect(memo.error).toBeNull();
    expect((await invoiceLines(memo.data!.id)).map(l => [l.kind, l.qty])).toEqual([["sku", -3]]);
    const fee = await admin.from("invoice_lines").select("id").eq("invoice_id", s.invoiceId!).eq("kind", "one_way_keg_fee").single();
    await expect(runCommand("return_shipment", { invoiceId: s.invoiceId, locationId: f.wh.id, reason: "unsold", lines: [{ invoiceLineId: fee.data!.id, qty: 1 }] }, f.adminCtx))
      .rejects.toThrow(/cannot credit/i);
  });

  it("adds no fee line when the fee is 0", async () => {
    const f = await setup(0);
    const s = await ship(f, [{ skuId: f.oneWaySku, qty: 3 }]);
    expect((await invoiceLines(s.invoiceId!)).map(l => l.kind)).toEqual(["sku"]);
  });

  it("keeps a zero fee captured at submit when an adjustment follows a fee increase", async () => {
    const f = await setup(0);
    const { order_id: orderId } = await runCommand("create_order", {
      kind: "wholesale", customerId: f.customer.customerId, shipToId: f.customer.shipToId, fromLocationId: f.wh.id,
      lines: [{ skuId: f.oneWaySku, qty: 1 }],
    }, f.adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId }, f.adminCtx);
    await runCommand("set_one_way_keg_fee", { feeCents: 1500 }, f.adminCtx);
    await runCommand("adjust_order_lines", { orderId, reason: "Buyer requested another keg", lines: [{ skuId: f.oneWaySku, qty: 2 }] }, f.adminCtx);
    const line = (await admin.from("order_lines").select("id, one_way_fee_cents").eq("order_id", orderId).single()).data!;
    expect(line.one_way_fee_cents).toBeNull();
    await runCommand("confirm_order", { orderId }, f.adminCtx);
    await runCommand("record_pick", { orderId, picks: [{ lineId: line.id, qty: 2 }] }, f.adminCtx);
    const shipped = await runCommand("ship_order", { orderId, ship: [{ lineId: line.id, qty: 2 }] }, f.adminCtx) as { invoice_id: string };
    expect((await invoiceLines(shipped.invoice_id)).map(l => l.kind)).toEqual(["sku"]);
    const later = await ship(f, [{ skuId: f.oneWaySku, qty: 1 }]);
    expect((await invoiceLines(later.invoiceId!)).filter(l => l.kind === "one_way_keg_fee").map(l => l.unit_price_cents)).toEqual([1500]);
  });

  it("bills shipped less refused on delivery, at the fee frozen at submit", async () => {
    const f = await setup(1000);
    const s = await ship(f, [{ skuId: f.oneWaySku, qty: 3 }], "on_delivery");
    expect(s.invoiceId).toBeNull();
    await runCommand("set_one_way_keg_fee", { feeCents: 1200 }, f.adminCtx);
    const shipment = await admin.from("shipments").select("id").eq("order_id", s.orderId).single();
    const { routeId } = await runCommand("save_route", { deliveryDate: "2026-10-20", stops: [{ shipmentId: shipment.data!.id, stopNo: 1 }] }, f.adminCtx) as { routeId: string };
    await runCommand("depart_route", { routeId }, f.adminCtx);
    const stop = await admin.from("deliveries").select("id").eq("route_id", routeId).single();
    const delivered = await runCommand("confirm_delivery", {
      deliveryId: stop.data!.id, signedBy: "Pat", reason: "customer_refused", refused: [{ orderLineId: s.lineFor(f.oneWaySku), qty: 1 }],
    }, f.adminCtx) as { invoice_id: string };
    const lines = await invoiceLines(delivered.invoice_id);
    expect(lines.map(l => [l.kind, l.qty, l.unit_price_cents])).toEqual([["sku", 2, 9000], ["one_way_keg_fee", 2, 1000]]);
  });

  it("refuses a QuickBooks push with a fee line until the fee item is mapped", async () => {
    const f = await setup(1000);
    const s = await ship(f, [{ skuId: f.oneWaySku, qty: 3 }]);
    expect((await admin.from("qbo_connections").insert({ brewery_id: f.brewery.id, realm_id: `realm-${crypto.randomUUID()}`, realm_label: "Books", state: "connected" })).error).toBeNull();
    await runCommand("set_qbo_customer_mapping", { customerId: f.customer.customerId, qboCustomerId: "customer-1" }, f.adminCtx);
    await runCommand("set_qbo_item_mapping", { skuId: f.oneWaySku, qboItemId: "item-1" }, f.adminCtx);
    const push = () => f.adminCtx.db.rpc("start_qbo_push", { p_brewery: f.brewery.id, p_invoice: s.invoiceId!, p_new_attempt_reason: null, p_request_id: crypto.randomUUID() });
    expect((await push()).error?.message).toBe("map the one-way keg fee item");
    await runCommand("set_qbo_one_way_fee_mapping", { qboItemId: "fee-item" }, f.adminCtx);
    const started = await push();
    expect(started.error).toBeNull();
    expect(String((started.data as { requestBody: string }).requestBody)).toContain('"value": "fee-item"');
  });

  it("lets only an admin set the fee", async () => {
    const f = await setup(1000);
    const sales: Ctx = await makeStaffCtx(f.brewery.id, "sales");
    await expect(runCommand("set_one_way_keg_fee", { feeCents: 500 }, sales)).rejects.toThrow(/permission|role|not allowed/i);
    await expect(runCommand("set_one_way_keg_fee", { feeCents: -1 }, f.adminCtx)).rejects.toThrow();
    const row = await admin.from("breweries").select("one_way_keg_fee_cents").eq("id", f.brewery.id).single();
    expect(row.data).toEqual({ one_way_keg_fee_cents: 1000 });
  });
});

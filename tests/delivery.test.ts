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

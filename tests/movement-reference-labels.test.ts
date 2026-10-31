import { expect, it } from "vitest";
import { ins, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { movementReferences } from "@/lib/commands/inventory";
import type { LotTraceSnapshot } from "@/lib/mgr/lot-trace-view";
import "@/lib/commands/all";

it("resolves actual source tables for movement history and lot trace without naming pairing IDs (#1382)", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const catalog = await seedCatalog(brewery.id);
  const warehouse = await seedLocation(brewery.id);
  const taproom = await seedLocation(brewery.id, { name: "Taproom", uses: ["taproom"] });
  const customer = await seedCustomer(brewery.id);
  const run = await ins("packaging_runs", { brewery_id: brewery.id, brand_id: catalog.brandId, planned_on: "2026-09-01", created_by: ctx.userId });
  const lot = await ins("lots", { brewery_id: brewery.id, packaging_run_id: run.id, brand_id: catalog.brandId, code: "QA-TEST-LOT", packaged_on: "2026-09-01" });
  const order = await ins("orders", { brewery_id: brewery.id, kind: "wholesale", customer_id: customer.customerId, ship_to_id: customer.shipToId, sale_channel_id: customer.saleChannelId, from_location_id: warehouse.id, created_by: ctx.userId });
  const transfer = await ins("stock_transfers", { brewery_id: brewery.id, from_location_id: warehouse.id, to_location_id: taproom.id, created_by: ctx.userId });
  const credit = await ins("invoices", { brewery_id: brewery.id, customer_id: customer.customerId, kind: "credit_memo", issued_on: "2026-09-02" });
  const shipment = await ins("shipments", { brewery_id: brewery.id, order_id: order.id, created_by: ctx.userId });
  const route = await ins("routes", { brewery_id: brewery.id, delivery_date: "2026-09-02" });
  const delivery = await ins("deliveries", { brewery_id: brewery.id, route_id: route.id, shipment_id: shipment.id, stop_no: 1 });
  const count = await ins("taproom_counts", { brewery_id: brewery.id, location_id: taproom.id, counted_on: "2026-09-02", observed_at: "2026-09-02T12:00:00Z", counted_by: ctx.userId });
  const pair = crypto.randomUUID();
  const base = { brewery_id: brewery.id, sku_id: catalog.skuId, location_id: warehouse.id, bin_id: warehouse.binId, lot_id: lot.id, created_by: ctx.userId };
  insertFixture("inventory_movements", [
    { ...base, type: "production_in", qty: 10, ref: run.id },
    { ...base, type: "sale_removal", qty: -1, ref: order.id, sale_channel_id: customer.saleChannelId, tax_treatment: "taxable", dest_state: "PA" },
    { ...base, type: "location_transfer", qty: -1, ref: transfer.id },
    { ...base, type: "repack", qty: -1, ref: pair },
    { ...base, type: "return_in", qty: 1, ref: credit.id },
    { ...base, type: "return_in", qty: 1, ref: delivery.id },
    { ...base, type: "loss", qty: -1, ref: delivery.id },
    { ...base, type: "destruction", qty: -1, ref: count.id },
  ]);
  const { rows: movements } = await runCommand("list_movements", { skuId: catalog.skuId }, ctx) as { rows: { ref: string; ref_label: string | null; lots: { code: string } }[] };
  const labels = new Map(movements.map(row => [row.ref, row.ref_label]));
  expect(labels.get(run.id)).toBe("RUN-0001");
  expect(labels.get(order.id)).toBe("ORD-0001");
  expect(labels.get(transfer.id)).toBe("TRF-0001");
  expect(labels.get(pair)).toBeNull();
  expect(labels.get(credit.id)).toBe("CM-0001");
  expect(labels.get(delivery.id)).toBe("Refused delivery · ORD-0001");
  expect(labels.get(count.id)).toBe("Count Sep 2, 2026");
  // SKU detail links a movement to its source document by kind (#1517).
  const kinds = new Map((movements as unknown as { ref: string; ref_kind: string | null }[]).map(row => [row.ref, row.ref_kind]));
  expect(Object.fromEntries([run.id, order.id, transfer.id, pair, credit.id, delivery.id, count.id].map(id => [id, kinds.get(id)])))
    .toEqual({ [run.id]: "run", [order.id]: "order", [transfer.id]: "transfer", [pair]: null, [credit.id]: "invoice", [delivery.id]: "delivery", [count.id]: "count" });
  expect(movements.every(row => row.lots.code === "QA-TEST-LOT")).toBe(true);
  const trace = await runCommand("trace_lot", { lotId: lot.id }, ctx) as LotTraceSnapshot;
  expect(trace.movements.find(row => row.ref === delivery.id)).toMatchObject({ ref_label: "Refused delivery · ORD-0001", ref_kind: "delivery" });
  expect(trace.movements.find(row => row.ref === credit.id)).toMatchObject({ ref_label: "CM-0001", ref_kind: "invoice" });
  const otherCtx = await makeStaffCtx((await makeBrewery()).id);
  expect(await movementReferences(otherCtx, [run.id, order.id, transfer.id, credit.id, delivery.id, count.id])).toEqual(new Map());
  expect(await runCommand("get_inventory_lot", { lotId: lot.id }, otherCtx)).toBeNull();
});

it("resolves a depleted lot for positive movement handoffs without weakening outbound stock checks (#1382)", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const catalog = await seedCatalog(brewery.id);
  const location = await seedLocation(brewery.id);
  const run = await ins("packaging_runs", { brewery_id: brewery.id, brand_id: catalog.brandId, planned_on: "2026-09-01", created_by: ctx.userId });
  const lot = await ins("lots", { brewery_id: brewery.id, packaging_run_id: run.id, brand_id: catalog.brandId, code: "DEPLETED-LOT", packaged_on: "2026-09-01" });
  const tracked = { brewery_id: brewery.id, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId, lot_id: lot.id, created_by: ctx.userId };
  insertFixture("inventory_movements", [{ ...tracked, qty: 1, type: "opening_balance" }, { ...tracked, qty: -1, type: "loss" }]);
  expect(await runCommand("get_bin_move_stock", { locationId: location.id }, ctx)).toEqual([]);
  expect(await runCommand("get_inventory_lot", { lotId: lot.id }, ctx)).toEqual({ id: lot.id, code: "DEPLETED-LOT" });
  const input = { skuId: catalog.skuId, locationId: location.id, binId: location.binId, lotId: lot.id };
  await expect(runCommand("record_movement", { ...input, qty: 1, type: "adjustment" }, ctx)).resolves.toMatchObject({ lot_id: lot.id, qty: 1 });
  const before = await ctx.db.from("inventory_movements").select("id, qty, lot_id").eq("brewery_id", brewery.id).order("id");
  expect(before.error).toBeNull();
  await expect(runCommand("record_movement", { ...input, qty: -2, type: "loss" }, ctx)).rejects.toMatchObject({ status: 400, code: "bad_request" });
  const rejected = await ctx.db.rpc("record_inventory_movement", {
    p_brewery: brewery.id, p_sku: catalog.skuId, p_location: location.id, p_bin: location.binId,
    p_lot: lot.id, p_qty: -2, p_type: "loss", p_sale_channel: null, p_dest_state: null, p_note: null, p_request_id: crypto.randomUUID(),
  });
  expect(rejected.error?.code).toBe("P0001");
  expect(rejected.data).toBeNull();
  expect(await ctx.db.from("inventory_movements").select("id, qty, lot_id").eq("brewery_id", brewery.id).order("id")).toEqual(before);
});

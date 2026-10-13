// tests/finished-goods-cost.test.ts — close-time package costs from real receipt and brew-turn facts.
import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial, seedMovement, seedCustomer, priceSku } from "./helpers";
import { closeWithConfirmedMaterials } from "./packaging-fixture";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function costedBatch(receiptCost: number | null = 100) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "admin");
  const location = await seedLocation(brewery.id);
  const catalog = await seedCatalog(brewery.id, { product: "Costed pale", packageType: "keg", bblPerUnit: 0.5 });
  const materialId = await seedMaterial(brewery.id, { name: "Costed malt", category: "malt", lotTracked: true });
  const lot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "COST-MALT", received_on: "2026-10-01" });
  await seedMovement(brewery.id, { materialId, locationId: location.id, binId: location.binId, lotId: lot.id, qty: 100, type: receiptCost === null ? "opening_balance" : "receipt", unitCostCents: receiptCost ?? undefined, createdBy: ctx.userId });
  const batch = await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10, intendedBrandId: catalog.brandId }, ctx) as { id: string };
  const vessel = await runCommand("upsert_vessel", { name: "Cost FV", kind: "fermenter", capacityBbl: 20 }, ctx) as { id: string };
  const turn = { batchId: batch.id, vesselId: vessel.id, initialBbl: 5, actuals: [{ materialId, stage: "mash", locationId: location.id, binId: location.binId, lotId: lot.id, qty: 50 }] };
  const brewed = await runCommand("record_brew_day", { ...turn, brewedOn: "2026-10-01" }, ctx) as { record: { id: string }; occupancy: { id: string } };
  await runCommand("record_brew_day", { ...turn, brewedOn: "2026-10-02" }, ctx);
  async function close(qty = 4, draw = 2, actuals?: { materialId: string; locationId: string; binId: string; lotId: string | null; used: number; loss: number; unused: number }[]) {
    const run = await runCommand("schedule_packaging_run", { brandId: catalog.brandId, occupancyId: brewed.occupancy.id, plannedOn: "2026-10-03", outputs: [{ skuId: catalog.skuId, qtyPlanned: qty }] }, ctx) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-10-03T12:00:00Z" }, ctx);
    const input = { runId: run.id, bblDrawn: draw, outputs: [{ skuId: catalog.skuId, qtyActual: qty }], lotCode: `COST-${run.id}`, packagedOn: "2026-10-03", locationId: location.id, binId: location.binId };
    const requestId = crypto.randomUUID();
    const execution = { requestId, correlationId: requestId };
    const receipt = actuals
      ? await runCommand("close_packaging_run", { ...input, actuals, planRevision: (await runCommand("get_packaging_close_plan", { runId: run.id }, ctx) as { revision: string }).revision }, ctx, execution)
      : await closeWithConfirmedMaterials(input, ctx, execution);
    const output = await admin.from("packaging_run_outputs").select("*").eq("run_id", run.id).single().throwOnError();
    return { input, execution, receipt, runId: run.id, cost: (output.data as unknown as { unit_cost_cents?: number | null }).unit_cost_cents };
  }
  return { brewery, ctx, location, catalog, materialId, lot, batch, vessel, turn, brewed, close };
}

describe("finished-goods cost (#810 PR1)", () => {
  it("freezes receipt-based cost over both knockout turns and values packaged stock", async () => {
    const f = await costedBatch();
    const saved = await f.close();
    expect(Number(saved.cost)).toBe(500);
    expect(await runCommand("get_inventory_value", {}, f.ctx)).toEqual({ value_cents: 2000, uncosted_qty: 0 });
    // Receipt prices can change later; an exact completed close must not re-cost its output.
    await seedMovement(f.brewery.id, { materialId: f.materialId, locationId: f.location.id, binId: f.location.binId, lotId: f.lot.id, qty: 10, type: "receipt", unitCostCents: 120, createdBy: f.ctx.userId });
    expect(await closeWithConfirmedMaterials(saved.input, f.ctx, saved.execution)).toEqual(saved.receipt);
    expect((await admin.from("packaging_run_outputs").select("unit_cost_cents").eq("run_id", saved.runId).single().throwOnError()).data!.unit_cost_cents).toBe(500);
  });

  it("absorbs this run's draw loss without changing the knockout denominator", async () => {
    const f = await costedBatch();
    expect(Number((await f.close(3, 2)).cost)).toBeCloseTo(2000 / 3);
  });

  it("leaves missing ingredient receipt costs null, including when another lot has a price", async () => {
    const f = await costedBatch(null);
    const newer = await ins("material_lots", { brewery_id: f.brewery.id, material_id: f.materialId, lot_code: "OTHER-LOT", received_on: "2026-10-02" });
    await seedMovement(f.brewery.id, { materialId: f.materialId, locationId: f.location.id, binId: f.location.binId, lotId: newer.id, qty: 100, type: "receipt", unitCostCents: 150, createdBy: f.ctx.userId });
    expect((await f.close()).cost).toBeNull();
    expect(await runCommand("get_inventory_value", {}, f.ctx)).toEqual({ value_cents: 0, uncosted_qty: 4 });
  });

  it("does not raise the rate when beer is transferred into another batch", async () => {
    const f = await costedBatch();
    const other = await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 5 }, f.ctx) as { id: string };
    const target = await runCommand("upsert_vessel", { name: "Receiving FV", kind: "fermenter", capacityBbl: 20 }, f.ctx) as { id: string };
    await runCommand("record_brew_day", { batchId: other.id, vesselId: target.id, initialBbl: 1, brewedOn: "2026-10-01", actuals: [], confirmEmpty: true }, f.ctx);
    await runCommand("record_cellar_transfer", { fromOccupancyId: f.brewed.occupancy.id, toVesselId: target.id, volumeBbl: 4 }, f.ctx);
    expect(Number((await f.close()).cost)).toBe(500);
  });

  it("uses the newest uncorrected receipt of the same lot at close", async () => {
    const f = await costedBatch();
    await seedMovement(f.brewery.id, { materialId: f.materialId, locationId: f.location.id, binId: f.location.binId, lotId: f.lot.id, qty: 10, type: "receipt", unitCostCents: 120, createdBy: f.ctx.userId });
    expect(Number((await f.close()).cost)).toBe(600);
  });

  it("keeps the consumed lot uncosted when its newest uncorrected receipt has no price", async () => {
    const f = await costedBatch();
    await seedMovement(f.brewery.id, { materialId: f.materialId, locationId: f.location.id, binId: f.location.binId, lotId: f.lot.id, qty: 10, type: "receipt", createdBy: f.ctx.userId });
    expect((await f.close()).cost).toBeNull();
    expect(await runCommand("get_inventory_value", {}, f.ctx)).toEqual({ value_cents: 0, uncosted_qty: 4 });
  });

  it("uses the consumed lot rather than a later receipt of another lot", async () => {
    const f = await costedBatch();
    const newer = await ins("material_lots", { brewery_id: f.brewery.id, material_id: f.materialId, lot_code: "EXPENSIVE-LOT", received_on: "2026-10-02" });
    await seedMovement(f.brewery.id, { materialId: f.materialId, locationId: f.location.id, binId: f.location.binId, lotId: newer.id, qty: 100, type: "receipt", unitCostCents: 150, createdBy: f.ctx.userId });
    expect(Number((await f.close()).cost)).toBe(500);
  });

  it("adds standard packaging BOM receipt cost per package", async () => {
    const f = await costedBatch();
    const materialId = await seedMaterial(f.brewery.id, { name: "Keg collar", category: "packaging", uom: "each" });
    await seedMovement(f.brewery.id, { materialId, locationId: f.location.id, binId: f.location.binId, qty: 20, type: "receipt", unitCostCents: 10, createdBy: f.ctx.userId });
    await ins("format_bom", { brewery_id: f.brewery.id, format_id: f.catalog.formatId, material_id: materialId, qty_per_unit: 1, on_break: "consumed" });
    expect(Number((await f.close()).cost)).toBe(510);
  });

  it("leaves a tracked BOM without a confirmed source uncosted instead of using another receipt", async () => {
    const f = await costedBatch();
    const materialId = await seedMaterial(f.brewery.id, { name: "Tracked collars", category: "packaging", uom: "each", lotTracked: true });
    const packagingLot = await ins("material_lots", { brewery_id: f.brewery.id, material_id: materialId, lot_code: "COLLARS", received_on: "2026-10-01" });
    await seedMovement(f.brewery.id, { materialId, locationId: f.location.id, binId: f.location.binId, lotId: packagingLot.id, qty: 20, type: "receipt", unitCostCents: 10, createdBy: f.ctx.userId });
    await ins("format_bom", { brewery_id: f.brewery.id, format_id: f.catalog.formatId, material_id: materialId, qty_per_unit: 1, on_break: "consumed" });
    expect((await f.close(4, 2, [{ materialId, locationId: f.location.id, binId: f.location.binId, lotId: null, used: 0, loss: 0, unused: 0 }])).cost).toBeNull();
  });

  it("retains receipt economic order when an older same-lot receipt is corrected later", async () => {
    const f = await costedBatch();
    const materialId = await seedMaterial(f.brewery.id, { name: "Receipt order malt", category: "malt", lotTracked: true });
    const vendor = await runCommand("upsert_vendor", { name: "Cost order supplier" }, f.ctx) as { id: string };
    async function receive(qty: number, unitCostCents: number) {
      const po = await runCommand("create_purchase_order", { vendorId: vendor.id, lines: [{ materialId, qtyOrdered: qty, unitCostCents }] }, f.ctx) as { id: string };
      await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, f.ctx);
      const line = (await runCommand("get_purchase_order", { poId: po.id }, f.ctx) as { lines: { id: string }[] }).lines[0];
      const receipt = await runCommand("receive_purchase_order", { poId: po.id, locationId: f.location.id, binId: f.location.binId, receivedOn: "2026-10-01", lines: [{ poLineId: line.id, qtyCounted: qty, lotCode: "SHARED-COST-LOT" }] }, f.ctx) as { receipt_id: string };
      return { receiptId: receipt.receipt_id, lineId: line.id };
    }
    const older = await receive(50, 100);
    await receive(50, 150);
    await runCommand("correct_purchase_receipt", { receiptId: older.receiptId, reason: "Original delivery count correction", lines: [{ poLineId: older.lineId, qtyCounted: 40, lotCode: "SHARED-COST-LOT" }] }, f.ctx);
    const source = (await admin.from("material_lots").select("id").eq("material_id", materialId).eq("lot_code", "SHARED-COST-LOT").single().throwOnError()).data!;
    const batch = await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10, intendedBrandId: f.catalog.brandId }, f.ctx) as { id: string };
    const vessel = await runCommand("upsert_vessel", { name: "Economic order FV", kind: "fermenter", capacityBbl: 20 }, f.ctx) as { id: string };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, brewedOn: "2026-10-01", initialBbl: 10, actuals: [{ materialId, locationId: f.location.id, binId: f.location.binId, lotId: source.id, stage: "mash", qty: 20 }] }, f.ctx) as { occupancy: { id: string } };
    const run = await runCommand("schedule_packaging_run", { brandId: f.catalog.brandId, occupancyId: brewed.occupancy.id, plannedOn: "2026-10-03", outputs: [{ skuId: f.catalog.skuId, qtyPlanned: 4 }] }, f.ctx) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-10-03T12:00:00Z" }, f.ctx);
    await closeWithConfirmedMaterials({ runId: run.id, bblDrawn: 2, outputs: [{ skuId: f.catalog.skuId, qtyActual: 4 }], lotCode: "ECONOMIC-COST", packagedOn: "2026-10-03", locationId: f.location.id, binId: f.location.binId }, f.ctx);
    const output = (await admin.from("packaging_run_outputs").select("unit_cost_cents").eq("run_id", run.id).single().throwOnError()).data!;
    expect(output.unit_cost_cents).toBe(150);
  });

  it("excludes compensated ingredient use while keeping original knockout volume", async () => {
    const f = await costedBatch();
    await runCommand("correct_brew_record", { recordId: f.brewed.record.id, reason: "First turn weighed lower", initialBbl: 5, actuals: [{ ...f.turn.actuals[0], qty: 40 }] }, f.ctx);
    expect(Number((await f.close()).cost)).toBe(450);
  });

  it("divides by the corrected knockout volume, not the original turn volume", async () => {
    const f = await costedBatch();
    await runCommand("correct_brew_record", { recordId: f.brewed.record.id, reason: "First turn measured lower", initialBbl: 4, actuals: f.turn.actuals }, f.ctx);
    // 10,000 cents over 9 bbl, 2 bbl drawn into four 0.5-bbl kegs.
    expect(Number((await f.close()).cost)).toBeCloseTo(5000 / 9);
  });

  it("values remaining tracked stock after shipping and reports opening units as uncosted", async () => {
    const f = await costedBatch();
    const saved = await f.close();
    await runCommand("record_movement", { skuId: f.catalog.skuId, locationId: f.location.id, binId: f.location.binId, qty: 2, type: "opening_balance" }, f.ctx);
    expect(await runCommand("get_inventory_value", {}, f.ctx)).toEqual({ value_cents: 2000, uncosted_qty: 2 });
    const customer = await seedCustomer(f.brewery.id);
    await priceSku(f.brewery.id, { saleChannelId: customer.saleChannelId, brandId: f.catalog.brandId, formatId: f.catalog.formatId, cents: 12000 });
    const order = await runCommand("create_order", { kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: f.location.id, lines: [{ skuId: f.catalog.skuId, qty: 1 }] }, f.ctx) as { order_id: string };
    await runCommand("submit_order", { orderId: order.order_id }, f.ctx);
    await runCommand("confirm_order", { orderId: order.order_id }, f.ctx);
    const line = (await admin.from("order_lines").select("id").eq("order_id", order.order_id).single().throwOnError()).data!;
    await runCommand("record_pick", { orderId: order.order_id, picks: [{ lineId: line.id, qty: 1 }] }, f.ctx);
    const lot = (await admin.from("lots").select("id").eq("packaging_run_id", saved.runId).single().throwOnError()).data!;
    await runCommand("ship_order", { orderId: order.order_id, ship: [{ lineId: line.id, qty: 1, sources: [{ binId: f.location.binId, lotId: lot.id, qty: 1 }] }] }, f.ctx);
    expect(await runCommand("get_inventory_value", {}, f.ctx)).toEqual({ value_cents: 1500, uncosted_qty: 2 });
  });

  it("prices tracked BOM at its used source and does not absorb packaging loss", async () => {
    const f = await costedBatch();
    const materialId = await seedMaterial(f.brewery.id, { name: "Receipt-priced collars", category: "packaging", uom: "each", lotTracked: true });
    const source = await ins("material_lots", { brewery_id: f.brewery.id, material_id: materialId, lot_code: "USED-COLLARS", received_on: "2026-10-01" });
    const later = await ins("material_lots", { brewery_id: f.brewery.id, material_id: materialId, lot_code: "LATER-COLLARS", received_on: "2026-10-02" });
    await seedMovement(f.brewery.id, { materialId, locationId: f.location.id, binId: f.location.binId, lotId: source.id, qty: 20, type: "receipt", unitCostCents: 10, createdBy: f.ctx.userId });
    await seedMovement(f.brewery.id, { materialId, locationId: f.location.id, binId: f.location.binId, lotId: later.id, qty: 20, type: "receipt", unitCostCents: 30, createdBy: f.ctx.userId });
    await ins("format_bom", { brewery_id: f.brewery.id, format_id: f.catalog.formatId, material_id: materialId, qty_per_unit: 1, on_break: "consumed" });
    expect(Number((await f.close(4, 2, [{ materialId, locationId: f.location.id, binId: f.location.binId, lotId: source.id, used: 4, loss: 2, unused: 0 }])).cost)).toBe(510);
  });

  it("restricts the command to Admin/Sales and keeps other tenants out of valuation rows", async () => {
    const f = await costedBatch();
    await f.close();
    const sales = await makeStaffCtx(f.brewery.id, "sales");
    expect(await runCommand("get_inventory_value", {}, sales)).toEqual({ value_cents: 2000, uncosted_qty: 0 });
    for (const role of ["warehouse", "brewer"] as const) {
      const ctx = await makeStaffCtx(f.brewery.id, role);
      await expect(runCommand("get_inventory_value", {}, ctx)).rejects.toThrow(/permission|role|allowed|forbidden/i);
    }
    const foreign = await makeBrewery();
    const outsider = await makeStaffCtx(foreign.id, "admin");
    expect((await outsider.db.from("sku_inventory_value").select("*").eq("brewery_id", f.brewery.id).throwOnError()).data).toEqual([]);
    expect((await outsider.db.from("inventory_value").select("*").eq("brewery_id", f.brewery.id).throwOnError()).data).toEqual([]);
    expect(await runCommand("get_inventory_value", {}, outsider)).toEqual({ value_cents: 0, uncosted_qty: 0 });
  });
});

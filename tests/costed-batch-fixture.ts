// tests/costed-batch-fixture.ts — a brewery with one costed, brewed batch and a `close` helper that packages
// it into kegs, shared by the finished-goods cost and order COGS tests (#810).
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { closeWithConfirmedMaterials } from "./packaging-fixture";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

export async function costedBatch(receiptCost: number | null = 100) {
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

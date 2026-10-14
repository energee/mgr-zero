// tests/historical-packaging.test.ts — a historical batch's packaging is a
// closed run and lot with actual quantities but no stock movement and no tank
// (docs/plans/historical-packaging.md). It is written only before
// books_opened_on, and lot trace reaches the batch through packaging_runs.batch_id.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string;
let owner: Ctx;
let brewer: Ctx;
let brandId: string;
let skuId: string;
let otherSkuId: string;

const once = (requestId?: string) => (requestId ? { requestId, correlationId: requestId } : undefined);
// A closed historical batch of `brandId`, brewed 2025-06-01.
async function historicalBatch() {
  const id = (await runCommand("schedule_batch", { plannedOn: "2025-06-01", plannedBbl: 10, intendedBrandId: brandId }, owner) as { id: string }).id;
  await runCommand("record_historical_batch", { batchId: id, brewedOn: "2025-06-01", closedOn: "2025-06-20", knockoutBbl: 10 }, owner);
  return id;
}
const pack = (input: Record<string, unknown>, ctx = owner, requestId?: string) =>
  runCommand("record_historical_packaging_run", {
    packagedOn: "2025-06-15", lotCode: `L-${crypto.randomUUID().slice(0, 8)}`, outputs: [{ skuId, qty: 4.5 }], ...input,
  }, ctx, once(requestId));

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  brewer = await makeStaffCtx(breweryId, "brewer");
  ({ brandId, skuId } = await seedCatalog(breweryId, { product: "History IPA" }));
  ({ skuId: otherSkuId } = await seedCatalog(breweryId, { product: "Other Lager", sku: "Other case" }));
  await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, owner);
});

describe("schema: a closed run needs a tank or (history) its batch", () => {
  it("refuses a closed run with neither", () => {
    expect(() => sql(`insert into packaging_runs (brewery_id, brand_id, planned_on, started_at, closed_at, created_by)
      values ('${breweryId}', '${brandId}', '2025-06-15', '2025-06-15', '2025-06-15', '${owner.userId}')`, true, "sqlstate")).toThrow(/23514/);
  });
});

describe("record_historical_packaging_run", () => {
  it("writes a closed run, outputs and a lot, with no stock and no tank", async () => {
    const batchId = await historicalBatch();
    const result = await pack({ batchId }) as { run: { id: string }; lot: { id: string } };
    const run = (await admin.from("packaging_runs").select("batch_id, occupancy_id, closed_at, bbl_drawn").eq("id", result.run.id).single().throwOnError()).data!;
    expect(run).toMatchObject({ batch_id: batchId, occupancy_id: null, bbl_drawn: null });
    expect(run.closed_at).not.toBeNull();
    const outputs = (await admin.from("packaging_run_outputs").select("qty_actual, movement_id").eq("run_id", result.run.id).throwOnError()).data!;
    expect(outputs).toEqual([{ qty_actual: 4.5, movement_id: null }]);
    expect((await admin.from("inventory_movements").select("id").eq("brewery_id", breweryId).throwOnError()).data).toEqual([]);
    const runs = await runCommand("list_packaging_runs", {}, brewer) as { id: string; closed_at: string | null }[];
    expect(runs.find((r) => r.id === result.run.id)!.closed_at).not.toBeNull();
  });

  it("refuses dates outside history, another brand's SKU, a bad quantity, a duplicate lot, and a non-admin", async () => {
    const batchId = await historicalBatch();
    await expect(pack({ batchId, packagedOn: "2026-10-01" })).rejects.toThrow(/before the books opened/);
    await expect(pack({ batchId, packagedOn: "2025-05-31" })).rejects.toThrow(/before the batch was brewed/);
    await expect(pack({ batchId, outputs: [{ skuId: otherSkuId, qty: 1 }] })).rejects.toThrow(/brand/);
    await expect(pack({ batchId, outputs: [{ skuId, qty: 0 }] })).rejects.toThrow();
    await pack({ batchId, lotCode: "DUP-1" });
    await expect(pack({ batchId, lotCode: "DUP-1" })).rejects.toThrow(/already used/);
    await expect(pack({ batchId }, brewer)).rejects.toThrow(/permission denied/);
  });

  it("refuses a batch that is not historical: open, or closed through a tank", async () => {
    const open = (await runCommand("schedule_batch", { plannedOn: "2025-06-01", plannedBbl: 10, intendedBrandId: brandId }, owner) as { id: string }).id;
    await expect(pack({ batchId: open })).rejects.toThrow(/historical batch/);
    const vessel = (await runCommand("upsert_vessel", { name: "FV live", kind: "fermenter", capacityBbl: 20 }, owner) as { id: string }).id;
    const live = (await runCommand("schedule_batch", { plannedOn: "2025-06-01", plannedBbl: 5, intendedBrandId: brandId }, owner) as { id: string }).id;
    await runCommand("record_brew_day", { batchId: live, vesselId: vessel, initialBbl: 5, brewedOn: "2025-06-01", actuals: [], confirmEmpty: true }, brewer);
    await runCommand("complete_batch", { batchId: live, confirmInTankBbl: 5 }, owner);
    await expect(pack({ batchId: live })).rejects.toThrow(/historical batch/);
  });

  it("replays a request with the first result", async () => {
    const batchId = await historicalBatch();
    const requestId = crypto.randomUUID();
    const first = await pack({ batchId, lotCode: "REPLAY-1" }, owner, requestId);
    expect(await pack({ batchId, lotCode: "REPLAY-1" }, owner, requestId)).toEqual(first);
  });
});

describe("lot trace reaches a historical lot's batch", () => {
  it("trace_lot and trace_batch_lots name the batch", async () => {
    const batchId = await historicalBatch();
    const { lot } = await pack({ batchId }) as { lot: { id: string } };
    const trace = await runCommand("trace_lot", { lotId: lot.id }, owner) as { batch: { id: string } | null; batches: { id: string }[] };
    expect(trace.batch?.id).toBe(batchId);
    expect(trace.batches.map((b) => b.id)).toEqual([batchId]);
    const forward = await owner.db.rpc("trace_batch_lots", { p_brewery: breweryId, p_batch: batchId });
    expect(forward.error).toBeNull();
    expect((forward.data as { id: string }[]).map((l) => l.id)).toContain(lot.id);
  });
});

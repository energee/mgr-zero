// A batch split: record_cellar_transfer with toBatchId starts a planned batch
// in an empty tank from part of another batch (docs/plans/batch-split.md).
import { closeWithConfirmedMaterials } from "./packaging-fixture";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial, sql } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { batchesFromQuery, type BatchListRow } from "@/lib/mgr/batches-view";
import { brewedAsPlanned, brewPlanActuals, canRecordBrewDay, currentBrewRecords, type BrewMaterialSource, type BrewPlan, type BrewRecordView } from "@/lib/mgr/brew-day-view";
import type { RecipeOutcome } from "@/lib/mgr/recipe-view";
import { batchLabel } from "@/lib/mgr/doc-no";
import { BrewDayView } from "@/components/mgr/views/brew-day";

type Transfer = {
  transfer: { id: string; at: string };
  to_occupancy: { id: string; batch_id: string };
};

let breweryId: string;
let ctx: Ctx;
let owner: Ctx;
let location: { id: string; binId: string };

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId, "brewer");
  owner = await makeStaffCtx(breweryId, "admin");
  location = await seedLocation(breweryId);
});

const tank = () => runCommand("upsert_vessel", {
  name: `FV ${crypto.randomUUID()}`, kind: "fermenter", capacityBbl: 100,
}, owner) as Promise<{ id: string }>;

async function plan(actor = ctx) {
  const catalog = await seedCatalog(actor.breweryId, {
    product: `Brand ${crypto.randomUUID()}`, sku: `Case ${crypto.randomUUID()}`, bblPerUnit: 0.01,
  });
  const batch = await runCommand("schedule_batch", {
    intendedBrandId: catalog.brandId, plannedOn: "2026-09-01", plannedBbl: 20,
  }, actor) as { id: string };
  return { batchId: batch.id, ...catalog };
}

async function brew(initialBbl = 20) {
  const planned = await plan();
  const vessel = await tank();
  const day = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true,
    batchId: planned.batchId, vesselId: vessel.id, initialBbl, brewedOn: "2026-09-01",
  }, ctx) as { occupancy: { id: string } };
  return { ...planned, occupancyId: day.occupancy.id, vesselId: vessel.id };
}

const transfer = (fromOccupancyId: string, toVesselId: string, volumeBbl: number, toBatchId?: string) =>
  runCommand("record_cellar_transfer", { fromOccupancyId, toVesselId, volumeBbl, lossBbl: 0, toBatchId }, ctx) as Promise<Transfer>;

const baseline = async (batchId: string) =>
  Number((await runCommand("get_batch_completion_preview", { batchId }, ctx) as { baselineBbl: number | string }).baselineBbl);

const brewedOn = (batchId: string) => sql(`select coalesce(brewed_on::text, 'null') from batches where id='${batchId}'`, true)[0];

describe("batch split by cellar transfer", () => {
  it("starts the planned batch in the empty tank and moves the volume between the two balances", async () => {
    const source = await brew(20);
    const target = await plan();
    const empty = await tank();

    const moved = await transfer(source.occupancyId, empty.id, 8, target.batchId);

    expect(moved.to_occupancy.batch_id).toBe(target.batchId);
    expect(sql(`select count(*) from vessel_occupancies where vessel_id='${empty.id}' and batch_id='${target.batchId}' and ended_at is null`, true)).toEqual(["1"]);
    // The transfer's date in the brewery's time zone.
    expect(brewedOn(target.batchId)).toBe(sql(
      `select ('${moved.transfer.at}'::timestamptz at time zone timezone)::date::text from breweries where id='${breweryId}'`, true)[0]);
    expect(await baseline(source.batchId)).toBe(12);
    expect(await baseline(target.batchId)).toBe(8);
  });

  it("without toBatchId a transfer into an empty tank continues the source batch", async () => {
    const source = await brew(20);
    const empty = await tank();
    const moved = await transfer(source.occupancyId, empty.id, 8);
    expect(moved.to_occupancy.batch_id).toBe(source.batchId);
    expect(await baseline(source.batchId)).toBe(20);
  });

  it("refuses a destination that already holds beer", async () => {
    const source = await brew(20);
    const occupied = await brew(5);
    const target = await plan();
    await expect(transfer(source.occupancyId, occupied.vesselId, 8, target.batchId))
      .rejects.toThrow("a planned batch can only start in an empty vessel");
    expect(brewedOn(target.batchId)).toBe("null");
    expect(sql(`select count(*) from transfers where from_occupancy_id='${source.occupancyId}'`, true)).toEqual(["0"]);
  });

  it("refuses a batch that is brewed, closed, cancelled, the source's own, or another brewery's", async () => {
    const source = await brew(20);
    const empty = await tank();
    const refused = "only an unstarted planned batch can start from a transfer";

    const brewed = await brew(5);
    await expect(transfer(source.occupancyId, empty.id, 8, brewed.batchId)).rejects.toThrow(refused);

    const closed = await brew(5);
    await runCommand("complete_batch", { batchId: closed.batchId, confirmInTankBbl: 5 }, ctx);
    await expect(transfer(source.occupancyId, empty.id, 8, closed.batchId)).rejects.toThrow(refused);

    const cancelled = await plan();
    await runCommand("cancel_batch", { batchId: cancelled.batchId }, ctx);
    await expect(transfer(source.occupancyId, empty.id, 8, cancelled.batchId)).rejects.toThrow(refused);

    await expect(transfer(source.occupancyId, empty.id, 8, source.batchId)).rejects.toThrow(refused);

    const foreign = await plan(await makeStaffCtx((await makeBrewery()).id, "brewer"));
    await expect(transfer(source.occupancyId, empty.id, 8, foreign.batchId)).rejects.toThrow();
    expect(brewedOn(foreign.batchId)).toBe("null");

    expect(sql(`select count(*) from vessel_occupancies where vessel_id='${empty.id}'`, true)).toEqual(["0"]);
  });

  it("packages the split batch under its own brand and traces the lot to both batches", async () => {
    const source = await brew(20);
    const target = await plan();
    const empty = await tank();
    const moved = await transfer(source.occupancyId, empty.id, 8, target.batchId);

    const run = await runCommand("schedule_packaging_run", {
      brandId: target.brandId, plannedOn: "2026-09-02", occupancyId: moved.to_occupancy.id,
      outputs: [{ skuId: target.skuId, qtyPlanned: 100 }],
    }, ctx) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: new Date().toISOString() }, ctx);
    await closeWithConfirmedMaterials({
      runId: run.id, bblDrawn: 1, outputs: [{ skuId: target.skuId, qtyActual: 100 }], lotCode: `LOT-${crypto.randomUUID()}`,
      packagedOn: "2026-09-02", locationId: location.id, binId: location.binId,
    }, ctx);
    const lot = (await admin.from("lots").select("id, brand_id").eq("packaging_run_id", run.id).single()).data!;
    expect(lot.brand_id).toBe(target.brandId);
    expect(target.brandId).not.toBe(source.brandId);

    const sources = await owner.db.rpc("trace_lot_sources", { p_brewery: breweryId, p_lot: lot.id });
    expect(sources.error).toBeNull();
    const traced = sources.data as unknown as { batches: { id: string }[] };
    expect(traced.batches.map(batch => batch.id).sort()).toEqual([source.batchId, target.batchId].sort());

    const lots = await owner.db.rpc("trace_batch_lots", { p_brewery: breweryId, p_batch: source.batchId });
    expect(lots.error).toBeNull();
    expect(lots.data?.map(row => row.id)).toContain(lot.id);
  });
});

// A split batch is brewed (brewed_on, an open tank) with no brew record. These are the reads its pages run.
describe("a split batch on its own pages", () => {
  type BrewDay = { batch: { batch_no: number; brewed_on: string | null; closed_at: string | null; planned_bbl: number; planned_on: string };
    startedFrom: { batch_id: string; batch_no: number; brand_name: string | null; bbl: number; at: string } | null;
    occupancy: { id: string; vessel_id: string; vessel_name: string; initial_bbl: number } | null };
  type PlanRead = { plan: BrewPlan; sources: BrewMaterialSource[]; pulls: unknown[] };
  type Preview = { baselineBbl: number | string; inTankBbl: number | string; inTankRequiresConfirmation: boolean };

  let recipeId: string;
  let split: { batchId: string; occupancyId: string; vesselId: string; at: string };
  let sourceBatchId: string;
  let ordinaryBatchId: string;
  const sourceBrand = `Source ${crypto.randomUUID()}`;
  const brewDay = (batchId: string) => runCommand("get_brew_day", { batchId }, ctx) as Promise<BrewDay>;
  const outcomes = async () => (await runCommand("get_recipe_outcomes", { recipeId }, ctx) as { batches: RecipeOutcome[] }).batches.map(row => row.batchId);

  beforeAll(async () => {
    const malt = await seedMaterial(breweryId, { name: `Malt ${crypto.randomUUID()}`, category: "malt", extractPotential: 1.037 });
    recipeId = (await runCommand("create_recipe", { name: `Recipe ${crypto.randomUUID()}` }, ctx) as { id: string }).id;
    const version = await runCommand("create_recipe_version", {
      recipeId, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      mashSchedule: [{ name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }], ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }],
    }, ctx) as { id: string };
    const { brandId } = await seedCatalog(breweryId, { product: sourceBrand, sku: `Case ${crypto.randomUUID()}` });
    /** A batch of the recipe, brewed into its own tank. */
    const brewRecipe = async (initialBbl: number) => {
      const batch = await runCommand("schedule_batch", { intendedBrandId: brandId, recipeVersionId: version.id, plannedOn: "2026-09-01", plannedBbl: initialBbl }, ctx) as { id: string };
      const day = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true,
        batchId: batch.id, vesselId: (await tank()).id, initialBbl, brewedOn: "2026-09-01" }, ctx) as { occupancy: { id: string } };
      return { batchId: batch.id, occupancyId: day.occupancy.id };
    };
    const source = await brewRecipe(20);
    sourceBatchId = source.batchId;
    ordinaryBatchId = (await brewRecipe(5)).batchId;
    const target = await runCommand("schedule_batch", { recipeVersionId: version.id, plannedOn: "2026-09-01", plannedBbl: 8 }, ctx) as { id: string };
    const empty = await tank();
    const moved = await transfer(source.occupancyId, empty.id, 8, target.id);
    split = { batchId: target.id, occupancyId: moved.to_occupancy.id, vesselId: empty.id, at: moved.transfer.at };
    await runCommand("record_fermentation_reading", { occupancyId: split.occupancyId, at: new Date().toISOString(), gravityPlato: 12 }, ctx);
  });

  it("lists as Active with its open tank on Batches and the Cellar map", async () => {
    const active = await runCommand("list_batches", { readings: true, open: true }, ctx) as BatchListRow[];
    const row = active.find(batch => batch.id === split.batchId)!;
    expect(row.active_occupancies.map(occupancy => occupancy.id)).toEqual([split.occupancyId]);
    expect(row.og_reading?.gravity_plato).toBe(12);

    const snapshot = batchesFromQuery(active, []);
    const shown = snapshot.active!.find(batch => batch.key === split.batchId)!;
    expect(shown.readings!.map(reading => reading.key)).toEqual([split.occupancyId]);
    expect(snapshot.planned).toEqual([]);
  });

  it("holds beer in list_occupancies", async () => {
    const occupied = await runCommand("list_occupancies", {}, ctx) as { occupancy_id: string; vessel_id: string; batch_id: string; bbl: number | string }[];
    const row = occupied.find(occupancy => occupancy.occupancy_id === split.occupancyId)!;
    expect(row).toMatchObject({ vessel_id: split.vesselId, batch_id: split.batchId });
    expect(Number(row.bbl)).toBe(8);
  });

  it("opens its batch page with no brew record", async () => {
    const day = await brewDay(split.batchId);
    expect(day.batch.brewed_on).not.toBeNull();
    expect(day.occupancy).toMatchObject({ id: split.occupancyId, vessel_id: split.vesselId });
    const history = await runCommand("get_brew_record", { batchId: split.batchId }, ctx) as { records: BrewRecordView[] };
    expect(history.records).toEqual([]);
    const plan = await runCommand("get_brew_day_plan", { batchId: split.batchId }, ctx) as PlanRead;
    expect(plan.plan.ingredients).toHaveLength(1);

    // The model app/(app)/batches/[id]/page.tsx builds for a recorded batch.
    expect(currentBrewRecords(history.records)).toEqual([]);
    expect(brewPlanActuals(plan.plan, Number(day.batch.planned_bbl), plan.sources)).toHaveLength(1);
    const initialBbl = String(Number(day.occupancy!.initial_bbl));
    expect(() => brewedAsPlanned({ bbl: Number(day.batch.planned_bbl), on: day.batch.planned_on }, { bbl: initialBbl, on: day.batch.brewed_on! })).not.toThrow();
    // Recorded, so the page shows the read-out and never the brew-day form.
    expect(canRecordBrewDay({ title: "", vessels: [], vesselId: split.vesselId, initialBbl, brewedOn: day.batch.brewed_on!, recorded: true })).toBe(false);
  });

  it("names the batch it started from; a brewed batch names none", async () => {
    const source = await brewDay(sourceBatchId);
    const { startedFrom } = await brewDay(split.batchId);
    expect(startedFrom).toMatchObject({ batch_id: sourceBatchId, batch_no: source.batch.batch_no, brand_name: sourceBrand, bbl: 8 });
    expect(Date.parse(startedFrom!.at)).toBe(Date.parse(split.at));
    expect(source.startedFrom).toBeNull();
    expect((await brewDay(ordinaryBatchId)).startedFrom).toBeNull();
  });

  it("reads on its page as started from that batch, not as brewed", async () => {
    const { batch, startedFrom } = await brewDay(split.batchId);
    const label = batchLabel(startedFrom!.batch_no, startedFrom!.brand_name);
    const html = renderToStaticMarkup(createElement(BrewDayView, { model: {
      title: "", vessels: [], vesselId: split.vesselId, vesselName: "FV", initialBbl: String(startedFrom!.bbl), brewedOn: batch.brewed_on!, recorded: true, records: [],
      startedFrom: { label, href: `/batches/${sourceBatchId}`, bbl: startedFrom!.bbl },
    } }));
    expect(html).toContain("Started from");
    expect(html).toContain(`<a href="/batches/${sourceBatchId}"`);
    expect(html).toContain(label);
    expect(html).toContain("8 bbl by transfer");
    expect(html).toContain("Started on");
    expect(html).toContain("No brew sheet. This batch started from a transfer, so its ingredients are on the batch it came from.");
    expect(html).toContain("Started by transfer.");
    for (const brewedWording of ["Knockout", "Brewed on", "Already brewed", "Historical frozen brew sheet"]) expect(html).not.toContain(brewedWording);
  });

  it("refuses a brew turn, and has no brew record to correct", async () => {
    const turn = (vesselId: string) => runCommand("record_brew_day", { actuals: [], confirmEmpty: true,
      batchId: split.batchId, vesselId, initialBbl: 5, brewedOn: new Date().toISOString().slice(0, 10) }, ctx);
    await expect(turn(split.vesselId)).rejects.toThrow("a cellar transfer already depends on this batch");
    await expect(turn((await tank()).id)).rejects.toThrow("brew turn must use the batch existing open tank");
    await expect(runCommand("correct_brew_record", { recordId: crypto.randomUUID(), reason: "None", initialBbl: 5, actuals: [], confirmEmpty: true }, ctx))
      .rejects.toThrow();
    expect(await baseline(split.batchId)).toBe(8);
  });

  it("stays out of the recipe's batch actuals, open and completed, and completes on its transfer in", async () => {
    expect(await outcomes()).toEqual(expect.arrayContaining([sourceBatchId, ordinaryBatchId]));
    expect(await outcomes()).not.toContain(split.batchId);

    const preview = await runCommand("get_batch_completion_preview", { batchId: split.batchId }, ctx) as Preview;
    expect(Number(preview.baselineBbl)).toBe(8);
    expect(Number(preview.inTankBbl)).toBe(8);
    const done = await runCommand("complete_batch", { batchId: split.batchId, confirmInTankBbl: 8 }, ctx) as { closedAt: string | null; baselineBbl: number | string };
    expect(done.closedAt).not.toBeNull();
    expect(Number(done.baselineBbl)).toBe(8);

    expect(await outcomes()).toEqual(expect.arrayContaining([sourceBatchId, ordinaryBatchId]));
    expect(await outcomes()).not.toContain(split.batchId);
    const closed = await runCommand("get_brew_day", { batchId: split.batchId }, ctx) as BrewDay & { writeOffBbl: number | null; packagedBbl: number | null };
    expect(closed).toMatchObject({ occupancy: null, writeOffBbl: 8, packagedBbl: 0 });
    const history = await runCommand("list_batch_history", { status: "completed" }, ctx) as { rows: BatchListRow[] };
    expect(batchesFromQuery(history.rows, []).completed!.map(batch => batch.key)).toContain(split.batchId);
  });
});

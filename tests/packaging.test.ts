// tests/packaging.test.ts — a packaging run is planned against a *brand*, not
// a tank: brewers decide "600 cans of Stout on Friday" long before they know
// which fermenter it comes out of. So `packaging_runs.occupancy_id` is
// nullable, `brand_id` is not, and a check constraint stops a run from
// starting until a tank is picked. When one is picked, a trigger refuses a
// tank whose batch is already promised to a different brand — a batch with no
// intended brand yet is fair game. `product_volume_requirements` reads the
// open runs as demand and the unbrewed/in-tank batches as supply, so the
// brewhouse can see what still has to be brewed.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let stout: { brandId: string; skuId: string };
let pils: { brandId: string; skuId: string };

// A fermenter with `bbl` of beer in it, carrying a batch that intends `brand`
// (null for a batch that has not been promised to anything yet). Returns the
// occupancy id — the handle every packaging run points at once it starts.
async function brewInto(vesselName: string, brand: string | null, bbl: number, on: string) {
  const vessel = (await runCommand("upsert_vessel",
    { name: vesselName, kind: "fermenter", capacityBbl: 60 }, ctx)) as { id: string };
  const batch = (await runCommand("schedule_batch",
    { plannedOn: on, plannedBbl: bbl, ...(brand ? { intendedBrandId: brand } : {}) }, ctx)) as { id: string };
  const day = (await runCommand("record_brew_day",
    { batchId: batch.id, vesselId: vessel.id, initialBbl: bbl, brewedOn: on }, ctx)) as {
      occupancy: { id: string };
    };
  return { occupancyId: day.occupancy.id, batchId: batch.id, vesselId: vessel.id };
}

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "brewer");
  stout = await seedCatalog(b.id, { product: "Stout", sku: "Stout case", bblPerUnit: 0.0645 });
  pils = await seedCatalog(b.id, { product: "Pils", sku: "Pils case", bblPerUnit: 0.0645 });
});

describe("planning a packaging run before a tank exists", () => {
  it("schedules a run with a brand and no occupancy, and lists it with no vessel", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-20",
      outputs: [{ skuId: stout.skuId, qtyPlanned: 400 }],
    }, ctx)) as { id: string; occupancy_id: string | null; brand_id: string };
    expect(run.occupancy_id).toBeNull();
    expect(run.brand_id).toBe(stout.brandId);

    const listed = (await runCommand("list_packaging_runs", {}, ctx)) as {
      id: string; brand_name: string; vessel_name: string | null;
      planned_on: string; started_at: string | null; closed_at: string | null; qty_planned: number;
    }[];
    expect(listed.find((r) => r.id === run.id)).toMatchObject({
      brand_name: "Stout", vessel_name: null, planned_on: "2026-11-20",
      started_at: null, closed_at: null, qty_planned: 400,
    });

    const got = (await runCommand("get_packaging_run", { runId: run.id }, ctx)) as {
      run: { id: string; brand_name: string };
      outputs: { sku_id: string; sku_name: string; qty_planned: number }[];
    };
    expect(got.run).toMatchObject({ id: run.id, brand_name: "Stout" });
    expect(got.outputs).toEqual([
      expect.objectContaining({ sku_id: stout.skuId, sku_name: "Stout case", qty_planned: 400 }),
    ]);
  });

  it("schedules a run with no outputs at all — the tank and the counts can come later", async () => {
    const run = (await runCommand("schedule_packaging_run",
      { brandId: pils.brandId, plannedOn: "2026-11-21", outputs: [] }, ctx)) as { id: string };
    const got = (await runCommand("get_packaging_run", { runId: run.id }, ctx)) as { outputs: unknown[] };
    expect(got.outputs).toEqual([]);
  });

  it("refuses the same package listed twice instead of leaking a constraint name", async () => {
    await expect(runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-29",
      outputs: [{ skuId: stout.skuId, qtyPlanned: 10 }, { skuId: stout.skuId, qtyPlanned: 5 }],
    }, ctx)).rejects.toThrow(/listed twice; give it one line with the total/);
  });

  it("refuses an output whose sku belongs to another brand", async () => {
    await expect(runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-22",
      outputs: [{ skuId: pils.skuId, qtyPlanned: 10 }],
    }, ctx)).rejects.toThrow(/brand/i);
  });
});

describe("picking the tank", () => {
  it("refuses to start a run that has no tank, then starts once one is picked", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-23",
      outputs: [{ skuId: stout.skuId, qtyPlanned: 100 }],
    }, ctx)) as { id: string };

    await expect(runCommand("update_packaging_run",
      { runId: run.id, startedAt: "2026-11-23T14:00:00Z" }, ctx)).rejects.toThrow(/tank|occupancy/i);

    const { occupancyId } = await brewInto("FV-STOUT", stout.brandId, 20, "2026-11-01");
    const started = (await runCommand("update_packaging_run", {
      runId: run.id, occupancyId, startedAt: "2026-11-23T14:00:00Z",
    }, ctx)) as { occupancy_id: string; started_at: string };
    expect(started.occupancy_id).toBe(occupancyId);
    expect(started.started_at).toBeTruthy();

    const listed = (await runCommand("list_packaging_runs", {}, ctx)) as
      { id: string; vessel_name: string | null }[];
    expect(listed.find((r) => r.id === run.id)?.vessel_name).toBe("FV-STOUT");
  });

  it("checks the brand on the way in too, not only on a later update", async () => {
    // Every other test attaches the tank by update; this one hands it to
    // schedule_packaging_run, which is the trigger's insert path.
    const mismatch = await brewInto("FV-PILS-IN", pils.brandId, 12, "2026-11-05");
    await expect(runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-27",
      occupancyId: mismatch.occupancyId, outputs: [],
    }, ctx)).rejects.toThrow(/does not match the tank's batch brand/);

    const match = await brewInto("FV-STOUT-IN", stout.brandId, 12, "2026-11-06");
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-27",
      occupancyId: match.occupancyId, outputs: [{ skuId: stout.skuId, qtyPlanned: 30 }],
    }, ctx)) as { id: string; occupancy_id: string };
    expect(run.occupancy_id).toBe(match.occupancyId);
  });

  it("refuses to start a run whose picked tank has since been emptied", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-28", outputs: [],
    }, ctx)) as { id: string };
    const { occupancyId } = await brewInto("FV-GONE", stout.brandId, 8, "2026-11-07");
    await runCommand("update_packaging_run", { runId: run.id, occupancyId }, ctx);

    // The tank is emptied after the run picked it. Neither the trigger (which
    // fires only when occupancy_id is written) nor the check constraint (which
    // only asks that it be non-null) would notice.
    // ended_at = started_at, not now(): the brew day is dated ahead of today,
    // and the occupancy's tstzrange rejects an end below its own start.
    sql(`update vessel_occupancies set ended_at = started_at where id = '${occupancyId}'`, true);

    await expect(runCommand("update_packaging_run",
      { runId: run.id, startedAt: "2026-11-28T14:00:00Z" }, ctx)).rejects.toThrow(/occupancy is closed/);
  });

  it("refuses a tank whose batch is promised to a different brand", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-24", outputs: [],
    }, ctx)) as { id: string };
    const { occupancyId } = await brewInto("FV-PILS", pils.brandId, 20, "2026-11-02");

    await expect(runCommand("update_packaging_run", { runId: run.id, occupancyId }, ctx))
      .rejects.toThrow(/does not match the tank's batch brand/);
  });

  it("accepts a tank whose batch has no intended brand yet, and never writes that brand back", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: pils.brandId, plannedOn: "2026-11-25", outputs: [],
    }, ctx)) as { id: string };
    const { occupancyId, batchId } = await brewInto("FV-BLANK", null, 15, "2026-11-03");

    const updated = (await runCommand("update_packaging_run", { runId: run.id, occupancyId }, ctx)) as
      { occupancy_id: string };
    expect(updated.occupancy_id).toBe(occupancyId);

    // The run naming a brand must not retro-brand the batch: identity stays
    // where the brewer put it (or did not).
    const batch = await admin.from("batches").select("intended_brand_id").eq("id", batchId).single();
    expect(batch.data?.intended_brand_id).toBeNull();
  });

  it("replaces the outputs of a run that has not started, and refuses any edit after close", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-26",
      outputs: [{ skuId: stout.skuId, qtyPlanned: 50 }],
    }, ctx)) as { id: string };

    await runCommand("update_packaging_run",
      { runId: run.id, outputs: [{ skuId: stout.skuId, qtyPlanned: 75 }] }, ctx);
    const got = (await runCommand("get_packaging_run", { runId: run.id }, ctx)) as
      { outputs: { qty_planned: number }[] };
    expect(got.outputs).toEqual([expect.objectContaining({ qty_planned: 75 })]);

    // Closing needs a tank (the check constraint), so pick one, then close.
    const { occupancyId } = await brewInto("FV-STOUT-2", stout.brandId, 10, "2026-11-04");
    await runCommand("update_packaging_run", { runId: run.id, occupancyId }, ctx);
    const closed = await admin.from("packaging_runs")
      .update({ closed_at: "2026-11-26T20:00:00Z" }).eq("id", run.id).select("closed_at").single();
    expect(closed.data?.closed_at).toBeTruthy();

    await expect(runCommand("update_packaging_run",
      { runId: run.id, outputs: [] }, ctx)).rejects.toThrow(/closed/);
  });
});

describe("what the brewhouse still has to brew", () => {
  it("lists open occupancies and reports demand, supply and the gap per brand", async () => {
    const fresh = await makeBrewery();
    const freshCtx = await makeStaffCtx(fresh.id, "brewer");
    const cat = await seedCatalog(fresh.id, { product: "Amber", sku: "Amber case", bblPerUnit: 0.5 });

    // Demand: 100 units × 0.5 bbl = 50 bbl, on an open run planned today.
    const today = new Date().toISOString().slice(0, 10);
    await runCommand("schedule_packaging_run", {
      brandId: cat.brandId, plannedOn: today, outputs: [{ skuId: cat.skuId, qtyPlanned: 100 }],
    }, freshCtx);

    // Supply: one unbrewed batch of 20 bbl promised to Amber.
    await runCommand("schedule_batch",
      { plannedOn: today, plannedBbl: 20, intendedBrandId: cat.brandId }, freshCtx);

    const rows = sql(
      `select round(demand_bbl,3), round(supply_bbl,3), round(brew_bbl,3)
       from product_volume_requirements where brand_id = '${cat.brandId}'`,
      true,
    );
    expect(rows.map((r) => r.split("|").map((c) => c.trim()))).toEqual([["50.000", "20.000", "30.000"]]);

    // In-tank beer counts as supply too, through its batch's brand.
    const vessel = (await runCommand("upsert_vessel",
      { name: "FV-AMBER", kind: "fermenter", capacityBbl: 60 }, freshCtx)) as { id: string };
    const batch = (await runCommand("schedule_batch",
      { plannedOn: today, plannedBbl: 25, intendedBrandId: cat.brandId }, freshCtx)) as { id: string };
    await runCommand("record_brew_day",
      { batchId: batch.id, vesselId: vessel.id, initialBbl: 25, brewedOn: today }, freshCtx);

    const after = sql(
      `select round(supply_bbl,3), round(brew_bbl,3)
       from product_volume_requirements where brand_id = '${cat.brandId}'`,
      true,
    );
    // 20 unbrewed + 25 in the tank = 45; demand 50 leaves 5 to brew.
    expect(after.map((r) => r.split("|").map((c) => c.trim()))).toEqual([["45.000", "5.000"]]);

    const occs = (await runCommand("list_occupancies", {}, freshCtx)) as {
      occupancy_id: string; vessel_name: string; batch_no: number;
      brand_name: string | null; bbl: number;
    }[];
    expect(occs).toEqual([expect.objectContaining({ vessel_name: "FV-AMBER", brand_name: "Amber", bbl: 25 })]);
  });
});

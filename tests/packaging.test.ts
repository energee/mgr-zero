// tests/packaging.test.ts — a packaging run is planned against a *brand*, not
// a tank: brewers decide "600 cans of Stout on Friday" long before they know
// which fermenter it comes out of. So `packaging_runs.occupancy_id` is
// nullable, `brand_id` is not, and a check constraint stops a run from
// starting until a tank is picked. When one is picked, a trigger refuses a
// tank whose batch is already promised to a different brand — a batch with no
// intended brand yet is fair game. `product_volume_requirements` reads the
// open runs as demand and the unbrewed/in-tank batches as supply, so the
// brewhouse can see what still has to be brewed.
//
// Also here: `record_repack`, repacking finished goods — breaking a composed
// format (a case) into the atomic one it is made of (six four-packs). The two
// FG ledger rows share one `ref` and must net to zero volume, so a repack can
// never invent or destroy beer; the parent format's BOM decides what happens
// to the packaging material that came off (a tray returns to stock, glue is
// consumed). One level only — `format_components` is one deep by design, and
// the call only ever breaks down: the components lookup is directional.
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { admin, DB, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedMaterial, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let stout: { brandId: string; skuId: string; formatId: string };
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

let repackLocationId: string;
let repackBinId: string;
let caseSkuId: string;
let fourPackSkuId: string;
let looseSkuId: string;
let trayId: string;
let caseFormatId: string;

const FOUR_PACK_BBL = 0.0645;
const PER_CASE = 6;

const insert = async (table: string, row: Record<string, unknown>) => (await ins(table, row)).id;

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "brewer");
  stout = await seedCatalog(b.id, { product: "Stout", sku: "Stout case", bblPerUnit: 0.0645 });
  pils = await seedCatalog(b.id, { product: "Pils", sku: "Pils case", bblPerUnit: 0.0645 });

  // Fixtures for record_repack: a warehouse role can write inventory
  // movements, so a second ctx is used for those calls below.
  const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
  ({ id: repackLocationId, binId: repackBinId } = await seedLocation(b.id, { name: "Repack warehouse" }));

  const repackBrandId = await insert("brands", { brewery_id: b.id, name: "Repack IPA" });
  // The atomic child carries the typed volume; the composed parent derives it.
  const fourPackFormatId = await insert("formats", {
    brewery_id: b.id, name: "4-pack 16oz", basis: "packaged", package_type: "can", bbl_per_unit: FOUR_PACK_BBL,
  });
  caseFormatId = await insert("formats", {
    brewery_id: b.id, name: "case of 6 4-packs", basis: "packaged", package_type: "can",
  });
  const { error: ce } = await admin.from("format_components").insert({
    brewery_id: b.id, parent_format_id: caseFormatId, child_format_id: fourPackFormatId, qty: PER_CASE,
  });
  if (ce) throw ce;

  caseSkuId = await insert("skus", { brewery_id: b.id, brand_id: repackBrandId, format_id: caseFormatId, name: "Repack IPA case" });
  fourPackSkuId = await insert("skus", { brewery_id: b.id, brand_id: repackBrandId, format_id: fourPackFormatId, name: "Repack IPA 4-pack" });

  // An unrelated packaged format under the same brand: not a component of the case.
  const looseFormatId = await insert("formats", {
    brewery_id: b.id, name: "single 16oz", basis: "packaged", package_type: "can", bbl_per_unit: FOUR_PACK_BBL / 4,
  });
  looseSkuId = await insert("skus", { brewery_id: b.id, brand_id: repackBrandId, format_id: looseFormatId, name: "Repack IPA single" });

  // The tray comes off whole when the case is broken, so it goes back on the shelf.
  trayId = await seedMaterial(b.id, { name: "case tray", category: "packaging", uom: "each" });
  const { error: be } = await admin.from("format_bom").insert({
    brewery_id: b.id, format_id: caseFormatId, material_id: trayId, qty_per_unit: 1, on_break: "return_to_stock",
  });
  if (be) throw be;

  await runCommand("record_movement", {
    skuId: caseSkuId, locationId: repackLocationId, binId: repackBinId, qty: 10, type: "opening_balance",
  }, warehouseCtx);
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

// Closing is the moment beer becomes stock: one lot, one production_in
// movement per package actually filled, the packaging materials consumed off
// the shelf, and bbl_drawn subtracted from the tank by `occupancy_volumes`.
// Vessels have no location, so the close names the location and bin the
// finished goods land in — the movements have to go somewhere real.
describe("closing the run", () => {
  let wh: { id: string; binId: string };
  let kegSkuId: string;
  let tray: string;
  let lid: string;

  const material = (name: string, lotTracked = false) =>
    seedMaterial(b.id, { name, category: "packaging", uom: "each", lotTracked });

  beforeAll(async () => {
    const adminCtx = await makeStaffCtx(b.id, "admin");
    wh = await seedLocation(b.id, { name: "Packaging WH" });
    // A second package of the same brand, on its own format with no BOM, so a
    // planned-but-unfilled line has something to be.
    const kegFormat = (await runCommand("upsert_format", {
      name: "½ bbl keg", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5,
    }, adminCtx)) as { id: string };
    kegSkuId = ((await runCommand("create_sku",
      { brandId: stout.brandId, formatId: kegFormat.id, name: "Stout keg" }, adminCtx)) as { id: string }).id;
    tray = await material("Case tray");
    lid = await material("Can lid");
    await runCommand("replace_format_bom", {
      formatId: stout.formatId,
      lines: [{ materialId: tray, qtyPerUnit: 1 }, { materialId: lid, qtyPerUnit: 24 }],
    }, adminCtx);
  });

  // A run standing in a tank with `bbl` in it, started and ready to close.
  async function startedRun(vessel: string, bbl: number, plannedOn: string, on = "2026-11-10") {
    const { occupancyId } = await brewInto(vessel, stout.brandId, bbl, on);
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn, occupancyId,
      outputs: [{ skuId: stout.skuId, qtyPlanned: 400 }, { skuId: kegSkuId, qtyPlanned: 10 }],
    }, ctx)) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: `${plannedOn}T14:00:00Z` }, ctx);
    return { runId: run.id, occupancyId };
  }

  it("keeps closed yield and consumed materials frozen after a format correction", async () => {
    const catalog = await seedCatalog(b.id, { product: "Correction", sku: "Correction case", bblPerUnit: 0.1 });
    const editor = await makeStaffCtx(b.id, "admin");
    const { occupancyId } = await brewInto("FV-CORRECTION", catalog.brandId, 10, "2026-11-10");
    const run = await runCommand("schedule_packaging_run", { brandId: catalog.brandId, plannedOn: "2026-12-01", occupancyId, outputs: [{ skuId: catalog.skuId, qtyPlanned: 10 }] }, ctx) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-12-01T14:00:00Z" }, ctx);
    await runCommand("replace_format_bom", { formatId: catalog.formatId, lines: [{ materialId: tray, qtyPerUnit: 1 }] }, editor);
    await runCommand("close_packaging_run", { runId: run.id, bblDrawn: 2, outputs: [{ skuId: catalog.skuId, qtyActual: 10 }], lotCode: "CORRECTION", packagedOn: "2026-12-01", locationId: wh.id, binId: wh.binId }, ctx);
    const yieldBefore = await admin.from("packaging_run_yields").select("*").eq("run_id", run.id).single();
    expect(yieldBefore.data).toMatchObject({ bbl_packaged: 1, loss_bbl: 1 });
    const links = await ctx.db.from("packaging_run_consumptions").select("movement_id").eq("run_id", run.id);
    expect(links.error).toBeNull();
    const movementIds = links.data!.map(row => row.movement_id);
    const materialsBefore = await ctx.db.from("material_movements").select("id,qty").in("id", movementIds);
    expect(materialsBefore.error).toBeNull();
    expect(materialsBefore.data).toHaveLength(1);
    expect(Number(materialsBefore.data![0].qty)).toBe(-10);
    await runCommand("upsert_format", { id: catalog.formatId, name: "Corrected case", basis: "packaged", packageType: "can", bblPerUnit: 0.2 }, editor);
    await runCommand("replace_format_bom", { formatId: catalog.formatId, lines: [{ materialId: tray, qtyPerUnit: 2 }] }, editor);
    expect((await admin.from("packaging_run_yields").select("*").eq("run_id", run.id).single()).data).toEqual(yieldBefore.data);
    expect((await ctx.db.from("material_movements").select("id,qty").in("id", movementIds)).data).toEqual(materialsBefore.data);
    const next = await runCommand("record_movement", { skuId: catalog.skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, editor) as { bbl: number };
    expect(Number(next.bbl)).toBe(2);
  });

  it("writes the lot, a production_in per package filled, the BOM consumptions, and draws the tank down", async () => {
    const { runId, occupancyId } = await startedRun("FV-CLOSE", 30, "2026-12-01");

    const closed = (await runCommand("close_packaging_run", {
      runId, bblDrawn: 25, outputs: [{ skuId: stout.skuId, qtyActual: 396 }],
      lotCode: "L2026-336", packagedOn: "2026-12-01", bestBy: "2027-06-01",
      locationId: wh.id, binId: wh.binId,
    }, ctx)) as { closed_at: string; bbl_drawn: string };
    expect(closed.closed_at).toBeTruthy();
    expect(Number(closed.bbl_drawn)).toBe(25);

    const lot = (await admin.from("lots").select("id, code, brand_id, packaged_on, best_by")
      .eq("packaging_run_id", runId).single()).data!;
    expect(lot).toMatchObject({
      code: "L2026-336", brand_id: stout.brandId, packaged_on: "2026-12-01", best_by: "2027-06-01",
    });

    const moves = (await admin.from("inventory_movements")
      .select("id, sku_id, qty, type, lot_id, location_id, bin_id, ref").eq("ref", runId)).data!;
    expect(moves).toEqual([expect.objectContaining({
      sku_id: stout.skuId, type: "production_in", lot_id: lot.id,
      location_id: wh.id, bin_id: wh.binId,
    })]);
    expect(Number(moves[0].qty)).toBe(396);

    // The filled line carries its movement; the planned-but-unfilled keg line
    // is settled at zero rather than left ambiguous.
    const outs = (await admin.from("packaging_run_outputs")
      .select("sku_id, qty_actual, movement_id").eq("run_id", runId)).data!;
    const bySku = new Map(outs.map((o) => [o.sku_id as string, o]));
    expect(Number(bySku.get(stout.skuId)!.qty_actual)).toBe(396);
    expect(bySku.get(stout.skuId)!.movement_id).toBe(moves[0].id);
    expect(Number(bySku.get(kegSkuId)!.qty_actual)).toBe(0);
    expect(bySku.get(kegSkuId)!.movement_id).toBeNull();

    const cons = (await admin.from("packaging_run_consumptions").select("movement_id").eq("run_id", runId)).data!;
    expect(cons).toHaveLength(2);
    const mm = (await admin.from("material_movements")
      .select("material_id, qty, type, location_id, bin_id")
      .in("id", cons.map((c) => c.movement_id))).data!;
    expect(mm.every((m) => m.type === "consumption" && m.location_id === wh.id && m.bin_id === wh.binId)).toBe(true);
    const qtyByMaterial = new Map(mm.map((m) => [m.material_id as string, Number(m.qty)]));
    expect(qtyByMaterial.get(tray)).toBe(-396);
    expect(qtyByMaterial.get(lid)).toBe(-396 * 24);

    const [vol] = sql(`select round(bbl,3) from occupancy_volumes where occupancy_id = '${occupancyId}'`, true);
    expect(vol.trim()).toBe("5.000");
  });

  it("refuses a second close, an unknown package, and more beer than the tank holds", async () => {
    const { runId } = await startedRun("FV-CLOSE-2", 20, "2026-12-02");
    const close = (over: Record<string, unknown> = {}) => runCommand("close_packaging_run", {
      runId, bblDrawn: 10, outputs: [{ skuId: stout.skuId, qtyActual: 100 }],
      lotCode: `L-${Math.random().toString(36).slice(2, 8)}`, packagedOn: "2026-12-02",
      locationId: wh.id, binId: wh.binId, ...over,
    }, ctx);

    await expect(close({ outputs: [{ skuId: pils.skuId, qtyActual: 1 }] }))
      .rejects.toThrow(/not one of this run's planned outputs/);
    await expect(close({ bblDrawn: 20.5 })).rejects.toThrow(/more than the tank holds|only .* bbl/i);

    await close();
    await expect(close()).rejects.toThrow(/closed/);
  });

  it("refuses to close a run with no tank, or one that never started", async () => {
    const noTank = (await runCommand("schedule_packaging_run",
      { brandId: stout.brandId, plannedOn: "2026-12-03", outputs: [] }, ctx)) as { id: string };
    const args = {
      bblDrawn: 1, outputs: [], lotCode: "L-notank", packagedOn: "2026-12-03",
      locationId: wh.id, binId: wh.binId,
    };
    await expect(runCommand("close_packaging_run", { runId: noTank.id, ...args }, ctx))
      .rejects.toThrow(/tank|occupancy/i);

    const { occupancyId } = await brewInto("FV-NOSTART", stout.brandId, 10, "2026-11-11");
    const unstarted = (await runCommand("schedule_packaging_run",
      { brandId: stout.brandId, plannedOn: "2026-12-04", occupancyId, outputs: [] }, ctx)) as { id: string };
    await expect(runCommand("close_packaging_run",
      { runId: unstarted.id, ...args, lotCode: "L-nostart", packagedOn: "2026-12-04" }, ctx))
      .rejects.toThrow(/start the run before closing it/);
  });

  it("refuses a BOM line whose material is lot-tracked rather than inventing a lot", async () => {
    const adminCtx = await makeStaffCtx(b.id, "admin");
    const yeast = await material("Tracked crown", true);
    const fmt = (await runCommand("upsert_format", {
      name: "tracked can", basis: "packaged", packageType: "can", bblPerUnit: 0.0645,
    }, adminCtx)) as { id: string };
    await runCommand("replace_format_bom",
      { formatId: fmt.id, lines: [{ materialId: yeast, qtyPerUnit: 1 }] }, adminCtx);
    const sku = (await runCommand("create_sku",
      { brandId: stout.brandId, formatId: fmt.id, name: "Stout tracked" }, adminCtx)) as { id: string };

    const { occupancyId } = await brewInto("FV-TRACKED", stout.brandId, 10, "2026-11-12");
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-12-05", occupancyId,
      outputs: [{ skuId: sku.id, qtyPlanned: 50 }],
    }, ctx)) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-12-05T14:00:00Z" }, ctx);

    await expect(runCommand("close_packaging_run", {
      runId: run.id, bblDrawn: 3, outputs: [{ skuId: sku.id, qtyActual: 50 }],
      lotCode: "L-tracked", packagedOn: "2026-12-05", locationId: wh.id, binId: wh.binId,
    }, ctx)).rejects.toThrow(/cannot post BOM for lot-tracked material "Tracked crown" yet/);
  });

  it("explains an emptied tank instead of blaming the volume", async () => {
    // A brewer who racks the heel out before closing the paperwork ends the
    // occupancy, and the run is left pointing at a tank that no longer exists.
    // The over-draw check would refuse any real draw anyway, but it would talk
    // about barrels; this says what actually happened and in what order the two
    // steps belong.
    const { runId, occupancyId } = await startedRun("FV-EMPTIED", 12, "2026-12-06");
    const brite = (await runCommand("upsert_vessel",
      { name: "BT-EMPTIED", kind: "brite", capacityBbl: 60 }, ctx)) as { id: string };
    await runCommand("record_cellar_transfer",
      { fromOccupancyId: occupancyId, toVesselId: brite.id, volumeBbl: 12 }, ctx);

    const ended = await admin.from("vessel_occupancies").select("ended_at").eq("id", occupancyId).single();
    expect(ended.data?.ended_at).toBeTruthy();

    await expect(runCommand("close_packaging_run", {
      runId, bblDrawn: 0, outputs: [], lotCode: "L-emptied", packagedOn: "2026-12-06",
      locationId: wh.id, binId: wh.binId,
    }, ctx)).rejects.toThrow(/the tank was emptied before this run closed; close runs before transferring the heel out/);
  });

  it("refuses the same package listed twice, leaving the run open and lotless", async () => {
    const { runId } = await startedRun("FV-DUPE", 20, "2026-12-07");
    await expect(runCommand("close_packaging_run", {
      runId, bblDrawn: 5,
      outputs: [{ skuId: stout.skuId, qtyActual: 100 }, { skuId: stout.skuId, qtyActual: 50 }],
      lotCode: "L-dupe", packagedOn: "2026-12-07", locationId: wh.id, binId: wh.binId,
    }, ctx)).rejects.toThrow(/listed twice; give it one line with the total/);

    // The whole close is one transaction: nothing of it may survive the refusal.
    const run = (await admin.from("packaging_runs").select("closed_at, bbl_drawn").eq("id", runId).single()).data!;
    expect(run.closed_at).toBeNull();
    expect(run.bbl_drawn).toBeNull();
    expect((await admin.from("lots").select("id").eq("packaging_run_id", runId)).data).toEqual([]);
  });

  it("names a lot code that is already used rather than leaking the unique constraint", async () => {
    const first = await startedRun("FV-LOT-1", 20, "2026-12-08");
    await runCommand("close_packaging_run", {
      runId: first.runId, bblDrawn: 5, outputs: [{ skuId: stout.skuId, qtyActual: 10 }],
      lotCode: "L-taken", packagedOn: "2026-12-08", locationId: wh.id, binId: wh.binId,
    }, ctx);

    const second = await startedRun("FV-LOT-2", 20, "2026-12-09");
    await expect(runCommand("close_packaging_run", {
      runId: second.runId, bblDrawn: 5, outputs: [{ skuId: stout.skuId, qtyActual: 10 }],
      lotCode: "L-taken", packagedOn: "2026-12-09", locationId: wh.id, binId: wh.binId,
    }, ctx)).rejects.toThrow(/lot code "L-taken" is already used/);
  });
});

describe("record_repack", () => {
  it("breaks one case into six four-packs, volume-neutral, and returns the tray to stock", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    await runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: PER_CASE,
    }, warehouseCtx);

    const { data: moves, error } = await admin.from("inventory_movements")
      .select("sku_id, qty, bbl, type, ref").eq("brewery_id", b.id).eq("type", "repack");
    if (error) throw error;
    expect(moves).toHaveLength(2);
    const refs = new Set((moves as { ref: string }[]).map((m) => m.ref));
    expect(refs.size).toBe(1);
    expect([...refs][0]).toBeTruthy();

    const rows = moves as { sku_id: string; qty: number; bbl: number }[];
    const parent = rows.find((m) => m.sku_id === caseSkuId)!;
    const child = rows.find((m) => m.sku_id === fourPackSkuId)!;
    expect(Number(parent.qty)).toBe(-1);
    expect(Number(child.qty)).toBe(PER_CASE);
    expect(Math.abs(Number(parent.bbl) + Number(child.bbl))).toBeLessThan(0.000001);

    const { data: mats, error: me } = await admin.from("material_movements")
      .select("material_id, qty, type, location_id, bin_id").eq("brewery_id", b.id).eq("material_id", trayId);
    if (me) throw me;
    expect(mats).toEqual([
      { material_id: trayId, qty: 1, type: "return_to_stock", location_id: repackLocationId, bin_id: repackBinId },
    ]);
  });

  it("consumes a BOM material marked consumed on break", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    // Glue is destroyed when the case is opened; the tray is not. Same call,
    // opposite signs, so on_break is what decides the direction.
    const glueId = await insert("materials", {
      brewery_id: b.id, name: "case glue", category: "packaging", base_uom: "each", purchase_uom: "each",
    });
    const { error } = await admin.from("format_bom").insert({
      brewery_id: b.id, format_id: caseFormatId, material_id: glueId, qty_per_unit: 2, on_break: "consumed",
    });
    if (error) throw error;

    await runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: PER_CASE,
    }, warehouseCtx);

    const { data, error: me } = await admin.from("material_movements")
      .select("qty, type").eq("brewery_id", b.id).eq("material_id", glueId);
    if (me) throw me;
    expect(data).toEqual([{ qty: -2, type: "consumption" }]);
  });

  it("refuses, by name, a BOM material that is lot-tracked", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    // enforce_material_lot demands a lot_id on a consumption/return_to_stock
    // row, and a repack has nowhere to name a lot; the impl must say so up
    // front instead of failing deep in the trigger with a bare uuid.
    const shrinkId = await insert("materials", {
      brewery_id: b.id, name: "shrink wrap", category: "packaging", base_uom: "each",
      purchase_uom: "each", lot_tracked: true,
    });
    const { error } = await admin.from("format_bom").insert({
      brewery_id: b.id, format_id: caseFormatId, material_id: shrinkId, qty_per_unit: 1, on_break: "consumed",
    });
    if (error) throw error;

    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: PER_CASE,
    }, warehouseCtx)).rejects.toThrow(/lot-tracked material "shrink wrap"/);

    // Nothing was written: the refusal comes before the FG rows.
    const { count } = await admin.from("inventory_movements")
      .select("id", { count: "exact", head: true }).eq("brewery_id", b.id).eq("type", "repack");
    expect(count).toBe(4);

    await admin.from("format_bom").delete().eq("format_id", caseFormatId).eq("material_id", shrinkId);
  });

  it("rejects a child quantity that is not parentQty × the component quantity", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: 5,
    }, warehouseCtx)).rejects.toThrow(/volume-neutral|expected 6/i);
  });

  it("rejects a pair of SKUs whose formats are not one-level components", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: looseSkuId, childQty: PER_CASE,
    }, warehouseCtx)).rejects.toThrow(/not a component/i);
  });

  it("rejects a repack the bin does not have the stock for", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 999,
      childSkuId: fourPackSkuId, childQty: 999 * PER_CASE,
    }, warehouseCtx)).rejects.toThrow(/on hand/i);
  });

  it("waits for a concurrent reversal before reading stock, then rolls back the losing repack", async () => {
    const brewery = await makeBrewery();
    const warehouse = await makeStaffCtx(brewery.id, "warehouse");
    const location = await seedLocation(brewery.id, { name: "Concurrent repack" });
    const brand = await insert("brands", { brewery_id: brewery.id, name: `Concurrent ${crypto.randomUUID()}` });
    const childFormat = await insert("formats", { brewery_id: brewery.id, name: `Child ${crypto.randomUUID()}`, basis: "packaged", package_type: "can", bbl_per_unit: .01 });
    const parentFormat = await insert("formats", { brewery_id: brewery.id, name: `Parent ${crypto.randomUUID()}`, basis: "packaged", package_type: "can" });
    await ins("format_components", { brewery_id: brewery.id, parent_format_id: parentFormat, child_format_id: childFormat, qty: 5 });
    const material = await seedMaterial(brewery.id, { name: "Concurrent tray", category: "packaging", uom: "each" });
    await ins("format_bom", { brewery_id: brewery.id, format_id: parentFormat, material_id: material, qty_per_unit: 1, on_break: "return_to_stock" });
    const parentSku = await insert("skus", { brewery_id: brewery.id, brand_id: brand, format_id: parentFormat, name: "Concurrent parent" });
    const childSku = await insert("skus", { brewery_id: brewery.id, brand_id: brand, format_id: childFormat, name: "Concurrent child" });
    const original = await runCommand("record_movement", { skuId: parentSku, locationId: location.id, binId: location.binId, qty: 1, type: "adjustment" }, warehouse) as { id: string };
    const winnerRequest = crypto.randomUUID(), loserRequest = crypto.randomUUID();
    const a = new Client({ connectionString: DB }), b = new Client({ connectionString: DB });
    let pending: Promise<unknown> | undefined;
    try {
      await Promise.all([a.connect(), b.connect()]);
      await a.query("begin");
      await a.query("lock table public.inventory_movements in share row exclusive mode");
      await b.query("select set_config('request.jwt.claim.sub',$1,false)", [warehouse.userId]);
      await b.query("set role authenticated");
      const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
      pending = b.query("select public.record_repack($1,$2,$3,$4,1,$5,5,$6) result",
        [brewery.id, location.id, location.binId, parentSku, childSku, loserRequest]);
      pending.catch(() => {});
      await expect.poll(async () => (await a.query(
        "select wait_event_type from pg_stat_activity where pid=$1 and query like 'select public.record_repack%'", [pid]
      )).rows[0]?.wait_event_type).toBe("Lock");
      await a.query("select set_config('request.jwt.claim.sub',$1,true)", [warehouse.userId]);
      await a.query("set local role authenticated");
      const winner = await a.query("select public.reverse_inventory_movement($1,$2,'Concurrent correction',$3) result",
        [brewery.id, original.id, winnerRequest]);
      await a.query("commit");
      await expect(pending).rejects.toThrow(/only 0(?:\.0+)? on hand/i);
      const replay = await warehouse.db.rpc("reverse_inventory_movement", {
        p_brewery: brewery.id, p_movement: original.id, p_note: "Concurrent correction", p_request_id: winnerRequest,
      });
      expect(replay.error).toBeNull();
      expect(replay.data).toEqual(winner.rows[0].result);
      expect(sql(`select (coalesce(sum(qty),0)=0)::text from inventory_movements where brewery_id='${brewery.id}' and sku_id='${parentSku}' and bin_id='${location.binId}'`)).toEqual(["true"]);
      expect(sql(`select count(*) from inventory_movements where brewery_id='${brewery.id}' and type='repack'`)).toEqual(["0"]);
      expect(sql(`select count(*) from material_movements where brewery_id='${brewery.id}' and note like 'repack %'`)).toEqual(["0"]);
      expect(sql(`select count(*) from private.command_requests where request_id='${loserRequest}'`)).toEqual(["0"]);
    } finally {
      await a.query("rollback").catch(() => {});
      if (pending) await pending.catch(() => {});
      await Promise.allSettled([a.end(), b.end()]);
    }
  });
});

// Tenancy and roles for packaging, mirroring the vessels/batches block in
// tests/production.test.ts. Every id these RPCs take is matched against
// p_brewery, so another brewery's tank or SKU reads as missing (or fails the
// composite FK) rather than being packaged into this brewery's ledger.
describe("packaging refuses other tenants and other roles", () => {
  let other: { id: string };
  let otherCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
  let otherOccupancyId: string;
  let otherSkuId: string;
  let otherBrandId: string;

  const runCount = async () => {
    const { count, error } = await admin.from("packaging_runs")
      .select("id", { count: "exact", head: true }).eq("brewery_id", b.id);
    if (error) throw error;
    return count ?? 0;
  };
  const repackCount = async () => {
    const { count, error } = await admin.from("inventory_movements")
      .select("id", { count: "exact", head: true }).eq("brewery_id", b.id).eq("type", "repack");
    if (error) throw error;
    return count ?? 0;
  };

  beforeAll(async () => {
    other = await makeBrewery();
    otherCtx = await makeStaffCtx(other.id, "brewer");
    const cat = await seedCatalog(other.id, { product: "Their IPA", sku: "Their IPA case" });
    otherBrandId = cat.brandId;
    otherSkuId = cat.skuId;

    const vessel = (await runCommand("upsert_vessel",
      { name: "Their FV", kind: "fermenter", capacityBbl: 40 }, otherCtx)) as { id: string };
    const batch = (await runCommand("schedule_batch",
      { intendedBrandId: otherBrandId, plannedOn: "2026-11-02", plannedBbl: 20 }, otherCtx)) as { id: string };
    otherOccupancyId = ((await runCommand("record_brew_day",
      { batchId: batch.id, vesselId: vessel.id, initialBbl: 20, brewedOn: "2026-11-02" }, otherCtx)) as {
        occupancy: { id: string };
      }).occupancy.id;
  });

  it("refuses another brewery's tank and another brewery's SKU when scheduling", async () => {
    const before = await runCount();

    await expect(runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-03", occupancyId: otherOccupancyId,
      outputs: [{ skuId: stout.skuId, qtyPlanned: 10 }],
    }, ctx)).rejects.toThrow();

    await expect(runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-03",
      outputs: [{ skuId: otherSkuId, qtyPlanned: 10 }],
    }, ctx)).rejects.toThrow();

    await expect(runCommand("schedule_packaging_run", {
      brandId: otherBrandId, plannedOn: "2026-11-03",
      outputs: [{ skuId: stout.skuId, qtyPlanned: 10 }],
    }, ctx)).rejects.toThrow();

    // Nothing was written: each call rolled back whole.
    expect(await runCount()).toBe(before);
  });

  it("refuses another brewery's tank and SKU when revising a run", async () => {
    const run = (await runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-04",
      outputs: [{ skuId: stout.skuId, qtyPlanned: 12 }],
    }, ctx)) as { id: string };

    await expect(runCommand("update_packaging_run",
      { runId: run.id, occupancyId: otherOccupancyId }, ctx)).rejects.toThrow();
    await expect(runCommand("update_packaging_run",
      { runId: run.id, outputs: [{ skuId: otherSkuId, qtyPlanned: 3 }] }, ctx)).rejects.toThrow();

    // The run kept its own plan and never picked up the foreign tank.
    const { data, error } = await admin.from("packaging_runs")
      .select("occupancy_id, packaging_run_outputs(sku_id, qty_planned)").eq("id", run.id).single();
    if (error) throw error;
    expect(data.occupancy_id).toBeNull();
    expect(data.packaging_run_outputs).toEqual([{ sku_id: stout.skuId, qty_planned: 12 }]);

    // The other brewery cannot reach into this run either.
    await expect(runCommand("update_packaging_run",
      { runId: run.id, outputs: [{ skuId: otherSkuId, qtyPlanned: 1 }] }, otherCtx)).rejects.toThrow();
  });

  it("refuses another brewery's SKU in a repack", async () => {
    const warehouseCtx = await makeStaffCtx(b.id, "warehouse");
    const before = await repackCount();

    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: otherSkuId, childQty: PER_CASE,
    }, warehouseCtx)).rejects.toThrow(/sku not found|not a component|brand/i);

    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: otherSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: PER_CASE,
    }, warehouseCtx)).rejects.toThrow(/sku not found|not a component|brand/i);

    expect(await repackCount()).toBe(before);
  });

  it("refuses sales, which packages nothing", async () => {
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("schedule_packaging_run", {
      brandId: stout.brandId, plannedOn: "2026-11-05", outputs: [{ skuId: stout.skuId, qtyPlanned: 5 }],
    }, sales)).rejects.toThrow(/permission denied/);
    await expect(runCommand("close_packaging_run", {
      runId: crypto.randomUUID(), bblDrawn: 1, outputs: [], lotCode: "L-SALES",
      packagedOn: "2026-11-05", locationId: repackLocationId, binId: repackBinId,
    }, sales)).rejects.toThrow(/permission denied/);
    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: PER_CASE,
    }, sales)).rejects.toThrow(/permission denied/);
  });

  // A brewer is not a warehouse hand: repack is a stock-shape change, and the
  // rail hides it from brewers (commit e199de0), so the command must too.
  it("refuses a brewer on repack", async () => {
    await expect(runCommand("record_repack", {
      locationId: repackLocationId, binId: repackBinId, parentSkuId: caseSkuId, parentQty: 1,
      childSkuId: fourPackSkuId, childQty: PER_CASE,
    }, ctx)).rejects.toThrow(/permission denied/);
  });
});

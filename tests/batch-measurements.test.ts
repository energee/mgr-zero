// tests/batch-measurements.test.ts — list_batch_measurements against the real
// schema (docs/plans/derived-assumptions.md, task 1): which batches count (brewed,
// closed, not started from a transfer), the keys each is matched on (grain bill,
// yeast, mash rest), and what it measured. Attenuation needs a last reading at
// least 7 days after brew day; one three days in is not a final gravity.
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, seedMaterial } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { platoToSg } from "@/lib/recipe-gravity";
import type { BatchMeasurement } from "@/lib/mgr/recipe-assumptions";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let owner: Ctx, brewer: Ctx;
let yeasts: string[], vesselNo = 0;
const ids: Record<string, string> = {};
let rows: BatchMeasurement[];

/** 60 lb of malt per barrel at 1.037. */
const POTENTIAL = (60 * 37) / 31;
const efficiency = (ogPlato: number, knockoutBbl: number, plannedBbl: number) => ((platoToSg(ogPlato) - 1) * 1000 * knockoutBbl) / (POTENTIAL * plannedBbl);
const attenuation = (ogPlato: number, fgPlato: number) => (platoToSg(ogPlato) - platoToSg(fgPlato)) / (platoToSg(ogPlato) - 1);
/** A protein rest, then the saccharification rest at 152 °F. */
const MASH = [{ name: "Protein", kind: "infusion", tempF: 122, minutes: 15 }, { name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }];

const schedule = async (recipeVersionId: string, plannedBbl = 10) =>
  ((await runCommand("schedule_batch", { recipeVersionId, plannedOn: "2026-10-02", plannedBbl }, brewer)) as { id: string }).id;
const tank = async () => ((await runCommand("upsert_vessel", { name: `FV ${++vesselNo}`, kind: "fermenter", capacityBbl: 40 }, owner)) as { id: string }).id;
const brew = async (batchId: string, initialBbl: number, brewedOn: string) =>
  ((await runCommand("record_brew_day", { batchId, vesselId: await tank(), initialBbl, brewedOn, actuals: [], confirmEmpty: true }, brewer)) as { occupancy: { id: string } }).occupancy.id;
const reading = (batchId: string, at: string, gravityPlato: number, time = "12:00:00Z") =>
  runCommand("record_fermentation_reading", { batchId, at: `${at}T${time}`, tempF: 66, gravityPlato }, brewer);
const close = (batchId: string, confirmInTankBbl: number) => runCommand("complete_batch", { batchId, confirmInTankBbl }, brewer);
const row = (name: string) => rows.find((r) => r.batchId === ids[name])!;

beforeAll(async () => {
  const { id: breweryId } = await makeBrewery();
  owner = await makeStaffCtx(breweryId, "admin");
  brewer = await makeStaffCtx(breweryId, "brewer");
  await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, owner);
  const malt = await seedMaterial(breweryId, { name: "Measured malt", category: "malt", extractPotential: 1.037 });
  const hop = await seedMaterial(breweryId, { name: "Measured hop", category: "hop", alphaAcid: 12 });
  yeasts = [
    await seedMaterial(breweryId, { name: "Measured ale yeast", category: "yeast", uom: "each" }),
    await seedMaterial(breweryId, { name: "Measured lager yeast", category: "yeast", uom: "each" }),
  ];
  const recipeId = ((await runCommand("create_recipe", { name: "Measured pale" }, brewer)) as { id: string }).id;
  const version = ((await runCommand("create_recipe_version", {
    recipeId, brewhouseEfficiency: 0.75, yeastAttenuation: 0.75, mashSchedule: MASH,
    ingredients: [
      { materialId: malt, perBblQty: 60, stage: "mash" }, { materialId: hop, perBblQty: 1, stage: "boil" },
      { materialId: yeasts[1], perBblQty: 1, stage: "fermentation" }, { materialId: yeasts[0], perBblQty: 1, stage: "fermentation" },
    ],
  }, brewer)) as { id: string }).id;

  // Finished: its last reading is 10 days after brew day.
  ids.finished = await schedule(version, 10);
  await brew(ids.finished, 9, "2026-10-05");
  await reading(ids.finished, "2026-10-05", 14);
  await reading(ids.finished, "2026-10-09", 6);
  await reading(ids.finished, "2026-10-15", 3);
  await close(ids.finished, 9);

  // Closed with its last reading three days in: still fermenting, not a final gravity.
  ids.early = await schedule(version, 10);
  await brew(ids.early, 10, "2026-10-06");
  await reading(ids.early, "2026-10-06", 13);
  await reading(ids.early, "2026-10-09", 6);
  await close(ids.early, 10);

  // Its last reading is the evening of day 6 in the brewery (New York), though already day 7 in UTC.
  ids.evening = await schedule(version, 10);
  await brew(ids.evening, 10, "2026-10-07");
  await reading(ids.evening, "2026-10-07", 14);
  await reading(ids.evening, "2026-10-14", 3, "02:00:00Z");
  await close(ids.evening, 10);

  // Open: brewed and read, never closed.
  ids.open = await schedule(version, 20);
  const openTank = await brew(ids.open, 20, "2026-10-10");
  await reading(ids.open, "2026-10-10", 14);
  await reading(ids.open, "2026-10-20", 3);

  // Started from a transfer out of the open batch, then closed: it was never brewed on its own.
  ids.fromTransfer = await schedule(version, 5);
  await runCommand("record_cellar_transfer", { fromOccupancyId: openTank, toVesselId: await tank(), volumeBbl: 5, lossBbl: 0, toBatchId: ids.fromTransfer }, brewer);
  await close(ids.fromTransfer, 5);

  rows = (await runCommand("list_batch_measurements", {}, brewer)) as BatchMeasurement[];
});

describe("list_batch_measurements", () => {
  it("lists brewed, closed batches, leaving out an open one and one started from a transfer", () => {
    expect(rows.map((r) => r.batchId).sort()).toEqual([ids.early, ids.evening, ids.finished].sort());
  });

  it("measures efficiency from the first reading and attenuation from a last reading a week or more after brew day", () => {
    expect(row("finished")).toMatchObject({ brewedOn: "2026-10-05", mashRestF: 152 });
    expect(row("finished").batchNo).toEqual(expect.any(Number));
    expect(row("finished").brewhouseEfficiency).toBeCloseTo(efficiency(14, 9, 10), 6);
    expect(row("finished").apparentAttenuation).toBeCloseTo(attenuation(14, 3), 6);
  });

  it("counts the seven days on the brewery's calendar, not UTC's", () => {
    expect(row("evening").apparentAttenuation).toBeNull();
  });

  it("gives a batch whose last reading is three days in no attenuation, and keeps its efficiency", () => {
    expect(row("early").apparentAttenuation).toBeNull();
    expect(row("early").brewhouseEfficiency).toBeCloseTo(efficiency(13, 10, 10), 6);
  });

  it("keys both batches on the same grain bill, the copy's yeasts sorted, and its saccharification rest", () => {
    expect(row("finished").gristKey).not.toBe("");
    expect(row("early").gristKey).toBe(row("finished").gristKey);
    expect(row("finished").yeastIds).toEqual([...yeasts].sort());
    expect(row("early").mashRestF).toBe(152);
  });

  it("is for admin and brewer", async () => {
    const warehouse = await makeStaffCtx(owner.breweryId, "warehouse");
    await expect(runCommand("list_batch_measurements", {}, warehouse)).rejects.toMatchObject({ status: 403 });
    await expect(runCommand("list_batch_measurements", {}, owner)).resolves.toHaveLength(3);
  });
});

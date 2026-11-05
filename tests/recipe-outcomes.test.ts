// tests/recipe-outcomes.test.ts — get_recipe_outcomes against the real schema:
// which batches count, where OG, FG and knockout come from, and that each batch
// answers to its own version. Imported history has no open or multi-turn batch,
// so those cases live here. The formulas are pinned in tests/recipe-gravity.test.ts.
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, seedMaterial, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { platoToSg } from "@/lib/recipe-gravity";
import type { RecipeOutcome } from "@/lib/mgr/recipe-view";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let owner: Ctx, brewer: Ctx;
let malt: string, vesselNo = 0;
let recipeId: string, v1: string, v2: string, blockedRecipe: string, blockedVersion: string;
const ids: Record<string, string> = {};
let outcomes: RecipeOutcome[];

/** 60 lb of malt per barrel at 1.037. */
const POTENTIAL = (60 * 37) / 31;
const efficiency = (ogPlato: number, knockoutBbl: number, plannedBbl: number) => ((platoToSg(ogPlato) - 1) * 1000 * knockoutBbl) / (POTENTIAL * plannedBbl);
const MASH = [{ name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }];

const createRecipe = async (name: string) => ((await runCommand("create_recipe", { name }, brewer)) as { id: string }).id;
const createVersion = async (id: string, materialId: string, brewhouseEfficiency: number, yeastAttenuation: number) =>
  ((await runCommand("create_recipe_version", { recipeId: id, brewhouseEfficiency, yeastAttenuation, mashSchedule: MASH, ingredients: [{ materialId, perBblQty: 60, stage: "mash" }] }, brewer)) as { id: string }).id;
const schedule = async (recipeVersionId: string, plannedBbl = 10, plannedOn = "2026-10-02") =>
  ((await runCommand("schedule_batch", { recipeVersionId, plannedOn, plannedBbl }, brewer)) as { id: string }).id;
const tank = async () => ((await runCommand("upsert_vessel", { name: `FV ${++vesselNo}`, kind: "fermenter", capacityBbl: 40 }, owner)) as { id: string }).id;
const brew = async (batchId: string, vesselId: string, initialBbl: number, brewedOn: string) =>
  ((await runCommand("record_brew_day", { batchId, vesselId, initialBbl, brewedOn, actuals: [], confirmEmpty: true }, brewer)) as { record: { id: string } }).record.id;
const reading = (batchId: string, at: string, gravityPlato?: number) =>
  runCommand("record_fermentation_reading", { batchId, at: `${at}T12:00:00Z`, tempF: 66, gravityPlato }, brewer);
const close = (batchId: string, confirmInTankBbl: number) => runCommand("complete_batch", { batchId, confirmInTankBbl }, brewer);
const historical = (batchId: string, brewedOn: string, knockoutBbl: number) =>
  runCommand("record_historical_batch", { batchId, brewedOn, closedOn: brewedOn, knockoutBbl }, owner);
const outcome = (name: string) => outcomes.find((o) => o.batchId === ids[name])!;

beforeAll(async () => {
  const { id: breweryId } = await makeBrewery();
  owner = await makeStaffCtx(breweryId, "admin");
  brewer = await makeStaffCtx(breweryId, "brewer");
  await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, owner);
  malt = await seedMaterial(breweryId, { name: "Outcome malt", category: "malt", extractPotential: 1.037 });
  recipeId = await createRecipe("Outcome pale");
  v1 = await createVersion(recipeId, malt, 0.75, 0.78);
  v2 = await createVersion(recipeId, malt, 0.7, 0.8);

  // Two turns on a 20 bbl plan, the first corrected from 10 to 9, then closed.
  ids.corrected = await schedule(v2, 20);
  const correctedTank = await tank();
  const firstTurn = await brew(ids.corrected, correctedTank, 10, "2026-10-05");
  await brew(ids.corrected, correctedTank, 10, "2026-10-06");
  await runCommand("correct_brew_record", { recordId: firstTurn, reason: "Remeasured the tank", initialBbl: 9, actuals: [], confirmEmpty: true }, brewer);
  // Recorded out of order, around a reading that holds no gravity.
  await reading(ids.corrected, "2026-10-20", 3.2);
  await reading(ids.corrected, "2026-10-06");
  await reading(ids.corrected, "2026-10-07", 14);
  await reading(ids.corrected, "2026-10-12", 5);
  await close(ids.corrected, 19);

  // Turn 1 of what will be two turns: half the plan is in the tank, so efficiency would read half.
  ids.open = await schedule(v2, 20);
  await brew(ids.open, await tank(), 10, "2026-10-10");
  await reading(ids.open, "2026-10-11", 14);
  await reading(ids.open, "2026-10-14", 6);

  ids.historical = await schedule(v1, 12, "2025-06-01");
  await historical(ids.historical, "2025-06-01", 12);
  await reading(ids.historical, "2025-06-02", 13);
  await reading(ids.historical, "2025-06-15", 3);

  ids.oneReading = await schedule(v1, 10, "2025-07-01");
  await historical(ids.oneReading, "2025-07-01", 10);
  await reading(ids.oneReading, "2025-07-02", 12);

  ids.noReadings = await schedule(v1, 10, "2025-08-01");
  await historical(ids.noReadings, "2025-08-01", 10);

  // A batch older than frozen brew records: brewed and closed, with no record of its knockout.
  ids.noRecord = await schedule(v1, 10, "2025-09-01");
  sql(`update public.batches set brewed_on = '2025-09-01', closed_at = '2025-09-20' where id = '${ids.noRecord}'`);
  await reading(ids.noRecord, "2025-09-02", 12);

  ids.cancelled = await schedule(v1);
  await runCommand("cancel_batch", { batchId: ids.cancelled }, brewer);
  ids.unbrewed = await schedule(v1);

  const noExtract = await seedMaterial(breweryId, { name: "Unknown malt", category: "malt" });
  blockedRecipe = await createRecipe("Outcome blocked");
  blockedVersion = await createVersion(blockedRecipe, noExtract, 0.75, 0.78);
  ids.blocked = await schedule(blockedVersion, 10, "2025-06-01");
  await historical(ids.blocked, "2025-06-01", 10);
  await reading(ids.blocked, "2025-06-02", 13);
  await reading(ids.blocked, "2025-06-15", 3);

  outcomes = ((await runCommand("get_recipe_outcomes", { recipeId }, brewer)) as { batches: RecipeOutcome[] }).batches;
});

describe("get_recipe_outcomes", () => {
  it("lists brewed batches newest first, leaving out cancelled and unbrewed plans", () => {
    expect(outcomes.map((o) => o.batchId)).toEqual([ids.open, ids.corrected, ids.noRecord, ids.noReadings, ids.oneReading, ids.historical]);
  });

  it("reads OG from the first gravity reading and FG from the last, skipping readings with no gravity", () => {
    expect(outcome("corrected")).toMatchObject({ ogPlato: 14, fgPlato: 3.2, closed: true, brewedOn: "2026-10-05", version: 2 });
    expect(outcome("corrected").abv).toBeCloseTo((platoToSg(14) - platoToSg(3.2)) * 131.25, 6);
    expect(outcome("corrected").apparentAttenuation).toBeCloseTo((platoToSg(14) - platoToSg(3.2)) / (platoToSg(14) - 1), 6);
  });

  it("sums each turn's current revision for a closed batch's knockout", () => {
    expect(outcome("corrected").brewhouseEfficiency).toBeCloseTo(efficiency(14, 19, 20), 6);
  });

  it("gives an open batch no efficiency, and its latest reading as FG", () => {
    expect(outcome("open")).toMatchObject({ closed: false, ogPlato: 14, fgPlato: 6, brewhouseEfficiency: null });
    expect(outcome("open").abv).not.toBeNull();
  });

  it("measures a historical batch from its tankless brew record and batch-only readings", () => {
    expect(outcome("historical")).toMatchObject({ closed: true, ogPlato: 13, fgPlato: 3 });
    expect(outcome("historical").brewhouseEfficiency).toBeCloseTo(efficiency(13, 12, 12), 6);
  });

  it("leaves FG and everything built on it null with one reading", () => {
    expect(outcome("oneReading")).toMatchObject({ ogPlato: 12, fgPlato: null, abv: null, apparentAttenuation: null });
    expect(outcome("oneReading").brewhouseEfficiency).toBeCloseTo(efficiency(12, 10, 10), 6);
  });

  it("leaves every measured figure null with no readings", () => {
    expect(outcome("noReadings")).toMatchObject({ ogPlato: null, fgPlato: null, abv: null, apparentAttenuation: null, brewhouseEfficiency: null });
  });

  it("gives a batch with no brew record no efficiency, and keeps its OG", () => {
    expect(outcome("noRecord")).toMatchObject({ ogPlato: 12, closed: true, brewhouseEfficiency: null });
  });

  it("answers each batch against its own version", () => {
    expect(outcome("historical")).toMatchObject({ version: 1, assumedEfficiency: 0.75, assumedAttenuation: 0.78 });
    expect(outcome("corrected")).toMatchObject({ version: 2, assumedEfficiency: 0.7, assumedAttenuation: 0.8 });
    expect(outcome("historical").predicted!.ogPlato).toBeGreaterThan(outcome("corrected").predicted!.ogPlato);
  });

  it("predicts nothing and measures no efficiency on a blocked mash bill, and keeps ABV", async () => {
    const { batches } = (await runCommand("get_recipe_outcomes", { recipeId: blockedRecipe }, brewer)) as { batches: RecipeOutcome[] };
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ batchId: ids.blocked, predicted: null, brewhouseEfficiency: null, ogPlato: 13, fgPlato: 3 });
    expect(batches[0].abv).not.toBeNull();
  });

  it("returns no batches for a recipe nothing has brewed", async () => {
    const { id: quiet } = (await runCommand("create_recipe", { name: "Outcome quiet" }, brewer)) as { id: string };
    expect(await runCommand("get_recipe_outcomes", { recipeId: quiet }, brewer)).toEqual({ batches: [] });
  });

  it("answers not_found for another brewery's recipe", async () => {
    const other = await makeStaffCtx((await makeBrewery()).id, "brewer");
    await expect(runCommand("get_recipe_outcomes", { recipeId }, other)).rejects.toMatchObject({ code: "not_found" });
  });

  it("is for admin and brewer", async () => {
    const sales = await makeStaffCtx(owner.breweryId, "sales");
    await expect(runCommand("get_recipe_outcomes", { recipeId }, sales)).rejects.toThrow(/permission denied/);
    await expect(runCommand("get_recipe_outcomes", { recipeId }, owner)).resolves.toBeTruthy();
  });
});

// tests/recipe-outcomes.test.ts — get_recipe_outcomes against the real schema:
// which batches count, where OG, FG and knockout come from, and that each batch
// answers to its own version. Imported history has no open or multi-turn batch,
// so those cases live here. Then a batch read in two tanks (a row per tank), and
// the batches other recipes brewed on the same grain bill (pooled, mash figures
// only, never across breweries). The formulas are pinned in tests/recipe-gravity.test.ts.
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
const efficiency = (ogPlato: number, knockoutBbl: number, plannedBbl: number, potential = POTENTIAL) => ((platoToSg(ogPlato) - 1) * 1000 * knockoutBbl) / (potential * plannedBbl);
const MASH = [{ name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }];

const createRecipe = async (name: string) => ((await runCommand("create_recipe", { name }, brewer)) as { id: string }).id;
const createVersion = async (id: string, materialId: string, brewhouseEfficiency: number, yeastAttenuation: number) =>
  ((await runCommand("create_recipe_version", { recipeId: id, brewhouseEfficiency, yeastAttenuation, mashSchedule: MASH, ingredients: [{ materialId, perBblQty: 60, stage: "mash" }] }, brewer)) as { id: string }).id;
type Line = { materialId: string; perBblQty: number; stage: "mash" | "boil" };
/** A copy with these lines, assuming 75% efficiency and 78% attenuation. */
const bill = async (id: string, ingredients: Line[], ctx = brewer) =>
  ((await runCommand("create_recipe_version", { recipeId: id, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, mashSchedule: MASH, ingredients }, ctx)) as { id: string }).id;
const schedule = async (recipeVersionId: string, plannedBbl = 10, plannedOn = "2026-10-02") =>
  ((await runCommand("schedule_batch", { recipeVersionId, plannedOn, plannedBbl }, brewer)) as { id: string }).id;
const tank = async () => ((await runCommand("upsert_vessel", { name: `FV ${++vesselNo}`, kind: "fermenter", capacityBbl: 40 }, owner)) as { id: string }).id;
/** One brew turn: its record, and the tank stay it opened or topped up. */
const brewDay = async (batchId: string, vesselId: string, initialBbl: number, brewedOn: string) =>
  (await runCommand("record_brew_day", { batchId, vesselId, initialBbl, brewedOn, actuals: [], confirmEmpty: true }, brewer)) as { record: { id: string }; occupancy: { id: string } };
const brew = async (batchId: string, vesselId: string, initialBbl: number, brewedOn: string) => (await brewDay(batchId, vesselId, initialBbl, brewedOn)).record.id;
const reading = (batchId: string, at: string, gravityPlato?: number) =>
  runCommand("record_fermentation_reading", { batchId, at: `${at}T12:00:00Z`, tempF: 66, gravityPlato }, brewer);
/** A reading taken at one tank, as Cellar records it. */
const tankReading = (occupancyId: string, at: string, gravityPlato: number) =>
  runCommand("record_fermentation_reading", { occupancyId, at: `${at}T12:00:00Z`, tempF: 66, gravityPlato }, brewer);
const close = (batchId: string, confirmInTankBbl: number) => runCommand("complete_batch", { batchId, confirmInTankBbl }, brewer);
const historical = (batchId: string, brewedOn: string, knockoutBbl: number) =>
  runCommand("record_historical_batch", { batchId, brewedOn, closedOn: brewedOn, knockoutBbl }, owner);
const outcome = (name: string) => outcomes.find((o) => o.batchId === ids[name])!;
const outcomesOf = async (id: string, version?: number) => ((await runCommand("get_recipe_outcomes", { recipeId: id, version }, brewer)) as { batches: RecipeOutcome[] }).batches;

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

describe("get_recipe_outcomes by tank", () => {
  /** 55 lb of the same malt per barrel: a grain bill no other recipe here has. */
  const potential = (55 * 37) / 31;
  let rows: RecipeOutcome[];
  const tanks: string[] = [];

  beforeAll(async () => {
    const recipe = await createRecipe("Outcome split");
    const version = await bill(recipe, [{ materialId: malt, perBblQty: 55, stage: "mash" }]);

    // One brew, then half of it moved to a second tank; each tank is read on its own.
    ids.split = await schedule(version, 20);
    const first = await brewDay(ids.split, await tank(), 20, "2026-10-05");
    tanks.push(`FV ${vesselNo}`);
    // Taken on the batch at knockout, before the split: it names no tank.
    await reading(ids.split, "2026-10-05", 14.2);
    await tankReading(first.occupancy.id, "2026-10-06", 14);
    const moved = (await runCommand("record_cellar_transfer", { fromOccupancyId: first.occupancy.id, toVesselId: await tank(), volumeBbl: 10 }, brewer)) as { to_occupancy: { id: string } };
    tanks.push(`FV ${vesselNo}`);
    await tankReading(moved.to_occupancy.id, "2026-10-07", 13.8);
    await tankReading(first.occupancy.id, "2026-10-12", 3.4);
    await tankReading(moved.to_occupancy.id, "2026-10-13", 3.9);
    await close(ids.split, 20);

    // A double batch: two turns into one tank, read at the tank and once on the batch.
    ids.double = await schedule(version, 20);
    const turn = await brewDay(ids.double, await tank(), 10, "2026-10-08");
    await brew(ids.double, (await runCommand("get_brew_day", { batchId: ids.double }, brewer) as { occupancy: { vessel_id: string } }).occupancy.vessel_id, 10, "2026-10-09");
    await tankReading(turn.occupancy.id, "2026-10-10", 14);
    await tankReading(turn.occupancy.id, "2026-10-14", 4);
    await reading(ids.double, "2026-10-20", 3.5);

    rows = await outcomesOf(recipe);
  });

  it("gives a batch read in two tanks one row per tank, each with its own OG and FG", () => {
    const split = rows.filter((o) => o.batchId === ids.split);
    expect(split.map((o) => [o.vessel, o.ogPlato, o.fgPlato])).toEqual([[tanks[0], 14, 3.4], [tanks[1], 13.8, 3.9]]);
    expect(split[0].abv).toBeCloseTo((platoToSg(14) - platoToSg(3.4)) * 131.25, 6);
    expect(split[1].apparentAttenuation).toBeCloseTo((platoToSg(13.8) - platoToSg(3.9)) / (platoToSg(13.8) - 1), 6);
  });

  it("repeats the batch's efficiency on each tank's row, from the batch's first reading", () => {
    for (const row of rows.filter((o) => o.batchId === ids.split)) expect(row.brewhouseEfficiency).toBeCloseTo(efficiency(14.2, 20, 20, potential), 6);
  });

  it("keeps a double batch into one tank as one row that names no tank", () => {
    const double = rows.filter((o) => o.batchId === ids.double);
    expect(double).toHaveLength(1);
    expect(double[0]).toMatchObject({ ogPlato: 14, fgPlato: 3.5, closed: false });
    expect(double[0].vessel).toBeUndefined();
  });

  it("names no tank on a batch read on the batch alone", () => {
    expect(outcomes.every((o) => o.vessel === undefined)).toBe(true);
  });
});

describe("get_recipe_outcomes on a shared grain bill", () => {
  /** The bill the shown copy and its matches share: 50 lb of base malt at 1.036 and 5.5 lb of the 1.037 malt. */
  const potential = (50 * 36 + 5.5 * 37) / 31;
  let pale: string, pooled: RecipeOutcome[], elsewhere: Ctx;

  beforeAll(async () => {
    const base = await seedMaterial(owner.breweryId, { name: "Pool base malt", category: "malt", extractPotential: 1.036 });
    const hop = await seedMaterial(owner.breweryId, { name: "Pool hop", category: "hop", alphaAcid: 12 });
    const shared: Line[] = [{ materialId: base, perBblQty: 50, stage: "mash" }, { materialId: malt, perBblQty: 5.5, stage: "mash" }];
    const past = async (name: string, version: string, brewedOn: string, og: number, fg: number) => {
      ids[name] = await schedule(version, 10, brewedOn);
      await historical(ids[name], brewedOn, 10);
      await reading(ids[name], brewedOn, og);
      await reading(ids[name], "2025-09-30", fg);
    };

    // The recipe being read: its first copy had the base malt alone, its current copy the shared bill.
    pale = await createRecipe("Pool pale");
    await past("paleBefore", await bill(pale, [shared[0]]), "2025-03-01", 12, 3);
    await past("paleNow", await bill(pale, [...shared, { materialId: hop, perBblQty: 1, stage: "boil" }]), "2025-06-01", 13, 3);

    // The same mash lines in another order under other hops.
    const hazy = await bill(await createRecipe("Pool hazy"), [shared[1], shared[0], { materialId: hop, perBblQty: 3, stage: "boil" }]);
    await past("hazy", hazy, "2025-07-01", 13.5, 4);
    ids.hazyOpen = await schedule(hazy, 20);
    await brew(ids.hazyOpen, await tank(), 20, "2026-10-21");
    ids.hazyPlanned = await schedule(hazy);

    // One bag of the second malt more.
    await past("oneBagOff", await bill(await createRecipe("Pool one bag off"), [shared[0], { ...shared[1], perBblQty: 6.5 }]), "2025-07-02", 13, 3);

    // Brewed on the shared bill, then changed: only the batch from before the change shares it.
    const changed = await createRecipe("Pool changed");
    await past("beforeChange", await bill(changed, shared), "2025-05-01", 12.5, 3);
    await past("afterChange", await bill(changed, [{ ...shared[0], perBblQty: 51 }, shared[1]]), "2025-08-01", 13, 3);

    // Another brewery writes the identical recipe: the same material names, potentials and amounts.
    const other = (await makeBrewery()).id;
    const admin = await makeStaffCtx(other, "admin");
    elsewhere = await makeStaffCtx(other, "brewer");
    await runCommand("set_books_opened_on", { booksOpenedOn: "2026-10-01" }, admin);
    const theirs = await bill(((await runCommand("create_recipe", { name: "Elsewhere pale" }, elsewhere)) as { id: string }).id, [
      { materialId: await seedMaterial(other, { name: "Pool base malt", category: "malt", extractPotential: 1.036 }), perBblQty: 50, stage: "mash" },
      { materialId: await seedMaterial(other, { name: "Outcome malt", category: "malt", extractPotential: 1.037 }), perBblQty: 5.5, stage: "mash" },
    ], elsewhere);
    ids.elsewhere = ((await runCommand("schedule_batch", { recipeVersionId: theirs, plannedOn: "2025-07-03", plannedBbl: 10 }, elsewhere)) as { id: string }).id;
    await runCommand("record_historical_batch", { batchId: ids.elsewhere, brewedOn: "2025-07-03", closedOn: "2025-07-03", knockoutBbl: 10 }, admin);
    await runCommand("record_fermentation_reading", { batchId: ids.elsewhere, at: "2025-07-03T12:00:00Z", tempF: 66, gravityPlato: 13 }, elsewhere);

    pooled = await outcomesOf(pale);
  });
  const named = (name: string) => pooled.find((o) => o.batchId === ids[name])!;

  it("adds the batches other recipes brewed on the shown copy's grain bill, newest first, each with its recipe's name", () => {
    expect(pooled.map((o) => [o.batchId, o.recipeName])).toEqual([
      [ids.hazyOpen, "Pool hazy"], [ids.hazy, "Pool hazy"], [ids.paleNow, undefined], [ids.beforeChange, "Pool changed"], [ids.paleBefore, undefined],
    ]);
  });

  it("matches the mash lines in any order and ignores every other stage", () => {
    expect(named("hazy")).toMatchObject({ recipeName: "Pool hazy", sameGrainBill: true, closed: true, ogPlato: 13.5 });
  });

  it("does not pool a recipe one bag different", () => {
    expect(pooled.map((o) => o.batchId)).not.toContain(ids.oneBagOff);
  });

  it("matches each batch on the copy it was brewed from, not its recipe's current copy", () => {
    expect(named("beforeChange")).toMatchObject({ recipeName: "Pool changed", sameGrainBill: true });
    expect(pooled.map((o) => o.batchId)).not.toContain(ids.afterChange);
  });

  it("gives a pooled batch its OG and efficiency and no fermentation figures", () => {
    expect(named("hazy")).toMatchObject({ ogPlato: 13.5, fgPlato: null, abv: null, apparentAttenuation: null });
    expect(named("hazy").brewhouseEfficiency).toBeCloseTo(efficiency(13.5, 10, 10, potential), 6);
    expect(named("hazyOpen")).toMatchObject({ closed: false, ogPlato: null, brewhouseEfficiency: null });
  });

  it("keeps this recipe's batch from a copy with another grain bill, outside the grain bill", () => {
    expect(named("paleBefore")).toMatchObject({ version: 1, sameGrainBill: false, ogPlato: 12, fgPlato: 3 });
    expect(named("paleNow")).toMatchObject({ version: 2, sameGrainBill: true, fgPlato: 3 });
    expect(named("paleNow").recipeName).toBeUndefined();
  });

  it("pools against the copy asked for", async () => {
    // The first copy's bill is the base malt alone, which no other recipe has.
    const first = await outcomesOf(pale, 1);
    expect(first.map((o) => [o.batchId, o.sameGrainBill])).toEqual([[ids.paleNow, false], [ids.paleBefore, true]]);
    await expect(runCommand("get_recipe_outcomes", { recipeId: pale, version: 9 }, brewer)).rejects.toMatchObject({ code: "not_found" });
  });

  it("never pools another brewery's identical recipe, either way", async () => {
    expect(pooled.map((o) => o.batchId)).not.toContain(ids.elsewhere);
    expect(pooled.map((o) => o.recipeName)).not.toContain("Elsewhere pale");
    const { batches } = (await runCommand("get_recipe_outcomes", { recipeId: (await runCommand("list_recipes", {}, elsewhere) as { id: string }[])[0].id }, elsewhere)) as { batches: RecipeOutcome[] };
    expect(batches.map((o) => [o.batchId, o.recipeName])).toEqual([[ids.elsewhere, undefined]]);
  });

  it("leaves a recipe whose grain bill nobody shares as it was", () => {
    expect(outcomes.every((o) => o.recipeName === undefined && o.sameGrainBill)).toBe(true);
  });
});

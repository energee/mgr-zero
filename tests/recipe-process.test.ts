// tests/recipe-process.test.ts — the recipe process spec (issue #278): a
// version carries its mash and fermentation schedules, whirlpool/knockout/
// pre-boil scalars, water profiles and water additions; mash_temp_f is
// filled from the saccharification rest so recipe-gravity's input survives.
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx, seedMaterial, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let malt: string, gypsum: string, recipeId: string, targetId: string;

const mash = [
  { name: "Mash-in", kind: "infusion", tempF: 104, minutes: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 },
];
const fermentation = [
  { name: "Primary", kind: "primary", tempF: 68, days: 4 },
  { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 },
];

beforeAll(async () => {
  const b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "brewer");
  malt = await seedMaterial(b.id, { name: "Pale Ale Malt", category: "malt", extractPotential: 1.037 });
  gypsum = await seedMaterial(b.id, { name: "Gypsum", category: "other", uom: "g" });
  recipeId = ((await runCommand("create_recipe", { name: "Hazy IPA" }, ctx)) as { id: string }).id;
  targetId = ((await runCommand("upsert_water_profile", { name: "Hazy target", calciumPpm: 110, magnesiumPpm: 10, sodiumPpm: 15, sulfatePpm: 90, chloridePpm: 180, bicarbonatePpm: 40 }, ctx)) as { id: string }).id;
});

describe("recipe process spec", () => {
  it("writes the schedules, process scalars, water and additions with the version", async () => {
    const v = (await runCommand("create_recipe_version", {
      recipeId, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, boilMinutes: 60,
      mashSchedule: mash, fermentationSchedule: fermentation,
      process: { preBoilBbl: 12.5, whirlpoolMinutes: 20, whirlpoolTempF: 180, whirlpoolRestMinutes: 15, knockoutTempF: 66 },
      water: { targetProfileId: targetId, mashGal: 9.5, spargeGal: 12, targetMashPh: 5.35, additions: [{ materialId: gypsum, qty: 4, unit: "g", stage: "mash" }, { materialId: gypsum, qty: 2, unit: "g", stage: "sparge" }] },
      ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }],
    }, ctx)) as { id: string; version: number; mash_temp_f: number; pre_boil_bbl: number; target_water_profile_id: string };
    expect(v).toMatchObject({ version: 1, mash_temp_f: 152, pre_boil_bbl: 12.5, target_water_profile_id: targetId });

    const got = (await runCommand("get_recipe", { recipeId }, ctx)) as { version: { mash_schedule: unknown; fermentation_schedule: unknown; whirlpool_minutes: number; knockout_temp_f: number; mash_water_gal: number }; waterAdditions: { material_id: string; qty: number; unit: string; stage: string }[]; ogPlato: number | null };
    expect(got.version).toMatchObject({ mash_schedule: mash, fermentation_schedule: fermentation, whirlpool_minutes: 20, knockout_temp_f: 66, mash_water_gal: 9.5 });
    expect(got.waterAdditions).toEqual([{ material_id: gypsum, qty: 4, unit: "g", stage: "mash" }, { material_id: gypsum, qty: 2, unit: "g", stage: "sparge" }]);
    expect(got.ogPlato).not.toBeNull();
  });

  it("a mash schedule with no rest in range leaves mash_temp_f null; an empty schedule or the old shape is refused", async () => {
    const v = (await runCommand("create_recipe_version", {
      recipeId, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, mashSchedule: [{ name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 }],
      ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }],
    }, ctx)) as { mash_temp_f: number | null; fermentation_schedule: unknown[] };
    expect(v.mash_temp_f).toBeNull();
    expect(v.fermentation_schedule).toEqual([]);
    await expect(runCommand("create_recipe_version", { recipeId, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, mashSchedule: [], ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }] }, ctx)).rejects.toThrow(/validation/);
    await expect(runCommand("create_recipe_version", { recipeId, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }] }, ctx)).rejects.toThrow(/validation/);
  });

  it("keeps a version immutable: the additions table has no update path", () => {
    expect(sql(`select count(*) from pg_policies where tablename = 'recipe_water_additions' and cmd in ('UPDATE','DELETE')`)).toEqual(["0"]);
  });
});

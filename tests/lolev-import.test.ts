// TEMPORARY: one-off Lolev migration code. Delete with the rest of the import once the migration is done (#867).
// Pure tests for lib/import/lolev.ts: Lolev Manager documents → MGR command
// inputs. Synthetic fixtures only; no database.
import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE_NAME, SALT_NAMES, mapMaterials, mapRecipes, mapWaterProfile } from "@/lib/import/lolev";
import { fromEjson } from "@/scripts/import-lolev";
import { FERMENTATION_STAGE_KINDS, MASH_STEP_KINDS, WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/mgr/enums";
import { INGREDIENT_STAGES } from "@/lib/mgr/recipe-process-view";

const catalog = {
  malts: [
    { _id: "m1", name: "Pale Two-Row", weight: 55, yieldOnGrind: 80 },
    { _id: "m2", name: "Mystery Malt", weight: 50 },
  ],
  hops: [
    { _id: "h1", name: "Zeta", alphaAcid: 12, weight: 44 },
    { _id: "h2", name: "Zeta", alphaAcid: 11, weight: 44 },
  ],
  yeasts: [{ _id: "y1", name: "House Ale", attenuation: { low: 76, high: 84 } }],
  sugars: [{ _id: "s1", name: "Dextrose", ppg: 44 }],
  adjuncts: [{ _id: "a1", name: "Flaked Oats" }],
};

function recipe(over: Record<string, unknown> = {}) {
  return {
    _id: "r1", name: "Test IPA", createdAt: "2025-01-02T00:00:00.000Z", batchSize: 20, boilTime: 60,
    malts: [{ malt: "m1", weight: 400 }],
    hops: [
      { hop: "h1", weight: 10, hopTiming: "boil", boilTime: 30 },
      { hop: "h2", weight: 20, hopTiming: "whirlpool" },
      { hop: "h1", weight: 40, hopTiming: "dry-hop" },
      { hop: "h1", weight: 5, hopTiming: null },
    ],
    sugars: [{ sugar: "s1", weight: 10, timing: "boil" }],
    adjuncts: [{ adjunct: "a1", weight: 20, timing: "mash" }],
    yeast: "y1",
    mashSchedule: [],
    fermentationSchedule: [],
    waterAdditions: [],
    ...over,
  };
}

const { byLolevId, materials } = mapMaterials(catalog);
const one = (over: Record<string, unknown> = {}) => mapRecipes([recipe(over)], byLolevId, catalog.yeasts);

describe("fromEjson", () => {
  it("unwraps canonical extended JSON into plain values", () => {
    expect(fromEjson({
      _id: { $oid: "abc123" }, n: { $numberInt: "55" }, d: { $numberDouble: "0.25" }, l: { $numberLong: "7" },
      at: { $date: { $numberLong: "1761080400330" } }, list: [{ $numberInt: "1" }, "x", null],
    })).toEqual({ _id: "abc123", n: 55, d: 0.25, l: 7, at: new Date(1761080400330).toISOString(), list: [1, "x", null] });
  });
});

describe("mapMaterials", () => {
  it("maps each catalog to a category, unit and extract potential", () => {
    const by = new Map(materials.map((m) => [m.name, m]));
    expect(by.get("Pale Two-Row")).toMatchObject({ category: "malt", baseUom: "lb", purchaseUom: "lb", purchaseUomFactor: 1 });
    expect(by.get("Pale Two-Row")!.extractPotential).toBeCloseTo(1.0368, 6);
    expect(by.get("Mystery Malt")!.extractPotential).toBeUndefined();
    expect(by.get("Dextrose")).toMatchObject({ category: "adjunct", baseUom: "lb", extractPotential: 1.044 });
    expect(by.get("Flaked Oats")).toMatchObject({ category: "adjunct", baseUom: "lb" });
    expect(by.get("House Ale")).toMatchObject({ category: "yeast", baseUom: "each", purchaseUom: "each" });
    expect(by.get("Zeta")).toMatchObject({ category: "hop", baseUom: "lb" });
  });

  it("collapses duplicate names into one material reachable from every id", () => {
    expect(materials.filter((m) => m.name === "Zeta")).toHaveLength(1);
    expect(byLolevId.get("h1")).toBe("Zeta");
    expect(byLolevId.get("h2")).toBe("Zeta");
  });

  it("trims names, so a trailing space does not make a second material", () => {
    const { materials: ms, byLolevId: ids } = mapMaterials({ malts: [], yeasts: [], sugars: [], adjuncts: [],
      hops: [{ _id: "c1", name: "Chinook" }, { _id: "c2", name: "Chinook " }] });
    expect(ms.filter((m) => m.category === "hop").map((m) => m.name)).toEqual(["Chinook"]);
    expect(ids.get("c2")).toBe("Chinook");
  });

  it("omits an extract potential outside the command's bounds", () => {
    const { materials: ms } = mapMaterials({ malts: [], hops: [], yeasts: [], adjuncts: [], sugars: [{ _id: "s9", name: "Odd", ppg: 400 }] });
    expect(ms.find((m) => m.name === "Odd")!.extractPotential).toBeUndefined();
  });

  it("appends the five water salts as grams of chemical", () => {
    for (const name of Object.values(SALT_NAMES)) {
      expect(materials.find((m) => m.name === name)).toMatchObject({ category: "chemical", baseUom: "g", purchaseUom: "g" });
    }
    expect(Object.keys(SALT_NAMES)).toHaveLength(5);
  });
});

describe("mapWaterProfile", () => {
  it("renames the six ions to ppm fields", () => {
    expect(mapWaterProfile(DEFAULT_PROFILE_NAME, { calcium: 50, magnesium: 10, sodium: 5, sulfate: 100, chloride: 60, bicarbonate: 30, pH: 7 }))
      .toEqual({ name: "Lolev default", calciumPpm: 50, magnesiumPpm: 10, sodiumPpm: 5, sulfatePpm: 100, chloridePpm: 60, bicarbonatePpm: 30 });
  });
});

describe("mapRecipes", () => {
  it("converts pounds per batch to quantity per barrel and maps stages", () => {
    const { recipes, skipped } = one();
    expect(skipped).toEqual([]);
    const v = recipes[0].version;
    expect(v.ingredients).toEqual([
      { materialName: "Pale Two-Row", perBblQty: 20, stage: "mash" },
      { materialName: "Zeta", perBblQty: 0.5, stage: "boil", timingMinutes: 30 },
      { materialName: "Zeta", perBblQty: 1, stage: "whirlpool" },
      { materialName: "Zeta", perBblQty: 2, stage: "dry_hop" },
      { materialName: "Zeta", perBblQty: 0.25, stage: "other" },
      { materialName: "Dextrose", perBblQty: 0.5, stage: "boil" },
      { materialName: "Flaked Oats", perBblQty: 1, stage: "mash" },
      { materialName: "House Ale", perBblQty: 0.05, stage: "fermentation" },
    ]);
    for (const l of v.ingredients) {
      expect(INGREDIENT_STAGES).toContain(l.stage);
      expect(l.perBblQty).toBeGreaterThan(0);
    }
    expect(v.boilMinutes).toBe(60);
    expect(v.brewhouseEfficiency).toBe(0.75);
  });

  it("rounds quantity per barrel to six decimals", () => {
    const { recipes } = one({ batchSize: 3, hops: [], sugars: [], adjuncts: [], yeast: undefined });
    expect(recipes[0].version.ingredients[0].perBblQty).toBe(133.333333);
  });

  it("defaults the mash to one infusion step at the mash temperature", () => {
    expect(one().recipes[0].version.mashSchedule).toEqual([{ name: "Mash", kind: "infusion", tempF: 152, minutes: 60 }]);
    expect(one({ mashTemp: 148 }).recipes[0].version.mashSchedule[0].tempF).toBe(148);
  });

  it("maps a given mash schedule, unknown kinds to infusion", () => {
    const steps = one({ mashSchedule: [{ stepType: "rest", temperature: 122, duration: 15 }, { stepType: "step", temperature: 152, duration: 45 }] })
      .recipes[0].version.mashSchedule;
    expect(steps).toEqual([{ name: "Rest", kind: "rest", tempF: 122, minutes: 15 }, { name: "Infusion", kind: "infusion", tempF: 152, minutes: 45 }]);
    for (const s of steps) expect(MASH_STEP_KINDS).toContain(s.kind);
  });

  it("maps fermentation stages and drops zero-length ones", () => {
    const stages = one({ fermentationSchedule: [
      { stage: "primary", temperature: 66, duration: 7 },
      { stage: "diacetyl-rest", temperature: 70, duration: 2 },
      { stage: "cold-crash", temperature: 34, duration: 1 },
      { stage: "dry-hop-rest", temperature: 64, duration: 3 },
      { stage: "secondary", temperature: 60, duration: 0 },
    ] }).recipes[0].version.fermentationSchedule;
    expect(stages).toEqual([
      { name: "primary", kind: "primary", tempF: 66, days: 7 },
      { name: "diacetyl-rest", kind: "diacetyl rest", tempF: 70, days: 2 },
      { name: "cold-crash", kind: "cold crash", tempF: 34, days: 1 },
      { name: "dry-hop-rest", kind: "custom", tempF: 64, days: 3 },
    ]);
    for (const s of stages) expect(FERMENTATION_STAGE_KINDS).toContain(s.kind);
  });

  it("reads attenuation as a percent, then the yeast midpoint, then 0.75", () => {
    expect(one({ targetAttenuation: 82 }).recipes[0].version.yeastAttenuation).toBe(0.82);
    expect(one({ targetAttenuation: 0 }).recipes[0].version.yeastAttenuation).toBe(0.8);
    expect(one().recipes[0].version.yeastAttenuation).toBe(0.8);
    expect(one({ yeast: undefined }).recipes[0].version.yeastAttenuation).toBe(0.75);
  });

  it("skips a recipe with no batch size or no ingredients, and reports dropped lines", () => {
    expect(one({ batchSize: 0 })).toMatchObject({ recipes: [], skipped: [{ lolevId: "r1", name: "Test IPA" }] });
    const empty = one({ malts: [{ malt: "gone", weight: 10 }], hops: [], sugars: [], adjuncts: [], yeast: undefined });
    expect(empty.recipes).toEqual([]);
    expect(empty.skipped).toHaveLength(2);
    const partial = one({ malts: [{ malt: "m1", weight: 400 }, { malt: "m1", weight: 0 }] });
    expect(partial.recipes).toHaveLength(1);
    expect(partial.skipped).toHaveLength(1);
  });

  it("uses the default profile, a recipe source profile, or none", () => {
    expect(one({ useDefaultWaterProfile: true }).recipes[0].sourceProfile).toBe("default");
    expect(one({ sourceWaterProfile: { calcium: 0, magnesium: 0, sodium: 0, sulfate: 0, chloride: 0, bicarbonate: 0 } }).recipes[0].sourceProfile).toBeNull();
    expect(one({ sourceWaterProfile: { calcium: 40, magnesium: 0, sodium: 0, sulfate: 0, chloride: 0, bicarbonate: 0 } }).recipes[0].sourceProfile)
      .toEqual({ name: "Test IPA source water", calciumPpm: 40, magnesiumPpm: 0, sodiumPpm: 0, sulfatePpm: 0, chloridePpm: 0, bicarbonatePpm: 0 });
  });

  it("maps water salt additions to salt materials and drops unknown ones", () => {
    const { recipes, skipped } = one({ waterAdditions: [
      { mineral: "gypsum", amount: 120, unit: "g", target: "mash" },
      { mineral: "calcium-chloride", amount: 80, unit: "g", target: "boil" },
      { mineral: null, amount: 5, unit: "g", target: "mash" },
      { mineral: "epsom-salt", amount: 0, unit: "g", target: "mash" },
    ] });
    const adds = recipes[0].version.water.additions;
    expect(adds).toEqual([
      { materialName: SALT_NAMES.gypsum, qty: 120, unit: "g", stage: "mash" },
      { materialName: SALT_NAMES["calcium-chloride"], qty: 80, unit: "g", stage: "mash" },
    ]);
    for (const a of adds) { expect(WATER_ADDITION_STAGES).toContain(a.stage); expect(WATER_ADDITION_UNITS).toContain(a.unit); }
    expect(skipped).toHaveLength(2);
  });

  it("keeps the Lolev note and records the source id", () => {
    expect(one({ notes: "Hazy." }).recipes[0].note).toBe("Hazy.\nImported from Lolev recipe r1");
    expect(one().recipes[0].note).toBe("Imported from Lolev recipe r1");
  });

  it("suffixes older duplicate names with their created date", () => {
    const { recipes } = mapRecipes([
      recipe({ _id: "old", createdAt: "2024-03-04T10:00:00.000Z" }),
      recipe({ _id: "new", createdAt: "2025-05-06T10:00:00.000Z" }),
    ], byLolevId, catalog.yeasts);
    expect(recipes.map((r) => [r.lolevId, r.name])).toEqual([["old", "Test IPA (2024-03-04)"], ["new", "Test IPA"]]);
  });

  it("renames a duplicate's custom source profile with the recipe, so profiles stay distinct", () => {
    const water = { calcium: 10, magnesium: 0, sodium: 0, sulfate: 0, chloride: 0, bicarbonate: 0 };
    const { recipes } = mapRecipes([
      recipe({ _id: "old", createdAt: "2024-03-04T10:00:00.000Z", sourceWaterProfile: water }),
      recipe({ _id: "new", createdAt: "2025-05-06T10:00:00.000Z", sourceWaterProfile: { ...water, calcium: 20 } }),
    ], byLolevId, catalog.yeasts);
    const names = recipes.map((r) => (r.sourceProfile as { name: string }).name);
    expect(names).toEqual(["Test IPA (2024-03-04) source water", "Test IPA source water"]);
  });

  it("trims recipe names before finding duplicates", () => {
    const { recipes } = mapRecipes([
      recipe({ _id: "old", name: "Test IPA ", createdAt: "2024-03-04T10:00:00.000Z" }),
      recipe({ _id: "new", createdAt: "2025-05-06T10:00:00.000Z" }),
    ], byLolevId, catalog.yeasts);
    expect(recipes.map((r) => r.name)).toEqual(["Test IPA (2024-03-04)", "Test IPA"]);
  });
});

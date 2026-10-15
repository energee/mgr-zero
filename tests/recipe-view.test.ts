// tests/recipe-view.test.ts — the recipe page's pure view-model: a saved
// version copied into a draft (versionToDraft, versionNumbers), the first
// reason a draft cannot be saved (draftBlocker), the read page's model
// (toRecipePageModel) and why a prediction is missing (gravityBlockerText). No DB.
// The last block reads the page and brand picker sources: the page draws
// toRecipePageModel, and the picker never disables itself while it saves.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { draftBlocker, gravityBlockerText, toRecipePageModel, versionNumbers, versionToDraft, type RecipeSnapshot } from "@/lib/mgr/recipe-view";
import type { IngredientLine, MashStep } from "@/lib/mgr/recipe-process-view";

const version: NonNullable<RecipeSnapshot["version"]> = {
  id: "v1", version: 3, created_at: "2026-10-01T15:00:00Z", mash_temp_f: null,
  brewhouse_efficiency: 0.725, yeast_attenuation: 0.07, boil_minutes: 60, note: "Less crystal",
  pre_boil_bbl: 16.8, whirlpool_minutes: 20, whirlpool_temp_f: null, whirlpool_rest_minutes: null, knockout_temp_f: 66,
  target_water_profile_id: "p-target", source_water_profile_id: null, mash_water_gal: 120, sparge_water_gal: null, target_mash_ph: 5.3,
  mash_schedule: [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }],
  fermentation_schedule: [{ name: "Primary", kind: "primary", tempF: 68, days: 7 }],
};
const snapshot: RecipeSnapshot = {
  recipe: { id: "r1", name: "Pale", brand_id: null, note: null },
  version,
  ingredients: [
    { id: "i1", material_id: "m-malt", per_bbl_qty: 40.9, stage: "mash", timing_minutes: null, sort: 0, extract_snapshot: 37, materials: { base_uom: "lb" } },
    { id: "i2", material_id: "m-hop", per_bbl_qty: 0.5, stage: "boil", timing_minutes: 60, sort: 1, extract_snapshot: null, materials: { base_uom: "lb" } },
  ],
  waterAdditions: [{ material_id: "m-gypsum", qty: 40, unit: "g", stage: "mash" }],
  ogPlato: null, fgPlato: null, abv: null,
};

describe("versionNumbers", () => {
  it("prints a fractional efficiency as its exact percent, never rounded", () => {
    const n = versionNumbers(version);
    expect(n.efficiency).toBe("72.5");
    expect(n.attenuation).toBe("7");
  });
  it("prints each process number and leaves an absent one empty", () => {
    expect(versionNumbers(version)).toEqual({
      preBoil: "16.8", boilMin: "60", whirlpoolMin: "20", whirlpoolTemp: "", whirlpoolRest: "", knockoutTemp: "66", efficiency: "72.5", attenuation: "7",
    });
  });
});

describe("versionToDraft", () => {
  it("is null when the recipe has no version", () => {
    expect(versionToDraft({ ...snapshot, version: null, ingredients: [], waterAdditions: [] })).toBeNull();
  });
  it("copies the version note, schedules and numbers", () => {
    const d = versionToDraft(snapshot)!;
    expect(d.notes).toBe("Less crystal");
    expect(d.numbers.efficiency).toBe("72.5");
    expect(d.mashSchedule).toEqual(version.mash_schedule);
    expect(d.fermentationSchedule).toEqual(version.fermentation_schedule);
  });
  it("coerces string numerics and seeds a null timing as empty", () => {
    const stringy = {
      ...snapshot,
      version: { ...version, brewhouse_efficiency: "0.725", pre_boil_bbl: "16.80" },
      ingredients: [{ ...snapshot.ingredients[0], per_bbl_qty: "40.900000" }],
      waterAdditions: [{ material_id: "m-gypsum", qty: "40.0", unit: "g", stage: "mash" }],
    } as unknown as RecipeSnapshot;
    const d = versionToDraft(stringy)!;
    expect(d.numbers.efficiency).toBe("72.5");
    expect(d.numbers.preBoil).toBe("16.8");
    expect(d.lines).toEqual([{ materialId: "m-malt", perBblQty: "40.9", stage: "mash", timingMinutes: "" }]);
    expect(d.water.additions).toEqual([{ materialId: "m-gypsum", qty: 40, unit: "g", stage: "mash" }]);
  });
  it("maps the ingredients and the water", () => {
    const d = versionToDraft(snapshot)!;
    expect(d.lines[1]).toEqual({ materialId: "m-hop", perBblQty: "0.5", stage: "boil", timingMinutes: "60" });
    expect(d.water).toEqual({
      targetProfileId: "p-target", sourceProfileId: "", mashGal: "120", spargeGal: "", targetMashPh: "5.3",
      additions: [{ materialId: "m-gypsum", qty: 40, unit: "g", stage: "mash" }],
    });
  });
});

describe("draftBlocker", () => {
  const line: IngredientLine = { materialId: "m-malt", perBblQty: "40", stage: "mash", timingMinutes: "" };
  const mash: MashStep[] = [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }];
  const ready = { name: "Pale", lines: [line], mashSchedule: mash, efficiency: "75", attenuation: "78" };

  it("is null when the draft can be saved", () => {
    expect(draftBlocker(ready)).toBeNull();
    expect(draftBlocker({ ...ready, name: undefined })).toBeNull();
  });
  it("names each unmet requirement in order: name, ingredient, mash step, efficiency, attenuation", () => {
    const none = { name: " ", lines: [{ ...line, perBblQty: "" }], mashSchedule: [], efficiency: "0", attenuation: "" };
    const first = draftBlocker(none);
    const second = draftBlocker({ ...none, name: "Pale" });
    const third = draftBlocker({ ...none, name: "Pale", lines: [line] });
    const fourth = draftBlocker({ ...none, name: "Pale", lines: [line], mashSchedule: mash });
    const fifth = draftBlocker({ ...none, name: "Pale", lines: [line], mashSchedule: mash, efficiency: "75" });
    expect(first).toMatch(/name/i);
    expect(second).toMatch(/ingredient/i);
    expect(third).toMatch(/mash step/i);
    expect(fourth).toMatch(/efficiency/i);
    expect(fifth).toMatch(/attenuation/i);
    expect(draftBlocker({ ...ready, efficiency: "101" })).toMatch(/efficiency/i);
  });
});

describe("toRecipePageModel", () => {
  const materials = [
    { id: "m-malt", name: "CMG White Wheat", category: "malt", base_uom: "lb", extract_potential: 1.037 },
    { id: "m-hop", name: "Citra", category: "hop", base_uom: "lb", extract_potential: null },
    { id: "m-gypsum", name: "Gypsum", category: "salt", base_uom: "g", extract_potential: null },
  ];
  const ctx = { materials, profiles: [{ id: "p-target", name: "Pale ale" }], unit: "plato" as const, timeZone: "America/Los_Angeles" };
  const predicted = { ...snapshot, ogPlato: 12.5, fgPlato: 2.5, abv: 5.25 };

  it("titles the page with the version and reads each ingredient per bbl to three significant digits", () => {
    const model = toRecipePageModel({ ...predicted, ingredients: [{ ...snapshot.ingredients[0], per_bbl_qty: 40.909091 }] }, ctx);
    expect(model.title).toBe("Pale v3");
    expect(model.ingredients?.[0]?.detail).toContain("40.9 lb / bbl");
    expect(model.predicted).toMatch(/^Predicted: OG /);
  });
  it("counts mash steps and fermentation stages, and says No stages yet when there are none", () => {
    const model = toRecipePageModel({ ...predicted, version: { ...version, fermentation_schedule: [] } }, ctx);
    expect(model.mash?.title).toBe("Mash schedule · 1 step");
    expect(model.mash?.detail).toBe("Total 60 min · 152 °F saccharification rest");
    expect(model.fermentation?.detail).toBe("No stages yet");
  });
  it("titles the water row Water and names the target once, in its rows", () => {
    const model = toRecipePageModel(predicted, ctx);
    expect(model.water?.title).toBe("Water");
    expect(model.water?.rows?.filter((r) => r.detail === "Pale ale")).toHaveLength(1);
  });
  it("dates the version in the brewery's zone and carries the recipe note", () => {
    const model = toRecipePageModel({ ...predicted, recipe: { ...snapshot.recipe, note: "House pale" }, version: { ...version, created_at: "2026-10-01T03:00:00Z" } }, ctx);
    expect(model.saved).toBe("Sep 30, 2026");
    expect(model.note).toBe("House pale");
  });
  it("says which saved line had no extract potential instead of a prediction", () => {
    const model = toRecipePageModel({ ...snapshot, ingredients: [{ ...snapshot.ingredients[0], extract_snapshot: null }] }, ctx);
    expect(model.predicted).toBe("CMG White Wheat had no extract potential when this version was saved; set it under Materials, then create the next version.");
  });
  it("says a mash line stocked in a volume unit has no weight", () => {
    const model = toRecipePageModel({ ...snapshot, ingredients: [{ ...snapshot.ingredients[0], materials: { base_uom: "gal" } }] }, ctx);
    expect(model.predicted).toBe("CMG White Wheat is stocked in gal, which has no weight, so nothing is predicted.");
  });
  it("draws the empty recipe with no invented numbers", () => {
    const model = toRecipePageModel({ ...snapshot, version: null, ingredients: [], waterAdditions: [] }, ctx);
    expect(model.title).toBe("Pale");
    expect(model.empty).toBeTruthy();
    expect(model.mash).toBeUndefined();
    expect(model.saved).toBeUndefined();
  });
});

describe("gravityBlockerText", () => {
  it("speaks of a draft in the present tense", () => {
    expect(gravityBlockerText([{ index: 0, reason: "no_extract" }], () => "Pilsner", () => "lb", { saved: false }))
      .toBe("Pilsner has no extract potential; set it under Materials.");
  });
  it("is null when nothing blocks the prediction", () => {
    expect(gravityBlockerText([], () => "Pilsner", () => "lb", { saved: true })).toBeNull();
  });
});

describe("the read page and its brand picker", () => {
  const page = readFileSync("app/(app)/recipes/[id]/page.tsx", "utf8");
  const picker = readFileSync("app/(app)/recipes/[id]/recipe-brand-picker.tsx", "utf8");
  it("builds its model with toRecipePageModel", () => {
    expect(page).toMatch(/import \{[^}]*\btoRecipePageModel\b[^}]*\} from "@\/lib\/mgr\/recipe-view"/);
    expect(page).toContain("toRecipePageModel(");
  });
  it("keeps the brand picker enabled while it saves, and says so when it has", () => {
    expect(picker).not.toContain("disabled: busy");
    expect(picker).toContain('toast.success("Brand saved")');
  });
});

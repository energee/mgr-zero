// tests/recipe-view.test.ts — the recipe page's pure view-model: a saved
// version copied into a draft (versionToDraft, versionNumbers) and the first
// reason a draft cannot be saved (draftBlocker). No DB.
import { describe, expect, it } from "vitest";
import { draftBlocker, versionNumbers, versionToDraft, type RecipeSnapshot } from "@/lib/mgr/recipe-view";
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

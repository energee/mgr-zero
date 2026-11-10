// tests/recipe-view.test.ts — the recipe page's pure view-model: a saved
// copy turned into a draft (versionToDraft, versionNumbers), the first
// reason a draft cannot be saved (draftBlocker), the sheet's sections in
// brew-day order (RECIPE_SECTIONS), the page's model of a saved copy
// (toRecipePageModel), the earlier copies batches brewed (recipeHistory) and
// why a prediction is missing (gravityBlockerText, noMashText), and a brew-day
// line's batch total in packs at a typed batch size with its whole-pack
// rounding (ingredientPack, batchTotalText, packRounding), the draft's IBU
// preview (draftIbu), the headline figures (figureStrip), the offer to Refresh
// from Materials (materialsNowGive) and the rows a step lists (ingredientCells,
// mashView, fermentationView, waterView). No DB. "The sheet" draws RecipeView:
// sections, tables, step actions and the save bar. The last block reads the page and brand picker
// sources: the page draws toRecipePageModel, and the picker never disables
// itself while it saves.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeView } from "@/components/mgr/views/recipe";
import { describe, expect, it } from "vitest";
import { batchTotalText, draftBlocker, draftIbu, figureStrip, fermentationView, gravityBlockerText, ingredientCells, ingredientPack, loadedNotice, mashView, materialsNowGive, noMashText, packRounding, RECIPE_NUMBERS, RECIPE_SECTIONS, recipeHistory, recipePageTitle, toRecipePageModel, versionNumbers, versionToDraft, waterView, type RecipeFigures, type RecipeOutcome, type RecipeSnapshot } from "@/lib/mgr/recipe-view";
import { ibuText } from "@/lib/recipe-ibu";
import { INGREDIENT_STAGES, type IngredientLine, type MashStep } from "@/lib/mgr/recipe-process-view";
import { sgToPlato } from "@/lib/recipe-gravity";

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
  versions: [3, 2, 1],
  ingredients: [
    { id: "i1", material_id: "m-malt", per_bbl_qty: 40.9, stage: "mash", timing_minutes: null, sort: 0, extract_snapshot: 37, materials: { base_uom: "lb" } },
    { id: "i2", material_id: "m-hop", per_bbl_qty: 0.5, stage: "boil", timing_minutes: 60, sort: 1, extract_snapshot: null, materials: { base_uom: "lb" } },
  ],
  waterAdditions: [{ material_id: "m-gypsum", qty: 40, unit: "g", stage: "mash" }],
  ogPlato: null, fgPlato: null, abv: null, ibu: { kind: "none", reason: "no predicted OG" },
};

it("names recipe tabs and the page with the recipe alone, whichever copy is shown (#1255)", () => {
  expect(recipePageTitle(snapshot)).toBe("Pale");
  const earlier = { ...snapshot, version: { ...version, version: 1 } };
  expect(recipePageTitle(earlier)).toBe("Pale");
});

/** One closed batch of the snapshot's current copy (3), as get_recipe_outcomes returns it. */
const batch: RecipeOutcome = {
  batchId: "b1", batchNo: 9, version: 3, brewedOn: "2026-10-03", closed: true, ogPlato: 12.5, fgPlato: 2.5, abv: 5.3, apparentAttenuation: 0.8, brewhouseEfficiency: 0.7,
  predicted: null, assumedEfficiency: 0.725, assumedAttenuation: 0.07,
};

describe("figureStrip", () => {
  const full: RecipeFigures = { ogPlato: 12.5, fgPlato: 2.5, abv: 5.3, ibu: { kind: "estimate", ibu: 31, whirlpool: false } };
  it("draws OG, FG, ABV and IBU as figures, with nothing under them when nothing is missing", () => {
    expect(figureStrip(full, "plato", { saved: true })).toEqual({ figures: [["12.5 °P", "OG"], ["2.5 °P", "FG"], ["5.3%", "ABV"], ["31", "IBU"]], notes: [] });
    expect(figureStrip(full, "sg", { saved: true }).figures[0]).toEqual(["1.050", "OG"]);
  });
  it("keeps what an IBU figure leaves unsaid as a line under the strip", () => {
    expect(figureStrip({ ...full, ibu: { kind: "estimate", ibu: 31, whirlpool: true } }, "plato", { saved: true })).toMatchObject({ figures: expect.arrayContaining([["31", "IBU"]]), notes: ["IBU 31 · whirlpool hops at 5%"] });
    const gap = { kind: "lowerBound" as const, ibu: 31, gaps: [{ name: "Mosaic", reason: "no alpha acid" as const }] };
    expect(figureStrip({ ...full, ibu: gap }, "plato", { saved: false })).toMatchObject({ figures: expect.arrayContaining([["≥ 31", "IBU"]]), notes: ["IBU ≥ 31 · no alpha acid: Mosaic"] });
  });
  it("draws no figure it cannot predict, and says why", () => {
    const none: RecipeFigures = { ogPlato: null, fgPlato: null, abv: null, ibu: { kind: "none", reason: "no predicted OG" } };
    expect(figureStrip(none, "plato", { saved: false, why: "Pale malt has no extract potential; set it under Materials." })).toEqual({
      figures: [], notes: ["Pale malt has no extract potential; set it under Materials.", "IBU not estimated: no predicted OG"],
    });
    // A blank sheet has no IBU to speak of: draftBlocker already asks for an ingredient.
    expect(figureStrip({ ...none, ibu: undefined }, "plato", { saved: false })).toEqual({ figures: [], notes: [] });
  });
});

describe("materialsNowGive (Refresh from Materials)", () => {
  const saved: RecipeFigures = { ogPlato: 12.5, fgPlato: 2.5, abv: 5.3, ibu: { kind: "gaps", gaps: [{ name: "Citra", reason: "no alpha acid" }] } };
  it("is silent while Materials give what the saved copy froze, to the precision the figures show", () => {
    expect(materialsNowGive(saved, saved, "plato")).toBeUndefined();
    expect(materialsNowGive(saved, { ...saved, ogPlato: 12.52, abv: 5.31 }, "plato")).toBeUndefined();
  });
  it("names the figures Materials now give once one differs", () => {
    expect(materialsNowGive(saved, { ...saved, ibu: { kind: "estimate", ibu: 38, whirlpool: false } }, "plato")).toBe("Materials now give OG 12.5 °P · FG 2.5 °P · ABV 5.3% · IBU 38.");
    expect(materialsNowGive(saved, { ...saved, ogPlato: 13.1 }, "plato")).toBe("Materials now give OG 13.1 °P · FG 2.5 °P · ABV 5.3%.");
    const blocked: RecipeFigures = { ogPlato: null, fgPlato: null, abv: null, ibu: { kind: "none", reason: "no predicted OG" } };
    expect(materialsNowGive(blocked, saved, "plato")).toBe("Materials now give OG 12.5 °P · FG 2.5 °P · ABV 5.3%.");
  });
  it("counts a hop that gained its alpha acid even when the IBU stays a lower bound", () => {
    const two = { kind: "lowerBound" as const, ibu: 20, gaps: [{ name: "Citra", reason: "no alpha acid" as const }, { name: "Mosaic", reason: "no alpha acid" as const }] };
    expect(materialsNowGive({ ...saved, ibu: two }, { ...saved, ibu: { ...two, gaps: [two.gaps[0]] } }, "plato")).toBe("Materials now give OG 12.5 °P · FG 2.5 °P · ABV 5.3% · IBU ≥ 20.");
  });
  it("offers nothing when the page cannot tell what a refresh would give (a line whose material it cannot see)", () => {
    expect(materialsNowGive(saved, null, "plato")).toBeUndefined();
  });
});

describe("the sheet's rows", () => {
  it("reads a line's per-bbl amount to three significant digits, with its timing apart", () => {
    expect(ingredientCells("mash", null, 40.909091, "lb")).toEqual({ stage: "mash", amount: "40.9 lb", timing: "" });
    expect(ingredientCells("boil", "60", "0.011364", "lb")).toEqual({ stage: "boil", amount: "0.0114 lb", timing: "60 min" });
    expect(ingredientCells("dry_hop", 3 * 1440, 1.2)).toEqual({ stage: "dry_hop", amount: "1.2", timing: "day 3" });
  });
  it("lists a schedule's rows under its count and summary, the same for the editor and a saved copy", () => {
    expect(mashView([{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }])).toEqual({
      title: "Schedule · 1 step", detail: "Total 60 min · 152 °F saccharification rest", rows: [{ title: "Saccharification", detail: "Infusion · 152 °F · 60 min" }],
    });
    expect(fermentationView([])).toEqual({ title: "Schedule · 0 stages", detail: "No stages yet", rows: [] });
    expect(fermentationView([{ name: "Primary", kind: "primary", tempF: 68, days: 7 }]).rows).toEqual([{ title: "Primary", detail: "68 °F · 7 days" }]);
  });
  it("lists the water the sheet holds, and says so when it holds none", () => {
    const water = { targetProfileId: "p-target", sourceProfileId: "", mashGal: "120", spargeGal: "", targetMashPh: "5.3", additions: [{ materialId: "m-gypsum", qty: 40, unit: "g", stage: "mash" }] };
    expect(waterView(water, [{ id: "p-target", name: "Pale ale" }], () => "Gypsum")).toEqual({
      title: "Profile and additions", detail: "",
      rows: [{ title: "Target profile", detail: "Pale ale" }, { title: "Mash water", detail: "120 gal" }, { title: "Target mash pH", detail: "5.3" }, { title: "Gypsum", detail: "40 g · Mash" }],
    });
    expect(waterView({ ...water, targetProfileId: "", mashGal: "", targetMashPh: "", additions: [] }, [], () => "")).toEqual({ title: "Profile and additions", detail: "None yet", rows: [] });
  });
});

describe("RECIPE_SECTIONS", () => {
  it("runs in brew-day order", () => {
    expect(RECIPE_SECTIONS.map((s) => s.title)).toEqual(["Water", "Mash", "Boil", "Whirlpool", "Knockout", "Fermentation", "Packaging and other"]);
  });
  it("puts every ingredient stage and every process number in exactly one section", () => {
    expect(RECIPE_SECTIONS.flatMap((s) => s.stages).sort()).toEqual([...INGREDIENT_STAGES].sort());
    expect(RECIPE_SECTIONS.flatMap((s) => s.numbers).sort()).toEqual(RECIPE_NUMBERS.map(([key]) => key).sort());
  });
});

describe("recipeHistory", () => {
  const earlier = [{ ...batch, batchId: "b7", batchNo: 7, version: 2, brewedOn: "2026-09-01" }, { ...batch, batchId: "b5", batchNo: 5, version: 2, brewedOn: "2026-08-12" }];
  it("has no row without a batch, or with batches of the current copy only", () => {
    expect(recipeHistory([], 3, 3)).toEqual([]);
    expect(recipeHistory([batch], 3, 3)).toEqual([]);
  });
  it("gives one row for an earlier copy batches brewed, and none for a copy nobody brewed", () => {
    expect(recipeHistory([batch, ...earlier], 3, 3)).toEqual([
      { title: "B-0005 to B-0007", detail: "2 batches · Aug 12, 2026 – Sep 1, 2026", href: "?v=2", selected: false },
    ]);
  });
  it("lists the newest copy first, names one batch alone, and marks the copy being shown", () => {
    const first = { ...batch, batchId: "b2", batchNo: 2, version: 1, brewedOn: "2026-07-04" };
    expect(recipeHistory([batch, ...earlier, first], 1, 3)).toEqual([
      { title: "B-0005 to B-0007", detail: "2 batches · Aug 12, 2026 – Sep 1, 2026", href: "?v=2", selected: false },
      { title: "B-0002", detail: "1 batch · Jul 4, 2026", href: "?v=1", selected: true },
    ]);
  });
});

describe("loadedNotice (Use this again)", () => {
  const earlier = [{ ...batch, batchId: "b7", batchNo: 7, version: 2, brewedOn: "2026-09-01" }, { ...batch, batchId: "b5", batchNo: 5, version: 2, brewedOn: "2026-08-12" }];
  it("names the batches that brewed the loaded copy and what saving does", () => {
    expect(loadedNotice([batch, ...earlier], 2, 3)).toBe("Loaded the recipe as brewed in B-0005 to B-0007. Save changes to make it the current recipe.");
  });
  it("says so when no batch brewed the loaded copy", () => {
    expect(loadedNotice([batch, ...earlier], 1, 3)).toBe("Loaded an earlier recipe no batch brewed. Save changes to make it the current recipe.");
  });
  it("loads the earlier copy's own amounts, not the current one's", () => {
    const loaded = versionToDraft({ ...snapshot, version: { ...version, version: 2, note: "Before the Citra change" }, ingredients: snapshot.ingredients.map((i) => ({ ...i, per_bbl_qty: 99 })) })!;
    expect(loaded.notes).toBe("Before the Citra change");
    expect(loaded.lines.every((l) => l.perBblQty === "99")).toBe(true);
  });
});

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
  it("names every unmet requirement in one Still needed sentence (#1481)", () => {
    const none = { name: " ", lines: [{ ...line, perBblQty: "" }], mashSchedule: [], efficiency: "0", attenuation: "" };
    expect(draftBlocker(none)).toBe("Still needed: a recipe name, an ingredient with a quantity per bbl, a mash step, brewhouse efficiency from 0 to 100%, and yeast attenuation from 0 to 100%.");
    expect(draftBlocker({ ...none, name: "Pale", lines: [line], mashSchedule: mash, efficiency: "75" })).toBe("Still needed: yeast attenuation from 0 to 100%.");
    expect(draftBlocker({ ...ready, efficiency: "101" })).toBe("Still needed: brewhouse efficiency from 0 to 100%.");
  });
  it("names an out-of-range process number before the version is cut (#1478)", () => {
    expect(draftBlocker({ ...ready, numbers: { preBoil: "-1" } })).toBe("Still needed: a pre-boil volume above zero.");
    expect(draftBlocker({ ...ready, numbers: { boilMin: "-5" } })).toBe("Still needed: a boil time of one or more whole minutes.");
    expect(draftBlocker({ ...ready, numbers: { whirlpoolTemp: "5000" } })).toBe("Still needed: a whirlpool temperature from 25 to 212 °F.");
    expect(draftBlocker({ ...ready, numbers: { knockoutTemp: "-300" } })).toBe("Still needed: a knockout temperature from 25 to 212 °F.");
    expect(draftBlocker({ ...ready, numbers: { whirlpoolMin: "1e1" } })).toBe("Still needed: a whirlpool time of zero or more whole minutes.");
    expect(draftBlocker({ ...ready, numbers: { whirlpoolRest: "-1" } })).toBe("Still needed: a whirlpool rest of zero or more whole minutes.");
    expect(draftBlocker({ ...ready, numbers: { preBoil: "7", boilMin: "60", whirlpoolTemp: "180", knockoutTemp: "66", whirlpoolMin: "" } })).toBeNull();
  });
  it("names a line whose timing is out of range instead of dropping it (#1478)", () => {
    const boil = { ...line, stage: "boil" as const, timingMinutes: "90" };
    expect(draftBlocker({ ...ready, lines: [line, boil], numbers: { boilMin: "60" } })).toBe("Still needed: boil timing from 0 to 60 minutes.");
    const dryHop = { ...line, stage: "dry_hop" as const, timingMinutes: String(121 * 1440) };
    expect(draftBlocker({ ...ready, lines: [line, dryHop] })).toBe("Still needed: dry hop timing from day 0 to 120.");
    // A schedule longer than 120 days, conditioning included, raises the ceiling.
    const long = [{ name: "Primary", kind: "primary", tempF: 68, days: 30 }, { name: "Barrel", kind: "conditioning", tempF: 55, days: 150 }];
    expect(draftBlocker({ ...ready, lines: [line, dryHop], fermentationSchedule: long })).toBeNull();
  });
});

describe("draftIbu", () => {
  const text = (...args: Parameters<typeof draftIbu>) => { const ibu = draftIbu(...args); return ibu && ibuText(ibu, { saved: false }); };
  const hop = { id: "m-hop", name: "Citra", category: "hop", base_uom: "lb", extract_potential: null, alpha_acid: 10, purchase_uom_factor: 44 };
  const line = { materialId: "m-hop", perBblQty: "1", stage: "boil" as const, timingMinutes: "60" };
  const og = sgToPlato(1.05);

  it("reads each material's current alpha acid, which saving will freeze", () => {
    expect(text([line], og, [hop])).toBe("IBU 89");
    expect(text([line, { ...line, stage: "whirlpool", timingMinutes: "" }], og, [hop])).toBe("IBU 108 · whirlpool hops at 5%");
  });
  it("says what is missing without the saved version's remedy", () => {
    expect(text([line], og, [{ ...hop, alpha_acid: null }])).toBe("IBU not estimated: no alpha acid: Citra");
    expect(text([{ ...line, timingMinutes: "" }], og, [hop])).toBe("IBU not estimated: no boil time: Citra");
    expect(text([line], null, [hop])).toBe("IBU not estimated: no predicted OG");
  });
  it("draws nothing before there is a line, because draftBlocker already asks for one", () => {
    expect(text([], og, [hop])).toBeUndefined();
  });
  it("shows a gap for a line whose material is hidden from the picker, instead of dropping it", () => {
    const inactive = { ...line, materialId: "aaaaaaaa-gone" };
    expect(text([line, inactive], og, [hop])).toBe("IBU ≥ 89 · no alpha acid: aaaaaaaa · not by weight: aaaaaaaa");
  });
});

describe("toRecipePageModel", () => {
  const materials = [
    { id: "m-malt", name: "Fieldstone White Wheat", category: "malt", base_uom: "lb", extract_potential: 1.037, alpha_acid: null, purchase_uom_factor: 50 },
    { id: "m-hop", name: "Citra", category: "hop", base_uom: "lb", extract_potential: null, alpha_acid: 12.5, purchase_uom_factor: 44 },
    { id: "m-gypsum", name: "Gypsum", category: "salt", base_uom: "g", extract_potential: null, alpha_acid: null, purchase_uom_factor: 1 },
  ];
  const ctx = { materials, profiles: [{ id: "p-target", name: "Pale ale" }], unit: "plato" as const, timeZone: "America/Los_Angeles", outcomes: [] as RecipeOutcome[] };
  const predicted = { ...snapshot, ogPlato: 12.5, fgPlato: 2.5, abv: 5.25 };

  it("prints the IBU get_recipe estimated from the frozen alpha acid, with the fix for a saved copy", () => {
    expect(toRecipePageModel({ ...predicted, ibu: { kind: "estimate", ibu: 31, whirlpool: true } }, ctx)).toMatchObject({ figures: expect.arrayContaining([["31", "IBU"]]), figureNotes: ["IBU 31 · whirlpool hops at 5%"] });
    const lowerBound = { kind: "lowerBound" as const, ibu: 31, gaps: [{ name: "Mosaic", reason: "no alpha acid" as const }] };
    expect(toRecipePageModel({ ...predicted, ibu: lowerBound }, ctx).figureNotes).toEqual(["IBU ≥ 31 · no alpha acid: Mosaic; set alpha acid under Materials, then Refresh from Materials on the current recipe"]);
  });

  it("titles the page with the recipe and reads each ingredient per bbl to three significant digits", () => {
    const model = toRecipePageModel({ ...predicted, ingredients: [{ ...snapshot.ingredients[0], per_bbl_qty: 40.909091 }] }, ctx);
    expect(model.title).toBe("Pale");
    expect(model.ingredients?.[0]).toMatchObject({ amount: "40.9 lb", timing: "" });
    // The snapshot's IBU has no estimate, so the strip holds the three gravity figures and the IBU line says why.
    expect(model.figures).toEqual([["12.5 °P", "OG"], ["2.5 °P", "FG"], ["5.3%", "ABV"]]);
    expect(model.figureNotes).toEqual(["IBU not estimated: no predicted OG"]);
  });
  it("gives each line its stage, which is what places it in a section", () => {
    expect(toRecipePageModel(predicted, ctx).ingredients?.map((i) => i.stage)).toEqual(["mash", "boil"]);
  });
  it("gives each saved brew-day line its pack, from list_materials' purchase_uom_factor", () => {
    const model = toRecipePageModel(predicted, ctx);
    expect(model.ingredients?.map((i) => i.pack)).toEqual([{ perBbl: 40.9, factor: 50, unit: "lb" }, { perBbl: 0.5, factor: 44, unit: "lb" }]);
  });
  it("counts mash steps and fermentation stages, and says No stages yet when there are none", () => {
    const model = toRecipePageModel({ ...predicted, version: { ...version, fermentation_schedule: [] } }, ctx);
    expect(model.mash?.title).toBe("Schedule · 1 step");
    expect(model.mash?.detail).toBe("Total 60 min · 152 °F saccharification rest");
    expect(model.fermentation?.detail).toBe("No stages yet");
  });
  it("lists the saved water under Profile and additions and names the target once, in its rows", () => {
    const model = toRecipePageModel(predicted, ctx);
    expect(model.water?.title).toBe("Profile and additions");
    expect(model.water?.rows.map((r) => r.title)).toEqual(["Target profile", "Mash water", "Target mash pH", "Gypsum"]);
    expect(model.water?.rows.filter((r) => r.detail === "Pale ale")).toHaveLength(1);
  });
  it("dates the saved copy in the brewery's zone and carries the recipe note", () => {
    const model = toRecipePageModel({ ...predicted, recipe: { ...snapshot.recipe, note: "House pale" }, version: { ...version, created_at: "2026-10-01T03:00:00Z" } }, ctx);
    expect(model.saved).toBe("Sep 30, 2026");
    expect(model.recipeNote).toBe("House pale");
  });
  it("lists earlier brewed copies under the current recipe, and reads an earlier copy as brewed, read only", () => {
    const outcomes = [batch, { ...batch, batchId: "b3", batchNo: 3, version: 1, brewedOn: "2026-08-02" }];
    const current = toRecipePageModel(predicted, { ...ctx, outcomes });
    expect(current.asBrewed).toBeUndefined();
    expect(current.useAgainHref).toBeUndefined();
    expect(current.backHref).toBe("/recipes");
    expect(current.history).toEqual([{ title: "B-0003", detail: "1 batch · Aug 2, 2026", href: "?v=1", selected: false }]);
    const currentHtml = renderToStaticMarkup(createElement(RecipeView, { model: current, readOnly: true }));
    expect(currentHtml).toMatch(/<h2[^>]*>As brewed<\/h2>/);
    expect(currentHtml).toMatch(/<a\b(?=[^>]*href="\?v=1")[^>]*data-to="Recipe"/);

    const model = toRecipePageModel({ ...predicted, version: { ...version, version: 1 } }, { ...ctx, outcomes });
    expect(model.asBrewed).toBe("As brewed in B-0003 · read only");
    expect(model.useAgainHref).toBe("/recipes/r1?from=1");
    expect([model.backLabel, model.backHref]).toEqual(["Current recipe", "/recipes/r1"]);
    expect(model.history?.[0]?.selected).toBe(true);
    const html = renderToStaticMarkup(createElement(RecipeView, { model, readOnly: true, parentForm: "Editable brand" }));
    expect(html).toContain("As brewed in B-0003 · read only");
    expect(html).toMatch(/<a\b[^>]*href="\/recipes\/r1\?from=1"[^>]*>Use this again<\/a>/);
    expect(html).toContain("Less crystal");
    expect(html).not.toContain("Editable brand");
    // The copy being shown is named in the list, not linked to itself.
    expect(html).not.toContain('href="?v=1"');
    // The one input is Show totals at, a page-only batch size that never edits the copy.
    expect(html.replace(/<input[^>]*aria-label="Show totals at \(bbl\)"[^>]*>/, "")).not.toMatch(/<input|<select|<form/);
    // No copy says "version" on screen, current or earlier.
    for (const drawn of [html, currentHtml]) expect(drawn.replace(/<[^>]+>/g, " ")).not.toMatch(/version|\bv\d\b/i);
    // An earlier copy no batch brewed is reachable by its address only.
    expect(toRecipePageModel({ ...predicted, version: { ...version, version: 2 } }, { ...ctx, outcomes }).asBrewed).toBe("An earlier recipe no batch brewed · read only");
  });
  it("offers Schedule batch as the one title-row verb, on the current recipe only (#1581)", () => {
    const current = toRecipePageModel(predicted, ctx);
    expect(current.scheduleHref).toBe("/batches?recipe=r1");
    const drawn = (model: typeof current) => renderToStaticMarkup(createElement(RecipeView, { model, readOnly: true }));
    expect(drawn(current)).toContain('href="/batches?recipe=r1"');
    expect(drawn(current)).toContain("Schedule batch");
    expect(drawn(toRecipePageModel({ ...predicted, version: { ...version, version: 1 } }, ctx))).not.toContain("Schedule batch");
    const unwritten = toRecipePageModel({ ...snapshot, version: null, ingredients: [], waterAdditions: [] }, ctx);
    expect(unwritten.scheduleHref).toBeUndefined();
    expect(drawn(unwritten)).not.toContain("Schedule batch");
    for (const model of [current, unwritten]) expect(drawn(model)).not.toContain("New recipe version");
  });
  it("says nothing is predicted when the recipe has no mash ingredient", () => {
    const model = toRecipePageModel({ ...snapshot, ingredients: [snapshot.ingredients[1]] }, ctx);
    expect(model.figures).toEqual([]);
    expect(model.figureNotes?.[0]).toBe("No mash ingredient, so nothing is predicted.");
  });
  it("lists every copy's batches, marks an earlier copy's, and summarizes only the shown copy", () => {
    const outcomes = [batch, { ...batch, batchId: "b2", batchNo: 8, brewhouseEfficiency: 0.71 }, { ...batch, batchId: "b3", batchNo: 7, version: 2 }];
    const model = toRecipePageModel(predicted, { ...ctx, unit: "sg", outcomes });
    expect(model.tape?.map(([label]) => label)).toEqual(["B-0009 · Oct 3, 2026", "B-0008 · Oct 3, 2026", "B-0007 · Oct 3, 2026 · earlier recipe"]);
    expect(model.tape?.[0]?.[1]).toContain("OG 1.050");
    expect(model.actualsNote).toMatch(/^2 batches: efficiency 70–71% against 73% assumed/);
  });
  it("has no Batch actuals with no batches", () => {
    const model = toRecipePageModel(predicted, ctx);
    expect(model.tape).toBeUndefined();
    expect(model.actualsNote).toBeUndefined();
  });
  it("gives a recipe not written yet a title and nothing invented", () => {
    const model = toRecipePageModel({ ...snapshot, version: null, ingredients: [], waterAdditions: [] }, ctx);
    expect(model).toEqual({ title: "Pale", backHref: "/recipes", recipeNote: undefined });
    const drawn = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model }));
    expect(drawn).not.toMatch(/No version yet|<h2|<dt/);
  });
});

describe("the sheet", () => {
  const materials = [{ id: "m-malt", name: "Fieldstone White Wheat", category: "malt", base_uom: "lb", extract_potential: 1.037, alpha_acid: null, purchase_uom_factor: 50 }];
  const saved = toRecipePageModel(snapshot, { materials, profiles: [], unit: "plato", timeZone: "UTC", outcomes: [] });
  const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
  const steps: string[] = RECIPE_SECTIONS.map((s) => s.title);
  const controls = { set: () => {}, onSubmit: () => {} };

  it("reads a saved copy in brew-day order, each ingredient and number under its step", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { model: saved, readOnly: true }));
    expect(headings(html).filter((h) => steps.includes(h))).toEqual(["Water", "Mash", "Boil", "Whirlpool", "Knockout", "Fermentation"]);
    const at = (text: string) => html.indexOf(text);
    const between = (text: string, from: string, to: string) => at(text) > at(`>${from}</h2>`) && at(text) < at(`>${to}</h2>`);
    expect(between("Fieldstone White Wheat", "Mash", "Boil")).toBe(true);
    expect(between("Brewhouse efficiency %", "Mash", "Boil")).toBe(true);
    expect(between("Schedule · 1 step", "Mash", "Boil")).toBe(true);
    expect(between("Pre-boil volume bbl", "Boil", "Whirlpool")).toBe(true);
    expect(between("Whirlpool min", "Whirlpool", "Knockout")).toBe(true);
    expect(between("Knockout temp °F", "Knockout", "Fermentation")).toBe(true);
    expect(at("Yeast attenuation %")).toBeGreaterThan(at(">Fermentation</h2>"));
    // The old flat headings are gone, and so is an empty step.
    expect(headings(html)).not.toEqual(expect.arrayContaining(["Ingredients"]));
    expect(headings(html)).not.toEqual(expect.arrayContaining(["Process"]));
    const bare = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Pale", boilMin: "60" } }));
    expect(headings(bare)).toEqual(["Boil"]);
  });

  it("draws every step on the editor, and Packaging and other only once it has a line", () => {
    const blank = renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "" } }));
    expect(headings(blank)).toEqual(["Water", "Mash", "Boil", "Whirlpool", "Knockout", "Fermentation"]);
    const cans = { key: "c", title: "Cans", amount: "330 each", timing: "", stage: "packaging" as const };
    const html = renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "", ingredients: [cans] } }));
    expect(headings(html)).toContain("Packaging and other");
    expect(html.indexOf("Cans")).toBeGreaterThan(html.indexOf(">Packaging and other</h2>"));
  });

  it("adds an ingredient from the step it belongs to", () => {
    // Each step's action reads Add ingredient on screen, and names its step after for a screen reader.
    const blank = renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "" } })).replace(/<[^>]+>/g, "");
    for (const label of ["Add ingredient to mash", "Add ingredient to boil", "Add ingredient to whirlpool", "Add ingredient to fermentation"]) expect(blank).toContain(label);
    expect(blank).not.toMatch(/Add ingredient to (water|knockout|packaging and other)/);
    // The live editor's sheet takes the step's first stage and that row as its trigger.
    const live = renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "" }, controls: { ...controls, dirty: false }, slots: { addIngredient: (stage) => `SHEET:${stage}` } }));
    expect(live.match(/SHEET:\w+/g)).toEqual(["SHEET:mash", "SHEET:boil", "SHEET:whirlpool", "SHEET:fermentation"]);
    expect(renderToStaticMarkup(createElement(RecipeView, { model: saved, readOnly: true }))).not.toMatch(/Add ingredient/);
  });

  it("draws the save bar only once the sheet differs from what is saved", () => {
    const model = { title: "Pale", saved: "Oct 1, 2026", scheduleHref: "/batches?recipe=r1", notes: "" };
    const draw = (dirty: boolean) => renderToStaticMarkup(createElement(RecipeView, { model, controls: { ...controls, dirty, onDiscard: () => {} } }));
    expect(draw(false)).not.toMatch(/Save changes|Discard/);
    expect(draw(false)).toContain("Schedule batch");
    expect(draw(true)).toMatch(/<button[^>]*type="submit"[^>]*>Save changes</);
    expect(draw(true)).toMatch(/<button[^>]*type="button"[^>]*>Discard</);
    // Schedule batch would schedule what is saved, not what is on screen.
    expect(draw(true)).not.toContain("Schedule batch");
  });

  it("keeps the save bar up while a recipe is being created, with nothing to discard", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", notes: "" }, controls: { ...controls, dirty: true, submitLabel: "Create recipe" } }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Create recipe</);
    expect(html).not.toContain("Discard");
  });

  it("lists a step's ingredients as a table: amount per bbl, a Timing column only where a line has one, and the name as the line's Edit", () => {
    const hop = { key: "h", title: "Citra", amount: "0.4 lb", timing: "10 min", stage: "boil" as const };
    const malt = { key: "m", title: "2-row", amount: "44 lb", timing: "", stage: "mash" as const };
    const dry = { key: "d", title: "Citra", amount: "1.2 lb", timing: "", stage: "dry_hop" as const };
    const html = renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "", ingredients: [malt, hop, dry] } }));
    const tableAfter = (heading: string) => html.slice(html.indexOf(`>${heading}</h2>`)).match(/<table[\s\S]*?<\/table>/)![0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(tableAfter("Mash")).toBe("Ingredient Per bbl Edit 2-row 44 lb");
    expect(tableAfter("Boil")).toBe("Ingredient Per bbl Timing Edit Citra 0.4 lb 10 min");
    // A stage that shares its step names itself where the timing goes.
    expect(tableAfter("Fermentation")).toBe("Ingredient Per bbl Timing Edit Citra 1.2 lb Dry hop");
    // The live editor wraps the name in the line's sheet; a read-out draws the name alone.
    const live = renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "", ingredients: [{ ...malt, edit: () => "SHEET:2-row" }] }, controls: { ...controls, dirty: false } }));
    expect(live).toContain("SHEET:2-row");
    expect(renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Pale", ingredients: [malt] } }))).not.toMatch(/<button|Edit /);
  });

  it("lists a schedule's rows under its count and summary, with one action that opens its sheet", () => {
    const mash = { title: "Schedule · 1 step", detail: "Total 60 min · 152 °F saccharification rest", rows: [{ title: "Saccharification", detail: "Infusion · 152 °F · 60 min" }] };
    const draw = (props: Partial<Parameters<typeof RecipeView>[0]>) => renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "", mash }, ...props }));
    const text = draw({}).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Schedule · 1 step Total 60 min · 152 °F saccharification rest Saccharification Infusion · 152 °F · 60 min");
    expect(text).toContain("Edit schedule for mash");
    expect(draw({ controls: { ...controls, dirty: false }, slots: { schedule: (key) => `SHEET:${key}` } })).toContain("SHEET:mash");
    expect(draw({ readOnly: true })).not.toMatch(/Edit schedule/);
  });

  it("heads the sheet with the predicted figures, and offers Refresh from Materials only when the editor says they are stale", () => {
    const model = { title: "Pale", saved: "Oct 1, 2026", notes: "", figures: [["12.5 °P", "OG"]] as [string, string][], figureNotes: ["IBU not estimated: no predicted OG"] };
    const draw = (refresh?: { text: string; onRefresh: () => void }) => renderToStaticMarkup(createElement(RecipeView, { model, controls: { ...controls, dirty: false, refresh } }));
    expect(draw()).toMatch(/12\.5 °P<\/div><div[^>]*>OG</);
    expect(draw()).toContain("IBU not estimated: no predicted OG");
    expect(draw()).not.toContain("Refresh from Materials");
    const stale = draw({ text: "Materials now give OG 13.1 °P.", onRefresh: () => {} });
    expect(stale).toContain("Materials now give OG 13.1 °P.");
    expect(stale).toMatch(/<button[^>]*type="button"[^>]*>Refresh from Materials</);
  });

  it("asks for a change note, and reads it out on a saved copy", () => {
    expect(renderToStaticMarkup(createElement(RecipeView, { model: { title: "Pale", notes: "" } }))).toContain("Change note · optional");
    expect(renderToStaticMarkup(createElement(RecipeView, { model: saved, readOnly: true }))).toMatch(/<dt[^>]*>Change note<\/dt><dd[^>]*>Less crystal<\/dd>/);
  });
});

describe("batch totals in packs", () => {
  const malt = { perBbl: 10, factor: 50, unit: "lb" };
  it("reads a brew-day line's total at the batch size (the text after the arrow), in whole packs plus loose pounds", () => {
    expect(batchTotalText(malt, 22)).toBe("220 lb = 4 × 50 lb + 20 lb");
    expect(batchTotalText({ ...malt, perBbl: 2.5, factor: 55 }, 22)).toBe("55 lb = 1 × 55 lb");
  });
  it("stays in base units for a material with no pack, or a total under one pack", () => {
    expect(batchTotalText({ ...malt, factor: 1 }, 22)).toBe("220 lb");
    expect(batchTotalText({ perBbl: 0.4, factor: 44, unit: "lb" }, 22)).toBe("8.8 lb");
  });
  it("totals exactly to the stored 4 decimals, so 9.090909 lb/bbl at 22 bbl is 200 lb", () => {
    expect(batchTotalText({ ...malt, perBbl: 9.090909 }, 22)).toBe("200 lb = 4 × 50 lb");
  });
  it("offers rounding down and up to whole packs, each as a per-bbl amount to 6 decimals", () => {
    expect(packRounding(malt, 22)).toEqual({ whole: false, choices: [
      { label: "Round to 4 × 50 lb", perBbl: 9.090909 },
      { label: "Round to 5 × 50 lb", perBbl: 11.363636 },
    ] });
  });
  it("offers only rounding up when the total is under one pack", () => {
    expect(packRounding({ perBbl: 0.4, factor: 44, unit: "lb" }, 22)).toEqual({ whole: false, choices: [{ label: "Round to 1 × 44 lb", perBbl: 2 }] });
  });
  it("says whole packs, with nothing to offer, when the total already is", () => {
    expect(packRounding({ ...malt, perBbl: 9.090909 }, 22)).toEqual({ whole: true, choices: [] });
  });
  it("offers nothing for a material with no pack", () => {
    expect(packRounding({ ...malt, factor: 1 }, 22)).toBeNull();
  });
  it("shows the real total a rounded per-bbl amount gives, even a hair off whole packs", () => {
    const [up] = packRounding({ perBbl: 0.01, factor: 50, unit: "lb" }, 3000)!.choices;
    expect(up).toEqual({ label: "Round to 1 × 50 lb", perBbl: 0.016667 });
    expect(batchTotalText({ perBbl: up.perBbl, factor: 50, unit: "lb" }, 3000)).toBe("50.001 lb = 1 × 50 lb + 0.001 lb");
  });
  it("draws totals only once a batch size is typed, and Round only on the draft", () => {
    const model = { title: "Pale", ingredients: [{ key: "i1", title: "2-row", amount: "10 lb", timing: "", stage: "mash" as const, pack: malt }] };
    const draw = (m: typeof model & { totalsAtBbl?: string }, readOnly: boolean) => renderToStaticMarkup(createElement(RecipeView, { model: m, readOnly }));
    expect(draw(model, true)).toContain("Enter a batch size to see totals in packs");
    expect(draw(model, true)).not.toContain("220 lb");
    const read = draw({ ...model, totalsAtBbl: "22" }, true);
    // The total has a column of its own, headed by the size.
    expect(read).toMatch(/<th[^>]*>At 22 bbl<\/th>/);
    expect(read).toContain("220 lb = 4 × 50 lb + 20 lb");
    expect(draw(model, true)).not.toMatch(/<th[^>]*>At /);
    expect(read).not.toContain("Round to");
    expect(draw({ ...model, totalsAtBbl: "22" }, false)).toContain("Round to 5 × 50 lb");
    expect(draw({ ...model, totalsAtBbl: "22", ingredients: [{ ...model.ingredients[0], pack: { ...malt, perBbl: 9.090909 } }] }, false)).toContain("Whole packs");
  });
  it("#1479 reads an exponent batch size as no size, and says why", () => {
    const model = { title: "Pale", ingredients: [{ key: "i1", title: "2-row", amount: "10 lb", timing: "", stage: "mash" as const, pack: malt }], totalsAtBbl: "1e1" };
    const html = renderToStaticMarkup(createElement(RecipeView, { model, readOnly: true }));
    expect(html).not.toContain("100 lb");
    expect(html).toContain("Enter a decimal number, not exponent notation");
  });
  it("gives a pack to brew-day lines only, from the material's pack size", () => {
    const material = { base_uom: "lb", purchase_uom_factor: 50 };
    expect(ingredientPack("whirlpool", 2, material)).toEqual({ perBbl: 2, factor: 50, unit: "lb" });
    expect(ingredientPack("dry_hop", 2, material)).toBeUndefined();
    expect(ingredientPack("mash", 2, undefined)).toBeUndefined();
    expect(ingredientPack("mash", 0, material)).toBeUndefined();
  });
  it("coerces a numeric pack size that arrives as a string", () => {
    expect(ingredientPack("mash", 10, { base_uom: "lb", purchase_uom_factor: "55.000000" as unknown as number })?.factor).toBe(55);
  });
});

describe("noMashText", () => {
  it("names a missing mash ingredient when there are lines but none is mash", () => {
    expect(noMashText(["boil", "dry_hop"])).toBe("No mash ingredient, so nothing is predicted.");
  });
  it("is null on an empty draft, where draftBlocker already asks for an ingredient", () => {
    expect(noMashText([])).toBeNull();
  });
  it("is null when a mash line is present", () => {
    expect(noMashText(["mash", "boil"])).toBeNull();
  });
});

describe("gravityBlockerText", () => {
  it("speaks of a draft in the present tense", () => {
    expect(gravityBlockerText([{ index: 0, reason: "no_extract" }], () => "Pilsner", () => "lb", { saved: false }))
      .toBe("Pilsner has no extract potential; set it under Materials.");
  });
  it("tells a saved copy's reader how to pick the fix up, without naming a version", () => {
    expect(gravityBlockerText([{ index: 0, reason: "no_extract" }], () => "Pilsner", () => "lb", { saved: true }))
      .toBe("Pilsner had no extract potential when this recipe was saved; set it under Materials, then Refresh from Materials on the current recipe.");
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

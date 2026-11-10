// tests/recipe-view.test.ts — the recipe page's pure view-model: a saved
// copy turned into a draft (versionToDraft, versionNumbers), the first
// reason a draft cannot be saved (draftBlocker), the eight process numbers in
// the order their sheet draws them (RECIPE_NUMBERS), the page's model of a saved copy
// (toRecipePageModel), the earlier copies batches brewed (recipeHistory) and
// why a prediction is missing (gravityBlockerText, noMashText), a line's batch
// amount in packs at the recipe's batch size with its whole-pack rounding
// (ingredientPack, batchTotalText, packRounding), each mash line's share of the
// grain bill (gristShares), the draft's IBU
// preview (draftIbu), the headline figures (figureStrip), the offer to Refresh
// from Materials (materialsNowGive), a line's cells (ingredientCells) and the
// water the page reads (waterFacts). No DB. "The sheet" draws RecipeView: the
// sentence, the figures, the band, the two lists, their actions and the save
// bar (lib/mgr/recipe-day-view.ts works the drawings and rows out, and
// tests/recipe-day-view.test.ts covers it). The last block reads the page and
// editor sources: the page draws toRecipePageModel, and the brand pick never
// disables itself while it saves.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeView } from "@/components/mgr/views/recipe";
import { RecipeNumbersView } from "@/components/mgr/views/recipe-numbers";
import { describe, expect, it } from "vitest";
import { batchTotalText, draftBlocker, draftIbu, figureStrip, gravityBlockerText, gristShares, ingredientCells, ingredientPack, loadedNotice, materialsNowGive, noMashText, packRounding, RECIPE_NUMBERS, recipeHistory, recipePageTitle, toRecipePageModel, versionNumbers, versionToDraft, waterFacts, type RecipeFigures, type RecipeIngredientView, type RecipeOutcome, type RecipePack, type RecipeSnapshot } from "@/lib/mgr/recipe-view";
import { ibuText } from "@/lib/recipe-ibu";
import type { IngredientLine, MashStep } from "@/lib/mgr/recipe-process-view";
import { sgToPlato } from "@/lib/recipe-gravity";

const version: NonNullable<RecipeSnapshot["version"]> = {
  id: "v1", version: 3, created_at: "2026-10-01T15:00:00Z", mash_temp_f: null,
  brewhouse_efficiency: 0.725, yeast_attenuation: 0.07, boil_minutes: 60, note: "Less crystal",
  batch_bbl: null, pre_boil_bbl: 16.8, whirlpool_minutes: 20, whirlpool_temp_f: null, whirlpool_rest_minutes: null, knockout_temp_f: 66,
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
    // Specific gravity prints coarser than a tenth of a degree Plato: 15.14 and 15.16 °P both read 1.062.
    expect(materialsNowGive({ ...saved, ogPlato: 15.14 }, { ...saved, ogPlato: 15.16 }, "sg")).toBeUndefined();
    expect(materialsNowGive({ ...saved, ogPlato: 15.14 }, { ...saved, ogPlato: 15.6 }, "sg")).toContain("Materials now give OG 1.064");
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
  it("reads a line's per-bbl amount to three significant digits, with its timing apart, as words and as a number", () => {
    expect(ingredientCells("mash", null, 40.909091, "lb")).toEqual({ stage: "mash", amount: "40.9 lb", timing: "", timingMinutes: null });
    expect(ingredientCells("boil", "60", "0.011364", "lb")).toEqual({ stage: "boil", amount: "0.0114 lb", timing: "60 min", timingMinutes: 60 });
    // The editor holds a line's timing as field text: blank is none.
    expect(ingredientCells("boil", "", 1, "lb").timingMinutes).toBeNull();
    expect(ingredientCells("dry_hop", 3 * 1440, 1.2)).toEqual({ stage: "dry_hop", amount: "1.2", timing: "day 3", timingMinutes: 4320 });
  });
  it("reads the water the sheet holds: the target by name, the pH, the volumes and each addition, and never the source", () => {
    const water = { targetProfileId: "p-target", sourceProfileId: "p-source", mashGal: "120", spargeGal: "", targetMashPh: "5.3", additions: [{ materialId: "m-gypsum", qty: 40, unit: "g", stage: "mash" }] };
    const profiles = [{ id: "p-target", name: "Pale ale" }, { id: "p-source", name: "City" }];
    expect(waterFacts(water, profiles, () => "Gypsum")).toEqual({
      target: "Pale ale", mashPh: "5.3", mashGal: "120", spargeGal: undefined, additions: [{ name: "Gypsum", qty: 40, unit: "g", stage: "mash" }],
    });
    // A target the page cannot name is left out, and so is everything the sheet does not hold.
    expect(waterFacts({ ...water, targetProfileId: "gone", mashGal: "", targetMashPh: "", additions: [] }, profiles, () => "")).toEqual({ target: undefined, mashPh: undefined, mashGal: undefined, spargeGal: undefined, additions: [] });
  });
});

describe("RECIPE_NUMBERS", () => {
  it("holds the eight process numbers in the order their sheet draws them, two to a row", () => {
    expect(RECIPE_NUMBERS.map(([key]) => key)).toEqual(["efficiency", "attenuation", "preBoil", "boilMin", "whirlpoolMin", "whirlpoolRest", "whirlpoolTemp", "knockoutTemp"]);
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
    expect(loaded.notes).toBe("");
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
  it("copies the schedules and numbers, and starts the change note blank: it describes the next change, not the last", () => {
    const d = versionToDraft(snapshot)!;
    expect(d.notes).toBe("");
    expect(d.numbers.efficiency).toBe("72.5");
    expect(d.mashSchedule).toEqual(version.mash_schedule);
    expect(d.fermentationSchedule).toEqual(version.fermentation_schedule);
  });
  it("restores the batch size the copy was saved with, and leaves it empty when the copy has none", () => {
    expect(versionToDraft(snapshot)!.batchBbl).toBe("");
    // A Postgres numeric(10,3) may arrive as text.
    const sized = { ...snapshot, version: { ...version, batch_bbl: "22.000" } } as unknown as RecipeSnapshot;
    expect(versionToDraft(sized)!.batchBbl).toBe("22");
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
  it("takes no batch size, or one above zero that the copy can store", () => {
    const need = "Still needed: a batch size above zero, up to 9,999,999.999 bbl.";
    for (const batchBbl of [undefined, "", "22", "0.5", "9999999.999"]) expect(draftBlocker({ ...ready, batchBbl })).toBeNull();
    for (const batchBbl of ["0", "-22", "1e1", "10000000"]) expect(draftBlocker({ ...ready, batchBbl })).toBe(need);
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
  const hop = { id: "m-hop", name: "Citra", category: "hop", base_uom: "lb", extract_potential: null, alpha_acid: 10, purchase_uom_factor: 44, pack_name: null };
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
    { id: "m-malt", name: "Fieldstone White Wheat", category: "malt", base_uom: "lb", extract_potential: 1.037, alpha_acid: null, purchase_uom_factor: 50, pack_name: null },
    { id: "m-hop", name: "Citra", category: "hop", base_uom: "lb", extract_potential: null, alpha_acid: 12.5, purchase_uom_factor: 44, pack_name: null },
    { id: "m-gypsum", name: "Gypsum", category: "salt", base_uom: "g", extract_potential: null, alpha_acid: null, purchase_uom_factor: 1, pack_name: null },
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
  it("gives each saved line its pack, from list_materials' purchase_uom_factor and pack_name", () => {
    const bagged = materials.map((m) => (m.id === "m-malt" ? { ...m, pack_name: "bag" as const } : m));
    const model = toRecipePageModel(predicted, { ...ctx, materials: bagged });
    expect(model.ingredients?.map((i) => i.pack)).toEqual([{ perBbl: 40.9, factor: 50, unit: "lb", packName: "bag" }, { perBbl: 0.5, factor: 44, unit: "lb", packName: null }]);
  });
  it("carries the saved batch size, and each mash line's share of the grain bill", () => {
    expect(toRecipePageModel(predicted, ctx).batchBbl).toBe("");
    const model = toRecipePageModel({ ...predicted, version: { ...version, batch_bbl: 22 } }, ctx);
    expect(model.batchBbl).toBe("22");
    // One malt is the whole grain bill; the boil hop has no share.
    expect(model.ingredients?.map((i) => i.share)).toEqual([1, undefined]);
  });
  it("carries the saved mash rests and fermentation stages as the copy stores them", () => {
    const model = toRecipePageModel({ ...predicted, version: { ...version, fermentation_schedule: [] } }, ctx);
    expect(model.mashSchedule).toEqual(version.mash_schedule);
    expect(model.fermentationSchedule).toEqual([]);
  });
  it("carries the saved water: its target by name, its volumes, its pH and its additions by name", () => {
    expect(toRecipePageModel(predicted, ctx).water).toEqual({ target: "Pale ale", mashPh: "5.3", mashGal: "120", spargeGal: undefined, additions: [{ name: "Gypsum", qty: 40, unit: "g", stage: "mash" }] });
  });
  it("dates the saved copy in the brewery's zone and carries the recipe note", () => {
    const model = toRecipePageModel({ ...predicted, recipe: { ...snapshot.recipe, note: "House pale" }, version: { ...version, created_at: "2026-10-01T03:00:00Z" } }, ctx);
    expect(model.saved).toBe("Sep 30, 2026 · Less crystal");
    // An earlier copy's change note rides on its saved line too; a copy saved without one has the date alone.
    expect(toRecipePageModel({ ...predicted, versions: [9, 3], version: { ...version, created_at: "2026-10-01T03:00:00Z" } }, ctx).saved).toBe("Sep 30, 2026 · Less crystal");
    expect(toRecipePageModel({ ...predicted, version: { ...version, note: null } }, ctx).saved).toBe("Oct 1, 2026");
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
    // Nothing on an earlier copy is a field: its batch size, when it has one, reads as text.
    expect(html).not.toMatch(/<input|<select|<form/);
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
    expect(model.actuals?.rows.map((r) => [r.batch, r.brewed, ...r.notes])).toEqual([["B-0009", "Oct 3, 2026"], ["B-0008", "Oct 3, 2026"], ["B-0007", "Oct 3, 2026", "earlier recipe"]]);
    expect(model.actuals?.columns[0]).toBe("OG");
    expect(model.actuals?.rows[0].cells[0].measured).toBe("1.050");
    // The top row is what the shown copy itself assumes: its saved efficiency and attenuation.
    expect(model.actuals?.predicted.slice(3)).toEqual(["7%", "73%"]);
    expect(model.actualsNote).toMatch(/^2 batches: efficiency 70–71% against 73% assumed/);
  });
  it("has no Batch actuals with no batches", () => {
    const model = toRecipePageModel(predicted, ctx);
    expect(model.actuals).toBeUndefined();
    expect(model.actualsNote).toBeUndefined();
  });
  it("gives a recipe not written yet a title and nothing invented", () => {
    const model = toRecipePageModel({ ...snapshot, version: null, ingredients: [], waterAdditions: [] }, ctx);
    expect(model).toEqual({ title: "Pale", backHref: "/recipes", recipeNote: undefined });
    const drawn = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model }));
    expect(drawn).not.toMatch(/No version yet|<h2|<svg role="img"|<button/);
  });
});

describe("the sheet", () => {
  const material = (id: string, name: string, base_uom: string) => ({ id, name, category: "other", base_uom, extract_potential: null, alpha_acid: null, purchase_uom_factor: 1, pack_name: null });
  const materials = [{ ...material("m-malt", "Fieldstone White Wheat", "lb"), extract_potential: 1.037, purchase_uom_factor: 50 }, material("m-hop", "Citra", "lb"), material("m-gypsum", "Gypsum", "g")];
  const saved = toRecipePageModel(snapshot, { materials, profiles: [{ id: "p-target", name: "Pale ale" }], unit: "plato", timeZone: "UTC", outcomes: [] });
  const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  /** Each list of what goes in, as its rows' text. */
  const lists = (html: string) => (html.match(/<ul[\s\S]*?<\/ul>/g) ?? []).map((ul) => (ul.match(/<li[\s\S]*?<\/li>/g) ?? []).map(text));
  const controls = { setNote: () => {}, onSubmit: () => {} };
  const draw = (props: Parameters<typeof RecipeView>[0]) => renderToStaticMarkup(createElement(RecipeView, props));
  const blank = { title: "Pale", notes: "" };
  /** A line as the page builds it. */
  const line = (key: string, title: string, stage: Parameters<typeof ingredientCells>[0], timing: number | null, perBbl: number) => ({ key, title, ...ingredientCells(stage, timing, perBbl, "lb") });

  it("reads a saved copy as the day at a glance: the sentence, the assumptions, the band, what goes in on brew day, then the cellar", () => {
    const html = draw({ model: saved, readOnly: true });
    const read = text(html);
    expect(headings(html)).toEqual(["Goes in on brew day", "In the cellar"]);
    const order = ["Saved Oct 1, 2026 · Less crystal.", "Assumes 72.5% efficiency and 7% attenuation.", "Mash-in", "Goes in on brew day", "Pale ale, mash pH 5.3. Boil from 16.8 bbl. Knock out at 66 °F.", "In the cellar", "7 days from pitch to package."];
    expect(order.map((words) => read.indexOf(words))).toEqual([...order.map((words) => read.indexOf(words))].sort((a, b) => a - b));
    for (const words of order) expect(read).toContain(words);
    // The water and its salts, then the grain with its share, then the boil addition by its minutes remaining.
    expect(lists(html)[0]).toEqual([
      "Mash-in Mash water 120 gal", "Mash-in Gypsum 40 g", "Mash-in Fieldstone White Wheat 100% of the grain bill 40.9 lb / bbl", "Boil, 60 min Citra 0.5 lb / bbl",
    ]);
    // The moment is drawn once: the rows after its first say it to a screen reader only.
    expect(html.match(/<span class="sr-only">Mash-in<\/span>/g)).toHaveLength(2);
    // A read-out is text: nothing on it is a control.
    expect(html).not.toMatch(/<button|<input|<form/);
    // The old cards and their flat headings are gone.
    expect(read).not.toMatch(/Schedule ·|Profile and additions|Pre-boil volume/);
    // A copy that holds one thing reads that and nothing else.
    const bare = draw({ readOnly: true, model: { title: "Pale", boilMin: "60" } });
    expect(headings(bare)).toEqual([]);
    expect(bare).toContain('aria-label="The brew day by temperature: a 60 minute boil."');
  });

  it("draws both drawings as images named by a sentence, with their labels as text", () => {
    const html = draw({ model: saved, readOnly: true });
    expect(html.match(/<svg role="img" aria-label="([^"]*)"/g)).toEqual([
      '<svg role="img" aria-label="The brew day by temperature: a mash rest at 152 °F for 60 minutes, a 60 minute boil, and a 20 minute whirlpool. Knock out at 66 °F. 1 mark shows when a boil or whirlpool addition goes in."',
      '<svg role="img" aria-label="Fermentation temperature by day: 68 °F for 7 days."',
    ]);
    const [band, cellar] = (html.match(/<svg role="img"[\s\S]*?<\/svg>/g) ?? []).map((svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]));
    expect(band).toEqual(["Mash", "Boil", "Whirlpool", "152 °F", "60 min", "60 min", "20 min", "Mash-in", "Knock out at 66 °F, 2 hours 20 minutes"]);
    expect(cellar).toEqual(["68 °F", "Pitch", "Day 7"]);
    // x is a percent of the width and y is in pixels, so the text keeps its size at any width.
    expect(html).toMatch(/<svg role="img"[^>]*width="100%" height="\d+"/);
    expect(html).toMatch(/<circle cx="[\d.]+%" cy="\d+" r="5"/);
    expect(html.match(/<svg role="img"[^>]*>/g)!.join("")).not.toContain("viewBox");
  });

  it("draws both columns on the editor even when they are empty, each saying so, with its actions", () => {
    const html = draw({ model: blank });
    const read = text(html);
    expect(headings(html)).toEqual(["Goes in on brew day", "In the cellar"]);
    for (const words of ["No batch size yet , edit recipe numbers .", "Assumes no efficiency , edit recipe numbers and no attenuation , edit recipe numbers .", "Nothing goes in yet.", "No fermentation schedule yet."]) expect(read).toContain(words);
    // Nothing to draw yet: no band, no profile.
    expect(html).not.toContain('<svg role="img"');
    // Each action reads its verb on screen, and names what it acts on after it for a screen reader where the verb alone would not.
    expect([...html.matchAll(/<button[^>]*data-variant="link"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1])).filter((label) => /^(Add|Edit) /.test(label))).toEqual([
      "Edit mash schedule", "Edit recipe numbers", "Add ingredient to brew day", "Edit water", "Add ingredient to the cellar", "Edit schedule for fermentation",
    ]);
    expect(draw({ model: saved, readOnly: true })).not.toMatch(/Add ingredient|Edit /);
  });

  it("opens an Ingredient sheet from each column, on the stage a new line there starts on", () => {
    const live = draw({ model: blank, controls: { ...controls, dirty: false }, slots: { addIngredient: (stage) => `SHEET:${stage}` } });
    expect(live.match(/SHEET:\w+/g)).toEqual(["SHEET:mash", "SHEET:fermentation"]);
  });

  it("gives each schedule, the water and the numbers one action that opens its sheet", () => {
    const live = draw({ model: blank, controls: { ...controls, dirty: false }, slots: { sheet: (key) => `SHEET:${key};` } });
    expect(live.match(/SHEET:\w+/g)).toEqual(["SHEET:mash", "SHEET:numbers", "SHEET:water", "SHEET:fermentation"]);
  });

  it("draws the save bar only once the sheet differs from what is saved", () => {
    const model = { title: "Pale", saved: "Oct 1, 2026", scheduleHref: "/batches?recipe=r1", notes: "" };
    const bar = (dirty: boolean) => draw({ model, controls: { ...controls, dirty, onDiscard: () => {} } });
    expect(bar(false)).not.toMatch(/Save changes|Discard/);
    expect(bar(false)).toContain("Schedule batch");
    expect(bar(true)).toMatch(/<button[^>]*type="submit"[^>]*>Save changes</);
    expect(bar(true)).toMatch(/<button[^>]*type="button"[^>]*>Discard</);
    // Schedule batch would schedule what is saved, not what is on screen.
    expect(bar(true)).not.toContain("Schedule batch");
  });

  it("keeps the save bar up while a recipe is being created, with nothing to discard", () => {
    const html = draw({ model: { title: "New recipe", notes: "" }, controls: { ...controls, dirty: true, submitLabel: "Create recipe" } });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Create recipe</);
    expect(html).not.toContain("Discard");
  });

  it("lists what goes in as rows: when, the name as the line's Edit, how much", () => {
    const malt = line("m", "2-row", "mash", null, 44), hop = line("h", "Citra", "boil", 10, 0.4), dry = line("d", "Citra", "dry_hop", null, 1.2);
    const html = draw({ model: { ...blank, ingredients: [malt, hop, dry] } });
    // Brew day, then the cellar. Without a batch size each row reads per bbl.
    expect(lists(html)).toEqual([["Mash-in Edit 2-row 44 lb / bbl", "Boil, 10 min Edit Citra 0.4 lb / bbl"], ["Dry hop Edit Citra 1.2 lb / bbl"]]);
    // The live editor wraps the name in the line's sheet; a read-out draws the name alone.
    expect(draw({ model: { ...blank, ingredients: [{ ...malt, edit: () => "SHEET:2-row" }] }, controls: { ...controls, dirty: false } })).toContain("SHEET:2-row");
    expect(lists(draw({ readOnly: true, model: { title: "Pale", ingredients: [malt] } }))).toEqual([["Mash-in 2-row 44 lb / bbl"]]);
  });

  it("names a water row as its Edit too, and lists the cellar's later additions after the dry hops", () => {
    const water = { mashGal: "450", additions: [{ name: "Gypsum", qty: 200, unit: "g", stage: "mash" }] };
    const html = draw({ model: { ...blank, water, ingredients: [line("y", "Ale yeast", "fermentation", 0, 0.05), line("d", "Citra", "dry_hop", 3 * 1440, 1.2), line("f", "Biofine", "packaging", null, 0.09)] } });
    expect(lists(html)).toEqual([["Mash-in Edit Mash water 450 gal", "Mash-in Edit Gypsum 200 g"], ["Pitch Edit Ale yeast 0.05 lb / bbl", "Day 3 Edit Citra 1.2 lb / bbl", "Packaging Edit Biofine 0.09 lb / bbl"]]);
  });

  it("reads a mash line's share of the grain bill beside its amount, and draws the shares as a bar", () => {
    const pils = { ...line("p", "Pilsner malt", "mash", null, 57.5), share: 1265 / 1925 };
    const oats = { ...line("o", "Flaked oats", "mash", null, 30), share: 660 / 1925 };
    const html = draw({ model: { ...blank, ingredients: [pils, oats] } });
    expect(lists(html)[0]).toEqual(["Mash-in Edit Pilsner malt 66% of the grain bill 57.5 lb / bbl", "Mash-in Edit Flaked oats 34% of the grain bill 30 lb / bbl"]);
    expect(html).toContain('<div role="img" aria-label="Share of the grain bill by weight: Pilsner malt 66% and Flaked oats 34%"');
    // One grain is the whole bill: no bar.
    expect(draw({ model: { ...blank, ingredients: [{ ...pils, share: 1 }] } })).not.toContain("Share of the grain bill by weight");
  });

  it("reads the batch size in the sentence under the name, where it opens the Recipe numbers sheet", () => {
    const sentence = (props: Partial<Parameters<typeof RecipeView>[0]>, batchBbl?: string) => /<p class="[^"]*">([\s\S]*?)<\/p>/.exec(draw({ model: { ...blank, batchBbl }, ...props }))?.[1] ?? "";
    // The editor always offers it, so a recipe without one can gain one.
    expect(text(sentence({}))).toBe("No batch size yet , edit recipe numbers .");
    expect(sentence({}, "22")).toMatch(/^Written for <button[^>]*type="button"[^>]*>22 bbl<span class="sr-only">, edit recipe numbers<\/span><\/button>\.$/);
    // A read-out prints it as text, and says nothing of a size the copy does not hold.
    expect(sentence({ readOnly: true }, "22")).toBe("Written for 22 bbl.");
    expect(draw({ readOnly: true, model: { title: "Pale" } })).not.toMatch(/batch size|Written for/i);
    // No number field is drawn on the page itself.
    expect(draw({ model: { ...blank, batchBbl: "22" } })).not.toMatch(/aria-label="Batch size bbl"/);
  });

  it("holds the brand in the same sentence as a pick, and leaves it out of a read-out", () => {
    const options = [{ value: "", label: "No brand yet" }, { value: "b1", label: "Hazy IPA" }];
    const html = draw({ model: { ...blank, batchBbl: "22", brand: { value: "b1", options } } });
    expect(html).toMatch(/<p class="[^"]*">Brews <button[^>]*role="combobox"[^>]*aria-label="Brand"[^>]*>[\s\S]*?Hazy IPA[\s\S]*?<\/button>(?:<select[^>]*><\/select>)? at <button/);
    expect(text(draw({ model: { ...blank, batchBbl: "22", brand: { value: "", options } } }))).toContain("No brand yet , written for 22 bbl , edit recipe numbers .");
    expect(draw({ readOnly: true, model: { title: "Pale", batchBbl: "22", brand: { value: "b1", options } } })).not.toMatch(/combobox|Brews/);
    // The pick saves on its own; a failed save says so under the sentence.
    expect(draw({ model: { ...blank, brand: { value: "b1", options } }, controls: { ...controls, dirty: false, brand: { onChange: () => {}, error: "Brand not saved" } } })).toContain("Brand not saved");
  });

  it("heads the sheet with the predicted figures, and offers Refresh from Materials only when the editor says they are stale", () => {
    const model = { title: "Pale", saved: "Oct 1, 2026", notes: "", figures: [["12.5 °P", "OG"]] as [string, string][], figureNotes: ["IBU not estimated: no predicted OG"] };
    const stale = (refresh?: { text: string; onRefresh: () => void }) => draw({ model, controls: { ...controls, dirty: false, refresh } });
    expect(stale()).toMatch(/>12\.5 °P<\/div><div[^>]*>OG</);
    expect(stale()).toContain("IBU not estimated: no predicted OG");
    expect(stale()).not.toContain("Refresh from Materials");
    // A refresh runs on an unchanged sheet, where there is no save bar: its failure still has to show.
    expect(draw({ model, controls: { ...controls, dirty: false, error: "Refresh failed" } })).toContain("Refresh failed");
    const offered = stale({ text: "Materials now give OG 13.1 °P.", onRefresh: () => {} });
    expect(offered).toContain("Materials now give OG 13.1 °P.");
    expect(offered).toMatch(/<button[^>]*type="button"[^>]*>Refresh from Materials</);
  });

  it("asks for a change note, and reads a saved copy's after its date", () => {
    expect(draw({ model: blank })).toMatch(/<input[^>]*aria-label="Change note · optional"/);
    const read = draw({ model: saved, readOnly: true });
    expect(read).toContain("Saved Oct 1, 2026 · Less crystal.");
    expect(read).not.toContain("Change note");
  });

  it("closes the recipe's note as a sentence before the saved date", () => {
    expect(text(draw({ readOnly: true, model: { title: "Pale", recipeNote: "House IPA", saved: "Aug 28, 2026" } }))).toContain("House IPA. Saved Aug 28, 2026.");
  });
});

describe("batch amounts in packs", () => {
  const malt: RecipePack = { perBbl: 10, factor: 50, unit: "lb", packName: null };
  const bagged: RecipePack = { perBbl: 57.5, factor: 55, unit: "lb", packName: "bag" };
  it("reads a line's amount at the batch size as a count of packs when it is whole packs", () => {
    expect(batchTotalText(bagged, 22)).toBe("23 bags");
    expect(batchTotalText({ ...bagged, perBbl: 2.5 }, 22)).toBe("1 bag");
    // No pack word: the count of the pack size, as before.
    expect(batchTotalText({ ...malt, perBbl: 2.5, factor: 55 }, 22)).toBe("1 × 55 lb");
  });
  it("stays in base units when the amount is not whole packs, is under one pack, or the material has no pack", () => {
    expect(batchTotalText(malt, 22)).toBe("220 lb");
    expect(batchTotalText({ ...bagged, perBbl: 44 }, 22)).toBe("968 lb");
    expect(batchTotalText({ ...malt, factor: 1 }, 22)).toBe("220 lb");
    expect(batchTotalText({ perBbl: 0.4, factor: 44, unit: "lb", packName: null }, 22)).toBe("8.8 lb");
  });
  it("totals exactly to the stored 4 decimals, so 9.090909 lb/bbl at 22 bbl is 200 lb", () => {
    expect(batchTotalText({ ...malt, perBbl: 9.090909 }, 22)).toBe("4 × 50 lb");
  });
  it("offers rounding down and up to whole packs, each as a per-bbl amount to 6 decimals", () => {
    expect(packRounding(malt, 22)).toEqual({ whole: false, choices: [
      { label: "Round to 4 × 50 lb", perBbl: 9.090909 },
      { label: "Round to 5 × 50 lb", perBbl: 11.363636 },
    ] });
  });
  it("names a Round choice as the line will read once chosen, with the pack word when the material has one", () => {
    expect(packRounding({ ...bagged, perBbl: 44 }, 22)).toEqual({ whole: false, choices: [
      { label: "Round to 17 bags", perBbl: 42.5 },
      { label: "Round to 18 bags", perBbl: 45 },
    ] });
  });
  it("offers only rounding up when the total is under one pack", () => {
    expect(packRounding({ perBbl: 0.4, factor: 44, unit: "lb", packName: null }, 22)).toEqual({ whole: false, choices: [{ label: "Round to 1 × 44 lb", perBbl: 2 }] });
    // 0.253 lb of a 0.25 lb bottle is not whole packs: one bottle and a little loose.
    expect(packRounding({ perBbl: 0.0115, factor: 0.25, unit: "lb", packName: "bottle" }, 22)).toEqual({ whole: false, choices: [
      { label: "Round to 1 bottle", perBbl: 0.011364 },
      { label: "Round to 2 bottles", perBbl: 0.022727 },
    ] });
  });
  it("says whole packs, with nothing to offer, when the total already is", () => {
    expect(packRounding({ ...malt, perBbl: 9.090909 }, 22)).toEqual({ whole: true, choices: [] });
    // A material counted in "each" rounds to whole pieces once it has a pack word; without one it has no pack.
    expect(packRounding({ perBbl: 0.0455, factor: 1, unit: "each", packName: "pitch" }, 22)).toEqual({ whole: false, choices: [
      { label: "Round to 1 pitch", perBbl: 0.045455 }, { label: "Round to 2 pitches", perBbl: 0.090909 },
    ] });
    expect(packRounding({ perBbl: 0.0455, factor: 1, unit: "each", packName: null }, 22)).toBeNull();
    expect(packRounding(bagged, 22)).toEqual({ whole: true, choices: [] });
  });
  it("offers nothing for a material with no pack", () => {
    expect(packRounding({ ...malt, factor: 1 }, 22)).toBeNull();
  });
  it("shows the real total a rounded per-bbl amount gives, even a hair off whole packs", () => {
    const [up] = packRounding({ perBbl: 0.01, factor: 50, unit: "lb", packName: null }, 3000)!.choices;
    expect(up).toEqual({ label: "Round to 1 × 50 lb", perBbl: 0.016667 });
    expect(batchTotalText({ perBbl: up.perBbl, factor: 50, unit: "lb", packName: null }, 3000)).toBe("50.001 lb");
  });
  it("draws each line's batch amount only once the recipe has a batch size, and Round only on the editor", () => {
    const row: RecipeIngredientView = { key: "i1", title: "2-row", ...ingredientCells("mash", null, 10, "lb"), pack: malt };
    const model = { title: "Pale", ingredients: [row] };
    const draw = (m: typeof model & { batchBbl?: string }, readOnly: boolean) => renderToStaticMarkup(createElement(RecipeView, { model: m, readOnly }));
    const rowText = (html: string) => /<li[\s\S]*?<\/li>/.exec(html)![0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(draw(model, false)).toContain("Enter a batch size to see each amount for the batch");
    expect(rowText(draw(model, false))).toBe("Mash-in Edit 2-row 10 lb / bbl");
    // A saved copy read out has no sheet to type one into, so it does not ask.
    expect(draw(model, true)).not.toContain("Enter a batch size");
    // With a batch size the row reads the batch amount alone; the amount per bbl stays in the Ingredient sheet.
    const read = draw({ ...model, batchBbl: "22" }, true);
    expect(rowText(read)).toBe("Mash-in 2-row 220 lb");
    expect(read).not.toContain("Round to");
    // Off a read-out, an amount that is not whole packs offers Round under its row, down and up.
    expect(rowText(draw({ ...model, batchBbl: "22" }, false))).toBe("Mash-in Edit 2-row 220 lb Round to 4 × 50 lb Round to 5 × 50 lb");
    // Whole packs read as a count, with nothing to round.
    const whole = draw({ ...model, batchBbl: "22", ingredients: [{ ...row, pack: { ...malt, perBbl: 9.090909 } }] }, false);
    expect(rowText(whole)).toBe("Mash-in Edit 2-row 4 × 50 lb");
    // A grain in whole bags also reads its weight and its share.
    expect(rowText(draw({ ...model, batchBbl: "22", ingredients: [{ ...row, pack: bagged, share: 1 }] }, true))).toBe("Mash-in 2-row 1,265 lb, 100% of the grain bill 23 bags");
  });
  it("#1479 reads an exponent batch size as no size: rows stay per bbl, and the Recipe numbers sheet marks the field", () => {
    const model = { title: "Pale", ingredients: [{ key: "i1", title: "2-row", ...ingredientCells("mash", null, 10, "lb"), pack: malt }], batchBbl: "1e1" };
    const html = renderToStaticMarkup(createElement(RecipeView, { model }));
    expect(html).not.toContain("100 lb");
    expect(html).toContain("10 lb");
    expect(renderToStaticMarkup(createElement(RecipeNumbersView, { values: model }))).toContain("Enter a decimal number, not exponent notation");
  });
  it("gives a pack to a line at any stage, from the material's pack size and pack word", () => {
    const material = { base_uom: "lb", purchase_uom_factor: 50, pack_name: "sack" as const };
    expect(ingredientPack(2, material)).toEqual({ perBbl: 2, factor: 50, unit: "lb", packName: "sack" });
    expect(ingredientPack(2, { ...material, pack_name: null })?.packName).toBeNull();
    expect(ingredientPack(2, undefined)).toBeUndefined();
    expect(ingredientPack(0, material)).toBeUndefined();
  });
  it("coerces a numeric pack size that arrives as a string", () => {
    expect(ingredientPack(10, { base_uom: "lb", purchase_uom_factor: "55.000000" as unknown as number, pack_name: null })?.factor).toBe(55);
  });
});

describe("gristShares", () => {
  it("gives each mash line its share of the grain bill by weight, and no other line a share", () => {
    // 23 and 12 bags of 55 lb at 22 bbl: 1,265 of 1,925 lb is 66%.
    const shares = gristShares([{ stage: "mash", perBbl: 57.5, unit: "lb" }, { stage: "mash", perBbl: 30, unit: "lb" }, { stage: "boil", perBbl: 0.4, unit: "lb" }]);
    expect(shares[0]).toBeCloseTo(1265 / 1925, 10);
    expect(shares.map((share) => share === undefined ? share : Math.round(share * 100))).toEqual([66, 34, undefined]);
  });
  it("weighs every weight unit in pounds, and gives no share to a mash line stocked by volume or count", () => {
    const shares = gristShares([{ stage: "mash", perBbl: 22.0462, unit: "lb" }, { stage: "mash", perBbl: 10, unit: "kg" }, { stage: "mash", perBbl: 5, unit: "ml" }, { stage: "mash", perBbl: 0, unit: "lb" }]);
    expect(shares.map((share) => share === undefined ? share : Math.round(share * 100))).toEqual([50, 50, undefined, undefined]);
  });
  it("has no share to give without a weighed mash line", () => {
    expect(gristShares([{ stage: "boil", perBbl: 1, unit: "lb" }, { stage: "mash", perBbl: 1, unit: undefined }])).toEqual([undefined, undefined]);
  });
  // A mash line whose unit the page cannot see (an inactive material) has an unknown weight, so no line's share is
  // known. Counting it as nothing would read the other malts too high.
  it("gives no shares at all when a mash line's unit is unknown", () => {
    expect(gristShares([{ stage: "mash", perBbl: 10, unit: "lb" }, { stage: "mash", perBbl: 10, unit: undefined }])).toEqual([undefined, undefined]);
    // A unit that is known and is not a weight (a syrup in ml) still just has no share of its own.
    expect(gristShares([{ stage: "mash", perBbl: 10, unit: "lb" }, { stage: "mash", perBbl: 10, unit: "ml" }])).toEqual([1, undefined]);
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

describe("the read page and its brand pick", () => {
  const page = readFileSync("app/(app)/recipes/[id]/page.tsx", "utf8");
  const editor = readFileSync("app/(app)/recipes/[id]/recipe-version-form.tsx", "utf8");
  it("builds its model with toRecipePageModel", () => {
    expect(page).toMatch(/import \{[^}]*\btoRecipePageModel\b[^}]*\} from "@\/lib\/mgr\/recipe-view"/);
    expect(page).toContain("toRecipePageModel(");
  });
  it("keeps the brand pick enabled while it saves, ignores a pick made meanwhile, and says so when it has saved", () => {
    expect(page).toContain("brandId={recipe.brand_id} brands={brands}");
    expect(editor).toContain("if (brandAction.busy) return;");
    expect(editor).toContain('brandAction.run("set_recipe_brand", { recipeId, brandId: value || null }, () => toast.success("Brand saved"))');
    expect(editor).not.toMatch(/disabled: (brandAction\.)?busy/);
  });
});

// tests/recipe-view.test.ts — the recipe page's pure view-model: a saved
// version copied into a draft (versionToDraft, versionNumbers), the first
// reason a draft cannot be saved (draftBlocker), the read page's model
// (toRecipePageModel) and why a prediction is missing (gravityBlockerText,
// noMashText), and a brew-day line's batch total in packs at a typed batch
// size with its whole-pack rounding (ingredientPack, batchTotalText,
// packRounding). No DB.
// The last block reads the page and brand picker sources: the page draws
// toRecipePageModel, and the picker never disables itself while it saves.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeView } from "@/components/mgr/views/recipe";
import { describe, expect, it } from "vitest";
import { batchTotalText, draftBlocker, gravityBlockerText, ingredientPack, noMashText, packRounding, recipePageTitle, toRecipePageModel, versionNumbers, versionToDraft, type RecipeSnapshot } from "@/lib/mgr/recipe-view";
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
  versions: [3, 2, 1],
  ingredients: [
    { id: "i1", material_id: "m-malt", per_bbl_qty: 40.9, stage: "mash", timing_minutes: null, sort: 0, extract_snapshot: 37, materials: { base_uom: "lb" } },
    { id: "i2", material_id: "m-hop", per_bbl_qty: 0.5, stage: "boil", timing_minutes: 60, sort: 1, extract_snapshot: null, materials: { base_uom: "lb" } },
  ],
  waterAdditions: [{ material_id: "m-gypsum", qty: 40, unit: "g", stage: "mash" }],
  ogPlato: null, fgPlato: null, abv: null,
};

it("names recipe tabs with the same saved-version heading as the page (#1255)", () => {
  expect(recipePageTitle(snapshot)).toBe("Pale v3");
  expect(recipePageTitle({ ...snapshot, version: { ...version, version: 1 } })).toBe("Pale v1");
  expect(recipePageTitle({ ...snapshot, version: null })).toBe("Pale");
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

describe("toRecipePageModel", () => {
  const materials = [
    { id: "m-malt", name: "Fieldstone White Wheat", category: "malt", base_uom: "lb", extract_potential: 1.037, purchase_uom_factor: 50 },
    { id: "m-hop", name: "Citra", category: "hop", base_uom: "lb", extract_potential: null, purchase_uom_factor: 44 },
    { id: "m-gypsum", name: "Gypsum", category: "salt", base_uom: "g", extract_potential: null, purchase_uom_factor: 1 },
  ];
  const ctx = { materials, profiles: [{ id: "p-target", name: "Pale ale" }], unit: "plato" as const, timeZone: "America/Los_Angeles" };
  const predicted = { ...snapshot, ogPlato: 12.5, fgPlato: 2.5, abv: 5.25 };

  it("titles the page with the version and reads each ingredient per bbl to three significant digits", () => {
    const model = toRecipePageModel({ ...predicted, ingredients: [{ ...snapshot.ingredients[0], per_bbl_qty: 40.909091 }] }, ctx);
    expect(model.title).toBe("Pale v3");
    expect(model.ingredients?.[0]?.detail).toContain("40.9 lb / bbl");
    expect(model.predicted).toMatch(/^Predicted: OG /);
  });
  it("gives each saved brew-day line its pack, from list_materials' purchase_uom_factor", () => {
    const model = toRecipePageModel(predicted, ctx);
    expect(model.ingredients?.map((i) => i.pack)).toEqual([{ perBbl: 40.9, factor: 50, unit: "lb" }, { perBbl: 0.5, factor: 44, unit: "lb" }]);
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
    expect(model.recipeNote).toBe("House pale");
  });
  it("links every version and distinguishes the current version from the one being viewed", () => {
    const current = toRecipePageModel(predicted, ctx);
    expect(current.historical).toBe(false);
    expect(current.versions).toEqual([
      { number: 3, href: "?v=3", selected: true, latest: true },
      { number: 2, href: "?v=2", selected: false, latest: false },
      { number: 1, href: "?v=1", selected: false, latest: false },
    ]);
    const model = toRecipePageModel({ ...predicted, version: { ...version, version: 1 } }, ctx);
    expect(model.historical).toBe(true);
    const html = renderToStaticMarkup(createElement(RecipeView, { model, readOnly: true, parentForm: "Editable brand" }));
    expect(html).toContain('href="?v=3"');
    const selectedLink = html.match(/<a\b[^>]*href="\?v=1"[^>]*>/)?.[0];
    expect(selectedLink).toContain('aria-current="page"');
    expect(html).toContain("v3 (current)");
    expect(html).toContain("Older version");
    expect(html).toContain("Less crystal");
    expect(html).not.toContain("New recipe version");
    expect(html).not.toContain("Editable brand");
    // The one input is Show totals at, a page-only batch size that never edits the version.
    expect(html.replace(/<input[^>]*aria-label="Show totals at \(bbl\)"[^>]*>/, "")).not.toMatch(/<input|<select|<form/);
    const currentHtml = renderToStaticMarkup(createElement(RecipeView, { model: current, readOnly: true }));
    expect(currentHtml).toContain('href="/recipes/r1/new"');
    expect(currentHtml).toContain("New recipe version");
  });
  it("offers Schedule batch beside New recipe version on the current version only (#1581)", () => {
    const current = toRecipePageModel(predicted, ctx);
    expect(current.scheduleHref).toBe("/batches?recipe=r1");
    const drawn = (model: typeof current) => renderToStaticMarkup(createElement(RecipeView, { model, readOnly: true }));
    expect(drawn(current)).toContain('href="/batches?recipe=r1"');
    expect(drawn(current)).toContain("Schedule batch");
    expect(drawn(toRecipePageModel({ ...predicted, version: { ...version, version: 1 } }, ctx))).not.toContain("Schedule batch");
    const empty = toRecipePageModel({ ...snapshot, version: null, ingredients: [], waterAdditions: [] }, ctx);
    expect(empty.scheduleHref).toBeUndefined();
    expect(drawn(empty)).not.toContain("Schedule batch");
    expect(drawn(empty)).toContain("New recipe version");
  });
  it("says nothing is predicted when the version has no mash ingredient", () => {
    const model = toRecipePageModel({ ...snapshot, ingredients: [snapshot.ingredients[1]] }, ctx);
    expect(model.predicted).toBe("No mash ingredient, so nothing is predicted.");
  });
  it("draws the empty recipe with no invented numbers", () => {
    const model = toRecipePageModel({ ...snapshot, version: null, ingredients: [], waterAdditions: [] }, ctx);
    expect(model.title).toBe("Pale");
    // Says what a version records and the next step, true to create_recipe_version (#1140).
    expect(model.empty).toEqual({
      title: "No version yet",
      description: "A version records this recipe's ingredients, mash and fermentation schedules, water and process targets, and never changes once saved. Select New recipe version to write the first one.",
    });
    const drawn = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model }));
    expect(drawn).toContain("No version yet");
    expect(drawn).toContain("Select New recipe version to write the first one.");
    expect(model.mash).toBeUndefined();
    expect(model.saved).toBeUndefined();
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
    const model = { title: "Pale v3", ingredients: [{ key: "i1", title: "2-row", detail: "Mash · 10 lb / bbl", qty: "", pack: malt }] };
    const draw = (m: typeof model & { totalsAtBbl?: string }, readOnly: boolean) => renderToStaticMarkup(createElement(RecipeView, { model: m, readOnly }));
    expect(draw(model, true)).toContain("Enter a batch size to see totals in packs");
    expect(draw(model, true)).not.toContain("220 lb");
    const read = draw({ ...model, totalsAtBbl: "22" }, true);
    expect(read).toMatch(/22 bbl <span data-direction="forward"[^>]*>.*?<\/span> 220 lb = 4 × 50 lb \+ 20 lb/);
    expect(read).not.toContain("Round to");
    expect(draw({ ...model, totalsAtBbl: "22" }, false)).toContain("Round to 5 × 50 lb");
    expect(draw({ ...model, totalsAtBbl: "22", ingredients: [{ ...model.ingredients[0], pack: { ...malt, perBbl: 9.090909 } }] }, false)).toContain("Whole packs");
  });
  it("#1479 reads an exponent batch size as no size, and says why", () => {
    const model = { title: "Pale v3", ingredients: [{ key: "i1", title: "2-row", detail: "Mash · 10 lb / bbl", qty: "", pack: malt }], totalsAtBbl: "1e1" };
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

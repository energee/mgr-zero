// tests/brew-prep-view.test.ts — the brew prep pull list and the brew-day
// timeline's pure rules (lib/mgr/brew-prep-view.ts).
import { describe, expect, it } from "vitest";
import { anyPulled, brewIngredients, confirmAll, brewPullsPayload, brewTargets, currentStage, isShort, laterAdditions, openBrewTab, prepReason, processErrors, pullDetail, pullTone, sourceChoices, showsPacks, stageProgress, startAtPlan, timelineReason, timelineRecordPayload, timelineStages, timelineTone, type BrewIngredient, type BrewPrepViewModel, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";
import type { BrewMaterialSource, BrewPlan, BrewPull } from "@/lib/mgr/brew-day-view";

const chit: BrewIngredient = startAtPlan({ key: "chit", name: "Chit Malt", materialId: "chit", stage: "mash", plan: 220, unit: "lb", packSize: 50, source: null });
const hops: BrewIngredient = startAtPlan({ key: "ns", name: "Nelson", materialId: "ns", stage: "whirlpool", plan: 44, unit: "lb", packSize: 44, source: { lot: "NS-1", bin: "Freezer / F1", materialId: "ns", locationId: "freezer", binId: "f1", lotId: "ns-1" } });
const oats: BrewIngredient = startAtPlan({ key: "oats", name: "Rolled Oats", materialId: "oats", stage: "mash", plan: 200, unit: "lb", packSize: 50, source: { lot: null, bin: "Dry / D1", materialId: "oats", locationId: "dry", binId: "d1", lotId: null } });

describe("pull lines", () => {
  it("keeps a material with no pack size whole in the one field the view draws", () => {
    const gypsum = startAtPlan({ key: "gyp", name: "Gypsum", materialId: "gyp", stage: "mash", plan: 1.1, unit: "lb", packSize: 1, source: null });
    expect([gypsum.packs, gypsum.loose]).toEqual(["1.1", "0"]);
  });

  it("start at plan in whole packs plus loose base units", () => {
    expect(chit).toMatchObject({ packs: "4", loose: "20" });
    expect(hops).toMatchObject({ packs: "1", loose: "0" });
  });
  it("detail the plan in packs, then the lot and bin", () => {
    expect(pullDetail(hops)).toBe("plan 44 lb = 1 × 44 lb · NS-1 · Freezer / F1");
    expect(pullDetail(oats)).toBe("plan 200 lb = 4 × 50 lb · untracked · Dry / D1");
    expect(pullDetail(chit)).toBe("plan 220 lb = 4 × 50 lb + 20 lb · no source chosen");
  });
  it("are short only when packs plus loose fall below plan", () => {
    expect(isShort(chit)).toBe(false);
    expect(isShort({ ...chit, packs: "4", loose: "19.9" })).toBe(true);
    expect(isShort({ ...chit, packs: "4.4", loose: "" })).toBe(false);
    expect(isShort({ ...chit, packs: "", loose: "" })).toBe(true);
  });
  it("show a packs field only when the plan reaches one pack or packs are already entered", () => {
    expect(showsPacks(chit)).toBe(true);
    expect(showsPacks(startAtPlan({ ...chit, plan: 22 }))).toBe(false);
    expect(showsPacks({ ...startAtPlan({ ...chit, plan: 22 }), packs: "1" })).toBe(true);
    expect(showsPacks(startAtPlan({ ...chit, plan: 1.1, packSize: 1 }))).toBe(false);
  });
  it("need attention when short or still without a source", () => {
    expect(pullTone(hops)).toBe("ok");
    expect(pullTone(chit)).toBe("w");
    expect(pullTone({ ...hops, packs: "0" })).toBe("w");
  });
});

/** Stock behind hops (NS-1 in F1) and oats (untracked in D1), 300 lb each. */
const onHand = (material: string, location: string, bin: string, lot: string | null): BrewMaterialSource =>
  ({ material_id: material, material_name: material, unit: "lb", location_id: location, location_name: location, bin_id: bin, bin_name: bin, lot_id: lot, lot_code: lot, qty: 300 });
const timeline: BrewTimelineViewModel = {
  title: "BAT-1", ingredients: [{ ...chit, confirmed: true }, { ...hops, confirmed: true }], targets: {}, process: {},
  vesselId: "fv1", vessels: [{ id: "fv1", name: "FV1", kind: "fermenter", capacity_bbl: 25.5 }], initialBbl: "22", brewedOn: "2026-10-22",
  sources: [onHand("ns", "freezer", "f1", "ns-1"), onHand("oats", "dry", "d1", null)],
};
/** Every pulled line has its exact source. */
const sourced: BrewTimelineViewModel = { ...timeline, ingredients: [{ ...oats, confirmed: true }, { ...hops, confirmed: true }] };

describe("timeline", () => {
  it("orders stages by process and puts each ingredient under its stage", () => {
    const stages = timelineStages(timeline);
    expect(stages.map(s => s.stage)).toEqual(["mash", "lauter", "boil", "whirlpool", "knockout"]);
    expect(stages.find(s => s.stage === "mash")!.ingredients.map(i => i.key)).toEqual(["chit"]);
    expect(stages.find(s => s.stage === "whirlpool")!.ingredients.map(i => i.key)).toEqual(["ns"]);
    expect(stages.find(s => s.stage === "lauter")!.process).toEqual(["spargeWaterGal", "preBoilBbl"]);
  });
  it("opens the first stage with an unconfirmed ingredient, else knockout", () => {
    expect(currentStage(timeline)).toBe("knockout");
    expect(currentStage({ ...timeline, ingredients: [{ ...chit, confirmed: true }, hops] })).toBe("whirlpool");
  });
  it("records only when every ingredient is confirmed and knockout is valid", () => {
    expect(timelineReason(sourced)).toBeNull();
    expect(timelineReason({ ...sourced, ingredients: [oats, { ...hops, confirmed: true }] })).not.toBeNull();
    for (const patch of [{ initialBbl: "0" }, { initialBbl: "" }, { vesselId: "missing" }, { brewedOn: "" }]) expect(timelineReason({ ...sourced, ...patch })).not.toBeNull();
  });
  it("names each out-of-range or exponent process reading, the field and the reason from one check (#1476)", () => {
    const bad: [string, string, string][] = [
      ["targetMashPh", "3.9", "Enter a mash pH from 4 to 7."], ["targetMashPh", "7.1", "Enter a mash pH from 4 to 7."],
      ["targetMashPh", "1e1", "Enter a decimal number, not exponent notation (for example, 1000 instead of 1e3)."],
      ["boilMinutes", "-5", "Enter whole minutes, zero or more."], ["boilMinutes", "1.5", "Enter whole minutes, zero or more."],
      ["knockoutTempF", "-500", "Enter a temperature from 25 to 212 °F."], ["knockoutTempF", "9999", "Enter a temperature from 25 to 212 °F."],
      ["whirlpoolTempF", "300", "Enter a temperature from 25 to 212 °F."],
      ["mashWaterGal", "0", "Enter an amount above zero."], ["spargeWaterGal", "-1", "Enter an amount of zero or more."],
    ];
    for (const [key, value, message] of bad) {
      expect(processErrors({ [key]: value })).toEqual({ [key]: message });
      expect(timelineReason({ ...sourced, process: { [key]: value } })).toBe("Still needed: process readings in range.");
    }
    expect(processErrors({ targetMashPh: "5.4", boilMinutes: "60", knockoutTempF: "66", whirlpoolTempF: "", spargeWaterGal: "0" })).toEqual({});
  });
  it("refuses knockout barrels above the vessel's capacity (#1476)", () => {
    expect(timelineReason({ ...sourced, initialBbl: "26" })).toBe("Still needed: at most 25.5 bbl into FV1.");
    expect(timelineReason({ ...sourced, initialBbl: "25.5" })).toBeNull();
  });
  it("refuses a pulled ingredient without a source, but not one pulled to zero", () => {
    expect(timelineReason(timeline)).not.toBeNull();
    expect(timelineReason({ ...timeline, ingredients: [{ ...chit, packs: "0", loose: "", confirmed: true }, { ...hops, confirmed: true }] })).toBeNull();
  });
  it("refuses a negative or non-numeric pull", () => {
    expect(timelineReason({ ...sourced, ingredients: [{ ...hops, packs: "-1", confirmed: true }] })).not.toBeNull();
    expect(timelineReason({ ...sourced, ingredients: [{ ...hops, loose: "abc", confirmed: true }] })).not.toBeNull();
  });
  it("records nothing pulled only when the brewer confirms no ingredients were used", () => {
    const none = { ...sourced, ingredients: [{ ...hops, packs: "0", loose: "0", confirmed: true }] };
    expect(timelineReason(none)).not.toBeNull();
    expect(timelineReason({ ...none, confirmEmpty: true })).toBeNull();
    expect(timelineReason({ ...sourced, ingredients: [], confirmEmpty: true })).toBeNull();
  });
  it("refuses pulls that together exceed what their source holds, or a source no longer in stock", () => {
    const twice = { ...sourced, ingredients: [{ ...oats, confirmed: true }, { ...oats, key: "oats-2", confirmed: true }] };
    expect(timelineReason(twice)).not.toBeNull();
    expect(timelineReason({ ...sourced, sources: [onHand("ns", "freezer", "f1", "ns-1")] })).not.toBeNull();
  });
  it("turns a confirmed row green only when it has a source within stock", () => {
    expect(timelineTone({ ...hops, confirmed: true }, timeline.sources)).toBe("ok");
    expect(timelineTone({ ...chit, confirmed: true }, timeline.sources)).toBe("w");
    expect(timelineTone({ ...hops, confirmed: true }, [])).toBe("w");
    expect(timelineTone({ ...chit, packs: "0", loose: "", confirmed: true }, timeline.sources)).toBe("ok");
    expect(timelineTone(hops, timeline.sources)).toBe("");
    expect(timelineTone({ ...hops, packs: "0" }, timeline.sources)).toBe("w");
  });
  it("counts a stage's confirmed ingredients, and says nothing for a stage without any", () => {
    expect(stageProgress([{ ...chit, confirmed: true }, oats])).toBe("1 of 2 confirmed");
    expect(stageProgress([])).toBeUndefined();
  });
  it("confirms every ingredient at its current amount", () => {
    const rows = confirmAll([oats, { ...hops, packs: "0", loose: "30" }]);
    expect(rows.map(row => row.confirmed)).toEqual([true, true]);
    expect(rows[1]).toMatchObject({ packs: "0", loose: "30" });
  });
  it("knows whether anything is pulled, which is when the confirm-empty switch hides", () => {
    expect(anyPulled(sourced)).toBe(true);
    expect(anyPulled({ ...sourced, ingredients: [{ ...hops, packs: "0", loose: "" }] })).toBe(false);
    expect(anyPulled({ ...sourced, ingredients: [] })).toBe(false);
  });
});

describe("brewTargets", () => {
  const version = { version: 1, mash_schedule: [{ name: "Protein", tempF: 122, minutes: 15 }, { name: "Sacc", tempF: 152, minutes: 45 }],
    mash_temp_f: 152, target_mash_ph: 5.3, pre_boil_bbl: 25, boil_minutes: 60, whirlpool_temp_f: 180, whirlpool_minutes: 20, knockout_temp_f: 66 };
  it("reads each stage's target from the pinned version", () => {
    expect(brewTargets({ version })).toEqual({ mash: "152 °F · 60 min · pH 5.3", lauter: "pre-boil 25 bbl", boil: "60 min", whirlpool: "180 °F · 20 min", knockout: "66 °F" });
  });
  it("omits what the version leaves blank, and a stage with nothing set", () => {
    const sparse = { mash_schedule: [], mash_temp_f: null, target_mash_ph: 5.3, pre_boil_bbl: null, boil_minutes: null, whirlpool_temp_f: null, whirlpool_minutes: 20, knockout_temp_f: null };
    expect(brewTargets({ version: sparse })).toEqual({ mash: "pH 5.3", whirlpool: "20 min" });
    expect(brewTargets({})).toEqual({});
  });
});

describe("timelineRecordPayload", () => {
  it("records each pulled ingredient at its exact source, skipping zero pulls and blank readings", () => {
    const model = { ...sourced, ingredients: [{ ...hops, packs: "0.5", loose: "2" }, { ...chit, packs: "0", loose: "" }, oats], process: { mashWaterGal: "620", targetMashPh: "" } };
    expect(timelineRecordPayload(model, "bat-1")).toEqual(["record_brew_day", {
      batchId: "bat-1", vesselId: "fv1", brewedOn: "2026-10-22", initialBbl: 22, process: { mashWaterGal: 620 }, confirmEmpty: false,
      actuals: [
        { materialId: "ns", locationId: "freezer", binId: "f1", lotId: "ns-1", recipeIngredientId: "ns", stage: "whirlpool", qty: 24 },
        { materialId: "oats", locationId: "dry", binId: "d1", lotId: null, recipeIngredientId: "oats", stage: "mash", qty: 200 },
      ],
    }]);
  });
  it("sends an empty record with the brewer's confirmation", () => {
    expect(timelineRecordPayload({ ...sourced, ingredients: [], confirmEmpty: true }, "bat-1")[1]).toMatchObject({ actuals: [], confirmEmpty: true });
  });
  it("refuses a pulled ingredient with no source rather than drop it", () => {
    expect(() => timelineRecordPayload(timeline, "bat-1")).toThrow("Choose an exact material source");
  });
  it("records a saved pull's amount and source", () => {
    const ingredients = brewIngredients(plan, [pull], sources, 22).filter(row => row.key === "ri-chit");
    expect(timelineRecordPayload({ ...sourced, ingredients }, "bat-1")[1].actuals).toEqual([
      { materialId: "chit", locationId: "malt-room", binId: "a2", lotId: "c-2", recipeIngredientId: "ri-chit", stage: "mash", qty: 210 },
    ]);
  });
});

const plan: BrewPlan = { ingredients: [
  { id: "ri-chit", material_id: "chit", materialName: "Chit Malt", unit: "lb", stage: "mash", per_bbl_qty: 10, purchaseUomFactor: 50 },
  { id: "ri-dry", material_id: "ns", materialName: "Nelson", unit: "lb", stage: "dry_hop", per_bbl_qty: 1 },
  { id: "ri-ns", material_id: "ns", materialName: "Nelson", unit: "lb", stage: "whirlpool", per_bbl_qty: 2, purchaseUomFactor: 44 },
  { id: "ri-ferm", material_id: "yeast", materialName: "Yeast", unit: "each", stage: "fermentation", per_bbl_qty: 0.1 },
  { id: "ri-salt", material_id: "salt", materialName: "Gypsum", unit: "lb", stage: "mash", per_bbl_qty: 0.011364 },
  { id: "ri-dry2", material_id: "citra", materialName: "Citra", unit: "lb", stage: "dry_hop", per_bbl_qty: 1 },
] };
const stock = (material: string, bin: string, lot: string | null): BrewMaterialSource => ({ material_id: material, material_name: material, unit: "lb", location_id: "malt-room", location_name: "Malt room", bin_id: bin, bin_name: bin.toUpperCase(), lot_id: lot, lot_code: lot && lot.toUpperCase(), qty: 1000 });
const sources = [stock("chit", "a1", "c-1"), stock("chit", "a2", "c-2"), stock("ns", "f1", "ns-1")];
const pull: BrewPull = { ...stock("chit", "a2", "c-2"), id: "p1", recipe_ingredient_id: "ri-chit", qty: 210 };

describe("brewIngredients", () => {
  it("keeps the brew-day lines in plan order with the plan scaled exactly and the pack size", () => {
    const rows = brewIngredients(plan, [], sources, 22);
    expect(rows.map(r => [r.key, r.stage, r.plan, r.packSize])).toEqual([["ri-chit", "mash", 220, 50], ["ri-ns", "whirlpool", 44, 44], ["ri-salt", "mash", 0.25, 1]]);
    expect(rows[0]).toMatchObject({ name: "Chit Malt", materialId: "chit", unit: "lb" });
  });
  it("starts at plan with the only matching source, or none when several or no source match", () => {
    const [chit, ns, salt] = brewIngredients(plan, [], sources, 22);
    expect(chit).toMatchObject({ packs: "4", loose: "20", source: null });
    expect(ns).toMatchObject({ packs: "1", loose: "0", source: { lot: "NS-1", bin: "Malt room / F1", materialId: "ns", locationId: "malt-room", binId: "f1", lotId: "ns-1" } });
    expect(salt.source).toBeNull();
  });
  it("starts a line with a saved pull at its amount and exact source", () => {
    const [chit] = brewIngredients(plan, [pull], sources, 22);
    expect(chit).toMatchObject({ plan: 220, packs: "4", loose: "10", source: { lot: "C-2", bin: "Malt room / A2", binId: "a2", lotId: "c-2" } });
  });
  it("once Prep is saved, starts a line it left off (pulled to zero with no source) at zero", () => {
    const [, ns] = brewIngredients(plan, [pull], sources, 22);
    expect(ns).toMatchObject({ plan: 44, packs: "0", loose: "0" });
  });
});

describe("sourceChoices", () => {
  it("offers only the line's material, labelled by lot, bin and what is on hand", () => {
    const untracked = { ...stock("chit", "a3", null), qty: 12.5 };
    expect(sourceChoices([...sources, untracked], "chit").map(c => [c.value, c.label])).toEqual([
      ["chit/malt-room/a1/c-1", "C-1 · Malt room / A1 · 1000 lb available"],
      ["chit/malt-room/a2/c-2", "C-2 · Malt room / A2 · 1000 lb available"],
      ["chit/malt-room/a3/", "Untracked · Malt room / A3 · 12.5 lb available"],
    ]);
    expect(sourceChoices(sources, "salt")).toEqual([]);
  });
  it("gives the source a picked choice sets on the line", () => {
    const [, second] = sourceChoices(sources, "chit");
    expect(second.source).toEqual({ lot: "C-2", bin: "Malt room / A2", materialId: "chit", locationId: "malt-room", binId: "a2", lotId: "c-2" });
    expect(timelineReason({ ...timeline, sources: [...timeline.sources!, ...sources], ingredients: [{ ...chit, source: second.source, confirmed: true }, { ...hops, confirmed: true }] })).toBeNull();
  });
});

describe("laterAdditions", () => {
  it("counts the cellar-stage lines by stage, in stage order", () => {
    expect(laterAdditions(plan)).toBe("Fermentation 1 · Dry hop 2");
  });
  it("reads None when the recipe plans nothing later", () => {
    expect(laterAdditions({ ingredients: plan.ingredients!.filter(r => r.stage === "mash") })).toBe("None");
    expect(laterAdditions({})).toBe("None");
  });
});

const prep: BrewPrepViewModel = { title: "BAT-1", vesselId: "fv1", vessels: [], ingredients: [hops, oats], later: "None" };

describe("prepReason", () => {
  it("saves when every line has a source", () => {
    expect(prepReason(prep)).toBeNull();
  });
  it("refuses an unsourced line unless it is pulled to zero", () => {
    expect(prepReason({ ...prep, ingredients: [hops, chit] })).not.toBeNull();
    expect(prepReason({ ...prep, ingredients: [hops, { ...chit, packs: "0", loose: "" }] })).toBeNull();
  });
  it("refuses negative or non-numeric amounts", () => {
    expect(prepReason({ ...prep, ingredients: [{ ...hops, packs: "-1" }] })).not.toBeNull();
    expect(prepReason({ ...prep, ingredients: [{ ...hops, loose: "abc" }] })).not.toBeNull();
  });
});

describe("brewPullsPayload", () => {
  it("sends only sourced lines at their pulled amount, and a blank vessel as null", () => {
    expect(brewPullsPayload({ ...prep, vesselId: "", ingredients: [{ ...hops, packs: "0.5", loose: "2" }, { ...chit, packs: "0", loose: "" }, oats] })).toEqual({
      vesselId: null,
      lines: [
        { recipeIngredientId: "ns", materialId: "ns", locationId: "freezer", binId: "f1", lotId: "ns-1", qty: 24 },
        { recipeIngredientId: "oats", materialId: "oats", locationId: "dry", binId: "d1", lotId: null, qty: 200 },
      ],
    });
    expect(brewPullsPayload(prep).vesselId).toBe("fv1");
  });
});

describe("openBrewTab", () => {
  it("opens the tab ?tab= names", () => {
    expect(openBrewTab("prep", true)).toBe("prep");
    expect(openBrewTab("brew-day", false)).toBe("brew-day");
  });
  it("otherwise opens Brew day once Prep pulls are saved, else Prep", () => {
    expect(openBrewTab(undefined, true)).toBe("brew-day");
    expect(openBrewTab(undefined, false)).toBe("prep");
    expect(openBrewTab("other", false)).toBe("prep");
  });
});

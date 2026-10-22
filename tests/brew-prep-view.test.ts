// tests/brew-prep-view.test.ts — the brew prep pull list and the brew-day
// timeline's pure rules (lib/mgr/brew-prep-view.ts).
import { describe, expect, it } from "vitest";
import { canRecordTimeline, currentStage, isShort, pullDetail, startAtPlan, timelineStages, type BrewIngredient, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";

const chit: BrewIngredient = startAtPlan({ key: "chit", name: "Chit Malt", stage: "mash", plan: 220, unit: "lb", packSize: 50, source: null });
const hops: BrewIngredient = startAtPlan({ key: "ns", name: "Nelson", stage: "whirlpool", plan: 44, unit: "lb", packSize: 44, source: { lot: "NS-1", bin: "Freezer / F1" } });
const oats: BrewIngredient = startAtPlan({ key: "oats", name: "Rolled Oats", stage: "mash", plan: 200, unit: "lb", packSize: 50, source: { lot: null, bin: "Dry / D1" } });

describe("pull lines", () => {
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
});

const timeline: BrewTimelineViewModel = {
  title: "BAT-1", ingredients: [{ ...chit, confirmed: true }, { ...hops, confirmed: true }], targets: {}, process: {},
  vesselId: "fv1", vessels: [{ id: "fv1", name: "FV1", kind: "fermenter", capacity_bbl: 25.5 }], initialBbl: "22", brewedOn: "2026-10-22",
};

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
    expect(canRecordTimeline(timeline)).toBe(true);
    expect(canRecordTimeline({ ...timeline, ingredients: [chit, { ...hops, confirmed: true }] })).toBe(false);
    for (const patch of [{ initialBbl: "0" }, { initialBbl: "" }, { vesselId: "missing" }, { brewedOn: "" }]) expect(canRecordTimeline({ ...timeline, ...patch })).toBe(false);
  });
});

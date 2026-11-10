// tests/recipe-process-view.test.ts — draft helpers for the schedule sheets (issue #278).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FermentationScheduleView } from "../components/mgr/views/fermentation-schedule";
import { fermentationRowTitle, fermentationStageDetail, fermentationSummary, fromIngredientFields, ingredientDetail, ingredientTiming, mashRowTitle, packsFieldText, packsLabel, packsToPerBbl, WATER_ROW_TITLE, ingredientReason, mashStepReason, stageReason, toIngredientFields, ionReadout, mashRowSummary, mashStepDetail, mashSummary, moveItem, perBblDisplay, waterReadout, profileIons, splitByStage, suggestAdditions, upsertAt, waterAdditionDetail, waterRowSummary, type FermentationStage, type MashStep, type SaltMaterial, type WaterDraft } from "@/lib/mgr/recipe-process-view";

const mash: MashStep[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, minutes: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 },
];
const ferm: FermentationStage[] = [{ name: "Primary", kind: "primary", tempF: 68, days: 4 }, { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 }];

describe("schedule drafts", () => {
  it("reads a fermentation stage as its temperature and days, on the schedule sheet too", () => {
    expect(fermentationStageDetail(ferm[0])).toBe("68 °F · 4 days");
    const oneDay = { ...ferm[1], days: 1 };
    expect(fermentationStageDetail(oneDay)).toBe("34 °F · 1 day");
    expect(renderToStaticMarkup(createElement(FermentationScheduleView, { stages: [oneDay], header: null }))).toContain("34 °F · 1 day");
  });
  it("moves a step and keeps the rest in order", () => {
    expect(moveItem(mash, 2, -1).map((s) => s.name)).toEqual(["Mash-in", "Mash-out", "Saccharification"]);
    expect(moveItem(mash, 0, -1)).toBe(mash);
  });
  it("upsertAt appends without an index and replaces with one", () => {
    const added = upsertAt(mash, undefined, { name: "Rest", kind: "rest", tempF: 140, minutes: 5 });
    expect(added).toHaveLength(4);
    expect(upsertAt(mash, 1, { ...mash[1], minutes: 45 })[1].minutes).toBe(45);
  });
  it("the longest in-range rest wins over the first, as the RPC derives mash_temp_f", () => {
    expect(mashSummary([{ name: "Beta", kind: "rest", tempF: 145, minutes: 20 }, { name: "Alpha", kind: "rest", tempF: 158, minutes: 40 }])).toBe("Total 60 min. The 158 °F rest is recorded as the mash temperature.");
  });
  it("reads the sheet's water facts out, skipping what it does not hold", () => {
    const names = (id: string) => (id === "hazy" ? "Hazy target" : undefined);
    expect(waterReadout({ targetProfileId: "hazy", sourceProfileId: "", mashGal: "9.5", spargeGal: "", targetMashPh: "5.35" }, names)).toEqual([
      ["Target profile", "Hazy target"], ["Mash water", "9.5 gal"], ["Target mash pH", "5.35"],
    ]);
    expect(waterReadout({ targetProfileId: "gone", sourceProfileId: "hazy", mashGal: "", spargeGal: "4", targetMashPh: "" }, names)).toEqual([["Source profile", "Hazy target"], ["Sparge water", "4 gal"]]);
  });
  it("summaries name the recorded mash-temperature rest and the total days", () => {
    expect(mashSummary(mash)).toBe("Total 85 min. The 152 °F rest is recorded as the mash temperature.");
    expect(mashSummary([{ name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 }])).toBe("Total 10 min. No rest falls between 144 and 162 °F, so no mash temperature is recorded.");
    expect(fermentationSummary(ferm)).toBe("Total 6 days.");
  });
  it("an ingredient row reads its timing and amount, and leaves the stage to whoever draws it", () => {
    // The brewsheet draws a line under its step's heading, so the detail does not repeat the step.
    expect(ingredientDetail("whirlpool", 4, "1.2", "lb")).toBe("4 min · 1.2 lb / bbl");
    // Fermentation and dry hop are timed in days from the start of fermentation (#1478).
    expect(ingredientDetail("dry_hop", 3 * 1440, "1.2", "lb")).toBe("day 3 · 1.2 lb / bbl");
    expect(ingredientDetail("mash", null, "40.9")).toBe("40.9 / bbl");
    // The brewsheet prints the timing in its own column.
    expect(ingredientTiming("whirlpool", 4)).toBe("4 min");
    expect(ingredientTiming("dry_hop", 3 * 1440)).toBe("day 3");
    expect([ingredientTiming("mash", null), ingredientTiming("boil", "")]).toEqual(["", ""]);
  });
  it("a step's schedule row says what it opens without repeating the step's heading", () => {
    expect(mashRowTitle(3)).toBe("Schedule · 3 steps");
    expect(mashRowTitle(1)).toBe("Schedule · 1 step");
    expect(fermentationRowTitle(4)).toBe("Schedule · 4 stages");
    expect(WATER_ROW_TITLE).toBe("Profile and additions");
  });
  it("a water addition row reads its amount and its stage in sentence case (#1139)", () => {
    expect(waterAdditionDetail({ qty: 4, unit: "g", stage: "mash" })).toBe("4 g · Mash");
    expect(waterAdditionDetail({ qty: 3, unit: "mL", stage: "sparge" })).toBe("3 mL · Sparge");
  });
  it("the water row summary names the target profile and counts the additions, in sentence case (#1139)", () => {
    expect(waterRowSummary("Hazy target", 3)).toBe("Target Hazy target · 3 additions");
    expect(waterRowSummary(undefined, 0)).toBe("No target · 0 additions");
    expect(waterRowSummary(undefined, 1)).toBe("No target · 1 addition");
  });
  it("prints a per-bbl quantity to three significant digits, never two fraction digits", () => {
    expect(perBblDisplay(40.909091)).toBe("40.9");
    expect(perBblDisplay(0.045455)).toBe("0.0455");
    expect(perBblDisplay(0.011364)).toBe("0.0114");
  });
  it("the mash row summary gives the total and the saccharification rest", () => {
    expect(mashRowSummary([{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }])).toBe("Total 60 min · 152 °F saccharification rest");
    expect(mashRowSummary([{ name: "Mash-in", kind: "infusion", tempF: 152, minutes: 60 }, { name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 }])).toBe("Total 70 min · 152 °F saccharification rest");
    expect(mashRowSummary([{ name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 }])).toBe("Total 10 min · no saccharification rest");
  });
  it("a mash step's detail hides the kind when it repeats the name", () => {
    expect(mashStepDetail({ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 })).toBe("Infusion · 152 °F · 60 min");
    expect(mashStepDetail({ name: "Rest", kind: "rest", tempF: 145, minutes: 20 })).toBe("145 °F · 20 min");
  });
});

const denverRow = { calcium_ppm: 42, magnesium_ppm: 8, sodium_ppm: 22, sulfate_ppm: 65, chloride_ppm: 30, bicarbonate_ppm: 110 };
const hazyRow = { calcium_ppm: 110, magnesium_ppm: 10, sodium_ppm: 15, sulfate_ppm: 90, chloride_ppm: 180, bicarbonate_ppm: 40 };
const salts: SaltMaterial[] = [{ id: "gypsum", name: "Gypsum", salt: "gypsum" }, { id: "cacl", name: "Calcium chloride", salt: "calcium_chloride" }, { id: "lactic", name: "Lactic acid", salt: null }];
const draft: WaterDraft = { targetProfileId: "hazy", sourceProfileId: "", mashGal: "9.5", spargeGal: "12", targetMashPh: "", additions: [
  { materialId: "gypsum", qty: 4, unit: "g", stage: "mash" }, { materialId: "lactic", qty: 3, unit: "mL", stage: "sparge" },
] };

describe("water suggestions", () => {
  it("maps a profile row to ions", () => {
    expect(profileIons(denverRow)).toEqual({ calcium: 42, magnesium: 8, sodium: 22, sulfate: 65, chloride: 30, bicarbonate: 110 });
  });
  it("splits grams by volume and folds a stage that rounds to zero into the other", () => {
    expect(splitByStage(10, 9.5, 12)).toEqual({ mash: 4.4, sparge: 5.6 });
    expect(splitByStage(0.1, 9.5, 12)).toEqual({ mash: 0, sparge: 0.1 });
    expect(splitByStage(5, 10, 0)).toEqual({ mash: 5, sparge: 0 });
  });
  it("treats a negative stage volume as empty when splitting", () => {
    expect(splitByStage(10, -3, 12)).toEqual({ mash: 0, sparge: 10 });
    expect(splitByStage(10, 9.5, -1)).toEqual({ mash: 10, sparge: 0 });
  });
  it("replaces salt additions with the suggestion and keeps acids where they were", () => {
    const out = suggestAdditions(draft, profileIons(denverRow), profileIons(hazyRow), salts);
    expect(out.filter((a) => a.materialId === "lactic")).toEqual([{ materialId: "lactic", qty: 3, unit: "mL", stage: "sparge" }]);
    expect(out.some((a) => a.materialId === "cacl" && a.stage === "mash")).toBe(true);
    expect(out.some((a) => a.materialId === "cacl" && a.stage === "sparge")).toBe(true);
    expect(out.every((a) => a.unit === "g" || a.materialId === "lactic")).toBe(true);
  });
  it("dedupes stocked salts sharing a salt identity, naming each material id at most once per stage", () => {
    const dupeSalts: SaltMaterial[] = [
      { id: "gypsum-a", name: "Gypsum (bag 1)", salt: "gypsum" },
      { id: "gypsum-b", name: "Gypsum (bag 2)", salt: "gypsum" },
      { id: "cacl", name: "Calcium chloride", salt: "calcium_chloride" },
    ];
    const dupeDraft: WaterDraft = { targetProfileId: "hazy", sourceProfileId: "", mashGal: "9.5", spargeGal: "12", targetMashPh: "", additions: [] };
    const out = suggestAdditions(dupeDraft, profileIons(denverRow), profileIons(hazyRow), dupeSalts);
    expect(out.some((a) => a.materialId === "gypsum-b")).toBe(false);
    for (const stage of ["mash", "sparge"]) {
      expect(out.filter((a) => a.materialId === "gypsum-a" && a.stage === stage).length).toBeLessThanOrEqual(1);
      expect(out.filter((a) => a.materialId === "cacl" && a.stage === stage).length).toBeLessThanOrEqual(1);
    }
  });
  it("reads out six ions against target and flags a miss over 20 ppm", () => {
    const rows = ionReadout(draft, profileIons(denverRow), profileIons(hazyRow), salts);
    expect(rows.map((r) => r.ion)).toEqual(["Calcium", "Magnesium", "Sodium", "Sulfate", "Chloride", "Bicarbonate"]);
    const cl = rows.find((r) => r.ion === "Chloride")!;
    expect(cl.detail).toMatch(/^30 of 180 ppm · −150$/);
    expect(cl.warning).toBe(true);
    expect(ionReadout(draft, profileIons(denverRow), undefined, salts)).toEqual([]);
  });
  it("rounds the delta before choosing its sign, so −0.4 ppm off renders +0, never −0", () => {
    const target = { ...profileIons(hazyRow), sodium: profileIons(denverRow).sodium + 0.4 };
    const rows = ionReadout({ ...draft, additions: [] }, profileIons(denverRow), target, salts);
    const na = rows.find((r) => r.ion === "Sodium")!;
    expect(na.detail).toContain("+0");
    expect(na.detail).not.toContain("−0");
  });
});

describe("ingredient timing and schedule rows (#1478)", () => {
  const limits = { boilMinutes: 60, fermentationDays: 14 };
  it("takes fermentation and dry-hop timing in whole days and stores minutes", () => {
    const fields = toIngredientFields({ materialId: "hop", perBblQty: "1", stage: "dry_hop", timingMinutes: String(3 * 1440) });
    expect(fields.timing).toBe("3");
    expect(fromIngredientFields({ ...fields, timing: "5" }).timingMinutes).toBe(String(5 * 1440));
    expect(fromIngredientFields({ ...fields, stage: "boil", timing: "15" }).timingMinutes).toBe("15");
  });
  it("names timing outside the stage's range or in exponent notation", () => {
    const f = (stage: "boil" | "dry_hop" | "mash", timing: string) => ingredientReason({ materialId: "m", perBblQty: "1", stage, timing }, limits);
    expect(f("boil", "-5")).toBe("Still needed: boil timing from 0 to 60 minutes.");
    expect(f("boil", "61")).toBe("Still needed: boil timing from 0 to 60 minutes.");
    expect(f("mash", "1e1")).toBe("Still needed: mash timing from 0 to 1440 minutes.");
    expect(f("dry_hop", "121")).toBe("Still needed: dry hop day from 0 to 120.");
    expect(f("dry_hop", "2.5")).toBe("Still needed: dry hop day from 0 to 120.");
    expect(f("dry_hop", "120")).toBeNull();
    expect(f("boil", "")).toBeNull();
  });
  it("refuses exponent notation and out-of-range temperatures on mash steps and fermentation stages", () => {
    expect(mashStepReason({ name: "Sacch", kind: "infusion", tempF: "152", minutes: "1e1" })).toBe("Still needed: a duration above zero.");
    expect(mashStepReason({ name: "Sacch", kind: "infusion", tempF: "300", minutes: "60" })).toBe("Still needed: a temperature from 25 to 212 °F.");
    expect(stageReason({ name: "Primary", kind: "primary", tempF: "68", days: "1e1" })).toBe("Still needed: a duration above zero.");
    expect(stageReason({ name: "Primary", kind: "primary", tempF: "-10", days: "7" })).toBe("Still needed: a temperature from 25 to 212 °F.");
    expect(stageReason({ name: "Primary", kind: "primary", tempF: "68", days: "7" })).toBeNull();
  });
});

describe("an ingredient typed in packs", () => {
  const bags = { factor: 55, unit: "lb", packName: "bag" as const, batchBbl: 22 };
  const sacks = { ...bags, factor: 50, packName: null };
  it("works the per-bbl amount out from a count of packs: packs × pack size ÷ batch size, to 6 decimals", () => {
    expect(packsToPerBbl("23", bags)).toBe("57.5");
    expect(packsToPerBbl("2.5", bags)).toBe("6.25");
    expect(packsToPerBbl("1", sacks)).toBe("2.272727");
  });
  it("gives no per-bbl amount while the count is not a number", () => {
    expect(packsToPerBbl("", bags)).toBe("");
    expect(packsToPerBbl("1e1", bags)).toBe("");
  });
  it("reads a per-bbl amount as its count of packs, so the two fields stay in step", () => {
    expect(packsFieldText("57.5", "", bags)).toBe("23");
    expect(packsFieldText("44", "", bags)).toBe("17.6");
    // 2.272727 lb/bbl at 22 bbl is 49.999994 lb, which is 50 lb to the 4 decimals a material quantity keeps.
    expect(packsFieldText("2.272727", "", sacks)).toBe("1");
    expect(packsFieldText("", "", bags)).toBe("");
    expect(packsFieldText("0", "", bags)).toBe("");
  });
  it("keeps the count as typed while the per-bbl amount is still the one it gave", () => {
    // Mid-typing "2.5": the dot must not snap back to "2".
    expect(packsFieldText("5", "2.", bags)).toBe("2.");
    expect(packsFieldText("", "", bags)).toBe("");
    // The per-bbl field was edited since, so the count follows it.
    expect(packsFieldText("57.5", "2.", bags)).toBe("23");
  });
  it("labels the count with the pack word, the pack size and the batch it is for", () => {
    expect(packsLabel(bags)).toBe("Bags (55 lb) for 22 bbl");
    expect(packsLabel({ ...bags, factor: 44, packName: "box" })).toBe("Boxes (44 lb) for 22 bbl");
    expect(packsLabel(sacks)).toBe("Packs (50 lb) for 22 bbl");
  });
});

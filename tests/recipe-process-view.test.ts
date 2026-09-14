// tests/recipe-process-view.test.ts — draft helpers for the schedule sheets (issue #278).
import { describe, expect, it } from "vitest";
import { fermentationSummary, ionReadout, mashSummary, moveItem, processReadout, profileIons, splitByStage, suggestAdditions, upsertAt, type FermentationStage, type MashStep, type SaltMaterial, type WaterDraft } from "@/lib/mgr/recipe-process-view";

const mash: MashStep[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, minutes: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 },
];
const ferm: FermentationStage[] = [{ name: "Primary", kind: "primary", tempF: 68, days: 4 }, { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 }];

describe("schedule drafts", () => {
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
    expect(mashSummary([{ name: "Beta", kind: "rest", tempF: 145, minutes: 20 }, { name: "Alpha", kind: "rest", tempF: 158, minutes: 40 }])).toBe("Total 60 min · the 158 °F rest feeds the prediction.");
  });
  it("reads a cut version's process facts out, skipping what it does not carry", () => {
    const names = (id: string | null) => (id === "hazy" ? "Hazy target" : null);
    expect(processReadout({ pre_boil_bbl: 12.5, whirlpool_minutes: 20, whirlpool_temp_f: 180, whirlpool_rest_minutes: null, knockout_temp_f: null, target_water_profile_id: "hazy", source_water_profile_id: null, mash_water_gal: 9.5, sparge_water_gal: null, target_mash_ph: 5.35 }, names)).toEqual([
      ["Pre-boil volume", "12.5 bbl"], ["Whirlpool", "20 min at 180 °F"], ["Source profile", "Brewery default"], ["Target profile", "Hazy target"], ["Mash water", "9.5 gal"], ["Target mash pH", "5.35"],
    ]);
  });
  it("summaries name the rest that feeds the prediction and the total days", () => {
    expect(mashSummary(mash)).toBe("Total 85 min · the 152 °F rest feeds the prediction.");
    expect(mashSummary([{ name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 }])).toBe("Total 10 min · no rest between 144 and 162 °F, so the prediction has no mash temperature.");
    expect(fermentationSummary(ferm)).toBe("Total 6 days.");
    expect(fermentationSummary(ferm, 4)).toBe("Total 6 days · dry hop day 4 falls in Primary.");
    expect(fermentationSummary(ferm, 9)).toBe("Total 6 days · dry hop day 9 is after the last stage.");
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

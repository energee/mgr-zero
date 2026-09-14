// tests/recipe-process-view.test.ts — draft helpers for the schedule sheets (issue #278).
import { describe, expect, it } from "vitest";
import { fermentationSummary, mashSummary, moveItem, upsertAt, type FermentationStage, type MashStep } from "@/lib/mgr/recipe-process-view";

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
  it("summaries name the rest that feeds the prediction and the total days", () => {
    expect(mashSummary(mash)).toBe("Total 85 min · the 152 °F rest feeds the prediction.");
    expect(mashSummary([{ name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 }])).toBe("Total 10 min · no rest between 144 and 162 °F, so the prediction has no mash temperature.");
    expect(fermentationSummary(ferm)).toBe("Total 6 days.");
    expect(fermentationSummary(ferm, 4)).toBe("Total 6 days · dry hop day 4 falls in Primary.");
    expect(fermentationSummary(ferm, 9)).toBe("Total 6 days · dry hop day 9 is after the last stage.");
  });
});

// tests/recipe-outcomes-view.test.ts — the text Batch actuals draws from
// get_recipe_outcomes: one tape row per batch (outcomeTape), which marks a
// batch of an earlier copy and never prints a version number, and the summary
// line for the shown copy (outcomeSummary). Pure: no database.
import { describe, expect, it } from "vitest";
import { outcomeSummary, outcomeTape, type RecipeOutcome } from "../lib/mgr/recipe-view";

const closed: RecipeOutcome = {
  batchId: "b1", batchNo: 413, version: 4, brewedOn: "2026-10-03", closed: true,
  ogPlato: 14.8, fgPlato: 3.5, abv: 6.1, apparentAttenuation: 0.77, brewhouseEfficiency: 0.7,
  predicted: { ogPlato: 15.2, fgPlato: 3.5, abv: 6.3 }, assumedEfficiency: 0.72, assumedAttenuation: 0.78,
};
const oneReading = { fgPlato: null, abv: null, apparentAttenuation: null };
const detail = (outcome: Partial<RecipeOutcome>, unit: "plato" | "sg" = "plato") => outcomeTape([{ ...closed, ...outcome }], unit, 4)![0][1];

describe("outcomeTape", () => {
  it("labels a batch and compares each figure with its prediction", () => {
    expect(outcomeTape([closed], "plato", 4)).toEqual([
      ["B-0413 · Oct 3, 2026", "OG 14.8 °P (15.2) · FG 3.5 °P (3.5) · ABV 6.1% (6.3%) · attenuation 77% (78%) · efficiency 70% (72%)"],
    ]);
  });

  it("marks a batch brewed from an earlier copy, without a version number", () => {
    const labels = outcomeTape([closed, { ...closed, batchId: "b0", batchNo: 371, version: 3, brewedOn: "2026-07-18" }], "plato", 4)!.map(([label]) => label);
    expect(labels).toEqual(["B-0413 · Oct 3, 2026", "B-0371 · Jul 18, 2026 · earlier recipe"]);
  });

  it("marks batches against the copy being shown, so an earlier copy's own batches are unmarked", () => {
    const labels = outcomeTape([closed, { ...closed, batchId: "b0", batchNo: 371, version: 3, brewedOn: "2026-07-18" }], "plato", 3)!.map(([label]) => label);
    expect(labels).toEqual(["B-0413 · Oct 3, 2026 · later recipe", "B-0371 · Jul 18, 2026"]);
  });

  it("prints gravity in the reader's unit", () => {
    expect(detail({}, "sg")).toContain("OG 1.060 (1.062) · FG 1.014 (1.014)");
  });

  it("leaves a null metric out", () => {
    expect(detail({ brewhouseEfficiency: null })).toBe("OG 14.8 °P (15.2) · FG 3.5 °P (3.5) · ABV 6.1% (6.3%) · attenuation 77% (78%)");
  });

  it("drops the bracket when the version predicted nothing, and keeps the assumptions", () => {
    expect(detail({ predicted: null, brewhouseEfficiency: null })).toBe("OG 14.8 °P · FG 3.5 °P · ABV 6.1% · attenuation 77% (78%)");
  });

  it("says when there are no readings", () => {
    expect(detail({ ...oneReading, ogPlato: null, brewhouseEfficiency: null })).toBe("no gravity readings yet");
  });

  it("ends a one-reading batch by asking for the second reading", () => {
    expect(detail(oneReading)).toBe("OG 14.8 °P (15.2) · efficiency 70% (72%) · FG needs a second reading");
  });

  it("ends an open batch with still open, its FG being the latest reading", () => {
    expect(detail({ closed: false, brewhouseEfficiency: null })).toBe("OG 14.8 °P (15.2) · FG 3.5 °P (3.5) · ABV 6.1% (6.3%) · attenuation 77% (78%) · still open");
    expect(detail({ ...oneReading, closed: false, brewhouseEfficiency: null })).toBe("OG 14.8 °P (15.2) · FG needs a second reading · still open");
  });

  it("is undefined with no batches, so the page draws no section", () => {
    expect(outcomeTape([], "plato", 4)).toBeUndefined();
  });
});

describe("outcomeSummary", () => {
  const second: RecipeOutcome = { ...closed, batchId: "b2", batchNo: 398, brewhouseEfficiency: 0.68, apparentAttenuation: 0.75 };
  const third: RecipeOutcome = { ...closed, batchId: "b3", batchNo: 380, brewhouseEfficiency: 0.71, apparentAttenuation: 0.78 };

  it("states the gap across closed batches of the shown version and gives no advice", () => {
    expect(outcomeSummary([second, third], 4)).toBe("2 batches: efficiency 68–71% against 72% assumed; attenuation 75–78% against 78% assumed.");
  });

  it("needs two closed batches with an efficiency", () => {
    expect(outcomeSummary([], 4)).toBeUndefined();
    expect(outcomeSummary([second], 4)).toBeUndefined();
    expect(outcomeSummary([second, { ...third, brewhouseEfficiency: null }], 4)).toBeUndefined();
  });

  it("skips open batches and other versions", () => {
    const open = { ...third, closed: false, brewhouseEfficiency: null };
    expect(outcomeSummary([second, closed, open], 4)).toBe("2 batches: efficiency 68–70% against 72% assumed; attenuation 75–77% against 78% assumed.");
    expect(outcomeSummary([second, { ...third, version: 3 }], 4)).toBeUndefined();
  });

  it("leaves attenuation out with fewer than two values", () => {
    expect(outcomeSummary([second, { ...third, apparentAttenuation: null }], 4)).toBe("2 batches: efficiency 68–71% against 72% assumed.");
  });

  it("prints one figure when the batches round alike", () => {
    expect(outcomeSummary([second, { ...third, brewhouseEfficiency: 0.681, apparentAttenuation: 0.751 }], 4)).toBe("2 batches: efficiency 68% against 72% assumed; attenuation 75% against 78% assumed.");
  });
});

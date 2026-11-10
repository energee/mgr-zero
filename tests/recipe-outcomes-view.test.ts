// tests/recipe-outcomes-view.test.ts — the table Batch actuals draws from
// get_recipe_outcomes: what the shown copy predicts and assumes on top, then
// one row per batch (outcomeTable). A batch of another copy is marked and
// carries its own copy's prediction; no version number is printed. Also the
// summary line for the shown copy (outcomeSummary). Pure: no database.
import { describe, expect, it } from "vitest";
import { outcomeSummary, outcomeTable, type RecipeOutcome } from "../lib/mgr/recipe-view";

const closed: RecipeOutcome = {
  batchId: "b1", batchNo: 413, version: 4, brewedOn: "2026-10-03", closed: true,
  ogPlato: 14.8, fgPlato: 3.5, abv: 6.1, apparentAttenuation: 0.77, brewhouseEfficiency: 0.7,
  predicted: { ogPlato: 15.2, fgPlato: 3.5, abv: 6.3 }, assumedEfficiency: 0.72, assumedAttenuation: 0.78,
};
const earlier: RecipeOutcome = { ...closed, batchId: "b0", batchNo: 371, version: 3, brewedOn: "2026-07-18", predicted: { ogPlato: 15.6, fgPlato: 3.6, abv: 6.5 }, assumedEfficiency: 0.74 };
const oneReading = { fgPlato: null, abv: null, apparentAttenuation: null };
/** The one row for `outcome`, on the copy `closed` is on. */
const row = (outcome: Partial<RecipeOutcome>, unit: "plato" | "sg" = "plato") => outcomeTable([{ ...closed, ...outcome }], unit, closed)!.rows[0];
const measured = (outcome: Partial<RecipeOutcome>) => row(outcome).cells.map((c) => c.measured);

describe("outcomeTable", () => {
  it("heads the columns in the reader's gravity unit, with what the shown copy predicts and assumes on top", () => {
    const table = outcomeTable([closed], "plato", closed)!;
    expect(table.columns).toEqual(["OG °P", "FG °P", "ABV", "Attenuation", "Efficiency"]);
    expect(table.predicted).toEqual(["15.2", "3.5", "6.3%", "78%", "72%"]);
    expect(table.rows).toEqual([{
      key: "b1", batch: "B-0413", brewed: "Oct 3, 2026", notes: [],
      cells: ["14.8", "3.5", "6.1%", "77%", "70%"].map((value) => ({ measured: value, predicted: "" })),
    }]);
  });

  it("prints gravity in the reader's unit", () => {
    const table = outcomeTable([closed], "sg", closed)!;
    expect(table.columns.slice(0, 2)).toEqual(["OG", "FG"]);
    expect(table.predicted.slice(0, 2)).toEqual(["1.062", "1.014"]);
    expect(row({}, "sg").cells.slice(0, 2).map((c) => c.measured)).toEqual(["1.060", "1.014"]);
  });

  it("marks a batch of an earlier copy and gives it its own copy's prediction, without a version number", () => {
    const [current, old] = outcomeTable([closed, earlier], "plato", closed)!.rows;
    expect(current.notes).toEqual([]);
    expect(old.notes).toEqual(["earlier recipe"]);
    expect(old.cells.map((c) => c.predicted)).toEqual(["15.6", "3.6", "6.5%", "78%", "74%"]);
    expect(JSON.stringify(old)).not.toMatch(/v3|version/);
  });

  it("marks batches against the copy being shown, so an earlier copy's own batches are unmarked", () => {
    const table = outcomeTable([closed, earlier], "plato", earlier)!;
    expect(table.predicted).toEqual(["15.6", "3.6", "6.5%", "78%", "74%"]);
    expect(table.rows.map((r) => r.notes)).toEqual([["later recipe"], []]);
    expect(table.rows[0].cells[0]).toEqual({ measured: "14.8", predicted: "15.2" });
    expect(table.rows[1].cells[0]).toEqual({ measured: "14.8", predicted: "" });
  });

  it("leaves a null metric blank", () => {
    expect(measured({ brewhouseEfficiency: null })).toEqual(["14.8", "3.5", "6.1%", "77%", ""]);
  });

  it("predicts no gravity when the copy predicted nothing, and keeps the assumptions", () => {
    expect(outcomeTable([closed], "plato", { ...closed, predicted: null })!.predicted).toEqual(["", "", "", "78%", "72%"]);
    // Another copy's batch that predicted nothing still carries what that copy assumed.
    expect(outcomeTable([{ ...earlier, predicted: null }], "plato", closed)!.rows[0].cells.map((c) => c.predicted)).toEqual(["", "", "", "78%", "74%"]);
  });

  it("says when there are no readings", () => {
    const none = row({ ...oneReading, ogPlato: null, brewhouseEfficiency: null });
    expect(none.cells.every((c) => c.measured === "")).toBe(true);
    expect(none.notes).toEqual(["no gravity readings yet"]);
  });

  it("asks a one-reading batch for the second reading", () => {
    const one = row(oneReading);
    expect(one.cells.map((c) => c.measured)).toEqual(["14.8", "", "", "", "70%"]);
    expect(one.notes).toEqual(["FG needs a second reading"]);
  });

  it("says an open batch is still open, its FG being the latest reading", () => {
    expect(row({ closed: false, brewhouseEfficiency: null }).notes).toEqual(["still open"]);
    expect(row({ ...oneReading, closed: false, brewhouseEfficiency: null }).notes).toEqual(["FG needs a second reading", "still open"]);
    expect(outcomeTable([{ ...earlier, closed: false }], "plato", closed)!.rows[0].notes).toEqual(["earlier recipe", "still open"]);
  });

  it("names a batch that has no number yet", () => {
    expect(row({ batchNo: null }).batch).toBe(row({ batchNo: null }).batch.trim());
    expect(row({ batchNo: null }).batch).not.toBe("");
  });

  it("is undefined with no batches, so the page draws no section", () => {
    expect(outcomeTable([], "plato", closed)).toBeUndefined();
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

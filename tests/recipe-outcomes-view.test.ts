// tests/recipe-outcomes-view.test.ts — the table Batch actuals draws from
// get_recipe_outcomes: what the shown copy predicts and assumes on top, then
// one row per batch, or per tank of a batch read in several (outcomeTable). A
// batch of another copy is marked and carries its own copy's prediction; no
// version number is printed. A batch another recipe brewed on the same grain
// bill reads "as <recipe>" with its mash figures only, and past the newest few
// those are counted, not listed. Also the summary line: the mash figures for
// the grain bill and the fermentation figures for the shown copy
// (outcomeSummary). Pure: no database.
import { describe, expect, it } from "vitest";
import { outcomeSummary, outcomeTable, type RecipeOutcome } from "../lib/mgr/recipe-view";

const closed: RecipeOutcome = {
  batchId: "b1", batchNo: 413, version: 4, brewedOn: "2026-10-03", closed: true,
  ogPlato: 14.8, fgPlato: 3.5, abv: 6.1, apparentAttenuation: 0.77, brewhouseEfficiency: 0.7,
  predicted: { ogPlato: 15.2, fgPlato: 3.5, abv: 6.3 }, assumedEfficiency: 0.72, assumedAttenuation: 0.78, sameGrainBill: true,
};
/** A batch another recipe brewed on the same grain bill, as the query returns it: no fermentation figures. */
const pooled = (n: number, recipeName = "Session IPA"): RecipeOutcome =>
  ({ ...closed, batchId: `p${n}`, batchNo: 300 + n, version: 2, recipeName, fgPlato: null, abv: null, apparentAttenuation: null });
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
    expect(table.batches).toBe(1);
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

  it("gives a batch read in two tanks a row per tank, each naming its tank", () => {
    const rows = outcomeTable([{ ...closed, vessel: "FV3" }, { ...closed, vessel: "FV5", fgPlato: 3.6 }], "plato", closed)!.rows;
    expect(rows.map((r) => [r.batch, r.tag, r.cells[1].measured])).toEqual([["B-0413", "in FV3", "3.5"], ["B-0413", "in FV5", "3.6"]]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
    expect(row({}).tag).toBeUndefined();
  });

  it("counts this recipe's batches: a batch in two tanks once, and no batch of another recipe", () => {
    expect(outcomeTable([{ ...closed, vessel: "FV3" }, { ...closed, vessel: "FV5" }, earlier, pooled(1)], "plato", closed)!.batches).toBe(2);
    expect(outcomeTable([pooled(1)], "plato", closed)!.batches).toBe(0);
  });

  it("reads a batch another recipe brewed as that recipe, with its OG and efficiency alone", () => {
    const [as] = outcomeTable([pooled(7)], "plato", closed)!.rows;
    expect(as).toMatchObject({ batch: "B-0307", tag: "as Session IPA", notes: [] });
    // Its copy belongs to another recipe: no earlier or later mark, no bracketed prediction, no FG asked for.
    expect(as.cells).toEqual(["14.8", "", "", "", "70%"].map((value) => ({ measured: value, predicted: "" })));
    expect(outcomeTable([{ ...pooled(7), closed: false, ogPlato: null, brewhouseEfficiency: null }], "plato", closed)!.rows[0].notes).toEqual(["no gravity readings yet", "still open"]);
  });

  it("says under the rows why a batch brewed as another recipe has no fermentation figures", () => {
    expect(outcomeTable([closed], "plato", closed)!.footnote).toBeUndefined();
    expect(outcomeTable([closed, pooled(1)], "plato", closed)!.footnote)
      .toBe("A batch brewed as another recipe counts toward the mash figures only, so its fermentation figures are left out.");
  });

  it("lists the newest five batches of other recipes and counts the rest, keeping every batch of this recipe", () => {
    const table = (others: number) => outcomeTable([...Array.from({ length: others }, (_, n) => pooled(n)), closed, earlier], "plato", closed)!;
    expect(table(5).rows.map((r) => r.key)).toEqual(["p0", "p1", "p2", "p3", "p4", "b1", "b0"]);
    expect(table(5).footnote).not.toMatch(/more/);
    expect(table(6).rows.map((r) => r.key)).toEqual(["p0", "p1", "p2", "p3", "p4", "b1", "b0"]);
    expect(table(6).footnote).toMatch(/left out\. 1 more batch of this grain bill is not listed\.$/);
    expect(table(36).rows).toHaveLength(7);
    expect(table(36).footnote).toMatch(/left out\. 31 more batches of this grain bill are not listed\.$/);
  });
});

describe("outcomeSummary", () => {
  const second: RecipeOutcome = { ...closed, batchId: "b2", batchNo: 398, brewhouseEfficiency: 0.68, apparentAttenuation: 0.75 };
  const third: RecipeOutcome = { ...closed, batchId: "b3", batchNo: 380, brewhouseEfficiency: 0.71, apparentAttenuation: 0.78 };

  it("states the gap across closed batches of the shown version and gives no advice", () => {
    expect(outcomeSummary([second, third], closed)).toBe("2 batches: efficiency 68–71% against 72% assumed; attenuation 75–78% against 78% assumed.");
  });

  it("needs two closed batches with an efficiency", () => {
    expect(outcomeSummary([], closed)).toBeUndefined();
    expect(outcomeSummary([second], closed)).toBeUndefined();
    expect(outcomeSummary([second, { ...third, brewhouseEfficiency: null }], closed)).toBeUndefined();
  });

  it("skips open batches, and a copy of this recipe with another grain bill", () => {
    const open = { ...third, closed: false, brewhouseEfficiency: null };
    expect(outcomeSummary([second, closed, open], closed)).toBe("2 batches: efficiency 68–70% against 72% assumed; attenuation 75–77% against 78% assumed.");
    expect(outcomeSummary([second, { ...third, version: 3, sameGrainBill: false }], closed)).toBeUndefined();
  });

  it("leaves attenuation out with fewer than two values", () => {
    expect(outcomeSummary([second, { ...third, apparentAttenuation: null }], closed)).toBe("2 batches: efficiency 68–71% against 72% assumed.");
  });

  it("counts a batch read in two tanks once, and reads both tanks' attenuation", () => {
    const tanks = [{ ...third, vessel: "FV3" }, { ...third, vessel: "FV5", apparentAttenuation: 0.8 }];
    expect(outcomeSummary([second, ...tanks], closed)).toBe("2 batches: efficiency 68–71% against 72% assumed; attenuation 75–80% against 78% assumed.");
  });

  it("gives the mash figures for the grain bill across recipes, then the fermentation figures for this recipe", () => {
    const others = [{ ...pooled(1), brewhouseEfficiency: 0.66 }, { ...pooled(2, "West Coast IPA"), brewhouseEfficiency: 0.74 }, { ...pooled(3), closed: false, brewhouseEfficiency: null }];
    expect(outcomeSummary([second, third, ...others], closed))
      .toBe("This grain bill, 4 batches across 3 recipes: efficiency 66–74% against 72% assumed. This recipe, 2 batches: attenuation 75–78% against 78% assumed.");
    // The grain bill has enough batches before this recipe does.
    expect(outcomeSummary([second, ...others], closed)).toBe("This grain bill, 3 batches across 3 recipes: efficiency 66–74% against 72% assumed.");
    expect(outcomeSummary([second, others[2]], closed)).toBeUndefined();
  });

  it("counts an earlier copy on the same grain bill toward the mash figures only", () => {
    const before = { ...earlier, brewhouseEfficiency: 0.66, apparentAttenuation: 0.6 };
    expect(outcomeSummary([second, third, before], closed))
      .toBe("This grain bill, 3 batches: efficiency 66–71% against 72% assumed. This recipe, 2 batches: attenuation 75–78% against 78% assumed.");
  });

  it("prints one figure when the batches round alike", () => {
    expect(outcomeSummary([second, { ...third, brewhouseEfficiency: 0.681, apparentAttenuation: 0.751 }], closed)).toBe("2 batches: efficiency 68% against 72% assumed; attenuation 75% against 78% assumed.");
  });
});

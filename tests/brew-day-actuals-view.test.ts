import { describe, expect, it } from "vitest";
import { brewCorrectionModel, brewPlanActuals, canRecordBrewDay, type BrewDayViewModel, type BrewRecordView } from "@/lib/mgr/brew-day-view";

describe("brew actual confirmation", () => {
  const source = { material_id: "m", material_name: "Malt", unit: "lb", location_id: "l", location_name: "Brewery", bin_id: "b", bin_name: "Stock", lot_id: "lot", lot_code: "M1", qty: 150 };
  it("prefills only brew-day stages and scales the pinned plan without later additions", () => {
    const rows = brewPlanActuals({ ingredients: [
      { id: "i", material_id: "m", materialName: "Malt", unit: "lb", stage: "mash", per_bbl_qty: 60 },
      { id: "later", material_id: "m", materialName: "Malt", unit: "lb", stage: "dry_hop", per_bbl_qty: 1 },
    ] }, 2, [source]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipeIngredientId: "i", qty: "120", stage: "mash", source: "m/l/b/lot" });
  });
  it("requires explicit empty confirmation and rejects combined bucket overspend", () => {
    const model: BrewDayViewModel = { title: "Batch", vesselId: "v", vessels: [{ id: "v", name: "FV", kind: "fermenter", capacity_bbl: 10 }], initialBbl: "2", brewedOn: "2026-10-01", sources: [source], actuals: [], process: {} };
    expect(canRecordBrewDay(model)).toBe(false);
    expect(canRecordBrewDay({ ...model, confirmEmpty: true })).toBe(true);
    const row = { key: "1", source: "m/l/b/lot", stage: "mash" as const, qty: "100" };
    expect(canRecordBrewDay({ ...model, actuals: [row] })).toBe(true);
    expect(canRecordBrewDay({ ...model, actuals: [row, { ...row, key: "2" }] })).toBe(false);
    expect(canRecordBrewDay({ ...model, actuals: [{ ...row, source: "" }] })).toBe(false);
  });
  it("accepts exact four-decimal source splits without floating point overspend", () => {
    const model: BrewDayViewModel = { title: "Batch", vesselId: "v", vessels: [{ id: "v", name: "FV", kind: "fermenter", capacity_bbl: 10 }], initialBbl: "2", brewedOn: "2026-10-01", sources: [{ ...source, qty: 0.3 }], actuals: [
      { key: "1", source: "m/l/b/lot", stage: "mash", qty: "0.1" }, { key: "2", source: "m/l/b/lot", stage: "boil", qty: "0.2" },
    ] };
    expect(canRecordBrewDay(model)).toBe(true);
  });

  it("restores exact old-source availability for correction without changing the supplied source list", () => {
    const model: BrewDayViewModel = { title: "Batch", vesselId: "v", vessels: [], initialBbl: "2", brewedOn: "2026-10-01", sources: [{ ...source, qty: 0.1 }], recorded: true };
    const record: BrewRecordView = { id: "record", initial_bbl: 2, brewed_on: "2026-10-01", created_at: "2026-10-01", correction_reason: null, corrects_id: null, plan_snapshot: { recipe: "Frozen recipe" }, process: { knockoutTempF: 68 }, additions: [
      { id: "addition", material_name: "Old malt", unit: "lb", confirmed_qty: 0.2, stage: "mash", recipe_ingredient_id: null, lot_code: "M1", location_name: "Brewery", bin_name: "Stock", source: { material_id: "m", location_id: "l", bin_id: "b", lot_id: "lot" } },
    ] };
    const correction = brewCorrectionModel(model, record);
    expect(correction.sources![0].qty).toBe(0.3);
    expect(model.sources![0].qty).toBe(0.1);
    expect(correction).toMatchObject({ recorded: false, correctionRecordId: "record", plan: { recipe: "Frozen recipe" }, process: { knockoutTempF: "68" } });
  });

});

// tests/cellar-addition-view.test.ts — Cellar addition sheet logic (issue #278).
import { describe, expect, it } from "vitest";
import { additionPreview, type CellarAdditionViewModel } from "@/lib/mgr/cellar-addition-view";

const base: CellarAdditionViewModel = {
  occupancies: [{ occupancy_id: "o1", vessel_id: "v1", vessel_name: "FV2", brand_name: "Hazy IPA", batch_no: 416, bbl: 14.6 }],
  materials: [{ id: "m1", name: "Citra", category: "hop", base_uom: "lb", lot_tracked: true }, { id: "m2", name: "Gypsum", category: "other", base_uom: "g", lot_tracked: false }],
  lotsByMaterial: { m1: [{ lot_id: "l1", lot_code: "L-0790", qty: 40, received_on: null }] },
  occupancyId: "o1", materialId: "m1", lotId: "", stage: "dry_hop", qty: "18",
};

describe("additionPreview", () => {
  it("a lot-tracked material needs a lot before the verb is live", () => {
    expect(additionPreview(base)).toMatchObject({ valid: false, reason: "Choose a lot · Citra is lot-tracked" });
    expect(additionPreview({ ...base, lotId: "l1" })).toEqual({ valid: true, text: "Preview: −18 lb Citra · L-0790 · consumption · dry hop · Hazy IPA · B-0416" });
  });
  it("a tank, a material and a positive quantity are each required", () => {
    expect(additionPreview({ ...base, occupancyId: "" })).toMatchObject({ valid: false, reason: "Choose a tank" });
    expect(additionPreview({ ...base, materialId: "m2", stage: "other", qty: "0" })).toMatchObject({ valid: false, reason: "Enter a quantity" });
    expect(additionPreview({ ...base, materialId: "m2", stage: "other", qty: "4" })).toEqual({ valid: true, text: "Preview: −4 g Gypsum · consumption · other · Hazy IPA · B-0416" });
  });
  it("more than the lot holds is refused up front", () => {
    expect(additionPreview({ ...base, lotId: "l1", qty: "41" })).toMatchObject({ valid: false, reason: "Only 40 lb of L-0790 on hand" });
  });
});

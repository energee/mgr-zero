// tests/cellar-addition-view.test.ts — Cellar addition sheet logic (issue #278).
import { describe, expect, it } from "vitest";
import { additionPreview, type AdditionMaterial } from "@/lib/mgr/cellar-addition-view";

const citra: AdditionMaterial = { id: "m1", name: "Citra", category: "hop", base_uom: "lb", lot_tracked: true };
const gypsum: AdditionMaterial = { id: "m2", name: "Gypsum", category: "other", base_uom: "g", lot_tracked: false };
const lots = [{ lot_id: "l1", lot_code: "L-0790", qty: 40, received_on: null }];

describe("additionPreview", () => {
  it("a lot-tracked material needs a lot before the verb is live", () => {
    expect(additionPreview({ material: citra, lots, lotId: "", qty: "18", stage: "dry_hop", batch: "B-0416" })).toMatchObject({ valid: false, reason: "Choose a lot · Citra is lot-tracked" });
    expect(additionPreview({ material: citra, lots, lotId: "l1", qty: "18", stage: "dry_hop", batch: "B-0416" })).toEqual({ valid: true, text: "Preview: −18 lb Citra · L-0790 · consumption · dry hop · B-0416" });
  });
  it("an untracked material needs only a positive quantity", () => {
    expect(additionPreview({ material: gypsum, lots: [], lotId: "", qty: "0", stage: "other", batch: "B-0416" }).valid).toBe(false);
    expect(additionPreview({ material: gypsum, lots: [], lotId: "", qty: "4", stage: "other", batch: "B-0416" })).toEqual({ valid: true, text: "Preview: −4 g Gypsum · consumption · other · B-0416" });
  });
  it("more than the lot holds is refused up front", () => {
    expect(additionPreview({ material: citra, lots, lotId: "l1", qty: "41", stage: "dry_hop", batch: "B-0416" })).toMatchObject({ valid: false, reason: "Only 40 lb of L-0790 on hand" });
  });
});

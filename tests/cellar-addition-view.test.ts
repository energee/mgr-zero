// tests/cellar-addition-view.test.ts — Cellar addition sheet logic (issue #278).
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { additionPreview, type CellarAdditionViewModel } from "@/lib/mgr/cellar-addition-view";
import { CellarAdditionView } from "@/components/mgr/views/cellar-addition";

const base: CellarAdditionViewModel = {
  occupancies: [{ occupancy_id: "o1", vessel_id: "v1", vessel_name: "FV2", brand_name: "Hazy IPA", batch_no: 416, bbl: 14.6 }],
  materials: [{ id: "m1", name: "Citra", category: "hop", base_uom: "lb", lot_tracked: true }, { id: "m2", name: "Gypsum", category: "other", base_uom: "g", lot_tracked: false }],
  lotsByMaterial: { m1: [{ lot_id: "l1", lot_code: "L-0790", qty: 40, received_on: null }] },
  occupancyId: "o1", materialId: "m1", lotId: "", stage: "dry_hop", qty: "18",
};

describe("additionPreview", () => {
  it("a lot-tracked material needs a lot before the verb is live", () => {
    expect(additionPreview(base)).toMatchObject({ valid: false, need: "a lot (Citra is lot-tracked)" });
    expect(additionPreview({ ...base, lotId: "l1" })).toEqual({ valid: true, qty: 18, text: "Preview: −18 lb Citra · L-0790 · consumption · Dry hop · Hazy IPA · B-0416" });
  });
  it("a tank, a material and a positive quantity are each required", () => {
    expect(additionPreview({ ...base, occupancyId: "" })).toMatchObject({ valid: false, need: "a tank" });
    expect(additionPreview({ ...base, materialId: "m2", stage: "other", qty: "0" })).toMatchObject({ valid: false, need: "a quantity above zero in decimal notation" });
    expect(additionPreview({ ...base, materialId: "m2", stage: "other", qty: "4" })).toEqual({ valid: true, qty: 4, text: "Preview: −4 g Gypsum · consumption · Other · Hazy IPA · B-0416" });
  });
  it("more than the lot holds is refused up front", () => {
    expect(additionPreview({ ...base, lotId: "l1", qty: "41" })).toMatchObject({ valid: false, need: "at most 40 lb of L-0790", error: "Only 40 lb of L-0790 on hand" });
  });
  it("refuses exponent notation before readiness or payload construction", () => {
    expect(additionPreview({ ...base, lotId: "l1", qty: "1e1" }).valid).toBe(false);
    expect(additionPreview({ ...base, lotId: "l1", qty: "1E1" }).valid).toBe(false);
  });
});

describe("Cellar addition sheet (#1481)", () => {
  const render = (model: CellarAdditionViewModel) => renderToStaticMarkup(createElement(CellarAdditionView, { model }));
  it("names what is still needed once, beside Record addition", () => {
    for (const [model, reason] of [[{ ...base, occupancyId: "" }, "Still needed: a tank."], [{ ...base, lotId: "l1", qty: "0" }, "Still needed: a quantity above zero in decimal notation."]] as const) {
      const html = render(model);
      expect(html.split(reason)).toHaveLength(2);
      expect(html).not.toContain("Choose a tank");
      expect(html).not.toContain("Enter a quantity above zero");
    }
  });
  it("keeps the amber lot shortfall in the body and the need beside the button", () => {
    const html = render({ ...base, lotId: "l1", qty: "41" });
    expect(html).toContain("Only 40 lb of L-0790 on hand");
    expect(html).toContain("Still needed: at most 40 lb of L-0790.");
  });
});

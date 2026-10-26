import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmitButton } from "@/components/mgr/submit-button";
import { MaterialView } from "@/components/mgr/views/material";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { lotTraceHazy, materialLotTraceCitra } from "@/lib/mgr/fixtures/compliance";
import { shipToMain } from "@/lib/mgr/fixtures/customers";
import { materialCitra } from "@/lib/mgr/fixtures/purchasing";
import { monthlyComplianceAugust } from "@/lib/mgr/fixtures/monthly-compliance";
import { DEMO_TIME_ZONE } from "@/lib/mgr/fixtures/settings";
import { toLotTraceViewProps } from "@/lib/mgr/lot-trace-view";
import { lossReviewReason, toMonthlyComplianceViewProps } from "@/lib/mgr/monthly-compliance-view";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { toMaterialLotTraceViewProps } from "@/lib/mgr/material-lot-trace-view";

// #1393: display formatting must never change the exact amount allowed by Save.
describe("Compliance and More readable values", () => {
  it("trims trailing zeros without rounding recorded, remaining or earlier reattributed barrels", () => {
    const loss = monthlyComplianceAugust.losses[0];
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, losses: [{ ...loss, original_bbl: "3.00000000", remaining_bbl: "3.00000000", allocations: [{ ...loss.allocations[0], bbl: "0.50000000" }] }] });
    expect(model.losses[0].detail).toBe("Recorded 3 bbl · 3 bbl left to reattribute");
    expect(model.losses[0].allocations[0].bbl).toBe("0.5 bbl");
    const tiny = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, losses: [{ ...loss, remaining_bbl: "0.00400000" }] });
    expect(tiny.losses[0].detail).toContain("0.004 bbl left to reattribute");
    expect(toMonthlyComplianceViewProps(monthlyComplianceAugust).losses[0].detail).toBe("Recorded 0.05741935 bbl · 0.03741935 bbl left to reattribute");
  });

  it("humanizes tracked and untracked ingredient stage names", () => {
    const model = toLotTraceViewProps({ ...lotTraceHazy, ingredients: [
      { ...lotTraceHazy.ingredients[0], source: "dry_hop", lot_id: null, code: null, qty: 5, unit: "lb" },
      { ...lotTraceHazy.ingredients[0], source: "mash", code: "LOT-1" },
    ] }, DEMO_TIME_ZONE);
    expect(model.ingredients[0].detail).toBe("Untracked · Dry hop · 5 lb");
    expect(model.ingredients[1].detail).toContain("LOT-1 · Mash ·");
    const material = toMaterialLotTraceViewProps({ ...materialLotTraceCitra, used: [{ ...materialLotTraceCitra.used[0], stage: "dry_hop" }] }, DEMO_TIME_ZONE);
    expect(material.uses[0].detail).toContain("Dry hop");
    expect(material.uses[0].detail).not.toContain("dry_hop");
  });

  it("uses full sentences for ship-to and material helper text", () => {
    const shipTo = renderToStaticMarkup(createElement(ShipToView, { model: toShipToViewProps(shipToMain) }));
    expect(shipTo).toContain("This ship-to is selected first on new orders.");
    const material = renderToStaticMarkup(createElement(MaterialView, { model: materialCitra }));
    expect(material).toContain("Receipts name a lot. Consumption picks one.");
    expect(material).toContain("This material is available to recipes and purchase orders.");
  });
});

describe("Reattribute loss Save reason", () => {
  it("names the missing state beside Save and describes the disabled button", () => {
    const reason = lossReviewReason("1", "3.00000000", "sample", "");
    expect(reason).toBe("Still needed: a two-letter destination state.");
    const html = renderToStaticMarkup(createElement(SubmitButton, { label: "Save reattribution", reason }));
    const reasonId = html.match(/<p id="([^"]+)"/)?.[1];
    expect(html).toContain(`aria-describedby="${reasonId}"`);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it("keeps exact eight-decimal validation and names invalid amounts", () => {
    for (const amount of ["", "0", "-1", "NaN", "1.000000001"]) {
      expect(lossReviewReason(amount, "3", "taproom", "")).toContain("a positive amount with up to eight decimal places");
    }
    expect(lossReviewReason("0.03741936", "0.03741935", "sample", "PA")).toBe("Still needed: an amount no greater than the remaining 0.03741935 bbl.");
    for (const amount of ["0.03741935", ".00000001"]) expect(lossReviewReason(amount, "0.03741935", "sample", "PA")).toBeNull();
    expect(lossReviewReason("1", "3", "sample", "P")).toContain("a two-letter destination state");
    for (const target of ["taproom", "destruction"] as const) expect(lossReviewReason("1", "3", target, "")).toBeNull();
  });
});

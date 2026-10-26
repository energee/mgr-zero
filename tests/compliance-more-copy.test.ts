import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmitButton } from "@/components/mgr/submit-button";
import { lotTraceHazy, materialLotTraceCitra } from "@/lib/mgr/fixtures/compliance";
import { monthlyComplianceAugust } from "@/lib/mgr/fixtures/monthly-compliance";
import { DEMO_TIME_ZONE } from "@/lib/mgr/fixtures/settings";
import { toLotTraceViewProps } from "@/lib/mgr/lot-trace-view";
import { lossReviewReason, toMonthlyComplianceViewProps } from "@/lib/mgr/monthly-compliance-view";
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
});

describe("Reattribute loss Save reason", () => {
  it("disables Save for a missing destination state with an accessible description", () => {
    const reason = lossReviewReason("1", "3.00000000", "sample", "");
    expect(reason).toBeTruthy();
    const html = renderToStaticMarkup(createElement(SubmitButton, { label: "Save reattribution", reason }));
    const reasonId = html.match(/<p id="([^"]+)"/)?.[1];
    expect(html).toContain(`aria-describedby="${reasonId}"`);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it("rejects invalid amounts without rounding exact eight-decimal boundaries", () => {
    for (const amount of ["", "0", "-1", "NaN", "1.000000001"]) {
      expect(lossReviewReason(amount, "3", "taproom", "")).toBeTruthy();
    }
    expect(lossReviewReason("0.03741936", "0.03741935", "sample", "PA")).toBeTruthy();
    for (const amount of ["0.03741935", ".00000001"]) expect(lossReviewReason(amount, "0.03741935", "sample", "PA")).toBeNull();
    expect(lossReviewReason("1", "3", "sample", "P")).toBeTruthy();
    for (const target of ["taproom", "destruction"] as const) expect(lossReviewReason("1", "3", target, "")).toBeNull();
  });
});

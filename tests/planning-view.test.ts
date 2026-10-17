import { readFileSync } from "node:fs";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PlanningView } from "../components/mgr/views/planning";
import { planningDemo } from "../lib/mgr/fixtures/planning";
import { toPlanningViewProps } from "../lib/mgr/planning-view";

describe("Planning view", () => {
  it("owns the inventory drawing", () => {
    const body = SCREENS.find((screen) => screen.name === "Planning")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(body)).toBe(true);
    expect(body.type).toBe(PlanningView);
    expect(body.props.model).toEqual(toPlanningViewProps(planningDemo));
  });

  it("maps only fields returned by live material requirements", () => {
    const model = toPlanningViewProps({ requirements: [{
      material_id: "ends", material_name: "Ends", base_uom: "each", purchase_uom: "case",
      required: 2832, projected: 0, on_hand: 2400, on_order: 0, short: 432, purchase_units_short: 1,
      needed_by: "2026-09-12", vendor_id: null, vendor_name: null, lead_time_days: null,
      buy_by: null, out_of_reach: false,
    }] });
    expect(model.requirements[0]).toMatchObject({ title: "Ends", quantity: "1 case", warning: true });
    expect(model.requirements[0].detail).not.toContain("projected");
    expect(model.horizon).toBeUndefined();
  });

  it("marks the projected part without splitting or hiding the material gap", () => {
    const model = toPlanningViewProps({ requirements: [{
      material_id: "labels", material_name: "Labels", base_uom: "each", purchase_uom: "roll",
      required: 960, projected: 480, on_hand: 120, on_order: 0, short: 840, purchase_units_short: 2,
      needed_by: "2026-10-30", vendor_id: "vendor", vendor_name: "Label supplier", lead_time_days: 7,
      buy_by: "2026-10-23", out_of_reach: false,
    }] });
    expect(model.requirements).toHaveLength(1);
    expect(model.requirements[0]).toMatchObject({ key: "labels", quantity: "2 roll", warning: false });
    expect(model.requirements[0].detail).toContain("need 960");
    expect(model.requirements[0].detail).toContain("includes 480 projected");
    expect(model.requirements[0].detail).toContain("needed by 2026-10-30");
    expect(model.requirements[0].detail).toContain("buy by 2026-10-23");
  });

  it("the live route mounts PlanningView, slots DraftButton, and has no E tree", () => {
    const page = readFileSync("app/(app)/planning/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/planning"/);
    expect(page).toMatch(/<PlanningView\b/);
    expect(page).toMatch(/<DraftButton\b/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("leads a gap whose needed-by date is before the brewery's today with overdue (#993)", () => {
    const row = {
      material_id: "ends", material_name: "Ends", base_uom: "each", purchase_uom: "case",
      required: 10, projected: 0, on_hand: 0, on_order: 0, short: 10, purchase_units_short: 1,
      vendor_id: "vendor", vendor_name: "Can Co", lead_time_days: 7, buy_by: "2026-09-05", out_of_reach: false,
    };
    const model = toPlanningViewProps({ today: "2026-10-08", requirements: [
      { ...row, material_id: "late", needed_by: "2026-10-07" },
      { ...row, material_id: "today", needed_by: "2026-10-08" },
      { ...row, material_id: "undated", needed_by: null },
    ] });
    expect(model.requirements.map((r) => [r.key, r.detail.startsWith("overdue · "), r.warning])).toEqual([
      ["late", true, true], ["today", false, false], ["undated", false, false],
    ]);
  });
});


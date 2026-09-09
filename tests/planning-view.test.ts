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
      required: 2832, on_hand: 2400, on_order: 0, short: 432, purchase_units_short: 1,
      needed_by: "2026-09-12", vendor_id: null, vendor_name: null, lead_time_days: null,
      buy_by: null, out_of_reach: false,
    }] });
    expect(model.requirements[0]).toMatchObject({ title: "Ends", quantity: "1 case", warning: true });
    expect(model.horizon).toBeUndefined();
  });

  it("the live route mounts PlanningView, slots DraftButton, and has no E tree", () => {
    const page = readFileSync("app/(app)/planning/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/planning"/);
    expect(page).toMatch(/<PlanningView\b/);
    expect(page).toMatch(/<DraftButton\b/);
    expect(page).not.toMatch(/\bE\./);
  });
});

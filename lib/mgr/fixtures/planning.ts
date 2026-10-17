import type { PlanningSnapshot } from "@/lib/mgr/planning-view";

export const planningDemo: PlanningSnapshot = {
  requirements: [{
    material_id: "can-labels", material_name: "Can labels", base_uom: "each", purchase_uom: "roll",
    required: 960, projected: 480, on_hand: 120, on_order: 0, short: 840, purchase_units_short: 2,
    needed_by: "2026-09-21", vendor_id: "blue-label", vendor_name: "Blue Label",
    lead_time_days: 7, buy_by: "2026-09-14", out_of_reach: false,
  }],
  horizon: [["9/7", "48 bbl", "40 bbl", "−8"], ["9/14", "52 bbl", "60 bbl", "+8"]],
  reviews: [
    { key: "ends", title: "Sept 12 packaging", detail: "short 480 ends · buy by 9/5", warning: true },
    { key: "hazy", title: "Hazy ATP negative 9/9", detail: "open named shortfall" },
  ],
  drafts: [
    { key: "lindenmeyr", title: "Lindenmeyr Munroe", detail: "cans, ends, quadpacks, trays · 3 day lead", quantity: "4 lines" },
    { key: "blue-label", title: "Blue Label", detail: "labels · 7 day lead · past the buy-by date", quantity: "out of reach", warning: true },
  ],
  info: "Labels can no longer arrive for the 9/7 week, so that line is left out. The four Lindenmeyr lines still draft.",
};

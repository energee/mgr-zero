import type { PlanningSnapshot } from "@/lib/mgr/planning-view";

export const planningDemo: PlanningSnapshot = {
  requirements: [{
    material_id: "can-labels", material_name: "Can labels", base_uom: "each", purchase_uom: "roll",
    required: 960, projected: 480, on_hand: 120, on_order: 0, short: 840, purchase_units_short: 2,
    needed_by: "2026-09-21", vendor_id: "fictional-labels", vendor_name: "Fictional Label Works",
    lead_time_days: 7, buy_by: "2026-09-14", out_of_reach: false,
  }, {
    // Needed before today: the adapter leads it with "overdue" (#993, #1037).
    // Its buy-by date has passed too, so it is out of reach and not drafted.
    material_id: "quadpack-carriers", material_name: "Quadpack carriers", base_uom: "each", purchase_uom: "case",
    required: 240, projected: 0, on_hand: 60, on_order: 0, short: 180, purchase_units_short: 1,
    needed_by: "2026-09-04", vendor_id: "fictional-packaging", vendor_name: "Fictional Packaging Supply",
    lead_time_days: 3, buy_by: "2026-09-01", out_of_reach: true,
  }, {
    // No contract and no default vendor: grouped last, with Set vendor (#1516).
    material_id: "hop-bags", material_name: "Hop bags", base_uom: "each", purchase_uom: "case",
    required: 50, projected: 0, on_hand: 10, on_order: 0, short: 40, purchase_units_short: 1,
    needed_by: "2026-09-21", vendor_id: null, vendor_name: null,
    lead_time_days: null, buy_by: null, out_of_reach: false,
  }],
  today: "2026-09-08",
  horizon: [["Sep 7, 2026", "48 bbl", "40 bbl", "−8"], ["Sep 14, 2026", "52 bbl", "60 bbl", "+8"]],
  reviews: [
    { key: "ends", title: "Sep 12, 2026 packaging", detail: "short 480 ends · buy by Sep 5, 2026", warning: true },
    { key: "hazy", title: "Hazy ATP negative Sep 9, 2026", detail: "open named shortfall" },
  ],
  drafts: [
    { key: "fictional-packaging", title: "Fictional Packaging Supply", detail: "cans, ends, trays · 3 day lead", quantity: "3 lines" },
    { key: "fictional-labels", title: "Fictional Label Works", detail: "labels · 7 day lead · past the buy-by date", quantity: "out of reach", warning: true },
  ],
  info: "Labels can no longer arrive for the week of Sep 7, 2026, so that line is left out. The three packaging-supply lines still draft.",
};

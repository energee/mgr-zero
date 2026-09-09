import type { PackagingRunSnapshot } from "@/lib/mgr/packaging-runs-view";
import type { RepackViewModel } from "@/lib/mgr/repack-view";
import type { SchedulePackagingRunViewModel } from "@/lib/mgr/schedule-packaging-run-view";

export const packagingRuns: PackagingRunSnapshot[] = [
  { id: "run31", run_no: 31, planned_on: "Fri 9/5", started_at: null, closed_at: null, brand_name: "Hazy cans", vessel_name: "FV3", qty_planned: 118, planned_unit: "cases", material_shortfall: "480 ends short" },
  { id: "run32", run_no: 32, planned_on: "Tue 9/9", started_at: null, closed_at: null, brand_name: "Pils ½ bbl", vessel_name: "FV1", qty_planned: 40, planned_unit: "kegs" },
  { id: "run33", run_no: 33, planned_on: "Thu 9/11", started_at: null, closed_at: null, brand_name: "Stout cans", vessel_name: null, qty_planned: 0 },
  { id: "run30", run_no: 30, planned_on: "Tue 9/2", started_at: "2026-09-02", closed_at: "2026-09-02", brand_name: "Pils cans", vessel_name: "FV1", qty_planned: 96, lot_code: "L-240902-PL", output_summary: "96 cases", yield_percent: 97 },
  { id: "run29", run_no: 29, planned_on: "Fri 8/29", started_at: "2026-08-29", closed_at: "2026-08-29", brand_name: "Hazy ½ bbl", vessel_name: "FV3", qty_planned: 38, lot_code: "L-240829-HZ", output_summary: "38 kegs", yield_percent: 95 },
  { id: "run28", run_no: 28, planned_on: "Wed 8/27", started_at: "2026-08-27", closed_at: "2026-08-27", brand_name: "Helles cans", vessel_name: "FV2", qty_planned: 110, lot_code: "L-240827-HL", output_summary: "110 cases", yield_percent: 92, loss_bbl: 2 },
];

export const schedulePackagingRun: SchedulePackagingRunViewModel = {
  plannedOn: "2026-09-05",
  source: "FV3 · Hazy IPA",
  sourceDetail: "B-0416 · 42.0 bbl · gravity 2.1 · ready",
  outputs: [
    { key: "case", title: "Hazy · case · 24×16 oz", detail: "39.6 bbl · on the wholesale list", qty: 118, listed: true },
    { key: "half", title: "Hazy · ½ bbl keg", detail: "2.0 bbl · on the wholesale list", qty: 4, listed: true },
    { key: "sixth", title: "Hazy · ⅙ bbl keg", detail: "not listed this run", qty: 0, listed: false },
  ],
  leftInSource: "0.4 bbl · loss at close unless held",
  leftLabel: "Left in FV3",
  materials: [["cans 2,832", "3,100", "0"], ["ends 2,832", "2,400", "432"], ["labels 2,832", "5,000", "0"], ["trays 118", "140", "0"]],
  warning: "432 ends short. Save the plan now; Start stays disabled until the shortage is resolved or overridden on the run.",
};

export const repackCase: RepackViewModel = {
  parent: "Hazy IPA · case · 24×16oz",
  location: "Warehouse · Walk-in",
  qty: "1",
  unit: "case",
  tape: [["−1 case · repack", "0.096774 bbl"], ["+6 four-pack · repack", "derived from the case total"], ["Case tray ×1", "return to stock"], ["PakTech ×6", "consumed"]],
  preview: "Preview: conserves 0.096774 bbl · same location and bin · not a TTB removal",
  damaged: "0 four-pack · records as loss",
  unavailable: "isn’t available yet: breaking a case has nowhere correct to land",
};

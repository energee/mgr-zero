import type { TaproomVarianceViewModel } from "@/lib/mgr/taproom-variance-view";
import type { WeeklyCountViewModel } from "@/components/mgr/views/weekly-count";
import { countDraftFromSnapshot, correctionStateFromReceipt } from "@/lib/mgr/taproom-count-state";
import { openTapBoardSheet, type TapInterval, type TapBoardState } from "@/lib/mgr/tap-board-state";

function fixtureTap(number: string | null, name: string, bbl: number, day: string, fill = 1, excluded = false): TapInterval {
  return { id: `tap-${number ?? "none"}`, location_id: "taproom", sku_id: `sku-${name}`, sku_name: name, brand_id: name, brand_name: name.split(" · ")[0], label: null, nominal_bbl: bbl, tap_number: number, opening_fill: fill, not_in_inventory: excluded, opened_at: `2026-09-${day}T16:00:00Z`, opened_by: "dana", opened_by_label: "dana" };
}
const boardTaps = [
  fixtureTap("1", "Pils · ½ bbl", .5, "07"), fixtureTap("2", "Hazy IPA · ½ bbl", .5, "07"), fixtureTap("3", "Stout · ⅙ bbl", 1 / 6, "08", .6),
  fixtureTap("4", "Amber · ½ bbl", .5, "05"), fixtureTap("5", "Helles · ½ bbl", .5, "09", 1, true), fixtureTap("6", "Saison · ½ bbl", .5, "10"),
  fixtureTap("8", "Porter · ⅙ bbl", 1 / 6, "11"), fixtureTap("9", "Hazy IPA · ½ bbl", .5, "10", 1, true), fixtureTap("10", "Kolsch · ½ bbl", .5, "08"),
  fixtureTap("11", "Barrel Dark · ⅙ bbl", 1 / 6, "06"), fixtureTap(null, "Wild Ale · ⅙ bbl", 1 / 6, "10"),
];
export const tapBoardSkus = [...new Map(boardTaps.map(tap => [tap.sku_id!, { id: tap.sku_id!, name: tap.sku_name!, nominalBbl: tap.nominal_bbl }])).values()];
export const tapBoard: TapBoardState = { sheet: null, snapshot: {
  open: [...boardTaps, { ...fixtureTap("7", "Guest cider", .5, "09", 1, true), sku_id: null, sku_name: null, brand_id: null, brand_name: null, label: "Guest cider" }],
  // Tap 7 is appended separately below, so indices trail tap numbers from
  // index 6 on: the Kolsch tap ("10") is boardTaps[8], not [9].
  history: [{ ...boardTaps[8], id: "previous-kolsch", closed_at: "2026-09-08T20:10:00Z", closed_by: "dana", closed_by_label: "dana", closing_fill: 0, close_reason: "Kicked empty" }],
} };
export const kickKeg = openTapBoardSheet(tapBoard.snapshot, "kick", boardTaps[4]).sheet!;
export const swapKeg = openTapBoardSheet(tapBoard.snapshot, "swap", boardTaps[4]).sheet!;

const weeklyDraft = countDraftFromSnapshot({ location_id: "ridgeline", counted_on: "2026-09-08", prior_count: { id: "sep1", counted_on: "2026-09-01" }, revision: "fixture-count", lines: [
  { bin_id: "cold", bin_name: "Cold", sku_id: "pils-case", sku_name: "Pils · 16 oz case", brand_id: "pils", brand_name: "Pils", bbl_per_unit: 384 / 3968, lot_id: null, qty_before: 6 },
  { bin_id: "cold", bin_name: "Cold", sku_id: "hazy-half", sku_name: "Hazy · ½ bbl keg", brand_id: "hazy", brand_name: "Hazy IPA", bbl_per_unit: 0.5, lot_id: "hazy-lot", qty_before: 3 },
] }, { prior_count: { id: "sep1", counted_on: "2026-09-01" }, expected_bbl: 1.5, reason: null, rows: [{ brand_id: "hazy", brand_name: "Hazy IPA", expected_bbl: 1.5, excluded_bbl: 0, unattributed_bbl: 0, split: false }] });
weeklyDraft.draft.lines[0].quantity = "4";
weeklyDraft.draft.lines[1].quantity = "2";
export const weeklyCount: WeeklyCountViewModel = {
  locations: [["Ridgeline Tap Room"], ["Downtown"]], location: "Ridgeline Tap Room", role: "admin", draft: weeklyDraft,
  lotLabels: { "cold:hazy-half:hazy-lot": "L-260901-HZ" },
  receipt: { date: "Sep 8", recorded: "Latest uncorrected count", canCorrect: true,
    correctionForm: correctionStateFromReceipt("saved-sep8", [{ id: "saved2", sku_name: "Hazy · ½ bbl keg", bin_name: "Cold", lot_id: "L-260901-HZ", qty_before: 7, qty_counted: 2 }]),
    lines: [{ key: "saved2", name: "Hazy · ½ bbl keg", detail: "saved row 2 · recorded 7, counted 2", result: "2.5 bbl depleted" }] },
  history: [{ key: "sep1", date: "Sep 1", detail: "3 observations · 1 movement · 1 unit depleted · corrected by Admin" }],
};

export const taproomVariance: TaproomVarianceViewModel = {
  weeks: 4,
  trend: { brand: "Hazy IPA", detail: "short 4 weeks running · 1.8 bbl total · −4%" },
  report: {
    weeks: 4, window_start: "2026-08-12", window_end: "2026-09-08", as_of: "2026-09-08T16:00:00Z", reason: null,
    rows: [
      { brand_id: "hazy", brand_name: "Hazy IPA", expected_bbl: 11.5, actual_bbl: 11, variance_bbl: 0.5, excluded_bbl: 0, unattributed_bbl: 0, split: false, compared_periods: 4 },
      { brand_id: "pils", brand_name: "Pils", expected_bbl: 8, actual_bbl: 7.9, variance_bbl: 0.1, excluded_bbl: 0, unattributed_bbl: 0, split: false, compared_periods: 4 },
      { brand_id: "stout", brand_name: "Stout", expected_bbl: 3, actual_bbl: 3, variance_bbl: 0, excluded_bbl: 0, unattributed_bbl: 0, split: false, compared_periods: 4 },
    ],
    periods: [{ count_id: "count-sep8", prior_count_id: "count-sep1", counted_on: "2026-09-08", starts_at: "2026-09-01T16:00:00Z", ends_at: "2026-09-08T16:00:00Z", starts_before_window: false, coverage_complete: true, unmapped_lines: 0, expected_bbl: 6, actual_bbl: 5.5, reason: null }],
  },
};

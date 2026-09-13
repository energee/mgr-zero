import type { TaproomVarianceViewModel } from "@/lib/mgr/taproom-variance-view";

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

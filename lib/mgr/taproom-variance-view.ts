// lib/mgr/taproom-variance-view.ts — variance report row types and how a variance figure reads.
import { bblExact } from "@/lib/volume";
import type { ScopeOption } from "@/components/mgr/scope-pick";

export type VarianceRow = { brand_id: string; brand_name: string; expected_bbl: number | null; actual_bbl: number; destroyed_bbl: number; variance_bbl: number | null; excluded_bbl: number; unattributed_bbl: number; split: boolean; compared_periods: number };
export type VariancePeriod = { count_id: string; prior_count_id: string | null; counted_on: string; starts_at: string | null; ends_at: string; starts_before_window: boolean; coverage_complete: boolean; unmapped_lines: number; expected_bbl: number | null; actual_bbl: number; destroyed_bbl: number; reason: string | null };
export type VarianceReport = { weeks: number; window_start: string; window_end: string; as_of: string; reason: string | null; rows: VarianceRow[]; periods: VariancePeriod[] };
export const varianceBbl = (value: number | null) => value === null ? "—" : bblExact(value, 4);
/** Every reason code get_taproom_draft_projection and a get_taproom_variance period return, in plain words (#1117). */
const VARIANCE_REASONS: Record<string, string> = {
  missing_baseline: "First count, so there is nothing to compare against",
  no_pos_coverage: "No usable POS sales data covers this period",
  incomplete_pos_coverage: "POS sales data covers only part of this period",
  unmapped_pos_lines: "Some POS items still need mapping",
};
/** Why expected is missing or partial; null means the period compares. A code
 *  this map does not name still reads, with its underscores spaced. */
export const varianceReason = (value: string | null) => value === null ? "Comparable" : VARIANCE_REASONS[value] ?? value.replaceAll("_", " ");

/** The week tabs, in order; weekHrefs is keyed by these labels. */
export const VARIANCE_WEEK_TABS = ["4 weeks", "12 weeks"] as const;

export type TaproomVarianceViewModel = {
  report?: VarianceReport; backHref?: string; countHref?: string; boardHref?: string;
  /** breweries.timezone: period boundaries print in it (#442). */
  timeZone: string;
  /** Taprooms; `location` is the selected option's value (a location id live). */
  locations?: ScopeOption[]; location?: string; weeks: number;
  /** Live: where each week tab goes, keyed by its VARIANCE_WEEK_TABS label. The inventory leaves it out. */
  weekHrefs?: Record<(typeof VARIANCE_WEEK_TABS)[number], string>;
  trend?: { brand: string; detail: string; href?: string };
};

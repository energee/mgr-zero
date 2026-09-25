export type VarianceRow = { brand_id: string; brand_name: string; expected_bbl: number | null; actual_bbl: number; variance_bbl: number | null; excluded_bbl: number; unattributed_bbl: number; split: boolean; compared_periods: number };
export type VariancePeriod = { count_id: string; prior_count_id: string | null; counted_on: string; starts_at: string | null; ends_at: string; starts_before_window: boolean; coverage_complete: boolean; unmapped_lines: number; expected_bbl: number | null; actual_bbl: number; reason: string | null };
export type VarianceReport = { weeks: number; window_start: string; window_end: string; as_of: string; reason: string | null; rows: VarianceRow[]; periods: VariancePeriod[] };
export const varianceBbl = (value: number | null) => value === null ? "—" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;
export const varianceReason = (value: string | null) => value === "missing_baseline" ? "First count · no prior observation" : value === "no_pos_coverage" ? "No usable POS coverage" : value?.replaceAll("_", " ") ?? "Comparable";

export type TaproomVarianceViewModel = {
  report?: VarianceReport; backHref?: string; countHref?: string; boardHref?: string;
  /** breweries.timezone: period boundaries print in it (#442). */
  timeZone: string;
  locations?: [string, string][]; location?: string; weeks: number; weekHrefs?: [string, string][];
  trend?: { brand: string; detail: string; href?: string };
};

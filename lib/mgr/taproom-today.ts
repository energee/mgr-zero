import type { TapInterval } from "./tap-board-state";

export type TaproomTodayRow = { label: string; detail: string; href: string; verb: string };
type Count = { counted_on: string; created_at: string };
type Report = {
  as_of: string;
  reason: string | null;
  rows: { variance_bbl: number | null }[];
  periods: { coverage_complete: boolean; reason: string | null }[];
};
const bbl = (value: number) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;

export function taproomTodayRows(location: { id: string; name: string }, open: TapInterval[], counts: Count[], report: Report): TaproomTodayRow[] {
  const latestTap = [...open].sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0];
  const latestCount = counts[0];
  const values = report.rows.map((row) => row.variance_bbl);
  const variance = values.length > 0 && values.every((value) => value !== null)
    ? values.reduce<number>((sum, value) => sum + Number(value), 0)
    : null;
  const partialCoverage = variance !== null && report.periods.some((period) => !period.coverage_complete && period.reason === null);
  return [
    { label: "Tap board", detail: `${location.name} · ${open.length} open${latestTap ? ` · last opened ${new Date(latestTap.opened_at).toLocaleString()}` : " · no open kegs observed"}`, href: `/taproom/board?location=${location.id}`, verb: "Open" },
    { label: "Weekly count", detail: `${location.name} · ${latestCount ? `last saved ${latestCount.counted_on} at ${new Date(latestCount.created_at).toLocaleString()}` : "no saved count observed"}`, href: `/taproom?location=${location.id}`, verb: "Count" },
    { label: "Variance · 4 weeks", detail: `${location.name} · ${variance === null ? (report.reason ?? "comparison unavailable").replaceAll("_", " ") : `${bbl(variance)} expected minus actual${partialCoverage ? " · partial POS coverage" : ""}`} · as of ${new Date(report.as_of).toLocaleString()}`, href: `/taproom/variance?location=${location.id}&weeks=4`, verb: "Review" },
  ];
}

import Link from "next/link";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";

type Location = { id: string; name: string; kind: string };
type VarianceRow = { brand_id: string; brand_name: string; expected_bbl: number | null; actual_bbl: number; variance_bbl: number | null; excluded_bbl: number; unattributed_bbl: number; split: boolean; compared_periods: number };
type Period = { count_id: string; prior_count_id: string | null; counted_on: string; starts_at: string | null; ends_at: string; starts_before_window: boolean; coverage_complete: boolean; unmapped_lines: number; expected_bbl: number | null; actual_bbl: number; reason: string | null };
type Report = { weeks: number; window_start: string; window_end: string; as_of: string; reason: string | null; rows: VarianceRow[]; periods: Period[] };
const bbl = (value: number | null) => value === null ? "—" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl`;
const reason = (value: string | null) => value === "missing_baseline" ? "First count · no prior observation" : value === "no_pos_coverage" ? "No usable POS coverage" : value?.replaceAll("_", " ") ?? "Comparable";

export default async function TaproomVariancePage({ searchParams }: { searchParams: Promise<{ location?: string; weeks?: string }> }) {
  const selected = await searchParams;
  const weeks = selected.weeks === "12" ? 12 : 4;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_taproom_variance", "Variance by brand");
  const locations = ((await runCommand("list_locations", {}, ctx)) as Location[]).filter((location) => location.kind === "taproom");
  const location = locations.find((item) => item.id === selected.location) ?? locations[0];
  if (!location) return <>{E.back("Beer", "Variance by brand", undefined, "/beer")}{E.blank("No taproom locations yet. Ask Admin to add one under Locations.")}</>;
  const report = await runCommand("get_taproom_variance", { locationId: location.id, weeks }, ctx) as Report;
  const href = (nextWeeks: number) => `/taproom/variance?location=${location.id}&weeks=${nextWeeks}`;

  return <>
    {E.back("Beer", "Variance by brand", undefined, "/beer")}
    <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" href={`/taproom?location=${location.id}`}>Weekly count</Link><Link className="underline" href={`/taproom/board?location=${location.id}`}>Tap board</Link></div>
    <LinkTabs items={locations.map((item) => [item.name, `/taproom/variance?location=${item.id}&weeks=${weeks}`])} current={location.name} className="w-full md:w-fit" />
    <LinkTabs items={[["4 weeks", href(4)], ["12 weeks", href(12)]]} current={`${weeks} weeks`} className="w-full md:w-fit" />
    <p className="text-sm text-muted-foreground">Completed count endings {report.window_start} through {report.window_end} · as of <time dateTime={report.as_of}>{new Date(report.as_of).toLocaleString()}</time>. Variance is expected minus actual; it is reported and never posted.</p>
    {report.rows.length === 0 ? E.blank(report.reason === "no_completed_periods" ? "No completed count periods in this window" : "No comparable brand totals yet") : E.tbl(
      ["Brand", "Expected", "Actual", "Variance"],
      report.rows.map((row) => [row.brand_name, bbl(row.expected_bbl), bbl(row.actual_bbl), bbl(row.variance_bbl)]),
    )}
    {report.rows.map((row) => <div key={row.brand_id} className="rounded-xl border p-3 text-sm">
      <p className="font-medium">{row.brand_name} · {row.compared_periods} completed {row.compared_periods === 1 ? "period" : "periods"}</p>
      <p className="text-muted-foreground">{bbl(row.excluded_bbl)} excluded outside inventory · {bbl(row.unattributed_bbl)} unattributed{row.split ? " · overlapping taps split expected volume" : ""}</p>
    </div>)}
    <section aria-labelledby="periods-heading"><h2 id="periods-heading" className="text-lg font-semibold">Completed periods</h2>
      {report.periods.length === 0 ? <p className="text-sm text-muted-foreground">No saved count endings fall in this window.</p> : report.periods.map((period) => <article key={period.count_id} className="border-b py-3 text-sm">
        <p className="font-medium">Count {period.counted_on}</p>
        <p className="text-muted-foreground">{period.starts_at ? <><time dateTime={period.starts_at}>{new Date(period.starts_at).toLocaleString()}</time> (exclusive)</> : "No starting count"} → <time dateTime={period.ends_at}>{new Date(period.ends_at).toLocaleString()}</time> (inclusive){period.starts_before_window ? " · period begins before this report window" : ""}</p>
        <p>Expected {bbl(period.expected_bbl)} · actual frozen count depletion {bbl(period.actual_bbl)} · variance {bbl(period.expected_bbl === null ? null : Number(period.expected_bbl) - Number(period.actual_bbl))}</p>
        <p className="text-muted-foreground">{reason(period.reason)} · coverage {period.coverage_complete ? "complete" : "incomplete"} · {period.unmapped_lines} unmapped POS {period.unmapped_lines === 1 ? "line" : "lines"}</p>
      </article>)}
    </section>
    <p className="text-sm text-muted-foreground">A dash means a value is unavailable. Read zero alongside coverage and excluded consumption. Guest kegs are never matched by label, and no guest numeric yield is shown.</p>
  </>;
}

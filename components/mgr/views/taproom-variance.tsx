import Link from "next/link";
import { E } from "@/components/mgr/e";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { TabBar } from "@/components/mgr/qty";
import { ScopePick } from "@/components/mgr/scope-pick";
import { VARIANCE_WEEK_TABS, varianceBbl as bbl, varianceReason as reason, type TaproomVarianceViewModel } from "@/lib/mgr/taproom-variance-view";

export function TaproomVarianceView({ model }: { model: TaproomVarianceViewModel }) {
  const report = model.report;
  return <>
    {E.back("Beer", "Variance by brand", undefined, model.backHref)}
    {(model.countHref || model.boardHref) && <div className="flex flex-wrap gap-3 text-sm">{model.countHref && <Link className="underline" href={model.countHref}>Weekly count</Link>}{model.boardHref && <Link className="underline" href={model.boardHref}>Tap board</Link>}</div>}
    {model.locations && <ScopePick label="Location" value={model.location ?? ""} options={model.locations} />}
    <TabBar names={[...VARIANCE_WEEK_TABS]} on={model.weeks === 12 ? 1 : 0} cls="w-full" hrefs={model.weekHrefs} />
    {!report ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : <>
      {report.rows.length === 0 ? E.blank(report.reason === "no_completed_periods" ? "No completed count periods in this window" : "No comparable brand totals yet") : E.tbl(["Brand", "Expected", "Actual", "Destroyed", "Variance"], report.rows.map(row => [row.brand_name, bbl(row.expected_bbl), bbl(row.actual_bbl), bbl(row.destroyed_bbl), bbl(row.variance_bbl)]), ["l", "r", "r", "r", "r"])}
      {model.trend ? E.nav(model.trend.brand, model.trend.detail, "", undefined, model.trend.href) : E.gated("Recurring brand trend", "Not available yet. This report totals each brand over the whole window, not week by week.")}
      {/* The tip reads a week-by-week trend, so it shows only beside one. */}
      {model.trend && E.info("A brand short every week points at one line or one shift. A single short week is noise.")}
      <p className="text-sm text-muted-foreground">Completed count endings {formatDate(report.window_start)} through {formatDate(report.window_end)} · as of <time dateTime={report.as_of}>{formatDateTime(report.as_of, model.timeZone)}</time>. Variance is expected minus actual.</p>
      {report.rows.map(row => <div key={row.brand_id} className="rounded-xl border p-3 text-sm">
        <p className="font-medium">{row.brand_name} · {row.compared_periods} completed {row.compared_periods === 1 ? "period" : "periods"}</p>
        <p className="text-muted-foreground">{bbl(row.excluded_bbl)} excluded outside inventory · {bbl(row.unattributed_bbl)} unattributed{row.split ? " · overlapping taps split expected volume" : ""}</p>
      </div>)}
      {/* No periods: the brand table's empty state already says so (#1118). A first count is listed but has no start, so the heading does not call these completed. */}
      {report.periods.length > 0 && <section aria-labelledby="periods-heading"><h2 id="periods-heading" className="text-lg font-semibold">Count periods</h2>
        {report.periods.map(period => <article key={period.count_id} className="border-b py-3 text-sm">
          <p className="font-medium">Count {formatDate(period.counted_on)}</p>
          <p className="text-muted-foreground">{period.starts_at ? <><time dateTime={period.starts_at}>{formatDateTime(period.starts_at, model.timeZone)}</time> (exclusive)</> : "No starting count"} through <time dateTime={period.ends_at}>{formatDateTime(period.ends_at, model.timeZone)}</time> (inclusive){period.starts_before_window ? " · period begins before this report window" : ""}</p>
          <p>Expected {bbl(period.expected_bbl)} · actual frozen count depletion {bbl(period.actual_bbl)} · destroyed {bbl(period.destroyed_bbl)} · variance {bbl(period.expected_bbl === null ? null : Number(period.expected_bbl) - Number(period.actual_bbl))}</p>
          <p className="text-muted-foreground">{reason(period.reason)} · coverage {period.coverage_complete ? "complete" : "incomplete"} · {period.unmapped_lines} unmapped POS {period.unmapped_lines === 1 ? "line" : "lines"}</p>
        </article>)}
      </section>}
      {E.info("A dash means a value is unavailable. Read zero alongside coverage and excluded consumption. Guest kegs are never matched by label, and no guest numeric yield is shown.")}
    </>}
  </>;
}

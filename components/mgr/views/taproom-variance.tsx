import Link from "next/link";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { varianceBbl as bbl, varianceReason as reason, type TaproomVarianceViewModel } from "@/lib/mgr/taproom-variance-view";

export function TaproomVarianceView({ model }: { model: TaproomVarianceViewModel }) {
  const report = model.report;
  return <>
    {E.back("Beer", "Variance", undefined, model.backHref)}
    {E.ttl("Variance by brand")}
    {(model.countHref || model.boardHref) && <div className="flex flex-wrap gap-3 text-sm">{model.countHref && <Link className="underline" href={model.countHref}>Weekly count</Link>}{model.boardHref && <Link className="underline" href={model.boardHref}>Tap board</Link>}</div>}
    {model.locations && <LinkTabs items={model.locations} current={model.location ?? ""} className="w-full md:w-fit" />}
    {model.weekHrefs ? <LinkTabs items={model.weekHrefs} current={`${model.weeks} weeks`} className="w-full md:w-fit" /> : E.tabs(["4 weeks", "12 weeks"], model.weeks === 12 ? 1 : 0)}
    {!report ? E.blank("No taproom locations yet. Ask Admin to add one under Locations.") : <>
      {report.rows.length === 0 ? E.blank(report.reason === "no_completed_periods" ? "No completed count periods in this window" : "No comparable brand totals yet") : E.tbl(["Brand", "Expected", "Actual", "Variance"], report.rows.map(row => [row.brand_name, bbl(row.expected_bbl), bbl(row.actual_bbl), bbl(row.variance_bbl)]))}
      {model.trend ? E.nav(model.trend.brand, model.trend.detail, "", undefined, model.trend.href) : E.gated("Recurring brand trend", "The report returns brand totals and period coverage, not brand-by-period trends.")}
      {E.info("A brand short every week points at one line or one shift. A single short week is noise.")}
      {E.note("Reported, never posted. The count already wrote the depletion; this is the explanation for it.")}
      <p className="text-sm text-muted-foreground">Completed count endings {report.window_start} through {report.window_end} · as of <time dateTime={report.as_of}>{new Date(report.as_of).toLocaleString()}</time>. Variance is expected minus actual.</p>
      {report.rows.map(row => <div key={row.brand_id} className="rounded-xl border p-3 text-sm">
        <p className="font-medium">{row.brand_name} · {row.compared_periods} completed {row.compared_periods === 1 ? "period" : "periods"}</p>
        <p className="text-muted-foreground">{bbl(row.excluded_bbl)} excluded outside inventory · {bbl(row.unattributed_bbl)} unattributed{row.split ? " · overlapping taps split expected volume" : ""}</p>
      </div>)}
      <section aria-labelledby="periods-heading"><h2 id="periods-heading" className="text-lg font-semibold">Completed periods</h2>
        {report.periods.length === 0 ? <p className="text-sm text-muted-foreground">No saved count endings fall in this window.</p> : report.periods.map(period => <article key={period.count_id} className="border-b py-3 text-sm">
          <p className="font-medium">Count {period.counted_on}</p>
          <p className="text-muted-foreground">{period.starts_at ? <><time dateTime={period.starts_at}>{new Date(period.starts_at).toLocaleString()}</time> (exclusive)</> : "No starting count"} through <time dateTime={period.ends_at}>{new Date(period.ends_at).toLocaleString()}</time> (inclusive){period.starts_before_window ? " · period begins before this report window" : ""}</p>
          <p>Expected {bbl(period.expected_bbl)} · actual frozen count depletion {bbl(period.actual_bbl)} · variance {bbl(period.expected_bbl === null ? null : Number(period.expected_bbl) - Number(period.actual_bbl))}</p>
          <p className="text-muted-foreground">{reason(period.reason)} · coverage {period.coverage_complete ? "complete" : "incomplete"} · {period.unmapped_lines} unmapped POS {period.unmapped_lines === 1 ? "line" : "lines"}</p>
        </article>)}
      </section>
      {E.note("A dash means a value is unavailable. Read zero alongside coverage and excluded consumption. Guest kegs are never matched by label, and no guest numeric yield is shown.")}
    </>}
  </>;
}

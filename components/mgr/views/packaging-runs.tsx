import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackagingRunRowView, PackagingRunsViewModel } from "@/lib/mgr/packaging-runs-view";
import { RecordTable } from "@/components/mgr/views/record-table";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";

function UpcomingTable({ rows }: { rows: PackagingRunRowView[] }) {
  return <RecordTable
    headers={["Run", "Brand", "Planned date", "Source", "Planned quantity", "Next action"]}
    align={["l", "l", "l", "l", "r", "l"]}
    rows={rows.map(row => ({
      key: row.key,
      href: row.href,
      to: "Packaging plan",
      note: row.shortfall ? <span className="text-warning-foreground">{row.shortfall}</span> : undefined,
      cells: [
        row.runNo,
        row.brand ?? "No brand",
        <Fragment key="date">{row.date}{row.overdue ? <> {E.status("Overdue", "w")}</> : null}</Fragment>,
        row.source ?? "No source yet",
        row.quantity,
        <Fragment key="action">{E.act(row.verb, row.tone, row.href)}</Fragment>,
      ],
      sort: [row.runNo, row.brand, row.date, row.source, row.quantity, null],
    }))}
  />;
}

/** How a closed run's barrels split between cans or bottles (solid) and kegs (light). */
function OutputMix({ row }: { row: PackagingRunRowView }) {
  if (row.kegPercent === undefined) return row.output;
  return <span className="inline-flex items-center gap-2">
    <span role="img" aria-label={`${100 - row.kegPercent}% cans and bottles, ${row.kegPercent}% kegs by volume`} className="flex h-2 w-20 shrink-0 overflow-hidden rounded-full bg-primary/30">
      <span className="bg-primary" style={{ width: `${100 - row.kegPercent}%` }} />
    </span>
    {row.output}
  </span>;
}

/** Barrels packaged against the plan: the track is the plan and the fill is what was packaged. */
function PackagedOfPlanned({ row }: { row: PackagingRunRowView }) {
  if (row.planPercent === undefined) return <span className="text-muted-foreground">{row.packaged}</span>;
  return <span className="inline-flex items-center gap-2">
    <span aria-hidden className="flex h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
      <span className={row.belowPlan ? "bg-warning-foreground" : "bg-primary"} style={{ width: `${row.planPercent}%` }} />
    </span>
    <span className={row.belowPlan ? "font-medium text-warning-foreground" : undefined}>{row.packaged}</span>
  </span>;
}

const swatch = (className: string) => <span className={`mr-1 inline-block size-2 rounded-sm ${className}`} />;

/** Finished runs under a heading per planned day. The day order is the point, so the columns do not sort. */
function RecentTable({ rows }: { rows: PackagingRunRowView[] }) {
  const packaged = rows.some(row => row.packaged !== undefined);
  return <>
    {rows.some(row => row.kegPercent !== undefined) && <p className="flex gap-4 text-xs text-muted-foreground">
      <span>{swatch("bg-primary")}Cans and bottles</span><span>{swatch("bg-primary/30")}Kegs</span>
    </p>}
    <RecordTable
      sortable={false}
      headers={["Run", "Brand", "Output", ...(packaged ? ["Packaged of planned"] : [])]}
      align={["l", "l", "l", ...(packaged ? ["l" as const] : [])]}
      rows={rows.map(row => ({
        key: row.key,
        href: row.href,
        to: "Run closed",
        heading: row.heading,
        cells: [
          row.runNo,
          row.brand ?? "No brand",
          row.status === "Cancelled" ? <Fragment key="status">{E.status("Cancelled")}</Fragment> : <OutputMix key="output" row={row} />,
          ...(packaged ? [row.packaged === undefined ? undefined : <PackagedOfPlanned key="packaged" row={row} />] : []),
        ],
      }))}
    />
  </>;
}

export function PackagingRunsView({ model, actions, workHrefs, pagination }: { model: PackagingRunsViewModel; actions?: ReactNode; workHrefs?: Record<string, string>; pagination?: HistoryNavigationProps }) {
  return <>
    {E.hd("Packaging", actions !== undefined ? actions : E.btn("Schedule run"))}
    <WorkKindTabs chips={model.workChips} current={model.workChips[4]} tabs={model.workTabs} hrefs={workHrefs} />
    {model.empty && !pagination?.firstHref ? E.blank(model.empty) : <>
      {model.upcoming.length > 0 && <>{E.ttl("Upcoming")}<UpcomingTable rows={model.upcoming} /></>}
      {model.recent.length > 0 && <>{E.ttl("Recent")}<RecentTable rows={model.recent} /></>}
    </>}
    <HistoryNavigation {...pagination} />
  </>;
}

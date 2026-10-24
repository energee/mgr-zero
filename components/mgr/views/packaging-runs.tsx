import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackagingRunRowView, PackagingRunsViewModel } from "@/lib/mgr/packaging-runs-view";
import { RecordTable } from "@/components/mgr/views/record-table";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

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
        row.date,
        row.source ?? "No source yet",
        row.quantity,
        <Fragment key="action">{E.act(row.verb, row.tone, row.href)}</Fragment>,
      ],
      sort: [row.runNo, row.brand, row.date, row.source, row.quantity, null],
    }))}
  />;
}

function RecentTable({ rows }: { rows: PackagingRunRowView[] }) {
  const lot = rows.some(row => row.lot !== undefined);
  const output = rows.some(row => row.output !== undefined);
  const yieldPercent = rows.some(row => row.yieldPercent !== undefined);
  const loss = rows.some(row => row.lossBbl !== undefined);
  return <RecordTable
    headers={["Run", "Brand", "Status", "Finished date", "Planned quantity", ...(lot ? ["Lot"] : []), ...(output ? ["Output"] : []), ...(yieldPercent ? ["Yield"] : []), ...(loss ? ["Loss (bbl)"] : [])]}
    align={["l", "l", "l", "l", "r", ...(lot ? ["l" as const] : []), ...(output ? ["r" as const] : []), ...(yieldPercent ? ["r" as const] : []), ...(loss ? ["r" as const] : [])]}
    rows={rows.map(row => ({
      key: row.key,
      href: row.href,
      to: "Run closed",
      cells: [
        row.runNo,
        row.brand ?? "No brand",
        row.status,
        row.date,
        row.quantity,
        ...(lot ? [row.lot] : []),
        ...(output ? [row.output] : []),
        ...(yieldPercent ? [row.yieldPercent === undefined ? undefined : `${row.yieldPercent}%`] : []),
        ...(loss ? [row.lossBbl === undefined ? undefined : <span key="loss" className={row.lossBbl ? "text-warning-foreground" : undefined}>{row.lossBbl}</span>] : []),
      ],
    }))}
  />;
}

export function PackagingRunsView({ model, actions, workHrefs }: { model: PackagingRunsViewModel; actions?: ReactNode; workHrefs?: Record<string, string> }) {
  return <>
    {E.hd("Packaging", "", actions !== undefined ? actions : E.btn("Schedule run"))}
    <WorkKindTabs chips={model.workChips} current={model.workChips[4]} tabs={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : <>
      {model.upcoming.length > 0 && <>{E.ttl("Upcoming")}<UpcomingTable rows={model.upcoming} /></>}
      {model.recent.length > 0 && <>{E.ttl("Recent")}<RecentTable rows={model.recent} /></>}
    </>}
  </>;
}

import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { PackagingRunsViewModel } from "@/lib/mgr/packaging-runs-view";

export function PackagingRunsView({ model, actions, workHrefs }: { model: PackagingRunsViewModel; actions?: ReactNode; workHrefs?: Record<string, string> }) {
  const names = workHrefs ? model.workChips.filter(name => workHrefs[name]) : model.workChips;
  const rows = (title: string, items: PackagingRunsViewModel["upcoming"]) => items.length ? <>
    {E.ttl(title)}
    {items.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, row.verb ? E.act(row.verb, row.tone, row.href) : "", row.warning ? "w" : "")}</Fragment>)}
  </> : null;
  return <>
    {E.hd("Packaging", "runs", actions !== undefined ? actions : E.btn("Schedule run"))}
    <TabBar names={names} on={names.indexOf(model.workChips[4])} cls="w-full overflow-x-auto" to={model.workTabs} hrefs={workHrefs} />
    {model.upcoming.length || model.recent.length ? <>{rows("Upcoming", model.upcoming)}{rows("Recent", model.recent)}</> : E.blank("No runs planned")}
    {model.recent.length ? E.info("Recent keeps the last few weeks. Older runs are under Search and Lot trace.") : null}
  </>;
}

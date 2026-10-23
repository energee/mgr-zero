import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackagingRunsViewModel } from "@/lib/mgr/packaging-runs-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

export function PackagingRunsView({ model, actions, workHrefs }: { model: PackagingRunsViewModel; actions?: ReactNode; workHrefs?: Record<string, string> }) {
  const rows = (title: string, items: PackagingRunsViewModel["upcoming"]) => items.length ? <>
    {E.ttl(title)}
    {items.map((row) => <Fragment key={row.key}>{row.verb ? E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "") : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, row.href)}</Fragment>)}
  </> : null;
  return <>
    {E.hd("Packaging", "", actions !== undefined ? actions : E.btn("Schedule run"))}
    <WorkKindTabs chips={model.workChips} current={model.workChips[4]} tabs={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : <>{rows("Upcoming", model.upcoming)}{rows("Recent", model.recent)}</>}
    {model.recent.length ? E.info("Recent keeps the last few weeks. Older runs are under Search and Lot trace.") : null}
  </>;
}

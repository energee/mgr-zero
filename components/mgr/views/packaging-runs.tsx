import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackagingRunsViewModel } from "@/lib/mgr/packaging-runs-view";

export function PackagingRunsView({ model, actions, tabs }: { model: PackagingRunsViewModel; actions?: ReactNode; tabs?: ReactNode | null }) {
  const rows = (title: string, items: PackagingRunsViewModel["upcoming"]) => items.length ? <>
    {E.ttl(title)}
    {items.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, row.verb ? E.act(row.verb, row.tone, row.href) : "", row.warning ? "w" : "")}</Fragment>)}
  </> : null;
  return <>
    {E.hd("Packaging", "runs", actions !== undefined ? actions : E.btn("Schedule run"))}
    {tabs === undefined ? E.tabs(model.workChips, 4, "w-full", model.workTabs) : tabs}
    {model.upcoming.length || model.recent.length ? <>{rows("Upcoming", model.upcoming)}{rows("Recent", model.recent)}</> : E.blank("No runs planned")}
    {model.recent.length ? E.info("Recent keeps the last few weeks. Older runs are under Search and Lot trace.") : null}
  </>;
}

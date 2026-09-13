// Explorer grouping and controls; adapters supply rows and explicit destinations.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { BatchesViewModel } from "@/lib/mgr/batches-view";

export type { BatchesViewModel };

export function BatchesView({ model, createAction, workHrefs, newVesselHref }: {
  model: BatchesViewModel; createAction?: ReactNode; workHrefs?: Record<string, string>; newVesselHref?: string;
}) {
  const names = workHrefs ? model.workChips.filter(name => workHrefs[name]) : model.workChips;
  return <>
    {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New batch"))}
    <TabBar names={names} on={names.indexOf(model.workChips[model.workChipIndex])} cls="w-full overflow-x-auto" to={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : <>
      {([["Planned", model.planned], ["Active", model.active], ["Completed", model.completed ?? []]] as const).map(([title, rows]) => {
        return rows.length ? <Fragment key={title}>
          {E.ttl(title)}
          {rows.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "")}</Fragment>)}
        </Fragment> : null;
      })}
      {model.readingUnavailable && <div data-gated>{E.note("Reading details unavailable in this list. Open the batch or Cellar for current vessel work.")}</div>}
    </>}
    {model.vessels !== undefined && <>
      {E.sp()}{E.ttl("Vessels")}
      <div className="self-start">{E.btn("New vessel", "p", newVesselHref)}</div>
      {!model.vessels.length ? E.blank("No vessels yet") : model.vessels.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href))}</Fragment>)}
    </>}
  </>;
}

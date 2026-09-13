// Shared Routes list; callers supply query rows and explicit destinations.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { RoutesViewModel } from "@/lib/mgr/routes-view";

export type { RoutesViewModel };

export function RoutesView({ model, createAction, workHrefs }: {
  model: RoutesViewModel; createAction?: ReactNode; workHrefs?: Record<string, string>;
}) {
  const names = workHrefs ? model.workChips.filter(name => workHrefs[name]) : model.workChips;
  return <>
    {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New route"))}
    <TabBar names={names} on={names.indexOf(model.workChips[model.workChipIndex])} cls="w-full overflow-x-auto" to={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : model.rows.map(row => <Fragment key={row.key}>
      {E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "")}
    </Fragment>)}
  </>;
}

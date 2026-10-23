// Shared Routes list; callers supply query rows and explicit destinations.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RoutesViewModel } from "@/lib/mgr/routes-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

export type { RoutesViewModel };

export function RoutesView({ model, createAction, workHrefs }: {
  model: RoutesViewModel; createAction?: ReactNode; workHrefs?: Record<string, string>;
}) {
  return <>
    {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New route"))}
    <WorkKindTabs chips={model.workChips} current={model.workChips[model.workChipIndex]} tabs={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : model.rows.map(row => <Fragment key={row.key}>
      {row.verb ? E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "") : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, row.href)}
    </Fragment>)}
  </>;
}

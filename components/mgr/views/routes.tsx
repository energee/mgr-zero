// Shared Routes list; callers supply query rows and explicit destinations. The
// Status pick (ScopePick, so the URL holds it) switches Open and Returned routes.
import { Fragment, type ReactNode } from "react";
import { E, ROW_LINK_COVER } from "@/components/mgr/e";
import { ScopePick } from "@/components/mgr/scope-pick";
import type { RoutesViewModel } from "@/lib/mgr/routes-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

export function RoutesView({ model, createAction, workHrefs }: {
  model: RoutesViewModel; createAction?: ReactNode; workHrefs?: Record<string, string>;
}) {
  return <>
    {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New route"))}
    <WorkKindTabs chips={model.workChips} current={model.workChips[model.workChipIndex]} tabs={model.workTabs} hrefs={workHrefs} />
    <div className="md:w-64">
      <ScopePick label="Status" value={model.status} options={model.statusOptions} />
    </div>
    {model.empty ? E.blank(model.empty) : model.rows.map(row => <Fragment key={row.key}>
      {row.verb ? E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href, undefined, undefined, ROW_LINK_COVER), row.warning ? "w" : "") : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, row.href)}
    </Fragment>)}
  </>;
}

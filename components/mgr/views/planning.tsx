import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PlanningViewModel } from "@/lib/mgr/planning-view";

export function PlanningView({ model, footer }: { model: PlanningViewModel; footer?: ReactNode }) {
  return <>
    {E.back("More", "Planning")}
    {model.horizon ? E.tbl(["week", "demand", "supply", "gap"], model.horizon) : null}
    {model.reviews?.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, E.act("Review"), row.warning ? "w" : "")}</Fragment>)}
    {model.requirements.length === 0 && !model.horizon ? E.blank("Nothing short: every committed batch and packaging run is covered by on hand and open orders") : null}
    {model.requirements.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, row.quantity, row.warning ? "w" : "")}</Fragment>)}
    {model.drafts?.length ? <>{E.ttl("Drafts this creates")}{model.drafts.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, row.quantity, row.warning ? "w" : "")}</Fragment>)}</> : null}
    {model.info ? E.info(model.info) : null}
    {E.sp()}
    {footer !== undefined ? footer : E.btn("Draft 1 purchase order")}
  </>;
}

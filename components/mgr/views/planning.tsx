// components/mgr/views/planning.tsx — Planning: material shortages grouped by
// the vendor they resolve to (#1516). Each vendor group ends with its own
// Create purchase order; a row with no vendor offers Set vendor. Live passes
// groupAction (DraftButton, or null for a role that cannot draft); the
// inventory leaves it out and draws an inert Create purchase order.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PlanningGroupView, PlanningViewModel } from "@/lib/mgr/planning-view";

export function PlanningView({ model, groupAction }: {
  model: PlanningViewModel;
  groupAction?: ((group: PlanningGroupView) => ReactNode) | null;
}) {
  const action = (group: PlanningGroupView) =>
    groupAction !== undefined ? groupAction?.(group) : group.draftIds.length > 0 ? E.btn("Create purchase order") : null;
  return <>
    {E.back("More", "Planning", undefined, model.backHref)}
    {model.horizon ? E.tbl(["week", "demand", "supply", "gap"], model.horizon, ["l", "r", "r", "r"]) : null}
    {model.reviews?.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, E.act("Review"), row.warning ? "w" : "")}</Fragment>)}
    {model.empty ? E.blank(model.empty, undefined, (
      <div className="w-full text-left">
        {model.empty.links.map((link) => <Fragment key={link.title}>{E.nav(link.title, link.detail, "", undefined, link.href)}</Fragment>)}
      </div>
    )) : null}
    {model.groups.map((group) => <section key={group.key} aria-label={group.vendor ?? "No vendor"} className="flex flex-col gap-1">
      {E.ttl(group.vendor ?? "No vendor")}
      {group.rows.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail,
        group.vendor === null && row.setVendorHref !== null
          ? <><span className="text-sm text-muted-foreground">{row.quantity}</span>{E.act("Set vendor", "primary", row.setVendorHref)}</>
          : row.quantity,
        row.warning ? "w" : "")}</Fragment>)}
      {action(group)}
    </section>)}
    {model.drafts?.length ? <>{E.ttl("Drafts this creates")}{model.drafts.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail, row.quantity, row.warning ? "w" : "")}</Fragment>)}</> : null}
    {model.info ? E.info(model.info) : null}
  </>;
}

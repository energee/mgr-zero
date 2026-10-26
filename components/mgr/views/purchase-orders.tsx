// components/mgr/views/purchase-orders.tsx — Purchase orders list. Live supplies
// actions and links; the shared model draws the list and Work chips.
import { Fragment, type ReactNode } from "react";
import { E, ROW_LINK_COVER } from "@/components/mgr/e";
import type { PurchaseOrdersViewModel } from "@/lib/mgr/purchase-orders-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

export type { PurchaseOrdersViewModel };

export function PurchaseOrdersView({
  model,
  createAction,
  workHrefs,
  footer,
  linkRows,
}: {
  model: PurchaseOrdersViewModel;
  createAction?: ReactNode;
  workHrefs?: Record<string, string>;
  footer?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New PO"))}
      <WorkKindTabs chips={model.workChips} current={model.workChips[model.workChipIndex]} tabs={model.workTabs} hrefs={workHrefs} />
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {row.verb
              ? E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined, undefined, undefined, ROW_LINK_COVER), row.warning ? "w" : "")
              : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
      {footer}
    </>
  );
}

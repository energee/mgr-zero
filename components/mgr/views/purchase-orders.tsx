// components/mgr/views/purchase-orders.tsx — Purchase orders list. Live supplies
// actions and links; the shared model draws the list and Work chips.
import { Fragment, type ReactNode } from "react";
import { E, ROW_LINK_COVER } from "@/components/mgr/e";
import type { PurchaseOrdersRowView, PurchaseOrdersViewModel } from "@/lib/mgr/purchase-orders-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

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
      {model.empty ? E.blank(model.empty) : <PurchaseOrderRows rows={model.rows} linkRows={linkRows} />}
      {footer}
    </>
  );
}

/** The order rows: an open order's next action covers its row, a closed one is
 *  a plain link. The list and one vendor's page (#1586) both draw these. */
export function PurchaseOrderRows({ rows, linkRows }: { rows: PurchaseOrdersRowView[]; linkRows?: boolean }) {
  return rows.map((row) => (
    <Fragment key={row.key}>
      {row.verb
        ? E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined, undefined, undefined, ROW_LINK_COVER), row.warning ? "w" : "")
        : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
    </Fragment>
  ));
}

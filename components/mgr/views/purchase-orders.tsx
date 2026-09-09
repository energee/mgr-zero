// components/mgr/views/purchase-orders.tsx — Purchase orders list. Live slots
// NewPoForm and the list_purchase_orders rows; inventory draws Work chips.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PurchaseOrdersViewModel } from "@/lib/mgr/purchase-orders-view";

export type { PurchaseOrdersViewModel };

export function PurchaseOrdersView({
  model,
  createAction,
  tabs,
  list,
  footer,
  linkRows,
}: {
  model: PurchaseOrdersViewModel;
  createAction?: ReactNode;
  tabs?: ReactNode | null;
  list?: ReactNode;
  footer?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New PO"))}
      {tabs === undefined ? E.tabs(model.workChips, model.workChipIndex, "w-full", model.workTabs) : tabs}
      {list !== undefined
        ? list
        : model.empty
          ? E.blank(model.empty)
          : model.rows.map((row) => (
            <Fragment key={row.key}>
              {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
            </Fragment>
          ))}
      {footer}
    </>
  );
}

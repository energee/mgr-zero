// components/mgr/views/purchase-orders.tsx — Purchase orders list. Live slots
// NewPoForm and the list_purchase_orders rows; inventory draws Work chips.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { PurchaseOrdersViewModel } from "@/lib/mgr/purchase-orders-view";

export type { PurchaseOrdersViewModel };

export function PurchaseOrdersView({
  model,
  createAction,
  workHrefs,
  list,
  footer,
  linkRows,
}: {
  model: PurchaseOrdersViewModel;
  createAction?: ReactNode;
  workHrefs?: Record<string, string>;
  list?: ReactNode;
  footer?: ReactNode;
  linkRows?: boolean;
}) {
  const names = workHrefs ? model.workChips.filter(name => workHrefs[name]) : model.workChips;
  return (
    <>
      {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New PO"))}
      <TabBar names={names} on={names.indexOf(model.workChips[model.workChipIndex])} cls="w-full overflow-x-auto" to={model.workTabs} hrefs={workHrefs} />
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

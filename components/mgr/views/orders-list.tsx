// components/mgr/views/orders-list.tsx — the Work → Orders register. One
// drawing for inventory and live: the shared WorkKindTabs, a labeled Status
// pick (ScopePick, so the URL holds it), the customer scope line, and a
// RecordTable whose order number is the one link to the order (no Customer
// column while the scope line names the customer). Live passes
// OrderForm as createAction and the adapter's hrefs; the inventory's stay inert.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ScopePick } from "@/components/mgr/scope-pick";
import type { OrdersListRowView, OrdersListViewModel } from "@/lib/mgr/orders-list-view";
import { ORDER_STATUSES } from "@/lib/mgr/order-status";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { CustomerScope } from "./customer-scope";
import { RecordTable } from "./record-table";
import { WorkKindTabs } from "./work-kind-tabs";

const muted = (text: string) => <span key={text} className="text-muted-foreground">{text}</span>;

/** Lifecycle status, and staged restock as a second worded badge so color is never the only signal. */
const statusCell = (row: OrdersListRowView) => (
  <span key="status" className="inline-flex flex-wrap gap-1.5">
    {E.status(row.statusLabel)}
    {row.restock && E.status("Restock staged", "w")}
  </span>
);

const CUSTOMER_COLUMN = 1;

/** scoped: the customer scope line already names the customer, so the Customer column is left out (#1506). */
function Register({ rows, scoped }: { rows: OrdersListRowView[]; scoped: boolean }) {
  // The action column needs no visible header: its button names the verb.
  const headers = ["Order", "Customer", "Requested ship date", "Status", <span key="action" className="sr-only">Next action</span>];
  /** Every column list (headers, align, cells, sort) drops the Customer column when scoped. */
  const shown = <T,>(cells: T[]) => (scoped ? cells.filter((_, i) => i !== CUSTOMER_COLUMN) : cells);
  return (
    <RecordTable
      headers={shown(headers)}
      align={shown(["l", "l", "l", "l", "l"])}
      rows={rows.map((row) => ({
        key: row.key,
        href: row.href,
        to: "Order",
        cells: shown([
          row.orderNo,
          row.customer ? <span key="customer" className="font-medium">{row.customer}</span> : muted("transfer"),
          row.shipDate ?? muted("Not scheduled"),
          statusCell(row),
          row.action && <Fragment key="action">{E.act(row.action.verb, row.action.tone, row.action.href)}</Fragment>,
        ]),
        // Status sorts in lifecycle order (draft first); no ship date sorts last.
        sort: shown([row.orderNo, row.customer ?? "transfer", row.shipDate, ORDER_STATUSES.indexOf(row.status)]),
      }))}
    />
  );
}

export function OrdersView({
  model,
  pagination,
  createAction,
  workHrefs,
  listStatus,
  feedback,
}: {
  pagination?: HistoryNavigationProps;
  model: OrdersListViewModel;
  createAction?: ReactNode;
  /** Live: the Work chips this role may open. */
  workHrefs?: Record<string, string>;
  listStatus?: ReactNode;
  feedback?: ReactNode;
}) {
  const newOrder = createAction !== undefined ? createAction : E.btn("New order");
  const emptyAction = model.status === "all" && !model.customer && !pagination?.firstHref ? newOrder : undefined;
  return (
    <>
      {E.hd("Orders", undefined, newOrder)}
      <WorkKindTabs chips={WORK_CHIPS} current="orders" tabs={WORK_TABS} hrefs={workHrefs} />
      <div className="md:w-64">
        <ScopePick label="Status" value={model.status} options={model.statusOptions} />
      </div>
      {model.customer && <CustomerScope {...model.customer} to="Orders" />}
      {feedback}
      {listStatus ?? (model.empty ? E.blank(model.empty, undefined, emptyAction) : <Register rows={model.rows} scoped={Boolean(model.customer)} />)}
      <HistoryNavigation {...pagination} />
    </>
  );
}

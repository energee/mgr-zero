// components/mgr/views/orders-list.tsx — the Work → Orders register. One
// drawing for inventory and live: the shared WorkKindTabs, a labeled Status
// pick (ScopePick, so the URL holds it), the customer scope line, and a
// RecordTable whose order number is the one link to the order. Live passes
// OrderForm as createAction and the adapter's hrefs; the inventory's stay inert.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ScopePick } from "@/components/mgr/scope-pick";
import type { OrdersListRowView, OrdersListViewModel } from "@/lib/mgr/orders-list-view";
import { ORDER_STATUSES } from "@/lib/mgr/order-status";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { RecordTable } from "./record-table";
import { WorkKindTabs } from "./work-kind-tabs";

export type { OrdersListViewModel };

const muted = (text: string) => <span key={text} className="text-muted-foreground">{text}</span>;

/** Lifecycle status, and staged restock as a second worded badge so color is never the only signal. */
const statusCell = (row: OrdersListRowView) => (
  <span key="status" className="inline-flex flex-wrap gap-1.5">
    {E.status(row.statusLabel)}
    {row.restock && E.status("Restock staged", "w")}
  </span>
);

function Register({ rows }: { rows: OrdersListRowView[] }) {
  return (
    <RecordTable
      // The action column needs no visible header: its button names the verb.
      headers={["Order", "Customer", "Requested ship date", "Status", <span key="action" className="sr-only">Next action</span>]}
      align={["l", "l", "l", "l", "l"]}
      rows={rows.map((row) => ({
        key: row.key,
        href: row.href,
        to: "Order",
        cells: [
          row.orderNo,
          row.customer ? <span key="customer" className="font-medium">{row.customer}</span> : muted("transfer"),
          row.shipDate ?? muted("Not scheduled"),
          statusCell(row),
          row.action && <Fragment key="action">{E.act(row.action.verb, row.action.tone, row.action.href)}</Fragment>,
        ],
        // Status sorts in lifecycle order (draft first); no ship date sorts last.
        sort: [row.orderNo, row.customer ?? "transfer", row.shipDate, ORDER_STATUSES.indexOf(row.status)],
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
      {model.customer && (
        <p className="text-sm">
          Customer: <strong className="font-medium wrap-anywhere">{model.customer.name}</strong> ·{" "}
          {/* The shared 48px target on coarse pointers; the inventory's Clear stays inert. */}
          <Link href={model.customer.clearHref ?? "#"} data-to="Orders" className="inline-flex min-h-6 items-center text-muted-foreground underline pointer-coarse:min-h-12">Clear</Link>
        </p>
      )}
      {feedback}
      {listStatus ?? (model.empty ? E.blank(model.empty, undefined, emptyAction) : <Register rows={model.rows} />)}
      <HistoryNavigation {...pagination} />
    </>
  );
}

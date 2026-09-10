// components/mgr/views/orders-list.tsx — Work → Orders list. Live passes
// OrderForm as createAction and LinkTabs as filters; inventory uses the
// fixture verbs and E.tabs.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { OrdersListViewModel } from "@/lib/mgr/orders-list-view";

export type { OrdersListViewModel };

const WORK_CHIPS = ["all", "orders", "transfers", "batches", "runs", "POs", "routes"];
const WORK_TABS: Record<string, string> = {
  all: "Work", orders: "Orders", transfers: "Transfers", batches: "Batches",
  runs: "Packaging runs", POs: "Purchase orders", routes: "Routes",
};
const ORDER_STATES = ["all states", "draft", "submitted", "confirmed", "picked", "shipped"];

export function OrdersView({
  model,
  createAction,
  filters,
  linkRows,
}: {
  model: OrdersListViewModel;
  createAction?: ReactNode;
  filters?: ReactNode;
  /** Live list: row verbs are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Orders", model.subtitle, createAction !== undefined ? createAction : E.btn("New order"))}
      {filters !== undefined ? filters : (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {E.tabs(WORK_CHIPS, 1, "w-full md:w-fit", WORK_TABS)}
          {E.tabs(ORDER_STATES, 0, "w-full justify-start overflow-x-auto md:w-fit")}
        </div>
      )}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}

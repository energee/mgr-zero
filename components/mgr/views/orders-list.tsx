// components/mgr/views/orders-list.tsx — Work → Orders list. The Work kind
// strip is the shared WorkKindTabs; live passes OrderForm as createAction and
// the status LinkTabs as filters; inventory uses the fixture verbs and E.tabs.
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { OrdersListViewModel } from "@/lib/mgr/orders-list-view";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { WorkKindTabs } from "./work-kind-tabs";

export type { OrdersListViewModel };

const ORDER_STATES = ["all states", "draft", "submitted", "confirmed", "picked", "shipped"];

export function OrdersView({
  model,
  pagination,
  createAction,
  filters,
  workHrefs,
  linkRows,
  listStatus,
  feedback,
}: {
  pagination?: HistoryNavigationProps;
  model: OrdersListViewModel;
  createAction?: ReactNode;
  /** The status filter under the Work kind strip; inventory draws inert state tabs. */
  filters?: ReactNode;
  /** Live: the Work chips this role may open. */
  workHrefs?: Record<string, string>;
  /** Live list: row verbs are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
  listStatus?: ReactNode;
  feedback?: ReactNode;
}) {
  return (
    <>
      {E.hd("Orders", undefined, createAction !== undefined ? createAction : E.btn("New order"))}
      <WorkKindTabs chips={WORK_CHIPS} current="orders" tabs={WORK_TABS} hrefs={workHrefs} />
      {filters !== undefined ? filters : E.tabs(ORDER_STATES, 0, "w-full justify-start overflow-x-auto md:w-fit")}
      {feedback}
      {listStatus ?? (model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
          </Fragment>
        )))}
      <HistoryNavigation {...pagination} />
    </>
  );
}

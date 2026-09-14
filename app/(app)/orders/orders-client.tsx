"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { LinkTabs, WORK_CHIPS } from "@/components/mgr/work-tabs";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import type { StaffRole } from "@/lib/commands/registry";
import { toOrdersListViewProps, type OrdersListSnapshot } from "@/lib/mgr/orders-list-view";
import { type OrderStatus } from "@/lib/mgr/order-status";

const STATUSES: OrderStatus[] = ["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"];

export function OrdersClient({ role, status, customerId }: { role: StaffRole; status?: string; customerId?: string }) {
  const result = useCommandQuery<OrdersListSnapshot["orders"]>("list_orders", { status, customerId });
  const orders = result.data ?? [];
  const canWrite = role === "admin" || role === "sales";
  const orderHref = (nextStatus?: string) => {
    const query = new URLSearchParams();
    if (customerId) query.set("customerId", customerId);
    if (nextStatus) query.set("status", nextStatus);
    return `/orders${query.size ? `?${query}` : ""}`;
  };
  return (
    <OrdersView
      model={toOrdersListViewProps({ role, status, orders })}
      createAction={canWrite ? <Button asChild><Link href="/orders/new">New order</Link></Button> : null}
      listStatus={!result.data ? <QueryFeedback error={result.error} loading="Loading orders" paused={result.isPaused} retry={() => void result.refetch()} /> : undefined}
      feedback={result.data ? <QueryFeedback error={result.error} fetching={result.isFetching} paused={result.isPaused} updatedAt={result.dataUpdatedAt} retry={() => void result.refetch()} /> : undefined}
      linkRows
      filters={(
        <>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <LinkTabs items={WORK_CHIPS} current="orders" className="w-full md:w-fit" />
          <LinkTabs items={[["all", orderHref()], ...STATUSES.map((s): [string, string] => [s, orderHref(s)])]} current={status ?? "all"} className="w-full justify-start overflow-x-auto md:w-fit" />
        </div>
        {customerId && E.row("Customer filter", orders[0]?.customers?.name ?? "Customer", E.act("Clear", undefined, status ? `/orders?status=${status}` : "/orders"))}
        </>
      )}
    />
  );
}

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import type { StaffRole } from "@/lib/commands/registry";
import { toOrdersListViewProps, type OrdersListSnapshot } from "@/lib/mgr/orders-list-view";
import { salesRoles, type OrderFilter } from "@/lib/mgr/order-status";
import { hasAnyRole } from "@/lib/mgr/roles";
import { historyPage, type HistoryPage, type HistoryRow } from "@/lib/mgr/history-page";

export function OrdersClient({ roles, timeZone, status, customerId, customerName, cursor }: { roles: readonly StaffRole[]; timeZone: string; status?: OrderFilter; customerId?: string; customerName?: string; cursor?: string }) {
  const result = useCommandQuery<HistoryPage<OrdersListSnapshot["orders"][number] & HistoryRow>>("list_orders", { status, customerId, cursor });
  const page = historyPage(result.data ?? { rows: [], nextCursor: null }, "/orders", cursor, { status, customerId });
  // get_customer can fail (a stale or malformed link); say so rather than invent a name.
  const customer = customerId ? customerName ?? page.rows[0]?.customers?.name ?? "Customer unavailable" : undefined;
  const canWrite = hasAnyRole(roles, salesRoles); // create_order's roles
  return (
    <OrdersView
      model={toOrdersListViewProps({ roles, status, customer, customerId, linked: true, orders: page.rows })}
      // size="sm" like every Work list's create button, so the tab strip sits at the same height (#1226).
      createAction={canWrite ? <Button size="sm" asChild><Link href={customerId ? `/orders/new?customerId=${encodeURIComponent(customerId)}` : "/orders/new"}>New order</Link></Button> : null}
      listStatus={!result.data ? <QueryFeedback timeZone={timeZone} error={result.error} loading="Loading orders" paused={result.isPaused} retry={() => void result.refetch()} /> : undefined}
      feedback={result.data ? <QueryFeedback timeZone={timeZone} error={result.error} fetching={result.isFetching} paused={result.isPaused} updatedAt={result.dataUpdatedAt} retry={() => void result.refetch()} /> : undefined}
      pagination={page.pagination}
      workHrefs={workHrefsFor(roles)}
    />
  );
}

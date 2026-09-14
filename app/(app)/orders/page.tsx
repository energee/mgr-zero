// app/(app)/orders/page.tsx — Orders (screen record): the Work list with the
// Orders chip active. A state chip filters by `?status=`. New order is its own
// page (new/page.tsx), which loads the customer/location/SKU option lists.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { LinkTabs, WORK_CHIPS } from "@/components/mgr/work-tabs";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toOrdersListViewProps } from "@/lib/mgr/orders-list-view";
import { type OrderStatus } from "@/lib/mgr/order-status";
import "@/lib/commands/all";

type Order = { id: string; order_no: number | null; status: OrderStatus; requested_ship_date: string | null; needs_restock: boolean; customers: { name: string } | null };
type CustomerRow = { id: string; name: string };

const STATUSES: OrderStatus[] = ["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; customerId?: string }> }) {
  const { status, customerId } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [orders, customerRows] = await Promise.all([
    runCommand("list_orders", { status, customerId }, ctx) as Promise<Order[]>,
    customerId ? runCommand("list_customers", {}, ctx) as Promise<CustomerRow[]> : [],
  ]);
  const orderHref = (nextStatus?: string) => {
    const query = new URLSearchParams();
    if (customerId) query.set("customerId", customerId);
    if (nextStatus) query.set("status", nextStatus);
    return `/orders${query.size ? `?${query}` : ""}`;
  };
  return (
    <OrdersView
      model={toOrdersListViewProps({ role: brewery.role, status, orders })}
      createAction={canWrite ? <Button asChild><Link href="/orders/new">New order</Link></Button> : null}
      linkRows
      filters={(
        <>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <LinkTabs items={WORK_CHIPS} current="orders" className="w-full md:w-fit" />
          <LinkTabs items={[["all", orderHref()], ...STATUSES.map((s): [string, string] => [s, orderHref(s)])]} current={status ?? "all"} className="w-full justify-start overflow-x-auto md:w-fit" />
        </div>
        {customerId && E.row("Customer filter", customerRows.find((c) => c.id === customerId)?.name ?? "Customer", E.act("Clear", undefined, status ? `/orders?status=${status}` : "/orders"))}
        </>
      )}
    />
  );
}

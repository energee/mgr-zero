// app/(portal)/portal/orders/page.tsx — Order history (screen record): the
// caller's orders (portal_orders), newest first, each opening Order detail.
// No cancel: the portal is read-only after submit, and the page says whom
// to call.
import { historyPage, pageCursor, type HistoryPage, type HistoryRow } from "@/lib/mgr/history-page";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { getPortalContext } from "@/lib/portal";
import { runCommand } from "@/lib/commands/registry";
import { toPortalOrdersViewProps } from "@/lib/mgr/portal-orders-view";
import "@/lib/commands/all";

type Order = {
  id: string;
  order_no: number | null;
  status: string;
  requested_ship_date: string | null;
  order_lines: { id: string; qty_ordered: number; qty_shipped: number | null; unit_price_cents?: number | null; skus?: { name: string } | null }[];
};

export default async function PortalOrdersPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const cursor = pageCursor((await searchParams).cursor);
  const { customer, ctx } = await getPortalContext();
  const records = (await runCommand("portal_orders", { cursor }, ctx)) as HistoryPage<Order & HistoryRow>;
  const page = historyPage(records, "/portal/orders", cursor);
  return (
    <PortalOrdersView
      model={toPortalOrdersViewProps({ customerName: customer.customerName, breweryName: customer.breweryName, orders: page.rows })}
      pagination={page.pagination}
      linkRows
    />
  );
}

// app/(portal)/portal/orders/page.tsx — Order history (screen record): the
// caller's orders (portal_orders), newest first, each opening Order detail.
// No cancel: the portal is read-only after submit, and the page says whom
// to call.
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
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

export default async function PortalOrdersPage() {
  const customer = await getActiveCustomer();
  const orders = (await runCommand("portal_orders", {}, await buildContext(customer.breweryId))) as Order[];
  return (
    <PortalOrdersView
      model={toPortalOrdersViewProps({ customerName: customer.customerName, orders })}
      linkRows
    />
  );
}

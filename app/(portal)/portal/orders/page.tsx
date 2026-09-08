// app/(portal)/portal/orders/page.tsx — Order history (screen record): the
// caller's orders (portal_orders), newest first, each opening Order detail.
// No cancel: the portal is read-only after submit, and the page says whom
// to call.
import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import "@/lib/commands/all";

type Order = { id: string; order_no: number | null; status: string; requested_ship_date: string | null };
const STATUS: Record<string, string> = { draft: "draft", submitted: "placed", confirmed: "confirmed", picked: "being picked", shipped: "shipped", cancelled: "cancelled" };

export default async function PortalOrdersPage() {
  const customer = await getActiveCustomer();
  const orders = (await runCommand("portal_orders", {}, await buildContext(customer.breweryId))) as Order[];
  return (
    <>
      {E.hd("Orders", customer.customerName)}
      {orders.length === 0 ? E.blank("No orders yet. Start one from Order.") : orders.map((o) => (
        <div key={o.id}>{E.row(docNo("ORD", o.order_no, "Order"), `${STATUS[o.status] ?? o.status}${o.requested_ship_date ? ` · ships ${o.requested_ship_date}` : ""}`, E.act("Open", "primary", `/portal/orders/${o.id}`))}</div>
      ))}
      {E.info("Need a change? Call the brewery. Orders can’t be edited here after they’re placed.")}
    </>
  );
}

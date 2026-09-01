// app/(portal)/portal/orders/page.tsx — the caller's orders (portal_orders),
// newest first, with a status chip. Mirrors app/(app)/orders/page.tsx's list
// styling minus the staff-only filter bar and create-order dialog (the
// portal creates orders from the Shop cart, not this page).
import Link from "next/link";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
type Order = {
  id: string;
  order_no: number | null;
  status: OrderStatus;
  requested_ship_date: string | null;
  needs_restock: boolean;
};

export default async function PortalOrdersPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const orders = (await runCommand("portal_orders", {}, ctx)) as Order[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Orders</h1>
      {orders.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">Order #</th>
              <th className="py-1 font-normal">Status</th>
              <th className="py-1 font-normal">Requested date</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="py-1">
                  <Link href={`/portal/orders/${o.id}`} className="underline underline-offset-2">
                    {o.order_no ?? o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-1">{o.status}</td>
                <td className="py-1">{o.requested_ship_date ?? "—"}</td>
                <td className="py-1 text-right">
                  {o.needs_restock && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      staged — needs restocking
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      )}
    </div>
  );
}

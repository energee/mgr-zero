// app/(app)/orders/page.tsx — orders list. Reads through the command registry
// (list_orders, list_customers, list_locations, list_skus) with a
// brewery-scoped Ctx; the customer→ship-to lookup for the create-order form is
// pre-loaded here (one get_customer per customer) so the dialog needs no
// client-side query round trip. Status filter via `?status=`. Failures throw
// to the (app) error boundary.
import Link from "next/link";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { OrderForm, type CustomerOption, type LocationOption, type SkuOption } from "./order-form";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
type Order = {
  id: string;
  order_no: number | null;
  status: OrderStatus;
  requested_ship_date: string | null;
  needs_restock: boolean;
  customers: { name: string } | null;
};
type CustomerRow = { id: string; name: string };
type ShipTo = { id: string; label: string };
type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type SkuRow = { id: string; name: string; products: { name: string } | null };

const STATUSES: OrderStatus[] = ["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);

  const [orders, customerRows, locationRows, skuRows] = (await Promise.all([
    runCommand("list_orders", status ? { status } : {}, ctx),
    runCommand("list_customers", {}, ctx),
    runCommand("list_locations", {}, ctx),
    runCommand("list_skus", {}, ctx),
  ])) as [Order[], CustomerRow[], LocationRow[], SkuRow[]];

  const shipTosByCustomer = await Promise.all(
    customerRows.map((c) =>
      runCommand("get_customer", { customerId: c.id }, ctx) as Promise<{ shipTos: ShipTo[] }>
    )
  );
  const customers: CustomerOption[] = customerRows.map((c, i) => ({
    id: c.id,
    name: c.name,
    shipTos: shipTosByCustomer[i].shipTos.map((s) => ({ id: s.id, label: s.label })),
  }));
  const locations: LocationOption[] = locationRows.map((l) => ({ id: l.id, name: l.name, kind: l.kind }));
  const skus: SkuOption[] = skuRows.map((s) => ({ id: s.id, label: s.products ? `${s.products.name} — ${s.name}` : s.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Orders</h1>
        <OrderForm customers={customers} locations={locations} skus={skus} />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Link href="/orders" className={!status ? "font-medium underline underline-offset-2" : "text-muted-foreground"}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/orders?status=${s}`}
            className={status === s ? "font-medium underline underline-offset-2" : "text-muted-foreground"}
          >
            {s}
          </Link>
        ))}
      </div>

      {orders.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">Order #</th>
              <th className="py-1 font-normal">Customer</th>
              <th className="py-1 font-normal">Status</th>
              <th className="py-1 font-normal">Requested date</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="py-1">
                  <Link href={`/orders/${o.id}`} className="underline underline-offset-2">
                    {o.order_no ?? o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="py-1">{o.customers?.name ?? "—"}</td>
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

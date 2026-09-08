// app/(app)/orders/page.tsx — Orders (screen record): the Work list with the
// Orders chip active. Every row names the order's next valid action; a state
// chip filters by `?status=`. New order opens order-form.tsx; the
// customer→ship-to lookup it needs is pre-loaded here (one get_customer per
// customer) so the sheet needs no client-side round trip.
import { E } from "@/components/mgr/e";
import { LinkTabs, WORK_CHIPS } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import { nextAction, type OrderStatus } from "@/lib/mgr/order-status";
import "@/lib/commands/all";
import { OrderForm, type CustomerOption, type LocationOption, type SkuOption } from "./order-form";

type Order = { id: string; order_no: number | null; status: OrderStatus; requested_ship_date: string | null; needs_restock: boolean; customers: { name: string } | null };
type CustomerRow = { id: string; name: string };
type ShipTo = { id: string; label: string; is_default: boolean };
type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type SkuRow = { id: string; name: string; brands: { name: string } | null };

const STATUSES: OrderStatus[] = ["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; customerId?: string }> }) {
  const { status, customerId } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [orders, customerRows, locationRows, skuRows] = (await Promise.all([
    runCommand("list_orders", { status, customerId }, ctx), runCommand("list_customers", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_skus", {}, ctx),
  ])) as [Order[], CustomerRow[], LocationRow[], SkuRow[]];
  const shipTosByCustomer = await Promise.all(customerRows.map((c) => runCommand("get_customer", { customerId: c.id }, ctx) as Promise<{ shipTos: ShipTo[] }>));
  const customers: CustomerOption[] = customerRows.map((c, i) => ({ id: c.id, name: c.name, shipTos: shipTosByCustomer[i].shipTos.map((s) => ({ id: s.id, label: s.label, is_default: s.is_default })) }));
  const locations: LocationOption[] = locationRows.map((l) => ({ id: l.id, name: l.name, kind: l.kind }));
  const skus: SkuOption[] = skuRows.map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }));
  const orderHref = (nextStatus?: string) => {
    const query = new URLSearchParams();
    if (customerId) query.set("customerId", customerId);
    if (nextStatus) query.set("status", nextStatus);
    return `/orders${query.size ? `?${query}` : ""}`;
  };
  return (
    <>
      {E.hd("Work", `${brewery.role} default`, canWrite ? <OrderForm customers={customers} locations={locations} skus={skus} /> : undefined)}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <LinkTabs items={WORK_CHIPS} current="orders" className="w-full md:w-fit" />
        <LinkTabs items={[["all", orderHref()], ...STATUSES.map((s): [string, string] => [s, orderHref(s)])]} current={status ?? "all"} className="w-full justify-start overflow-x-auto md:w-fit" />
      </div>
      {customerId && E.row("Customer filter", customerRows.find((c) => c.id === customerId)?.name ?? "Customer", E.act("Clear", undefined, status ? `/orders?status=${status}` : "/orders"))}
      {orders.length === 0
        ? E.blank(status ? `No ${status} orders` : "No orders yet")
        : orders.map((o) => {
            const { verb, tone, href } = nextAction(o.status, o.needs_restock, o.id);
            return (
              <div key={o.id}>
                {E.row(`${docNo("ORD", o.order_no, "Order")} · ${o.customers?.name ?? "transfer"}`,
                  `${o.status}${o.requested_ship_date ? ` · ships ${o.requested_ship_date}` : ""}${o.needs_restock ? " · restock staged" : ""}`,
                  E.act(verb, tone, href), o.needs_restock ? "w" : "")}
              </div>
            );
          })}
    </>
  );
}

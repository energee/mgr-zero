// app/(app)/orders/page.tsx — Orders (screen record): the Work list with the
// Orders chip active. Every row names the order's next valid action; a state
// chip filters by `?status=`. New order opens order-form.tsx; the
// customer→ship-to lookup it needs is pre-loaded here (one get_customer per
// customer) so the sheet needs no client-side round trip.
import { E } from "@/components/mgr/e";
import { LinkTabs, WORK_CHIPS } from "@/components/mgr/work-tabs";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toOrdersListViewProps } from "@/lib/mgr/orders-list-view";
import { type OrderStatus } from "@/lib/mgr/order-status";
import "@/lib/commands/all";
import { OrderForm, type CustomerOption, type LocationOption, type SkuOption } from "./order-form";

type Order = { id: string; order_no: number | null; status: OrderStatus; requested_ship_date: string | null; needs_restock: boolean; customers: { name: string } | null };
type CustomerRow = { id: string; name: string };
type ShipTo = { id: string; label: string; is_default: boolean };
type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type SkuRow = { active: boolean; id: string; name: string; brands: { name: string } | null };

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
  const skus: SkuOption[] = skuRows.filter((s) => s.active).map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }));
  const orderHref = (nextStatus?: string) => {
    const query = new URLSearchParams();
    if (customerId) query.set("customerId", customerId);
    if (nextStatus) query.set("status", nextStatus);
    return `/orders${query.size ? `?${query}` : ""}`;
  };
  return (
    <OrdersView
      model={toOrdersListViewProps({ role: brewery.role, status, orders })}
      createAction={canWrite ? <OrderForm customers={customers} locations={locations} skus={skus} /> : undefined}
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

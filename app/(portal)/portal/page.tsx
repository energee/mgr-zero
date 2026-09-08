import { reconcilePortalOrder, type PortalSavedOrder } from "@/lib/portal-cart";
import { orNotFound } from "@/lib/mgr/not-found";
import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { Cart, type CatalogItem, type ShipToOption } from "./cart";

type ShipToRow = { id: string; label: string; city: string; state: string; is_default: boolean };

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ draft?: string; reorder?: string }> }) {
  const query = await searchParams;
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const [items, account] = await Promise.all([
    runCommand("portal_catalog", {}, ctx) as Promise<CatalogItem[]>,
    runCommand("get_portal_account", {}, ctx) as Promise<{ shipTos: ShipToRow[]; membership: { userId: string } }>,
  ]);
  const shipToOptions: ShipToOption[] = account.shipTos.map((s) => ({ id: s.id, is_default: s.is_default, label: `${s.label} (${s.city}, ${s.state})` }));
  const sourceId = query.draft ?? query.reorder;
  const saved = sourceId ? await orNotFound(runCommand("portal_order", { orderId: sourceId }, ctx) as Promise<PortalSavedOrder>) : null;
  if (saved && query.draft && saved.order.status !== "draft") return <>{E.hd("Order is no longer a draft")}{E.btn("View order status", "g", `/portal/orders/${saved.order.id}`)}</>;
  const initial = saved ? reconcilePortalOrder(saved, items, shipToOptions, !query.draft) : undefined;
  return (
    <>
      {E.hd("Order", customer.customerName)}
      <Cart key={`${account.membership.userId}:${customer.customerId}:${customer.breweryId}:${sourceId ?? "new"}`} items={items} shipTos={shipToOptions} initial={initial} scope={{ actorId: account.membership.userId, customerId: customer.customerId, breweryId: customer.breweryId }} />
    </>
  );
}

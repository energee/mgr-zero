import { reconcilePortalOrder, type PortalSavedOrder } from "@/lib/portal-cart";
import { orNotFound } from "@/lib/mgr/not-found";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { Cart, type CatalogItem, type ShipToOption } from "./cart";
import { shipToAddress } from "@/lib/mgr/ship-to-view";

type ShipToRow = { id: string; label: string; country: string; city: string | null; state: string | null; is_default: boolean };

/** "Main (Phoenixville, PA)"; a ship-to with no city or state shows its country, or just its label. */
const shipToOptionLabel = (s: ShipToRow) => { const place = shipToAddress(s); return place ? `${s.label} (${place})` : s.label; };

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ draft?: string; reorder?: string }> }) {
  const query = await searchParams;
  const { customer, ctx } = await getPortalContext();
  const [items, account] = await Promise.all([
    runCommand("portal_catalog", {}, ctx) as Promise<CatalogItem[]>,
    runCommand("get_portal_account", {}, ctx) as Promise<{ shipTos: ShipToRow[]; membership: { userId: string }; fulfillmentSource: { id: string; name: string } | null }>,
  ]);
  const shipToOptions: ShipToOption[] = account.shipTos.map((s) => ({ id: s.id, is_default: s.is_default, country: s.country, label: shipToOptionLabel(s) }));
  const sourceId = query.draft ?? query.reorder;
  const saved = sourceId ? await orNotFound(runCommand("portal_order", { orderId: sourceId }, ctx) as Promise<PortalSavedOrder>) : null;
  if (saved && query.draft && saved.order.status !== "draft") redirect(`/portal/orders/${saved.order.id}`);
  const initial = saved ? reconcilePortalOrder(saved, items, shipToOptions, !query.draft) : undefined;
  return (
    <Cart customerName={customer.customerName} key={`${account.membership.userId}:${customer.customerId}:${customer.breweryId}:${sourceId ?? "new"}`} items={items} fulfillmentSource={account.fulfillmentSource} shipTos={shipToOptions} initial={initial} scope={{ actorId: account.membership.userId, customerId: customer.customerId, breweryId: customer.breweryId }} />
  );
}

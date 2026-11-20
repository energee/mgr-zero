import { reconcilePortalOrder, type PortalSavedOrder } from "@/lib/portal-cart";
import { orNotFound } from "@/lib/mgr/not-found";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { Cart, type CatalogItem, type ShipToOption } from "./cart";
import type { PortalBrand } from "@/lib/mgr/brand-reference-view";
import type { ShopSnapshot } from "@/lib/mgr/shop-view";
import { shipToPlace } from "@/lib/mgr/ship-to-view";
import { cache } from "react";

const getSavedOrder = cache(async function getSavedOrder(id: string) {
  const { ctx } = await getPortalContext();
  return orNotFound(runCommand("portal_order", { orderId: id }, ctx) as Promise<PortalSavedOrder>);
});

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ draft?: string; reorder?: string }> }) {
  const query = await searchParams;
  const sourceId = query.draft ?? query.reorder;
  if (sourceId) await getSavedOrder(sourceId);
  return {};
}

type ShipToRow = { id: string; label: string; country: string; city: string | null; state: string | null; is_default: boolean };

/** "Main (Phoenixville, PA)"; a ship-to with no city or state shows its country, or just its label. */
const shipToOptionLabel = (s: ShipToRow) => { const place = shipToPlace(s); return place ? `${s.label} (${place})` : s.label; };

/** Order, and (with `section`, from pre-order/page.tsx) Pre-order: one loader and one cart, two lists. */
export default async function ShopPage({ searchParams, section }: { searchParams: Promise<{ draft?: string; reorder?: string; suggested?: string }>; section?: "pre-order" }) {
  const query = await searchParams;
  const { customer, ctx } = await getPortalContext();
  const [items, account, brands, planned, share, suggested] = await Promise.all([
    runCommand("portal_catalog", {}, ctx) as Promise<CatalogItem[]>,
    runCommand("get_portal_account", {}, ctx) as Promise<{ shipTos: ShipToRow[]; membership: { userId: string }; fulfillmentSource: { id: string; name: string } | null; palletRules: ShopSnapshot["palletRules"] }>,
    runCommand("portal_brands", {}, ctx) as Promise<PortalBrand[]>,
    runCommand("portal_schedule", {}, ctx) as Promise<NonNullable<ShopSnapshot["planned"]>>,
    runCommand("portal_release_share", {}, ctx) as Promise<ShopSnapshot["share"]>,
    runCommand("portal_suggested_order", {}, ctx) as Promise<NonNullable<ShopSnapshot["suggested"]>>,
  ]);
  const shipToOptions: ShipToOption[] = account.shipTos.map((s) => ({ id: s.id, is_default: s.is_default, country: s.country, label: shipToOptionLabel(s) }));
  const sourceId = query.draft ?? query.reorder;
  const saved = sourceId ? await getSavedOrder(sourceId) : null;
  if (saved && query.draft && saved.order.status !== "draft") redirect(`/portal/orders/${saved.order.id}`);
  const initial = saved ? reconcilePortalOrder(saved, items, shipToOptions, !query.draft) : undefined;
  return (
    <Cart key={`${account.membership.userId}:${customer.customerId}:${customer.breweryId}:${sourceId ?? "new"}`} items={items} brands={brands} planned={planned} section={section} share={share} suggested={suggested} palletRules={account.palletRules} autoSuggest={section === "pre-order" && query.suggested === "1"} fulfillmentSource={account.fulfillmentSource} shipTos={shipToOptions} initial={initial} scope={{ actorId: account.membership.userId, customerId: customer.customerId, breweryId: customer.breweryId }} />
  );
}

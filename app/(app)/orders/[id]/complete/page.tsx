import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { getOrderPageData, getOrderShipSources } from "../../order-data";
import { ShipForm, type ShippingSnapshot } from "../ship-form";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

const getCompletePageData = cache(async function getCompletePageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "ship_order");
  const [{ snapshot }, available] = await Promise.all([getOrderPageData(id), getOrderShipSources(id)]);
  return { ctx, snapshot, available };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCompletePageData(id);
  return { title: navTitle("/orders") };
}

export default async function CompleteTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, snapshot, available } = await getCompletePageData(id);
  const { order, lines } = snapshot as { order: ShippingSnapshot["order"] & { status: string }; lines: ShippingSnapshot["lines"] };
  const locations = await runPageQuery("list_locations", {}, ctx) as ShippingSnapshot["locations"];
  if (order.kind !== "taproom_transfer" || order.status !== "picked") redirect(`/orders/${order.id}`);
  return <ShipForm snapshot={{ order, lines, locations, backHref: `/orders/${order.id}` }} available={available} />;
}

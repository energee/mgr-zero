import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ShipSources } from "@/lib/commands/orders";
import { ShipForm, type ShippingSnapshot } from "../ship-form";
import "@/lib/commands/all";

export default async function CompleteTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "ship_order");
  const [{ order, lines }, locations, available] = await Promise.all([
    orNotFound(runPageQuery("get_order", { orderId: id }, ctx)) as Promise<{ order: ShippingSnapshot["order"] & { status: string }; lines: ShippingSnapshot["lines"] }>,
    runPageQuery("list_locations", {}, ctx) as Promise<ShippingSnapshot["locations"]>,
    orNotFound(runPageQuery("get_order_ship_sources", { orderId: id }, ctx)) as Promise<ShipSources>,
  ]);
  if (order.kind !== "taproom_transfer" || order.status !== "picked") redirect(`/orders/${order.id}`);
  return <ShipForm snapshot={{ order, lines, locations, backHref: `/orders/${order.id}` }} available={available} />;
}

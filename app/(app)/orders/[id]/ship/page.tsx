import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { getOrderPageData, getOrderShipSources } from "../../order-data";
import { ShipForm, type ShippingSnapshot } from "../ship-form";
import { ShipmentDoneView } from "@/components/mgr/views/shipment-done";
import { toShipmentDoneViewProps } from "@/lib/mgr/shipment-done-view";
import type { KegShortage } from "@/lib/mgr/keg-fleet-view";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

type Snapshot = { order: ShippingSnapshot["order"] & { status: string }; lines: ShippingSnapshot["lines"]; events: { event: string; payload: { invoice_id?: string | null; warnings?: KegShortage[] } }[]; shipment: { id: string; invoice_timing: "now" | "on_delivery"; deliveries: unknown[] } | null };

const getShipPageData = cache(async function getShipPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "ship_order");
  const { snapshot } = await getOrderPageData(id);
  return { ctx, snapshot: snapshot as Snapshot };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { snapshot: { order, shipment } } = await getShipPageData(id);
  if (order.kind !== "wholesale") redirect(`/orders/${order.id}`);
  if (!(order.status === "shipped" && shipment)) {
    if (order.status !== "picked") redirect(`/orders/${order.id}`);
    await getOrderShipSources(id);
  }
  return { title: navTitle("/orders") };
}

export default async function ShipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, snapshot } = await getShipPageData(id);
  const { order, lines, events, shipment } = snapshot;
  const locations = await runPageQuery("list_locations", {}, ctx) as ShippingSnapshot["locations"];
  if (order.kind !== "wholesale") redirect(`/orders/${order.id}`);
  if (order.status === "shipped" && shipment) {
    const shipped = events.find(event => event.event === "shipped")?.payload;
    const invoiceId = shipped?.invoice_id;
    const detail = invoiceId ? await runPageQuery("get_invoice", { invoiceId }, ctx) as { invoice: { invoice_no: number | null } } : null;
    // A delivery order on no route yet offers Add to route; a pickup never goes on one.
    const routeHref = !order.pickup && shipment.deliveries.length === 0 ? `/routes/new?add=${shipment.id}` : undefined;
    return <ShipmentDoneView model={toShipmentDoneViewProps({ order, lines, warnings: shipped?.warnings, invoice: detail?.invoice ?? null, invoiceTiming: shipment.invoice_timing, invoiceHref: invoiceId ? `/invoices/${invoiceId}` : undefined, routeHref, backHref: `/orders/${order.id}` })} />;
  }
  if (order.status !== "picked") redirect(`/orders/${order.id}`);
  const available = await getOrderShipSources(id);
  return <ShipForm snapshot={{ order, lines, locations, backHref: `/orders/${order.id}` }} available={available} />;
}

import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ShipSources } from "@/lib/commands/orders";
import { ShipForm, type ShippingSnapshot } from "../ship-form";
import { ShipmentDoneView } from "@/components/mgr/views/shipment-done";
import { toShipmentDoneViewProps } from "@/lib/mgr/shipment-done-view";
import "@/lib/commands/all";

export default async function ShipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "ship_order");
  const [{ order, lines, events, shipment }, locations] = await Promise.all([
    orNotFound(runPageQuery("get_order", { orderId: id }, ctx)) as Promise<{ order: ShippingSnapshot["order"] & { status: string }; lines: ShippingSnapshot["lines"]; events: { event: string; payload: { invoice_id?: string | null } }[]; shipment: { invoice_timing: "now" | "on_delivery" } | null }>,
    runPageQuery("list_locations", {}, ctx) as Promise<ShippingSnapshot["locations"]>,
  ]);
  if (order.kind !== "wholesale") redirect(`/orders/${order.id}`);
  if (order.status === "shipped" && shipment) {
    const invoiceId = events.find(event => event.event === "shipped")?.payload.invoice_id;
    const detail = invoiceId ? await runPageQuery("get_invoice", { invoiceId }, ctx) as { invoice: { invoice_no: number | null } } : null;
    return <ShipmentDoneView model={toShipmentDoneViewProps({ order, lines, invoice: detail?.invoice ?? null, invoiceTiming: shipment.invoice_timing, invoiceHref: invoiceId ? `/invoices/${invoiceId}` : undefined, backHref: `/orders/${order.id}` })} />;
  }
  if (order.status !== "picked") redirect(`/orders/${order.id}`);
  const available = await orNotFound(runPageQuery("get_order_ship_sources", { orderId: id }, ctx)) as ShipSources;
  return <ShipForm snapshot={{ order, lines, locations, backHref: `/orders/${order.id}` }} available={available} />;
}

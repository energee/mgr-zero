// app/(app)/work/deliveries/[id]/page.tsx — Confirm delivery: one stop, its
// shipped lines and invoice timing (or, for a transfer stop, the destination
// and picked lines), a receiving name, and the Delivered commit
// (delivered-form.tsx → confirm_delivery), drawn to the Confirm delivery
// screen record. Today's delivery_next row and the route's Resume land here.
import { E } from "@/components/mgr/e";
import { ConfirmDeliveryView } from "@/components/mgr/views/confirm-delivery";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toConfirmDeliveryViewProps } from "@/lib/mgr/confirm-delivery-view";
import "@/lib/commands/all";
import { docNo } from "@/lib/mgr/doc-no";
import { orNotFound } from "@/lib/mgr/not-found";
import { DeliveredForm } from "./delivered-form";

type Stop = {
  delivery: {
    id: string; stop_no: number; delivered_at: string | null; signed_by: string | null;
    routes: { id: string; name: string | null; delivery_date: string; driver_user_id: string | null; departed_at: string | null } | null;
    shipments: { invoice_timing: "now" | "on_delivery"; orders: { order_no: number | null; customers: { name: string } | null; ship_tos: { label: string; city: string; state: string } | null } } | null;
    stock_transfers: { transfer_no: number | null; to_location: { name: string } | null } | null;
  };
  lines: { id: string; name: string; qty: number }[];
  invoice: { id: string; invoice_no: number | null } | null;
};

export default async function DeliveryStopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { delivery, lines, invoice } = await orNotFound(runCommand("get_delivery_stop", { deliveryId: id }, ctx) as Promise<Stop>);
  const order = delivery.shipments?.orders;
  const transfer = delivery.stock_transfers;
  const timing = transfer ? "None · stock transfer" : delivery.shipments?.invoice_timing === "on_delivery" ? "On delivery · saved" : "At ship";
  const heading = transfer
    ? `${docNo("TRF", transfer.transfer_no, "Transfer")} · ${transfer.to_location?.name ?? "destination"}`
    : (order?.customers?.name ?? "Customer");
  return (
    <ConfirmDeliveryView
      model={toConfirmDeliveryViewProps({
        backTo: delivery.routes?.name ?? "Route",
        backHref: delivery.routes ? `/routes/${delivery.routes.id}` : "/routes",
        title: `${delivery.routes?.name ?? "Route"} · Stop ${delivery.stop_no}`,
        heading,
        shipTo: order?.ship_tos ? `${order.ship_tos.label} · ${order.ship_tos.city}, ${order.ship_tos.state}` : undefined,
        invoiceTiming: timing,
        lines: lines.map((l) => ({ key: l.id, title: l.name, qty: String(l.qty) })),
      })}
      action={deliveryAction(delivery, ctx, invoice, transfer)}
    />
  );
}

function deliveryAction(
  delivery: Stop["delivery"],
  ctx: { role: string; userId: string },
  invoice: Stop["invoice"],
  transfer: Stop["delivery"]["stock_transfers"],
) {
  if (delivery.delivered_at) {
    return (
      <>
        {E.fld("Received by", delivery.signed_by ?? "")}
        {E.status(transfer ? "Delivered · receive the transfer to move the stock" : docNo("INV", invoice?.invoice_no ?? null, "Delivered"), "ok")}
      </>
    );
  }
  if (!delivery.routes?.departed_at) return E.status("The route has not departed", "w");
  if (ctx.role !== "admin" && delivery.routes.driver_user_id !== ctx.userId) {
    return E.status("Only the route's assigned driver or an admin may confirm this stop", "w");
  }
  return (
    <>
      {E.sp()}
      <DeliveredForm deliveryId={delivery.id} suggestions={[]} />
    </>
  );
}

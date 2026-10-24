// app/(app)/work/deliveries/[id]/page.tsx — Confirm delivery: one stop, its
// shipped lines and invoice timing (or, for a transfer stop, the destination
// and picked lines). The shared surface confirms delivery/refusal or leaves an
// unattempted stop for later through delivered-form.tsx's command adapter.
// Today's delivery_next row and the route's Resume land here.
import { E } from "@/components/mgr/e";
import { ConfirmDeliveryView } from "@/components/mgr/views/confirm-delivery";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { docNo } from "@/lib/mgr/doc-no";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ShipToSnapshot } from "@/lib/mgr/ship-to-view";
import { DeliveredForm } from "./delivered-form";
import { navTitle } from "@/lib/mgr/nav";
import { cache } from "react";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getDeliveryData(id);
  return { title: navTitle("/work/deliveries") };
}

type Stop = {
  delivery: {
    id: string; stop_no: number; delivered_at: string | null; signed_by: string | null; outcome: string | null;
    routes: { id: string; name: string | null; delivery_date: string; driver_user_id: string | null; departed_at: string | null } | null;
    shipments: { invoice_timing: "now" | "on_delivery"; orders: { order_no: number | null; customers: { name: string } | null; ship_tos: ShipToSnapshot | null } } | null;
    stock_transfers: { transfer_no: number | null; to_location: { name: string } | null } | null;
  };
  lines: { id: string; name: string; qty: number; refused?: number }[];
  invoice: { id: string; invoice_no: number | null } | null;
};
const getDeliveryData = cache(async function getDeliveryData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const stop = await orNotFound(runCommand("get_delivery_stop", { deliveryId: id }, ctx) as Promise<Stop>);
  return { ctx, stop };
});


export default async function DeliveryStopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, stop: { delivery, lines, invoice } } = await getDeliveryData(id);
  const order = delivery.shipments?.orders;
  const transfer = delivery.stock_transfers;
  const timing = transfer ? "None · stock transfer" : delivery.shipments?.invoice_timing === "on_delivery" ? "On delivery · saved" : "At ship";
  const heading = transfer
    ? `${docNo("TRF", transfer.transfer_no, "Transfer")} · ${transfer.to_location?.name ?? "destination"}`
    : (order?.customers?.name ?? "Customer");
  return (
    <ConfirmDeliveryView
      model={{
        backTo: delivery.routes?.name ?? "Route",
        backHref: delivery.routes ? `/routes/${delivery.routes.id}` : "/routes",
        title: `${delivery.routes?.name ?? "Route"} · Stop ${delivery.stop_no}`,
        heading,
        shipTo: transfer ? undefined : order?.ship_tos ?? null,
        invoiceTiming: timing,
        lines: lines.map((l) => {
          const refused = transfer && delivery.outcome === "refused" ? l.qty : (l.refused ?? 0);
          return { key: l.id, title: l.name, qty: delivery.delivered_at ? `${l.qty - refused} accepted · ${refused} refused` : String(l.qty) };
        }),
      }}
      action={deliveryAction(delivery, ctx, invoice, transfer, lines)}
    />
  );
}

function deliveryAction(
  delivery: Stop["delivery"],
  ctx: { roles: readonly string[]; userId: string },
  invoice: Stop["invoice"],
  transfer: Stop["delivery"]["stock_transfers"],
  lines: Stop["lines"],
) {
  if (delivery.delivered_at) {
    return (
      <>
        {E.fld("Received by", delivery.signed_by ?? "")}
        {E.fld("Outcome", delivery.outcome ?? "Delivered")}
        {delivery.outcome && delivery.outcome !== "delivered" && !transfer && E.btn("Check in refused beer", "p", `/work/deliveries/${delivery.id}/return`)}
        {E.status(transfer ? "Transfer remains in transit until received or cancelled" : docNo("INV", invoice?.invoice_no ?? null, "Delivered"), "ok")}
      </>
    );
  }
  if (!delivery.routes?.departed_at) return E.status("The route has not departed", "w");
  if (!ctx.roles.includes("admin") && delivery.routes.driver_user_id !== ctx.userId) {
    return E.status("Only the route's assigned driver or an admin may confirm this stop", "w");
  }
  return (
    <>
      {E.sp()}
      <DeliveredForm routeId={delivery.routes.id} deliveryId={delivery.id} transfer={Boolean(transfer)} lines={lines.map((l) => ({ key: l.id, title: l.name, qty: String(l.qty) }))} />
    </>
  );
}

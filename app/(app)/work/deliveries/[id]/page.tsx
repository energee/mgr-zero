// app/(app)/work/deliveries/[id]/page.tsx — Confirm delivery: one stop, its
// shipped lines and invoice timing, a receiving name, and the Delivered
// commit (delivered-form.tsx → confirm_delivery), drawn to the Confirm
// delivery screen record. Today's delivery_next row lands here.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { docNo } from "@/lib/mgr/doc-no";
import { orNotFound } from "@/lib/mgr/not-found";
import { DeliveredForm } from "./delivered-form";

type Stop = {
  delivery: {
    id: string; stop_no: number; delivered_at: string | null; signed_by: string | null;
    routes: { name: string | null; delivery_date: string } | null;
    shipments: { invoice_timing: "now" | "on_delivery"; orders: { order_no: number | null; customers: { name: string } | null; ship_tos: { label: string; city: string; state: string } | null } } | null;
  };
  lines: { id: string; qty_shipped: number; skus: { name: string } | null }[];
  invoice: { id: string; invoice_no: number | null } | null;
};

export default async function DeliveryStopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { delivery, lines, invoice } = await orNotFound(runCommand("get_delivery_stop", { deliveryId: id }, ctx) as Promise<Stop>);
  const order = delivery.shipments?.orders;
  const timing = delivery.shipments?.invoice_timing === "on_delivery" ? "On delivery · saved" : "At ship";
  return (
    <>
      {E.back(delivery.routes?.name ?? "Route", `${delivery.routes?.name ?? "Route"} · Stop ${delivery.stop_no}`, undefined, "/")}
      {E.ttl(order?.customers?.name ?? "Customer")}
      {E.fld("Ship to", order?.ship_tos ? `${order.ship_tos.label} · ${order.ship_tos.city}, ${order.ship_tos.state}` : "")}
      {E.fld("Invoice timing", timing)}
      {lines.map((l) => <div key={l.id}>{E.row(l.skus?.name ?? "Line", "", String(Number(l.qty_shipped)))}</div>)}
      {delivery.delivered_at ? (
        <>
          {E.fld("Received by", delivery.signed_by ?? "")}
          {E.status(docNo("INV", invoice?.invoice_no ?? null, "Delivered"), "ok")}
        </>
      ) : (
        <>
          {E.sp()}
          <DeliveredForm deliveryId={delivery.id} suggestions={[]} />
        </>
      )}
    </>
  );
}

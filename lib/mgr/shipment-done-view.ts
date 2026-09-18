// lib/mgr/shipment-done-view.ts — view-model for Shipment done (post-commit).
import { docNo } from "./doc-no";
import { saleVolume } from "@/lib/volume";

export type ShipmentDoneViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  invoice: string;
  invoiceHref?: string;
  tape: [string, string][];
  info: string;
};

export type ShipmentDoneSnapshot = {
  backHref?: string;
  invoiceHref?: string;
  invoiceTiming?: "now" | "on_delivery";
  order: {
    id: string;
    order_no: number | null;
    ship_tos?: { state: string } | null;
  };
  invoice: { invoice_no: number | null } | null;
  lines: {
    id: string;
    qty_shipped: number | null;
    bbl_per_unit?: number;
    skus: { name: string } | null;
  }[];
};

/** Map get_order + get_invoice onto ShipmentDoneView. */
export function toShipmentDoneViewProps({ order, invoice, lines, backHref, invoiceHref, invoiceTiming }: ShipmentDoneSnapshot): ShipmentDoneViewModel {
  const dest = order.ship_tos?.state ?? "";
  const inv = docNo("INV", invoice?.invoice_no ?? null, "Invoice");
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = Number(l.qty_shipped ?? 0);
    if (qty <= 0) continue;
    const name = l.skus?.name ?? "Line";
    tape.push([`−${qty} ${name} · sale removal · ${dest}`, saleVolume(qty, l.bbl_per_unit)]);
  }
  if (invoice) tape.push([inv, "invoiced now"]);
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: "Shipped",
    invoice: invoice ? `${inv} · assigned` : invoiceTiming === "on_delivery" ? "Deferred to delivery" : "No invoice was created",
    invoiceHref: invoice ? invoiceHref : undefined,
    tape,
    info: "To correct this shipment, Return shipment.",
  };
}

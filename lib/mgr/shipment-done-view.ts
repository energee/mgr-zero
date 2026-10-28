// lib/mgr/shipment-done-view.ts — view-model for Shipment done (post-commit).
import { docNo } from "./doc-no";
import { kegShortageText, type KegShortage } from "./keg-fleet-view";
import { saleVolume } from "@/lib/volume";

export type ShipmentDoneViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  invoice: string;
  invoiceHref?: string;
  /** The invoice's Return page, where this shipment is corrected; live pages only. */
  returnHref?: string;
  tape: [string, string][];
  /** Where the correction starts: Return shipment on the invoice, or, deferred, the invoice delivery raises. */
  info: string;
  warnings: string[];
};

export type ShipmentDoneSnapshot = {
  /** Saved shell shortages from the shipped order event; legacy receipts have none. */
  warnings?: KegShortage[];
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
    /** The shortage reason saved on the line (#624), named on its tape row. */
    short_reason?: string | null;
    skus: { name: string } | null;
  }[];
};

/** Map get_order + get_invoice onto ShipmentDoneView. */
export function toShipmentDoneViewProps({ order, invoice, lines, backHref, invoiceHref, invoiceTiming, warnings }: ShipmentDoneSnapshot): ShipmentDoneViewModel {
  const dest = order.ship_tos?.state ?? "";
  const inv = docNo("INV", invoice?.invoice_no ?? null, "Invoice");
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = Number(l.qty_shipped ?? 0);
    if (qty <= 0) continue;
    const name = l.skus?.name ?? "Line";
    const short = l.short_reason ? ` · short: ${l.short_reason}` : "";
    tape.push([`−${qty} ${name} · removed for sale${dest ? ` · ships to ${dest}` : ""}${short}`, saleVolume(qty, l.bbl_per_unit)]);
  }
  if (invoice) tape.push([inv, "invoiced now"]);
  const href = invoice ? invoiceHref : undefined;
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: "Shipped",
    invoice: invoice ? `${inv} · assigned` : invoiceTiming === "on_delivery" ? "Deferred to delivery" : "No invoice was created",
    invoiceHref: href,
    returnHref: href && `${href}/return`,
    tape,
    info: invoice ? "To correct this shipment, use Return shipment."
      : invoiceTiming === "on_delivery" ? "The invoice is raised at delivery. To correct this shipment, open that invoice and select Return."
      : "Return shipment corrects a shipment through its invoice, and this one has none.",
    warnings: (warnings ?? []).map(kegShortageText),
  };
}

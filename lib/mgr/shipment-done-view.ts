// lib/mgr/shipment-done-view.ts — view-model for Shipment done (post-commit).
import { docNo } from "./doc-no";

export type ShipmentDoneViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  invoice: string;
  tape: [string, string][];
  info: string;
};

export type ShipmentDoneSnapshot = {
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

function shortName(name: string, qty: number) {
  if (/hazy/i.test(name)) return "Hazy ½ bbl";
  if (/pils/i.test(name)) return qty === 1 ? "Pils case" : "Pils cases";
  return name;
}

function saleVolume(qty: number, bblPerUnit: number | undefined) {
  return bblPerUnit === undefined ? "" : `${(qty * bblPerUnit).toFixed(2)} bbl`;
}

/** Map get_order + get_invoice onto ShipmentDoneView. */
export function toShipmentDoneViewProps({ order, invoice, lines }: ShipmentDoneSnapshot): ShipmentDoneViewModel {
  const dest = order.ship_tos?.state ?? "";
  const inv = docNo("INV", invoice?.invoice_no ?? null, "Invoice");
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = Number(l.qty_shipped ?? 0);
    if (qty <= 0) continue;
    const name = l.skus?.name ?? "Line";
    tape.push([`−${qty} ${shortName(name, qty)} · sale removal · ${dest}`, saleVolume(qty, l.bbl_per_unit)]);
  }
  tape.push([inv, "invoiced now"]);
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref: `/orders/${order.id}`,
    title: "Shipped",
    invoice: `${inv} · assigned`,
    tape,
    info: "To correct this shipment, Return shipment.",
  };
}

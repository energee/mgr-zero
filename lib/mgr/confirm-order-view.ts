// lib/mgr/confirm-order-view.ts — view-model for the Confirm order review.
import { docNo } from "./doc-no";

export type ConfirmOrderLineView = {
  key: string;
  name: string;
  trailing: string;
  tone?: "" | "w" | "ok";
};

export type ConfirmOrderViewModel = {
  backHref?: string;
  title: string;
  where: string;
  state: string;
  fulfillmentSource?: string;
  lines: ConfirmOrderLineView[];
  oversellNotes: string[];
};

export type ConfirmOrderSnapshot = {
  backHref?: string;
  order: {
    id: string;
    order_no: number | null;
    status: string;
    requested_ship_date: string | null;
    from_location_id: string;
    customers: { name: string } | null;
  };
  lines: { id: string; sku_id: string; qty_ordered: number; skus: { name: string } | null }[];
  atp: { sku_id: string; qty: number }[];
  locations: { id: string; name: string }[];
};

export function toConfirmOrderViewProps({ order, lines, atp, locations, backHref }: ConfirmOrderSnapshot): ConfirmOrderViewModel {
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const ships = order.requested_ship_date ? ` · ships ${order.requested_ship_date}` : "";
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    where: order.customers?.name ?? "Taproom transfer",
    state: `Submitted${ships}`,
    fulfillmentSource: locations.find((l) => l.id === order.from_location_id)?.name ?? "—",
    lines: lines.map((l) => {
      const qtyAtp = atpMap.get(l.sku_id);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        trailing: `${l.qty_ordered}${qtyAtp === undefined ? "" : ` · ATP ${qtyAtp}`}`,
        tone: qtyAtp !== undefined && qtyAtp < 0 ? "w" : "",
      };
    }),
    oversellNotes: lines
      .filter((l) => (atpMap.get(l.sku_id) ?? 0) < 0)
      .map((l) => `ATP for ${l.skus?.name ?? "a line"} is ${atpMap.get(l.sku_id)}. Confirming oversells; that stays your call.`),
  };
}

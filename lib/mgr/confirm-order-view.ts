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
  sourceOnHand?: { sku_id: string; qty: number }[];
  locations: { id: string; name: string }[];
};

export function toConfirmOrderViewProps({ order, lines, atp, sourceOnHand, locations, backHref }: ConfirmOrderSnapshot): ConfirmOrderViewModel {
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const sourceMap = new Map(sourceOnHand?.map((row) => [row.sku_id, Number(row.qty)]));
  const sourceName = locations.find((l) => l.id === order.from_location_id)?.name ?? "source";
  const ships = order.requested_ship_date ? ` · ships ${order.requested_ship_date}` : "";
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    where: order.customers?.name ?? "Taproom transfer",
    state: `Submitted${ships}`,
    fulfillmentSource: sourceName,
    lines: lines.map((l) => {
      const qtyAtp = atpMap.get(l.sku_id);
      const sourceQty = sourceOnHand === undefined ? undefined : sourceMap.get(l.sku_id) ?? 0;
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        trailing: `${l.qty_ordered}${sourceQty === undefined ? "" : ` · ${sourceQty} at ${sourceName}`}${qtyAtp === undefined ? "" : ` · ${sourceQty === undefined ? "ATP" : "brewery ATP"} ${qtyAtp}`}`,
        tone: (sourceQty !== undefined && sourceQty < l.qty_ordered) || (qtyAtp !== undefined && qtyAtp < 0) ? "w" : "",
      };
    }),
    oversellNotes: lines.flatMap((l) => {
      const sourceQty = sourceOnHand === undefined ? undefined : sourceMap.get(l.sku_id) ?? 0;
      if (sourceQty !== undefined && sourceQty < l.qty_ordered) {
        const elsewhere = (atpMap.get(l.sku_id) ?? 0) >= 0 ? " Stock exists at another location;" : "";
        return [`Only ${sourceQty} of ${l.skus?.name ?? "this line"} is at ${sourceName}.${elsewhere} move stock here before picking, or confirm intentionally knowing Warehouse cannot pick the full quantity.`];
      }
      if ((atpMap.get(l.sku_id) ?? 0) < 0) return [`ATP for ${l.skus?.name ?? "a line"} is ${atpMap.get(l.sku_id)}. Confirming oversells; that stays your call.`];
      return [];
    }),
  };
}

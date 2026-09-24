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

/**
 * `atp` is brewery ATP before this order: a submitted order is not allocated
 * until confirm_order, so its own quantity is not yet subtracted. A line
 * oversells when `atp - qty_ordered < 0` (#415). A SKU missing from `atp`
 * stays unjudged rather than read as 0.
 */
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
        tone: (sourceQty !== undefined && sourceQty < l.qty_ordered) || (qtyAtp !== undefined && qtyAtp - l.qty_ordered < 0) ? "w" : "",
      };
    }),
    oversellNotes: lines.flatMap((l) => {
      const sourceQty = sourceOnHand === undefined ? undefined : sourceMap.get(l.sku_id) ?? 0;
      if (sourceQty !== undefined && sourceQty < l.qty_ordered) {
        return [`Only ${sourceQty} of ${l.skus?.name ?? "this line"} is at ${sourceName}. Replenish ${sourceName} before picking, or confirm intentionally knowing Warehouse cannot pick the full quantity.`];
      }
      const qtyAtp = atpMap.get(l.sku_id);
      if (qtyAtp !== undefined && qtyAtp - l.qty_ordered < 0) {
        return [`ATP for ${l.skus?.name ?? "a line"} is ${formatSigned(qtyAtp)}; confirming ${l.qty_ordered} leaves ${formatSigned(qtyAtp - l.qty_ordered)}. Confirming oversells; that stays your call.`];
      }
      return [];
    }),
  };
}

/** A negative count with a true minus sign, as an operator reads it. */
function formatSigned(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

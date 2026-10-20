// lib/mgr/confirm-order-view.ts — view-model for the Confirm order review.
import { formatDate } from "@/lib/date-format";
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
  /** One message naming every short line, or null when all are covered. */
  shortageNote: string | null;
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
 * stays unjudged rather than read as 0. A line short at the source is named
 * once, under the source shortage; the per-line `w` tone marks every short line.
 */
export function toConfirmOrderViewProps({ order, lines, atp, sourceOnHand, locations, backHref }: ConfirmOrderSnapshot): ConfirmOrderViewModel {
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const sourceMap = new Map(sourceOnHand?.map((row) => [row.sku_id, Number(row.qty)]));
  const sourceName = locations.find((l) => l.id === order.from_location_id)?.name ?? "source";
  const ships = order.requested_ship_date ? ` · ships ${formatDate(order.requested_ship_date)}` : "";
  const judged = lines.map((l): JudgedLine => {
    const sourceQty = sourceOnHand === undefined ? undefined : sourceMap.get(l.sku_id) ?? 0;
    const qtyAtp = atpMap.get(l.sku_id);
    return { l, sourceQty, qtyAtp, short: sourceQty !== undefined && sourceQty < l.qty_ordered, oversold: qtyAtp !== undefined && qtyAtp - l.qty_ordered < 0 };
  });
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    where: order.customers?.name ?? "Taproom transfer",
    state: `Submitted${ships}`,
    fulfillmentSource: sourceName,
    lines: judged.map(({ l, sourceQty, qtyAtp, short, oversold }) => ({
      key: l.id,
      name: l.skus?.name ?? "Line",
      trailing: `${l.qty_ordered}${sourceQty === undefined ? "" : ` · ${sourceQty} at ${sourceName}`}${qtyAtp === undefined ? "" : ` · ${sourceQty === undefined ? "ATP" : "brewery ATP"} ${qtyAtp}`}${oversold ? ` · leaves ${formatSigned(qtyAtp! - l.qty_ordered)}` : ""}`,
      tone: short || oversold ? "w" : "",
    })),
    shortageNote: shortageNote(judged, sourceName),
  };
}

type JudgedLine = { l: ConfirmOrderSnapshot["lines"][number]; sourceQty?: number; qtyAtp?: number; short: boolean; oversold: boolean };

/** One message for the whole order. Each short line is named once: under the
 *  source shortage when it is short there, otherwise under the ATP oversell. */
function shortageNote(judged: JudgedLine[], sourceName: string): string | null {
  const name = ({ l }: JudgedLine) => l.skus?.name ?? "Line";
  const short = judged.filter((j) => j.short).map(name);
  const oversold = judged.filter((j) => !j.short && j.oversold).map(name);
  const parts = [
    short.length ? `Short at ${sourceName}: ${short.join(", ")}. Replenish ${sourceName} before picking, or confirm knowing Warehouse cannot pick the full quantity.` : "",
    oversold.length ? `Confirming oversells ATP for ${oversold.join(", ")}; that stays your call.` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** A negative count with a true minus sign, as an operator reads it. */
function formatSigned(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

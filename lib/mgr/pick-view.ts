// lib/mgr/pick-view.ts — view-model for the Pick sheet.
import { formatDate } from "@/lib/date-format";
import { formatLabel, byFormat, type BrandedSku } from "./brand-lines";
import { docNo } from "./doc-no";
import { isNumber, numberNotationError } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type PickLineView = {
  key: string;
  /** Format heading; lines arrive grouped by it (brand-lines.ts). */
  group?: string;
  /** Brand with its alias, or the SKU name when it has no brand and format. */
  name: string;
  qty: number;
  /** qty_ordered: record_pick refuses a pick above it (#471), so the field caps here. */
  ordered: number;
  /** "w" (Short) only for a valid count below ordered. */
  tone?: "" | "w" | "ok";
  /** Why the typed count cannot be saved, drawn under the field (#1484). */
  error?: string;
  /** "Only N available" when on-hand at the source is below ordered; the count still starts at ordered (#1484). */
  available?: string;
};

export type PickViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  /** Who the pick is for and when it ships, under the title. */
  subtitle: string;
  lines: PickLineView[];
  /** Why Done picking is withheld (submitReason), or null when every count is valid. */
  reason: string | null;
};

export type PickSnapshot = {
  backHref?: string;
  order: { id: string; order_no: number | null; from_location_id: string; requested_ship_date?: string | null; customers?: { name: string } | null; kind?: string; needs_restock?: boolean };
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    /** Latest server short_pick event for this line; invalidates unchanged counts after recovery replay. */
    shortPickEventId?: string;
    skus: BrandedSku;
  }[];
  locations: { id: string; name: string }[];
  /** get_order's on-hand at the order's source; absent leaves availability unjudged. */
  sourceOnHand?: { sku_id: string; qty: number }[];
};

/** A count Pick can save: a typed decimal from 0 to ordered. A blank is not 0
 *  (#433) and record_pick refuses more than ordered (#471). */
function countError(value: string, ordered: number): string | undefined {
  if (isNumber(value) && Number(value) >= 0 && Number(value) <= ordered) return undefined;
  return numberNotationError(value) ?? `Enter a count from 0 to ${ordered}.`;
}

/** Where Done picking goes (#1503): on to Ship (Complete transfer for a
 *  taproom transfer) when every line was counted in full and no staged beer
 *  waits to be put back; otherwise back to the order. */
export function pickDoneHref(order: PickSnapshot["order"], lines: PickSnapshot["lines"], qtys: Record<string, string>): string {
  const full = lines.every((line) => Number(qtys[line.id]) >= Number(line.qty_ordered));
  if (!full || order.needs_restock) return `/orders/${order.id}`;
  return `/orders/${order.id}/${order.kind === "taproom_transfer" ? "complete" : "ship"}`;
}

/** Map get_order onto PickView, lines grouped by format. `counts` are the typed
 *  counts by line id; a line without one counts qty_picked, else qty_ordered.
 *  A SKU missing from `sourceOnHand` has none at the source. */
export function toPickViewProps({ order, lines, locations, backHref, sourceOnHand }: PickSnapshot, counts: Record<string, string> = {}): PickViewModel {
  const source = locations.find((l) => l.id === order.from_location_id)?.name ?? "—";
  const onHand = new Map(sourceOnHand?.map((row) => [row.sku_id, Number(row.qty)]));
  const views = byFormat(lines).map((l): PickLineView => {
    const ordered = Number(l.qty_ordered);
    const value = counts[l.id] ?? String(l.qty_picked ?? ordered);
    const qty = Number(value);
    const error = countError(value, ordered);
    const stock = sourceOnHand === undefined ? undefined : onHand.get(l.sku_id) ?? 0;
    return {
      key: l.id,
      ...formatLabel(l.skus),
      qty,
      ordered,
      tone: !error && qty < ordered ? "w" : "ok",
      error,
      available: stock !== undefined && stock < ordered ? `Only ${stock} available` : undefined,
    };
  });
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: `Pick · ${source}`,
    subtitle: `${order.customers?.name ?? "Taproom transfer"}${order.requested_ship_date ? ` · ships ${formatDate(order.requested_ship_date)}` : ""}`,
    lines: views,
    reason: submitReason(views.some((l) => l.error) ? ["a count from 0 to the ordered quantity on every line"] : []),
  };
}

// lib/mgr/pick-view.ts — view-model for the Pick sheet.
import { formatDate } from "@/lib/date-format";
import { formatLabel, byFormat, type BrandedSku } from "./brand-lines";
import { docNo } from "./doc-no";

export type PickLineView = {
  key: string;
  /** Format heading; lines arrive grouped by it (brand-lines.ts). */
  group?: string;
  /** Brand with its alias, or the SKU name when it has no brand and format. */
  name: string;
  qty: number;
  /** qty_ordered: record_pick refuses a pick above it (#471), so the field caps here. */
  ordered: number;
  tone?: "" | "w" | "ok";
};

export type PickViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  /** Who the pick is for and when it ships, under the title. */
  subtitle: string;
  lines: PickLineView[];
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
};

/** Where Done picking goes (#1503): on to Ship (Complete transfer for a
 *  taproom transfer) when every line was counted in full and no staged beer
 *  waits to be put back; otherwise back to the order. */
export function pickDoneHref(order: PickSnapshot["order"], lines: PickSnapshot["lines"], qtys: Record<string, string>): string {
  const full = lines.every((line) => Number(qtys[line.id]) >= Number(line.qty_ordered));
  if (!full || order.needs_restock) return `/orders/${order.id}`;
  return `/orders/${order.id}/${order.kind === "taproom_transfer" ? "complete" : "ship"}`;
}

/** Map get_order onto PickView, lines grouped by format. Count defaults to qty_picked, else qty_ordered. */
export function toPickViewProps({ order, lines, locations, backHref }: PickSnapshot): PickViewModel {
  const source = locations.find((l) => l.id === order.from_location_id)?.name ?? "—";
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: `Pick · ${source}`,
    subtitle: `${order.customers?.name ?? "Taproom transfer"}${order.requested_ship_date ? ` · ships ${formatDate(order.requested_ship_date)}` : ""}`,
    lines: byFormat(lines).map((l) => {
      const ordered = Number(l.qty_ordered);
      const qty = Number(l.qty_picked ?? ordered);
      return {
        key: l.id,
        ...formatLabel(l.skus),
        qty,
        ordered,
        tone: qty < ordered ? "w" : "ok",
      };
    }),
  };
}

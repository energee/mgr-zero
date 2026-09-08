// lib/mgr/pick-view.ts — view-model for the Pick sheet.
import { docNo } from "./doc-no";

export type PickLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
  tone?: "" | "w" | "ok";
};

export type PickViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  info: string;
  lines: PickLineView[];
};

export type PickSnapshot = {
  order: { id: string; order_no: number | null; from_location_id: string };
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    skus: { name: string } | null;
  }[];
  locations: { id: string; name: string }[];
  backHref?: string;
};

/** Map get_order onto PickView. Count defaults to qty_picked, else qty_ordered. */
export function toPickViewProps({ order, lines, locations, backHref }: PickSnapshot): PickViewModel {
  const source = locations.find((l) => l.id === order.from_location_id)?.name ?? "—";
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: `Pick · ${source}`,
    info: `From ${source} · lines start at ordered; touch only exceptions.`,
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const qty = Number(l.qty_picked ?? ordered);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: `ordered ${ordered}`,
        qty,
        tone: qty < ordered ? "w" : "ok",
      };
    }),
  };
}

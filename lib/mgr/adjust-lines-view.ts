// lib/mgr/adjust-lines-view.ts — view-model for the Adjust lines sheet.
import { docNo } from "./doc-no";

export type AdjustLinesLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
  tone?: "" | "w" | "ok";
};

export type AdjustLinesViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  lines: AdjustLinesLineView[];
};

export type AdjustLinesSnapshot = {
  order: { id: string; order_no: number | null; customers?: { name: string } | null };
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    skus: { name: string } | null;
  }[];
};

/** Map a get_order payload onto AdjustLinesView. qty_ordered is the edit value. */
export function toAdjustLinesViewProps({ order, lines }: AdjustLinesSnapshot): AdjustLinesViewModel {
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref: `/orders/${order.id}`,
    title: "Adjust lines",
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const picked = l.qty_picked === null ? null : Number(l.qty_picked);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: picked !== null && ordered < picked ? `picked ${picked}` : "",
        qty: ordered,
        tone: picked !== null && ordered < picked ? "w" : "",
      };
    }),
  };
}

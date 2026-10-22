// lib/mgr/adjust-lines-view.ts — view-model for the Adjust lines page: the
// Pick-style table, saved lines named by brand and format (brand-lines.ts).
import { brandLabel, byBrand, type BrandedSku } from "./brand-lines";
import { docNo } from "./doc-no";

export type AdjustLinesLineView = {
  key: string;
  skuId?: string;
  /** A line added on this page: it carries the SKU picker until it is saved. */
  added?: boolean;
  /** Brand heading; saved lines arrive grouped by it. */
  group?: string;
  /** Format under the brand, or the SKU name when it has no brand and format. */
  name: string;
  detail: string;
  qty: number | string;
  tone?: "" | "w" | "ok";
};

export type AdjustLinesViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  lines: AdjustLinesLineView[];
  skus?: { id: string; label: string }[];
};

export type AdjustLinesSnapshot = {
  backHref?: string;
  order: { id: string; order_no: number | null; customers?: { name: string } | null };
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_picked: number | null;
    skus: BrandedSku;
  }[];
};

/** A saved line's row: brand and format, and a warning when ordered drops below picked. */
export function adjustLineView(l: { sku_id: string; skus: BrandedSku; qty_picked: number | null }, key: string, qty: number | string): AdjustLinesLineView {
  const picked = l.qty_picked === null ? null : Number(l.qty_picked);
  const belowPicked = picked !== null && qty !== "" && Number(qty) < picked;
  return { key, skuId: l.sku_id, ...brandLabel(l.skus), qty, detail: belowPicked ? `picked ${picked}` : "", tone: belowPicked ? "w" : "" };
}

/** Map a get_order payload onto AdjustLinesView, lines grouped by brand. qty_ordered is the edit value. */
export function toAdjustLinesViewProps({ order, lines, backHref }: AdjustLinesSnapshot): AdjustLinesViewModel {
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: "Adjust lines",
    lines: byBrand(lines).map((l) => adjustLineView(l, l.id, Number(l.qty_ordered))),
  };
}

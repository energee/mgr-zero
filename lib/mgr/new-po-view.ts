// lib/mgr/new-po-view.ts — view-model for New PO (inventory).
export type NewPoLineView = {
  key: string;
  title: string;
  detail: string;
  qty: number | string;
  materialId?: string;
  cost: string;
  lot?: string;
};

export type NewPoViewModel = {
  backHref?: string;
  vendor: string;
  vendors?: { id: string; name: string }[];
  materials?: { id: string; name: string; purchase_uom: string; lot_tracked: boolean }[];
  expected: string;
  lines: NewPoLineView[];
};

/** Which New PO rows count: a material and a quantity above zero. The view
 *  flags a row that falls short and the form saves only when every row counts,
 *  so the two read one rule instead of each keeping its own. */
export const poLineCounts = (line: Pick<NewPoLineView, "materialId" | "qty">) =>
  Boolean(line.materialId) && Number(line.qty) > 0;

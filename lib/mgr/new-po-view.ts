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

export function toNewPoViewProps(s: NewPoViewModel): NewPoViewModel {
  return s;
}

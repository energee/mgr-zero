// lib/mgr/new-po-view.ts — view-model for New PO (inventory).
export type NewPoLineView = {
  key: string;
  title: string;
  detail: string;
  qty: number;
  cost: string;
  lot?: string;
};

export type NewPoViewModel = {
  backHref?: string;
  vendor: string;
  expected: string;
  lines: NewPoLineView[];
};

export function toNewPoViewProps(s: NewPoViewModel): NewPoViewModel {
  return s;
}

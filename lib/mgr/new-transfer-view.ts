// lib/mgr/new-transfer-view.ts — view-model for the New transfer sheet.
// Live create stays new-transfer-form.tsx: E.pick / E.stq are not a controlled CommandForm.
export type NewTransferLineView = { title: string; qty: number | string };

export type NewTransferViewModel = {
  from: string;
  fromOptions: string[];
  fromBin: string;
  fromBinOptions: string[];
  to: string;
  toOptions: string[];
  toBin: string;
  toBinOptions: string[];
  skuOptions: string[];
  lines: NewTransferLineView[];
};

export type NewTransferSnapshot = {
  from: string;
  fromOptions: string[];
  fromBin: string;
  fromBinOptions: string[];
  to: string;
  toOptions: string[];
  toBin: string;
  toBinOptions: string[];
  lines: NewTransferLineView[];
};

export function toNewTransferViewProps(s: NewTransferSnapshot): NewTransferViewModel {
  return { ...s, skuOptions: [...new Set(s.lines.map(line => line.title))] };
}

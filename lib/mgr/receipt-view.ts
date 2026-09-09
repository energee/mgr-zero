// lib/mgr/receipt-view.ts — view-model for Receipt (inventory echo).
export type ReceiptViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  status: string;
  stillOwed: string;
  tape: [string, string][];
  info: string;
};

export function toReceiptViewProps(s: ReceiptViewModel): ReceiptViewModel {
  return s;
}

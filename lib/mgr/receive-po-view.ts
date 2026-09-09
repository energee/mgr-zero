// lib/mgr/receive-po-view.ts — view-model for Receive PO (inventory).
export type ReceivePoLineView = {
  key: string;
  title: string;
  detail: string;
  qty: number;
  warning?: boolean;
  ok?: boolean;
  lot?: string;
  lotOptions?: string[];
  bestBy?: string;
  note?: string;
};

export type ReceivePoViewModel = {
  backHref?: string;
  title: string;
  status?: string;
  lines?: ReceivePoLineView[];
  tape?: [string, string][];
  info?: string;
};

export function toReceivePoViewProps(s: ReceivePoViewModel): ReceivePoViewModel {
  return s;
}

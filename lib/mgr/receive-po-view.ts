// lib/mgr/receive-po-view.ts — view-model for Receive PO (inventory).
export type ReceivePoLineView = {
  key: string;
  title: string;
  detail: string;
  qty: number | string;
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
  state?: string;
  note?: string;
  locationId?: string;
  binId?: string;
  receivedOn?: string;
  locations?: { id: string; name: string }[];
  bins?: { id: string; name: string }[];
  sentVia?: string;
  lotSuggestionsUnavailable?: boolean;
  history?: { key: string; label: string; detail: string; href?: string }[];
};

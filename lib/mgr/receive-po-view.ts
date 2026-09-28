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
  correctionReason?: string;
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

/** What a receipt correction does, shown on the live form and its inventory frame. */
export const CORRECTION_INFO = "The original receipt remains in history. Its stock is reversed and the corrected count is posted at the original receiving bin. Subsequent stock use or shared lot changes can prevent correction.";

/** The one mode a Receive PO state puts the form in: mark a draft sent,
 *  count a new receipt, correct a posted one, or only show the order. */
export function receiveMode(state: string | undefined): "draft" | "receive" | "correct" | "view" {
  if (state === "correction") return "correct";
  if (state === "draft") return "draft";
  return state === undefined || state === "sent" || state === "partially_received" ? "receive" : "view";
}

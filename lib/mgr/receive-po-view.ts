// lib/mgr/receive-po-view.ts — view-model for Receive PO (inventory), and
// what Receive purchase order or Correct receipt still needs (#1485).
import { isNumber, numberNotationError } from "./quantity-input";
import { submitReason } from "./submit-reason";
import { poLineErrors } from "./new-po-view";

export type ReceivePoLineView = {
  key: string;
  title: string;
  detail: string;
  qty: number | string;
  cost?: string;
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
  closure?: "cancel" | "short";
  closureReason?: string;
  note?: string;
  locationId?: string;
  binId?: string;
  receivedOn?: string;
  locations?: { id: string; name: string }[];
  bins?: { id: string; name: string }[];
  sentVia?: string;
  /** Where a draft's Edit draft goes (Edit PO); the inventory leaves it inert. */
  editHref?: string;
  lotSuggestionsUnavailable?: boolean;
  history?: { key: string; label: string; detail: string; href?: string }[];
};

type PoLineAmounts = { qty_ordered: number; qty_received: number; qty_open: number; expected_lot_code: string | null; material: { purchase_uom: string } | null };

/** A PO line quantity with its purchase unit, when the material is known. */
export const poLineQty = (qty: number, material: PoLineAmounts["material"]) => (material ? `${qty} ${material.purchase_uom}` : String(qty));

/** A PO line's ordered, received and still-due amounts, each with its unit (#1501), then the PO's lot. */
export const poLineDetail = (line: PoLineAmounts) =>
  `ordered ${poLineQty(line.qty_ordered, line.material)} · received ${poLineQty(line.qty_received, line.material)} · still due ${poLineQty(line.qty_open, line.material)}${line.expected_lot_code ? ` · PO lot ${line.expected_lot_code}` : ""}`;

/** What a receipt correction does, shown on the live form and its inventory frame. */
export const CORRECTION_INFO = "The original receipt remains in history. Its stock is compensated and the corrected count posts in the selected receiving bin. Used stock can be corrected if balances stay nonnegative; used lot identities and shared lot facts stay fixed.";

/** The one mode a Receive PO state puts the form in: mark a draft sent,
 *  count a new receipt, correct a posted one, or only show the order. */
export function receiveMode(state: string | undefined): "draft" | "receive" | "correct" | "view" {
  if (state === "correction") return "correct";
  if (state === "draft") return "draft";
  return state === undefined || state === "sent" || state === "partially_received" ? "receive" : "view";
}

/** A typed count posts when it is a plain number of zero or more. */
export const isCount = (qty: string) => isNumber(qty) && Number(qty) >= 0;

/** Why Receive purchase order or Correct receipt is withheld, or null when
 *  ready (and in a mode that receives nothing). A new receipt needs its
 *  location, bin and day; a correction needs its reason and every line counted.
 *  A blank line is left out of a new receipt, but a negative or non-number
 *  count is named, never dropped, and a new receipt needs one line above
 *  zero. A lot-tracked line (`lot` set) counted above
 *  zero needs its lot code. */
export function receiveReason(model: ReceivePoViewModel): string | null {
  const mode = receiveMode(model.state);
  if (mode !== "receive" && mode !== "correct") return null;
  const missing: string[] = [];
  if (mode === "correct" && !model.correctionReason?.trim()) missing.push("a correction reason");
  if (mode === "receive" || model.locations !== undefined) {
    if (!model.locationId) missing.push("a location");
    if (!model.binId) missing.push("a bin");
  }
  if (mode === "receive" && !model.receivedOn) missing.push("a received day");
  const lines = model.lines ?? [];
  for (const line of lines) {
    const qty = String(line.qty);
    if (qty.trim() === "") {
      if (mode === "correct") missing.push(`a count for ${line.title}`);
    } else if (!isCount(qty)) missing.push(`a count of zero or more for ${line.title}`);
    else if (line.lot !== undefined && Number(qty) > 0 && !line.lot.trim()) missing.push(`a lot code for ${line.title}`);
    if ((mode === "correct" || isCount(qty)) && line.cost && (numberNotationError(line.cost) || poLineErrors({ qty: 1, cost: line.cost }).cost)) {
      missing.push(`a unit cost from $0 to $21,474,836.47 for ${line.title}`);
    }
  }
  // A 0 records a short line beside a received one; a receipt of only zeros records nothing (#1485).
  if (mode === "receive" && !lines.some(line => isCount(String(line.qty)) && Number(line.qty) > 0)) missing.push("a count above zero on at least one line");
  return submitReason(missing);
}

/** The purchase-order statuses still owed by the vendor: the PO list shows
 *  these by default, and only these offer cancel or close short. */
export const OPEN_PO_STATUSES = ["draft", "sent", "partially_received"] as const;

/** The form the closure reason and button submit, a sibling of the receive form
 *  (forms cannot nest), so Enter in the reason submits closure, not a receipt. */
export const CLOSURE_FORM_ID = "purchase-order-closure";

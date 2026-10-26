// lib/mgr/confirm-delivery-view.ts — view-model for Confirm delivery.
import type { ShipToSnapshot } from "./ship-to-view";
import { submitReason } from "./submit-reason";

export type ConfirmDeliveryLineView = { key: string; title: string; qty: string };

export type ConfirmDeliveryViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  heading: string;
  /** Undefined for an internal transfer; null for an unrecorded customer destination. */
  shipTo?: ShipToSnapshot | null;
  invoiceTiming: string;
  lines: ConfirmDeliveryLineView[];
  receivedBy?: string;
  receivedSuggestions?: string[];
};

type DeliveryOutcomeDraft = {
  refused: Record<string, string>;
  signedBy: string;
  reason: string;
  note: string;
  transferRefused: boolean;
};

/** Keep typed counts intact until each line is valid; only positive refusals enter the command. */
export function deliveryOutcomeState(lines: ConfirmDeliveryLineView[], draft: DeliveryOutcomeDraft, transfer = false) {
  const rows = transfer ? [] : lines.map(line => {
    const value = draft.refused[line.key] ?? "0";
    const qty = Number(value);
    const shipped = Number(line.qty);
    const valid = /^\d+$/.test(value) && Number.isSafeInteger(qty) && qty <= shipped;
    return {
      ...line, value,
      accepted: valid ? shipped - qty : null,
      error: valid ? undefined : `Enter a whole refused quantity from 0 to ${line.qty}, without decimals or exponent notation.`,
    };
  });
  const invalid = rows.some(row => row.error);
  const refused = rows.filter(row => !row.error && Number(row.value) > 0)
    .map(row => ({ orderLineId: row.key, qty: Number(row.value) }));
  const hasRefusal = transfer ? draft.transferRefused : refused.length > 0;
  const fullRefusal = transfer ? draft.transferRefused : !invalid && rows.length > 0 && rows.every(row => row.accepted === 0);
  const missing: string[] = [];
  if (invalid) missing.push("valid refused quantities within each shipped amount");
  if (!fullRefusal && !draft.signedBy.trim()) missing.push("Received by");
  if (hasRefusal && !draft.reason) missing.push("a refusal reason");
  if (hasRefusal && draft.reason === "other" && !draft.note.trim()) missing.push("a refusal note");
  return { rows, refused, hasRefusal, fullRefusal, reason: submitReason(missing) };
}

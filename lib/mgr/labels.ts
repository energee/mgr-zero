// lib/mgr/labels.ts — one humanizer for every enum an operator reads.
// Database values are snake_case (or already spaced, as the record-movement
// fixtures are); operators see sentence case. Issue #333.
import type { ImportKind } from "@/lib/import-csv";
import type { PaymentTerm } from "@/lib/mgr/enums";

/** "opening_balance" / "opening balance" → "Opening balance". */
export const sentenceCase = (value: string) =>
  value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

/** Import kinds carry product names the humanizer cannot derive; the staff
 *  guide's Kind column is the source of truth. */
export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  customers: "Customers",
  ship_tos: "Ship-tos",
  products_skus: "Products / SKUs",
  channel_prices: "Channel prices",
  opening_balances: "Opening balances",
};

export const importKindLabel = (kind: ImportKind) => IMPORT_KIND_LABELS[kind];

/** How a payment term reads ("net30" → "Net 30"); the stored values are PAYMENT_TERMS in lib/mgr/enums.ts. */
export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = { due_on_receipt: "Due on receipt", net15: "Net 15", net30: "Net 30" };

/** A stored payment term as the operator reads it; an unknown value prints as stored. */
export const paymentTermLabel = (term: string) => PAYMENT_TERM_LABEL[term as PaymentTerm] ?? term;

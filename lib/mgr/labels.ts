// lib/mgr/labels.ts — one humanizer for every enum an operator reads.
// Database values are snake_case (or already spaced, as the record-movement
// fixtures are); operators see sentence case. Issue #333.
import type { ImportKind } from "@/lib/import-csv";

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

// lib/movement-form.ts — the pure rules behind the Record movement form
// (app/(app)/inventory/movement-form.tsx) and the bin Move stock form: what a
// typed quantity and destination state must be, what Record movement still
// needs, and how the positive form quantity becomes the signed API input.
import type { BinMoveStock } from "./commands/inventory";
import { movementInput } from "./commands/movement-input";
import { sentenceCase } from "@/lib/mgr/labels";
import { submitReason } from "@/lib/mgr/submit-reason";
import { numberNotationError } from "@/lib/mgr/quantity-input";

/** The staff-facing movement kinds, in the staff guide's order. The live form
 *  and the inventory frame both list these (#1168). sale_removal and
 *  taproom_transfer come from order flows, so they are not entered here. */
export const MOVEMENT_TYPES = [
  "opening_balance", "production_in", "adjustment", "depletion",
  "destruction", "loss", "sample", "festival_removal", "return_in",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
/** The kind options both lists show, index-aligned with MOVEMENT_TYPES. */
export const MOVEMENT_KIND_LABELS = MOVEMENT_TYPES.map(sentenceCase);

/** Mirrors the DB CHECK (removal_shape): sale_removal and depletion each name a
 *  channel, and only depletion is staff-facing here (sale_removal comes from
 *  shipping). */
export const requiresChannel = (type: string) => type === "depletion";

/** Samples and festival removals leave the premises, so they name a state. */
export const requiresDestState = (type: string) => type === "sample" || type === "festival_removal";

/** What is wrong with each typed field, so each marks its own control (#1113).
 *  The quantity is entered positive: the kind (and Direction, for an
 *  adjustment) signs it. Up to two decimal places are allowed; the database
 *  refuses a third (record_inventory_movement) and the command's schema caps
 *  the size (movementInput). */
export type MovementFieldErrors = { qty?: string; destState?: string };

const QTY_ENTER = "Enter a quantity above zero, with at most two decimal places. The kind, or Direction for an adjustment, decides whether stock is added or removed.";
const QTY_TOO_LARGE = "Enter a quantity of at most 9,999,999,999.99.";

function qtyError(qty: number): string | undefined {
  if (!Number.isFinite(qty) || qty <= 0 || Math.round(qty * 100) / 100 !== qty) return QTY_ENTER;
  if (!movementInput.shape.qty.safeParse(qty).success) return QTY_TOO_LARGE;
  return undefined;
}

export function movementFieldErrors(type: string, quantity: string, state: string): MovementFieldErrors {
  const qty = numberNotationError(quantity) ?? qtyError(Number(quantity));
  return {
    ...(qty ? { qty } : {}),
    ...(requiresDestState(type) && !/^[A-Z]{2}$/.test(state.trim().toUpperCase()) ? { destState: "Enter a two-letter state, such as PA." } : {}),
  };
}

/** The sentence beside the withheld Record movement button (E.submit's
 *  `reason`): every field still missing or wrong, or null when it can be sent. */
export function movementReason(i: { type: string; skuId: string; locationId: string; binId: string; saleChannelId: string; qty: string; destState: string }): string | null {
  const errors = movementFieldErrors(i.type, i.qty, i.destState);
  const missing: string[] = [];
  if (!i.type) missing.push("a kind");
  if (!i.skuId) missing.push("a SKU");
  if (!i.locationId) missing.push("a location");
  if (!i.binId) missing.push("a bin");
  if (requiresChannel(i.type) && !i.saleChannelId) missing.push("a channel");
  if (errors.qty) missing.push(errors.qty === QTY_TOO_LARGE ? "a smaller quantity" : "a quantity above zero with at most two decimals");
  if (errors.destState) missing.push("a two-letter destination state");
  return submitReason(missing);
}

/** Positive form quantities become the existing signed movement API input.
 *  @throws the movementFieldErrors message when the quantity or state is wrong;
 *  check movementReason first, as the Record movement form does. */
export function movementFields(type: string, quantity: string, direction: "add" | "remove", state: string, channel: string) {
  const errors = movementFieldErrors(type, quantity, state);
  const problem = errors.qty ?? errors.destState;
  if (problem) throw new Error(problem);
  const qty = Number(quantity);
  const removal = ["depletion", "destruction", "loss", "sample", "festival_removal"].includes(type) || (type === "adjustment" && direction === "remove");
  return { qty: removal ? -qty : qty, destState: requiresDestState(type) ? state.trim().toUpperCase() : undefined, saleChannelId: requiresChannel(type) ? channel : undefined };
}

export const binStockKey = (stock: BinMoveStock) => JSON.stringify([stock.bin_id, stock.kind, stock.stock_id, stock.lot_id, stock.keg_size]);

export function selectedBinStock(stock: BinMoveStock[], source: string) {
  return stock.find(row => binStockKey(row) === source);
}

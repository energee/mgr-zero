// lib/movement-form.ts — the pure rules behind the Record movement form
// (app/(app)/inventory/movement-form.tsx) and the bin Move stock form: what a
// typed quantity and destination state must be, what Record movement still
// needs, and how the positive form quantity becomes the signed API input.
import type { BinMoveStock } from "./commands/inventory";
import { submitReason } from "@/lib/mgr/submit-reason";

/** Mirrors the DB CHECK (removal_shape): sale_removal and depletion each name a
 *  channel, and only depletion is staff-facing here (sale_removal comes from
 *  shipping). */
export const requiresChannel = (type: string) => type === "depletion";

/** Samples and festival removals leave the premises, so they name a state. */
export const requiresDestState = (type: string) => type === "sample" || type === "festival_removal";

/** What is wrong with each typed field, so each marks its own control (#1113).
 *  The quantity is entered positive: the kind (and Direction, for an
 *  adjustment) signs it. Decimals are allowed; the ledger keeps two places. */
export type MovementFieldErrors = { qty?: string; destState?: string };

export function movementFieldErrors(type: string, quantity: string, state: string): MovementFieldErrors {
  const qty = Number(quantity);
  return {
    ...(Number.isFinite(qty) && qty > 0 ? {} : { qty: "Enter a quantity greater than zero. The kind decides whether stock is added or removed." }),
    ...(requiresDestState(type) && !/^[A-Z]{2}$/.test(state.trim().toUpperCase()) ? { destState: "Enter a two-letter state, such as PA." } : {}),
  };
}

/** What Record movement still needs (submitReason), or null when it can be sent. */
export function movementReason(i: { type: string; skuId: string; locationId: string; binId: string; saleChannelId: string; qty: string; destState: string }): string | null {
  const errors = movementFieldErrors(i.type, i.qty, i.destState);
  const missing: string[] = [];
  if (!i.type) missing.push("a kind");
  if (!i.skuId) missing.push("a SKU");
  if (!i.locationId) missing.push("a location");
  if (!i.binId) missing.push("a bin");
  if (requiresChannel(i.type) && !i.saleChannelId) missing.push("a channel");
  if (errors.qty) missing.push("a quantity above zero");
  if (errors.destState) missing.push("a two-letter destination state");
  return submitReason(missing);
}

/** Positive form quantities become the existing signed movement API input. */
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

/** Why Move stock is not offered at this location, or null when it is: a bin move needs a second bin and some stock to move. */
export function moveStockUnavailable({ bins, stock }: { bins: number; stock: number }): string | null {
  if (bins < 2) return "Moving stock needs at least two bins at this location. Add a bin first.";
  if (stock === 0) return "No stock is on hand in this location's bins.";
  return null;
}

import type { BinMoveStock } from "./commands/inventory";

/** Positive form quantities become the existing signed movement API input. */
export function movementFields(type: string, quantity: string, direction: "add" | "remove", state: string, channel: string) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be positive");
  const needsState = type === "sample" || type === "festival_removal";
  const destState = needsState ? state.trim().toUpperCase() : undefined;
  if (needsState && !/^[A-Z]{2}$/.test(destState!)) throw new Error("Enter a two-letter destination state");
  const removal = ["depletion", "destruction", "loss", "sample", "festival_removal"].includes(type) || (type === "adjustment" && direction === "remove");
  return { qty: removal ? -qty : qty, destState, saleChannelId: type === "depletion" ? channel : undefined };
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

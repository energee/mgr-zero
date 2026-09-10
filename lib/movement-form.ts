import type { BinMoveStock } from "./commands/inventory";

export const movementTypeLabel = (type: string) => type.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

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

import { expect, it } from "vitest";
import { stockLine } from "@/lib/commands/stock-line";
import { movementFieldErrors, movementFields, movementReason, binStockKey, selectedBinStock } from "@/lib/movement-form";

it("stock lines identify exactly one stock kind and whole empty kegs", () => {
  const id = crypto.randomUUID();
  const base = { qty: 1, fromBinId: id, toBinId: crypto.randomUUID() };
  expect(stockLine.safeParse(base).success).toBe(false);
  expect(stockLine.safeParse({ ...base, skuId: id, materialId: id }).success).toBe(false);
  expect(stockLine.safeParse({ ...base, kegPoolId: id, kegSize: "half_bbl", qty: 1.5 }).success).toBe(false);
  expect(stockLine.safeParse({ ...base, kegPoolId: id }).success).toBe(false);
  expect(stockLine.safeParse({ ...base, materialId: id, qty: 1.5 }).success).toBe(true);
});
it("positive movement entry derives direction, requires sample state, and discards irrelevant fields", () => {
  expect(movementFields("sample", "2", "add", "pa", "channel")).toEqual({ qty: -2, destState: "PA", saleChannelId: undefined });
  expect(movementFields("adjustment", "2", "remove", "PA", "channel").qty).toBe(-2);
  expect(movementFields("return_in", "2", "remove", "PA", "channel")).toEqual({ qty: 2, destState: undefined, saleChannelId: undefined });
  expect(movementFields("depletion", "2", "add", "PA", "channel").saleChannelId).toBe("channel");
  for (const qty of ["", "0", "-2", "Infinity", "1.555"]) expect(() => movementFields("loss", qty, "add", "", "")).toThrow();
  for (const state of ["", "P", "12"]) expect(() => movementFields("festival_removal", "1", "add", state, "")).toThrow();
});

it("Record movement marks a quantity the database refuses and a bad destination state on their own fields; two decimals stay allowed (#1113)", () => {
  const qty = "Enter a quantity above zero, with at most two decimal places. The movement type, or Direction for an adjustment, decides whether stock is added or removed.";
  // record_inventory_movement refuses p_qty <> round(p_qty, 2), so a third decimal is marked here, not by the server.
  for (const value of ["-3", "0", "", "abc", "Infinity", "2.555", "0.004"]) expect(movementFieldErrors("loss", value, "")).toEqual({ qty });
  // The command's schema caps the quantity (numeric(12,2)).
  expect(movementFieldErrors("loss", "10000000000", "")).toEqual({ qty: "Enter a quantity of at most 9,999,999,999.99." });
  for (const value of ["2.5", "0.01", "1.1", "9999999999.99"]) expect(movementFieldErrors("loss", value, "")).toEqual({});
  expect(movementFieldErrors("loss", "1", "P")).toEqual({});
  for (const state of ["", "P", "12"]) expect(movementFieldErrors("festival_removal", "1", state)).toEqual({ destState: "Enter a two-letter state, such as PA." });
  expect(movementFieldErrors("sample", "1", "pa")).toEqual({});
  expect(() => movementFields("loss", "-3", "add", "", "")).toThrow(qty);
});

it("Record movement names everything it still needs, channel and state only for the kinds that carry them (#1113)", () => {
  const ready = { type: "depletion", skuId: "s", locationId: "l", binId: "b", saleChannelId: "c", qty: "2.5", destState: "" };
  expect(movementReason(ready)).toBeNull();
  expect(movementReason({ ...ready, type: "", skuId: "", locationId: "", binId: "", qty: "-3" })).toBe("Still needed: movement type, SKU, location, bin, and a quantity above zero (up to two decimals).");
  expect(movementReason({ ...ready, qty: "2.555" })).toBe("Still needed: a quantity above zero (up to two decimals).");
  expect(movementReason({ ...ready, qty: "10000000000" })).toBe("Still needed: a smaller quantity.");
  expect(movementReason({ ...ready, saleChannelId: "" })).toBe("Still needed: a channel.");
  expect(movementReason({ ...ready, type: "loss", saleChannelId: "" })).toBeNull();
  expect(movementReason({ ...ready, type: "sample", destState: "P" })).toBe("Still needed: a two-letter destination state.");
});


it("a refreshed stock list cannot retarget the chosen source identity", () => {
  const first = { bin_id: "bin-a", kind: "sku" as const, stock_id: "sku-a", lot_id: "lot-a", keg_size: null, name: "Beer", unit: "units", lot_code: "A", qty: 2 };
  const other = { ...first, lot_id: "lot-b", lot_code: "B" };
  const selected = binStockKey(first);
  for (const changed of [{ bin_id: "bin-b" }, { kind: "material" as const }, { stock_id: "sku-b" }, { lot_id: null }, { keg_size: "half_bbl" }]) expect(binStockKey({ ...first, ...changed })).not.toBe(selected);
  expect(selectedBinStock([other, first], selected)).toBe(first);
  expect(selectedBinStock([first, other], selected)).toBe(first);
  expect(selectedBinStock([other], selected)).toBeUndefined();
});

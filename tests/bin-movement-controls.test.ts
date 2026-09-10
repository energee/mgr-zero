import { expect, it } from "vitest";
import { stockLine } from "@/lib/commands/stock-line";
import { movementFields, movementTypeLabel, binStockKey, selectedBinStock } from "@/lib/movement-form";

it("presents movement enum values as readable labels", () => {
  expect(movementTypeLabel("opening_balance")).toBe("Opening balance");
  expect(movementTypeLabel("festival_removal")).toBe("Festival removal");
});

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
  for (const qty of ["", "0", "-2", "Infinity"]) expect(() => movementFields("loss", qty, "add", "", "")).toThrow();
  for (const state of ["", "P", "12"]) expect(() => movementFields("festival_removal", "1", "add", state, "")).toThrow();
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

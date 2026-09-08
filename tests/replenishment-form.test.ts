import { expect, it } from "vitest";
import { replenishmentQuantityReady } from "@/lib/replenishment-form";

it("requires a SKU and a finite nonnegative quantity, allowing explicit zero to release", () => {
  expect(replenishmentQuantityReady("sku", "0")).toBe(true);
  expect(replenishmentQuantityReady("sku", "2.5")).toBe(true);
  for (const qty of ["", " ", "-1", "NaN", "Infinity"]) expect(replenishmentQuantityReady("sku", qty)).toBe(false);
  expect(replenishmentQuantityReady("", "1")).toBe(false);
});

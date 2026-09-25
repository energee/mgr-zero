import { expect, it } from "vitest";
import { replenishmentQuantityReady } from "@/lib/replenishment-form";

it("requires a SKU and a finite nonnegative quantity, allowing explicit zero to release", () => {
  expect(replenishmentQuantityReady("sku", "0")).toBe(true);
  expect(replenishmentQuantityReady("sku", "2.5")).toBe(true);
  for (const qty of ["", " ", "-1", "NaN", "Infinity"]) expect(replenishmentQuantityReady("sku", qty)).toBe(false);
  expect(replenishmentQuantityReady("", "1")).toBe(false);
});

it("keeps replenishment controls and implicit form submission read-only for Warehouse", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../app/(app)/replenishment/replenish-form.tsx", import.meta.url), "utf8");
  expect(source).toContain("if (!canCreate) { e.preventDefault(); return; }");
  expect(source).toMatch(/<Select\s[^>]*disabled=\{!canCreate\}/);
  expect(source).toMatch(/E\.edit\([^)]*disabled: !canCreate/);
});

it("builds only positive lines, so an all-zero order has none to submit (#447)", async () => {
  const { replenishmentLines } = await import("@/lib/replenishment-form");
  const suggestions = [{ skuId: "a" }, { skuId: "b" }, { skuId: "c" }];
  expect(replenishmentLines(suggestions, { a: "0", b: "", c: "3" })).toEqual([{ skuId: "c", qty: 3 }]);
  expect(replenishmentLines(suggestions, { a: "0", b: "0", c: "0" })).toEqual([]);
  const source = (await import("node:fs")).readFileSync(new URL("../app/(app)/replenishment/replenish-form.tsx", import.meta.url), "utf8");
  expect(source).toContain("lines.length === 0");
});

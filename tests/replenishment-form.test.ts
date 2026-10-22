import { expect, it } from "vitest";

it("keeps replenishment controls and implicit form submission read-only for Warehouse", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../app/(app)/replenishment/replenish-form.tsx", import.meta.url), "utf8");
  expect(source).toContain("if (!canCreate) { e.preventDefault(); return; }");
  // E.pick, like the Location select above it, so the two selects share one width.
  expect(source).toMatch(/E\.pick\("From warehouse"[^;]*disabled: !canCreate/);
  expect(source).toMatch(/E\.edit\([^)]*disabled: !canCreate/);
});

it("builds only positive lines, so an all-zero order has none to submit (#447)", async () => {
  const { replenishmentLines } = await import("@/lib/replenishment-form");
  const suggestions = [{ skuId: "a" }, { skuId: "b" }, { skuId: "c" }];
  expect(replenishmentLines(suggestions, { a: "0", b: "", c: "3" })).toEqual([{ skuId: "c", qty: 3 }]);
  expect(replenishmentLines(suggestions, { a: "0", b: "0", c: "0" })).toEqual([]);
  const source = (await import("node:fs")).readFileSync(new URL("../app/(app)/replenishment/replenish-form.tsx", import.meta.url), "utf8");
  expect(source).toContain("replenishReason(fromLocationId, lines)");
});

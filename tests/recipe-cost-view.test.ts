// tests/recipe-cost-view.test.ts — the recipe page's Ingredient cost
// (recipeCostTable): the sheet as typed broken out by ingredient, the total,
// and the summary line that gives the cost per barrel and for the batch and
// names the ingredients on a typed price and those not in stock.
import { describe, expect, it } from "vitest";
import { recipeCostTable } from "../lib/mgr/recipe-cost-view";

const costs = {
  malt: { unitCostCents: 100, fromReceipt: true, inStock: true },
  citra: { unitCostCents: 2000.5, fromReceipt: false, inStock: false },
  yeast: { unitCostCents: null, fromReceipt: false, inStock: true },
  salt: { unitCostCents: 0, fromReceipt: true, inStock: true },
};
const materials: Record<string, { name: string; unit: string }> = {
  malt: { name: "Pale Ale Malt", unit: "lb" }, citra: { name: "Citra", unit: "lb" }, yeast: { name: "House yeast", unit: "each" },
  salt: { name: "Gypsum", unit: "g" }, gone: { name: "Retired hop", unit: "lb" },
};
const material = { name: (id: string) => materials[id].name, unit: (id: string) => materials[id].unit };
const line = (materialId: string, perBblQty: string) => ({ materialId, perBblQty });
const table = (lines: { materialId: string; perBblQty: string }[], bbl: number) => recipeCostTable(lines, costs, material, bbl);

describe("recipeCostTable", () => {
  it("has no table for a sheet with no ready line", () => {
    expect(table([], 10)).toBeUndefined();
    expect(table([line("", "5"), line("citra", "")], 10)).toBeUndefined();
  });

  it("gives one row per ingredient for the batch, a hop at two stages summed, then the total", () => {
    expect(table([line("malt", "60"), line("citra", "1"), line("citra", "0.5")], 10)).toEqual({
      // 60 × $1.00 + 1.5 × $20.005 a barrel is $90.0075; the barrel and the batch are each rounded once from that.
      summary: "Ingredients cost $90.01/bbl, $900.08 for 10 bbl. Typed price, no receipt cost: Citra. None in stock: Citra.",
      basis: "for 10 bbl",
      rows: [
        { key: "malt", name: "Pale Ale Malt", amount: "600 lb", price: "$1.00/lb", cost: "$600.00", note: "" },
        { key: "citra", name: "Citra", amount: "15 lb", price: "$20.005/lb", cost: "$300.08", note: "typed price · none in stock" },
      ],
      total: "$900.08", totalNote: "",
    });
  });

  it("reads per barrel without a batch size, and totals the priced rows beside the count left out", () => {
    expect(table([line("malt", "60"), line("yeast", "0.05")], 0)).toEqual({
      summary: "Ingredients cost at least $60.00/bbl · 1 ingredient has no price yet: House yeast.",
      basis: "per bbl",
      rows: [
        { key: "malt", name: "Pale Ale Malt", amount: "60 lb", price: "$1.00/lb", cost: "$60.00", note: "" },
        { key: "yeast", name: "House yeast", amount: "0.05 each", price: "", cost: "No price", note: "" },
      ],
      total: "$60.00", totalNote: "without 1 unpriced ingredient",
    });
  });

  it("the summary's batch amount is the table's total", () => {
    const { summary, total } = table([line("malt", "60"), line("citra", "1.5")], 22)!;
    expect(summary).toContain(`${total} for 22 bbl`);
  });

  it("says the cost is unknown only when no row is priced; a row priced at zero is priced", () => {
    expect(table([line("yeast", "1"), line("gone", "2")], 10)).toMatchObject({
      summary: "Ingredient cost unknown · 2 ingredients have no price yet: House yeast, Retired hop. None in stock: Retired hop.",
      total: "$0.00", totalNote: "without 2 unpriced ingredients",
    });
    expect(table([line("salt", "5"), line("yeast", "1")], 0)?.summary).toBe("Ingredients cost at least $0.00/bbl · 1 ingredient has no price yet: House yeast.");
  });

  it("names three ingredients at most and counts the rest", () => {
    const many = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, { unitCostCents: 1, fromReceipt: false, inStock: true }]));
    const named = { name: (id: string) => id.toUpperCase(), unit: () => "lb" };
    expect(recipeCostTable(["d", "c", "b", "a"].map((id) => line(id, "1")), many, named, 0)?.summary)
      .toBe("Ingredients cost $0.04/bbl. Typed price, no receipt cost: A, B, C and 1 more.");
  });
});

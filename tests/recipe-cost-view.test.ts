// tests/recipe-cost-view.test.ts — the lines the recipe page writes about a
// saved copy's ingredient cost (recipeCostNotes): the cost per barrel and for
// the batch, which ingredients rest on a typed price, and which are not in stock.
// draftCost works the same facts out for the sheet as it is being edited.
import { describe, expect, it } from "vitest";
import { draftCost, recipeCostNotes } from "../lib/mgr/recipe-cost-view";

const cost = { costCentsPerBbl: 4810, uncosted: [], unreceived: [], outOfStock: [] };

describe("recipeCostNotes", () => {
  it("says nothing without a cost read", () => {
    expect(recipeCostNotes(undefined, 15)).toEqual([]);
  });

  it("gives the cost per barrel, and for the batch when the recipe has a batch size", () => {
    expect(recipeCostNotes(cost, 15)).toEqual(["Ingredients cost $48.10/bbl, $721.50 for 15 bbl."]);
    expect(recipeCostNotes(cost, 0)).toEqual(["Ingredients cost $48.10/bbl."]);
  });

  it("names what no purchase order backs and what is not in stock, three names at most", () => {
    expect(recipeCostNotes({ ...cost, unreceived: ["Citra", "Vienna"], outOfStock: ["A", "B", "C", "D"] }, 0)).toEqual([
      "Ingredients cost $48.10/bbl.",
      "Typed price, no receipt cost: Citra, Vienna.",
      "None in stock: A, B, C and 1 more.",
    ]);
  });

  it("gives no number while an ingredient has no price, and names it", () => {
    expect(recipeCostNotes({ ...cost, costCentsPerBbl: null, uncosted: ["House yeast"] }, 15)).toEqual([
      "Ingredient cost unknown · 1 ingredient has no price yet: House yeast.",
    ]);
  });
});

describe("draftCost", () => {
  const costs = {
    malt: { unitCostCents: 100, fromReceipt: true, inStock: true },
    citra: { unitCostCents: 2000.5, fromReceipt: false, inStock: false },
    yeast: { unitCostCents: null, fromReceipt: false, inStock: true },
  };
  const names: Record<string, string> = { malt: "Pale Ale Malt", citra: "Citra", yeast: "House yeast", gone: "Retired hop" };
  const name = (id: string) => names[id];
  const line = (materialId: string, perBblQty: string) => ({ materialId, perBblQty });

  it("sums each line at its material's cost and rounds the barrel once", () => {
    // 60 × $1.00 + (1 + 0.5) × $20.005, the same hop at two stages named once.
    expect(draftCost([line("malt", "60"), line("citra", "1"), line("citra", "0.5")], costs, name))
      .toEqual({ costCentsPerBbl: 9001, uncosted: [], unreceived: ["Citra"], outOfStock: ["Citra"] });
  });

  it("gives no cost while a line's material has none, or is one the page cannot see", () => {
    expect(draftCost([line("malt", "60"), line("yeast", "1"), line("gone", "2")], costs, name))
      .toEqual({ costCentsPerBbl: null, uncosted: ["House yeast", "Retired hop"], unreceived: [], outOfStock: ["Retired hop"] });
  });

  it("leaves out a line still being typed, and an empty sheet has no cost", () => {
    expect(draftCost([line("malt", "60"), line("", "5"), line("citra", "")], costs, name))
      .toEqual({ costCentsPerBbl: 6000, uncosted: [], unreceived: [], outOfStock: [] });
    expect(draftCost([], costs, name)).toEqual({ costCentsPerBbl: null, uncosted: [], unreceived: [], outOfStock: [] });
  });
});

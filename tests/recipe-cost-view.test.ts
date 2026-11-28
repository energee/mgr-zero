// tests/recipe-cost-view.test.ts — the lines the recipe page writes about a
// saved copy's ingredient cost (recipeCostNotes): the cost per barrel and for
// the batch, which ingredients rest on a typed price, and which are not in stock.
import { describe, expect, it } from "vitest";
import { recipeCostNotes } from "../lib/mgr/recipe-cost-view";

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

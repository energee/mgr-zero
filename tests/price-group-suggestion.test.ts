// tests/price-group-suggestion.test.ts — which price group a recipe cost
// suggests: the band rule, the edges, and the copy the Brand page draws.
import { describe, expect, it } from "vitest";
import { suggestPriceGroup } from "../lib/mgr/price-group-suggestion";

const groups = [
  { id: "g1", name: "1", position: 1, cost_ceiling_cents: 4500 },
  { id: "g2", name: "2", position: 2, cost_ceiling_cents: 6500 },
  { id: "g3", name: "3", position: 3, cost_ceiling_cents: null },
];

describe("suggestPriceGroup", () => {
  it("picks the first group in position order whose ceiling covers the cost", () => {
    expect(suggestPriceGroup({ costCentsPerBbl: 4810, uncosted: [], groups })).toEqual({
      kind: "group", groupId: "g2", title: "Suggested group 2", detail: "recipe cost $48.10/bbl · ceiling $65.00/bbl",
    });
    expect(suggestPriceGroup({ costCentsPerBbl: 4500, uncosted: [], groups })?.kind === "group" && suggestPriceGroup({ costCentsPerBbl: 4500, uncosted: [], groups })).toMatchObject({ groupId: "g1" });
  });

  it("says so when the cost clears every ceiling, naming the highest", () => {
    expect(suggestPriceGroup({ costCentsPerBbl: 9000, uncosted: [], groups })).toEqual({
      kind: "above", title: "Above every ceiling", detail: "recipe cost $90.00/bbl · highest ceiling $65.00/bbl",
    });
  });

  it("shows the cost alone when no group has a ceiling", () => {
    const bare = groups.map((g) => ({ ...g, cost_ceiling_cents: null }));
    expect(suggestPriceGroup({ costCentsPerBbl: 4810, uncosted: [], groups: bare })).toEqual({
      kind: "cost", title: "Recipe cost $48.10/bbl", detail: "no price group has a ceiling",
    });
  });

  it("refuses to suggest from a partly costed recipe and names the gaps", () => {
    expect(suggestPriceGroup({ costCentsPerBbl: 1200, uncosted: ["Citra", "Mosaic"], groups })).toEqual({
      kind: "unknown", title: "Recipe cost unknown", detail: "no receipt cost yet for Citra, Mosaic",
    });
  });

  it("is silent for a brand with no recipe", () => {
    expect(suggestPriceGroup({ costCentsPerBbl: null, uncosted: [], groups })).toBeNull();
  });
});

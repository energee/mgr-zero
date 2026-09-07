// tests/recipe-gravity.test.ts — pins the one golden example for
// recipeGravity by hand, per lib/recipe-gravity.ts's module comment. No DB.
import { describe, expect, it } from "vitest";
import { recipeGravity } from "../lib/recipe-gravity";

describe("recipeGravity", () => {
  it("computes OG/FG/ABV for a single mash-stage ingredient (hand-derived golden example)", () => {
    // 10 lb 2-row @ 1.037 potential, 75% brewhouse efficiency, 1 bbl, 75% attenuation.
    //   GU = 10 * (1.037-1)*1000 * 0.75 / 31 = 277.5 / 31 = 8.9516129032258...
    //   OG(SG) = 1 + 8.9516129032258/1000 = 1.0089516129032258
    //   FG(SG) = 1 + (OG-1)*(1-0.75) = 1.0022379032258064
    //   Plato(SG) = -616.868 + 1111.14*SG - 630.272*SG^2 + 135.997*SG^3
    //     ogPlato = 2.294056595291295 -> 2.29
    //     fgPlato = 0.5745809755756852 -> 0.57
    //   ABV = (OG - FG) * 131.25 = 0.8811743951613049 -> 0.88
    const result = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 10, extractPotential: 1.037, stage: "mash" }],
    });

    expect(result.ogPlato).toBeCloseTo(2.29, 2);
    expect(result.fgPlato).toBeCloseTo(0.57, 2);
    expect(result.abv).toBeCloseTo(0.88, 2);
  });

  it("ignores non-mash-stage ingredients (e.g. boil hops carry no extract here)", () => {
    const withBoilAddition = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [
        { perBblQty: 10, extractPotential: 1.037, stage: "mash" },
        { perBblQty: 1, extractPotential: 1.05, stage: "boil" },
      ],
    });
    const mashOnly = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 10, extractPotential: 1.037, stage: "mash" }],
    });
    expect(withBoilAddition).toEqual(mashOnly);
  });

  it("answers water's Plato and zero ABV for no mash ingredients", () => {
    // No mash ingredients -> OG = FG = 1.000 SG. The ASBC cubic isn't exactly
    // zero at SG 1 (Plato(1) = -616.868 + 1111.14 - 630.272 + 135.997 = -0.003).
    const result = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [],
    });
    expect(result.ogPlato).toBeCloseTo(-0.003, 3);
    expect(result.fgPlato).toBeCloseTo(-0.003, 3);
    expect(result.abv).toBeCloseTo(0, 5);
  });
});

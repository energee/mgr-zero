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
    //   Plato(SG) = max(0, -616.868 + 1111.14*SG - 630.272*SG^2 + 135.997*SG^3)
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
    // No mash ingredients -> OG = FG = 1.000 SG. The ASBC cubic reads -0.003
    // at SG 1, so the conversion clamps at 0: water is 0 °P, never negative.
    const result = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [],
    });
    expect(result.ogPlato).toBe(0);
    expect(result.fgPlato).toBe(0);
    expect(result.abv).toBeCloseTo(0, 5);
  });

  it("skips an ingredient with no extract potential instead of producing NaN", () => {
    // extract_snapshot is null in SQL whenever the material never had a
    // potential typed on it (a hop, an unmeasured adjunct). Reaching the
    // formula with null used to make the whole prediction NaN; the ingredient
    // is skipped and the rest still predicts.
    const withUnknown = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [
        { perBblQty: 10, extractPotential: 1.037, stage: "mash" },
        { perBblQty: 5, extractPotential: null, stage: "mash" },
        { perBblQty: 5, extractPotential: undefined, stage: "mash" },
      ],
    });
    const known = recipeGravity({
      mashTempF: 152,
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 10, extractPotential: 1.037, stage: "mash" }],
    });
    expect(Number.isNaN(withUnknown.ogPlato)).toBe(false);
    expect(withUnknown).toEqual(known);
  });
});

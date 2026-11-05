// tests/recipe-gravity.test.ts — pins the one golden example for
// recipeGravity by hand, per lib/recipe-gravity.ts's module comment. No DB.
import { describe, expect, it } from "vitest";
import { gravityBlockers, measuredGravity, platoToSg, potentialPointsPerBbl, recipeGravity, sgToPlato } from "../lib/recipe-gravity";

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
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" }],
    });

    expect(result?.ogPlato).toBeCloseTo(2.29, 2);
    expect(result?.fgPlato).toBeCloseTo(0.57, 2);
    expect(result?.abv).toBeCloseTo(0.88, 2);
  });

  it("ignores non-mash-stage ingredients (e.g. boil hops carry no extract here)", () => {
    const withBoilAddition = recipeGravity({
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [
        { perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" },
        { perBblQty: 1, extractPotential: 1.05, stage: "boil", unit: "lb" },
      ],
    });
    const mashOnly = recipeGravity({
      brewhouseEfficiency: 0.75,
      yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" }],
    });
    expect(withBoilAddition).toEqual(mashOnly);
  });

  // #430: nothing wrote materials.extract_potential, so every recipe printed
  // "Predicted: OG 0.0 °P" — a prediction built on missing data. No answer
  // (null) is what the caller hides; a partial or empty bill never predicts.
  it("predicts nothing (null, not 0) when no mash ingredient carries extract", () => {
    expect(recipeGravity({ brewhouseEfficiency: 0.75, yeastAttenuation: 0.75, ingredients: [] })).toBeNull();
    expect(recipeGravity({
      brewhouseEfficiency: 0.75, yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 1, extractPotential: 1.05, stage: "boil", unit: "lb" }],
    })).toBeNull();
  });

  it("predicts nothing while any mash ingredient lacks an extract potential", () => {
    // extract_snapshot is null in SQL whenever the material never had a
    // potential typed on it. Skipping it would under-predict OG with no sign
    // of it, so there is no prediction until every mash ingredient has one.
    for (const missing of [null, undefined]) {
      expect(recipeGravity({
        brewhouseEfficiency: 0.75, yeastAttenuation: 0.75,
        ingredients: [
          { perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" },
          { perBblQty: 5, extractPotential: missing, stage: "mash", unit: "lb" },
        ],
      })).toBeNull();
    }
  });

  it("converts each mash ingredient's base unit to pounds before PPG applies (#540)", () => {
    const inLb = recipeGravity({ brewhouseEfficiency: 0.75, yeastAttenuation: 0.75,
      ingredients: [{ perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" }] })!;
    for (const [qty, unit] of [[10 / 2.20462, "kg"], [160, "oz"], [10 * 453.592, "g"]] as const) {
      const other = recipeGravity({ brewhouseEfficiency: 0.75, yeastAttenuation: 0.75,
        ingredients: [{ perBblQty: qty, extractPotential: 1.037, stage: "mash", unit }] })!;
      expect(other.ogPlato).toBeCloseTo(inLb.ogPlato, 3);
    }
  });

  it("predicts nothing when a mash ingredient is not stocked by mass (#540)", () => {
    for (const unit of ["gal", "l", "ml", "each", undefined]) {
      expect(recipeGravity({ brewhouseEfficiency: 0.75, yeastAttenuation: 0.75,
        ingredients: [
          { perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" },
          { perBblQty: 1, extractPotential: 1.04, stage: "mash", unit },
        ] })).toBeNull();
    }
  });
});

// QW3: the recipe page says why a prediction is missing, so it needs the
// reasons, not only recipeGravity's null. Index is the line's position in the
// input array, so the page can point at the row.
describe("gravityBlockers", () => {
  const boil = { perBblQty: 1, extractPotential: null, stage: "boil", unit: "gal" };
  const malt = { perBblQty: 10, extractPotential: 1.037, stage: "mash", unit: "lb" };
  const gravity = (ingredients: Parameters<typeof gravityBlockers>[0]) =>
    recipeGravity({ brewhouseEfficiency: 0.75, yeastAttenuation: 0.75, ingredients });

  it("names a mash line with no extract potential", () => {
    const ingredients = [malt, boil, { ...malt, extractPotential: null }];
    expect(gravityBlockers(ingredients)).toEqual([{ index: 2, reason: "no_extract" }]);
    expect(gravity(ingredients)).toBeNull();
  });

  it("names a mash line stocked by volume", () => {
    const ingredients = [{ ...malt, unit: "gal" }, malt];
    expect(gravityBlockers(ingredients)).toEqual([{ index: 0, reason: "no_weight" }]);
    expect(gravity(ingredients)).toBeNull();
  });

  it("names both reasons on one line", () => {
    const ingredients = [malt, { ...malt, extractPotential: undefined, unit: "each" }];
    expect(gravityBlockers(ingredients)).toEqual([
      { index: 1, reason: "no_extract" },
      { index: 1, reason: "no_weight" },
    ]);
    expect(gravity(ingredients)).toBeNull();
  });

  it("is empty when every mash line is predictable, and ignores other stages", () => {
    const ingredients = [malt, boil];
    expect(gravityBlockers(ingredients)).toEqual([]);
    expect(gravity(ingredients)).not.toBeNull();
  });
});

describe("potentialPointsPerBbl", () => {
  it("is the mash bill's points per barrel at 100% efficiency", () => {
    // 62 lb at 1.037: 62 * 37 / 31 = 74 points. Hops carry none; 16 oz is one pound.
    expect(potentialPointsPerBbl([
      { perBblQty: 62, extractPotential: 1.037, stage: "mash", unit: "lb" },
      { perBblQty: 1, extractPotential: null, stage: "boil", unit: "lb" },
    ])).toBeCloseTo(74, 6);
    expect(potentialPointsPerBbl([{ perBblQty: 992, extractPotential: 1.037, stage: "mash", unit: "oz" }])).toBeCloseTo(74, 6);
  });

  it("is null with no mash line or any blocked line, as recipeGravity is", () => {
    expect(potentialPointsPerBbl([])).toBeNull();
    expect(potentialPointsPerBbl([{ perBblQty: 62, extractPotential: null, stage: "mash", unit: "lb" }])).toBeNull();
    expect(potentialPointsPerBbl([{ perBblQty: 2, extractPotential: 1.037, stage: "mash", unit: "gal" }])).toBeNull();
  });
});

describe("measuredGravity", () => {
  const potential = 74;

  it("reads a short knockout at its true efficiency: 28.5 of 30 bbl at 72%", () => {
    // The grain for 30 bbl at 72% lands in 28.5 bbl of wort, so the OG runs high.
    const ogSg = 1 + (potential * 30 * 0.72) / 28.5 / 1000;
    const measured = measuredGravity({ ogPlato: sgToPlato(ogSg), fgPlato: null, potentialPointsPerBbl: potential, plannedBbl: 30, knockoutBbl: 28.5 });
    // sgToPlato and platoToSg are approximations of each other, so the round trip costs a little.
    expect(measured.brewhouseEfficiency).toBeCloseTo(0.72, 2);
  });

  it("computes ABV and apparent attenuation in SG", () => {
    const measured = measuredGravity({ ogPlato: 14.8, fgPlato: 3.5, potentialPointsPerBbl: null, plannedBbl: 30, knockoutBbl: null });
    const [og, fg] = [platoToSg(14.8), platoToSg(3.5)];
    expect(measured.abv).toBeCloseTo((og - fg) * 131.25, 6);
    expect(measured.apparentAttenuation).toBeCloseTo((og - fg) / (og - 1), 6);
  });

  it("keeps ABV under 20 from Plato inputs (v1 read Plato as SG and printed about 1508)", () => {
    expect(measuredGravity({ ogPlato: 14.8, fgPlato: 3.3, potentialPointsPerBbl: null, plannedBbl: 30, knockoutBbl: null }).abv).toBeLessThan(20);
  });

  it("a null FG nulls ABV and attenuation and keeps efficiency", () => {
    expect(measuredGravity({ ogPlato: 14.8, fgPlato: null, potentialPointsPerBbl: potential, plannedBbl: 30, knockoutBbl: 30 })).toEqual({
      abv: null, apparentAttenuation: null, brewhouseEfficiency: expect.any(Number),
    });
  });

  it("a null OG nulls every metric, never 0", () => {
    expect(measuredGravity({ ogPlato: null, fgPlato: null, potentialPointsPerBbl: potential, plannedBbl: 30, knockoutBbl: 30 })).toEqual({
      abv: null, apparentAttenuation: null, brewhouseEfficiency: null,
    });
  });

  it("a null knockout or a null or zero potential nulls efficiency", () => {
    const input = { ogPlato: 14.8, fgPlato: 3.5, plannedBbl: 30 };
    expect(measuredGravity({ ...input, potentialPointsPerBbl: potential, knockoutBbl: null }).brewhouseEfficiency).toBeNull();
    expect(measuredGravity({ ...input, potentialPointsPerBbl: null, knockoutBbl: 30 }).brewhouseEfficiency).toBeNull();
    // A rice-hull-only bill bears no extract: dividing by it would print Infinity.
    expect(measuredGravity({ ...input, potentialPointsPerBbl: 0, knockoutBbl: 30 }).brewhouseEfficiency).toBeNull();
  });

  it("an OG of water has no attenuation rather than a division by zero", () => {
    expect(measuredGravity({ ogPlato: 0, fgPlato: 0, potentialPointsPerBbl: null, plannedBbl: 30, knockoutBbl: null }).apparentAttenuation).toBeNull();
  });
});

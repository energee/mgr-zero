// lib/recipe-gravity.ts — the one pure gravity calculation recipe RPCs and
// the editor preview call: given a recipe version's assumption columns
// (mashTempF, brewhouseEfficiency, yeastAttenuation) and its ingredients'
// per-bbl quantities and extract potentials, predicts OG/FG/ABV. Only
// `stage: "mash"` ingredients contribute extract — boil/whirlpool/dry-hop
// additions carry aroma/bitterness, not fermentable sugar, so they are
// excluded here (brewing-domain.md does not spell this equation; this
// implementation and its constants are pinned by the golden example in
// tests/recipe-gravity.test.ts). Not duplicated in SQL.
//
// Formula (extractPotential is SG-style, e.g. 1.037 = 37 PPG; 1 bbl = 31 US gal):
//   GU        = sum(perBblQty * (extractPotential - 1) * 1000 * brewhouseEfficiency) / 31
//   OG (SG)   = 1 + GU / 1000
//   FG (SG)   = 1 + (OG - 1) * (1 - yeastAttenuation)
//   Plato(SG) = max(0, -616.868 + 1111.14*SG - 630.272*SG^2 + 135.997*SG^3)  (ASBC cubic, clamped at water)
//   ABV       = (OG - FG) * 131.25
//
// mashTempF is accepted (recipe_versions.mash_temp_f) but does not affect
// this gravity prediction; it is reserved for a later mash-efficiency model.

export type RecipeGravityIngredient = {
  perBblQty: number;
  extractPotential: number;
  stage: string;
};

export type RecipeGravityInput = {
  mashTempF: number;
  brewhouseEfficiency: number;
  yeastAttenuation: number;
  ingredients: RecipeGravityIngredient[];
};

export type RecipeGravityResult = {
  ogPlato: number;
  fgPlato: number;
  abv: number;
};

const BBL_TO_GALLONS = 31;

/**
 * ASBC cubic approximation converting specific gravity to degrees Plato.
 * Clamped at 0: the cubic returns -0.003 at SG 1.000, and negative Plato is
 * not a thing a brewer can read — water is 0 °P.
 */
export function sgToPlato(sg: number): number {
  return Math.max(0, -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3);
}

/**
 * Plato back to specific gravity. The ASBC cubic above has no closed-form
 * inverse, so this is the standard brewing approximation
 * `sg = 1 + P / (258.6 - (P / 258.2) * 227.1)` rather than an exact reversal:
 * a Plato -> SG -> Plato round trip lands within 0.001 SG, which is finer than
 * any hydrometer a brewer reads. Lives here so the two conversions stay one
 * pair in one file (lib/mgr/gravity-unit.ts formats with it).
 */
export function platoToSg(plato: number): number {
  return 1 + plato / (258.6 - (plato / 258.2) * 227.1);
}

/** Predicts OG/FG/ABV from a recipe version's mash-stage ingredients. */
export function recipeGravity(input: RecipeGravityInput): RecipeGravityResult {
  const gravityUnits =
    input.ingredients
      .filter((ingredient) => ingredient.stage === "mash")
      .reduce(
        (sum, ingredient) =>
          sum + ingredient.perBblQty * (ingredient.extractPotential - 1) * 1000 * input.brewhouseEfficiency,
        0,
      ) / BBL_TO_GALLONS;

  const og = 1 + gravityUnits / 1000;
  const fg = 1 + (og - 1) * (1 - input.yeastAttenuation);

  return {
    ogPlato: sgToPlato(og),
    fgPlato: sgToPlato(fg),
    abv: (og - fg) * 131.25,
  };
}

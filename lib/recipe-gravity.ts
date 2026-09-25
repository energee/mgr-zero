// lib/recipe-gravity.ts — the one pure gravity calculation recipe RPCs and
// the editor preview call: given a recipe version's assumption columns
// (brewhouseEfficiency, yeastAttenuation) and its ingredients'
// per-bbl quantities and extract potentials, predicts OG/FG/ABV.
//
// Only `stage: "mash"` ingredients contribute extract here. That is a
// simplification this implementation makes, NOT a fact about brewing: kettle
// sugars, dextrose, honey and syrups are added at boil and are real, fully
// fermentable extract, and a recipe that uses them is under-predicted by this
// function. The stage is standing in for a property it does not actually
// carry. The upgrade path is a material-level flag ("this material bears
// extract wherever it is added") so the filter reads the material rather than
// guessing from when it goes in.
// ponytail: replace the stage filter with a `materials.bears_extract` boolean
// (snapshotted onto recipe_ingredients like extract_potential already is) —
// one column and one predicate, no new formula.
//
// Volume basis: `perBblQty` is per barrel of finished wort into the fermenter,
// post-boil — not per barrel of mash, kettle-full or packaged beer. Boil-off
// and trub loss are therefore already accounted for by the brewer when the
// recipe is written; this function never models them.
//
// Mass unit (#540): PPG is gravity points per POUND per gallon, and
// `perBblQty` is in the material's base_uom, so each mash ingredient is
// converted to pounds first. A mash ingredient stocked by volume or count
// (syrup in gal, "each") has no honest weight, so there is no prediction.
//
// brewing-domain.md does not spell this equation; this implementation and its
// constants are pinned by the golden example in tests/recipe-gravity.test.ts.
// Not duplicated in SQL.
//
// Formula (extractPotential is SG-style, e.g. 1.037 = 37 PPG; 1 bbl = 31 US gal):
//   GU        = sum(perBblQty * (extractPotential - 1) * 1000 * brewhouseEfficiency) / 31
//   OG (SG)   = 1 + GU / 1000
//   FG (SG)   = 1 + (OG - 1) * (1 - yeastAttenuation)
//   Plato(SG) = max(0, -616.868 + 1111.14*SG - 630.272*SG^2 + 135.997*SG^3)  (ASBC cubic, clamped at water)
//   ABV       = (OG - FG) * 131.25
//
// recipe_versions.mash_temp_f is stored but not an input here: it is reserved
// for a later mash-efficiency model, so callers do not marshal it.

export type RecipeGravityIngredient = {
  perBblQty: number;
  /** Null when the material never had one typed (recipe_ingredients.extract_snapshot
   * is nullable). A mash ingredient without one means no prediction — see recipeGravity. */
  extractPotential: number | null | undefined;
  stage: string;
  /** The material's base_uom; perBblQty is in this unit. */
  unit: string | null | undefined;
};

export type RecipeGravityInput = {
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
/** Pounds per one of each mass unit in public.uom. */
const LB_PER: Record<string, number> = { lb: 1, kg: 2.20462, oz: 1 / 16, g: 0.00220462 };

/**
 * ASBC cubic approximation converting specific gravity to degrees Plato.
 * At or above SG 1.000 it is clamped at 0, because the cubic returns -0.003 at
 * exactly 1.000 and water is 0 °P. Below 1.000 it goes negative: a dry finished
 * beer (FG 0.998 is about -0.5 °P) is a real reading, and clamping it stored 0
 * and read it back as 1.000.
 */
export function sgToPlato(sg: number): number {
  const plato = -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
  return sg >= 1 ? Math.max(0, plato) : plato;
}

/**
 * Plato back to specific gravity. The ASBC cubic above has no closed-form
 * inverse, so this is the standard brewing approximation
 * `sg = 1 + P / (258.6 - (P / 258.2) * 227.1)` rather than an exact reversal:
 * a Plato → SG → Plato round trip lands within 0.001 SG, which is finer than
 * any hydrometer a brewer reads. Lives here so the two conversions stay one
 * pair in one file (lib/mgr/gravity-unit.ts formats with it).
 */
export function platoToSg(plato: number): number {
  return 1 + plato / (258.6 - (plato / 258.2) * 227.1);
}

/**
 * Predicts OG/FG/ABV from a recipe version's mash-stage ingredients, or null
 * when there is nothing honest to predict: no mash ingredient, or any mash
 * ingredient without an extract potential. A null/undefined potential means
 * nobody typed one on the material (recipe_ingredients.extract_snapshot is
 * nullable), which is not "contributes nothing" — skipping it would
 * under-predict OG with no sign of it, and defaulting it would invent one.
 * Callers hide the prediction on null rather than print 0.0 (#430). A mash
 * ingredient that truly bears no extract (rice hulls) is given 1.000.
 * A mash ingredient whose unit is not a mass also means no prediction (#540).
 */
export function recipeGravity(input: RecipeGravityInput): RecipeGravityResult | null {
  const mash = input.ingredients.filter((ingredient) => ingredient.stage === "mash");
  if (mash.length === 0 || mash.some((ingredient) => ingredient.extractPotential == null || !LB_PER[ingredient.unit ?? ""])) return null;
  const gravityUnits =
    mash.reduce(
      (sum, ingredient) =>
        sum + ingredient.perBblQty * LB_PER[ingredient.unit!] * (ingredient.extractPotential! - 1) * 1000 * input.brewhouseEfficiency,
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

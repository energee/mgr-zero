// lib/uom.ts — converts an amount between two units of one kind, mass or
// volume, such as a recipe's water addition typed in grams for a material
// stocked in pounds. Units are the materials' uom enum plus the water
// addition units (g, mL, oz); case does not matter. Factors are exact.

const GRAMS: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const MILLILITERS: Record<string, number> = { ml: 1, l: 1000, gal: 3785.411784 };

/** `qty` in `from` expressed in `to`, or null when the two are not the same kind (mass to volume, or "each"). */
export function convertUom(qty: number, from: string, to: string): number | null {
  const [a, b] = [from.toLowerCase(), to.toLowerCase()];
  for (const table of [GRAMS, MILLILITERS]) {
    if (a in table && b in table) return qty * table[a] / table[b];
  }
  return null;
}

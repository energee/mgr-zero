// lib/mgr/recipe-cost-view.ts — the words for a recipe's ingredient cost.
// recipe_version_costs works the cost out on read: each ingredient at its last
// purchase-order receipt cost, else at the material's typed price. These
// helpers say what the cost is, which ingredients rest on a typed price no
// purchase order backs, and which are not in stock. The recipe editor works the
// cost of the sheet out as it is typed (draftCost, from list_material_costs) and
// draws recipeCostNotes; the Brand page's price-group suggestion shares the phrases.
import type { RecipeVersionCost } from "@/lib/commands/recipe-cost";
import { money } from "./money";
import { plural } from "./plural";

/** A recipe's cost with the names of the ingredients that have nothing on hand now: what get_recipe returns for a
 *  saved copy, and what draftCost works out for the sheet being edited. */
export type RecipeCostNote = RecipeVersionCost & { outOfStock: string[] };

// A recipe can miss a dozen ingredients; naming three keeps the line short.
const namesUpTo3 = (names: string[]) => names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");

/** "2 ingredients have no price yet: Citra, Mosaic" */
export const uncostedText = (names: string[]) => `${plural(names.length, "ingredient has", "ingredients have")} no price yet: ${namesUpTo3(names)}`;

/** "typed price, no receipt cost: Citra, Vienna" */
export const unreceivedText = (names: string[]) => `typed price, no receipt cost: ${namesUpTo3(names)}`;

const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}.`;

/** The recipe page's cost lines for a sheet written for `bbl` barrels (0 when it has no batch size). */
export function recipeCostNotes(cost: RecipeCostNote | undefined, bbl: number): string[] {
  if (!cost) return [];
  const { costCentsPerBbl, uncosted, unreceived, outOfStock } = cost;
  return [
    uncosted.length ? `Ingredient cost unknown · ${uncostedText(uncosted)}.`
      // No uncosted ingredient and still no cost: the copy has no ingredients.
      : costCentsPerBbl == null ? ""
      : `Ingredients cost ${money(costCentsPerBbl)}/bbl${bbl > 0 ? `, ${money(Math.round(costCentsPerBbl * bbl))} for ${bbl} bbl` : ""}.`,
    unreceived.length ? sentence(unreceivedText(unreceived)) : "",
    outOfStock.length ? `None in stock: ${namesUpTo3(outOfStock)}.` : "",
  ].filter(Boolean);
}

/** One material's cost per base unit as list_material_costs returns it, keyed by material id for the editor. */
export type MaterialCost = { unitCostCents: number | null; fromReceipt: boolean; inStock: boolean };

/** The cost of the sheet as typed: each ready line's amount per barrel at its material's cost, the barrel rounded
 *  once, as recipe_version_costs rounds a saved copy. A line with no material or amount yet is left out. A material
 *  the page has no cost row for (an inactive one) counts as unpriced and out of stock, so no number is made up. */
export function draftCost(
  lines: readonly { materialId: string; perBblQty: string }[],
  costs: Readonly<Record<string, MaterialCost | undefined>>,
  name: (materialId: string) => string,
): RecipeCostNote {
  const ready = lines.filter((line) => line.materialId !== "" && Number(line.perBblQty) > 0);
  const names = (keep: (cost: MaterialCost | undefined) => boolean) =>
    [...new Set(ready.filter((line) => keep(costs[line.materialId])).map((line) => name(line.materialId)))].sort();
  const uncosted = names((cost) => cost?.unitCostCents == null);
  return {
    costCentsPerBbl: uncosted.length || !ready.length ? null
      : Math.round(ready.reduce((sum, line) => sum + Number(line.perBblQty) * (costs[line.materialId]?.unitCostCents ?? 0), 0)),
    uncosted,
    unreceived: names((cost) => cost?.unitCostCents != null && !cost.fromReceipt),
    outOfStock: names((cost) => !cost?.inStock),
  };
}

/** list_material_costs rows as the editor's lookup by material id. */
export const toMaterialCosts = (rows: readonly { material_id: string; unit_cost_cents: number | null; from_receipt: boolean; in_stock: boolean }[]): Record<string, MaterialCost> =>
  Object.fromEntries(rows.map((row) => [row.material_id, { unitCostCents: row.unit_cost_cents, fromReceipt: row.from_receipt, inStock: row.in_stock }]));

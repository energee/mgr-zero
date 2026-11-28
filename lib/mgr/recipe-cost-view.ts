// lib/mgr/recipe-cost-view.ts — the words for a recipe's ingredient cost.
// recipe_version_costs works the cost out on read: each ingredient at its last
// purchase-order receipt cost, else at the material's typed price. These
// helpers say what the cost is, which ingredients rest on a typed price no
// purchase order backs, and which are not in stock. The recipe page draws
// recipeCostNotes; the Brand page's price-group suggestion shares the phrases.
import type { RecipeVersionCost } from "@/lib/commands/recipe-cost";
import { money } from "./money";
import { plural } from "./plural";

/** A recipe copy's cost as get_recipe returns it: the cost, and the names of the ingredients with nothing on hand now. */
export type RecipeCostNote = RecipeVersionCost & { outOfStock: string[] };

// A recipe can miss a dozen ingredients; naming three keeps the line short.
const namesUpTo3 = (names: string[]) => names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");

/** "2 ingredients have no price yet: Citra, Mosaic" */
export const uncostedText = (names: string[]) => `${plural(names.length, "ingredient has", "ingredients have")} no price yet: ${namesUpTo3(names)}`;

/** "typed price, no receipt cost: Citra, Vienna" */
export const unreceivedText = (names: string[]) => `typed price, no receipt cost: ${namesUpTo3(names)}`;

const sentence = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}.`;

/** The recipe page's cost lines for a saved copy written for `bbl` barrels (0 when it has no batch size). */
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

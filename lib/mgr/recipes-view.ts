// lib/mgr/recipes-view.ts — view-model for the Recipes list. Each row is a
// recipe's name, its current version number (null: no version yet) and its
// brand (null: none yet), one RecordTable column each. `backHref`,
// `createHref` and `waterProfilesHref` are the live destinations of the More
// back, New recipe and the Water profiles row (where a version's source and
// target come from); fixtures leave them unset so the inventory frame stays inert.
// Inventory and live both pass list_recipes rows, so the frame draws live copy.
import type { EmptyState } from "./empty-state";
export type RecipesRowView = {
  key: string;
  name: string;
  version: number | null;
  brand: string | null;
  href: string;
};

export type RecipesViewModel = {
  backHref?: string;
  createHref?: string;
  waterProfilesHref?: string;
  rows: RecipesRowView[];
  empty?: EmptyState;
};

export type RecipesSnapshot = {
  backHref?: string;
  createHref?: string;
  waterProfilesHref?: string;
  recipes: { id: string; name: string; brand?: string | null; latest_version: number | null }[];
  /** A search is on, so an empty list means no match, not no recipes. */
  filtered?: boolean;
};

const NO_RECIPES: EmptyState = { title: "No recipes yet", description: "A recipe is the grain and hop bill a batch is brewed from." };
const NO_MATCH: EmptyState = { title: "No recipes match", description: "Clear the search to see every recipe." };

export function toRecipesViewProps(s: RecipesSnapshot): RecipesViewModel {
  const { backHref, createHref, waterProfilesHref, recipes } = s;
  return {
    backHref,
    createHref,
    waterProfilesHref,
    empty: recipes.length > 0 ? undefined : s.filtered ? NO_MATCH : NO_RECIPES,
    rows: recipes.map((r) => ({ key: r.id, name: r.name, version: r.latest_version, brand: r.brand ?? null, href: `/recipes/${r.id}` })),
  };
}

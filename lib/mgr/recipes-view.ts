// lib/mgr/recipes-view.ts — view-model for the Recipes list. Each row is a
// recipe titled with its current version ("Hazy IPA v4"); a recipe with no
// version yet says so and carries the warning class. `backHref`,
// `createHref` and `waterProfilesHref` are the live destinations of the More
// back, New recipe and the Water profiles row (where a version's source and
// target come from); fixtures leave them unset so the inventory frame stays inert.
import type { EmptyState } from "./empty-state";
export type RecipesRowView = {
  key: string;
  title: string;
  detail: string;
  warning?: boolean;
  href?: string;
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
  rows?: RecipesRowView[];
  recipes?: { id: string; name: string; brand?: string | null; latest_version: number | null }[];
  /** A search is on, so an empty list means no match, not no recipes. */
  filtered?: boolean;
};

const NO_RECIPES: EmptyState = { title: "No recipes yet", description: "A recipe is the grain and hop bill a batch is brewed from." };
const NO_MATCH: EmptyState = { title: "No recipes match", description: "Clear the search to see every recipe." };

export function toRecipesViewProps(s: RecipesSnapshot): RecipesViewModel {
  const { backHref, createHref, waterProfilesHref } = s;
  const empty = (count: number) => count > 0 ? undefined : s.filtered ? NO_MATCH : NO_RECIPES;
  if (s.rows) {
    return { backHref, createHref, waterProfilesHref, rows: s.rows, empty: empty(s.rows.length) };
  }
  const recipes = s.recipes ?? [];
  return {
    backHref,
    createHref,
    waterProfilesHref,
    empty: empty(recipes.length),
    rows: recipes.map((r) => {
      const href = `/recipes/${r.id}`;
      if (r.latest_version === null) {
        return { key: r.id, title: r.name, detail: "No version yet", warning: true, href };
      }
      return { key: r.id, title: `${r.name} v${r.latest_version}`, detail: r.brand ?? "No brand yet", href };
    }),
  };
}

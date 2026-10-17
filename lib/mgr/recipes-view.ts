// lib/mgr/recipes-view.ts — view-model for the Recipes list. Each row is a
// recipe titled with its current version ("Hazy IPA v4"); a recipe with no
// version yet says so and carries the warning class. `backHref` and
// `createHref` are the live destinations of the More back and New recipe;
// fixtures leave them unset so the inventory frame stays inert.
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
  rows: RecipesRowView[];
  empty?: EmptyState;
};

export type RecipesSnapshot = {
  backHref?: string;
  createHref?: string;
  rows?: RecipesRowView[];
  recipes?: { id: string; name: string; brand?: string | null; latest_version: number | null }[];
};

const NO_RECIPES: EmptyState = { title: "No recipes yet", description: "A recipe is the grain and hop bill a batch is brewed from." };

export function toRecipesViewProps(s: RecipesSnapshot): RecipesViewModel {
  const { backHref, createHref } = s;
  if (s.rows) {
    return { backHref, createHref, rows: s.rows, empty: s.rows.length === 0 ? NO_RECIPES : undefined };
  }
  const recipes = s.recipes ?? [];
  return {
    backHref,
    createHref,
    empty: recipes.length === 0 ? NO_RECIPES : undefined,
    rows: recipes.map((r) => {
      const href = `/recipes/${r.id}`;
      if (r.latest_version === null) {
        return { key: r.id, title: r.name, detail: "no version yet", warning: true, href };
      }
      return { key: r.id, title: `${r.name} v${r.latest_version}`, detail: r.brand ?? "no brand yet", href };
    }),
  };
}

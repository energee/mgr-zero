// lib/mgr/recipes-view.ts — view-model for the Recipes list.
import type { EmptyState } from "./empty-state";
export type RecipesRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning?: boolean;
  href?: string;
};

export type RecipesViewModel = {
  backHref?: string;
  rows: RecipesRowView[];
  empty?: EmptyState;
};

export type RecipesSnapshot = {
  backHref?: string;
  rows?: RecipesRowView[];
  recipes?: { id: string; name: string; brand?: string | null }[];
};

const NO_RECIPES: EmptyState = { title: "No recipes yet", description: "A recipe is the grain and hop bill a batch is brewed from." };

export function toRecipesViewProps(s: RecipesSnapshot): RecipesViewModel {
  if (s.rows) {
    return { backHref: s.backHref, rows: s.rows, empty: s.rows.length === 0 ? NO_RECIPES : undefined };
  }
  const recipes = s.recipes ?? [];
  return {
    backHref: s.backHref,
    empty: recipes.length === 0 ? NO_RECIPES : undefined,
    rows: recipes.map((r) => ({
      key: r.id,
      title: r.name,
      detail: r.brand ?? "no brand yet",
      verb: "Open",
      tone: "primary",
      href: `/recipes/${r.id}`,
    })),
  };
}

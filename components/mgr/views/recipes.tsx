// components/mgr/views/recipes.tsx — Recipes list, one header for inventory
// and live: a back to More and New recipe. Each row opens its recipe, and a
// Water profiles row follows the list. Live passes the back, create, row and
// Water profiles hrefs in the model; inventory leaves them for the explorer
// to resolve.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RecipesViewModel } from "@/lib/mgr/recipes-view";

export type { RecipesViewModel };

export function RecipesView({ model, controls }: {
  model: RecipesViewModel;
  /** The search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Recipes", E.btn("New recipe", "p", model.createHref), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, row.href)}
          </Fragment>
        ))}
      {E.nav("Water profiles", "Source and target profiles", "", undefined, model.waterProfilesHref)}
    </>
  );
}

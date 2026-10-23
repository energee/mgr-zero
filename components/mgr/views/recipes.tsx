// components/mgr/views/recipes.tsx — Recipes list, one header for inventory
// and live: a back to More and New recipe. Each row opens its recipe, and a
// Water profiles row follows the list under its own Water heading. Live passes
// the back, create and Water profiles hrefs in the model, and linkRows so each
// row links its recipe; inventory leaves them for the explorer to resolve.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RecipesViewModel } from "@/lib/mgr/recipes-view";

export type { RecipesViewModel };

export function RecipesView({ model, controls, linkRows }: {
  model: RecipesViewModel;
  /** The search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  /** Live: each row links its recipe. Inventory leaves rows unlinked, as Customers does. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("More", "Recipes", E.btn("New recipe", "p", model.createHref), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
      {/* A heading, so the row reads as its own destination and not as a recipe named Water profiles. */}
      {E.ttl("Water")}
      {E.nav("Water profiles", "Source and target profiles", "", undefined, model.waterProfilesHref)}
    </>
  );
}

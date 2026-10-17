// components/mgr/views/recipes.tsx — Recipes list, one header for inventory
// and live: a back to More and New recipe. Each row opens its recipe. Live
// passes the back, create and row hrefs in the model; inventory leaves them
// for the explorer to resolve.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { RecipesViewModel } from "@/lib/mgr/recipes-view";

export type { RecipesViewModel };

export function RecipesView({ model }: { model: RecipesViewModel }) {
  return (
    <>
      {E.back("More", "Recipes", E.btn("New recipe", "p", model.createHref), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, row.href)}
          </Fragment>
        ))}
    </>
  );
}

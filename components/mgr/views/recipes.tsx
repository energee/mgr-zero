// components/mgr/views/recipes.tsx — Recipes list. Each row opens its recipe;
// live slots the header (no More back) and passes row hrefs; inventory draws
// Create recipe and leaves the rows for the explorer to resolve.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RecipesViewModel } from "@/lib/mgr/recipes-view";

export type { RecipesViewModel };

export function RecipesView({
  model,
  header,
  createAction,
}: {
  model: RecipesViewModel;
  header?: ReactNode;
  createAction?: ReactNode;
}) {
  return (
    <>
      {header ?? E.back("More", "Recipes", createAction !== undefined ? createAction : E.btn("Create recipe"), model.backHref)}
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

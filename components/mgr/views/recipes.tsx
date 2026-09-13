// components/mgr/views/recipes.tsx — Recipes list. Live slots the header
// (no More back); inventory draws Create recipe and Review.
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
            {E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}

// components/mgr/views/recipes.tsx — Recipes list. Live slots the header
// (no More back) and links Open; inventory draws Create recipe and Review.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RecipesViewModel } from "@/lib/mgr/recipes-view";

export type { RecipesViewModel };

export function RecipesView({
  model,
  header,
  createAction,
  linkRows,
}: {
  model: RecipesViewModel;
  header?: ReactNode;
  createAction?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {header ?? E.back("More", "Recipes", createAction !== undefined ? createAction : E.btn("Create recipe"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}

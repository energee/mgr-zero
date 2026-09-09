// components/mgr/views/materials-on-hand.tsx — Materials on hand. Live slots
// CountForm / MaterialForm on each row; inventory draws Count.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MaterialsOnHandRowView, MaterialsOnHandViewModel } from "@/lib/mgr/materials-on-hand-view";

export type { MaterialsOnHandViewModel };

export function MaterialsOnHandView({
  model,
  header,
  createAction,
  rowTrailing,
}: {
  model: MaterialsOnHandViewModel;
  header?: ReactNode;
  createAction?: ReactNode;
  rowTrailing?: (row: MaterialsOnHandRowView) => ReactNode;
}) {
  return (
    <>
      {header ?? E.back("Beer", "Materials on hand", createAction !== undefined ? createAction : E.btn("Add material"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(
              row.title,
              row.detail,
              rowTrailing ? rowTrailing(row) : E.act(row.verb, row.tone),
              row.disabled ? "dis" : row.warning ? "w" : "",
            )}
          </Fragment>
        ))}
    </>
  );
}

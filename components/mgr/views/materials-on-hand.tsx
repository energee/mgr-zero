// components/mgr/views/materials-on-hand.tsx — Materials on hand. Each row
// offers Edit (the material's definition) beside Count (stock at one bin).
// The live page passes MaterialForm and CountForm as rowEdit and rowCount;
// without them (the screen inventory) the row draws plain Edit and Count buttons.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MaterialsOnHandRowView, MaterialsOnHandViewModel } from "@/lib/mgr/materials-on-hand-view";

export type { MaterialsOnHandViewModel };

export function MaterialsOnHandView({
  model,
  header,
  controls,
  createAction,
  rowEdit,
  rowCount,
}: {
  model: MaterialsOnHandViewModel;
  header?: ReactNode;
  /** The search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  rowEdit?: (row: MaterialsOnHandRowView) => ReactNode;
  rowCount?: (row: MaterialsOnHandRowView) => ReactNode;
}) {
  return (
    <>
      {header ?? E.back("Beer", "Materials on hand", createAction !== undefined ? createAction : E.btn("Add material"), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(
              row.title,
              row.detail,
              <>
                {rowEdit ? rowEdit(row) : E.act("Edit")}
                {rowCount ? rowCount(row) : E.act("Count", "info")}
              </>,
              row.warning ? "w" : "",
            )}
          </Fragment>
        ))}
    </>
  );
}

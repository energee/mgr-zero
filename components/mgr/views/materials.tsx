// components/mgr/views/materials.tsx — Materials definition list (inventory).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MaterialsViewModel } from "@/lib/mgr/materials-view";

export type { MaterialsViewModel };

/** The material definitions list (/materials?view=definitions), where Edit
 * changes a material. This list is reached only from Materials on hand, so
 * the back link returns there. */
export function MaterialsView({
  model,
  createAction,
  rowAction,
}: {
  model: MaterialsViewModel;
  createAction?: ReactNode;
  rowAction?: (row: MaterialsViewModel["rows"][number]) => ReactNode;
}) {
  return (
    <>
      {E.back("Materials on hand", "Materials", createAction !== undefined ? createAction : E.btn("Add material"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>{E.row(row.title, row.detail, rowAction ? rowAction(row) : E.act(row.verb))}</Fragment>
        ))}
    </>
  );
}

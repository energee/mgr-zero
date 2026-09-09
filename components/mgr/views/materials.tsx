// components/mgr/views/materials.tsx — Materials definition list (inventory).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MaterialsViewModel } from "@/lib/mgr/materials-view";

export type { MaterialsViewModel };

export function MaterialsView({
  model,
  createAction,
}: {
  model: MaterialsViewModel;
  createAction?: ReactNode;
}) {
  return (
    <>
      {E.back("Vendors", "Materials", createAction !== undefined ? createAction : E.btn("Add material"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>{E.row(row.title, row.detail, E.act(row.verb))}</Fragment>
        ))}
    </>
  );
}

// components/mgr/views/package-bom.tsx — Package BOM sheet. Rows carry no verb
// unless the caller passes `rowAction` (the inventory passes Edit); inventory
// draws Replace BOM, live suppresses it with footer={null}.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackageBomViewModel } from "@/lib/mgr/package-bom-view";

export type { PackageBomViewModel };

export function PackageBomView({
  model,
  createAction,
  footer,
  linkRows,
  rowAction,
}: {
  model: PackageBomViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: the Format row is a link. Inventory leaves it an unlabeled tap. */
  linkRows?: boolean;
  /** The verb on each material row; none by default. */
  rowAction?: ReactNode;
}) {
  return (
    <>
      {createAction}
      {E.nav("Format", model.format, "", undefined, linkRows ? model.formatHref : undefined)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, rowAction)}
          </Fragment>
        ))}
      {footer !== undefined ? footer : E.btn("Replace BOM")}
    </>
  );
}

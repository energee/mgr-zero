// components/mgr/views/package-bom.tsx — Package BOM sheet. Inventory draws
// Edit on each material and Replace BOM; live slots the replace form in footer.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackageBomViewModel } from "@/lib/mgr/package-bom-view";

export type { PackageBomViewModel };

export function PackageBomView({
  model,
  createAction,
  footer,
  linkRows,
}: {
  model: PackageBomViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: Edit is a link. Inventory leaves it an unlabeled tap. */
  linkRows?: boolean;
}) {
  return (
    <>
      {createAction}
      {E.nav("Format", model.format, "", undefined, linkRows ? model.formatHref : undefined)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act("Edit", "primary", linkRows ? row.href : undefined))}
          </Fragment>
        ))}
      {footer !== undefined ? footer : E.btn("Replace BOM")}
    </>
  );
}

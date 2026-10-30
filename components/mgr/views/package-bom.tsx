// components/mgr/views/package-bom.tsx — Package BOM section of the Format
// page: one row per packaging material. The page header already names the
// format, so no row repeats it (#1517). Rows carry no verb unless the caller
// passes `rowAction` (the inventory passes Edit); inventory draws Replace BOM,
// live suppresses it with footer={null}.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PackageBomViewModel } from "@/lib/mgr/package-bom-view";

export function PackageBomView({
  model,
  createAction,
  footer,
  rowAction,
}: {
  model: PackageBomViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** The verb on each material row; none by default. */
  rowAction?: ReactNode;
}) {
  return (
    <>
      {createAction}
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

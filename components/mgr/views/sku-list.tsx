// components/mgr/views/sku-list.tsx — SKU list for one brand. Live and the
// inventory pass createAction null (packages are switched on under Brand's
// Sells as); live slots SkuEditForm as rowAction, the inventory an unlabeled Edit.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SkuListViewModel } from "@/lib/mgr/sku-list-view";

export function SkuListView({
  model,
  createAction,
  rowAction,
  footer,
  linkRows,
}: {
  model: SkuListViewModel;
  createAction?: ReactNode;
  /** Live: Edit opens the update_sku sheet for that row. */
  rowAction?: (row: SkuListViewModel["rows"][number]) => ReactNode;
  footer?: ReactNode;
  /** Live: Edit is a link. Inventory leaves it an unlabeled tap. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("Brand", model.title, createAction !== undefined ? createAction : E.btn("Add SKU"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, rowAction ? rowAction(row) : E.act("Edit", "primary", linkRows ? row.href : undefined), row.warn ? "w" : "")}
          </Fragment>
        ))}
      {footer}
    </>
  );
}

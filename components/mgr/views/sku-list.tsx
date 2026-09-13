// components/mgr/views/sku-list.tsx — SKU list for one brand. Live slots
// SkuForm as createAction and SkuEditForm as rowAction; inventory draws Add SKU
// and an unlabeled Edit.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SkuListViewModel } from "@/lib/mgr/sku-list-view";

export type { SkuListViewModel };

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
            {E.row(row.title, row.detail, rowAction ? rowAction(row) : E.act("Edit", "primary", linkRows ? row.href : undefined))}
          </Fragment>
        ))}
      {footer}
    </>
  );
}

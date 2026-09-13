// components/mgr/views/catalog.tsx — Catalog drawing. Every brand row is drawn
// here; live slots New Brand as createAction, brand-owned pour rows as rowExtra,
// and Formats into footer. Packages are not nested here — a brand row links to
// its SKU list.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CatalogViewModel } from "@/lib/mgr/catalog-view";

export type { CatalogViewModel };

export function CatalogView({
  model,
  createAction,
  footer,
  linkRows,
  rowExtra,
}: {
  model: CatalogViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: brand rows, Price groups and water profiles are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
  /** Live: content under one row — that brand's own poured formats and New pour. */
  rowExtra?: (row: CatalogViewModel["brands"][number]) => ReactNode;
}) {
  return (
    <>
      {E.back("More", "Catalog", createAction !== undefined ? createAction : E.btn("Add brand"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.brands.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
            {rowExtra?.(row)}
          </Fragment>
        ))}
      {E.nav("Price groups", model.priceGroups, "", undefined, linkRows ? model.priceGroupsHref : undefined)}
      {model.waterProfiles != null
        ? E.nav("Water profiles", model.waterProfiles, "", undefined, linkRows ? model.waterProfilesHref : undefined)
        : null}
      {footer}
    </>
  );
}

// components/mgr/views/catalog.tsx — Catalog drawing. Live slots BrandForm as
// createAction, combined brand+SKU rows as brands, and Formats into footer.
// Inventory draws Add brand and the brand / price-group / water-profile navs.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CatalogViewModel } from "@/lib/mgr/catalog-view";

export type { CatalogViewModel };

export function CatalogView({
  model,
  createAction,
  footer,
  linkRows,
  brands,
}: {
  model: CatalogViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: Price groups (and water profiles) are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
  /** Live combined catalog: nested SKUs. When set, skip inventory brand navs and the empty blank. */
  brands?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Catalog", createAction !== undefined ? createAction : E.btn("Add brand"), model.backHref)}
      {brands !== undefined
        ? brands
        : model.empty
          ? E.blank(model.empty)
          : model.brands.map((row) => (
            <Fragment key={row.key}>
              {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
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

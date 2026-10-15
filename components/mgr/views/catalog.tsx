// Catalog draws one row per brand. Packaged and poured SKUs live in its SKU list.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CatalogViewModel } from "@/lib/mgr/catalog-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";

export type { CatalogViewModel };

export function CatalogView({
  model,
  createAction,
  footer,
  linkRows,
  formats,
  formatAction,
  controls,
}: {
  model: CatalogViewModel;
  /** Live: the search, sort and category strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: brand rows, Price groups and water profiles are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
  formats?: FormatsViewModel;
  formatAction?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Catalog", createAction !== undefined ? createAction : E.btn("Add brand"), model.backHref)}
      {controls}
      {model.empty
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
      {formats && <FormatsView model={formats} header={E.hd("Formats", "Shared sizes and packaging for every brand", formatAction !== undefined ? formatAction : E.btn("New Format"))} />}
    </>
  );
}

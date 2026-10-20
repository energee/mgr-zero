// Catalog draws one row per brand in the shared RecordTable: the name links to
// the brand, with its alias under it. Packaged and poured SKUs live in its SKU list.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CatalogViewModel } from "@/lib/mgr/catalog-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";
import { RecordTable } from "@/components/mgr/views/record-table";

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
  /** Live: brand names, Price groups and water profiles are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
  formats?: FormatsViewModel;
  formatAction?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Catalog", createAction !== undefined ? createAction : E.btn("New brand"), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : <RecordTable
          headers={["Brand", "Style", "ABV", "SKUs"]}
          align={["l", "l", "r", "r"]}
          rows={model.brands.map((brand) => ({
            key: brand.key,
            cells: [brand.name, brand.style, brand.abv, brand.skus],
            note: brand.alias,
            href: linkRows ? brand.href : undefined,
          }))}
        />}
      {E.nav("Price groups", model.priceGroups, "", undefined, linkRows ? model.priceGroupsHref : undefined)}
      {model.waterProfiles != null
        ? E.nav("Water profiles", model.waterProfiles, "", undefined, linkRows ? model.waterProfilesHref : undefined)
        : null}
      {footer}
      {formats && <FormatsView model={formats} header={E.hd("Formats", "", formatAction !== undefined ? formatAction : E.btn("New format"))} />}
    </>
  );
}

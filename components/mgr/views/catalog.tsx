// Catalog draws one row per brand in the shared RecordTable: the name links to
// the brand, with its alias under it, and the COLA column reads its recorded
// approvals. Packaged and poured SKUs live in its SKU list.
// Price groups and Water profiles rows follow; inventory and live draw both.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CatalogViewModel } from "@/lib/mgr/catalog-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";
import { RecordTable } from "@/components/mgr/views/record-table";

export type { CatalogViewModel };

export function CatalogView({
  model,
  createAction,
  linkRows,
  formats,
  formatAction,
  controls,
}: {
  model: CatalogViewModel;
  /** The search, Sort and Category strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
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
          headers={["Brand", "Style", "ABV", "SKUs", "COLA"]}
          align={["l", "l", "r", "r", "l"]}
          rows={model.brands.map((brand) => ({
            key: brand.key,
            cells: [brand.name, brand.style, brand.abv, brand.skus, brand.cola],
            note: brand.alias,
            href: linkRows ? brand.href : undefined,
          }))}
        />}
      {E.nav("Price groups", model.priceGroups, "", undefined, linkRows ? model.priceGroupsHref : undefined)}
      {E.nav("Water profiles", "Source and target profiles", "", undefined, linkRows ? model.waterProfilesHref : undefined)}
      {formats && <FormatsView model={formats} header={E.hd("Formats", "", formatAction !== undefined ? formatAction : E.btn("New format"))} />}
    </>
  );
}

// Catalog draws one row per brand in the shared RecordTable: live, the name
// links to the brand for a role that may open it, with its alias under it, and
// the COLA column reads its recorded approvals. What a brand sells (packages
// and pours) lives under its Sells as.
// Price groups and Water profiles rows follow; inventory and live draw both.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { NOT_SET, type CatalogViewModel } from "@/lib/mgr/catalog-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";
import { RecordTable } from "@/components/mgr/views/record-table";

export type { CatalogViewModel };

export function CatalogView({
  model,
  createAction,
  links,
  formats,
  formatAction,
  controls,
}: {
  model: CatalogViewModel;
  /** The search, Sort and Category strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  /** Live: which rows are links, each only for a role its page lets in. Inventory leaves them all unlabeled taps. */
  links?: { brands: boolean; priceGroups: boolean; waterProfiles: boolean };
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
            // A style or ABV that is not set sorts last, not as the words.
            sort: [brand.name, brand.style === NOT_SET ? null : brand.style, brand.abv === NOT_SET ? null : brand.abv, brand.skus, brand.cola],
            note: brand.alias,
            href: links?.brands ? brand.href : undefined,
          }))}
        />}
      {E.nav("Price groups", model.priceGroups, "", undefined, links?.priceGroups ? model.priceGroupsHref : undefined)}
      {E.nav("Water profiles", "Source and target profiles", "", undefined, links?.waterProfiles ? model.waterProfilesHref : undefined)}
      {formats && <FormatsView model={formats} header={E.hd("Formats", "", formatAction !== undefined ? formatAction : E.btn("New format"))} />}
    </>
  );
}

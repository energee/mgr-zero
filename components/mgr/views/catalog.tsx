// Catalog draws one row per brand in the shared RecordTable: live, the name
// links to the brand for a role that may open it, with its alias under it, and
// the COLA column reads its recorded approvals; the latest approved label
// leads the row as a thumbnail. What a brand sells (packages
// and pours) lives under its Sells as.
// Price groups and Water profiles rows follow, then Formats under the
// #formats anchor that Brand's Manage formats opens; inventory and live draw both.
// Live, a row the viewer may not open is plain (no tap, no Open); the
// inventory, which passes no links, keeps every row an inert tap.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { NOT_SET, type CatalogViewModel } from "@/lib/mgr/catalog-view";
import { WATER_PROFILES_CAPTION } from "@/lib/mgr/water-profiles-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";
import { RecordTable } from "@/components/mgr/views/record-table";
import { COLA_SLOT, ColaLabelImageView } from "@/components/mgr/views/cola-label-image";

/** A link row; href null (live, not openable) draws it plain, undefined an inert tap. */
const navRow = (title: string, subtitle: ReactNode, href: string | null | undefined) =>
  href === null ? E.row(title, subtitle) : E.nav(title, subtitle, "", undefined, href);

export function CatalogView({
  model,
  createAction,
  colaAction,
  images,
  links,
  formats,
  formatAction,
  controls,
}: {
  model: CatalogViewModel;
  /** The search, Sort and Category strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  colaAction?: ReactNode;
  images?: Record<string, ReactNode>;
  /** Live: which rows are links, each only for a role its page lets in; the rest draw plain. Inventory leaves them all inert taps. */
  links?: { brands: boolean; priceGroups: boolean; waterProfiles: boolean };
  formats?: FormatsViewModel;
  formatAction?: ReactNode;
}) {
  // Each `links && (...)` below gives undefined (no links: the inventory's inert tap) or, live, the path or null (denied: drawn plain).
  const brandAction = createAction !== undefined ? createAction : E.btn("New brand");
  const firstBrand = !model.showControls;
  return (
    <>
      {E.back("More", "Catalog", firstBrand ? null : <div className="flex flex-wrap gap-2">
        {colaAction !== undefined ? colaAction : E.btn("Bulk process COLAs", "g")}
        {brandAction}
      </div>, model.backHref)}
      {E.info("Catalog holds your brands, formats, and SKUs. Save a brand, then turn on its formats under Sells as to create the SKUs you sell.")}
      {model.showControls && controls}
      {model.empty
        ? E.blank(model.empty, undefined, firstBrand ? brandAction : undefined)
        : <RecordTable
          headers={["Brand", "Style", "ABV", "SKUs", "COLA"]}
          align={["l", "l", "r", "r", "l"]}
          rows={model.brands.map((brand) => ({
            key: brand.key,
            cells: [brand.name, brand.style, brand.abv, brand.skus, brand.cola],
            // Every row leads with the same slot, so names line up; a brand without a label leaves it blank.
            media: brand.image ? images?.[brand.key] ?? <ColaLabelImageView label={`${brand.name} · COLA ${brand.image.ttbId}`} compact /> : <div className={COLA_SLOT} aria-hidden />,
            // A style or ABV that is not set sorts last, not as the words.
            sort: [brand.name, brand.style === NOT_SET ? null : brand.style, brand.abv === NOT_SET ? null : brand.abv, brand.skus, brand.cola],
            note: brand.alias,
            href: links && (links.brands ? brand.href : null),
          }))}
        />}
      {navRow("Price groups", model.priceGroups, links && (links.priceGroups ? model.priceGroupsHref : null))}
      {navRow("Water profiles", WATER_PROFILES_CAPTION, links && (links.waterProfiles ? model.waterProfilesHref : null))}
      {formats && <FormatsView model={formats} header={<div id="formats" className="flex scroll-m-20 flex-col gap-2 md:flex-row md:items-center md:justify-between">{E.group("Formats")}{formatAction !== undefined ? formatAction : E.btn("New format")}</div>} />}
    </>
  );
}

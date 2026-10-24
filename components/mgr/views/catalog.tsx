// Catalog draws one row per brand in the shared RecordTable: live, the name
// links to the brand for a role that may open it, with its alias under it, and
// the COLA column reads its recorded approvals. What a brand sells (packages
// and pours) lives under its Sells as.
// Price groups and Water profiles rows follow; inventory and live draw both.
// Live, a row the viewer may not open is plain (no tap, no Open); the
// inventory, which passes no links, keeps every row an inert tap.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { NOT_SET, type CatalogViewModel } from "@/lib/mgr/catalog-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";
import { RecordTable } from "@/components/mgr/views/record-table";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";

export type { CatalogViewModel };

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
  return (
    <>
      {E.back("More", "Catalog", <div className="flex flex-wrap gap-2">{colaAction !== undefined ? colaAction : E.btn("Bulk process COLAs", "g")}{createAction !== undefined ? createAction : E.btn("New brand")}</div>, model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : <RecordTable
          headers={["Brand", "Style", "ABV", "SKUs", "COLA"]}
          align={["l", "l", "r", "r", "l"]}
          rows={model.brands.map((brand) => ({
            key: brand.key,
            cells: [brand.name, brand.style, brand.abv, brand.skus, <div key="cola" className="flex flex-col gap-2">{brand.cola}{brand.image && (images?.[brand.key] ?? <ColaLabelImageView label={`${brand.name} · COLA ${brand.image.ttbId}`} compact />)}</div>],
            // A style or ABV that is not set sorts last, not as the words.
            sort: [brand.name, brand.style === NOT_SET ? null : brand.style, brand.abv === NOT_SET ? null : brand.abv, brand.skus, brand.cola],
            note: brand.alias,
            href: links && (links.brands ? brand.href : null),
          }))}
        />}
      {navRow("Price groups", model.priceGroups, links && (links.priceGroups ? model.priceGroupsHref : null))}
      {navRow("Water profiles", "Source and target profiles", links && (links.waterProfiles ? model.waterProfilesHref : null))}
      {formats && <FormatsView model={formats} header={E.hd("Formats", "", formatAction !== undefined ? formatAction : E.btn("New format"))} />}
    </>
  );
}

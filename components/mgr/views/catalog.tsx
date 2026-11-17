// Catalog draws one row per brand in the shared RecordTable, its alias under
// the name. Live, the name opens the brand in a sheet over the list (?brand=,
// lib/mgr/order-sheet.ts) for a role that may open it; the page passes the
// open sheet. The COLA column is a green check that opens TTB's page for an
// approval on file; a brand with none offers Find COLA instead, which reviews
// that one brand (components/mgr/views/cola-review.tsx). The latest approved
// label leads the row as a thumbnail, and opens larger on hover. What a brand sells (packages
// and pours) lives under its Sells as.
// Price groups and Water profiles rows follow, then Formats under the
// #formats anchor that Brand's Manage formats opens; inventory and live draw both.
// Live, a row the viewer may not open is plain (no tap, no Open); the
// inventory, which passes no links, keeps every row an inert tap.
import { Fragment, type ReactNode } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { E } from "@/components/mgr/e";
import { Icon } from "@/components/mgr/icon";
import { BRAND_SHEET_PARAM } from "@/lib/mgr/order-sheet";
import { COLA_APPROVED, NOT_SET, type CatalogBrandView, type CatalogViewModel } from "@/lib/mgr/catalog-view";
import { sentenceCase } from "@/lib/mgr/labels";
import { WATER_PROFILES_CAPTION } from "@/lib/mgr/water-profiles-view";
import { FormatsView, type FormatsViewModel } from "@/components/mgr/views/formats";
import { RecordTable } from "@/components/mgr/views/record-table";
import { COLA_SLOT, ColaLabelImageView } from "@/components/mgr/views/cola-label-image";

/** A link row; href null (live, not openable) draws it plain, undefined an inert tap. */
const navRow = (title: string, subtitle: ReactNode, href: string | null | undefined) =>
  href === null ? E.row(title, subtitle) : E.nav(title, subtitle, "", undefined, href);

const TTB_LINK = { target: "_blank", rel: "noopener noreferrer" };

/** The COLA cell stays quiet about the usual case. An approved COLA is a
 *  check in a solid green disc that opens TTB's record, with its date as the label; one saved
 *  without a date reads On file. A brand with none offers Find COLA, which
 *  rests as plain text until its row is reached (app/globals.css). A role with
 *  no action keeps the words, so its cell is never blank. */
const colaCell = (brand: CatalogBrandView, findCola: Record<string, ReactNode> | null | undefined): ReactNode => !brand.colaHref
  ? <span key="cola" data-quiet-action>{findCola === undefined ? E.act("Find COLA") : findCola?.[brand.key] ?? brand.cola}</span>
  : brand.cola === COLA_APPROVED
    ? <a key="cola" href={brand.colaHref} {...TTB_LINK} title={sentenceCase(brand.colaNote ?? "")} aria-label={`COLA ${brand.colaNote}; open on TTB`} className="inline-flex size-6 items-center justify-center rounded-full bg-success-foreground text-success hover:opacity-80"><Icon icon={Tick02Icon} className="[&_*]:stroke-2" /></a>
    : <a key="cola" href={brand.colaHref} {...TTB_LINK} title={sentenceCase(brand.colaNote ?? "")} className="text-muted-foreground underline underline-offset-4">{brand.cola}</a>;

/** A saved label's thumbnail. With the full image it opens larger on hover,
 *  beside its approval date and TTB's record; it sits above the row's link so
 *  the pointer reaches it. */
const labelMedia = (image: NonNullable<CatalogBrandView["image"]>, thumb: ReactNode, preview: ReactNode): ReactNode => preview ? (
  <HoverCard key="media" openDelay={150} closeDelay={100}>
    <HoverCardTrigger asChild><span className="relative z-10 block cursor-zoom-in">{thumb}</span></HoverCardTrigger>
    <HoverCardContent align="start">
      {preview}
      <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {sentenceCase(image.note)}
        {image.href && <a href={image.href} {...TTB_LINK} className="underline underline-offset-4">Open on TTB</a>}
      </p>
    </HoverCardContent>
  </HoverCard>
) : <Fragment key="media">{thumb}</Fragment>;

export function CatalogView({
  model,
  createAction,
  colaAction,
  findCola,
  images,
  previews,
  links,
  formats,
  formatAction,
  controls,
  sheet,
}: {
  model: CatalogViewModel;
  /** The search, Sort and Category strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  colaAction?: ReactNode;
  /** Live: each None on file row's working Find COLA, keyed by brand; null for a role that cannot record one. The inventory draws the verb. */
  findCola?: Record<string, ReactNode> | null;
  images?: Record<string, ReactNode>;
  /** Each saved label at full size, keyed by brand, for the thumbnail's hover card; without it the thumbnail stands alone. */
  previews?: Record<string, ReactNode>;
  /** Live: which rows are links, each only for a role its page lets in; the rest draw plain. Inventory leaves them all inert taps. */
  links?: { brands: boolean; priceGroups: boolean; waterProfiles: boolean };
  formats?: FormatsViewModel;
  formatAction?: ReactNode;
  /** Live: the brand sheet the page opened from ?brand= (app/(app)/catalog/brand-sheet.tsx), drawn over the list. */
  sheet?: ReactNode;
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
            cells: [brand.name, brand.style, brand.abv, brand.skus, colaCell(brand, findCola)],
            // Every row leads with the same slot, so names line up; a brand without a label leaves it blank.
            // Keyed, because the rows cross to the client RecordTable in an array prop (#1137).
            media: brand.image ? labelMedia(brand.image, images?.[brand.key] ?? <ColaLabelImageView label={`${brand.name} · COLA ${brand.image.ttbId}`} compact />, previews?.[brand.key]) : <div key="media" className={COLA_SLOT} aria-hidden />,
            // A style or ABV that is not set sorts last, not as the words.
            sort: [brand.name, brand.style === NOT_SET ? null : brand.style, brand.abv === NOT_SET ? null : brand.abv, brand.skus, brand.cola],
            note: brand.alias,
            sheet: links?.brands ? { param: BRAND_SHEET_PARAM, id: brand.key } : undefined,
            href: links && (links.brands ? brand.href : null),
          }))}
        />}
      {navRow("Price groups", model.priceGroups, links && (links.priceGroups ? model.priceGroupsHref : null))}
      {navRow("Water profiles", WATER_PROFILES_CAPTION, links && (links.waterProfiles ? model.waterProfilesHref : null))}
      {formats && <FormatsView model={formats} header={<div id="formats" className="flex scroll-m-20 flex-col gap-2 md:flex-row md:items-center md:justify-between">{E.group("Formats")}{formatAction !== undefined ? formatAction : E.btn("New format")}</div>} />}
      {sheet}
    </>
  );
}

// lib/mgr/catalog-view.ts — view-model for Catalog. list_brands plus
// list_price_groups (and optional list_sale_channels / water-profile count)
// paint the inventory Catalog drawing.
import { brandLabel } from "./brand-view";
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";

export type CatalogBrandView = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

export type CatalogViewModel = {
  backHref?: string;
  brands: CatalogBrandView[];
  empty?: EmptyState;
  priceGroups: string;
  priceGroupsHref: string;
  waterProfiles?: string;
  waterProfilesHref?: string;
};

/** list_brands row: brand facts plus nested style and SKUs. */
export type CatalogBrandRow = {
  id: string;
  name: string;
  alias?: string | null;
  abv: number | string | null;
  styles: { name: string } | null;
  skus: { id: string }[];
  pours?: { id: string }[];
};

export type CatalogSnapshot = {
  brands: CatalogBrandRow[];
  /** list_price_groups. */
  priceGroups: { id: string; name: string }[];
  /** list_sale_channels. Inventory uses the count for "N channels". */
  channels?: { id: string; name: string }[];
  /** Inventory-only until list_water_profiles exists. */
  waterProfileCount?: number;
  backHref?: string;
  /** A search or category is on, so an empty list means no match, not no brands. */
  filtered?: boolean;
};

function brandDetail(b: CatalogBrandRow): string {
  const parts = [b.styles?.name ?? "style not set"];
  if (b.abv != null && b.abv !== "") parts.push(`${Number(b.abv)}%`);
  parts.push(plural(b.skus.length + (b.pours?.length ?? 0), "SKU"));
  return parts.join(" · ");
}

export function toCatalogViewProps({
  brands,
  priceGroups,
  channels,
  waterProfileCount,
  backHref,
  filtered,
}: CatalogSnapshot): CatalogViewModel {
  const groupCopy = plural(priceGroups.length, "group");
  return {
    backHref,
    empty: brands.length > 0 ? undefined
      : filtered ? { title: "No brands match", description: "Clear the search or category to see every brand." }
      : { title: "No brands yet", description: "Add a brand to start building the catalog." },
    brands: brands.map((b) => ({
      key: b.id,
      title: brandLabel(b),
      detail: brandDetail(b),
      href: `/catalog/brands/${b.id}`,
    })),
    priceGroups: channels
      ? `${plural(channels.length, "channel")} · ${groupCopy}`
      : groupCopy,
    priceGroupsHref: "/pricing",
    waterProfiles: waterProfileCount == null ? undefined : plural(waterProfileCount, "profile"),
  };
}

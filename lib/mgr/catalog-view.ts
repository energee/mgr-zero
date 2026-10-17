// lib/mgr/catalog-view.ts — view-model for Catalog. list_brands plus
// list_price_groups (and optional list_sale_channels / water-profile count)
// paint the inventory Catalog drawing.
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";

/** One brand row's facts, each drawn in its own column. */
export type CatalogBrandView = {
  key: string;
  name: string;
  /** Staff-only informal name, drawn under the name; absent when the brand has none. */
  alias?: string;
  /** "Not set" when the brand has no style. */
  style: string;
  /** "6.8%", a real "0%", or "Not set". */
  abv: string;
  /** Packaged SKUs plus the pours its price group owns, active or not: "4". */
  skus: string;
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

const NOT_SET = "Not set";

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
      name: b.name,
      alias: b.alias || undefined,
      style: b.styles?.name ?? NOT_SET,
      abv: b.abv == null || b.abv === "" ? NOT_SET : `${Number(b.abv)}%`,
      skus: String(b.skus.length + (b.pours?.length ?? 0)),
      href: `/catalog/brands/${b.id}`,
    })),
    priceGroups: channels
      ? `${plural(channels.length, "channel")} · ${groupCopy}`
      : groupCopy,
    priceGroupsHref: "/pricing",
    waterProfiles: waterProfileCount == null ? undefined : plural(waterProfileCount, "profile"),
  };
}

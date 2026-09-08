// lib/mgr/brand-view.ts — view-model for Brand detail. list_brands (one row)
// plus list_price_groups and the brewery's styles paint BrandView.
import { plural } from "./plural";

export type BrandViewModel = {
  backHref?: string;
  name: string;
  style: string;
  styleOptions: string[];
  abv: string;
  category: string;
  categoryOptions: string[];
  priceGroup: string;
  priceGroupOptions: string[];
  description: string;
  hops: string;
  skuList: string;
  skuListHref: string;
};

const CATEGORIES = ["Core", "Seasonal", "One-off", "Barrel-aged"];

export type BrandSnapshot = {
  brand: {
    id: string;
    name: string;
    abv: number | string | null;
    description: string | null;
    category: string | null;
    hops: string | null;
    price_group_id: string | null;
    styles: { name: string } | null;
    skus: { id: string; active: boolean }[];
  };
  /** Brewery styles list; may include an inventory "Add …" option. */
  styles: string[];
  categories?: string[];
  /** list_price_groups. */
  priceGroups: { id: string; name: string }[];
};

export function toBrandViewProps({
  brand,
  styles,
  categories = CATEGORIES,
  priceGroups,
}: BrandSnapshot): BrandViewModel {
  const group = priceGroups.find((g) => g.id === brand.price_group_id);
  const active = brand.skus.filter((s) => s.active).length;
  const style = brand.styles?.name ?? "";
  const styleOptions = style && !styles.includes(style) ? [style, ...styles] : styles;
  return {
    backHref: "/catalog",
    name: brand.name,
    style,
    styleOptions,
    abv: brand.abv == null || brand.abv === "" ? "" : String(Number(brand.abv)),
    category: brand.category ?? "",
    categoryOptions: categories,
    priceGroup: group?.name ?? "",
    priceGroupOptions: priceGroups.map((g) => g.name),
    description: brand.description ?? "",
    hops: brand.hops ?? "",
    skuList: plural(active, "active package"),
    skuListHref: "/catalog",
  };
}

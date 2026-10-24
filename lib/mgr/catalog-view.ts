// lib/mgr/catalog-view.ts — view-model for Catalog. list_brands plus
// list_price_groups paint the brand table and the Price groups row;
// toCatalogScopes builds the Sort and Category picks above the table.
import type { ListScope } from "@/components/mgr/list-controls";
import type { Approval } from "@/lib/commands/compliance";
import { approvalDate } from "./brand-view";
import type { EmptyState } from "./empty-state";
import type { BrandSort } from "./enums";
import { BRAND_SORTS } from "./enums";
import { BRAND_SORT_LABEL } from "./labels";
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
  /** Recorded COLA approvals: "None", one's TTB ID and approval date, or "2 on file". */
  cola: string;
  image?: { url: string; ttbId: string };
  href: string;
};

export type CatalogViewModel = {
  backHref?: string;
  brands: CatalogBrandView[];
  empty?: EmptyState;
  priceGroups: string;
  priceGroupsHref: string;
  waterProfilesHref: string;
};

/** list_brands row: brand facts plus nested style, SKUs and recorded COLA approvals. */
export type CatalogBrandRow = {
  id: string;
  name: string;
  alias?: string | null;
  abv: number | string | null;
  styles: { name: string } | null;
  skus: { id: string }[];
  pours?: { id: string }[];
  colas: (Pick<Approval, "ttb_id" | "approved_on"> & { id?: string; image_url?: string | null })[];
};

export type CatalogSnapshot = {
  brands: CatalogBrandRow[];
  /** list_price_groups. */
  priceGroups: { id: string; name: string }[];
  backHref?: string;
  /** A search or category is on, so an empty list means no match, not no brands. */
  filtered?: boolean;
};

/** A brand's missing style or ABV; Catalog sorts it as empty (last). */
export const NOT_SET = "Not set";

/** Shows only saved COLAs: "None", one COLA's TTB ID and date, or a count when
 *  there are several (the brand page lists each). */
function colaFact(colas: CatalogBrandRow["colas"]): string {
  if (colas.length === 0) return "None";
  if (colas.length > 1) return `${colas.length} on file`;
  const { ttb_id, approved_on } = colas[0]!;
  return `TTB ID ${ttb_id} · ${approvalDate(approved_on)}`;
}

/** A label without an approval date is not an approved catalog image. */
function latestColaImage(colas: CatalogBrandRow["colas"]): CatalogBrandView["image"] {
  const latest = colas.filter(cola => cola.approved_on && cola.image_url)
    .sort((a, b) => b.approved_on!.localeCompare(a.approved_on!) || b.ttb_id.localeCompare(a.ttb_id))[0];
  return latest ? { url: latest.image_url!, ttbId: latest.ttb_id } : undefined;
}

export function toCatalogViewProps({
  brands,
  priceGroups,
  backHref,
  filtered,
}: CatalogSnapshot): CatalogViewModel {
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
      cola: colaFact(b.colas),
      image: latestColaImage(b.colas),
      href: `/catalog/brands/${b.id}`,
    })),
    priceGroups: plural(priceGroups.length, "group"),
    priceGroupsHref: "/pricing",
    waterProfilesHref: "/catalog/water-profiles",
  };
}

/** The Sort and Category settings, the brewery's category names, and (live)
 *  the link for one changed setting. The inventory leaves `href` out. */
export type CatalogScopeInput = {
  sort: BrandSort;
  category: string;
  categories: string[];
  href?: (patch: { sort?: BrandSort; category?: string }) => string;
};

/** Sort, then Category once the brewery has a category. "All categories" is
 *  the empty value, and a category not in the list reads as All. */
export function toCatalogScopes({ sort, category, categories, href }: CatalogScopeInput): ListScope[] {
  const sortScope: ListScope = {
    label: "Sort",
    value: sort,
    options: BRAND_SORTS.map((value) => ({ value, label: BRAND_SORT_LABEL[value], href: href?.({ sort: value }) })),
  };
  if (!categories.length) return [sortScope];
  return [sortScope, {
    label: "Category",
    value: categories.includes(category) ? category : "",
    options: ["", ...categories].map((name) => ({ value: name, label: name || "All categories", href: href?.({ category: name }) })),
  }];
}

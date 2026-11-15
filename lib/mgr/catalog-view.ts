// lib/mgr/catalog-view.ts — view-model for Catalog. list_brands plus
// list_price_groups paint the brand table and the Price groups row;
// toCatalogScopes builds the Sort and Category picks above the table.
import type { ListScope } from "@/components/mgr/list-controls";
import type { Approval } from "@/lib/commands/compliance";
import { colaUrl } from "./brand-approval-view";
import { approvalDate } from "./brand-view";
import type { EmptyState } from "./empty-state";
import type { BrandSort } from "./enums";
import { BRAND_SORTS } from "./enums";
import { BRAND_SORT_LABEL, COLA_NOT_ON_FILE } from "./labels";
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
  /** Saved packaged SKUs, active or not; eligible formats and pours are not SKUs. */
  skus: string;
  /** Recorded COLA approvals: "None on file", "Approved", or "On file" when none carries an approval date. */
  cola: string;
  /** TTB's public page for the COLA the cell speaks for; absent with none on file. */
  colaHref?: string;
  /** That COLA's date: "approved Oct 2, 2026" or "approval date unknown". */
  colaNote?: string;
  /** The newest approved label: its image, its date as in colaNote, and TTB's page for it. */
  image?: { url: string; ttbId: string; note: string; href?: string };
  href: string;
};

export type CatalogViewModel = {
  backHref?: string;
  brands: CatalogBrandView[];
  empty?: EmptyState;
  showControls: boolean;
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

/** The COLA cell's word for a brand with a dated approval; Catalog draws it as a green check. */
export const COLA_APPROVED = "Approved";

/** The dated COLAs, newest approval first. */
function approvedColas(colas: CatalogBrandRow["colas"]): CatalogBrandRow["colas"] {
  return colas.filter(cola => cola.approved_on)
    .sort((a, b) => b.approved_on!.localeCompare(a.approved_on!) || b.ttb_id.localeCompare(a.ttb_id));
}

/** Shows only saved COLAs. The cell says whether one is approved and links
 *  TTB's page for the newest approval; the brand page lists each with its ID
 *  and date. A COLA saved without a date is on file, not claimed approved. */
function colaFact(colas: CatalogBrandRow["colas"]): Pick<CatalogBrandView, "cola" | "colaHref" | "colaNote"> {
  if (colas.length === 0) return { cola: COLA_NOT_ON_FILE };
  const approved = approvedColas(colas)[0];
  const shown = approved ?? colas[0]!;
  return { cola: approved ? COLA_APPROVED : "On file", colaHref: colaUrl(shown.ttb_id) ?? undefined, colaNote: approvalDate(shown.approved_on) };
}

/** A label without an approval date is not an approved catalog image. */
function latestColaImage(colas: CatalogBrandRow["colas"]): CatalogBrandView["image"] {
  const latest = approvedColas(colas).find(cola => cola.image_url);
  return latest ? { url: latest.image_url!, ttbId: latest.ttb_id, note: approvalDate(latest.approved_on), href: colaUrl(latest.ttb_id) ?? undefined } : undefined;
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
      : filtered ? { title: "No brands match" }
      : { title: "No brands yet" },
    showControls: brands.length > 0 || Boolean(filtered),
    brands: brands.map((b) => ({
      key: b.id,
      name: b.name,
      alias: b.alias || undefined,
      style: b.styles?.name ?? NOT_SET,
      abv: b.abv == null || b.abv === "" ? NOT_SET : `${Number(b.abv)}%`,
      skus: String(b.skus.length),
      ...colaFact(b.colas),
      image: latestColaImage(b.colas),
      href: `/catalog/brands/${b.id}`,
    })),
    priceGroups: priceGroups.length === 0 ? "0 groups · Create one to price your brands" : plural(priceGroups.length, "group"),
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

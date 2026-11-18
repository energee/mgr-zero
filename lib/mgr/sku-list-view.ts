// Catalog projection of stocked package SKUs and brand-owned serving identities,
// each SKU followed by its open portal releases.
// A SKU row names its barcode: its own UPC, else its price group's for the format.
import type { EmptyState } from "./empty-state";
import { formatVolume } from "@/lib/volume";
import { effectiveBbl } from "./format-view";
import { barcodeOf, type PriceGroupBarcode } from "./price-groups-view";
import { releaseDetail, type ReleaseRow } from "./release-view";

export type SkuListRowView = {
  key: string;
  /** "release": an open portal release of the SKU row above it (key `release:<id>`). */
  kind?: "packaged" | "poured" | "release";
  title: string;
  detail: string;
  href: string;
  warn?: boolean;
};

export type SkuListViewModel = {
  backHref?: string;
  title: string;
  rows: SkuListRowView[];
  empty?: EmptyState;
};

export type SkuListSnapshot = {
  brand: { id: string; name: string; price_group_id?: string | null };
  skus: {
    id: string;
    name: string;
    active: boolean;
    format_id: string;
    upc?: string | null;
    keg_pool_id?: string | null;
    portal_from_stock?: boolean;
    formats: { package_type?: string | null; name: string; bbl_per_unit: string | number | null; effective_bbl_per_unit?: string | number | null } | null;
  }[];
  pours?: { id: string; name: string; ounces: number | string }[];
  /** list_price_group_barcodes; the brand's group picks its own. Absent for a role that cannot read them. */
  barcodes?: PriceGroupBarcode[];
  /** list_releases for these SKUs; each open one is a row under its SKU. */
  releases?: ReleaseRow[];
  backHref?: string;
};

/**
 * The SKU row's barcode part: its own UPC when set (an override, spec D2
 * amended 2026-10-14), else its price group's code for its format, else none.
 */
function barcodeDetail(upc: string | null | undefined, groupUpc: string | undefined) {
  if (upc) return `UPC ${upc} (SKU override)`;
  return groupUpc && `UPC ${groupUpc}`;
}

export function toSkuListViewProps({ brand, skus, pours = [], barcodes, releases = [], backHref }: SkuListSnapshot): SkuListViewModel {
  return {
    backHref,
    title: `${brand.name} · SKUs`,
    empty: skus.length + pours.length === 0 ? { title: "No SKUs yet" } : undefined,
    rows: [...skus.flatMap((s) => {
      const bbl = s.formats ? effectiveBbl(s.formats) : null;
      const volume = bbl != null ? formatVolume(bbl) : "—";
      const warn = s.formats?.package_type === "keg" && !s.keg_pool_id;
      const releaseRows = releases.filter((r) => r.sku_id === s.id && r.open).map((r): SkuListRowView => ({
        key: `release:${r.id}`, kind: "release", title: `Release · ${r.batch_no ? `Batch ${r.batch_no}` : "Packaged stock"}`, detail: releaseDetail(r), href: "#",
      }));
      return [{
        key: s.id,
        title: s.formats?.name ?? s.name,
        detail: [volume, s.active ? "active" : "inactive", barcodeDetail(s.upc, barcodeOf(barcodes, brand.price_group_id, s.format_id)), s.portal_from_stock === false && "not orderable from stock on the portal", warn && "No keg pool, no deposit"].filter(Boolean).join(" · "),
        warn,
        href: "/catalog",
      }, ...releaseRows];
    }), ...pours.map((p) => ({ key: `pour:${p.id}`, kind: "poured" as const, title: p.name, detail: `${Number(p.ounces)} oz · pour · drawn from keg`, href: "#" }))],
  };
}

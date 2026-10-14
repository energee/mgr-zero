// Catalog projection of stocked package SKUs and brand-owned serving identities.
// A SKU row names its barcode: its own UPC, else its price group's for the format.
import type { EmptyState } from "./empty-state";
import { formatVolume } from "@/lib/volume";
import { effectiveBbl } from "./format-view";
import type { PriceGroupBarcode } from "./price-groups-view";

export type SkuListRowView = {
  key: string;
  kind?: "packaged" | "poured";
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
  brand: { id: string; name: string };
  skus: {
    id: string;
    name: string;
    active: boolean;
    format_id: string;
    upc?: string | null;
    keg_pool_id?: string | null;
    formats: { package_type?: string | null; name: string; bbl_per_unit: string | number | null; effective_bbl_per_unit?: string | number | null } | null;
  }[];
  pours?: { id: string; name: string; ounces: number | string }[];
  /** The brand's price group codes (list_price_group_barcodes, filtered to its group). */
  barcodes?: Pick<PriceGroupBarcode, "format_id" | "upc">[];
  backHref?: string;
};

/**
 * A SKU's barcode: its own UPC when set (an override, spec D2 amended
 * 2026-10-14), else its price group's code for its format, else none.
 */
export function skuBarcode(sku: { upc?: string | null; format_id: string }, barcodes: Pick<PriceGroupBarcode, "format_id" | "upc">[]): { upc: string; override: boolean } | null {
  if (sku.upc) return { upc: sku.upc, override: true };
  const group = barcodes.find((b) => b.format_id === sku.format_id);
  return group ? { upc: group.upc, override: false } : null;
}

export function toSkuListViewProps({ brand, skus, pours = [], barcodes = [], backHref }: SkuListSnapshot): SkuListViewModel {
  return {
    backHref,
    title: `${brand.name} · SKUs`,
    empty: skus.length + pours.length === 0 ? { title: "No SKUs yet", description: "A SKU pairs a brand with a format, and is what a customer orders." } : undefined,
    rows: [...skus.map((s) => {
      const bbl = s.formats ? effectiveBbl(s.formats) : null;
      const volume = bbl != null ? formatVolume(bbl) : "—";
      const warn = s.formats?.package_type === "keg" && !s.keg_pool_id;
      const code = skuBarcode(s, barcodes);
      return {
        key: s.id,
        title: s.formats?.name ?? s.name,
        detail: [volume, s.active ? "active" : "inactive", code && `UPC ${code.upc}${code.override ? " (SKU override)" : ""}`, warn && "No keg pool, no deposit"].filter(Boolean).join(" · "),
        warn,
        href: "/catalog",
      };
    }), ...pours.map((p) => ({ key: `pour:${p.id}`, kind: "poured" as const, title: p.name, detail: `${Number(p.ounces)} oz · pour · drawn from keg`, href: "#" }))],
  };
}

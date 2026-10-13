// Catalog projection of stocked package SKUs and brand-owned serving identities.
import type { EmptyState } from "./empty-state";
import { formatVolume } from "@/lib/volume";
import { effectiveBbl } from "./format-view";

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
    keg_pool_id?: string | null;
    formats: { package_type?: string | null; name: string; bbl_per_unit: string | number | null; effective_bbl_per_unit?: string | number | null } | null;
  }[];
  pours?: { id: string; name: string; ounces: number | string }[];
  backHref?: string;
};

export function toSkuListViewProps({ brand, skus, pours = [], backHref }: SkuListSnapshot): SkuListViewModel {
  return {
    backHref,
    title: `${brand.name} · SKUs`,
    empty: skus.length + pours.length === 0 ? { title: "No SKUs yet", description: "A SKU pairs a brand with a format, and is what a customer orders." } : undefined,
    rows: [...skus.map((s) => {
      const bbl = s.formats ? effectiveBbl(s.formats) : null;
      const volume = bbl != null ? formatVolume(bbl) : "—";
      const warn = s.formats?.package_type === "keg" && !s.keg_pool_id;
      return {
        key: s.id,
        title: s.formats?.name ?? s.name,
        detail: `${volume} · ${s.active ? "active" : "inactive"}${warn ? " · No keg pool, no deposit" : ""}`,
        warn,
        href: "/catalog",
      };
    }), ...pours.map((p) => ({ key: `pour:${p.id}`, kind: "poured" as const, title: p.name, detail: `${Number(p.ounces)} oz · pour · drawn from keg`, href: "#" }))],
  };
}

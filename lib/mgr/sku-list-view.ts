// lib/mgr/sku-list-view.ts — view-model for SKU list. list_skus for one brand,
// with formats.bbl_per_unit, paints each package row.
import { formatVolume } from "@/lib/volume";

export type SkuListRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
};

export type SkuListViewModel = {
  backHref?: string;
  title: string;
  rows: SkuListRowView[];
  empty?: string;
};

export type SkuListSnapshot = {
  brand: { id: string; name: string };
  skus: {
    id: string;
    name: string;
    active: boolean;
    format_id: string;
    formats: { name: string; bbl_per_unit: string | number | null } | null;
  }[];
};

export function toSkuListViewProps({ brand, skus }: SkuListSnapshot): SkuListViewModel {
  return {
    backHref: "/catalog",
    title: `${brand.name} · SKUs`,
    empty: skus.length === 0 ? "No SKUs yet" : undefined,
    rows: skus.map((s) => {
      const volume = s.formats?.bbl_per_unit != null ? formatVolume(s.formats.bbl_per_unit) : "—";
      return {
        key: s.id,
        title: s.formats?.name ?? s.name,
        detail: `${volume} · ${s.active ? "active" : "inactive"}`,
        href: "/catalog",
      };
    }),
  };
}

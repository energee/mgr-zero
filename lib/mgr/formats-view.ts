// lib/mgr/formats-view.ts — view-model for the Formats table. list_formats
// plus optional format_components paint Basis / Volume / From.
import type { EmptyState } from "./empty-state";
import { formatVolume, OUNCES_PER_BBL } from "@/lib/volume";
import type { SortValue } from "./table-sort";
import { effectiveBbl } from "./format-view";

export type FormatsRowView = {
  key: string;
  /** Format, Basis, Volume, From; the format's name is the row's link. */
  cells: string[];
  /** Sort values parallel to cells: Volume sorts by barrels, because the
   *  column prints oz, gal, and bbl; a missing volume or source ("—") is null. */
  sort: SortValue[];
  /** Where the name links; live only (formatHref). */
  href?: string;
};

export type FormatsViewModel = {
  backHref?: string;
  headers: string[];
  rows: FormatsRowView[];
  empty?: EmptyState;
};

export type FormatsFormatRow = {
  id: string;
  name: string;
  basis: "packaged" | "poured";
  package_type: string | null;
  brands?: { name: string } | null;
  ounces?: number | null;
  bbl_per_unit: string | number | null;
  effective_bbl_per_unit?: string | number | null;
  components?: FormatsComponentRow[];
};

export type FormatsComponentRow = {
  parent_format_id: string;
  child_format_id: string;
  qty: number;
};

export type FormatsSnapshot = {
  formats: FormatsFormatRow[];
  /** get_format_components [design]; inventory supplies the child set. */
  components?: FormatsComponentRow[];
  backHref?: string;
  formatHref?: (format: FormatsFormatRow) => string | undefined;
};

function childLabel(child: FormatsFormatRow, composed: boolean): string {
  if (composed) return child.name;
  return child.package_type ?? child.name;
}

function fromOf(
  format: FormatsFormatRow,
  formats: FormatsFormatRow[],
  components: FormatsComponentRow[],
): string {
  const kids = components.filter((c) => c.parent_format_id === format.id);
  if (kids.length === 0) {
    return format.basis === "poured" ? (format.brands?.name ?? "—") : "unit";
  }
  const parts = kids.map((c) => {
    const child = formats.find((f) => f.id === c.child_format_id);
    if (!child) return `${c.qty}`;
    const composed = components.some((k) => k.parent_format_id === child.id);
    return `${c.qty} × ${childLabel(child, composed)}`;
  });
  return parts.join(" · ");
}

export function toFormatsViewProps({ formats, components = formats.flatMap(format => format.components ?? []), backHref, formatHref }: FormatsSnapshot): FormatsViewModel {
  return {
    backHref,
    headers: ["Format", "Basis", "Volume", "From"],
    empty: formats.length === 0 ? { title: "No formats yet", description: "A format is a container a beer ships in: a 1/2 bbl keg, a 16 oz can." } : undefined,
    rows: formats.map((f) => {
      const volume = effectiveBbl(f);
      const name = f.brands ? `${f.brands.name} · ${f.name}` : f.name;
      const from = fromOf(f, formats, components);
      return {
        key: f.id,
        href: formatHref?.(f),
        cells: [
          name,
          f.basis,
          f.basis === "poured" ? (f.ounces != null ? `${f.ounces} oz` : "—") : volume != null ? formatVolume(volume) : "—",
          from,
        ],
        sort: [
          name,
          f.basis,
          f.basis === "poured" ? (f.ounces != null ? f.ounces / OUNCES_PER_BBL : null) : volume != null ? Number(volume) : null,
          from === "—" ? null : from,
        ],
      };
    }),
  };
}

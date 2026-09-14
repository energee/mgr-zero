// lib/mgr/formats-view.ts — view-model for the Formats table. list_formats
// plus optional format_components paint Basis / Volume / From.
import type { EmptyState } from "./empty-state";
import { formatVolume } from "@/lib/volume";

export type FormatsRowView = {
  key: string;
  cells: string[];
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
      const volume = f.effective_bbl_per_unit === undefined ? f.bbl_per_unit : f.effective_bbl_per_unit;
      return {
        key: f.id,
        href: formatHref?.(f),
        cells: [
          f.brands ? `${f.brands.name} · ${f.name}` : f.name,
          f.basis,
          f.basis === "poured" ? (f.ounces != null ? `${f.ounces} oz` : "—") : volume != null ? formatVolume(volume) : "—",
          fromOf(f, formats, components),
        ],
      };
    }),
  };
}

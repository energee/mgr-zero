// lib/mgr/formats-view.ts — view-model for the Formats table. list_formats
// plus optional format_components paint Basis / Volume / From.
import { formatVolume } from "@/lib/volume";

export type FormatsRowView = {
  key: string;
  cells: string[];
};

export type FormatsViewModel = {
  backHref?: string;
  headers: string[];
  rows: FormatsRowView[];
  empty?: string;
};

export type FormatsFormatRow = {
  id: string;
  name: string;
  basis: "packaged" | "poured";
  package_type: string | null;
  bbl_per_unit: string | number | null;
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
};

function childLabel(child: FormatsFormatRow, composed: boolean): string {
  if (composed) return child.name;
  return child.package_type ?? child.name;
}

function pouredFrom(format: FormatsFormatRow, formats: FormatsFormatRow[]): string | undefined {
  const bbl = format.bbl_per_unit == null ? NaN : Number(format.bbl_per_unit);
  if (!Number.isFinite(bbl) || bbl <= 0) return undefined;
  const half = formats.find((f) => f.basis === "packaged" && Number(f.bbl_per_unit) === 0.5);
  if (!half?.bbl_per_unit) return undefined;
  const ratio = Math.round(Number(half.bbl_per_unit) / bbl);
  return `1/${ratio} × ${formatVolume(half.bbl_per_unit)}`;
}

function fromOf(
  format: FormatsFormatRow,
  formats: FormatsFormatRow[],
  components: FormatsComponentRow[],
): string {
  const kids = components.filter((c) => c.parent_format_id === format.id);
  if (kids.length === 0) {
    return format.basis === "poured" ? (pouredFrom(format, formats) ?? "unit") : "unit";
  }
  const parts = kids.map((c) => {
    const child = formats.find((f) => f.id === c.child_format_id);
    if (!child) return `${c.qty}`;
    const composed = components.some((k) => k.parent_format_id === child.id);
    return `${c.qty} × ${childLabel(child, composed)}`;
  });
  return parts.join(" · ");
}

export function toFormatsViewProps({ formats, components = [], backHref }: FormatsSnapshot): FormatsViewModel {
  return {
    backHref,
    headers: ["Format", "Basis", "Volume", "From"],
    empty: formats.length === 0 ? "No formats yet" : undefined,
    rows: formats.map((f) => ({
      key: f.id,
      cells: [
        f.name,
        f.basis,
        f.bbl_per_unit != null ? formatVolume(f.bbl_per_unit) : "—",
        fromOf(f, formats, components),
      ],
    })),
  };
}

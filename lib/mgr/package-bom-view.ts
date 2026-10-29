// lib/mgr/package-bom-view.ts — view-model for Package BOM. replace_format_bom
// lines (material + qty per unit) paint the Format's packaging bill. The Format
// page names the format itself, so the model carries only the lines.
import type { EmptyState } from "./empty-state";
export type PackageBomRowView = {
  key: string;
  title: string;
  detail: string;
};

export type PackageBomViewModel = {
  rows: PackageBomRowView[];
  empty?: EmptyState;
};

export type PackageBomSnapshot = {
  lines: {
    id?: string;
    material: { id: string; name: string } | null;
    qty_per_unit: number | string;
    on_break?: "consumed" | "return_to_stock";
  }[];
};

export function toPackageBomViewProps({ lines }: PackageBomSnapshot): PackageBomViewModel {
  return {
    empty: lines.length === 0 ? { title: "No packaging tracked", description: "This format consumes no tracked packaging materials." } : undefined,
    rows: lines.map((line, i) => ({
      key: line.id ?? line.material?.id ?? String(i),
      title: line.material?.name ?? "—",
      detail: `quantity ${line.qty_per_unit}${line.on_break ? ` · ${line.on_break.replaceAll("_", " ")}` : ""}`,
    })),
  };
}

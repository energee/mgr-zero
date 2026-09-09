// lib/mgr/materials-on-hand-view.ts — view-model for Materials on hand.
export type MaterialsOnHandRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning?: boolean;
  disabled?: boolean;
};

export type MaterialsOnHandViewModel = {
  backHref?: string;
  rows: MaterialsOnHandRowView[];
  empty?: string;
};

export type MaterialsOnHandSnapshot = {
  backHref?: string;
  rows?: MaterialsOnHandRowView[];
};

export function toMaterialsOnHandViewProps(s: MaterialsOnHandSnapshot): MaterialsOnHandViewModel {
  const rows = s.rows ?? [];
  return { backHref: s.backHref, rows, empty: rows.length === 0 ? "No materials yet" : undefined };
}

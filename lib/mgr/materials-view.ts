// lib/mgr/materials-view.ts — view-model for the Materials definition list.
export type MaterialsRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
};

export type MaterialsViewModel = {
  backHref?: string;
  rows: MaterialsRowView[];
  empty?: string;
};

export type MaterialsSnapshot = { backHref?: string; rows?: MaterialsRowView[] };

export function toMaterialsViewProps(s: MaterialsSnapshot): MaterialsViewModel {
  const rows = s.rows ?? [];
  return { backHref: s.backHref, rows, empty: rows.length === 0 ? "No materials yet" : undefined };
}

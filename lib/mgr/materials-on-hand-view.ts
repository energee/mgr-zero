// lib/mgr/materials-on-hand-view.ts — view-model for Materials on hand.
import type { EmptyState } from "./empty-state";
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
  empty?: EmptyState;
};

export type MaterialsOnHandSnapshot = {
  backHref?: string;
  rows?: MaterialsOnHandRowView[];
  /** A search is on, so an empty list means no match, not no materials. */
  filtered?: boolean;
};

export function toMaterialsOnHandViewProps(s: MaterialsOnHandSnapshot): MaterialsOnHandViewModel {
  const rows = s.rows ?? [];
  const empty = rows.length > 0 ? undefined
    : s.filtered ? { title: "No materials match", description: "Clear the search to see every material." }
    : { title: "No materials yet", description: "Add a material, then receive a purchase order to put it on hand." };
  return { backHref: s.backHref, rows, empty };
}

// lib/mgr/materials-view.ts — view-model for the Materials definition list,
// and the note every empty Material picker shows.
import type { PickEmpty } from "@/components/mgr/e";
import type { EmptyState } from "./empty-state";

/** The note under an empty Material picker (New PO, New contract, recipe
 *  ingredient). Every role that opens those forms may add a material, so it
 *  always links Materials; with no `href` (the screen inventory) the link is inert. */
export const noMaterialsPick = (href?: string): PickEmpty => ({ text: "No materials yet.", label: "Add a material", href, to: "Materials" });

export type MaterialsRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
};

export type MaterialsViewModel = {
  backHref?: string;
  rows: MaterialsRowView[];
  empty?: EmptyState;
};

export type MaterialsSnapshot = { backHref?: string; rows?: MaterialsRowView[] };

export function toMaterialsViewProps(s: MaterialsSnapshot): MaterialsViewModel {
  const rows = s.rows ?? [];
  return { backHref: s.backHref, rows, empty: rows.length === 0 ? { title: "No materials yet", description: "Add the grain, hops, and packaging you buy so recipes can call for them." } : undefined };
}

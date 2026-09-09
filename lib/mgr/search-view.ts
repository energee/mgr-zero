// lib/mgr/search-view.ts — view-model for Search and Entity picker palettes.
import type { PaletteGroup } from "@/components/mgr/palette";

export type SearchViewModel = {
  placeholder: string;
  groups: PaletteGroup[];
  heading?: string;
  sub?: string;
};

export function toSearchViewProps(s: SearchViewModel): SearchViewModel {
  return s;
}

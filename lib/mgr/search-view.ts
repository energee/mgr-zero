// lib/mgr/search-view.ts — view-model for Search and Entity picker palettes.
import type { PaletteGroup } from "@/components/mgr/palette";

export const SEARCH_QUERY_MAX_LENGTH = 80;

export type SearchViewModel = {
  placeholder: string;
  groups: PaletteGroup[];
  heading?: string;
  sub?: string;
};

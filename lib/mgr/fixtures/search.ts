// lib/mgr/fixtures/search.ts — Search and Entity picker palette snapshots.
import type { SearchViewModel } from "@/lib/mgr/search-view";

export const searchPalette: SearchViewModel = {
  placeholder: "Search",
  groups: [
    { heading: "SKUs", items: [["Hazy IPA · ½ bbl", "ATP 11"]] },
    { heading: "Orders", items: [["ORD-0231 · Ridgeline", "4 × Hazy"]] },
    { heading: "Lots", items: [["L-240831-HZ", "packaged 8/31"]] },
  ],
};

export const entityPickerPalette: SearchViewModel = {
  placeholder: "Search SKUs",
  groups: [
    { heading: "Recent", items: [["Hazy IPA · ½ bbl keg", "11 ready", "←"]] },
    { heading: "All SKUs", items: [
      ["Pils · 16 oz case", "6 short", "←"],
      ["Stout · ⅙ bbl keg", "7 ready", "←"],
    ] },
  ],
};

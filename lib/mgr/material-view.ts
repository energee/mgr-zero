// lib/mgr/material-view.ts — view-model for Material (inventory sheet).
export type MaterialViewModel = {
  name: string;
  kind: string;
  kindOptions: string[];
  /** Base units in one purchase unit, the "Base units per purchase unit"
   * field: "44" for a 44 lb hop box. Not the base unit itself; that is `unit`. */
  baseUnits: string;
  purchaseUnit: string;
  purchaseUnitOptions: string[];
  /** The word one purchase unit is sold by, the "Sold by" pick: "bag", one of PACK_NAMES. Empty means none picked.
   * A recipe line of whole packs reads in it ("23 bags"). */
  soldBy: string;
  /** The material already has a saved word. The database keeps a saved word when none is sent, so it can be changed
   * but not cleared, and the pick stops offering None. */
  soldBySaved?: boolean;
  /** The base unit recipes and counts use, the "Base unit" field: "lb". */
  unit: string;
  unitOptions: string[];
  defaultVendorId?: string;
  defaultVendorOptions: { id: string; label: string }[];
  /** SG-style (1.037 = 37 PPG); asked on malt and adjunct only, where recipe
   * predictions read it (lib/recipe-gravity.ts). Empty means none typed. */
  extractPotential?: string;
  /** Percent, as on the bag; asked on hops only, where recipe IBU reads it
   * (lib/recipe-ibu.ts). Empty means none typed. */
  alphaAcid?: string;
  lotTracked: boolean;
  active: boolean;
};

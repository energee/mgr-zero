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
  /** The base unit recipes and counts use, the "Base unit" field: "lb". */
  unit: string;
  unitOptions: string[];
  defaultVendorId?: string;
  defaultVendorOptions: { id: string; label: string }[];
  /** SG-style (1.037 = 37 PPG); asked on malt and adjunct only, where recipe
   * predictions read it (lib/recipe-gravity.ts). Empty means none typed. */
  extractPotential?: string;
  lotTracked: boolean;
  active: boolean;
};

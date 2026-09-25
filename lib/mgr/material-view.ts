// lib/mgr/material-view.ts — view-model for Material (inventory sheet).
export type MaterialViewModel = {
  name: string;
  kind: string;
  kindOptions: string[];
  baseUnits: string;
  purchaseUnit: string;
  purchaseUnitOptions: string[];
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

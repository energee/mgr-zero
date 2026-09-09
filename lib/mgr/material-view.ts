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
  lotTracked: boolean;
  active: boolean;
};

export function toMaterialViewProps(s: MaterialViewModel): MaterialViewModel {
  return s;
}

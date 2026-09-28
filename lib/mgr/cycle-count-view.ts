// lib/mgr/cycle-count-view.ts — view-model for Cycle count (inventory sheet).
export type CycleCountViewModel = {
  material: string;
  qty: string;
  unitIndex: number;
  units: string[];
  preview: string;
  locationId?: string;
  binId?: string;
  locations?: { id: string; name: string }[];
  bins?: { id: string; name: string }[];
  adjustments?: { key: string; lot: string; expected: number; counted: number; delta: number; unit: string }[];
};


export type MaterialCountPreview = {
  revision: string;
  lines: {
    material_id: string; material_name: string; base_uom: string;
    qty_expected: number; qty_counted: number;
    adjustments: { lot_id: string | null; lot_code: string | null; qty_expected: number; qty_counted: number; delta: number }[];
  }[];
};

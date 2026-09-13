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
  lotPreviewUnavailable?: boolean;
};

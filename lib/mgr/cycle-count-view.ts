// lib/mgr/cycle-count-view.ts — view-model for Cycle count (inventory sheet).
export type CycleCountViewModel = {
  material: string;
  qty: string;
  unitIndex: number;
  units: string[];
  preview: string;
};

export function toCycleCountViewProps(s: CycleCountViewModel): CycleCountViewModel {
  return s;
}

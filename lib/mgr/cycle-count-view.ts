// lib/mgr/cycle-count-view.ts — view-model for Cycle count (inventory sheet).
import { canRetireCommandFailure } from "@/lib/commands/failure";

// The count RPC replays a completed request before checking its revision.
// This exact refusal therefore proves even an uncertain earlier send did not
// commit. Other conflicts (including request identity mismatches) do not.
export function canRetireMaterialCountFailure(status: number, retrying: boolean, code: string | undefined, message: string) {
  return (status === 409 && code === "conflict" && message === "Material stock changed. Preview the count again.")
    || canRetireCommandFailure(status, retrying, code);
}

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

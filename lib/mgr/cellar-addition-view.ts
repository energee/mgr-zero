// lib/mgr/cellar-addition-view.ts — view-model and preview rule for the Cellar
// addition sheet (record_batch_addition): a post-knockout dry hop, fruit or
// adjunct against an open occupancy. Inventory renders a fixture, live renders
// list_occupancies + list_materials + list_material_lots through the same view.
import { occupancyIdentity, type TransferOccupancy } from "./cellar-transfer-view";
import { isNumber } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type AdditionMaterial = { id: string; name: string; category: string; base_uom: string; lot_tracked: boolean };
export type AdditionLot = { lot_id: string; lot_code: string; qty: number; received_on: string | null };
/** Post-knockout stages only: mash, boil and whirlpool happen on brew day. Values are the visible Stage toggle labels, so they are sentence case. */
export const ADDITION_STAGES = { dry_hop: "Dry hop", fermentation: "Fermentation", other: "Other" } as const;
export type AdditionStage = keyof typeof ADDITION_STAGES;

export type CellarAdditionViewModel = {
  occupancies: TransferOccupancy[]; materials: AdditionMaterial[]; lotsByMaterial: Record<string, AdditionLot[]>;
  occupancyId: string; materialId: string; lotId: string; stage: AdditionStage; qty: string;
};

/** What the sheet will write, or the one thing it still needs (`need`, a
 *  submitReason item). The form's submit gate and the view read the same
 *  answer. `error` is set only when the quantity is more than the lot holds. */
export function additionPreview(m: CellarAdditionViewModel) {
  const occupancy = m.occupancies.find((o) => o.occupancy_id === m.occupancyId);
  const material = m.materials.find((x) => x.id === m.materialId);
  const qty = Number(m.qty);
  if (!occupancy) return { valid: false as const, need: "a tank" };
  if (!material) return { valid: false as const, need: "a material" };
  if (!isNumber(m.qty) || qty <= 0) return { valid: false as const, need: "a quantity above zero in decimal notation" };
  const lot = (m.lotsByMaterial[m.materialId] ?? []).find((l) => l.lot_id === m.lotId);
  if (material.lot_tracked && !lot) return { valid: false as const, need: `a lot (${material.name} is lot-tracked)` };
  if (lot && qty > lot.qty) return { valid: false as const, need: `at most ${lot.qty} ${material.base_uom} of ${lot.lot_code}`, error: `Only ${lot.qty} ${material.base_uom} of ${lot.lot_code} on hand` };
  return { valid: true as const, qty, text: `Preview: −${qty} ${material.base_uom} ${material.name}${lot ? ` · ${lot.lot_code}` : ""} · consumption · ${ADDITION_STAGES[m.stage]} · ${occupancyIdentity(occupancy)}` };
}

/** The Still needed sentence beside Record addition, or null once the sheet can post. */
export const additionReason = (preview: ReturnType<typeof additionPreview>) => preview.valid ? null : submitReason([preview.need]);

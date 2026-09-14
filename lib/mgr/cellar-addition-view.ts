// lib/mgr/cellar-addition-view.ts — view-model and preview rule for the Cellar
// addition sheet (record_batch_addition): a post-knockout dry hop, fruit or
// adjunct against an open occupancy. Inventory renders a fixture, live renders
// list_occupancies + list_materials + list_material_lots through the same view.
import { occupancyIdentity, type TransferOccupancy } from "./cellar-transfer-view";

export type AdditionMaterial = { id: string; name: string; category: string; base_uom: string; lot_tracked: boolean };
export type AdditionLot = { lot_id: string; lot_code: string; qty: number; received_on: string | null };
/** Post-knockout stages only: mash, boil and whirlpool happen on brew day. */
export const ADDITION_STAGES = { dry_hop: "dry hop", fermentation: "fermentation", other: "other" } as const;
export type AdditionStage = keyof typeof ADDITION_STAGES;

export type CellarAdditionViewModel = {
  occupancies: TransferOccupancy[]; materials: AdditionMaterial[]; lotsByMaterial: Record<string, AdditionLot[]>;
  occupancyId: string; materialId: string; lotId: string; stage: AdditionStage; qty: string;
};

/** What the sheet will write, or why it cannot yet; the form's submit gate and the view's info line read the same answer. */
export function additionPreview(m: CellarAdditionViewModel) {
  const occupancy = m.occupancies.find((o) => o.occupancy_id === m.occupancyId);
  const material = m.materials.find((x) => x.id === m.materialId);
  const qty = Number(m.qty);
  if (!occupancy) return { valid: false as const, reason: "Choose a tank" };
  if (!material) return { valid: false as const, reason: "Choose a material" };
  if (!Number.isFinite(qty) || qty <= 0) return { valid: false as const, reason: "Enter a quantity" };
  const lot = (m.lotsByMaterial[m.materialId] ?? []).find((l) => l.lot_id === m.lotId);
  if (material.lot_tracked && !lot) return { valid: false as const, reason: `Choose a lot · ${material.name} is lot-tracked` };
  if (lot && qty > lot.qty) return { valid: false as const, reason: `Only ${lot.qty} ${material.base_uom} of ${lot.lot_code} on hand` };
  return { valid: true as const, text: `Preview: −${qty} ${material.base_uom} ${material.name}${lot ? ` · ${lot.lot_code}` : ""} · consumption · ${ADDITION_STAGES[m.stage]} · ${occupancyIdentity(occupancy)}` };
}

// lib/mgr/cellar-addition-view.ts — view-model and preview rule for the Cellar
// addition sheet (record_batch_addition): a post-knockout dry hop, fruit or
// adjunct against an open occupancy. Inventory renders a fixture, live renders
// list_occupancies + list_materials + list_material_lots through the same view.
import type { TransferOccupancy } from "./cellar-transfer-view";

export type AdditionMaterial = { id: string; name: string; category: string; base_uom: string; lot_tracked: boolean };
export type AdditionLot = { lot_id: string; lot_code: string; qty: number; received_on: string | null };
/** Post-knockout stages only: mash, boil and whirlpool happen on brew day. */
export const ADDITION_STAGES = [["dry_hop", "dry hop"], ["fermentation", "fermentation"], ["other", "other"]] as const;
export type AdditionStage = (typeof ADDITION_STAGES)[number][0];

export type CellarAdditionViewModel = {
  occupancies: TransferOccupancy[]; materials: AdditionMaterial[]; lotsByMaterial: Record<string, AdditionLot[]>;
  occupancyId: string; materialId: string; lotId: string; stage: AdditionStage; qty: string;
};

export const batchLabel = (o: TransferOccupancy | undefined) => o?.batch_no == null ? "" : `B-${String(o.batch_no).padStart(4, "0")}`;

export function additionPreview(i: { material?: AdditionMaterial; lots: AdditionLot[]; lotId: string; qty: string; stage: AdditionStage; batch: string }) {
  const qty = Number(i.qty), stage = ADDITION_STAGES.find(([id]) => id === i.stage)?.[1] ?? i.stage;
  if (!i.material) return { valid: false as const, reason: "Choose a material" };
  if (!Number.isFinite(qty) || qty <= 0) return { valid: false as const, reason: "Enter a quantity" };
  const lot = i.lots.find((l) => l.lot_id === i.lotId);
  if (i.material.lot_tracked && !lot) return { valid: false as const, reason: `Choose a lot · ${i.material.name} is lot-tracked` };
  if (lot && qty > lot.qty) return { valid: false as const, reason: `Only ${lot.qty} ${i.material.base_uom} of ${lot.lot_code} on hand` };
  return { valid: true as const, text: `Preview: −${qty} ${i.material.base_uom} ${i.material.name}${lot ? ` · ${lot.lot_code}` : ""} · consumption · ${stage} · ${i.batch}` };
}

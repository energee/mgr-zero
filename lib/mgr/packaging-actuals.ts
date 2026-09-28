import { isNumber } from "./quantity-input";

export type PackagingMaterial = { id: string; name: string; unit: string; lotTracked: boolean };
export type PackagingActualDraft = {
  key: string; materialId: string; locationId: string; binId: string; lotId: string | null;
  used: string; loss: string; unused: string;
};

/** Confirm every planned material, including explicit zero use, at one row per source. */
export function packagingActualsReady(rows: PackagingActualDraft[], materials: PackagingMaterial[], requiredIds: string[]) {
  if (requiredIds.some(id => !rows.some(row => row.materialId === id))) return false;
  const sources = new Set<string>();
  return rows.every(row => {
    const material = materials.find(item => item.id === row.materialId);
    if (!material || !row.locationId || !row.binId || (material.lotTracked ? !row.lotId && [row.used,row.loss,row.unused].some(value => Number(value) !== 0) : Boolean(row.lotId))) return false;
    const source = [row.materialId, row.locationId, row.binId, row.lotId ?? ""].join("|").toLowerCase();
    if (sources.has(source)) return false;
    sources.add(source);
    return [row.used, row.loss, row.unused].every(value => {
      if (!isNumber(value)) return false;
      const quantity = Number(value);
      return quantity >= 0 && quantity <= 9999999999.9999 && Number(quantity.toFixed(4)) === quantity
        && (material.unit !== "each" || Number.isInteger(quantity));
    });
  });
}

export type PackagingRequirement = { materialId: string; name: string; unit: string; lotTracked: boolean; qty: number; onHand?: number; onOrder?: number; short?: number };
export type PackagingSource = { materialId: string; locationId: string; binId: string; lotId: string | null; qty: number };
export type PackagingClosePlan = {
  revision: string; planned: PackagingRequirement[]; sources: PackagingSource[]; materials: PackagingMaterial[];
  lots: { id: string; materialId: string; code: string }[];
};
export type PackagingMaterialRecord = {
  id: string; created_at: string; corrects_id: string | null; correction_reason: string | null; planned: PackagingRequirement[];
  actuals: { material_id: string; location_id: string; bin_id: string; lot_id: string | null; material_name: string; unit: string; location_name: string; bin_name: string; lot_code: string | null; qty_used: number; qty_loss: number; qty_unused: number }[];
};

/** Suggest FEFO sources, retaining unmet planned quantity visibly for review. */
export function suggestedPackagingActuals(plan: Pick<PackagingClosePlan, "planned" | "sources">): PackagingActualDraft[] {
  return plan.planned.flatMap(material => {
    let remaining = Math.round(material.qty * 10000);
    const sources = plan.sources.filter(source => source.materialId === material.materialId);
    if (!sources.length) return [{ key: material.materialId, materialId: material.materialId, locationId: "", binId: "", lotId: null, used: String(remaining / 10000), loss: "0", unused: "0" }];
    const rows: PackagingActualDraft[] = [];
    for (const [index, source] of sources.entries()) {
      const used = index === sources.length - 1 ? remaining : Math.min(remaining, Math.round(source.qty * 10000));
      rows.push({ key: `${material.materialId}-${index}`, materialId: material.materialId, locationId: source.locationId, binId: source.binId, lotId: source.lotId, used: String(used / 10000), loss: "0", unused: "0" });
      remaining -= used;
      if (remaining <= 0) break;
    }
    return rows;
  });
}

/** Replacement stock includes the exact movements the current revision reverses. */
export function packagingCorrectionPlan(plan: PackagingClosePlan, record: PackagingMaterialRecord): PackagingClosePlan {
  const sources = plan.sources.map(row => ({ ...row }));
  for (const row of record.actuals) {
    const source = sources.find(item => item.materialId === row.material_id && item.locationId === row.location_id && item.binId === row.bin_id && item.lotId === row.lot_id);
    const restored = Math.round(row.qty_used * 10000) + Math.round(row.qty_loss * 10000);
    if (source) source.qty = (Math.round(source.qty * 10000) + restored) / 10000;
    else sources.push({ materialId: row.material_id, locationId: row.location_id, binId: row.bin_id, lotId: row.lot_id, qty: restored / 10000 });
  }
  return { ...plan, planned: record.planned, sources };
}

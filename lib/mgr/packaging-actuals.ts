import { fromTicks, isNumber, toTicks } from "./quantity-input";
import { materialSourceKey, restoreSources } from "./material-source";

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
    const source = materialSourceKey(row);
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

/** A blank source row the person fills in. */
export const emptyPackagingActual = (): PackagingActualDraft => ({ key: crypto.randomUUID(), materialId: "", locationId: "", binId: "", lotId: null, used: "0", loss: "0", unused: "0" });

/** Draft rows in the command's wire shape. */
export const packagingActualPayload = (rows: PackagingActualDraft[]) => rows.map(row => ({
  materialId: row.materialId, locationId: row.locationId, binId: row.binId, lotId: row.lotId,
  used: Number(row.used), loss: Number(row.loss), unused: Number(row.unused),
}));

export const patchActual = (rows: PackagingActualDraft[], key: string, patch: Partial<PackagingActualDraft>) => rows.map(row => row.key === key ? { ...row, ...patch } : row);
export const removeActual = (rows: PackagingActualDraft[], key: string) => rows.filter(row => row.key !== key);

/** A correction needs a reason and a complete set of replacement actuals against its restored plan. */
export const packagingCorrectionReady = (reason: string, rows: PackagingActualDraft[], plan: PackagingClosePlan) =>
  reason.trim() !== "" && packagingActualsReady(rows, plan.materials, plan.planned.map(row => row.materialId));

/** Suggest FEFO sources, retaining unmet planned quantity visibly for review. */
export function suggestedPackagingActuals(plan: Pick<PackagingClosePlan, "planned" | "sources">): PackagingActualDraft[] {
  return plan.planned.flatMap(material => {
    let remaining = toTicks(material.qty);
    const sources = plan.sources.filter(source => source.materialId === material.materialId);
    if (!sources.length) return [{ key: material.materialId, materialId: material.materialId, locationId: "", binId: "", lotId: null, used: String(fromTicks(remaining)), loss: "0", unused: "0" }];
    const rows: PackagingActualDraft[] = [];
    for (const [index, source] of sources.entries()) {
      const used = index === sources.length - 1 ? remaining : Math.min(remaining, toTicks(source.qty));
      rows.push({ key: `${material.materialId}-${index}`, materialId: material.materialId, locationId: source.locationId, binId: source.binId, lotId: source.lotId, used: String(fromTicks(used)), loss: "0", unused: "0" });
      remaining -= used;
      if (remaining <= 0) break;
    }
    return rows;
  });
}

/** Replacement stock includes the exact movements the current revision reverses. */
export function packagingCorrectionPlan(plan: PackagingClosePlan, record: PackagingMaterialRecord): PackagingClosePlan {
  const reversed = record.actuals.map(row => ({
    source: { materialId: row.material_id, locationId: row.location_id, binId: row.bin_id, lotId: row.lot_id, qty: 0 },
    qty: fromTicks(toTicks(row.qty_used) + toTicks(row.qty_loss)),
  }));
  return { ...plan, planned: record.planned, sources: restoreSources(plan.sources, reversed, materialSourceKey) };
}

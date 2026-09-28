import type { IngredientStage } from "./recipe-process-view";
// lib/mgr/brew-day-view.ts — view-model for Brew day.
export type BrewDayLotView = { key: string; title: string; detail: string };
export type BrewDayVessel = { id: string; name: string; kind: string; capacity_bbl: number };

export type BrewMaterialSource = { material_id: string; material_name: string; unit: string; location_id: string; location_name: string; bin_id: string; bin_name: string; lot_id: string | null; lot_code: string | null; qty: number };
export type BrewActualDraft = { key: string; source: string; recipeIngredientId?: string; stage: IngredientStage; qty: string };
export type BrewPlan = { recipe?: string; version?: { version?: number; mash_schedule?: { name: string; temp_f?: number; tempF?: number; minutes: number }[] } | null;
  ingredients?: { id: string; material_id: string; materialName: string; unit: string; stage: IngredientStage; per_bbl_qty: number }[];
  waterAdditions?: { materialName: string; qty: number; unit: string; baseUnit: string }[] };
export type BrewRecordView = { id: string; initial_bbl: number; brewed_on: string; created_at: string; correction_reason: string | null; corrects_id: string | null;
  plan_snapshot: BrewPlan; process: Record<string, number>; additions: { id: string; material_name: string; unit: string; confirmed_qty: number; stage: IngredientStage; recipe_ingredient_id: string | null; lot_code: string | null; location_name: string; bin_name: string;
    source: { material_id: string; location_id: string; bin_id: string; lot_id: string | null } }[] };
export type BrewDayViewModel = {
  sources?: BrewMaterialSource[];
  actuals?: BrewActualDraft[];
  process?: Record<string, string>;
  confirmEmpty?: boolean;
  plan?: BrewPlan;
  records?: BrewRecordView[];
  correctionRecordId?: string;
  correctionReason?: string;
  backHref?: string;
  title: string;
  planned?: string;
  note?: string;
  lots?: BrewDayLotView[];
  vesselId: string;
  vesselName?: string;
  initialBbl: string;
  brewedOn: string;
  vessels: BrewDayVessel[];
  recorded?: boolean;
  /** A cancelled plan shows only its planned facts and the cancelled notice. */
  cancelled?: boolean;
  sheet?: { title: string; detail: string };
  tapeHead?: [string, string][];
};

export function brewSourceKey(source: Pick<BrewMaterialSource, "material_id" | "location_id" | "bin_id" | "lot_id">) {
  return [source.material_id, source.location_id, source.bin_id, source.lot_id ?? ""].join("/");
}

export function brewPlanActuals(plan: BrewPlan, volume: number, sources: BrewMaterialSource[]): BrewActualDraft[] {
  return (plan.ingredients ?? []).filter(row => ["mash", "boil", "whirlpool"].includes(row.stage)).map(row => {
    const matches = sources.filter(source => source.material_id === row.material_id);
    return { key: row.id, recipeIngredientId: row.id, stage: row.stage, qty: String(Math.round(row.per_bbl_qty * volume * 10000) / 10000), source: matches.length === 1 ? brewSourceKey(matches[0]) : "" };
  });
}

export function canRecordBrewDay(model: BrewDayViewModel) {
  if (model.recorded || model.cancelledAt || !model.vessels.some(vessel => vessel.id === model.vesselId) || !Number.isFinite(Number(model.initialBbl)) || Number(model.initialBbl) <= 0 || !model.brewedOn) return false;
  if (model.correctionRecordId && !model.correctionReason?.trim()) return false;
  const actuals = model.actuals ?? [];
  if (!actuals.length) return Boolean(model.confirmEmpty);
  const totals = new Map<string, number>();
  for (const row of actuals) {
    const source = model.sources?.find(source => brewSourceKey(source) === row.source), qty = Number(row.qty);
    if (!source || !Number.isFinite(qty) || qty <= 0) return false;
    const total = (totals.get(row.source) ?? 0) + Math.round(qty * 10000);
    if (total > Math.round(source.qty * 10000)) return false;
    totals.set(row.source, total);
  }
  return true;
}

export function brewActualPayload(model: BrewDayViewModel) {
  return (model.actuals ?? []).map(row => {
    const source = model.sources?.find(source => brewSourceKey(source) === row.source);
    if (!source) throw new Error("Choose an exact material source");
    return { materialId: source.material_id, locationId: source.location_id, binId: source.bin_id, lotId: source.lot_id,
      recipeIngredientId: row.recipeIngredientId, stage: row.stage, qty: Number(row.qty) };
  });
}

export function brewCorrectionModel(model: BrewDayViewModel, record: BrewRecordView): BrewDayViewModel {
  const sources = [...(model.sources ?? []).map(source => ({ ...source }))];
  for (const addition of record.additions) {
    const found = sources.find(source => brewSourceKey(source) === brewSourceKey(addition.source));
    if (found) found.qty = (Math.round(found.qty * 10000) + Math.round(addition.confirmed_qty * 10000)) / 10000;
    else sources.push({ ...addition.source, material_name: addition.material_name, unit: addition.unit, location_name: addition.location_name, bin_name: addition.bin_name, lot_code: addition.lot_code, qty: addition.confirmed_qty });
  }
  return { ...model, recorded: false, correctionRecordId: record.id, correctionReason: "", initialBbl: String(record.initial_bbl), brewedOn: record.brewed_on,
    plan: record.plan_snapshot, process: Object.fromEntries(Object.entries(record.process).map(([key, value]) => [key, String(value)])), sources,
    actuals: record.additions.map(row => ({ key: row.id, source: brewSourceKey(row.source), recipeIngredientId: row.recipe_ingredient_id ?? undefined, stage: row.stage, qty: String(row.confirmed_qty) })), confirmEmpty: record.additions.length === 0 };
}

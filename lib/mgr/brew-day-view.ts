import { BREW_DAY_STAGES, isBrewDayStage, type IngredientStage } from "./recipe-process-view";
import { materialSourceKey, restoreSources } from "./material-source";
import { fromTicks, toTicks } from "./quantity-input";
// lib/mgr/brew-day-view.ts — view-model for Brew day.
export type BrewDayLotView = { key: string; title: string; detail: string };
export type BrewDayVessel = { id: string; name: string; kind: string; capacity_bbl: number };

/** Vessel pick options: "FV3 · fermenter · 25.5 bbl". */
export const vesselOptions = (vessels: BrewDayVessel[]) =>
  vessels.map(item => ({ value: item.id, label: `${item.name} · ${item.kind} · ${Number(item.capacity_bbl)} bbl` }));

export type BrewMaterialSource = { material_id: string; material_name: string; unit: string; location_id: string; location_name: string; bin_id: string; bin_name: string; lot_id: string | null; lot_code: string | null; qty: number };
/** A saved Prep line (brew_pulls): the exact source and the amount pulled for a recipe line; qty is pulled, not on hand. */
export type BrewPull = BrewMaterialSource & { id: string; recipe_ingredient_id: string | null };
export type BrewActualDraft = { key: string; source: string; recipeIngredientId?: string; stage: IngredientStage; qty: string };
/** purchaseUomFactor is the material's pack size; plan snapshots frozen before it existed lack it, read as 1. */
export type BrewPlanIngredient = { id: string; material_id: string; materialName: string; unit: string; stage: IngredientStage; per_bbl_qty: number; purchaseUomFactor?: number };
/** version is the pinned recipe_versions row (to_jsonb); a snapshot frozen before a process column existed lacks it. */
export type BrewPlan = { recipe?: string; version?: { version?: number; mash_schedule?: { name: string; temp_f?: number; tempF?: number; minutes: number }[];
    mash_temp_f?: number | null; target_mash_ph?: number | null; pre_boil_bbl?: number | null; boil_minutes?: number | null;
    whirlpool_temp_f?: number | null; whirlpool_minutes?: number | null; knockout_temp_f?: number | null } | null;
  ingredients?: BrewPlanIngredient[];
  waterAdditions?: BrewWaterAddition[] };
/** A pinned plan's water addition (recipe_water_additions): an absolute amount in its own unit (g, mL or oz) and stage
 *  (mash, sparge or kettle); baseUnit is its material's stock unit. */
export type BrewWaterAddition = { id: string; material_id: string; materialName: string; qty: number; unit: string; stage: string; baseUnit: string };
export type BrewRecordView = { id: string; turn: number; initial_bbl: number; brewed_on: string; created_at: string; correction_reason: string | null; corrects_id: string | null;
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
  addingTurn?: boolean;
  plannedBbl?: number;
  today?: string;
  /** A cancelled plan shows only its planned facts and the cancelled notice. */
  cancelled?: boolean;
  /** A completed batch: the day it completed, the loss its completion wrote off (null when none), and the barrels its
   *  closed packaging runs packaged (get_brew_day's packagedBbl). */
  completion?: { on: string; writeOffBbl: number | null; packagedBbl: number };
  sheet?: { title: string; detail: string };
  tapeHead?: [string, string][];
};

export function brewSourceKey(source: Pick<BrewMaterialSource, "material_id" | "location_id" | "bin_id" | "lot_id">) {
  return materialSourceKey({ materialId: source.material_id, locationId: source.location_id, binId: source.bin_id, lotId: source.lot_id });
}

/** The plan's lines confirmed on brew day (mash, boil, whirlpool), in plan order. */
export const brewDayLines = (plan: BrewPlan) =>
  (plan.ingredients ?? []).filter((row): row is BrewPlanIngredient & { stage: (typeof BREW_DAY_STAGES)[number] } => isBrewDayStage(row.stage));

/** A line's planned amount for `volume` bbl, exact to the tick. */
export const plannedQty = (row: BrewPlanIngredient, volume: number) => fromTicks(toTicks(row.per_bbl_qty * volume));

/** The one source holding this material; undefined when none or several do, so the brewer chooses. */
export function soleSource(sources: BrewMaterialSource[], materialId: string): BrewMaterialSource | undefined {
  const matches = sources.filter(source => source.material_id === materialId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function brewPlanActuals(plan: BrewPlan, volume: number, sources: BrewMaterialSource[]): BrewActualDraft[] {
  return brewDayLines(plan).map(row => {
    const source = soleSource(sources, row.material_id);
    return { key: row.id, recipeIngredientId: row.id, stage: row.stage, qty: String(plannedQty(row, volume)), source: source ? brewSourceKey(source) : "" };
  });
}

export function canRecordBrewDay(model: BrewDayViewModel) {
  if (model.recorded || model.cancelled || (!model.correctionRecordId && !model.vessels.some(vessel => vessel.id === model.vesselId)) || !Number.isFinite(Number(model.initialBbl)) || Number(model.initialBbl) <= 0 || !model.brewedOn) return false;
  if (model.correctionRecordId && !model.correctionReason?.trim()) return false;
  const actuals = model.actuals ?? [];
  if (!actuals.length) return Boolean(model.confirmEmpty);
  if (actuals.some(row => !Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0)) return false;
  return fitsStock(actuals.map(row => ({ source: row.source, qty: Number(row.qty) })), model.sources);
}

/** Lines drawing on one source (by brewSourceKey) together fit what it holds; a line whose source is not in stock does not fit. */
export function fitsStock(lines: { source: string; qty: number }[], sources: BrewMaterialSource[] = []): boolean {
  const totals = new Map<string, number>();
  return lines.every(line => {
    const source = sources.find(candidate => brewSourceKey(candidate) === line.source);
    const total = (totals.get(line.source) ?? 0) + toTicks(line.qty);
    totals.set(line.source, total);
    return source !== undefined && total <= toTicks(source.qty);
  });
}

export function brewActualPayload(model: BrewDayViewModel) {
  return (model.actuals ?? []).map(row => {
    const source = model.sources?.find(source => brewSourceKey(source) === row.source);
    if (!source) throw new Error("Choose an exact material source");
    return { materialId: source.material_id, locationId: source.location_id, binId: source.bin_id, lotId: source.lot_id,
      recipeIngredientId: row.recipeIngredientId, stage: row.stage, qty: Number(row.qty) };
  });
}

/** Typed process readings as numbers; a blank reading was not measured and is left out. */
export const observedProcess = (process?: Record<string, string>) =>
  Object.fromEntries(Object.entries(process ?? {}).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)]));

/** Submit the selected turn's correction or a new brew turn. Blank observations are omitted. */
export function brewRecordPayload(values: BrewDayViewModel, batchId: string): [string, Record<string, unknown>] {
  const facts = { initialBbl: Number(values.initialBbl), actuals: brewActualPayload(values), process: observedProcess(values.process), confirmEmpty: Boolean(values.confirmEmpty) };
  return values.correctionRecordId
    ? ["correct_brew_record", { ...facts, recordId: values.correctionRecordId, reason: values.correctionReason }]
    : ["record_brew_day", { ...facts, batchId, vesselId: values.vesselId, brewedOn: values.brewedOn }];
}

/** Only the latest revision of each turn contributes to confirmed totals. */
export function currentBrewRecords(records: BrewRecordView[]): BrewRecordView[] {
  const corrected = new Set(records.map(record => record.corrects_id));
  return records.filter(record => !corrected.has(record.id));
}

/** A recorded batch prints each turn's Confirmed knockout only when it adds something: there are several turns
 *  (corrections included), or the one turn's barrels differ from the Knockout line (`initialBbl`) (#1508). */
export const showsTurnKnockout = (records: BrewRecordView[], initialBbl: string) =>
  records.length > 1 || records.some(record => Number(record.initial_bbl) !== Number(initialBbl));

/** The batch knocked out its planned barrels on its planned day, so a recorded batch's Planned line would only repeat
 *  Knockout and Brewed on (#1508). `brewed` is the Knockout barrels and brew date as the page holds them. */
export const brewedAsPlanned = (plan: { bbl: number; on: string }, brewed: { bbl: string; on: string }) =>
  brewed.bbl !== "" && Number(brewed.bbl) === plan.bbl && brewed.on === plan.on;

/** Start another turn in the same tank; its actuals begin with the remaining plan. */
export function brewTurnModel(model: BrewDayViewModel): BrewDayViewModel {
  const recordedBbl = currentBrewRecords(model.records ?? []).reduce((sum, record) => sum + record.initial_bbl, 0);
  const remaining = fromTicks(toTicks(Math.max(0, (model.plannedBbl ?? 0) - recordedBbl)));
  return { ...model, recorded: false, addingTurn: true, correctionRecordId: undefined, correctionReason: undefined,
    initialBbl: remaining > 0 ? String(remaining) : "", brewedOn: model.today ?? "", process: {}, confirmEmpty: false,
    actuals: brewPlanActuals(model.plan ?? {}, remaining, model.sources ?? []) };
}

export function brewCorrectionModel(model: BrewDayViewModel, record: BrewRecordView): BrewDayViewModel {
  const sources = restoreSources(model.sources ?? [], record.additions.map(addition => ({
    source: { ...addition.source, material_name: addition.material_name, unit: addition.unit, location_name: addition.location_name, bin_name: addition.bin_name, lot_code: addition.lot_code, qty: 0 },
    qty: addition.confirmed_qty,
  })), brewSourceKey);
  return { ...model, recorded: false, correctionRecordId: record.id, correctionReason: "", initialBbl: String(record.initial_bbl), brewedOn: record.brewed_on,
    plan: record.plan_snapshot, process: Object.fromEntries(Object.entries(record.process).map(([key, value]) => [key, String(value)])), sources,
    actuals: record.additions.map(row => ({ key: row.id, source: brewSourceKey(row.source), recipeIngredientId: row.recipe_ingredient_id ?? undefined, stage: row.stage, qty: String(row.confirmed_qty) })), confirmEmpty: record.additions.length === 0 };
}

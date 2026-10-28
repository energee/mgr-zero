// lib/mgr/schedule-packaging-run-view.ts — the Schedule packaging run sheet's
// model, and the pure adapter that builds it from the packaging page's reads
// (list_brands, list_occupancies, list_skus) plus the form's draft. The
// inventory fixture is lib/mgr/fixtures/packaging.ts.
import { brandLabel } from "./brand-view";
import { batNo } from "@/lib/mgr/doc-no";
import { formatVolume } from "@/lib/volume";
import { isPastDay } from "@/lib/date-format";
import { submitReason } from "./submit-reason";
import { isNumber, numberNotationError } from "./quantity-input";

type Option = { value: string; label: string };

export type SchedulePackagingRunViewModel = {
  plannedOn: string;
  brandId: string;
  brandOptions: Option[];
  /** "" = no source tank yet; the first option says so. */
  occupancyId: string;
  sourceOptions: Option[];
  /** The chosen tank and what is in it; both "" with no source. */
  source: string;
  sourceDetail: string;
  /** One row per package of the chosen brand. `listed` is absent where the
   *  wholesale-list flag cannot be saved (schedule_packaging_run takes none). */
  outputs: { key: string; title: string; detail: string; qty: string; whole?: boolean; listed?: boolean }[];
  /** Absent with no source, or when a planned package's volume is unknown. */
  leftLabel?: string;
  leftInSource?: string;
  /** Current material requirement projection for the draft outputs. */
  materials?: [material: string, planned: string, onHand: string | number, short: string | number][];
  materialsMessage?: string;
  warning?: string;
  sourceWarning?: string;
  dateWarning?: string;
};

export type ScheduleRunData = {
  brands: { id: string; name: string; alias?: string | null }[];
  occupancies: { occupancy_id: string; vessel_name: string | null; brand_name: string | null; batch_no: number | null; bbl: number }[];
  skus: { id: string; name: string; brand_id: string; formats?: { package_type: string | null } | null; format_volume: { bbl_per_unit: number | null } | null }[];
};

export type ScheduleRunDraft = { brandId: string; occupancyId: string; plannedOn: string; qty: Record<string, string> };

const bblPerUnit = (sku: ScheduleRunData["skus"][number]) =>
  sku.format_volume?.bbl_per_unit == null ? undefined : Number(sku.format_volume.bbl_per_unit);

/** The planned count of a package, or 0 when the field is blank or not a number. */
export const plannedQty = (value: string | undefined) => {
  const qty = Number(value);
  return value && isNumber(value) && qty > 0 ? qty : 0;
};

/** A package count's error, planned (Schedule) or actual (Close, #1477): plain
 *  notation, zero or more, whole kegs. Blank is no error here; each form says
 *  whether a blank is allowed. */
export function packageQtyError(value: string, whole = false): string | undefined {
  if (!value.trim()) return undefined;
  const notation = numberNotationError(value);
  if (notation) return notation;
  if (!isNumber(value) || Number(value) < 0) return "Enter a quantity of zero or more.";
  if (whole && !Number.isInteger(Number(value))) return "Enter a whole number of kegs.";
}

export function scheduleRunReason(model: Pick<SchedulePackagingRunViewModel, "brandId" | "plannedOn" | "outputs">): string | null {
  const missing: string[] = [];
  if (!model.brandId) missing.push("a brand");
  if (!model.plannedOn) missing.push("a planned date");
  if (!model.outputs.some((output) => plannedQty(output.qty) > 0)) missing.push("a positive planned output quantity");
  if (model.outputs.some(output => packageQtyError(output.qty, output.whole))) missing.push("valid planned quantities (whole numbers for kegs)");
  return submitReason(missing);
}

export function toSchedulePackagingRunView(data: ScheduleRunData, draft: ScheduleRunDraft, today?: string): SchedulePackagingRunViewModel {
  const skus = data.skus.filter((sku) => sku.brand_id === draft.brandId);
  const occupancy = data.occupancies.find((o) => o.occupancy_id === draft.occupancyId);
  const tank = (o: ScheduleRunData["occupancies"][number]) => `${o.vessel_name ?? "—"} · ${o.brand_name ?? "no brand"}`;
  // Barrels planned per package; undefined when a planned package has no known volume.
  const planned = skus.map((sku) => {
    const qty = plannedQty(draft.qty[sku.id]);
    const perUnit = bblPerUnit(sku);
    return qty === 0 ? 0 : perUnit === undefined ? undefined : qty * perUnit;
  });
  const drawn = planned.every((bbl) => bbl !== undefined) ? planned.reduce<number>((sum, bbl) => sum + bbl!, 0) : undefined;
  return {
    plannedOn: draft.plannedOn,
    brandId: draft.brandId,
    brandOptions: data.brands.map((brand) => ({ value: brand.id, label: brandLabel(brand) })),
    occupancyId: draft.occupancyId,
    sourceOptions: [{ value: "", label: "No source yet" }, ...data.occupancies.map((o) => ({ value: o.occupancy_id, label: `${tank(o)} · ${formatVolume(o.bbl)}` }))],
    source: occupancy ? tank(occupancy) : "",
    sourceDetail: occupancy ? `${batNo(occupancy.batch_no)} · ${formatVolume(occupancy.bbl)}` : "",
    outputs: skus.map((sku, i) => ({ key: sku.id, title: sku.name, detail: planned[i] ? formatVolume(planned[i]) : "", qty: draft.qty[sku.id] ?? "", ...(sku.formats?.package_type === "keg" ? { whole: true } : {}) })),
    ...(occupancy && drawn !== undefined
      ? { leftLabel: `Left in ${occupancy.vessel_name ?? "the tank"}`, leftInSource: formatVolume(occupancy.bbl - drawn) }
      : {}),
    sourceWarning: occupancy && drawn !== undefined && drawn > Number(occupancy.bbl)
      ? "This plan needs more beer than the selected tank currently holds. You can save the plan; it does not reserve or move beer."
      : undefined,
    dateWarning: isPastDay(draft.plannedOn, today)
      ? "This planned date is in the past for your brewery. You can save the plan; it does not record packaging or move inventory."
      : undefined,
  };
}

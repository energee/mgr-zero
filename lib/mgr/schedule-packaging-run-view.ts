// lib/mgr/schedule-packaging-run-view.ts — the Schedule packaging run sheet's
// model, and the pure adapter that builds it from the packaging page's reads
// (list_brands, list_occupancies, list_skus) plus the form's draft. The
// inventory fixture is lib/mgr/fixtures/packaging.ts.
import { batNo } from "@/lib/mgr/doc-no";
import { formatVolume } from "@/lib/volume";

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
  outputs: { key: string; title: string; detail: string; qty: string; listed?: boolean }[];
  /** Absent with no source, or when a planned package's volume is unknown. */
  leftLabel?: string;
  leftInSource?: string;
  /** Absent until a material-shortfall read exists; the sheet draws it gated. */
  materials?: (string | number)[][];
  warning?: string;
};

export type ScheduleRunData = {
  brands: { id: string; name: string }[];
  occupancies: { occupancy_id: string; vessel_name: string | null; brand_name: string | null; batch_no: number | null; bbl: number }[];
  skus: { id: string; name: string; brand_id: string; format_volume: { bbl_per_unit: number | null } | null }[];
};

export type ScheduleRunDraft = { brandId: string; occupancyId: string; plannedOn: string; qty: Record<string, string> };

const bblPerUnit = (sku: ScheduleRunData["skus"][number]) =>
  sku.format_volume?.bbl_per_unit == null ? undefined : Number(sku.format_volume.bbl_per_unit);

/** The planned count of a package, or 0 when the field is blank or not a number. */
export const plannedQty = (value: string | undefined) => {
  const qty = Number(value);
  return value?.trim() && Number.isFinite(qty) && qty > 0 ? qty : 0;
};

export function toSchedulePackagingRunView(data: ScheduleRunData, draft: ScheduleRunDraft): SchedulePackagingRunViewModel {
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
    brandOptions: data.brands.map((brand) => ({ value: brand.id, label: brand.name })),
    occupancyId: draft.occupancyId,
    sourceOptions: [{ value: "", label: "No source yet" }, ...data.occupancies.map((o) => ({ value: o.occupancy_id, label: `${tank(o)} · ${formatVolume(o.bbl)}` }))],
    source: occupancy ? tank(occupancy) : "",
    sourceDetail: occupancy ? `${batNo(occupancy.batch_no)} · ${formatVolume(occupancy.bbl)}` : "",
    outputs: skus.map((sku, i) => ({ key: sku.id, title: sku.name, detail: planned[i] ? formatVolume(planned[i]) : "", qty: draft.qty[sku.id] ?? "" })),
    ...(occupancy && drawn !== undefined
      ? { leftLabel: `Left in ${occupancy.vessel_name ?? "the tank"}`, leftInSource: formatVolume(occupancy.bbl - drawn) }
      : {}),
  };
}

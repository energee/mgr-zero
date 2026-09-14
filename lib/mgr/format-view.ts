// lib/mgr/format-view.ts — view-model for one Format sheet. upsert_format
// plus replace_format_bom lines paint name, basis, package, volume, and BOM.
import { GALLONS_PER_BBL, OUNCES_PER_BBL, parseVolumeToBbl, formatVolume } from "@/lib/volume";

import { SIZE_LABEL } from "@/lib/mgr/keg-labels";

export const KEG_BBL: Record<string, number> = {
  half_bbl: 0.5, quarter_bbl: 0.25, sixth_bbl: 1 / 6,
  fifty_l: 50 / (31 * 3.785411784), thirty_l: 30 / (31 * 3.785411784), twenty_l: 20 / (31 * 3.785411784),
};

export type FormatBomRowView = {
  material: string;
  qty: string;
  onBreak: string;
};

export type FormatViewModel = {
  name: string;
  basis: "packaged" | "poured";
  basisOptions: string[];
  packageType: string;
  packageOptions: string[];
  kegSize: string;
  kegSizeOptions: string[];
  unitsPerCase: string;
  volumeValue: string;
  volumeUnits: Array<"oz" | "gal" | "bbl">;
  volumeUnitIndex: number;
  composed: boolean;
  composedInfo: string;
  bom: FormatBomRowView[];
  bomInfo: string;
};

const PACKAGES = ["can", "bottle", "keg"];
const UNITS: Array<"oz" | "gal" | "bbl"> = ["oz", "gal", "bbl"];
const COMPOSED_INFO = "Composed formats show a derived, read-only Volume instead.";
const BOM_INFO = "If the volume or BOM differs, create another Format.";

export type FormatSnapshot = {
  format: {
    id: string;
    name: string;
    basis: "packaged" | "poured";
    package_type: string | null;
    keg_size?: string | null;
    units_per_case?: number | null;
    bbl_per_unit: string | number | null;
    composed?: boolean;
  };
  /** replace_format_bom / format_bom lines with material names. */
  bom?: { material: string; qty: number | string; onBreak: string }[];
  packageOptions?: string[];
};

function closeTo(value: number, target: number) {
  return Math.abs(value - target) < 0.0001;
}

function volumeField(bbl: string | number | null, packageType: string | null): { value: string; index: number } {
  const n = bbl == null || bbl === "" ? NaN : Number(bbl);
  if (!Number.isFinite(n) || n <= 0) return { value: "", index: 0 };
  if (packageType === "keg") return { value: String(n), index: 2 };
  const oz = n * OUNCES_PER_BBL;
  if (oz > 0 && closeTo(oz, Math.round(oz))) return { value: String(Math.round(oz)), index: 0 };
  const gal = n * GALLONS_PER_BBL;
  if (gal > 0 && closeTo(gal, Math.round(gal))) return { value: String(Math.round(gal)), index: 1 };
  return { value: String(n), index: 2 };
}

export function toFormatViewProps({
  format,
  bom = [],
  packageOptions = PACKAGES,
}: FormatSnapshot): FormatViewModel {
  const count = format.units_per_case ?? 1;
  const volume = volumeField(format.bbl_per_unit == null ? null : Number(format.bbl_per_unit) / (format.package_type === "keg" ? 1 : count), format.package_type);
  const standard = format.keg_size && KEG_BBL[format.keg_size];
  const custom = format.package_type === "keg" && (!standard || (format.bbl_per_unit != null && Math.abs(Number(format.bbl_per_unit) - standard) > 0.00000001));
  return {
    name: format.name,
    basis: format.basis,
    basisOptions: ["packaged", "poured"],
    packageType: format.package_type ?? "",
    packageOptions,
    kegSize: custom ? "custom" : format.keg_size ?? "half_bbl",
    kegSizeOptions: ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l", "custom"],
    unitsPerCase: String(count),
    volumeValue: volume.value,
    volumeUnits: UNITS,
    volumeUnitIndex: volume.index,
    composed: Boolean(format.composed),
    composedInfo: COMPOSED_INFO,
    bom: bom.map((line) => ({
      material: line.material,
      qty: String(line.qty),
      onBreak: line.onBreak,
    })),
    bomInfo: BOM_INFO,
  };
}

/** The editor asks for physical dimensions once; commands still store barrels. */
export function formatSizing(model: FormatViewModel) {
  const keg = model.packageType === "keg";
  const count = keg ? 1 : Number(model.unitsPerCase);
  const perContainer = parseVolumeToBbl(model.volumeValue, model.volumeUnits[model.volumeUnitIndex]);
  const bbl = model.composed ? undefined : keg && KEG_BBL[model.kegSize] ? KEG_BBL[model.kegSize] : perContainer === undefined ? undefined : perContainer * count;
  const size = `${model.volumeValue} ${model.volumeUnits[model.volumeUnitIndex]}`;
  const suggestion = model.composed ? "" : keg ? `${SIZE_LABEL[model.kegSize] ?? size} keg` : count === 1 ? `${size} ${model.packageType}` : `${count} × ${size} ${model.packageType}s`;
  const name = model.name.trim() || suggestion;
  const volumeLabel = bbl == null ? "—" : !keg && bbl * GALLONS_PER_BBL >= 1 ? `${Number((bbl * GALLONS_PER_BBL).toPrecision(8))} gal` : formatVolume(bbl);
  const error = !name ? "Enter a format name to continue."
    : !model.composed && (!Number.isInteger(count) || count <= 0) ? "Enter a whole number of containers per package, at least 1."
    : !model.composed && (!Number.isFinite(bbl) || bbl! <= 0) ? keg ? "Enter a positive custom keg volume to continue." : "Enter the size of one container to continue."
    : undefined;
  return { name, bbl, volumeLabel, valid: error === undefined, error };
}

/** Field changes are identical in the live form and the interactive preview. */
export function formatControls(model: FormatViewModel, patch: (next: Partial<FormatViewModel>) => void) {
  return {
    name: (name: string) => patch({ name }),
    packageType: (packageType: string) => patch({ packageType }),
    kegSize: (kegSize: string) => patch({ kegSize }),
    unitsPerCase: (unitsPerCase: string) => patch({ unitsPerCase }),
    volumeValue: (volumeValue: string) => patch({ volumeValue }),
    volumeUnit: (unit: string) => patch({ volumeUnitIndex: model.volumeUnits.indexOf(unit as FormatViewModel["volumeUnits"][number]) }),
    composed: (composed: boolean) => patch({ composed }),
  };
}

export function formatCommandInput(model: FormatViewModel, saved?: FormatSnapshot["format"]) {
  const sizing = formatSizing(model);
  const input = { id: saved?.id, name: sizing.name, basis: "packaged", packageType: model.packageType };
  const initial = saved ? toFormatViewProps({ format: saved }) : undefined;
  if (saved && initial) {
    const unchanged = (["packageType", "kegSize", "unitsPerCase", "volumeValue", "volumeUnitIndex", "composed"] as const).every(key => model[key] === initial[key]);
    if (unchanged) return {
      ...input,
      kegSize: saved.keg_size ?? undefined,
      unitsPerCase: saved.units_per_case ?? undefined,
      bblPerUnit: saved.bbl_per_unit == null ? undefined : Number(saved.bbl_per_unit),
    };
  }
  const keg = model.packageType === "keg";
  // A legacy custom volume does not erase the keg's existing fleet classification.
  const customFleetSize = initial?.packageType === "keg" && initial.kegSize === "custom" ? saved?.keg_size ?? undefined : undefined;
  return {
    ...input,
    kegSize: keg ? model.kegSize === "custom" ? customFleetSize : model.kegSize : undefined,
    unitsPerCase: keg ? undefined : Number(model.unitsPerCase),
    bblPerUnit: sizing.bbl,
  };
}

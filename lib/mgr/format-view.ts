// lib/mgr/format-view.ts — view-model for one Format sheet. upsert_format
// plus replace_format_bom lines paint name, basis, package, volume, and BOM.
import { GALLONS_PER_BBL, LITERS_PER_BBL, OUNCES_PER_BBL, parseVolumeToBbl, formatVolume } from "@/lib/volume";

import { SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { BEER_LB_PER_BBL } from "@/lib/mgr/pallet-fit";

export const KEG_BBL: Record<string, number> = {
  half_bbl: 0.5, quarter_bbl: 0.25, sixth_bbl: 1 / 6,
  fifty_l: 50 / LITERS_PER_BBL, thirty_l: 30 / LITERS_PER_BBL, twenty_l: 20 / LITERS_PER_BBL,
};

/** list_formats attaches the format_volumes read as effective_bbl_per_unit;
 *  rows from other queries carry only the stored column. */
export const effectiveBbl = (f: { bbl_per_unit: string | number | null; effective_bbl_per_unit?: string | number | null }) =>
  f.effective_bbl_per_unit === undefined ? f.bbl_per_unit : f.effective_bbl_per_unit;

export type FormatBomRowView = {
  material: string;
  qty: string;
  onBreak: string;
};

export type FormatViewModel = {
  name: string;
  basis: "packaged" | "poured";
  packageType: string;
  packageOptions: string[];
  kegSize: string;
  kegSizeOptions: string[];
  unitsPerCase: string;
  volumeValue: string;
  volumeUnits: Array<"oz" | "gal" | "bbl">;
  volumeUnitIndex: number;
  composed: boolean;
  /** formats.pallet_fit as field text; "" when unset. Admin edits it. */
  palletFit: string;
  /** formats.pallet_fit_mixed as field text; "" when unset. Kegs only; Admin edits it. */
  palletFitMixed: string;
  /** formats.packaging_lb as field text ("" for none): pounds the empty package adds to the beer. Admin edits it. */
  packagingLb: string;
  /** What the beer in one unit weighs at 1.010, in pounds; "" when the volume is unknown. Shown beside packagingLb. */
  beerLb: string;
  /** formats.height_in as field text ("" when unset): how tall one keg stands or one case sits in a layer. Admin edits it. */
  heightIn: string;
  bom: FormatBomRowView[];
};

const PACKAGES = ["can", "bottle", "keg"];
const UNITS: Array<"oz" | "gal" | "bbl"> = ["oz", "gal", "bbl"];

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
    pallet_fit?: number | null;
    pallet_fit_mixed?: number | null;
    packaging_lb?: string | number | null;
    height_in?: string | number | null;
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
    packageType: format.package_type ?? "",
    packageOptions,
    kegSize: custom ? "custom" : format.keg_size ?? "half_bbl",
    kegSizeOptions: ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l", "custom"],
    unitsPerCase: String(count),
    volumeValue: volume.value,
    volumeUnits: UNITS,
    volumeUnitIndex: volume.index,
    composed: Boolean(format.composed),
    palletFit: format.pallet_fit == null ? "" : String(format.pallet_fit),
    palletFitMixed: format.pallet_fit_mixed == null ? "" : String(format.pallet_fit_mixed),
    packagingLb: Number(format.packaging_lb) ? String(Number(format.packaging_lb)) : "",
    heightIn: Number(format.height_in) ? String(Number(format.height_in)) : "",
    beerLb: Number(format.bbl_per_unit) ? (Number(format.bbl_per_unit) * BEER_LB_PER_BBL).toFixed(1) : "",
    bom: bom.map((line) => ({
      material: line.material,
      qty: String(line.qty),
      onBreak: line.onBreak,
    })),
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

/** Why `name` cannot be created: another packaged format already has it. Matches
 *  formats_packaged_name_idx, which compares trimmed names case-sensitively. */
export function formatNameError(name: string, takenNames: readonly string[]): string | undefined {
  return takenNames.some(taken => taken.trim() === name) ? `A format named ${name} already exists.` : undefined;
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
    palletFit: (palletFit: string) => patch({ palletFit }),
    palletFitMixed: (palletFitMixed: string) => patch({ palletFitMixed }),
    packagingLb: (packagingLb: string) => patch({ packagingLb }),
    heightIn: (heightIn: string) => patch({ heightIn }),
  };
}

export function formatCommandInput(model: FormatViewModel, saved?: FormatSnapshot["format"]) {
  const sizing = formatSizing(model);
  const initial = saved ? toFormatViewProps({ format: saved }) : undefined;
  // Only Admin sees the pallet fit fields, so an unchanged fit is never sent and
  // Sales saves stay within Sales' rights. A cleared field clears it.
  const fit = (key: "palletFit" | "palletFitMixed") => model[key] === (initial?.[key] ?? "") ? {} : { [key]: model[key] ? Number(model[key]) : null };
  // A cleared weight or height sends 0: no packaging weight, and no height.
  const size = (key: "packagingLb" | "heightIn") => model[key] === (initial?.[key] ?? "") ? {} : { [key]: Number(model[key] || 0) };
  const palletFit = { ...fit("palletFit"), ...fit("palletFitMixed"), ...size("packagingLb"), ...size("heightIn") };
  // A legacy format may have no package type; send none rather than "" (#447).
  const input = { id: saved?.id, name: sizing.name, basis: "packaged", packageType: model.packageType || undefined, ...palletFit };
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

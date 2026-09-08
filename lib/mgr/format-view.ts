// lib/mgr/format-view.ts — view-model for one Format sheet. upsert_format
// plus replace_format_bom lines paint name, basis, package, volume, and BOM.
import { GALLONS_PER_BBL, OUNCES_PER_BBL } from "@/lib/volume";

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

function volumeField(bbl: string | number | null): { value: string; index: number } {
  const n = bbl == null || bbl === "" ? NaN : Number(bbl);
  if (!Number.isFinite(n) || n <= 0) return { value: "", index: 0 };
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
  const volume = volumeField(format.bbl_per_unit);
  return {
    name: format.name,
    basis: format.basis,
    basisOptions: ["packaged", "poured"],
    packageType: format.package_type ?? "",
    packageOptions,
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

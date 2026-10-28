// lib/mgr/sku-view.ts — view-model for the SKU sheet. create_sku / list_skus
// plus packaged formats and keg pools paint format, pool, active, and optional UPC.
import { isNumber, numberNotationError, toTicks } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type SkuViewModel = {
  kind?: "packaged" | "poured";
  pourName?: string;
  ounces?: string;
  format: string;
  formatOptions: string[];
  active: boolean;
  upc: string;
  /** Percentage text for existing packaged SKUs; undefined on creation. Blank clears the share. */
  batchSharePercent?: string;
  volumeInfo: string;
  showKegPool?: boolean;
  kegPool?: string;
  kegPoolOptions?: { value: string; label: string; disabled?: boolean }[];
};

export const VOLUME_INFO =
  "Volume and packaging come from the Format. Create another Format when either differs.";

export type SkuSnapshot = {
  sku?: {
    id: string;
    name: string;
    upc: string | null;
    active: boolean;
    format_id: string;
    keg_pool_id?: string | null;
    batch_share?: number | string | null;
    formats: { name: string; package_type?: string | null } | null;
  };
  /** Packaged formats from list_formats for the Format pick. */
  formats: { id: string; name: string; package_type?: string | null }[];
  pools?: KegPoolOption[];
};

export type KegPoolOption = { id: string; name: string; active: boolean };

export function toSkuViewProps({ sku, formats, pools = [] }: SkuSnapshot): SkuViewModel {
  const fromJoin = sku?.formats?.name;
  // Preserve the existing first-format default; saved live edits supply their joined format.
  const selectedFormat = formats.find(f => f.id === sku?.format_id) ?? formats[0];
  const fromList = selectedFormat?.name;
  return {
    format: fromJoin ?? fromList ?? formats[0]?.name ?? "",
    formatOptions: formats.map((f) => f.name),
    active: sku?.active ?? true,
    upc: sku?.upc ?? "",
    batchSharePercent: sku ? (sku.batch_share == null ? "" : String(Number((Number(sku.batch_share) * 100).toPrecision(15)))) : undefined,
    volumeInfo: VOLUME_INFO,
    showKegPool: (sku?.formats ?? selectedFormat)?.package_type === "keg",
    kegPool: sku?.keg_pool_id ?? "",
    kegPoolOptions: [{ value: "", label: "None" }, ...pools.filter(p => p.active || p.id === sku?.keg_pool_id).map(p => ({ value: p.id, label: p.name, disabled: !p.active }))],
  };
}

/** New SKU is one brand in one packaged format; pours are added on the price group (PourForm). */
export function skuCreateCommand(fields: { brandId: string; formatId: string; name: string; upc: string; kegPoolId?: string | null }) {
  return { name: "create_sku", input: { brandId: fields.brandId, formatId: fields.formatId, name: fields.name || undefined, upc: fields.upc || undefined, kegPoolId: fields.kegPoolId }, valid: Boolean(fields.formatId) };
}

/** An edit saves one command. Creation deliberately leaves the optional share unset. */
export function skuUpdateCommand(fields: { skuId: string; active: boolean; upc: string; batchSharePercent: string; kegPoolId?: string | null }) {
  const batchShare = fields.batchSharePercent.trim() === "" ? null : Number(fields.batchSharePercent) / 100;
  return {
    name: "update_sku",
    input: { skuId: fields.skuId, active: fields.active, upc: fields.upc, batchShare, ...(fields.kegPoolId === undefined ? {} : { kegPoolId: fields.kegPoolId }) },
    valid: batchShare === null || (batchShare > 0 && batchShare <= 1),
  };
}

export const pourSkuName = (name: string, ounces: string) => name.trim() || `${Number(ounces)} oz pour`;

/** What is wrong with a typed serving size, or undefined. It keeps the table's
 *  bounds (more than 0, under 1000 oz) as stored: numeric(12,4) rounds to four
 *  decimals, so 0.00004 stores as 0 and 999.99995 as 1000, and both are refused. */
export function pourOuncesError(value: string): string | undefined {
  const notation = numberNotationError(value);
  if (notation) return notation;
  if (!isNumber(value)) return "Enter a serving size in ounces.";
  if (Number(value) <= 0) return "Enter a serving size above 0 oz.";
  const ticks = toTicks(Number(value));
  if (ticks <= 0) return "Enter at least 0.0001 oz: serving sizes are stored to four decimal places.";
  if (ticks >= toTicks(1000)) return "Enter a serving size under 1000 oz.";
}

/** Why Save pour is withheld, from the same check as the field error. */
export const pourReason = (ounces: string) =>
  submitReason(pourOuncesError(ounces) ? ["a serving size from 0.0001 to 999.9999 oz (no exponent notation)"] : []);

// lib/mgr/sku-view.ts — view-model for the SKU sheet. create_sku / list_skus
// plus packaged formats and keg pools paint format, pool, active, and optional UPC.
import { submitReason } from "./submit-reason";
import { UPC_NEED, upcError } from "./upc";

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

/** Why a batch package share percent is out of range, or undefined; blank clears the share. */
export function batchShareError(percent: string): string | undefined {
  if (percent.trim() === "") return undefined;
  const share = Number(percent);
  return share > 0 && share <= 100 ? undefined : "Enter a share above 0% and at most 100%, or clear it.";
}

/** An edit saves one command; `reason` (submitReason) withholds Save SKU while the UPC or share is invalid.
 *  Creation deliberately leaves the optional share unset. */
export function skuUpdateCommand(fields: { skuId: string; active: boolean; upc: string; batchSharePercent: string; kegPoolId?: string | null }) {
  const batchShare = fields.batchSharePercent.trim() === "" ? null : Number(fields.batchSharePercent) / 100;
  return {
    name: "update_sku",
    input: { skuId: fields.skuId, active: fields.active, upc: fields.upc, batchShare, ...(fields.kegPoolId === undefined ? {} : { kegPoolId: fields.kegPoolId }) },
    reason: submitReason([
      ...(upcError(fields.upc) ? [UPC_NEED] : []),
      ...(batchShareError(fields.batchSharePercent) ? ["a batch package share above 0% and at most 100%"] : []),
    ]),
  };
}

export const pourSkuName = (name: string, ounces: string) => name.trim() || `${Number(ounces)} oz pour`;

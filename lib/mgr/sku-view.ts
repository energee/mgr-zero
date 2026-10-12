// lib/mgr/sku-view.ts — view-model for the SKU sheet. create_sku / list_skus
// plus packaged formats and keg pools paint format, pool, active, and optional UPC.
export type SkuViewModel = {
  kind?: "packaged" | "poured";
  pourName?: string;
  ounces?: string;
  format: string;
  formatOptions: string[];
  active: boolean;
  upc: string;
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

export const pourSkuName = (name: string, ounces: string) => name.trim() || `${Number(ounces)} oz pour`;

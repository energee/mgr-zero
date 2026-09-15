// lib/mgr/sku-view.ts — view-model for the SKU sheet. create_sku / list_skus
// plus list_formats (packaged) paint format, active, and optional UPC.
export type SkuViewModel = {
  kind?: "packaged" | "poured";
  pourName?: string;
  ounces?: string;
  format: string;
  formatOptions: string[];
  active: boolean;
  upc: string;
  volumeInfo: string;
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
    formats: { name: string } | null;
  };
  /** Packaged formats from list_formats for the Format pick. */
  formats: { id: string; name: string }[];
};

export function toSkuViewProps({ sku, formats }: SkuSnapshot): SkuViewModel {
  const fromJoin = sku?.formats?.name;
  const fromList = formats.find((f) => f.id === sku?.format_id)?.name;
  return {
    format: fromJoin ?? fromList ?? formats[0]?.name ?? "",
    formatOptions: formats.map((f) => f.name),
    active: sku?.active ?? true,
    upc: sku?.upc ?? "",
    volumeInfo: VOLUME_INFO,
  };
}

/** Sellable SKU creation preserves the existing stock/serving write boundaries. */
export function skuCreateCommand(fields: {
  kind: "packaged" | "poured"; brandId: string; formatId: string; name: string; upc: string; pourName: string; ounces: string;
}) {
  return fields.kind === "poured"
    ? { name: "upsert_format", input: { brandId: fields.brandId, basis: "poured", name: pourSkuName(fields.pourName, fields.ounces), ounces: Number(fields.ounces) }, valid: Number(fields.ounces) > 0 && Number(fields.ounces) < 1000 }
    : { name: "create_sku", input: { brandId: fields.brandId, formatId: fields.formatId, name: fields.name || undefined, upc: fields.upc || undefined }, valid: Boolean(fields.formatId) };
}

export const pourSkuName = (name: string, ounces: string) => name.trim() || `${Number(ounces)} oz pour`;

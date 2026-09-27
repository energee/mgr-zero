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

/** New SKU is one brand in one packaged format; pours are added on the price group (PourForm). */
export function skuCreateCommand(fields: { brandId: string; formatId: string; name: string; upc: string }) {
  return { name: "create_sku", input: { brandId: fields.brandId, formatId: fields.formatId, name: fields.name || undefined, upc: fields.upc || undefined }, valid: Boolean(fields.formatId) };
}

export const pourSkuName = (name: string, ounces: string) => name.trim() || `${Number(ounces)} oz pour`;

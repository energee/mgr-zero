// lib/mgr/brand-sells-view.ts — view-model for the Brand page's "Sells as"
// section. list_brands (one row: SKUs, pours, price group), packaged
// list_formats (with components) and list_channel_prices paint one switch per
// packaged format, the packages inside each switched-on format, and the
// group's pours, each with its prices. sellsAsCommand turns a switch into
// create_sku or update_sku; pours and prices are edited on /pricing.
import { money } from "./money";
import { skuCreateCommand } from "./sku-view";

export type SellsAsRow = {
  formatId: string;
  name: string;
  /** The brand has an active SKU in this format. */
  on: boolean;
  /** Set when a SKU exists, active or not; switching on reuses it. */
  skuId?: string;
  upc?: string;
  /** "DTC $22.00 · Wholesale $18.00", or "Unpriced". */
  prices: string;
};

export type BrandSellsModel = {
  packages: SellsAsRow[];
  /** One read-only line per child of a switched-on composed format: "Four Pack · 6 per Case". */
  contents: { key: string; label: string; prices: string }[];
  pours: { key: string; name: string; size: string; prices: string }[];
  priceGroupHref: string;
  /** The brand has no price group: nothing it sells has a price. */
  unpriced: boolean;
};

export type BrandSellsSnapshot = {
  brand: {
    id: string;
    price_group_id: string | null;
    skus: { id: string; format_id: string; active: boolean; upc: string | null }[];
    pours: { id: string; name: string; ounces: number | string }[];
  };
  /** list_formats({ basis: "packaged" }), alphabetical. */
  formats: { id: string; name: string; components: { parent_format_id: string; child_format_id: string; qty: number | string }[] }[];
  /** list_channel_prices rows. */
  prices: { sale_channel_id: string; price_group_id: string; format_id: string; unit_price_cents: number }[];
  /** list_sale_channels, in display order. */
  channels: { id: string; name: string }[];
};

export function toBrandSellsModel({ brand, formats, prices, channels }: BrandSellsSnapshot): BrandSellsModel {
  const group = brand.price_group_id;
  // One format's prices on the brand's group, channel by channel.
  const pricesOf = (formatId: string) => channels
    .map((channel) => {
      const cell = prices.find((p) => p.sale_channel_id === channel.id && p.price_group_id === group && p.format_id === formatId);
      return cell && `${channel.name} ${money(cell.unit_price_cents)}`;
    })
    .filter(Boolean)
    .join(" · ") || "Unpriced";
  const names = new Map(formats.map((f) => [f.id, f.name]));
  // A format inside another (Four Pack in Case) sells from its parent's stock,
  // so it gets no switch of its own; a SKU already made in it stays switchable.
  const children = new Set(formats.flatMap((f) => f.components.map((c) => c.child_format_id)));
  const packages = formats.flatMap((f): SellsAsRow[] => {
    const sku = brand.skus.find((s) => s.format_id === f.id);
    if (children.has(f.id) && !sku) return [];
    return [{ formatId: f.id, name: f.name, on: sku?.active ?? false, skuId: sku?.id, upc: sku?.upc ?? undefined, prices: pricesOf(f.id) }];
  });
  const switchedOn = new Set(packages.filter((p) => p.on).map((p) => p.formatId));
  return {
    packages,
    contents: formats.filter((f) => switchedOn.has(f.id)).flatMap((f) => f.components.map((c) => ({
      key: `${f.id}:${c.child_format_id}`,
      label: `${names.get(c.child_format_id)} · ${Number(c.qty)} per ${f.name}`,
      prices: pricesOf(c.child_format_id),
    }))),
    pours: brand.pours.map((p) => ({ key: p.id, name: p.name, size: `${Number(p.ounces)} oz`, prices: pricesOf(p.id) })),
    priceGroupHref: "/pricing",
    unpriced: !group,
  };
}

/**
 * The command one switch sends: create_sku when the format has no SKU yet,
 * else update_sku with the new active state. update_sku replaces the UPC on
 * every save, so the row's current UPC rides along; batch share and keg pool
 * are left out, which keeps them (skuUpdateCommand always sends a share, so
 * it is not reused here).
 */
export function sellsAsCommand(row: SellsAsRow, on: boolean, brandId: string) {
  if (!row.skuId) {
    const { name, input } = skuCreateCommand({ brandId, formatId: row.formatId, name: "", upc: "" });
    return { name, input };
  }
  return { name: "update_sku", input: { skuId: row.skuId, active: on, upc: row.upc ?? "" } };
}

// lib/mgr/shop-view.ts — view-model for portal Shop. portal_catalog +
// get_portal_account paint the domain; qty on each catalog row is cart state.
import { money } from "./money";

export type ShopCatalogItem = {
  skuId: string;
  name: string;
  product: string;
  unitPriceCents: number;
  badge: string;
  /** Cart quantity for this SKU; not a portal_catalog field. */
  qty: number;
};

export type ShopShipTo = {
  id: string;
  label: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
};

export type ShopSnapshot = {
  customer: { id: string; name: string };
  shipTos: ShopShipTo[];
  shipToId: string;
  requestedDate: string;
  source: { name: string };
  catalog: ShopCatalogItem[];
  /** Refundable deposit charged per keg on Review; Shop only mentions it. */
  depositCentsPerKeg: number;
};

export type ShopItemView = {
  key: string;
  name: string;
  price: string;
  qty: number;
};

export type ShopGroupView = {
  product: string;
  items: ShopItemView[];
};

export type ShopViewModel = {
  customer: string;
  groups: ShopGroupView[];
  empty?: string;
  source: string;
  shipToLine: string;
  depositInfo: string;
  /** Merchandise only — keg deposits are added on Review. */
  reviewVerb: string;
};

/** Package label under a brand title: strip a duplicated `Brand · ` prefix. */
export function packageName(product: string, name: string): string {
  const prefix = `${product} · `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function shopCartTotals(catalog: ShopCatalogItem[], depositCentsPerKeg: number) {
  const merchandiseCents = catalog.reduce((n, i) => n + i.qty * i.unitPriceCents, 0);
  const kegs = catalog.reduce((n, i) => n + (/keg/i.test(i.name) ? i.qty : 0), 0);
  const depositCents = kegs * depositCentsPerKeg;
  return { merchandiseCents, kegs, depositCents, totalCents: merchandiseCents + depositCents };
}

/** Map portal_catalog + get_portal_account plus cart qty onto ShopView. */
export function toShopViewProps({
  customer,
  shipTos,
  shipToId,
  requestedDate,
  source,
  catalog,
  depositCentsPerKeg,
}: ShopSnapshot): ShopViewModel {
  const groups: ShopGroupView[] = [];
  for (const item of catalog) {
    const row: ShopItemView = {
      key: item.skuId,
      name: packageName(item.product, item.name),
      price: money(item.unitPriceCents),
      qty: item.qty,
    };
    const group = groups.find((g) => g.product === item.product);
    if (group) group.items.push(row);
    else groups.push({ product: item.product, items: [row] });
  }
  const shipTo = shipTos.find((s) => s.id === shipToId);
  const { merchandiseCents } = shopCartTotals(catalog, depositCentsPerKeg);
  return {
    customer: customer.name,
    groups,
    empty: catalog.length === 0 ? "Nothing is listed for wholesale yet. Call the brewery." : undefined,
    source: source.name,
    shipToLine: `${shipTo?.label ?? "Ship-to"} · ${requestedDate}`,
    depositInfo: "Tax and keg deposits are pending and are not included in the merchandise subtotal.",
    reviewVerb: `Review order · ${money(merchandiseCents)}`,
  };
}

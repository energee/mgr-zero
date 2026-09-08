// lib/mgr/review-order-view.ts — view-model for portal Review order. Same cart
// as Shop: merchandise + keg deposits. Shop's Review button is merchandise
// only ($828.00 for 4 × $150 + 6 × $38); Place order / Subtotal add the
// 4 × $30.00 keg deposits ($120.00) for $948.00. That matches INV.total on
// the staff invoice drawing but is computed from this cart, not copied.
import { money } from "./money";
import { packageName, shopCartTotals, type ShopSnapshot } from "./shop-view";

export type ReviewOrderSnapshot = ShopSnapshot & {
  poNumber?: string;
};

export type ReviewOrderLineView = {
  key: string;
  name: string;
  price: string;
  qty: number;
  qtyLabel: string;
};

export type ReviewOrderViewModel = {
  lines: ReviewOrderLineView[];
  depositDetail?: string;
  depositAmount?: string;
  subtotal: string;
  tax: string;
  shipTo: string;
  requestedDate: string;
  source: string;
  po: string;
  info: string;
  placeVerb: string;
};

function lineName(product: string, name: string): string {
  return name.startsWith(product) ? name : `${product} · ${packageName(product, name)}`;
}

/** Map the Shop cart snapshot onto Review order. Lines with qty 0 are omitted. */
export function toReviewOrderViewProps({
  catalog,
  shipTos,
  shipToId,
  requestedDate,
  source,
  depositCentsPerKeg,
  poNumber,
}: ReviewOrderSnapshot): ReviewOrderViewModel {
  const { kegs, depositCents, totalCents } = shopCartTotals(catalog, depositCentsPerKeg);
  const shipTo = shipTos.find((s) => s.id === shipToId);
  const shipToLabel = shipTo
    ? `${shipTo.label} · ${shipTo.city}, ${shipTo.state}`
    : "—";
  return {
    lines: catalog.filter((i) => i.qty > 0).map((i) => ({
      key: i.skuId,
      name: lineName(i.product, i.name),
      price: money(i.unitPriceCents),
      qty: i.qty,
      qtyLabel: `${i.product} quantity`,
    })),
    depositDetail: kegs > 0 ? `${kegs} × ${money(depositCentsPerKeg)}` : undefined,
    depositAmount: kegs > 0 ? money(depositCents) : undefined,
    subtotal: money(totalCents),
    tax: `${money(0)} · sale for resale`,
    shipTo: shipToLabel,
    requestedDate,
    source: source.name,
    po: poNumber?.trim() ? poNumber : "optional",
    info: "Order number is assigned when you place the order.",
    placeVerb: `Place order · ${money(totalCents)}`,
  };
}

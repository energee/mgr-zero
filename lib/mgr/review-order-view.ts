// Review shows current merchandise only; authoritative tax and deposits wait for Program 13.
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
  const { merchandiseCents } = shopCartTotals(catalog, depositCentsPerKeg);
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
    depositDetail: "Pending; not included",
    depositAmount: "Pending; not included",
    subtotal: money(merchandiseCents),
    tax: "Pending; not included",
    shipTo: shipToLabel,
    requestedDate,
    source: source.name,
    po: poNumber?.trim() ? poNumber : "optional",
    info: "Order number is assigned when you place the order.",
    placeVerb: `Place order · ${money(merchandiseCents)}`,
  };
}

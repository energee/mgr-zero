// Review uses authoritative quote amounts when available; unquoted amounts stay pending.
import { money } from "./money";
import { shipToLine } from "./ship-to-view";
import { cartLineLabel, cartPalletFit, shopCartTotals, type ShopCatalogItem, type ShopSnapshot } from "./shop-view";
import type { PalletFitGroup } from "./pallet-fit";

export type ReviewOrderSnapshot = ShopSnapshot & {
  poNumber?: string;
  quote?: PortalQuote;
};

export type PortalQuote = {
  quoteId: string; taxStatus: "pending" | "calculated"; subtotalCents: number; depositCents: number;
  amountBeforeTaxCents: number; taxCents?: number; totalCents?: number;
  source: { id: string; name: string };
  destination: { id: string; label: string; address1: string; address2?: string | null; city: string; state: string; zip: string };
  lines: { skuId: string; name: string; product: string; qty: number; unitPriceCents: number; amountCents: number }[];
  deposits: { name: string; kegSize: string; qty: number; unitPriceCents: number; amountCents: number }[];
  /** One-way kegs carry a non-refundable fee instead of a deposit; included in amountBeforeTaxCents. */
  oneWayFees?: { name: string; qty: number; unitPriceCents: number; amountCents: number }[];
  oneWayFeeCents?: number;
};

export type ReviewOrderLineView = {
  key: string;
  /** "Brand · Format" (cartLineLabel). */
  name: string;
  /** The brand's alias, muted under the name. */
  alias?: string;
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
  deposits?: { key: string; name: string; detail: string; amount: string }[];
  oneWayFees?: { key: string; name: string; detail: string; amount: string }[];
  estimatedTotal?: string;
  note?: string;
  /** The cart's pallet fit; the quote carries no package facts, so it comes from the cart. */
  palletFit?: PalletFitGroup[];
};

/** Map the Shop cart snapshot onto Review order. Lines with qty 0 are omitted. */
export function toReviewOrderViewProps({
  catalog,
  shipTos,
  shipToId,
  requestedDate,
  source,
  depositCentsPerKeg,
  poNumber,
  quote,
  note,
}: ReviewOrderSnapshot): ReviewOrderViewModel {
  const palletFit = cartPalletFit(catalog);
  if (quote) return { ...toQuotedReviewOrderViewProps(quote, { poNumber, requestedShipDate: requestedDate, note }, catalog), palletFit };
  const { merchandiseCents } = shopCartTotals(catalog, depositCentsPerKeg);
  const shipTo = shipTos.find((s) => s.id === shipToId);
  const shipToLabel = shipTo
    ? shipToLine(shipTo)
    : "—";
  return {
    lines: catalog.filter((i) => i.qty > 0).map((i) => ({
      key: i.skuId,
      ...cartLineLabel(i),
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
    palletFit,
  };
}

/** Quote amounts and identities are server facts, never estimates from SKU names. A line is named from its
 *  catalog item (brand, alias, format) when `catalog` holds it; the quote carries only the SKU and brand names. */
export function toQuotedReviewOrderViewProps(quote: PortalQuote, fields: { poNumber?: string; requestedShipDate?: string | null; note?: string }, catalog: ShopCatalogItem[] = []): ReviewOrderViewModel {
  const calculated = quote.taxStatus === "calculated";
  return {
    lines: quote.lines.map(line => ({
      key: line.skuId, ...cartLineLabel(catalog.find(i => i.skuId === line.skuId) ?? line), price: `${money(line.unitPriceCents)} each · ${money(line.amountCents)}`,
      qty: line.qty, qtyLabel: `${line.product} quantity`,
    })),
    deposits: quote.deposits.map((deposit, index) => ({ key: String(index), name: `${deposit.name} deposit`, detail: `Quantity ${deposit.qty} at ${money(deposit.unitPriceCents)}`, amount: money(deposit.amountCents) })),
    oneWayFees: (quote.oneWayFees ?? []).map((fee, index) => ({ key: String(index), name: "One-way keg fee", detail: `${fee.name} · quantity ${fee.qty} at ${money(fee.unitPriceCents)}`, amount: money(fee.amountCents) })),
    depositDetail: "Quoted keg deposits",
    depositAmount: money(quote.depositCents),
    subtotal: money(quote.subtotalCents),
    tax: calculated && quote.taxCents != null ? money(quote.taxCents) : "Tax pending",
    estimatedTotal: calculated && quote.totalCents != null ? money(quote.totalCents) : undefined,
    shipTo: [quote.destination.label, quote.destination.address1, quote.destination.address2, quote.destination.city, quote.destination.state, quote.destination.zip].filter(Boolean).join(" · "),
    requestedDate: fields.requestedShipDate || "Not specified", source: quote.source.name, po: fields.poNumber || "optional", note: fields.note || undefined,
    info: "Order number is assigned when you place the order." + (calculated ? "" : " Tax and the final payable total will be set on the payment invoice."),
    placeVerb: calculated && quote.totalCents != null ? `Place order · ${money(quote.totalCents)}` : `Place order · ${money(quote.amountBeforeTaxCents)} before tax`,
  };
}

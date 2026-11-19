// lib/mgr/shop-view.ts — view-model for portal Shop. portal_catalog +
// get_portal_account paint the domain; qty on each catalog row is cart state.
// It also owns the order summary (the desk panel and the phone bar and sheet
// draw this one model, so their numbers cannot differ) and its pallet fit.
import type { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/date-format";
import { money } from "./money";
import { palletFit, palletHint, type PalletFitGroup } from "./pallet-fit";
import { plural } from "./plural";

/** One open release of a SKU, as portal_catalog returns it. */
export type ShopRelease = { releaseId: string; shipsFrom: string; ordersCloseOn: string | null; badge: string };

export type ShopCatalogItem = {
  skuId: string;
  name: string;
  product: string;
  unitPriceCents: number;
  /** The packaged-stock offer's in/low/out badge; null when the SKU is not
   *  orderable from stock (portal_catalog). */
  badge?: string | null;
  /** Open release offers (portal_catalog); absent reads as none. */
  releases?: ShopRelease[];
  /** Cart quantity for this SKU; not a portal_catalog field. */
  qty: number;
  /** Cart state: the chosen release id, or "" for stock. Absent picks the
   *  default offer (stock when offered, else the first release). */
  offer?: string;
  /** The SKU's package (portal_catalog); absent or null fit means no pallet fit line. */
  packageType?: string | null;
  kegSize?: string | null;
  unitsPerCase?: number | null;
  palletFit?: number | null;
};

export type ShopShipTo = {
  id: string;
  label: string;
  country: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type ShopSnapshot = {
  shipTos: ShopShipTo[];
  shipToId: string;
  requestedDate: string;
  source: { name: string };
  catalog: ShopCatalogItem[];
  /** Refundable deposit charged per keg on Review; Shop only mentions it. */
  depositCentsPerKeg?: number;
  poNumber?: string;
  note?: string;
};

export type ShopItemView = {
  key: string;
  name: string;
  price: string;
  qty: number;
  /** Where this line orders from: "" is packaged stock, else a release id. */
  offers: { value: string; label: string }[];
  offer: string;
};

/** One cart line in the order summary; `anchor` is its brand heading on Shop. */
export type ShopSummaryLine = { key: string; name: string; detail: string; amount: string; anchor: string };

export type ShopSummary = {
  /** Only lines with a quantity. */
  lines: ShopSummaryLine[];
  /** "10 items": the cart's units, read beside the subtotal on the phone bar. */
  items: string;
  /** "Ships Dec 4, 2026" when a release line sets the date. */
  shipsOn?: string;
  palletFit: PalletFitGroup[];
  /** The phone bar's nudge when a pallet unit is nearly full. */
  palletHint?: string;
};

export type ShopGroupView = {
  product: string;
  items: ShopItemView[];
};

export type ShopViewModel = {
  groups: ShopGroupView[];
  empty?: EmptyState;
  source: string;
  shipToLine: string;
  /** The one charges line: deposits and fees are priced on Review. */
  chargesLine: string;
  /** Tax and final amounts: the brewery confirms them. */
  depositInfo: string;
  shipToId: string;
  shipTos: { id: string; label: string }[];
  requestedDate: string;
  po: string;
  note: string;
  /** Merchandise only — keg deposits are added on Review. */
  subtotal: string;
  /** "This order ships from Dec 4, 2026." when a release line sets the date. */
  shipsFromNote?: string;
  summary: ShopSummary;
};

/** The id a Shop brand heading carries, so Coming up can link to it. Slugs the name because the catalog groups by brand name. */
export const brandAnchor = (product: string) => `brand-${product.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** Package label under a brand title: strip a duplicated `Brand · ` prefix. */
export function packageName(product: string, name: string): string {
  const prefix = `${product} · `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** A cart line named brand first ("Hazy IPA · ½ bbl keg"), as the summary and Review list it. */
export function cartLineName(product: string, name: string): string {
  return name.startsWith(product) ? name : `${product} · ${packageName(product, name)}`;
}

export function shopCartTotals(catalog: ShopCatalogItem[], depositCentsPerKeg = 0) {
  const merchandiseCents = catalog.reduce((n, i) => n + i.qty * i.unitPriceCents, 0);
  const kegs = catalog.reduce((n, i) => n + (/keg/i.test(i.name) ? i.qty : 0), 0);
  const depositCents = kegs * depositCentsPerKeg;
  return { merchandiseCents, kegs, depositCents, totalCents: merchandiseCents + depositCents };
}

// The Shop shows no stock badge (tests/mgr-screens.test.ts); a release says
// when it ships and whether little or nothing is left.
const RELEASE_BADGE: Record<string, string> = { low: " · few left", out: " · sold out" };

/** A line's offers: "From stock" (value "") when the SKU is orderable from
 *  stock, then each open release. */
function offersOf(item: ShopCatalogItem) {
  const stock = item.badge == null ? [] : [{ value: "", label: "From stock" }];
  return [...stock, ...(item.releases ?? []).map((r) => ({
    value: r.releaseId,
    label: `From ${formatDate(r.shipsFrom)}${r.ordersCloseOn ? ` · order by ${formatDate(r.ordersCloseOn)}` : ""}${RELEASE_BADGE[r.badge] ?? ""}`,
  }))];
}

/** The offer a line orders from: the cart's choice while it is still offered,
 *  else stock when offered, else the first release. */
export function chosenOffer(item: ShopCatalogItem): string {
  const values = offersOf(item).map((o) => o.value);
  return item.offer !== undefined && values.includes(item.offer) ? item.offer : values[0] ?? "";
}

/** The latest ships-from date among the cart's release lines, or "" for none. */
function shipsFromFloor(catalog: ShopCatalogItem[]): string {
  return catalog.filter((i) => i.qty > 0).map((i) => i.releases?.find((r) => r.releaseId === chosenOffer(i))?.shipsFrom ?? "")
    .reduce((a, b) => (b > a ? b : a), "");
}

/** The requested date the order carries: the buyer's date, but never before
 *  the latest ships-from among its release lines (ISO dates compare as text). */
export function effectiveRequestedDate(requested: string, catalog: ShopCatalogItem[]): string {
  const floor = shipsFromFloor(catalog);
  return floor > requested ? floor : requested;
}

/** The cart's pallet fit, shown in the summary and on Review. */
export function cartPalletFit(catalog: ShopCatalogItem[]): PalletFitGroup[] {
  return palletFit(catalog.map((i) => ({ qty: i.qty, packageType: i.packageType ?? null, kegSize: i.kegSize ?? null, unitsPerCase: i.unitsPerCase ?? null, palletFit: i.palletFit ?? null })));
}

/** The cart lines, unit count, ship date and pallet fit the summary shows. */
function shopSummary(catalog: ShopCatalogItem[], floor: string): ShopSummary {
  const inCart = catalog.filter((i) => i.qty > 0);
  const groups = cartPalletFit(inCart);
  return {
    lines: inCart.map((i) => {
      const release = i.releases?.find((r) => r.releaseId === chosenOffer(i));
      return {
        key: i.skuId,
        name: cartLineName(i.product, i.name),
        detail: `${i.qty} × ${money(i.unitPriceCents)}${release ? ` · from the ${formatDate(release.shipsFrom)} release` : ""}`,
        amount: money(i.qty * i.unitPriceCents),
        anchor: brandAnchor(i.product),
      };
    }),
    items: plural(inCart.reduce((n, i) => n + i.qty, 0), "item"),
    shipsOn: floor ? `Ships ${formatDate(floor)}` : undefined,
    palletFit: groups,
    palletHint: palletHint(groups),
  };
}

/** Map portal_catalog + get_portal_account plus cart qty onto ShopView. */
export function toShopViewProps({
  shipTos,
  shipToId,
  requestedDate,
  source,
  catalog,
  depositCentsPerKeg,
  poNumber,
  note,
}: ShopSnapshot): ShopViewModel {
  const groups: ShopGroupView[] = [];
  for (const item of catalog) {
    const row: ShopItemView = {
      key: item.skuId,
      name: packageName(item.product, item.name),
      price: money(item.unitPriceCents),
      qty: item.qty,
      offers: offersOf(item),
      offer: chosenOffer(item),
    };
    const group = groups.find((g) => g.product === item.product);
    if (group) group.items.push(row);
    else groups.push({ product: item.product, items: [row] });
  }
  const shipTo = shipTos.find((s) => s.id === shipToId);
  const floor = shipsFromFloor(catalog);
  const { merchandiseCents } = shopCartTotals(catalog, depositCentsPerKeg);
  return {
    groups,
    empty: catalog.length === 0 ? { title: "Nothing listed for wholesale yet" } : undefined,
    source: source.name,
    shipToLine: `${shipTo?.label ?? "Ship-to"}${requestedDate ? ` · ${formatDate(requestedDate)}` : ""}`,
    chargesLine: "Keg deposits & fees added at review",
    depositInfo: "Tax is not included. The brewery confirms final invoice amounts and the requested delivery date.",
    shipToId,
    shipTos: shipTos.map(({ id, label }) => ({ id, label })),
    requestedDate,
    po: poNumber ?? "",
    note: note ?? "",
    subtotal: money(merchandiseCents),
    shipsFromNote: floor ? `This order ships from ${formatDate(floor)}.` : undefined,
    summary: shopSummary(catalog, floor),
  };
}

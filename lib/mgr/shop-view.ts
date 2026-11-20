// lib/mgr/shop-view.ts — view-model for portal Shop. portal_catalog +
// get_portal_account paint the domain; qty on each catalog row is cart state.
// It also owns the order summary (the desk panel and the phone bar and sheet
// draw this one model, so their numbers cannot differ) and its pallet fit, how
// a cart splits into one order per ship date (shipGroups), and what the
// Pre-order page says about the buyer's limit and their suggested order.
import type { EmptyState } from "./empty-state";
import { formatDate, formatMonthDay } from "@/lib/date-format";
import { money } from "./money";
import { BEER_LB_PER_BBL, DEFAULT_PALLET_RULES, palletCount, palletFit, palletHint, palletLoad, type PalletFitGroup, type PalletLine, type PalletRules } from "./pallet-fit";
import { lineLabel, type LineLabel } from "./brand-lines";
import { brandTagline, type PortalBrand } from "./brand-reference-view";
import { plural } from "./plural";
import { KEG_SIZES } from "./enums";
import { bbl } from "./release-view";

/** One open release of a SKU, as portal_catalog returns it. */
export type ShopRelease = {
  releaseId: string; shipsFrom: string; ordersCloseOn: string | null; badge: string;
  /** True for a release from a planned batch, which Shop lists under Pre-order; false or absent for one from packaged stock. */
  fromBatch?: boolean;
  /** Barrels in one unit of the package; null or absent when unknown. */
  bblPerUnit?: number | null;
  /** The buyer's ceiling on this release's batch: barrels still open to them and the day it lifts. Null or absent: no ceiling applies. */
  limitLeftBbl?: number | null;
  limitLiftsOn?: string | null;
  /** Pounds a barrel of this release's batch weighs, from its latest gravity reading; null or absent before one. */
  lbPerBbl?: number | null;
};

/** portal_release_share: the buyer's ceiling in percent of each batch pool, what it would be with every purchase counted once, and the days before ship it lifts. */
export type ShopShare = { pct: number; basePct: number | null; manual: boolean; liftDays: number };
/** One portal_suggested_order row; lastOn is the date of the latest order it drew on. */
export type ShopSuggestion = { releaseId: string; skuId: string; qty: number; lastOn?: string };

export type ShopCatalogItem = {
  skuId: string;
  name: string;
  product: string;
  unitPriceCents: number;
  /** The brand's alias (portal_catalog brandAlias), shown muted under the brand; absent or null when it has none. */
  brandAlias?: string | null;
  /** The format's name (portal_catalog formatName); it names the row. Absent falls back to the SKU name. */
  formatName?: string;
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
  palletFitMixed?: number | null;
  /** The package's barrels and the pounds it adds to the beer (portal_catalog); together a unit's weight. */
  bblPerUnit?: number | null;
  packagingLb?: number | null;
  /** How tall one keg stands or one case sits in a layer, in inches (portal_catalog); absent or null adds no height. */
  heightIn?: number | null;
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
  /** portal_schedule rows: planned batches as brand and week. One whose brand has no planned-batch release yet is named under Pre-order as not open. */
  planned?: { brand_name: string; planned_week: string; listed: boolean }[];
  /** portal_brands: the buyer's brands with sell-sheet fields and label, matched to a heading by brand name (unique per brewery). */
  brands?: PortalBrand[];
  /** portal_release_share; null or absent when the buyer has no ceiling. */
  share?: ShopShare | null;
  /** get_portal_account palletRules: how the brewery stacks a pallet; absent uses the defaults. */
  palletRules?: PalletRules;
  /** portal_suggested_order: the buyer's usual quantities of the open batch releases. */
  suggested?: ShopSuggestion[];
  /** Refundable deposit charged per keg on Review; Shop only mentions it. */
  depositCentsPerKeg?: number;
  poNumber?: string;
  note?: string;
};

export type ShopItemView = {
  /** Unique per row. A SKU can have a catalog row and a Pre-order row for each planned-batch release. */
  key: string;
  /** The SKU the row's quantity and offer set in the cart. */
  skuId: string;
  name: string;
  price: string;
  /** The SKU's cart quantity while this row is the active one, else 0. */
  qty: number;
  /** True when the cart's chosen offer for the SKU is one of this row's. A cart holds one offer per SKU, so typing a quantity in an inactive row moves the SKU to this row's offer. */
  active: boolean;
  /** Where this line orders from: "" is packaged stock, else a release id. */
  offers: { value: string; label: string }[];
  offer: string;
};

/** One cart line in the order summary ("Brand · Format", the brand's alias apart); `anchor` is its brand heading on Shop. */
export type ShopSummaryLine = LineLabel & { key: string; detail: string; amount: string; anchor: string };

/** The cart lines that ship together and become one order: stock ("Ships now") or one ship date. */
export type ShopShipment = {
  key: string; title: string; lines: ShopSummaryLine[]; subtotal: string; palletFit: PalletFitGroup[];
  /** The pallets this order needs and the room left on them (palletLoad); absent when no line has a pallet fit. */
  pallet?: string;
};

export type ShopSummary = {
  /** Only lines with a quantity. */
  lines: ShopSummaryLine[];
  /** The same lines as the orders they become, stock first and then by ship date. */
  shipments: ShopShipment[];
  /** "10 items": the cart's units, read beside the subtotal on the phone bar. */
  items: string;
  /** "Ships Dec 4, 2026" when a release line sets the date; "3 orders" when the cart splits. */
  shipsOn?: string;
  palletFit: PalletFitGroup[];
  /** The one order's pallets and the room left on them; a cart that splits says it per shipment. */
  pallet?: string;
  /** The phone bar's nudge when a pallet unit is nearly full. */
  palletHint?: string;
};

export type ShopGroupView = {
  product: string;
  /** The brand's alias, muted under the brand heading. */
  alias?: string;
  /** The brand's portal_brands row: the live Shop draws its label and opens its reference sheet. */
  brand?: PortalBrand;
  /** "Hazy IPA · 6.5% ABV": the brand's style and ABV, whichever the brewery set. */
  facts?: string;
  /** The brand's amount in the cart; absent when none of its packages has a quantity. A card with one is marked as in the order. */
  total?: string;
  /** Pre-order only: "Ships Dec 9, 2026 · order by Dec 2, 2026", the heading its ship date is listed under, and that date. */
  ships?: string;
  shipsFrom?: string;
  /** Pre-order only: what the buyer's ceiling still allows of this batch, when one applies. */
  limit?: string;
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
  /** "This order ships from Dec 4, 2026." when a release line sets the date; how many orders the cart becomes when it splits. */
  shipsFromNote?: string;
  summary: ShopSummary;
  /** The Pre-order page: packages released from a planned batch, grouped by brand and listed by ship date, then planned beers not released yet. Absent when there is neither.
   *  `note` says the buyer's limit when they have one; `suggested` is the ship dates that have usual quantities to fill in, and `suggestedNote` says what those quantities are based on. */
  preOrder?: {
    groups: ShopGroupView[]; planned: { key: string; title: string; detail: string }[]; note?: string; suggested: string[]; suggestedNote?: string;
    /** Ship dates whose order has room left on its pallets, so "Fill the pallet" would add something. */
    fillable: string[];
  };
};

/** The id a Shop brand heading carries, so Coming up can link to it. Slugs the name because the catalog groups by brand name. */
export const brandAnchor = (product: string) => `brand-${product.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** Package label under a brand title: strip a duplicated `Brand · ` prefix. */
export function packageName(product: string, name: string): string {
  const prefix = `${product} · `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** A cart line named brand first ("Hazy IPA · ½ bbl keg") from the SKU name, for a line with no format name. */
function cartLineName(product: string, name: string): string {
  return name.startsWith(product) ? name : `${product} · ${packageName(product, name)}`;
}

/** How the summary and Review name a catalog item: "Brand · Format" with the brand's alias apart (lineLabel),
 *  since the SKU name may carry the alias in place of the brand; cartLineName when the format is not named. */
export function cartLineLabel(item: Pick<ShopCatalogItem, "name" | "product" | "brandAlias" | "formatName">): LineLabel {
  return item.formatName
    ? lineLabel({ name: item.name, brands: { name: item.product, alias: item.brandAlias }, formats: { name: item.formatName } })
    : { name: cartLineName(item.product, item.name) };
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

/** The release a cart line orders from, or undefined for stock. */
const chosenRelease = (item: ShopCatalogItem) => item.releases?.find((r) => r.releaseId === chosenOffer(item));

/** The cart as the orders it becomes: lines with a quantity, grouped by ship
 *  date. Stock and stock releases ship now (shipsFrom ""); each planned-batch
 *  ship date is its own order, so nobody's beer waits for a later one. Stock
 *  first, then by date. */
export function shipGroups<T extends ShopCatalogItem>(catalog: T[]): { shipsFrom: string; items: T[] }[] {
  const groups = Map.groupBy(catalog.filter((i) => i.qty > 0), (i) => { const release = chosenRelease(i); return release?.fromBatch ? release.shipsFrom : ""; });
  return [...groups].map(([shipsFrom, items]) => ({ shipsFrom, items })).sort((a, b) => a.shipsFrom.localeCompare(b.shipsFrom));
}

/** The catalog item and release a suggestion is for; either is undefined once the catalog no longer has it. */
function suggestionTarget(s: ShopSuggestion, catalog: ShopCatalogItem[]) {
  const item = catalog.find((i) => i.skuId === s.skuId);
  return { item, release: item?.releases?.find((r) => r.releaseId === s.releaseId) };
}

/** A ship date's suggested order rounded up to full layers of each package,
 *  when that adds no more than a fifth: 98 cases become 100, but 4 stay 4. The
 *  extra goes on the beer with the most. Packages with no pallet fit are left alone. */
function fillLayers(suggested: ShopSuggestion[], catalog: ShopCatalogItem[]): ShopSuggestion[] {
  const filled = suggested.map((s) => ({ ...s }));
  const loads = Map.groupBy(filled, (s) => {
    const { item, release } = suggestionTarget(s, catalog);
    return item?.palletFit && release ? `${release.shipsFrom}|${item.packageType}|${item.kegSize ?? item.unitsPerCase}|${item.palletFit}` : "";
  });
  for (const [load, lines] of loads) {
    if (!load) continue;
    const fit = Number(load.split("|").pop());
    const total = lines.reduce((n, s) => n + s.qty, 0);
    const short = (fit - (total % fit)) % fit;
    if (short && short <= total * 0.2) lines.reduce((most, s) => (s.qty > most.qty ? s : most)).qty += short;
  }
  return filled;
}

/** The buyer's usual quantities as an order worth shipping: each ship date
 *  filled to full layers when that is close (fillLayers), then held to their
 *  ceiling. A batch's packages share one limit in barrels, so later packages
 *  get what earlier ones leave. */
export function fitSuggestions(suggested: ShopSuggestion[], catalog: ShopCatalogItem[]): ShopSuggestion[] {
  const used = new Map<string, number>();
  return fillLayers(suggested, catalog).flatMap((s) => {
    const { item, release } = suggestionTarget(s, catalog);
    if (!item || !release) return [];
    if (release.limitLeftBbl == null || !release.bblPerUnit) return [s];
    const batch = `${item.product}|${release.shipsFrom}`;
    const qty = Math.min(s.qty, Math.floor((release.limitLeftBbl - (used.get(batch) ?? 0)) / release.bblPerUnit + 1e-9));
    if (qty <= 0) return [];
    used.set(batch, (used.get(batch) ?? 0) + qty * release.bblPerUnit);
    return [{ ...s, qty }];
  });
}

/** The latest ships-from date among the cart's release lines, or "" for none. */
function shipsFromFloor(catalog: ShopCatalogItem[]): string {
  return catalog.filter((i) => i.qty > 0).map((i) => chosenRelease(i)?.shipsFrom ?? "")
    .reduce((a, b) => (b > a ? b : a), "");
}

/** The requested date the order carries: the buyer's date, but never before
 *  the latest ships-from among its release lines (ISO dates compare as text). */
export function effectiveRequestedDate(requested: string, catalog: ShopCatalogItem[]): string {
  const floor = shipsFromFloor(catalog);
  return floor > requested ? floor : requested;
}

/** A unit weighs its beer (by the chosen release's batch gravity, or 1.010) plus its packaging. */
const palletLine = (i: ShopCatalogItem, qty = i.qty): PalletLine =>
  ({ qty, packageType: i.packageType ?? null, kegSize: i.kegSize ?? null, unitsPerCase: i.unitsPerCase ?? null, palletFit: i.palletFit ?? null, palletFitMixed: i.palletFitMixed ?? null,
    unitLb: i.bblPerUnit == null ? null : i.bblPerUnit * (chosenRelease(i)?.lbPerBbl ?? BEER_LB_PER_BBL) + (i.packagingLb ?? 0), heightIn: i.heightIn ?? null });

/** The cart's pallet fit, shown in the summary and on Review. */
export function cartPalletFit(catalog: ShopCatalogItem[]): PalletFitGroup[] {
  return palletFit(catalog.map((i) => palletLine(i)));
}

/** "Fill the pallet" for one ship date ("" is what ships now): the new
 *  quantity of each line that grows. Beers already in that order are topped up
 *  one unit at a time, the one that has grown least for its size first, until
 *  one more of anything would need another pallet or pass the buyer's limit
 *  on its batch. */
export function fillPallet(catalog: ShopCatalogItem[], shipsFrom: string, rules: PalletRules = DEFAULT_PALLET_RULES): Record<string, number> {
  const items = shipGroups(catalog).find((g) => g.shipsFrom === shipsFrom)?.items.filter((i) => i.palletFit) ?? [];
  const qty = new Map(items.map((i) => [i.skuId, i.qty]));
  const count = (plus?: ShopCatalogItem) => palletCount(items.map((i) => palletLine(i, qty.get(i.skuId)! + (i === plus ? 1 : 0))), rules);
  const pallets = count();
  const overLimit = (item: ShopCatalogItem) => {
    const release = chosenRelease(item);
    if (release?.limitLeftBbl == null || !release.bblPerUnit) return false;
    // A batch's packages share one limit in barrels.
    const used = items.filter((i) => i.product === item.product).reduce((n, i) => n + qty.get(i.skuId)! * (chosenRelease(i)?.bblPerUnit ?? 0), 0);
    return used + release.bblPerUnit > release.limitLeftBbl + 1e-9;
  };
  const growth = (item: ShopCatalogItem) => (qty.get(item.skuId)! - item.qty) / item.qty;
  for (;;) {
    const next = items.filter((i) => !overLimit(i) && count(i) === pallets).sort((a, b) => growth(a) - growth(b))[0];
    if (!next) break;
    qty.set(next.skuId, qty.get(next.skuId)! + 1);
  }
  return Object.fromEntries(items.filter((i) => qty.get(i.skuId) !== i.qty).map((i) => [i.skuId, qty.get(i.skuId)!]));
}

/** The cart lines, unit count, ship date and pallet fit the summary shows. */
function shopSummary(catalog: ShopCatalogItem[], floor: string, rules: PalletRules): ShopSummary {
  const inCart = catalog.filter((i) => i.qty > 0);
  const groups = cartPalletFit(inCart);
  // Room is reported for every package the buyer can order, not only the ones in the cart.
  const kinds = catalog.map((i) => palletLine(i));
  const pallet = (items: ShopCatalogItem[]) => palletLoad(items.map((i) => palletLine(i)), kinds, rules)?.text;
  const line = (i: ShopCatalogItem): ShopSummaryLine => {
    const release = chosenRelease(i);
    return {
      key: i.skuId,
      ...cartLineLabel(i),
      detail: `${i.qty} × ${money(i.unitPriceCents)}${release ? ` · from the ${formatDate(release.shipsFrom)} release` : ""}`,
      amount: money(i.qty * i.unitPriceCents),
      anchor: brandAnchor(i.product),
    };
  };
  const shipments = shipGroups(inCart).map(({ shipsFrom, items }) => ({
    key: shipsFrom || "now", title: shipsFrom ? `Ships ${formatDate(shipsFrom)}` : "Ships now", lines: items.map(line),
    subtotal: money(items.reduce((n, i) => n + i.qty * i.unitPriceCents, 0)), palletFit: cartPalletFit(items), pallet: pallet(items),
  }));
  return {
    lines: inCart.map(line),
    shipments,
    items: plural(inCart.reduce((n, i) => n + i.qty, 0), "item"),
    shipsOn: shipments.length > 1 ? plural(shipments.length, "order") : floor ? `Ships ${formatDate(floor)}` : undefined,
    palletFit: groups,
    pallet: shipments.length === 1 ? shipments[0].pallet : undefined,
    palletHint: palletHint(groups),
  };
}

/** The Pre-order page's line about the buyer's ceiling: its size, what buying from stock added, and when it lifts. */
function shareNote(share: ShopShare): string {
  const earned = share.basePct == null ? 0 : Math.round((share.pct - share.basePct) * 10) / 10;
  return `You can order up to ${Math.round(share.pct * 10) / 10}% of each new release${earned > 0 ? `, including +${earned}% for buying from stock` : ""}. The limit lifts ${plural(share.liftDays, "day")} before a beer ships; after that, what is left is open to everyone.`;
}

/** The ship date a suggestion is for. */
export const suggestionShipsFrom = (s: ShopSuggestion, catalog: ShopCatalogItem[]) => suggestionTarget(s, catalog).release?.shipsFrom;

/** The ship dates with something to suggest, soonest first. */
const suggestedDates = (suggested: ShopSuggestion[], catalog: ShopCatalogItem[]) =>
  [...new Set(suggested.flatMap((s) => suggestionShipsFrom(s, catalog) ?? []))].sort();

/** What the suggested quantities are based on, so the buyer can judge them. */
function suggestedNote(suggested: ShopSuggestion[]): string {
  const latest = suggested.map((s) => s.lastOn ?? "").reduce((a, b) => (b > a ? b : a), "");
  return `Based on your recent orders${latest ? `, the latest on ${formatMonthDay(latest)}` : ""}, with your newest orders counting most, and rounded up to full layers when that is close.`;
}

const PACKAGE_TYPES = ["keg", "can", "bottle"];
/** Where a package sits under its brand, so every brand lists them alike: kegs largest first, then cans, then bottles. */
function packageRank(item: ShopCatalogItem): number {
  const at = (list: readonly string[], value?: string | null) => { const index = list.indexOf(value ?? ""); return index < 0 ? list.length : index; };
  return at(PACKAGE_TYPES, item.packageType) * 10 + at(KEG_SIZES, item.kegSize);
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
  brands = [],
  planned = [],
  share,
  suggested = [],
  palletRules = DEFAULT_PALLET_RULES,
}: ShopSnapshot): ShopViewModel {
  const rank = new Map(catalog.map((i) => [i.skuId, packageRank(i)]));
  type Entry = { item: ShopCatalogItem; row: ShopItemView };
  /** One section's rows as brand groups: packages in one order under every brand, each brand with its amount in the cart. */
  const toGroups = (entries: Entry[]): ShopGroupView[] => {
    const groups: ShopGroupView[] = [];
    const cents = new Map<string, number>();
    for (const { item, row } of entries) {
      if (row.qty > 0) cents.set(item.product, (cents.get(item.product) ?? 0) + row.qty * item.unitPriceCents);
      const group = groups.find((g) => g.product === item.product);
      if (group) group.items.push(row);
      else {
        const brand = brands.find((b) => b.name === item.product);
        const facts = brand ? brandTagline(brand) : "";
        groups.push({ product: item.product, ...(item.brandAlias ? { alias: item.brandAlias } : {}), ...(brand ? { brand } : {}), ...(facts ? { facts } : {}), items: [row] });
      }
    }
    for (const group of groups) {
      // Same rank (a sixtel and its one-way twin) reads by name.
      group.items.sort((a, b) => rank.get(a.skuId)! - rank.get(b.skuId)! || a.name.localeCompare(b.name));
      const total = cents.get(group.product);
      if (total) group.total = money(total);
    }
    return groups;
  };
  // The catalog row carries the stock offer and stock releases; each planned-batch release is its own Pre-order row.
  const catalogRows: Entry[] = [];
  const preOrderRows: Entry[] = [];
  /** Each pre-order brand's soonest release: its ship date heads the brand and carries the buyer's limit on that batch. */
  const soonest = new Map<string, ShopRelease>();
  for (const item of catalog) {
    const chosen = chosenOffer(item);
    const offers = offersOf(item);
    const fromBatch = new Set((item.releases ?? []).filter((r) => r.fromBatch).map((r) => r.releaseId));
    const stock = offers.filter((o) => !fromBatch.has(o.value));
    const base = { skuId: item.skuId, name: item.formatName ?? packageName(item.product, item.name), price: money(item.unitPriceCents) };
    // A SKU with no offer at all still shows in the catalog, as it always has.
    if (stock.length || !offers.length) {
      const active = !fromBatch.has(chosen);
      catalogRows.push({ item, row: { ...base, key: item.skuId, offers: stock, offer: active ? chosen : stock[0].value, active, qty: active ? item.qty : 0 } });
    }
    for (const release of (item.releases ?? []).filter((r) => r.fromBatch)) {
      const first = soonest.get(item.product);
      if (!first || release.shipsFrom < first.shipsFrom) soonest.set(item.product, release);
    }
    for (const offer of offers.filter((o) => fromBatch.has(o.value))) {
      const active = chosen === offer.value;
      preOrderRows.push({ item, row: { ...base, key: `${item.skuId}:${offer.value}`, offers: [offer], offer: offer.value, active, qty: active ? item.qty : 0 } });
    }
  }
  const groups = toGroups(catalogRows);
  // Listed by ship date, soonest first, then by name.
  const shipDate = (group: ShopGroupView) => soonest.get(group.product)!.shipsFrom;
  const preOrderGroups = toGroups(preOrderRows).sort((a, b) => shipDate(a).localeCompare(shipDate(b)) || a.product.localeCompare(b.product)).map((group): ShopGroupView => {
    const release = soonest.get(group.product)!;
    const until = release.limitLiftsOn ? ` until ${formatMonthDay(release.limitLiftsOn)}` : "";
    return {
      ...group, shipsFrom: release.shipsFrom,
      ships: `Ships ${formatDate(release.shipsFrom)}${release.ordersCloseOn ? ` · order by ${formatDate(release.ordersCloseOn)}` : ""}`,
      ...(release.limitLeftBbl == null ? {} : { limit: release.limitLeftBbl > 0 ? `You can order ${bbl(release.limitLeftBbl)} bbl more of this batch${until}` : `You have reached your limit on this batch${until}` }),
    };
  });
  const open = new Set(preOrderGroups.map((g) => g.product));
  const notOpen = planned.filter((p) => !open.has(p.brand_name)).map((p) => ({
    key: `${p.brand_name}-${p.planned_week}`, title: p.brand_name,
    detail: `Planned for the week of ${formatMonthDay(p.planned_week)} · ${p.listed ? "not open for pre-order yet" : "not yet listed"}`,
  }));
  const fitted = fitSuggestions(suggested, catalog);
  const shipTo = shipTos.find((s) => s.id === shipToId);
  const floor = shipsFromFloor(catalog);
  const summary = shopSummary(catalog, floor, palletRules);
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
    shipsFromNote: summary.shipments.length > 1 ? `This cart becomes ${plural(summary.shipments.length, "order")}, one for each ship date.` : floor ? `This order ships from ${formatDate(floor)}.` : undefined,
    summary,
    ...(preOrderGroups.length || notOpen.length ? { preOrder: { groups: preOrderGroups, planned: notOpen, ...(share ? { note: shareNote(share) } : {}), suggested: suggestedDates(fitted, catalog), fillable: summary.shipments.map((s) => s.key).filter((date) => date !== "now" && Object.keys(fillPallet(catalog, date, palletRules)).length), ...(fitted.length ? { suggestedNote: suggestedNote(fitted) } : {}) } } : {}),
  };
}

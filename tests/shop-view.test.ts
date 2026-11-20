// tests/shop-view.test.ts — Shop and Review order adapters plus HTML.
// Views own no sample data; this file does not import SCREENS or app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ReviewOrderView } from "../components/mgr/views/review-order";
import { ShopView } from "../components/mgr/views/shop";
import { BrandHeading } from "../components/mgr/views/brand-heading";
import { ridgelineReviewOrder, ridgelineShop } from "../lib/mgr/fixtures/portal";
import { toQuotedReviewOrderViewProps, toReviewOrderViewProps } from "../lib/mgr/review-order-view";
import { effectiveRequestedDate, fillPallet, fitSuggestions, shipGroups, toShopViewProps, type ShopCatalogItem } from "../lib/mgr/shop-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("Shop view", () => {
  it("maps portal_catalog grouped by product with cart qty", () => {
    const model = toShopViewProps(ridgelineShop);
    expect(model.groups.map((g) => g.product)).toEqual(["Hazy IPA", "Pils", "Stout"]);
    expect(model.groups[0]?.items.map((i) => [i.name, i.price, i.qty])).toEqual([
      ["½ bbl keg", "$150.00", 4],
      ["case · 24×16 oz", "$42.00", 0],
    ]);
    expect(model.groups[1]?.items.map((i) => [i.name, i.price, i.qty])).toEqual([
      ["case · 24×16 oz", "$38.00", 6],
      ["12 oz bottle", "$18.00", 0],
    ]);
    expect(model.groups[2]?.items[0]).toMatchObject({ name: "⅙ bbl keg", price: "$62.00", qty: 0 });
    expect(model.source).toBe("Warehouse");
    expect(model.shipToLine).toBe("Main · Sep 9, 2026");
    expect(toShopViewProps({ ...ridgelineShop, requestedDate: "" }).shipToLine).toBe("Main");
    expect(model.subtotal).toBe("$828.00");
    expect(model.chargesLine).toBe("Keg deposits & fees added at review");
  });

  it("renders Review order and Hazy IPA from the adapter, with no Coming up link", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop) }));
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/>Review order</);
    expect(html).not.toMatch(/Coming up/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/Ships from/);
    expect(html).toMatch(/Main · Sep 9, 2026/);
    expect(html).not.toMatch(/Wed 9\/9/);
    expect(html).not.toMatch(/→/);
  });

  // The order summary is drawn once and shown two ways: a sticky panel beside
  // the catalog from md up, and on a phone a bar pinned to the foot of the
  // scroll (above the tab bar) whose tap opens the same summary in a sheet.
  it("draws the summary as a desk panel with Save draft and Review, and a phone bar that announces the total", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop) }));
    const panel = html.match(/<aside aria-label="Your order" class="([^"]*)"/)?.[1].split(" ");
    expect(panel).toEqual(expect.arrayContaining(["hidden", "md:block", "md:sticky"]));
    expect(html).toMatch(/<aside[^>]*>(?:(?!<\/aside>).)*>Review order<(?:(?!<\/aside>).)*>Save draft<\/button>/);
    expect(html).toMatch(/<section aria-label="Order summary" class="sticky [^"]*md:hidden/);
    expect(html).toMatch(/aria-live="polite"[^>]*>10 items · \$828\.00</);
    // One subtotal line and one charges line; the long notice is gone.
    expect(html.match(/Items subtotal/g)).toHaveLength(1);
    expect(html).toMatch(/Keg deposits &amp; fees added at review/);
    expect(html).not.toMatch(/Current catalog subtotal/);
  });

  it("hides the phone bar with an empty cart", () => {
    const empty = { ...ridgelineShop, catalog: ridgelineShop.catalog.map((i) => ({ ...i, qty: 0 })) };
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(empty) }));
    expect(html).not.toMatch(/aria-label="Order summary"/);
    expect(html).toMatch(/aria-label="Your order"/);
  });

  it("controlled quantities use the same brand and package controls", () => {
    const html = htmlOf(createElement(ShopView, {
      model: toShopViewProps(ridgelineShop),
      quantities: { [ridgelineShop.catalog[0].skuId]: "7" },
    }));
    expect(html).toMatch(/value="7"/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/\$828\.00/);
  });

  it("null footer omits inventory Review and ship-to", () => {
    const html = htmlOf(createElement(ShopView, {
      model: toShopViewProps(ridgelineShop),
      footer: null,
    }));
    expect(html).toMatch(/½ bbl keg/);
    expect(html).not.toMatch(/Review order/);
    expect(html).not.toMatch(/Ships from/);
  });
});

describe("Review order view", () => {
  it("shows current merchandise and keeps unquoted tax and deposits pending", () => {
    const shop = toShopViewProps(ridgelineShop);
    const model = toReviewOrderViewProps(ridgelineShop);
    expect(shop.subtotal).toBe("$828.00");
    expect(model.lines.map((l) => [l.name, l.price, l.qty])).toEqual([
      ["Hazy IPA · ½ bbl keg", "$150.00", 4],
      ["Pils · case · 24×16 oz", "$38.00", 6],
    ]);
    expect(model.depositDetail).toBe("Pending; not included");
    expect(model.depositAmount).toBe("Pending; not included");
    expect(model.subtotal).toBe("$828.00");
    expect(model.placeVerb).toBe("Place order · $828.00");
    expect(model.tax).toBe("Pending; not included");
    expect(model.shipTo).toBe("Main · Phoenixville, PA");
    expect(model.requestedDate).toBe("2026-09-09");
    expect(model.source).toBe("Warehouse");
    expect(model.po).toBe("optional");
  });

  it("names a foreign ship-to's country and never prints a missing part as null", () => {
    const model = toReviewOrderViewProps({ ...ridgelineShop, shipTos: [{ id: ridgelineShop.shipToId, label: "Main", country: "JP" }] });
    expect(model.shipTo).toBe("Main · Japan");
  });

  it("shows the cart's pallet fit, quoted or not", () => {
    const expected = [["½ bbl kegs", "4 · 4 to fill"], ["Cases of 24 cans", "6 · 4 to fill"]];
    expect(toReviewOrderViewProps(ridgelineReviewOrder).palletFit?.map((g) => [g.label, g.text])).toEqual(expected);
    expect(toReviewOrderViewProps({ ...ridgelineReviewOrder, quote: undefined }).palletFit?.map((g) => [g.label, g.text])).toEqual(expected);
    const html = htmlOf(createElement(ReviewOrderView, { model: toReviewOrderViewProps(ridgelineReviewOrder) }));
    expect(html).toMatch(/Pallet fit/);
    expect(html).toMatch(/Cases of 24 cans/);
  });

  it("renders Place order and Hazy IPA from the adapter", () => {
    const html = htmlOf(createElement(ReviewOrderView, { model: toReviewOrderViewProps(ridgelineReviewOrder) }));
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/Place order · \$948\.00 before tax/);
    expect(html).toMatch(/Keg deposit/);
    expect(html).toMatch(/Tax pending/);
    expect(html).toMatch(/2026-09-09/);
    expect(html).not.toMatch(/Wed 9\/9/);
    expect(html).not.toMatch(/→/);
  });
});

describe("inventory and live Shop", () => {
  it("the Shop inventory record is ShopView painted from that fixture", () => {
    const body = SCREENS.find((s) => s.name === "Shop")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Shop")!.body)).toBe(true);
    expect(body.type).toBe(ShopView);
    expect(body.props.model).toEqual(toShopViewProps(ridgelineShop));
  });

  it("the Review order inventory record is ReviewOrderView painted from that fixture", () => {
    const body = SCREENS.find((s) => s.name === "Review order")!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReviewOrderView);
    expect(body.props.model).toEqual(toReviewOrderViewProps(ridgelineReviewOrder));
  });

  it("the live Shop delegates to Cart which mounts both shared views", () => {
    const src = readFileSync("app/(portal)/portal/page.tsx", "utf8");
    expect(src).toMatch(/<Cart\b/);
    const cart = readFileSync("app/(portal)/portal/cart.tsx", "utf8");
    expect(cart).toMatch(/<ShopView\b/);
    expect(cart).toMatch(/<ReviewOrderView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
  });
});

it("review preserves quoted amounts and identities without inventing missing tax", () => {
  const quote = { ...ridgelineReviewOrder.quote!, taxStatus: "calculated" as const, subtotalCents: 123, depositCents: 456, amountBeforeTaxCents: 579 };
  const model = toQuotedReviewOrderViewProps(quote, {});
  expect(model.subtotal).toBe("$1.23");
  expect(model.depositAmount).toBe("$4.56");
  expect(model.tax).toBe("Tax pending");
  expect(model.estimatedTotal).toBeUndefined();
  expect(model.placeVerb).toBe("Place order · $5.79 before tax");
  expect(model.lines[0].key).toBe(quote.lines[0].skuId);
  expect(model.requestedDate).toBe("Not specified");
});

it("review lists the quoted one-way keg fee, and omits the row when there is none", () => {
  const quote = { ...ridgelineReviewOrder.quote!, oneWayFeeCents: 3000,
    oneWayFees: [{ name: "Export Pils · one-way sixtel", qty: 3, unitPriceCents: 1000, amountCents: 3000 }] };
  const model = toQuotedReviewOrderViewProps(quote, {});
  expect(model.oneWayFees).toEqual([{ key: "0", name: "One-way keg fee", detail: "Export Pils · one-way sixtel · quantity 3 at $10.00", amount: "$30.00" }]);
  const html = renderToStaticMarkup(createElement(ReviewOrderView, { model, footer: null }));
  expect(html).toContain("One-way keg fee");
  expect(toQuotedReviewOrderViewProps(ridgelineReviewOrder.quote!, {}).oneWayFees).toEqual([]);
});

it("tells the buyer the amounts and the requested date are not final", () => {
  // A portal request is not an order: the brewery confirms both the money and
  // the date. Dropping either half of this leaves the buyer reading the
  // subtotal as a quote and the requested date as a commitment.
  const info = toShopViewProps(ridgelineShop).depositInfo;
  expect(info).toContain("Tax is not included.");
  expect(info).toContain("The brewery confirms final invoice amounts and the requested delivery date.");
});

describe("Shop offers (portal releases)", () => {
  const release = (releaseId: string, shipsFrom: string, ordersCloseOn: string | null = null, badge = "in") => ({ releaseId, shipsFrom, ordersCloseOn, badge });
  const both: ShopCatalogItem = { skuId: "s1", name: "Stout · ⅙ bbl keg", product: "Stout", unitPriceCents: 6200, badge: "in", releases: [release("r1", "2026-12-04", "2026-11-27")], qty: 0 };
  const releaseOnly: ShopCatalogItem = { skuId: "s2", name: "Saison · case", product: "Saison", unitPriceCents: 4000, badge: null, releases: [release("r2", "2026-12-11", null, "low")], qty: 0 };
  const base = { ...ridgelineShop, requestedDate: "", catalog: [both, releaseOnly] };

  it("offers stock and each release on one row, stock first", () => {
    const [stout, saison] = toShopViewProps(base).groups.map((g) => g.items[0]);
    expect(stout.offers).toEqual([{ value: "", label: "From stock" }, { value: "r1", label: "From Dec 4, 2026 · order by Nov 27, 2026" }]);
    expect(stout.offer).toBe("");
    expect(saison.offers).toEqual([{ value: "r2", label: "From Dec 11, 2026 · few left" }]);
    expect(saison.offer).toBe("r2");
  });

  it("floors the requested date at the latest ships-from among release lines, and says so", () => {
    const mixed = [{ ...both, qty: 2, offer: "r1" }, { ...releaseOnly, qty: 3 }, { ...ridgelineShop.catalog[0], qty: 1 }];
    expect(effectiveRequestedDate("", mixed)).toBe("2026-12-11");
    expect(effectiveRequestedDate("2026-12-20", mixed)).toBe("2026-12-20");
    expect(effectiveRequestedDate("2026-12-01", mixed)).toBe("2026-12-11");
    // Stock lines and zero quantities set no floor.
    expect(effectiveRequestedDate("", [{ ...both, qty: 2 }, { ...releaseOnly, qty: 0 }])).toBe("");
    const model = toShopViewProps({ ...base, catalog: mixed });
    expect(model.shipsFromNote).toBe("This order ships from Dec 11, 2026.");
    expect(toShopViewProps(base).shipsFromNote).toBeUndefined();
  });

  it("draws the offer picker only for a row with more than one offer", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps({ ...base, catalog: [{ ...both, qty: 2, offer: "r1" }, releaseOnly] }) }));
    // Stout has stock and a release: an inline picker beside the price, named for a screen reader, not a full-width field.
    expect(html).toMatch(/aria-label="⅙ bbl keg · order from"/);
    expect(html).not.toMatch(/<label[^>]*>⅙ bbl keg · order from/);
    expect(html).toMatch(/From Dec 4, 2026 · order by Nov 27, 2026/);
    // Saison has one offer: it reads on its own line under the price, in full, with no picker.
    expect(html).toMatch(/\$40\.00<[\s\S]*<p[^>]*>From Dec 11, 2026 · few left<\/p>/);
    expect(html).not.toMatch(/case · order from/);
    expect(html).toMatch(/This order ships from Dec 4, 2026/);
  });
});

describe("Shop order summary", () => {
  const release = { releaseId: "r1", shipsFrom: "2026-12-04", ordersCloseOn: null, badge: "in" };
  const stout: ShopCatalogItem = { skuId: "s1", name: "Stout · ⅙ bbl keg", product: "Stout", unitPriceCents: 6200, badge: "in", releases: [release], qty: 0,
    packageType: "keg", kegSize: "sixth_bbl", unitsPerCase: null, palletFit: 20 };
  const pils: ShopCatalogItem = { skuId: "s2", name: "Pils · ⅙ bbl keg", product: "Pils", unitPriceCents: 6000, badge: "in", qty: 0,
    packageType: "keg", kegSize: "sixth_bbl", unitsPerCase: null, palletFit: 20 };
  const bottle: ShopCatalogItem = { skuId: "s3", name: "Pils · 12 oz bottle", product: "Pils", unitPriceCents: 1800, badge: "in", qty: 0 };

  it("lists only lines in the cart, each with its amount and the release it ships from", () => {
    const summary = toShopViewProps({ ...ridgelineShop, catalog: [{ ...stout, qty: 2, offer: "r1" }, { ...pils, qty: 16 }, bottle] }).summary;
    expect(summary.lines).toEqual([
      { key: "s1", name: "Stout · ⅙ bbl keg", detail: "2 × $62.00 · from the Dec 4, 2026 release", amount: "$124.00", anchor: "brand-stout" },
      { key: "s2", name: "Pils · ⅙ bbl keg", detail: "16 × $60.00", amount: "$960.00", anchor: "brand-pils" },
    ]);
    expect(summary.items).toBe("18 items");
    expect(summary.shipsOn).toBe("Ships Dec 4, 2026");
  });

  it("adds pallet fit across brands of one package, and hints when a unit is nearly full", () => {
    const summary = toShopViewProps({ ...ridgelineShop, catalog: [{ ...stout, qty: 2 }, { ...pils, qty: 16 }, { ...bottle, qty: 5 }] }).summary;
    expect(summary.palletFit.map((g) => [g.label, g.text])).toEqual([["⅙ bbl kegs", "18 · 2 to fill"]]);
    expect(summary.palletHint).toBe("⅙ bbl kegs 2 short of full");
    expect(summary.shipsOn).toBeUndefined();
    expect(toShopViewProps({ ...ridgelineShop, catalog: [{ ...pils, qty: 10 }] }).summary.palletHint).toBeUndefined();
  });

  it("draws the pallet fit block in the summary", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps({ ...ridgelineShop, catalog: [{ ...stout, qty: 25 }] }) }));
    expect(html).toMatch(/Pallet fit/);
    expect(html).toMatch(/⅙ bbl kegs/);
    expect(html).toMatch(/1 full \+ 5 · 15 to fill/);
  });
});

describe("Shop brands", () => {
  const pack = (skuId: string, formatName: string, packageType: string, kegSize: string | null, qty = 0): ShopCatalogItem =>
    ({ skuId, name: formatName, formatName, product: "Hazy IPA", unitPriceCents: 10000, badge: "in", qty, packageType, kegSize });
  const brand = { brandId: "b1", name: "Hazy IPA", alias: null, style: "Hazy IPA", abv: 6.5, description: null, hops: null, ttbId: null, hasLabel: false };

  it("lists a brand's packages in one order: kegs largest first, then cans, then bottles", () => {
    const catalog = [pack("1", "Sixtel (one-way)", "keg", "sixth_bbl"), pack("2", "Case", "can", null), pack("3", "Sixtel", "keg", "sixth_bbl"), pack("4", "Bottle", "bottle", null), pack("5", "Half", "keg", "half_bbl")];
    expect(toShopViewProps({ ...ridgelineShop, catalog }).groups[0]?.items.map((i) => i.name)).toEqual(["Half", "Sixtel", "Sixtel (one-way)", "Case", "Bottle"]);
  });

  it("gives a brand its style and ABV line, and its amount in the order", () => {
    const catalog = [pack("1", "Half", "keg", "half_bbl", 2), pack("2", "Case", "can", null, 1)];
    expect(toShopViewProps({ ...ridgelineShop, catalog, brands: [brand] }).groups[0]).toMatchObject({ facts: "Hazy IPA · 6.5% ABV", total: "$300.00" });
    const bare = toShopViewProps({ ...ridgelineShop, catalog: [pack("1", "Half", "keg", "half_bbl")] }).groups[0]!;
    expect(bare.facts).toBeUndefined();
    expect(bare.total).toBeUndefined();
  });

  it("draws one band per brand, with no view switch, and says what a brand has in the order", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop) }));
    // Hazy IPA, Pils and Stout; Festbier is on the Pre-order page.
    expect(html.match(/data-brand-heading/g)).toHaveLength(3);
    expect(html).toMatch(/In your order · \$600\.00/);
    expect(html).not.toMatch(/role="radiogroup"/);
  });
});

describe("Shop brand sheet ordering", () => {
  it("hands each brand heading that brand's package rows, so its sheet can order them", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop), brandHeading: (group, view) => createElement("div", { "data-sheet": group.product }, view.order) }));
    expect(html.match(/data-sheet/g)).toHaveLength(3);
    // Five catalog packages, each drawn on the page and again in its brand's sheet.
    expect(html.match(/<input[^>]*type="number"/g)).toHaveLength(10);
  });
});

describe("Shop Pre-order page", () => {
  const REL = "00000000-0000-4000-8000-0000000000f1";
  const batch = { releaseId: REL, shipsFrom: "2026-12-04", ordersCloseOn: "2026-11-27", badge: "low", fromBatch: true };
  const sku = (skuId: string, product: string, over: Partial<ShopCatalogItem> = {}): ShopCatalogItem =>
    ({ skuId, name: "Sixtel", formatName: "Sixtel", product, unitPriceCents: 10000, badge: "in", qty: 0, packageType: "keg", kegSize: "sixth_bbl", ...over });
  const shop = (catalog: ShopCatalogItem[], planned: { brand_name: string; planned_week: string; listed: boolean }[] = []) => toShopViewProps({ ...ridgelineShop, catalog, planned });

  it("lists a planned-batch release under Pre-order and keeps the stock offer in the catalog", () => {
    const model = shop([sku("1", "Pils", { releases: [batch] })]);
    expect(model.groups[0]?.items[0]).toMatchObject({ skuId: "1", offers: [{ value: "", label: "From stock" }], offer: "", active: true });
    expect(model.preOrder?.groups.map((g) => g.product)).toEqual(["Pils"]);
    expect(model.preOrder?.groups[0]?.items[0]).toMatchObject({ skuId: "1", offer: REL, active: false, qty: 0, offers: [{ value: REL, label: "From Dec 4, 2026 · order by Nov 27, 2026 · few left" }] });
  });

  it("puts a SKU's quantity on the row whose offer the cart chose, and totals each section apart", () => {
    const model = shop([sku("1", "Pils", { releases: [batch], qty: 3, offer: REL })]);
    expect(model.preOrder?.groups[0]).toMatchObject({ total: "$300.00", items: [{ qty: 3, active: true }] });
    expect(model.groups[0]?.items[0]).toMatchObject({ qty: 0, active: false });
    expect(model.groups[0]?.total).toBeUndefined();
  });

  it("leaves a package that is only released from a planned batch out of the catalog", () => {
    const model = shop([sku("1", "Pils", { badge: null, releases: [batch] }), sku("2", "Stout")]);
    expect(model.groups.map((g) => g.product)).toEqual(["Stout"]);
    expect(model.preOrder?.groups.map((g) => g.product)).toEqual(["Pils"]);
  });

  it("names planned beers that are not released yet, and skips ones already open for pre-order", () => {
    const model = shop([sku("1", "Pils", { releases: [batch] }), sku("2", "Stout")], [
      { brand_name: "Pils", planned_week: "2026-11-30", listed: true },
      { brand_name: "Stout", planned_week: "2026-12-07", listed: true },
      { brand_name: "Saison", planned_week: "2026-12-14", listed: false },
    ]);
    expect(model.preOrder?.planned.map((p) => [p.title, p.detail])).toEqual([
      ["Stout", "Planned for the week of Dec 7 · not open for pre-order yet"],
      ["Saison", "Planned for the week of Dec 14 · not yet listed"],
    ]);
  });

  it("has no Pre-order section without a planned-batch release or a planned beer", () => {
    expect(shop([sku("2", "Stout", { releases: [{ ...batch, fromBatch: false }] })]).preOrder).toBeUndefined();
  });

  it("draws Pre-order on its own page, and keeps it off Order", () => {
    const model = shop([sku("1", "Pils", { releases: [batch] }), sku("2", "Stout")], [{ brand_name: "Saison", planned_week: "2026-12-14", listed: false }]);
    const page = htmlOf(createElement(ShopView, { model, section: "pre-order", footer: null }));
    expect(page).toMatch(/<h1[^>]*>Pre-order<\/h1>[\s\S]*Pils[\s\S]*From Dec 4, 2026[\s\S]*Planned for the week of Dec 14/);
    expect(page).not.toMatch(/Stout/);
    const order = htmlOf(createElement(ShopView, { model, footer: null }));
    expect(order).toMatch(/<h1[^>]*>Order<\/h1>[\s\S]*Stout/);
    expect(order).not.toMatch(/From Dec 4, 2026|Planned for the week/);
  });

  it("says so when a page has nothing to list", () => {
    const stockOnly = shop([sku("2", "Stout")]);
    expect(htmlOf(createElement(ShopView, { model: stockOnly, section: "pre-order", footer: null }))).toMatch(/Nothing open for pre-order yet/);
    const plannedOnly = shop([sku("1", "Pils", { badge: null, releases: [batch] })]);
    expect(htmlOf(createElement(ShopView, { model: plannedOnly, footer: null }))).toMatch(/Nothing available to ship now/);
  });
});

describe("Shop ship dates, limits and suggestions", () => {
  const rel = (id: string, shipsFrom: string, over: Partial<NonNullable<ShopCatalogItem["releases"]>[number]> = {}) =>
    ({ releaseId: id, shipsFrom, ordersCloseOn: null, badge: "in", fromBatch: true, bblPerUnit: 0.5, ...over });
  const item = (skuId: string, product: string, qty: number, over: Partial<ShopCatalogItem> = {}): ShopCatalogItem =>
    ({ skuId, name: "Half", formatName: "Half", product, unitPriceCents: 10000, badge: null, qty, packageType: "keg", kegSize: "half_bbl", ...over });
  const cart = [
    item("s1", "Stock Stout", 2, { badge: "in" }),
    item("s2", "Later Lager", 1, { releases: [rel("r-late", "2026-12-16")], offer: "r-late" }),
    item("s3", "Sooner Saison", 3, { releases: [rel("r-soon", "2026-12-09")], offer: "r-soon" }),
    // A stock release ships with stock, whatever its date says.
    item("s4", "Released Rye", 1, { releases: [rel("r-stock", "2026-11-20", { fromBatch: false })], offer: "r-stock" }),
    item("s5", "Untouched", 0, { badge: "in" }),
  ];

  it("splits a cart into one order per ship date, stock first", () => {
    expect(shipGroups(cart).map((g) => [g.shipsFrom, g.items.map((i) => i.skuId)])).toEqual([
      ["", ["s1", "s4"]], ["2026-12-09", ["s3"]], ["2026-12-16", ["s2"]],
    ]);
    const model = toShopViewProps({ ...ridgelineShop, catalog: cart });
    expect(model.summary.shipments.map((s) => [s.title, s.subtotal, s.lines.length])).toEqual([
      ["Ships now", "$300.00", 2], ["Ships Dec 9, 2026", "$300.00", 1], ["Ships Dec 16, 2026", "$100.00", 1],
    ]);
    expect(model.summary.shipsOn).toBe("3 orders");
    expect(model.shipsFromNote).toBe("This cart becomes 3 orders, one for each ship date.");
    // One ship date is one order, as before.
    expect(toShopViewProps({ ...ridgelineShop, catalog: [cart[2]] })).toMatchObject({ shipsFromNote: "This order ships from Dec 9, 2026.", summary: { shipsOn: "Ships Dec 9, 2026" } });
  });

  it("lists each order with its own subtotal in the summary when the cart splits", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps({ ...ridgelineShop, catalog: cart }) }));
    expect(html).toMatch(/Ships now<\/span><span[^>]*>\$300\.00[\s\S]*Ships Dec 9, 2026<\/span><span[^>]*>\$300\.00[\s\S]*Ships Dec 16, 2026/);
    const one = htmlOf(createElement(ShopView, { model: toShopViewProps({ ...ridgelineShop, catalog: [cart[0]] }) }));
    expect(one).not.toMatch(/Ships now/);
  });

  it("lists pre-orders by ship date, each date heading its beers, with the buyer's limit on the batch", () => {
    const catalog = [
      item("s2", "Later Lager", 0, { releases: [rel("r-late", "2026-12-16", { ordersCloseOn: "2026-12-09" })] }),
      item("s3", "Sooner Saison", 0, { releases: [rel("r-soon", "2026-12-09", { limitLeftBbl: 1.5, limitLiftsOn: "2026-11-25" })] }),
      item("s6", "Capped Cream Ale", 0, { releases: [rel("r-cap", "2026-12-09", { limitLeftBbl: 0, limitLiftsOn: "2026-11-25" })] }),
    ];
    const model = toShopViewProps({ ...ridgelineShop, catalog, share: { pct: 18, basePct: 15, manual: false, liftDays: 14 } });
    expect(model.preOrder?.groups.map((g) => [g.product, g.ships, g.limit])).toEqual([
      ["Capped Cream Ale", "Ships Dec 9, 2026", "You have reached your limit on this batch until Nov 25"],
      ["Sooner Saison", "Ships Dec 9, 2026", "You can order 1.5 bbl more of this batch until Nov 25"],
      ["Later Lager", "Ships Dec 16, 2026 · order by Dec 9, 2026", undefined],
    ]);
    expect(model.preOrder?.note).toBe("You can order up to 18% of each new release, including +3% for buying from stock. The limit lifts 14 days before a beer ships; after that, what is left is open to everyone.");
    // A typed limit earns nothing from stock, and a buyer with none gets no note.
    expect(toShopViewProps({ ...ridgelineShop, catalog, share: { pct: 25, basePct: null, manual: true, liftDays: 14 } }).preOrder?.note).toMatch(/^You can order up to 25% of each new release\. /);
    expect(toShopViewProps({ ...ridgelineShop, catalog, share: null }).preOrder?.note).toBeUndefined();
    const html = htmlOf(createElement(ShopView, { model, section: "pre-order", footer: null }));
    // One heading for the two beers that ship Dec 9.
    expect(html.match(/Ships Dec 9, 2026/g)).toHaveLength(1);
    expect(html).toMatch(/Ships Dec 9, 2026[\s\S]*Capped Cream Ale[\s\S]*Sooner Saison[\s\S]*You can order 1\.5 bbl more[\s\S]*Ships Dec 16, 2026 · order by Dec 9, 2026[\s\S]*Later Lager/);
  });

  it("rounds a ship date's suggestion up to full layers when that is close, and says what it is based on", () => {
    const caseOf = (skuId: string, product: string, releaseId: string, shipsFrom: string): ShopCatalogItem =>
      item(skuId, product, 0, { name: "Case", formatName: "Case", packageType: "can", kegSize: null, unitsPerCase: 24, palletFit: 10, releases: [rel(releaseId, shipsFrom, { bblPerUnit: 0.1 })] });
    const catalog = [caseOf("a", "Ale", "ra", "2026-12-09"), caseOf("b", "Bock", "rb", "2026-12-09"), caseOf("c", "Cream Ale", "rc", "2026-12-09"), caseOf("d", "Dunkel", "rd", "2026-12-16")];
    const suggested = [{ releaseId: "ra", skuId: "a", qty: 30, lastOn: "2026-11-04" }, { releaseId: "rb", skuId: "b", qty: 35, lastOn: "2026-11-11" }, { releaseId: "rc", skuId: "c", qty: 33 }, { releaseId: "rd", skuId: "d", qty: 4 }];
    // Dec 9 is 98 cases: two more fill the tenth layer, on the beer with the most. Dec 16 is 4 cases: six more would be too big a jump.
    expect(fitSuggestions(suggested, catalog).map((s) => [s.skuId, s.qty])).toEqual([["a", 30], ["b", 37], ["c", 33], ["d", 4]]);
    const model = toShopViewProps({ ...ridgelineShop, catalog, suggested, share: null });
    expect(model.preOrder?.suggestedNote).toBe("Based on your recent orders, the latest on Nov 11, with your newest orders counting most, and rounded up to full layers when that is close.");
    // Each ship date is its own order, so each has its own button: the buyer fills only the weeks they order.
    expect(model.preOrder?.suggested).toEqual(["2026-12-09", "2026-12-16"]);
    const html = htmlOf(createElement(ShopView, { model, section: "pre-order", footer: null }));
    expect(html).toMatch(/Based on your recent orders[\s\S]*Ships Dec 9, 2026[\s\S]*Use suggested quantities[\s\S]*Ships Dec 16, 2026[\s\S]*Use suggested quantities/);
    expect(html.match(/Use suggested quantities/g)).toHaveLength(2);
    expect(toShopViewProps({ ...ridgelineShop, catalog, suggested: [], share: null }).preOrder?.suggestedNote).toBeUndefined();
  });

  it("holds suggested quantities to the buyer's limit, which a batch's packages share", () => {
    const capped = rel("r-keg", "2026-12-09", { limitLeftBbl: 2.2, limitLiftsOn: "2026-11-25" });
    const catalog = [
      item("k", "Sooner Saison", 0, { releases: [capped] }),
      item("c", "Sooner Saison", 0, { name: "Case", formatName: "Case", packageType: "can", kegSize: null, releases: [{ ...capped, releaseId: "r-case", bblPerUnit: 0.1 }] }),
      item("f", "Free Festbier", 0, { releases: [rel("r-free", "2026-12-16")] }),
    ];
    const suggested = [{ releaseId: "r-keg", skuId: "k", qty: 6 }, { releaseId: "r-case", skuId: "c", qty: 10 }, { releaseId: "r-free", skuId: "f", qty: 5 }, { releaseId: "gone", skuId: "k", qty: 1 }];
    // 2.2 bbl: four halves (2 bbl), then two cases from the 0.2 bbl left. No limit, no cut. A closed release is dropped.
    expect(fitSuggestions(suggested, catalog)).toEqual([{ releaseId: "r-keg", skuId: "k", qty: 4 }, { releaseId: "r-case", skuId: "c", qty: 2 }, { releaseId: "r-free", skuId: "f", qty: 5 }]);
    const model = toShopViewProps({ ...ridgelineShop, catalog, suggested });
    expect(model.preOrder?.suggested).toEqual(["2026-12-09", "2026-12-16"]);
    expect(htmlOf(createElement(ShopView, { model, section: "pre-order", footer: null }))).toMatch(/Use suggested quantities/);
    expect(htmlOf(createElement(ShopView, { model: toShopViewProps({ ...ridgelineShop, catalog }), section: "pre-order", footer: null }))).not.toMatch(/Use suggested quantities/);
  });

  describe("Fill the pallet", () => {
  const half = (qty: number, extra = {}): ShopCatalogItem =>
    item("h", "Hazy", qty, { packageType: "keg", kegSize: "half_bbl", unitsPerCase: null, palletFit: 8, palletFitMixed: 6, bblPerUnit: 0.5, packagingLb: 29.35, heightIn: 23.5, releases: [rel("r-h", "2026-12-09", { bblPerUnit: 0.5, ...extra })] });
  const cases = (qty: number): ShopCatalogItem =>
    item("c", "Pils", qty, { name: "Case", formatName: "Case", packageType: "can", kegSize: null, unitsPerCase: 24, palletFit: 10, bblPerUnit: 0.1, packagingLb: 0.87, heightIn: 6.1, releases: [rel("r-c", "2026-12-09", { bblPerUnit: 0.1 })] });
  const later = item("l", "Later Lager", 3, { packageType: "keg", kegSize: "half_bbl", unitsPerCase: null, palletFit: 8, releases: [rel("r-l", "2026-12-16")] });

  it("tops up one ship date's lines until another unit would need a second pallet", () => {
    // Five halves and 20 cases: the keg tier takes three more halves, then cases fill up to the 2,500 lb limit.
    expect(fillPallet([half(5), cases(20), later], "2026-12-09")).toEqual({ h: 8, c: 45 });
    // The buyer's limit on a batch stops its line: 3.5 bbl is seven halves.
    expect(fillPallet([half(5, { limitLeftBbl: 3.5 }), cases(20), later], "2026-12-09")).toMatchObject({ h: 7 });
    // A beer not in the order is never added.
    expect(fillPallet([half(5), cases(0), later], "2026-12-09")).toEqual({ h: 15 }); // a second tier of halves, up to the weight limit
  });

  it("says the pallets each order needs and offers the button only where there is room", () => {
    const model = toShopViewProps({ ...ridgelineShop, catalog: [half(5), cases(20)], share: null });
    expect(model.summary.pallet).toBe("1 pallet. Room for 3 more ½ bbl kegs or 30 more cases of 24 cans.");
    expect(model.preOrder?.fillable).toEqual(["2026-12-09"]);
    expect(htmlOf(createElement(ShopView, { model, section: "pre-order", footer: null }))).toMatch(/Fill the pallet/);
    const full = toShopViewProps({ ...ridgelineShop, catalog: [half(8), cases(45)], share: null });
    expect(full.summary.pallet).toBe("1 full pallet ✓");
    expect(full.preOrder?.fillable).toEqual([]);
  });
  });
});

describe("Shop brand alias", () => {
  // portal_catalog's SKU name can carry the alias in place of the brand; names come from brand and format.
  const giraffe: ShopCatalogItem = { skuId: "g1", name: "Animal #31 · Sixtel", product: "Masai Giraffe", brandAlias: "Animal #31", formatName: "Sixtel", unitPriceCents: 6200, badge: "in", qty: 3 };
  const pils: ShopCatalogItem = { skuId: "p1", name: "Pils · Case", product: "Pils", brandAlias: null, formatName: "Case", unitPriceCents: 4000, badge: "in", qty: 0 };
  const shop = { ...ridgelineShop, catalog: [giraffe, pils] };

  it("heads the brand with its alias apart, and names each row by its format", () => {
    const model = toShopViewProps(shop);
    expect(model.groups.map((g) => [g.product, g.alias, g.items.map((i) => i.name)])).toEqual([["Masai Giraffe", "Animal #31", ["Sixtel"]], ["Pils", undefined, ["Case"]]]);
    const html = htmlOf(createElement(ShopView, { model, footer: null }));
    expect(html).toMatch(/>Masai Giraffe<\/h2><p class="[^"]*text-muted-foreground[^"]*">Animal #31<\/p>/);
  });

  it("names summary and Review lines brand · format with the alias apart", () => {
    expect(toShopViewProps(shop).summary.lines[0]).toMatchObject({ name: "Masai Giraffe · Sixtel", alias: "Animal #31" });
    const quote = { ...ridgelineReviewOrder.quote!, lines: [{ skuId: "g1", name: "Animal #31 · Sixtel", product: "Masai Giraffe", qty: 3, unitPriceCents: 6200, amountCents: 18600 }] };
    const review = toReviewOrderViewProps({ ...shop, quote });
    expect(review.lines[0]).toMatchObject({ name: "Masai Giraffe · Sixtel", alias: "Animal #31" });
    expect(htmlOf(createElement(ReviewOrderView, { model: review, footer: null }))).toContain('<span>Masai Giraffe · Sixtel</span><span class="text-xs font-normal text-muted-foreground">Animal #31</span>');
  });
});

describe("Shop brand headings", () => {
  const hazy = { brandId: "b-hazy", name: "Hazy IPA", alias: null, style: "IPA", abv: 6.5, description: null, hops: null, ttbId: "26001001000001", hasLabel: true };

  it("gives a brand heading its portal_brands row, and nothing to a brand without one", () => {
    const groups = toShopViewProps({ ...ridgelineShop, brands: [hazy] }).groups;
    expect(groups.map((g) => [g.product, g.brand?.brandId])).toEqual([["Hazy IPA", "b-hazy"], ["Pils", undefined], ["Stout", undefined]]);
    expect(toShopViewProps(ridgelineShop).groups.every((g) => g.brand === undefined)).toBe(true);
  });

  it("draws every heading with BrandHeading, and lets the live Shop supply its own", () => {
    const model = toShopViewProps({ ...ridgelineShop, brands: [hazy] });
    const plain = htmlOf(createElement(ShopView, { model, footer: null }));
    expect(plain.match(/data-brand-heading/g)).toHaveLength(3);
    const live = htmlOf(createElement(ShopView, { model, footer: null, brandHeading: (group) => createElement("i", null, `heading ${group.brand?.brandId ?? group.product}`) }));
    expect(live).toContain("<i>heading b-hazy</i>");
    expect(live).toContain("<i>heading Pils</i>");
  });
});

describe("BrandHeading", () => {
  it("draws the thumbnail, then the name (a button when it opens the sheet) with the alias right under it", () => {
    const html = htmlOf(createElement(BrandHeading, { name: "Rose Quartz", alias: "Mineral #7", anchor: "brand-rose-quartz", thumb: createElement("i", null, "thumb"), onOpen: () => {} }));
    expect(html).toMatch(/<i>thumb<\/i><div[^>]*><h2 id="brand-rose-quartz"[^>]*><button type="button"[^>]*>Rose Quartz<\/button><\/h2><p[^>]*>Mineral #7<\/p><\/div>/);
    expect(htmlOf(createElement(BrandHeading, { name: "Pils" }))).not.toContain("<button");
  });
});

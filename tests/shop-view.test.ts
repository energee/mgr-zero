// tests/shop-view.test.ts — Shop and Review order adapters plus HTML.
// Views own no sample data; this file does not import SCREENS or app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ReviewOrderView } from "../components/mgr/views/review-order";
import { ShopView } from "../components/mgr/views/shop";
import { ridgelineReviewOrder, ridgelineShop } from "../lib/mgr/fixtures/portal";
import { toQuotedReviewOrderViewProps, toReviewOrderViewProps } from "../lib/mgr/review-order-view";
import { effectiveRequestedDate, toShopViewProps, type ShopCatalogItem } from "../lib/mgr/shop-view";

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

  it("renders Review order, Hazy IPA, and the Coming up nav from the adapter", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop) }));
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/>Review order</);
    expect(html).toMatch(/Coming up/);
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

  it("null footer and comingUp omit inventory Review/ship-to and Coming up", () => {
    const html = htmlOf(createElement(ShopView, {
      model: toShopViewProps(ridgelineShop),
      footer: null,
      comingUp: null,
    }));
    expect(html).toMatch(/½ bbl keg/);
    expect(html).not.toMatch(/Review order/);
    expect(html).not.toMatch(/Coming up/);
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
    // Saison has one offer: it reads beside the price, with no picker.
    expect(html).toMatch(/\$40\.00 · From Dec 11, 2026 · few left/);
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

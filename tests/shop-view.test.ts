// tests/shop-view.test.ts — Shop and Review order adapters plus HTML.
// Views own no sample data; this file does not import SCREENS or app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ReviewOrderView } from "../components/mgr/views/review-order";
import { ShopView } from "../components/mgr/views/shop";
import { RIDGELINE } from "../lib/mgr/fixtures/demo";
import { ridgelineReviewOrder, ridgelineShop } from "../lib/mgr/fixtures/portal";
import { toQuotedReviewOrderViewProps, toReviewOrderViewProps } from "../lib/mgr/review-order-view";
import { toShopViewProps } from "../lib/mgr/shop-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("Shop view", () => {
  it("maps portal_catalog grouped by product with cart qty", () => {
    const model = toShopViewProps(ridgelineShop);
    expect(model.customer).toBe(RIDGELINE.name);
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
    expect(model.reviewVerb).toBe("Review order · $828.00");
    expect(model.depositInfo).toMatch(/pending/);
  });

  it("renders Review order, Hazy IPA, and the Coming up nav from the adapter", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop) }));
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/Review order · \$828\.00/);
    expect(html).toMatch(/Coming up/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/Ships from/);
    expect(html).toMatch(/Main · Sep 9, 2026/);
    expect(html).not.toMatch(/Wed 9\/9/);
    expect(html).not.toMatch(/→/);
  });

  it("controlled quantities use the same brand and package controls", () => {
    const html = htmlOf(createElement(ShopView, {
      model: toShopViewProps(ridgelineShop),
      quantities: { [ridgelineShop.catalog[0].skuId]: "7" },
    }));
    expect(html).toMatch(/value="7"/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/Review order · \$828\.00/);
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
    expect(html).toContain(RIDGELINE.name);
  });
});

describe("Review order view", () => {
  it("shows current merchandise and keeps unquoted tax and deposits pending", () => {
    const shop = toShopViewProps(ridgelineShop);
    const model = toReviewOrderViewProps(ridgelineShop);
    expect(shop.reviewVerb).toBe("Review order · $828.00");
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
    expect(cart).toContain("shopModel.reviewVerb = `Review order · ${shopModel.subtotal}`");
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

it("tells the buyer the amounts and the requested date are not final", () => {
  // A portal request is not an order: the brewery confirms both the money and
  // the date. Dropping either half of this leaves the buyer reading the
  // subtotal as a quote and the requested date as a commitment.
  const info = toShopViewProps(ridgelineShop).depositInfo;
  expect(info).toContain("not included");
  expect(info).toContain("The brewery confirms final invoice amounts and the requested delivery date.");
});

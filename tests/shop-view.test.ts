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
import { toReviewOrderViewProps } from "../lib/mgr/review-order-view";
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
    expect(model.shipToLine).toBe("Main · 2026-09-09");
    expect(model.reviewVerb).toBe("Review order · $828.00");
    expect(model.depositInfo).toMatch(/\$30\.00/);
  });

  it("renders Review order, Hazy IPA, and the Coming up nav from the adapter", () => {
    const html = htmlOf(createElement(ShopView, { model: toShopViewProps(ridgelineShop) }));
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/Review order · \$828\.00/);
    expect(html).toMatch(/Coming up/);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/Ships from/);
    expect(html).toMatch(/Main · 2026-09-09/);
    expect(html).not.toMatch(/Wed 9\/9/);
    expect(html).not.toMatch(/→/);
  });

  it("a catalog slot replaces brand/qty rows", () => {
    const html = htmlOf(createElement(ShopView, {
      model: toShopViewProps(ridgelineShop),
      catalog: "CART",
    }));
    expect(html).toMatch(/CART/);
    expect(html).not.toMatch(/½ bbl keg/);
    expect(html).not.toMatch(/Hazy IPA/);
    expect(html).toMatch(/Review order · \$828\.00/);
  });

  it("null footer and comingUp omit inventory Review/ship-to and Coming up", () => {
    const html = htmlOf(createElement(ShopView, {
      model: toShopViewProps(ridgelineShop),
      catalog: "CART",
      footer: null,
      comingUp: null,
    }));
    expect(html).toMatch(/CART/);
    expect(html).not.toMatch(/Review order/);
    expect(html).not.toMatch(/Coming up/);
    expect(html).not.toMatch(/Ships from/);
    expect(html).toContain(RIDGELINE.name);
  });
});

describe("Review order view", () => {
  it("totals the same cart as Shop, adding keg deposits rather than copying INV.total", () => {
    const shop = toShopViewProps(ridgelineShop);
    const model = toReviewOrderViewProps(ridgelineReviewOrder);
    expect(shop.reviewVerb).toBe("Review order · $828.00");
    expect(model.lines.map((l) => [l.name, l.price, l.qty])).toEqual([
      ["Hazy IPA · ½ bbl keg", "$150.00", 4],
      ["Pils · case · 24×16 oz", "$38.00", 6],
    ]);
    expect(model.depositDetail).toBe("4 × $30.00");
    expect(model.depositAmount).toBe("$120.00");
    expect(model.subtotal).toBe("$948.00");
    expect(model.placeVerb).toBe("Place order · $948.00");
    expect(model.tax).toBe("$0.00 · sale for resale");
    expect(model.shipTo).toBe("Main · Phoenixville, PA");
    expect(model.requestedDate).toBe("2026-09-09");
    expect(model.source).toBe("Warehouse");
    expect(model.po).toBe("optional");
  });

  it("renders Place order and Hazy IPA from the adapter", () => {
    const html = htmlOf(createElement(ReviewOrderView, { model: toReviewOrderViewProps(ridgelineReviewOrder) }));
    expect(html).toMatch(/Hazy IPA/);
    expect(html).toMatch(/Place order · \$948\.00/);
    expect(html).toMatch(/Keg deposit/);
    expect(html).toMatch(/4 × \$30\.00/);
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

  it("the live Shop page mounts ShopView and slots Cart", () => {
    const src = readFileSync("app/(portal)/portal/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/shop"/);
    expect(src).toMatch(/<ShopView\b/);
    expect(src).toMatch(/<Cart\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
  });
});

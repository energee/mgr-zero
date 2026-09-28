import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PointOfSaleView } from "@/components/mgr/views/pos";

it.each([true, false])("explains failed OAuth with a connect path when connected is %s", (connected) => {
  const html = renderToStaticMarkup(createElement(PointOfSaleView, {
    model: { connected, merchant: "Seller", state: "connected", locations: "", lastSync: "", oauthFailed: true },
    paths: { connect: "/settings/pos/connect" },
  }));
  expect(html).toContain("Square authorization was cancelled or could not finish");
  expect(html).toContain('href="/settings/pos/connect"');
  expect(html.includes("Try connecting again")).toBe(connected);
});
